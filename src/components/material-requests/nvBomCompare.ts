/** Original NV workbook data stays separate from CE imports and saved BOM versions. */
export const NV_BOM_FIELDS = [
  { key: "partNumber", label: "NV／來源料號" },
  { key: "mpn", label: "廠商料號 MPN" },
  { key: "manufacturer", label: "廠商" },
  { key: "description", label: "料名／描述" },
  { key: "qty", label: "數量" },
  { key: "refs", label: "位號 Ref Des" },
] as const;
export type NvBomField = typeof NV_BOM_FIELDS[number]["key"];
export interface NvBomSheet { name: string; rows: string[][] }
export interface NvBomFile { name: string; sheets: NvBomSheet[] }
/** Rows and columns are one-based, matching Excel. */
export type NvBomMapping = { headerRow: number } & Record<NvBomField, number | null>;
export interface NvBomPart extends Record<NvBomField, string> { sourceRows: number[] }
export interface NvBomChange {
  id: string; kind: "added" | "removed" | "changed";
  before?: NvBomPart; after?: NvBomPart; changedFields: NvBomField[];
  advice?: string; aiNote?: string;
}
export interface NvBomUnresolved { id: string; side: "before" | "after"; part: NvBomPart; reason: string }
export interface NvBomDiff { changes: NvBomChange[]; unresolved: NvBomUnresolved[]; beforeCount: number; afterCount: number; unchanged: number; warnings: string[]; identityFields: NvBomField[] }
export interface NvBomAnnotation { checked: boolean; note: string }
export const NV_BOM_CHANGE_LABELS = { added: "新增料", removed: "刪除料", changed: "資料變更" };
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const identity = (value: unknown) => text(value).toUpperCase();
const emptyIdentity = new Set(["", "-", "--", "–", "—", "N/A", "NA", "N.A.", "NONE", "NULL", "未提供", "未填寫"]);
const known = (value: string) => {
  const normalized = identity(value);
  return emptyIdentity.has(normalized) ? "" : normalized;
};
const order = new Intl.Collator("zh-TW", { numeric: true, sensitivity: "base" });

export async function readNvBomFile(file: File): Promise<NvBomFile> {
  if (!/\.(xlsx?|xlsm|csv)$/i.test(file.name)) throw new Error("請選擇 Excel（XLSX、XLS、XLSM）或 CSV 原始 BOM。");
  const xlsx = await import("xlsx");
  const book = xlsx.read(await file.arrayBuffer(), { type: "array", cellHTML: false, cellFormula: false, raw: /\.csv$/i.test(file.name), sheetRows: 100_001 });
  const sheets = book.SheetNames.flatMap(name => {
    const sheet = book.Sheets[name];
    const full = sheet["!fullref"] ?? sheet["!ref"];
    if (full && xlsx.utils.decode_range(full).e.r >= 100_000) throw new Error(`工作表「${name}」超過 100,000 列，這次未讀取；請另存要比對的工作表。`);
    const lastCell = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]).e : { r: 0, c: 0 };
    // Keep Excel coordinates when !ref starts below row 1 or to the right of column A.
    const rows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, range: { s: { r: 0, c: 0 }, e: lastCell }, raw: false, defval: "", blankrows: true }).map(row => row.map(value => String(value ?? "")));
    return rows.some(row => row.some(value => value.trim())) ? [{ name, rows }] : [];
  });
  if (!sheets.length) throw new Error("這份 BOM 沒有可讀取的工作表。");
  return { name: file.name, sheets };
}

export function validateNvBomMapping(value: unknown, sheet: NvBomSheet): NvBomMapping {
  const raw = value as Record<string, unknown> | null;
  if (!raw || !Number.isInteger(raw.headerRow) || Number(raw.headerRow) < 1 || Number(raw.headerRow) >= sheet.rows.length)
    throw new Error(`「${sheet.name}」表頭列無法確認，請調整欄位對應。`);
  const mapping = { headerRow: Number(raw.headerRow) } as NvBomMapping;
  const width = sheet.rows[mapping.headerRow - 1].length;
  const assigned = new Set<number>();
  for (const { key } of NV_BOM_FIELDS) {
    const column = raw[key];
    if (column === null) { mapping[key] = null; continue; }
    if (!Number.isInteger(column) || Number(column) < 1 || Number(column) > width || assigned.has(Number(column)))
      throw new Error(`「${sheet.name}」的${NV_BOM_FIELDS.find(field => field.key === key)!.label}欄位無法確認，請調整欄位對應。`);
    mapping[key] = Number(column); assigned.add(Number(column));
  }
  if (!mapping.partNumber && !mapping.mpn) throw new Error(`「${sheet.name}」需要 NV／來源料號或 MPN，才能辨識料件。`);
  return mapping;
}

const splitRefs = (value: string) => identity(value).split(/[\s,，;；、]+/).filter(Boolean);
const refTokens = (value: string) => [...new Set(splitRefs(value))].sort(order.compare);
const isPlacement = (ref: string) => /^[A-Z][A-Z0-9_]*\d[A-Z0-9_]*$/.test(ref) && !ref.startsWith("SBOM");
function placementRefs(value: string) {
  const tokens = splitRefs(value);
  // Placeholders, sub-BOM labels, and unexpanded ranges do not identify an individual board location.
  return tokens.every(isPlacement) && new Set(tokens).size === tokens.length ? tokens.sort(order.compare) : [];
}
const isDecimalQuantity = (value: string) => /^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value);
function quantityTotal(values: string[]) {
  if (values.every(value => !value)) return "";
  if (!values.every(isDecimalQuantity)) return [...values].sort(order.compare).join(" + ");
  const cleaned = values.map(value => value.replace(/,/g, ""));
  const digits = Math.max(...cleaned.map(value => value.split(".")[1]?.length ?? 0));
  const sum = cleaned.reduce((total, value) => {
    const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace(/^[-+]/, "").split(".");
    return total + BigInt(whole + fraction.padEnd(digits, "0")) * (negative ? -1n : 1n);
  }, 0n);
  const absolute = (sum < 0n ? -sum : sum).toString().padStart(digits + 1, "0");
  const formatted = digits ? `${absolute.slice(0, -digits)}.${absolute.slice(-digits)}`.replace(/\.?0+$/, "") : absolute;
  return `${sum < 0n ? "-" : ""}${formatted}`;
}
function group(sheet: NvBomSheet, mapping: NvBomMapping, keys: NvBomField[], side: NvBomUnresolved["side"]) {
  validateNvBomMapping(mapping, sheet);
  const rows = new Map<string, NvBomPart[]>(), unresolved: NvBomUnresolved[] = [];
  const referenceUse = new Map<string, number>();
  const header = sheet.rows[mapping.headerRow - 1];
  const selectedColumns = NV_BOM_FIELDS.flatMap(({ key }) => mapping[key] === null ? [] : [mapping[key]! - 1]);
  let skipped = 0;
  for (let row = mapping.headerRow; row < sheet.rows.length; row++) {
    const cells = sheet.rows[row];
    if (!cells.some(value => text(value)) || selectedColumns.every(column => identity(cells[column]) === identity(header[column]))) continue;
    const part = { sourceRows: [row + 1] } as NvBomPart;
    for (const { key } of NV_BOM_FIELDS) part[key] = mapping[key] ? text(cells[mapping[key]! - 1]) : "";
    for (const ref of splitRefs(part.refs).filter(isPlacement)) referenceUse.set(ref, (referenceUse.get(ref) ?? 0) + 1);
    if (!keys.some(field => field !== "manufacturer" && known(part[field]))) {
      skipped++;
      unresolved.push(unresolvedRow(side, part, "缺少兩份共用的 NV／來源料號或 MPN，無法確認這筆料件。"));
      continue;
    }
    // Array encoding prevents punctuation in a real part number from colliding with a key separator.
    const key = JSON.stringify(keys.map(field => known(part[field])));
    const prior = rows.get(key);
    if (prior) prior.push(part); else rows.set(key, [part]);
  }
  const merged = new Map<string, NvBomPart>();
  for (const [key, parts] of rows) {
    if (parts.length > 1 && !canCombine(parts)) {
      for (const part of parts) unresolved.push(unresolvedRow(side, part, "同一料號出現在多列，位號、數量或描述無法可靠合併，請對照 Excel 原始列。"));
      continue;
    }
    const part = { ...parts[0], sourceRows: parts.flatMap(item => item.sourceRows) };
    part.refs = refTokens(parts.map(item => item.refs).join(", ")).join(", ");
    part.qty = quantityTotal(parts.map(item => item.qty));
    merged.set(key, part);
  }
  return { parts: merged, skipped, unresolved, referenceUse, count: rows.size };
}

function canCombine(parts: NvBomPart[]) {
  const metadata = ["description", "manufacturer", "partNumber", "mpn"] as const;
  if (!parts.every(part => metadata.every(field => identity(part[field]) === identity(parts[0][field])))) return false;
  if (!parts.every(part => !part.qty) && !parts.every(part => isDecimalQuantity(part.qty))) return false;
  const refs = new Set<string>();
  for (const part of parts) {
    const locations = placementRefs(part.refs);
    if (!locations.length || locations.some(ref => refs.has(ref))) return false;
    for (const ref of locations) refs.add(ref);
  }
  return true;
}

function unresolvedRow(side: NvBomUnresolved["side"], part: NvBomPart, reason: string): NvBomUnresolved {
  return { id: `${side}:${part.sourceRows.join(",")}`, side, part, reason };
}

function partIndex(parts: Iterable<NvBomPart>, keys: (part: NvBomPart) => string[]) {
  const index = new Map<string, NvBomPart[]>();
  for (const part of parts) for (const key of keys(part)) {
    const current = index.get(key);
    if (current) current.push(part); else index.set(key, [part]);
  }
  return index;
}

function availableKeys(part: NvBomPart, fields: NvBomField[]) {
  return fields.flatMap(field => {
    const value = known(part[field]);
    return value ? [JSON.stringify([field, value])] : [];
  });
}

/** Compare exact identifiers first and keep uncertain matches separate from confirmed changes. */
export function compareNvBomSheets(before: NvBomSheet, after: NvBomSheet, beforeMapping: NvBomMapping, afterMapping: NvBomMapping): NvBomDiff {
  const shared = NV_BOM_FIELDS.filter(field => beforeMapping[field.key] && afterMapping[field.key]).map(field => field.key);
  const identifiers: NvBomField[] = shared.filter(field => field === "partNumber" || field === "mpn");
  if (!identifiers.length) throw new Error("新舊 BOM 沒有可共同核對的 NV／來源料號或 MPN，請調整欄位對應。");
  const keys = identifiers.includes("mpn") && shared.includes("manufacturer") ? [...identifiers, "manufacturer" as const] : identifiers;
  const a = group(before, beforeMapping, keys, "before"), b = group(after, afterMapping, keys, "after");
  const changes: NvBomChange[] = [];
  const unresolved = [...a.unresolved, ...b.unresolved];
  const beforeRemaining = new Set(a.parts.values()), afterRemaining = new Set(b.parts.values());
  let unchanged = 0;
  const pair = (oldPart: NvBomPart, newPart: NvBomPart) => {
    beforeRemaining.delete(oldPart); afterRemaining.delete(newPart);
    const changedFields = shared.filter(field => identity(oldPart[field]) !== identity(newPart[field]));
    if (!changedFields.length) unchanged++;
    else changes.push({ id: `changed:${oldPart.sourceRows[0]}:${newPart.sourceRows[0]}`, kind: "changed", before: oldPart, after: newPart, changedFields });
  };
  for (const [key, part] of a.parts) {
    const match = b.parts.get(key);
    if (match) pair(part, match);
  }

  const identityKeys = (part: NvBomPart) => availableKeys(part, identifiers);
  const beforeIds = partIndex([...a.parts.values(), ...a.unresolved.map(row => row.part)], identityKeys);
  const afterIds = partIndex([...b.parts.values(), ...b.unresolved.map(row => row.part)], identityKeys);
  for (const part of beforeRemaining) {
    const matches = new Set<NvBomPart>();
    for (const key of identityKeys(part)) {
      const candidates = afterIds.get(key);
      if (beforeIds.get(key)?.length === 1 && candidates?.length === 1 && afterRemaining.has(candidates[0])) matches.add(candidates[0]);
    }
    if (matches.size !== 1) continue;
    const match = [...matches][0];
    const reverse = identityKeys(match).some(key => {
      const candidates = beforeIds.get(key);
      return afterIds.get(key)?.length === 1 && candidates?.length === 1 && candidates[0] !== part && beforeRemaining.has(candidates[0]);
    });
    const conflict = keys.some(field => known(part[field]) && known(match[field]) && known(part[field]) !== known(match[field]));
    if (!reverse && !conflict) pair(part, match);
  }

  if (shared.includes("refs")) {
    const refKey = (part: NvBomPart, referenceUse: Map<string, number>) => {
      const refs = placementRefs(part.refs);
      return refs.length && refs.every(ref => referenceUse.get(ref) === 1) ? JSON.stringify(refs) : "";
    };
    const unresolvedBeforeIds = partIndex([...beforeRemaining, ...a.unresolved.map(row => row.part)], identityKeys);
    const unresolvedAfterIds = partIndex([...afterRemaining, ...b.unresolved.map(row => row.part)], identityKeys);
    const hasOtherIdentityMatch = (part: NvBomPart, match: NvBomPart, opposite: Map<string, NvBomPart[]>) => identityKeys(part).some(key => {
      const matches = opposite.get(key);
      return matches && (matches.length > 1 || matches[0] !== match);
    });
    const afterByRef = new Map([...afterRemaining].map(part => [refKey(part, b.referenceUse), part]));
    for (const part of beforeRemaining) {
      const key = refKey(part, a.referenceUse), match = key ? afterByRef.get(key) : undefined;
      if (!match || !identifiers.some(field => known(part[field]) && known(match[field]))) continue;
      // A unique location alone cannot overrule another plausible identifier match.
      if (!hasOtherIdentityMatch(part, match, unresolvedAfterIds) && !hasOtherIdentityMatch(match, part, unresolvedBeforeIds)) pair(part, match);
    }
  }

  const possibleKeys = (part: NvBomPart) => [...identityKeys(part), ...(shared.includes("refs") ? refTokens(part.refs).filter(isPlacement) : [])];
  const beforeCandidates = [...beforeRemaining, ...a.unresolved.map(row => row.part)];
  const afterCandidates = [...afterRemaining, ...b.unresolved.map(row => row.part)];
  const coverage = (part: NvBomPart) => identifiers.reduce((mask, field, index) => known(part[field]) ? mask | (1 << index) : mask, 0);
  const finish = (parts: Set<NvBomPart>, side: NvBomUnresolved["side"], opposite: NvBomPart[], unknownOpposite: NvBomUnresolved[]) => {
    const oppositeKeys = new Set(opposite.flatMap(possibleKeys));
    const oppositeCoverage = [...new Set(opposite.map(coverage).filter(Boolean))];
    const missingOpposite = unknownOpposite.some(({ part }) => !possibleKeys(part).length);
    for (const part of parts) {
      const identityCoverage = coverage(part);
      if (missingOpposite || oppositeCoverage.some(mask => !(mask & identityCoverage))) {
        unresolved.push(unresolvedRow(side, part, "兩份來源的識別欄位填寫不一致，無法確認是否新增或刪除。"));
      } else if (possibleKeys(part).some(key => oppositeKeys.has(key))) {
        unresolved.push(unresolvedRow(side, part, "另一版有相同料號或位號，但無法確認是一筆變更或新增／刪除。"));
      } else {
        changes.push(side === "before"
          ? { id: `removed:${part.sourceRows[0]}`, kind: "removed", before: part, changedFields: [] }
          : { id: `added:${part.sourceRows[0]}`, kind: "added", after: part, changedFields: [] });
      }
    }
  };
  finish(beforeRemaining, "before", afterCandidates, b.unresolved);
  finish(afterRemaining, "after", beforeCandidates, a.unresolved);
  unresolved.sort((left, right) => left.side === right.side ? left.part.sourceRows[0] - right.part.sourceRows[0] : left.side === "before" ? -1 : 1);
  changes.sort((left, right) => order.compare((left.after ?? left.before)!.partNumber || (left.after ?? left.before)!.mpn, (right.after ?? right.before)!.partNumber || (right.after ?? right.before)!.mpn));
  const warnings = [a.skipped ? `舊版 ${a.skipped} 列缺少共同的料號識別值，列為待核對。` : "", b.skipped ? `新版 ${b.skipped} 列缺少共同的料號識別值，列為待核對。` : "",
    ...NV_BOM_FIELDS.filter(field => Boolean(beforeMapping[field.key]) !== Boolean(afterMapping[field.key])).map(field => `${field.label}僅一份 BOM 提供，未將整欄缺少判為資料被刪除。`)].filter(Boolean);
  return { changes, unresolved, beforeCount: a.count, afterCount: b.count, unchanged, warnings, identityFields: keys };
}

export async function exportNvBomComparison({ diff, annotations, modelLabel, beforeName, afterName }: {
  diff: NvBomDiff; annotations: Record<string, NvBomAnnotation>; modelLabel: string; beforeName: string; afterName: string;
}) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const meta = book.addWorksheet("比對來源");
  const identityLabels = NV_BOM_FIELDS.filter(field => diff.identityFields.includes(field.key)).map(field => field.label);
  meta.addRows([
    ["舊版", beforeName], ["新版", afterName], ["AI", modelLabel],
    ["比對方式", `優先核對 ${identityLabels.join(" + ")}。只有一致且位號不重疊的用料才合併。無法確認的來源另列待核對。`],
    ["未變更料件", diff.unchanged], ["待核對來源", diff.unresolved.length],
    ...diff.warnings.map(note => ["待核對", note]),
  ]);
  meta.getColumn(1).width = 18; meta.getColumn(2).width = 100;
  const sheet = book.addWorksheet("新增刪除與變更");
  sheet.addRow([
    "差異", "NV／來源料號", "MPN", "廠商", "料名／描述", "舊數量", "新數量", "舊位號", "新位號", "舊版來源列", "新版來源列",
    "AI 手動修改建議", "AI 核對說明", "已核對", "人工備註", "變更欄位",
    "舊 NV／來源料號", "新 NV／來源料號", "舊 MPN", "新 MPN", "舊廠商", "新廠商", "舊料名／描述", "新料名／描述",
  ]);
  for (const item of diff.changes) {
    const { before, after } = item;
    const part = (after ?? before)!;
    const changedLabels = NV_BOM_FIELDS.filter(field => item.changedFields.includes(field.key)).map(field => field.label);
    sheet.addRow([
      NV_BOM_CHANGE_LABELS[item.kind], part.partNumber, part.mpn, part.manufacturer, part.description,
      before?.qty ?? "", after?.qty ?? "", before?.refs ?? "", after?.refs ?? "",
      before?.sourceRows.join(", ") ?? "", after?.sourceRows.join(", ") ?? "", item.advice ?? "",
      item.aiNote ?? "", annotations[item.id]?.checked ? "是" : "否", annotations[item.id]?.note ?? "", changedLabels.join("、"),
      before?.partNumber ?? "", after?.partNumber ?? "", before?.mpn ?? "", after?.mpn ?? "",
      before?.manufacturer ?? "", after?.manufacturer ?? "", before?.description ?? "", after?.description ?? "",
    ]);
  }
  sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "X1" };
  sheet.columns.forEach((column, index) => { column.width = [16, 26, 30, 24, 40, 12, 12, 35, 35, 20, 20, 45, 45, 12, 40, 30, 26, 26, 30, 30, 24, 24, 40, 40][index]; column.alignment = { vertical: "top", wrapText: true }; });
  if (diff.unresolved.length) {
    const manual = book.addWorksheet("待核對來源");
    manual.addRow(["版本", "Excel 來源列", ...NV_BOM_FIELDS.map(field => field.label), "需核對原因"]);
    for (const item of diff.unresolved) manual.addRow([item.side === "before" ? "舊版" : "新版", item.part.sourceRows.join(", "), ...NV_BOM_FIELDS.map(field => item.part[field.key]), item.reason]);
    manual.getRow(1).font = { bold: true }; manual.views = [{ state: "frozen", ySplit: 1 }];
    manual.autoFilter = { from: "A1", to: "I1" };
    manual.columns.forEach((column, index) => { column.width = [12, 20, 26, 30, 24, 40, 12, 35, 60][index]; column.alignment = { vertical: "top", wrapText: true }; });
  }
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `NV_BOM_比對_${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })}.xlsx`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
