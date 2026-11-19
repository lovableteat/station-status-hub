/**
 * 專案總料表: every part of a BOM project's boards (the current version of each live series), merged into one list.
 * Each board's display mains come from the material table's own ranking (one BOM's list); the same part on several
 * boards, or at several positions of one board, becomes one row that says which boards use it and how many. The
 * PJE 備料表 is this list in the five columns PJE asked for, so long-lead parts (CPU, IC, connector) can be ordered first.
 */
import { BOM_PLACEHOLDER } from "./bomUploadChecks";
import { buildMaterialMainGroups, sortMaterialAlternatives, type MaterialMainGroup } from "./materialMainRows";
import { resolvePendingMaterialCategory, PENDING_MATERIAL_CATEGORIES, type PendingMaterialCategory } from "./materialRequestPresentation";
import { buildMaterialDataset, isTemporaryPartNumber, normalizeMaterialSearchText, type MaterialRecord, type MaterialWorkbookRecord } from "./materialRequestUtils";

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
  /** Sum of this part's quantity on the board; null when a quantity on the board is not a number. */
  qty: number | null;
  /** The quantities as the BOM wrote them ("2+x"), when one of them is not a number. */
  qtyText: string;
  refs: string;
}

export type ProjectPartStatus = "physical" | "virtual" | "unnumbered";

export interface ProjectPart {
  key: string;
  category: PendingMaterialCategory;
  /** Every virtual / physical part number the boards gave this part, "、" between them. */
  virtualPartNumber: string;
  physicalPartNumber: string;
  name: string;
  spec: string;
  manufacturer: string;
  mpn: string;
  /** 零件狀態 (or phase out, or the 供料狀態 that makes it a risk) of every board, "、" between different ones. */
  usageStatus: string;
  /** A risk on any board or position makes the whole row a risk. */
  risk: boolean;
  /** The most complete numbering any board has. */
  status: ProjectPartStatus;
  /** Other vendors of the same positions, "maker MPN", without duplicates. */
  alternates: string[];
  uses: ProjectPartUse[];
  /** Sum over the boards; null when one of them is not a number. */
  totalQty: number | null;
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

/** "N/A", "-", "NC", "DNI", "TBD" are no part numbers (the upload checks use the same list); TEMP- is none yet. */
function realNumber(value: unknown) {
  const written = text(value);
  return written && !BOM_PLACEHOLDER.test(written) && !isTemporaryPartNumber(written) ? written : "";
}

function parseQty(value: unknown): number | null {
  const raw = text(value).replaceAll(",", "");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
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

type Use = Omit<ProjectPartUse, "qty" | "qtyText"> & { raw: string[] };
interface Draft {
  key: string;
  manual?: PendingMaterialCategory;
  auto: PendingMaterialCategory;
  physical: Set<string>;
  virtual: Set<string>;
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
          key, auto: "other", physical: new Set(), virtual: new Set(), statuses: new Set(), risk: false,
          name: "", names: new Set(), spec: "", manufacturer: realNumber(primary.manufacturer), mpn: realNumber(primary.manufacturerPartNumber),
          alternates: new Map(), uses: [], useIndex: new Map(),
        };
        drafts.set(key, draft);
      }
      if (realNumber(primary.partNumber)) draft.physical.add(text(primary.partNumber));
      if (realNumber(primary.virtualAlternative)) draft.virtual.add(text(primary.virtualAlternative));
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
        const head = location.primaryRecord as MaterialRecord;
        const status = usageStatusOf(head);
        if (status) draft.statuses.add(status);
        if (head.isRisk) draft.risk = true;
        for (const record of sortMaterialAlternatives(location).slice(1)) {
          const alternate = [text(record.manufacturer), text(record.manufacturerPartNumber)].filter(Boolean).join(" ");
          const token = projectPartToken(alternate);
          if (alternate && token !== mainSelf && !draft.alternates.has(token)) draft.alternates.set(token, alternate);
        }
        // Each position's own quantity: the merged main has already turned a mix of numbers and text into "—".
        const raw = text(location.qty) || "?";
        const use = draft.useIndex.get(board.id);
        if (use) {
          use.raw.push(raw);
          use.refs = [use.refs, location.displayRef].filter(Boolean).join(", ");
        } else {
          const next: Use = { boardId: board.id, board: board.name, refs: location.displayRef, raw: [raw] };
          draft.useIndex.set(board.id, next);
          draft.uses.push(next);
        }
      }
    }
  }
  return [...drafts.values()].map(draft => {
    const uses = draft.uses.map(({ raw, ...use }): ProjectPartUse => {
      const qty = raw.reduce<number | null>((sum, value) => addQty(sum, parseQty(value)), 0);
      return { ...use, qty, qtyText: qty === null ? raw.join("+") : "" };
    });
    const totalQty = uses.reduce<number | null>((sum, use) => addQty(sum, use.qty), 0);
    const physicalPartNumber = [...draft.physical].join("、"), virtualPartNumber = [...draft.virtual].join("、");
    const usageStatus = [...draft.statuses].join("、");
    const alternates = [...draft.alternates.values()];
    const part: ProjectPart = {
      key: draft.key,
      category: draft.manual ?? draft.auto,
      virtualPartNumber, physicalPartNumber,
      name: draft.name, spec: draft.spec, manufacturer: draft.manufacturer, mpn: draft.mpn,
      usageStatus, risk: draft.risk,
      status: physicalPartNumber ? "physical" : virtualPartNumber ? "virtual" : "unnumbered",
      alternates, uses, totalQty,
      searchText: normalizeMaterialSearchText([
        virtualPartNumber, physicalPartNumber, ...draft.names, draft.spec, draft.manufacturer, draft.mpn, usageStatus,
        ...alternates, ...uses.flatMap(use => [use.board, use.refs]),
      ].join(" ")),
    };
    return part;
  }).sort((left, right) => (CATEGORY_ORDER.get(left.category) ?? 9) - (CATEGORY_ORDER.get(right.category) ?? 9)
    || right.uses.length - left.uses.length
    || COLLATOR.compare(left.name, right.name)
    || COLLATOR.compare(left.mpn, right.mpn));
}

export interface ProjectPartsFilters {
  query: string;
  status: ProjectPartStatus | "risk" | "all";
  categories: PendingMaterialCategory[];
  board: string;
  manufacturer: string;
}

export const EMPTY_PROJECT_PARTS_FILTERS: ProjectPartsFilters = { query: "", status: "all", categories: [], board: "", manufacturer: "" };

export function filterProjectParts(parts: readonly ProjectPart[], filters: ProjectPartsFilters) {
  const terms = normalizeMaterialSearchText(filters.query).split(/\s+/).filter(Boolean);
  return parts.filter(part => terms.every(term => part.searchText.includes(term))
    && (filters.status === "all" || (filters.status === "risk" ? part.risk : part.status === filters.status))
    && (filters.categories.length === 0 || filters.categories.includes(part.category))
    && (!filters.board || part.uses.some(use => use.boardId === filters.board))
    && (!filters.manufacturer || projectPartToken(part.manufacturer) === projectPartToken(filters.manufacturer)));
}

export function formatProjectQty(value: number | null, fallback = "—") {
  return value === null ? fallback : value.toLocaleString("zh-TW", { maximumFractionDigits: 6 });
}

/** "Board_A ×2、Board_B ×1"; one board alone is just its name. */
export function describeProjectPartBoards(part: Pick<ProjectPart, "uses">, separator = "、") {
  if (part.uses.length === 1) return part.uses[0].board;
  return part.uses.map(use => `${use.board} ×${use.qty === null ? use.qtyText || "?" : formatProjectQty(use.qty)}`).join(separator);
}

function totalQtyText(part: Pick<ProjectPart, "uses" | "totalQty">) {
  return part.totalQty === null ? part.uses.map(use => use.qty === null ? use.qtyText || "?" : formatProjectQty(use.qty)).join("+") : part.totalQty;
}

/** The PJE 備料表 exactly as PJE's template has it: one sheet, these five columns, header on row 1. */
export const PJE_SHEET_NAME = "Material list(PCBA)";
export const PJE_HEADERS = ["Items", "Vendor", "PN", "使用在哪個板子", "Usage"] as const;

export function buildPjeRows(parts: readonly ProjectPart[]): Array<[string, string, string, string, number | string]> {
  return parts.map(part => [part.name || part.spec, part.manufacturer, part.mpn, describeProjectPartBoards(part), totalQtyText(part)]);
}

export const PROJECT_PARTS_HEADERS = ["分類", "虛擬料號", "實體料號", "品名", "規格", "廠商", "MPN", "零件狀態", "替代料", "使用板子數", "使用在哪個板子", "總用量", "各板位號"] as const;

export function buildProjectPartsRows(parts: readonly ProjectPart[]): Array<Array<string | number>> {
  const labels = new Map(PENDING_MATERIAL_CATEGORIES.map(category => [category.key, category.label]));
  return parts.map(part => [
    labels.get(part.category) ?? part.category, part.virtualPartNumber, part.physicalPartNumber, part.name, part.spec, part.manufacturer, part.mpn,
    part.usageStatus, part.alternates.join("\n"), part.uses.length, describeProjectPartBoards(part, "\n"), totalQtyText(part),
    part.uses.map(use => `${use.board}：${use.refs}`).join("\n"),
  ]);
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Cell by cell: ExcelJS reads a plain array only when it comes from its own JavaScript realm. */
function writeRow(sheet: import("exceljs").Worksheet, values: ReadonlyArray<string | number>) {
  const row = sheet.getRow(sheet.rowCount + 1);
  values.forEach((value, index) => { row.getCell(index + 1).value = value; });
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
 * The PJE workbook. Header as in PJE's template: Calibri 7 bold dark blue (使用在哪個板子 in Microsoft JhengHei),
 * light blue fill, centred and wrapped, thin borders; widths B 21, C 22.125, D 27.375; first row frozen. One
 * difference on purpose: the template leaves Items at the default width, which would hide the part names.
 */
export async function buildPjeWorkbook(parts: readonly ProjectPart[], meta: { projectName: string; exportedBy: string; exportedAt: Date }) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.exportedBy;
  workbook.created = meta.exportedAt;
  workbook.title = `${meta.projectName} Key components list`;
  const sheet = workbook.addWorksheet(PJE_SHEET_NAME);
  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 21;
  sheet.getColumn(3).width = 22.125;
  sheet.getColumn(4).width = 27.375;
  const header = writeRow(sheet, PJE_HEADERS);
  const thin = { style: "thin" as const };
  header.eachCell((cell, column) => {
    cell.font = { name: column === 4 ? "Microsoft JhengHei" : "Calibri", size: 7, bold: true, color: { argb: "FF002060" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCAEDFB" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  for (const row of buildPjeRows(parts)) writeRow(sheet, row).alignment = { vertical: "top", wrapText: true };
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
  sheet.columns = [12, 18, 18, 40, 28, 20, 26, 22, 30, 10, 34, 10, 44].map(width => ({ width }));
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
