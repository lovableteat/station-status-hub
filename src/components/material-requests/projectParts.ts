/**
 * 專案總料表: every part of a BOM project's boards (the current version of each live series), merged into one list.
 * Each board's display mains come from the material table's own ranking (one BOM's list); the same part on several
 * boards, or at several positions of one board, becomes one row that says which boards use it and how many. The
 * PJE 備料表 is this list with the company part numbers first, then PJE's template columns (plus Ref Des and a note),
 * one row per board, so long-lead parts (CPU, IC, connector) can be ordered first.
 */
import { BOM_PLACEHOLDER } from "./bomUploadChecks";
import { matchesExcelFilter, normalizeFilterValue, type ColumnFilterSelection, type ExcelFilterOption } from "./materialExcelFilterValues";
import { buildMaterialMainGroups, sortMaterialAlternatives, type MaterialMainGroup } from "./materialMainRows";
import { getPendingMaterialCategory, resolvePendingMaterialCategory, PENDING_MATERIAL_CATEGORIES, type PendingMaterialCategory } from "./materialRequestPresentation";
import { buildMaterialDataset, isTemporaryPartNumber, normalizeMaterialSearchText, splitRefDesignators, type MaterialRecord, type MaterialWorkbookRecord } from "./materialRequestUtils";
import type { MaterialColumnSort } from "./materialTableSort";

export interface ProjectPartsBoard {
  /** Series id; one series is one board. */
  id: string;
  /** Board name as PJE reads it: the series name without the file extension. */
  name: string;
  /** "V2": the version the list was built from (always the series' current version). */
  version: string;
  records: readonly MaterialWorkbookRecord[];
}

export interface ProjectPartUse {
  boardId: string;
  board: string;
  /** Sum of the quantities the BOM wrote for this part on the board ("2.0" is 2); null when no position wrote one. */
  qty: number | null;
  /** Positions on this board without a quantity (blank, "-", text): left out of the sum and named instead of guessed. */
  missingRefs: string[];
  /** Ref Des: the positions the BOM wrote on this board, each once ("" when none); `positions` one by one. */
  refs: string;
  positions: string[];
  /** Every row (main and alternates) of this part's positions on the board: a hand-picked category is written to all of them. */
  recordIds: string[];
  /** The virtual / physical numbers this board's BOM gave the part's main (TEMP- and placeholders are none). */
  virtualNumbers: string[];
  physicalNumbers: string[];
}

export type ProjectPartStatus = "physical" | "virtual" | "unnumbered";

export interface ProjectPart {
  key: string;
  category: PendingMaterialCategory;
  /** The category was picked by hand (here or in 待處理料) on some board, and wins over the 位號 rule. */
  manualCategory: boolean;
  /** What the 位號 rule alone gives (the most urgent position): what 依位號自動 brings back. */
  autoCategory: PendingMaterialCategory;
  /** Every virtual / physical part number the boards gave this part, "、" between them. */
  virtualPartNumber: string;
  physicalPartNumber: string;
  /** The same numbers one by one, for the column filters. */
  virtualNumbers: string[];
  physicalNumbers: string[];
  name: string;
  spec: string;
  manufacturer: string;
  mpn: string;
  /** 零件狀態 (or phase out, or the 供料狀態 that makes it a risk) of every board, "、" between different ones. */
  usageStatus: string;
  statuses: string[];
  /** A risk on any board or position makes the whole row a risk. */
  risk: boolean;
  /** The most complete numbering any board has. */
  status: ProjectPartStatus;
  /** Other vendors of the same positions, "maker MPN", without duplicates. */
  alternates: string[];
  uses: ProjectPartUse[];
  /** Sum of every quantity the boards wrote; null when no position wrote one. */
  totalQty: number | null;
  /** Positions without a quantity on all boards together; they are not in totalQty. */
  missingCount: number;
  searchText: string;
}

export const PROJECT_PART_STATUSES: ReadonlyArray<{ key: ProjectPartStatus | "risk"; label: string; hint: string }> = [
  { key: "physical", label: "有實體料號", hint: "至少一塊板子的主料已有實體料號（TEMP- 不算）" },
  { key: "virtual", label: "只有虛擬料號", hint: "主料只有虛擬料號，還沒有實體料號" },
  { key: "unnumbered", label: "未編料號", hint: "主料還沒有虛擬料號也沒有實體料號" },
  { key: "risk", label: "風險料", hint: "任一塊板子的供料狀態或零件狀態屬於停產、EOL、禁用、ODM 不建議用料這類風險（與料號表的風險判斷相同）" },
];

const COLLATOR = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });
const CATEGORY_ORDER = new Map(PENDING_MATERIAL_CATEGORIES.map((category, index) => [category.key, index]));

function text(value: unknown) {
  return String(value ?? "").trim();
}

/** Merge spelling: case, full-width characters and runs of spaces do not make another part. */
export function projectPartToken(value: unknown) {
  return text(value).normalize("NFKC").toUpperCase().replace(/\s+/g, " ");
}

/**
 * What a hand-picked category was chosen for: position, maker and MPN of one row. Row ids are positions in the sheet
 * ("Sheet-12"), so after a new upload the same id can be another part; a write skips a row whose fingerprint changed.
 */
export function projectPartRowSignature(record: Pick<MaterialRecord, "refDes" | "manufacturer" | "manufacturerPartNumber">) {
  return JSON.stringify([projectPartToken(record.refDes), projectPartToken(record.manufacturer), projectPartToken(record.manufacturerPartNumber)]);
}

/**
 * The rows a hand-picked category is written to on one board: rows that still show what was picked (same id and
 * fingerprint) and have another category. `moved` counts rows that became another part or are gone; they are left alone.
 */
export function planProjectPartCategory<T extends MaterialWorkbookRecord>(
  records: readonly T[],
  rows: ReadonlyArray<{ id: string; signature: string }>,
  category: PendingMaterialCategory | null,
): { updates: T[]; moved: number } {
  const wanted = new Map(rows.map(row => [row.id, row.signature] as const));
  const present = new Set(records.map(record => record.id));
  let moved = rows.filter(row => !present.has(row.id)).length;
  const updates: T[] = [];
  for (const record of records) {
    if (!wanted.has(record.id)) continue;
    if (projectPartRowSignature(record) !== wanted.get(record.id)) { moved += 1; continue; }
    if ((record.pendingCategory ?? null) === category) continue;
    const next = { ...record };
    if (category) next.pendingCategory = category;
    else delete next.pendingCategory;
    updates.push(next);
  }
  return { updates, moved };
}

/** "N/A", "-", "NC", "DNI", "TBD" are no part numbers (the upload checks use the same list); TEMP- is none yet. */
function realNumber(value: unknown) {
  const written = text(value);
  return written && !BOM_PLACEHOLDER.test(written) && !isTemporaryPartNumber(written) ? written : "";
}

/** Adds a real part number once: "p1" and "P1" are one number (the first spelling stays). */
function addNumber(numbers: Map<string, string>, value: unknown) {
  const written = realNumber(value);
  if (written && !numbers.has(projectPartToken(written))) numbers.set(projectPartToken(written), written);
}

/** A quantity is a plain number ("2", "2.0", "1,200"); "-", "0x10", "1e2", "-1" or text are no quantity. */
function parseQty(value: unknown): number | null {
  const raw = text(value).replaceAll(",", "");
  return /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : null;
}

function addQty(left: number | null, right: number | null) {
  return left === null || right === null ? null : Number((left + right).toPrecision(15));
}

/**
 * What makes two mains the same part: the vendor and its part number first (boards of one project are rarely
 * numbered at the same time, so a physical number one board already has must not split the part); without an MPN
 * the company numbers; without any number the name and spec. A row with nothing at all stays one row per board.
 */
export function projectPartKey(primary: Pick<MaterialRecord, "manufacturer" | "manufacturerPartNumber" | "partNumber" | "virtualAlternative" | "name" | "partName" | "partSpec">, fallback: string) {
  const maker = projectPartToken(realNumber(primary.manufacturer)), mpn = projectPartToken(realNumber(primary.manufacturerPartNumber));
  if (mpn) return `mpn::${JSON.stringify([maker, mpn])}`;
  const physical = projectPartToken(realNumber(primary.partNumber)), virtual = projectPartToken(realNumber(primary.virtualAlternative));
  if (physical || virtual) return `pn::${JSON.stringify([maker, physical, virtual])}`;
  const name = projectPartToken(primary.name || primary.partName), spec = projectPartToken(primary.partSpec);
  if (name || spec) return `name::${JSON.stringify([maker, name, spec])}`;
  return fallback;
}

// The display mains of a board only change with its rows: a list rebuilt for another reason reuses them.
const mainsCache = new WeakMap<readonly MaterialWorkbookRecord[], MaterialMainGroup[]>();
function boardMains(records: readonly MaterialWorkbookRecord[]) {
  let mains = mainsCache.get(records);
  if (!mains) {
    const dataset = buildMaterialDataset({ sourceFile: "", sheetName: "", generatedAt: "", recordCount: records.length, records: [...records] });
    mains = buildMaterialMainGroups(dataset.groups);
    mainsCache.set(records, mains);
  }
  return mains;
}

function usageStatusOf(record: MaterialRecord) {
  return text(record.partUsageStatus) || text(record.phaseOutStatus) || (record.isRisk ? text(record.sourcingStatus) : "");
}

/** What a position list holds when the BOM wrote no position there (named in 未填用量的位號 by the row's own text). */
export const PROJECT_NO_POSITION = "沒有位號";

/**
 * The positions one location's rows wrote. The material table puts the part number or the name in place of a blank
 * 位號 (also in refGroup of a blue-row group), and CE BOMs sometimes write a part number or a description in the 位號
 * column: a value equal to a number or name of these rows, a placeholder ("-", "N/A") or a TEMP- number is no position.
 */
export function projectLocationPositions(records: ReadonlyArray<Pick<MaterialRecord, "refDes" | "refGroup" | "partNumber" | "virtualAlternative" | "name" | "partName" | "manufacturerPartNumber">>) {
  const notPosition = new Set(records.flatMap(record => [record.partNumber, record.virtualAlternative, record.name, record.partName, record.manufacturerPartNumber])
    .map(projectPartToken).filter(Boolean));
  const read = (value: unknown) => !text(value) || notPosition.has(projectPartToken(value)) ? [] : splitRefDesignators(value)
    .filter(token => !BOM_PLACEHOLDER.test(token) && !isTemporaryPartNumber(token) && !notPosition.has(projectPartToken(token)));
  const own = uniquePositions(records.flatMap(record => read(record.refDes)));
  return own.length ? own : uniquePositions(records.flatMap(record => read(record.refGroup)));
}

/** "r1" and "R1" are one position (the first spelling stays). */
function uniquePositions(positions: readonly string[]) {
  const seen = new Map<string, string>();
  for (const position of positions) if (!seen.has(projectPartToken(position))) seen.set(projectPartToken(position), position);
  return [...seen.values()];
}

type Use = Omit<ProjectPartUse, "qty" | "missingRefs" | "refs" | "positions" | "virtualNumbers" | "physicalNumbers">
  & { quantities: number[]; missing: string[]; positions: Map<string, string>; virtual: Map<string, string>; physical: Map<string, string> };
interface Draft {
  key: string;
  manual?: PendingMaterialCategory;
  auto: PendingMaterialCategory;
  byRef: PendingMaterialCategory;
  physical: Map<string, string>;
  virtual: Map<string, string>;
  statuses: Set<string>;
  risk: boolean;
  name: string;
  /** Every name the merged mains carry, so a search finds the part by any of them. */
  names: Set<string>;
  spec: string;
  manufacturer: string;
  mpn: string;
  alternates: Map<string, string>;
  uses: Use[];
  useIndex: Map<string, Use>;
  /** Searched but not shown: each location's own text (also when it is no position) and every row's part number, TEMP- too. */
  searchExtra: Set<string>;
}

/** Merges every board's display mains into one row per part, boards in the order given. */
export function buildProjectParts(boards: readonly ProjectPartsBoard[]): ProjectPart[] {
  const drafts = new Map<string, Draft>();
  for (const board of boards) {
    for (const main of boardMains(board.records)) {
      const primary = main.primaryRecord;
      const key = projectPartKey(primary, `board::${board.id}::${main.key}`);
      let draft = drafts.get(key);
      if (!draft) {
        draft = {
          key, auto: "other", byRef: "other", physical: new Map(), virtual: new Map(), statuses: new Set(), risk: false,
          name: "", names: new Set(), spec: "", manufacturer: realNumber(primary.manufacturer), mpn: realNumber(primary.manufacturerPartNumber),
          alternates: new Map(), uses: [], useIndex: new Map(), searchExtra: new Set(),
        };
        drafts.set(key, draft);
      }
      addNumber(draft.physical, primary.partNumber);
      addNumber(draft.virtual, primary.virtualAlternative);
      draft.name ||= text(primary.name) || text(primary.partName);
      if (text(primary.name) || text(primary.partName)) draft.names.add(text(primary.name) || text(primary.partName));
      draft.spec ||= text(primary.partSpec);
      draft.manufacturer ||= realNumber(primary.manufacturer);
      draft.mpn ||= realNumber(primary.manufacturerPartNumber);
      const mainSelf = projectPartToken([primary.manufacturer, primary.manufacturerPartNumber].filter(Boolean).join(" "));
      for (const location of main.locations) {
        // Category per position: a hand-picked one wins; otherwise the most urgent any position gives (connector, IC first).
        const category = resolvePendingMaterialCategory(location);
        if (category.manual) draft.manual ??= category.category;
        else if ((CATEGORY_ORDER.get(category.category) ?? 9) < (CATEGORY_ORDER.get(draft.auto) ?? 9)) draft.auto = category.category;
        const byRef = getPendingMaterialCategory(location.displayRef);
        if ((CATEGORY_ORDER.get(byRef) ?? 9) < (CATEGORY_ORDER.get(draft.byRef) ?? 9)) draft.byRef = byRef;
        const head = location.primaryRecord as MaterialRecord;
        const status = usageStatusOf(head);
        if (status) draft.statuses.add(status);
        if (head.isRisk) draft.risk = true;
        for (const record of sortMaterialAlternatives(location).slice(1)) {
          const alternate = [text(record.manufacturer), text(record.manufacturerPartNumber)].filter(Boolean).join(" ");
          const token = projectPartToken(alternate);
          if (alternate && token !== mainSelf && !draft.alternates.has(token)) draft.alternates.set(token, alternate);
        }
        // Each position's own quantity (the merged main has already turned a mix into "—"). A position the BOM left
        // without a number (blank, "-", text) is not guessed: it stays out of the sum and is named instead.
        let use = draft.useIndex.get(board.id);
        if (!use) {
          use = { boardId: board.id, board: board.name, positions: new Map(), recordIds: [], quantities: [], missing: [], virtual: new Map(), physical: new Map() };
          draft.useIndex.set(board.id, use);
          draft.uses.push(use);
        }
        addNumber(use.physical, primary.partNumber);
        addNumber(use.virtual, primary.virtualAlternative);
        // Ref Des is only what the BOM wrote as a position, each once per board (the same R1 in two sections is one).
        const positions = projectLocationPositions(location.records);
        for (const position of positions) if (!use.positions.has(projectPartToken(position))) use.positions.set(projectPartToken(position), position);
        if (location.displayRef) draft.searchExtra.add(location.displayRef);
        for (const record of location.records) {
          if (!use.recordIds.includes(record.id)) use.recordIds.push(record.id);
          if (text(record.partNumber)) draft.searchExtra.add(text(record.partNumber));
        }
        const qty = parseQty(location.qty);
        const ownText = location.displayRef && !BOM_PLACEHOLDER.test(location.displayRef) ? `（${location.displayRef}）` : "";
        if (qty === null) use.missing.push(positions.length ? positions.join(", ") : `${PROJECT_NO_POSITION}${ownText}`);
        else use.quantities.push(qty);
      }
    }
  }
  return [...drafts.values()].map(draft => {
    const uses = draft.uses.map(({ quantities, missing, positions, virtual, physical, ...use }): ProjectPartUse => ({
      ...use,
      virtualNumbers: [...virtual.values()],
      physicalNumbers: [...physical.values()],
      positions: [...positions.values()],
      refs: [...positions.values()].join(", "),
      qty: quantities.length ? quantities.reduce<number | null>((sum, value) => addQty(sum, value), 0) : null,
      missingRefs: missing,
    }));
    const written = uses.filter(use => use.qty !== null);
    const totalQty = written.length ? written.reduce<number | null>((sum, use) => addQty(sum, use.qty), 0) : null;
    const missingCount = uses.reduce((sum, use) => sum + use.missingRefs.length, 0);
    const physicalNumbers = [...draft.physical.values()], virtualNumbers = [...draft.virtual.values()], statuses = [...draft.statuses];
    const physicalPartNumber = physicalNumbers.join("、"), virtualPartNumber = virtualNumbers.join("、");
    const usageStatus = statuses.join("、");
    const alternates = [...draft.alternates.values()];
    const part: ProjectPart = {
      key: draft.key,
      category: draft.manual ?? draft.auto,
      manualCategory: draft.manual !== undefined,
      autoCategory: draft.byRef,
      virtualPartNumber, physicalPartNumber, virtualNumbers, physicalNumbers,
      name: draft.name, spec: draft.spec, manufacturer: draft.manufacturer, mpn: draft.mpn,
      usageStatus, statuses, risk: draft.risk,
      status: physicalPartNumber ? "physical" : virtualPartNumber ? "virtual" : "unnumbered",
      alternates, uses, totalQty, missingCount,
      searchText: normalizeMaterialSearchText([
        virtualPartNumber, physicalPartNumber, ...draft.names, draft.spec, draft.manufacturer, draft.mpn, usageStatus,
        ...alternates, ...uses.flatMap(use => [use.board, use.refs]), ...draft.searchExtra,
      ].join(" ")),
    };
    return part;
  }).sort((left, right) => (CATEGORY_ORDER.get(left.category) ?? 9) - (CATEGORY_ORDER.get(right.category) ?? 9)
    || right.uses.length - left.uses.length
    || COLLATOR.compare(left.name, right.name)
    || COLLATOR.compare(left.mpn, right.mpn));
}

/** The table's columns with an Excel-style filter, in table order (分類 has its own buttons above the table). */
export const PROJECT_PART_COLUMNS = [
  { key: "virtual", label: "虛擬料號" },
  { key: "physical", label: "實體料號" },
  { key: "name", label: "品名" },
  { key: "manufacturer", label: "廠商" },
  { key: "mpn", label: "MPN" },
  { key: "boards", label: "使用在哪個板子" },
  { key: "refDes", label: "Ref Des" },
  { key: "qty", label: "總用量" },
  { key: "status", label: "零件狀態" },
] as const;
export type ProjectPartColumnKey = typeof PROJECT_PART_COLUMNS[number]["key"];

export interface ProjectPartsFilters {
  query: string;
  status: ProjectPartStatus | "risk" | "all";
  categories: PendingMaterialCategory[];
  /** Column filters as the material table keeps them: null (or missing) is everything, [] is nothing. */
  columns: Partial<Record<ProjectPartColumnKey, ColumnFilterSelection>>;
}

export const EMPTY_PROJECT_PARTS_FILTERS: ProjectPartsFilters = { query: "", status: "all", categories: [], columns: {} };

export function formatProjectQty(value: number | null, fallback = "—") {
  return value === null ? fallback : value.toLocaleString("zh-TW", { maximumFractionDigits: 6 });
}

export const PROJECT_QTY_MISSING = "未填";
/** The 總用量 filter value of every part with a position that wrote no quantity (shown as "4 +1 未填"). */
export const PROJECT_QTY_PARTLY_MISSING = "有未填用量的位號";

/** The 總用量 as shown and filtered: the sum, or 未填 when no position wrote a quantity. */
export function projectPartQtyLabel(part: Pick<ProjectPart, "totalQty">) {
  return formatProjectQty(part.totalQty, PROJECT_QTY_MISSING);
}

/** The values a part shows in a filterable column; a blank one is "(空白)" in the filter, as in the material table. */
export function projectPartColumnValues(part: ProjectPart, key: ProjectPartColumnKey): string[] {
  switch (key) {
    // Part numbers like makers: p1 and P1 are one value (the list shows the first spelling).
    case "virtual": return part.virtualNumbers.length ? part.virtualNumbers.map(projectPartToken) : [""];
    case "physical": return part.physicalNumbers.length ? part.physicalNumbers.map(projectPartToken) : [""];
    case "name": return [part.name || part.spec];
    case "manufacturer": return [projectPartToken(part.manufacturer)];
    case "mpn": return [part.mpn];
    case "boards": return part.uses.map(use => use.board);
    // Each position once (r1 and R1 are one value), so ticking "J1" finds the part on any board; (空白) when a board has none.
    case "refDes": {
      const refs = [...new Set(part.uses.flatMap(use => use.positions.map(projectPartToken)))];
      return part.uses.some(use => use.positions.length === 0) ? [...refs, ""] : refs;
    }
    // Plain numbers ("1200", not "1,200") so the value list sorts them as numbers.
    case "qty": return [part.totalQty === null ? PROJECT_QTY_MISSING : String(part.totalQty), ...(part.missingCount > 0 ? [PROJECT_QTY_PARTLY_MISSING] : [])];
    case "status": return part.statuses.length ? part.statuses : [part.risk ? "風險料" : ""];
  }
}

/** Every filter at once; ignoredColumn leaves that column's own filter out, so its value list shows what it can still pick. */
export function filterProjectParts(parts: readonly ProjectPart[], filters: ProjectPartsFilters, ignoredColumn?: ProjectPartColumnKey) {
  const terms = normalizeMaterialSearchText(filters.query).split(/\s+/).filter(Boolean);
  const columns = PROJECT_PART_COLUMNS.filter(({ key }) => key !== ignoredColumn && filters.columns[key] != null);
  return parts.filter(part => terms.every(term => part.searchText.includes(term))
    && (filters.status === "all" || (filters.status === "risk" ? part.risk : part.status === filters.status))
    && (filters.categories.length === 0 || filters.categories.includes(part.category))
    && columns.every(({ key }) => matchesExcelFilter(filters.columns[key] ?? null, projectPartColumnValues(part, key))));
}

function spelling(part: ProjectPart, key: ProjectPartColumnKey, value: string) {
  if (key === "manufacturer") return part.manufacturer || value;
  const numbers = key === "virtual" ? part.virtualNumbers : key === "physical" ? part.physicalNumbers : [];
  return numbers.find(number => projectPartToken(number) === value) ?? value;
}

/** The checkbox list of a column filter: each value once, with how many parts carry it. */
export function projectPartColumnOptions(parts: readonly ProjectPart[], key: ProjectPartColumnKey): ExcelFilterOption[] {
  const options = new Map<string, ExcelFilterOption>();
  for (const part of parts) {
    for (const value of new Set(projectPartColumnValues(part, key).map(normalizeFilterValue))) {
      const option = options.get(value);
      if (option) option.count += 1;
      // A maker or part number is one option however the boards capitalise it ("Acme", "ACME"); the list shows the first spelling.
      else options.set(value, { value, label: spelling(part, key, value), count: 1 });
    }
  }
  return [...options.values()];
}

/** A column's A→Z / Z→A from its filter; 總用量 by number. Blank and 未填 stay last either way. */
export function sortProjectParts(parts: readonly ProjectPart[], sort: MaterialColumnSort<ProjectPartColumnKey> | null): readonly ProjectPart[] {
  if (!sort) return parts;
  const factor = sort.direction === "asc" ? 1 : -1;
  if (sort.key === "qty") {
    return [...parts].sort((left, right) => {
      if (left.totalQty === null || right.totalQty === null) return left.totalQty === right.totalQty ? 0 : left.totalQty === null ? 1 : -1;
      return (left.totalQty - right.totalQty) * factor;
    });
  }
  // Each part's text once, not on every comparison (the Ref Des of a big project is long).
  const keyed = parts.map(part => ({ part, text: projectPartColumnValues(part, sort.key).filter(Boolean).join("、") }));
  keyed.sort((left, right) => {
    if (!left.text || !right.text) return left.text === right.text ? 0 : !left.text ? 1 : -1;
    return COLLATOR.compare(left.text, right.text) * factor;
  });
  return keyed.map(item => item.part);
}

/**
 * "Board_A ×2、Board_B ×1"; one board alone is just its name; a board whose positions wrote no quantity is ×未填, and
 * positions without a quantity next to written ones are counted ("×2（+1 未填）") so nobody reads the total as complete.
 */
export function describeProjectPartBoards(part: Pick<ProjectPart, "uses">, separator = "、") {
  const unfilled = (use: ProjectPartUse) => (use.qty !== null && use.missingRefs.length > 0 ? `（+${use.missingRefs.length} ${PROJECT_QTY_MISSING}）` : "");
  if (part.uses.length === 1) return `${part.uses[0].board}${unfilled(part.uses[0])}`;
  return part.uses.map(use => `${use.board} ×${formatProjectQty(use.qty, PROJECT_QTY_MISSING)}${unfilled(use)}`).join(separator);
}

/** The Ref Des column: one board's positions as they are; several boards "Board：R1, R2；Board：—" (— has none). */
export function describeProjectPartRefs(part: Pick<ProjectPart, "uses">, separator = "；") {
  if (part.uses.length === 1) return part.uses[0].refs;
  if (part.uses.every(use => !use.refs)) return "";
  return part.uses.map(use => `${use.board}：${use.refs || "—"}`).join(separator);
}

/** The positions the 總用量 leaves out because the BOM wrote no quantity there: "Board：REF, REF" per board. */
export function describeMissingQty(part: Pick<ProjectPart, "uses">, separator = "\n") {
  return part.uses.filter(use => use.missingRefs.length > 0).map(use => `${use.board}：${use.missingRefs.join(", ")}`).join(separator);
}

/**
 * The PJE 備料表: one sheet, header on row 1. 虛擬料號 and 實體料號 come first (A, B: the user, 2026-11-20, 「料號最重要」),
 * then PJE's template's five columns in their order (C to G), Ref Des in H (asked for once every board got its own row)
 * and 備註 in I, which says what Usage leaves out.
 */
export const PJE_SHEET_NAME = "Material list(PCBA)";
export const PJE_HEADERS = ["虛擬料號", "實體料號", "Items", "Vendor", "PN", "使用在哪個板子", "Usage", "Ref Des", "備註"] as const;
export const PJE_QTY_UNKNOWN = "用量未填";
type PjeRow = [string, string, string, string, string, string, number | string, string, string];

/** 備註 when a board's BOM has no real physical number (blank, TEMP-, a placeholder). */
export const PJE_PHYSICAL_BORROWED = "本板 BOM 沒有正式實體料號";

/**
 * The boards of a part that a 使用在哪個板子 filter keeps (user, 2026-11-20: 「篩哪塊板子就只出哪塊板子的列」), as the
 * filter compares them; null (no filter) is every board.
 */
export function projectPartUsesOn(part: Pick<ProjectPart, "uses">, boards: ColumnFilterSelection = null) {
  if (boards === null) return part.uses;
  return part.uses.filter(use => boards.includes(normalizeFilterValue(use.board)));
}

/** What PJE gets from these parts under a board filter: the parts with a row, how many rows, how many get none. */
export function planPjeExport<T extends Pick<ProjectPart, "uses">>(parts: readonly T[], boards: ColumnFilterSelection = null) {
  const kept = parts.filter(part => projectPartUsesOn(part, boards).length > 0);
  return { parts: kept, lines: kept.reduce((sum, part) => sum + projectPartUsesOn(part, boards).length, 0), skipped: parts.length - kept.length };
}

/** The boards of a 使用在哪個板子 filter in a sentence, short like its chip: "A、B 等 5 塊板子". */
export function describeProjectBoardFilter(boards: readonly string[]) {
  if (boards.length === 0) return "未選任何板子";
  return `${boards.slice(0, 2).join("、")}${boards.length > 2 ? ` 等 ${boards.length} 塊板子` : ""}`;
}

/**
 * One row per board (user, 2026-11-20): a part used on two boards is two rows with the same Items / Vendor / PN, next
 * to each other, so PJE can filter a board (使用在哪個板子 is exactly the board name) or add Usage up in Excel.
 * 虛擬料號 is that board's own only: it names the substitute group its design allows, which another board's group does
 * not. 實體料號 is that board's own; a board not numbered yet gets the one number the project has for the same vendor
 * part (one vendor + MPN is one physical part) and 備註 says where it comes from; when the boards gave different numbers
 * the cell stays empty and 備註 lists them, so no cell is filled with another board's numbers to choose from. A board
 * whose own BOM gave one vendor part two numbers shows both, and 備註 says so. Usage is that board's
 * quantity, a number; empty when none of its positions wrote one; Ref Des that board's positions. 備註 also says what
 * Usage leaves out ("+1 未填用量：J9", "用量未填：J9"), so PJE never reads an empty or partial Usage as the whole need.
 * With a 使用在哪個板子 filter (boards) only the rows of the boards it keeps are written; the physical number of a board
 * not numbered yet still comes from every board, since it belongs to the vendor part, not to the filter.
 */
export function buildPjeRows(parts: readonly ProjectPart[], boards: ColumnFilterSelection = null): PjeRow[] {
  return parts.flatMap(part => projectPartUsesOn(part, boards).map((use): PjeRow => {
    const missing = use.missingRefs.join("；");
    const notes = [use.qty === null ? `${PJE_QTY_UNKNOWN}：${missing}` : use.missingRefs.length > 0 ? `+${use.missingRefs.length} ${PROJECT_QTY_MISSING}用量：${missing}` : ""];
    let physical = use.physicalNumbers.join("、");
    if (use.physicalNumbers.length > 1) notes.push(`本板 BOM 給這顆料 ${use.physicalNumbers.length} 個實體料號`);
    if (!physical && part.physicalNumbers.length > 0) {
      const numbered = part.uses.filter(other => other.physicalNumbers.length > 0);
      if (part.physicalNumbers.length === 1) {
        physical = part.physicalNumbers[0];
        notes.push(`${PJE_PHYSICAL_BORROWED}，取自 ${numbered.map(other => other.board).join("、")}`);
      } else {
        notes.push(`${PJE_PHYSICAL_BORROWED}，各板不同：${numbered.map(other => `${other.board}＝${other.physicalNumbers.join("、")}`).join("；")}`);
      }
    }
    return [use.virtualNumbers.join("、"), physical, part.name || part.spec, part.manufacturer, part.mpn, use.board, use.qty ?? "", use.refs, notes.filter(Boolean).join("\n")];
  }));
}

export const PROJECT_PARTS_HEADERS = ["分類", "虛擬料號", "實體料號", "品名", "規格", "廠商", "MPN", "零件狀態", "替代料", "使用板子數", "使用在哪個板子", "總用量", "各板位號", "未填用量的位號"] as const;

export function buildProjectPartsRows(parts: readonly ProjectPart[]): Array<Array<string | number>> {
  const labels = new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, category.label]));
  return parts.map(part => [
    labels.get(part.category) ?? part.category, part.virtualPartNumber, part.physicalPartNumber, part.name, part.spec, part.manufacturer, part.mpn,
    part.usageStatus, part.alternates.join("\n"), part.uses.length, describeProjectPartBoards(part, "\n"), part.totalQty ?? "",
    part.uses.filter(use => use.refs).map(use => `${use.board}：${use.refs}`).join("\n"), describeMissingQty(part),
  ]);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Cell by cell: ExcelJS reads a plain array only when it comes from its own JavaScript realm. An empty text stays a
 * blank cell (ExcelJS would store "" as a value, and Excel's blank-cell search would then skip the rows without a number).
 */
function writeRow(sheet: import("exceljs").Worksheet, values: ReadonlyArray<string | number>) {
  const row = sheet.getRow(sheet.rowCount + 1);
  values.forEach((value, index) => { if (value !== "") row.getCell(index + 1).value = value; });
  row.commit();
  return row;
}

function fileStamp(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;
}

export function projectPartsFileName(projectName: string, kind: "總料表" | "PJE備料表", at: Date) {
  const safe = projectName.normalize("NFKC").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").replace(/^[-_]+|[-_]+$/g, "") || "專案";
  return `${safe}_${kind}_${fileStamp(at)}.xlsx`;
}

/**
 * The PJE workbook. Header as in PJE's template: Calibri 7 bold dark blue (Chinese headers in Microsoft JhengHei),
 * light blue fill, centred and wrapped, thin borders; Vendor 21, PN 22.125, 使用在哪個板子 27.375 wide; first row
 * frozen. Differences on purpose: the template leaves Items at the default width, which would hide the part names; the
 * part numbers (A, B), Ref Des (H) and 備註 (I) are added in the same header style.
 */
export async function buildPjeWorkbook(parts: readonly ProjectPart[], meta: { projectName: string; exportedBy: string; exportedAt: Date }, boards: ColumnFilterSelection = null) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.exportedBy;
  workbook.created = meta.exportedAt;
  workbook.title = `${meta.projectName} Key components list`;
  const sheet = workbook.addWorksheet(PJE_SHEET_NAME);
  [18, 18, 44, 21, 22.125, 27.375, undefined, 36, 30].forEach((width, index) => { if (width) sheet.getColumn(index + 1).width = width; });
  const header = writeRow(sheet, PJE_HEADERS);
  const thin = { style: "thin" as const };
  header.eachCell(cell => {
    cell.font = { name: /[\u4e00-\u9fff]/.test(String(cell.value)) ? "Microsoft JhengHei" : "Calibri", size: 7, bold: true, color: { argb: "FF002060" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCAEDFB" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  for (const row of buildPjeRows(parts, boards)) writeRow(sheet, row).alignment = { vertical: "top", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_TYPE });
}

/** The full merged list, the rows on screen, every column. */
export async function buildProjectPartsWorkbook(parts: readonly ProjectPart[], meta: { projectName: string; exportedBy: string; exportedAt: Date }) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.exportedBy;
  workbook.created = meta.exportedAt;
  workbook.title = `${meta.projectName} 專案總料表`;
  const sheet = workbook.addWorksheet("專案總料表");
  sheet.columns = [12, 18, 18, 40, 28, 20, 26, 22, 30, 10, 34, 10, 44, 30].map(width => ({ width }));
  const header = writeRow(sheet, PROJECT_PARTS_HEADERS);
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B65" } };
    cell.alignment = { vertical: "middle" };
  });
  for (const row of buildProjectPartsRows(parts)) writeRow(sheet, row).alignment = { vertical: "top", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: PROJECT_PARTS_HEADERS.length } };
  return new Blob([await workbook.xlsx.writeBuffer()], { type: XLSX_TYPE });
}
