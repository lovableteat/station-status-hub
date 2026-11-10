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
export interface NvBomDiff { changes: NvBomChange[]; beforeCount: number; afterCount: number; unchanged: number; warnings: string[]; identityFields: NvBomField[] }
export interface NvBomAnnotation { checked: boolean; note: string }
export const NV_BOM_CHANGE_LABELS = { added: "新增料", removed: "刪除料", changed: "資料變更" };
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const identity = (value: unknown) => text(value).toUpperCase();
const order = new Intl.Collator("zh-TW", { numeric: true, sensitivity: "base" });

export async function readNvBomFile(file: File): Promise<NvBomFile> {
  if (!/\.(xlsx?|xlsm|csv)$/i.test(file.name)) throw new Error("請選擇 Excel（XLSX、XLS、XLSM）或 CSV 原始 BOM。");
  const xlsx = await import("xlsx");
  const book = xlsx.read(await file.arrayBuffer(), { type: "array", cellHTML: false, cellFormula: false, sheetRows: 100_001 });
  const sheets = book.SheetNames.flatMap(name => {
    const sheet = book.Sheets[name];
    const full = sheet["!fullref"] ?? sheet["!ref"];
    if (full && xlsx.utils.decode_range(full).e.r >= 100_000) throw new Error(`工作表「${name}」超過 100,000 列，這次未讀取；請另存要比對的工作表。`);
    const rows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true }).map(row => row.map(value => String(value ?? "")));
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

const refTokens = (value: string) => [...new Set(text(value).split(/[\s,，;；、]+/).filter(Boolean).map(identity))].sort(order.compare);
function quantityTotal(values: string[]) {
  if (values.every(value => !value)) return "";
  const cleaned = values.map(value => value.replace(/,/g, ""));
  if (!cleaned.every(value => /^[-+]?\d+(?:\.\d+)?$/.test(value))) return [...values].sort(order.compare).join(" + ");
  const digits = Math.max(...cleaned.map(value => value.split(".")[1]?.length ?? 0));
  const sum = cleaned.reduce((total, value) => {
    const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace(/^[-+]/, "").split(".");
    return total + BigInt(whole + fraction.padEnd(digits, "0")) * (negative ? -1n : 1n);
  }, 0n);
  const absolute = (sum < 0n ? -sum : sum).toString().padStart(digits + 1, "0");
  const formatted = digits ? `${absolute.slice(0, -digits)}.${absolute.slice(-digits)}`.replace(/\.?0+$/, "") : absolute;
  return `${sum < 0n ? "-" : ""}${formatted}`;
}
function group(sheet: NvBomSheet, mapping: NvBomMapping, keys: NvBomField[]) {
  validateNvBomMapping(mapping, sheet);
  const result = new Map<string, NvBomPart[]>();
  let skipped = 0;
  for (let row = mapping.headerRow; row < sheet.rows.length; row++) {
    const cells = sheet.rows[row];
    if (!cells.some(value => text(value))) continue;
    const part = { sourceRows: [row + 1] } as NvBomPart;
    for (const { key } of NV_BOM_FIELDS) part[key] = mapping[key] ? text(cells[mapping[key]! - 1]) : "";
    if (!keys.some(field => field !== "manufacturer" && part[field])) { skipped++; continue; }
    // Array encoding prevents punctuation in a real part number from colliding with a key separator.
    const key = JSON.stringify(keys.map(field => identity(part[field])));
    const prior = result.get(key);
    if (prior) prior.push(part); else result.set(key, [part]);
  }
  const merged = new Map<string, NvBomPart>();
  for (const [key, parts] of result) {
    const part = { ...parts[0], sourceRows: parts.flatMap(item => item.sourceRows) };
    for (const field of ["description", "manufacturer"] as const) part[field] = [...new Set(parts.map(item => item[field]).filter(Boolean))].join(" / ");
    part.refs = refTokens(parts.map(item => item.refs).join(", ")).join(", ");
    const quantities = parts.map(item => item.qty);
    part.qty = quantityTotal(quantities);
    merged.set(key, part);
  }
  return { parts: merged, skipped };
}

/** Every source row is considered; AI identifies columns and explains changes without inventing rows. */
export function compareNvBomSheets(before: NvBomSheet, after: NvBomSheet, beforeMapping: NvBomMapping, afterMapping: NvBomMapping): NvBomDiff {
  const shared = NV_BOM_FIELDS.filter(field => beforeMapping[field.key] && afterMapping[field.key]).map(field => field.key);
  const keys: NvBomField[] = shared.filter(field => field === "partNumber" || field === "mpn");
  if (!keys.length) throw new Error("新舊 BOM 沒有可共同核對的 NV／來源料號或 MPN，請調整欄位對應。");
  if (keys.includes("mpn") && shared.includes("manufacturer")) keys.push("manufacturer");
  const a = group(before, beforeMapping, keys), b = group(after, afterMapping, keys);
  const changes: NvBomChange[] = [];
  let unchanged = 0;
  for (const key of new Set([...a.parts.keys(), ...b.parts.keys()])) {
    const oldPart = a.parts.get(key), newPart = b.parts.get(key);
    const changedFields = oldPart && newPart ? shared.filter(field => identity(oldPart[field]) !== identity(newPart[field])) : [];
    if (oldPart && newPart && !changedFields.length) { unchanged++; continue; }
    changes.push({ id: key, kind: !oldPart ? "added" : !newPart ? "removed" : "changed", before: oldPart, after: newPart, changedFields });
  }
  changes.sort((left, right) => order.compare((left.after ?? left.before)!.partNumber || (left.after ?? left.before)!.mpn, (right.after ?? right.before)!.partNumber || (right.after ?? right.before)!.mpn));
  const warnings = [a.skipped ? `舊版 ${a.skipped} 列沒有兩份共用的料號識別欄位值，未當作料件；請核對欄位對應與原檔。` : "", b.skipped ? `新版 ${b.skipped} 列沒有兩份共用的料號識別欄位值，未當作料件；請核對欄位對應與原檔。` : "",
    ...NV_BOM_FIELDS.filter(field => Boolean(beforeMapping[field.key]) !== Boolean(afterMapping[field.key])).map(field => `${field.label}僅一份 BOM 提供，未將缺少欄位判為資料被刪除；本次按兩份共有的${keys.map(key => NV_BOM_FIELDS.find(field => field.key === key)!.label).join("＋")}辨識料件。`)].filter(Boolean);
  return { changes, beforeCount: a.parts.size, afterCount: b.parts.size, unchanged, warnings, identityFields: keys };
}

export async function exportNvBomComparison({ diff, annotations, modelLabel, beforeName, afterName }: {
  diff: NvBomDiff; annotations: Record<string, NvBomAnnotation>; modelLabel: string; beforeName: string; afterName: string;
}) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const meta = book.addWorksheet("比對來源");
  meta.addRows([["舊版", beforeName], ["新版", afterName], ["AI", modelLabel], ["比對方式", `${diff.identityFields.map(key => NV_BOM_FIELDS.find(field => field.key === key)!.label).join(" + ")}；重複用料合計數量及位號。`], ["未變更料件", diff.unchanged], ...diff.warnings.map(note => ["待核對", note])]);
  meta.getColumn(1).width = 18; meta.getColumn(2).width = 100;
  const sheet = book.addWorksheet("新增刪除與變更");
  sheet.addRow(["差異", "NV／來源料號", "MPN", "廠商", "料名／描述", "舊數量", "新數量", "舊位號", "新位號", "舊版來源列", "新版來源列", "AI 手動修改建議", "AI 核對說明", "已核對", "人工備註"]);
  for (const item of diff.changes) {
    const part = (item.after ?? item.before)!;
    sheet.addRow([NV_BOM_CHANGE_LABELS[item.kind], part.partNumber, part.mpn, part.manufacturer, part.description, item.before?.qty ?? "", item.after?.qty ?? "", item.before?.refs ?? "", item.after?.refs ?? "", item.before?.sourceRows.join(", ") ?? "", item.after?.sourceRows.join(", ") ?? "", item.advice ?? "尚未完成 AI 核對", item.aiNote ?? "", annotations[item.id]?.checked ? "是" : "否", annotations[item.id]?.note ?? ""]);
  }
  sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "O1" };
  sheet.columns.forEach((column, index) => { column.width = [16, 26, 30, 24, 40, 12, 12, 35, 35, 20, 20, 45, 45, 12, 40][index]; column.alignment = { vertical: "top", wrapText: true }; });
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `NV_BOM_比對_${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })}.xlsx`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
