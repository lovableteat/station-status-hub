import { getNvBomParentLocationLayout, NV_BOM_FIELDS, validateNvBomMapping, type NvBomField, type NvBomMapping, type NvBomSheet } from "./nvBomCompare.ts";

const aliases: Record<NvBomField, string[]> = {
  partNumber: [
    "PN", "Part Number", "Part No", "Part #", "Item Number", "Item No", "NV PN", "NV Part Number", "NVIDIA PN", "NVIDIA Number", "NVIDIA Part Number",
    "Source PN", "Source Part Number", "Original PN", "Original Part Number", "Internal Part Number", "NV 料號", "NVIDIA 料號", "來源料號", "原始料號", "料號", "品號",
  ],
  mpn: [
    "MPN", "Mfr PN", "Mfr Part Number", "Mfr Part No", "Mfr Part #", "Mfg PN", "Mfg Part Number", "Mfg Part No", "Mfg Part #",
    "Manufacturer PN", "Manufacturer Part Number", "Manufacturer Part No", "Manufacturer Part #", "Manufacturers Part Number",
    "Vendor Part Number", "Vendor Part No", "廠商料號", "製造商料號", "製造廠料號", "供應商料號",
  ],
  manufacturer: ["Manufacturer", "Manufacturer Name", "Mfr", "Mfr Name", "Maker", "Vendor", "Vendor Name", "廠商", "製造商", "製造廠商", "供應商"],
  description: ["Description", "Desc", "Part Description", "Item Description", "Part", "Name", "Part Name", "Item Name", "料名", "品名", "描述", "料件描述"],
  qty: ["Qty", "Quantity", "Qty Per", "Quantity Per", "Qty Per Assembly", "Component Qty", "數量", "用量"],
  refs: ["Ref", "Refs", "Ref Des", "Ref Designator", "Ref Designators", "Reference Designator", "Reference Designators", "Ref ID", "位號", "元件位號", "參考位號"],
};

const normalize = (value: string) => value.normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}#]+/gu, "");
const fieldByHeader = new Map<string, NvBomField>(NV_BOM_FIELDS.flatMap(({ key }) => aliases[key].map(label => [normalize(label), key] as const)));
const metadata = new Set([
  "Level", "Item Type", "Version", "State", "Find #", "Find Num", "Find Number", "Alt Qty", "Alt Quantity", "Alternate Qty", "Alternate Quantity",
  "Primary", "Ordering Restrictions", "Sourcing Status", "Supplier Intent", "BOM Notes",
  "Parent Number", "Parent Part Number", "Parent PN", "Parent Item Number",
  "Material Category", "S/D", "Mount Method", "Mounting Type", "Source", "Population", "Population Status", "Mount Status", "Fit Status",
  "DNP", "DNI", "DNM", "Do Not Populate", "Do Not Mount", "Do Not Install",
].map(normalize));
const blankMapping = (headerRow: number): NvBomMapping => ({ headerRow, partNumber: null, mpn: null, manufacturer: null, description: null, qty: null, refs: null });

function inspectHeader(sheet: NvBomSheet, headerRow: number) {
  const row = sheet.rows[headerRow - 1] ?? [];
  const headers = row.map(normalize);
  const cells = new Set(headers);
  // Bare Number is an NV part number only when the rest of the NVIDIA report header corroborates it.
  const nvidia = ["LEVEL", "ITEMTYPE", "NUMBER", "REFDES", "MANUFACTURERPARTNUMBER"].every(label => cells.has(label))
    && (cells.has("FIND#") || cells.has("FINDNUM"));
  const parentLocationLayout = getNvBomParentLocationLayout(row);
  const meanings = headers.map(label => nvidia && label === "NUMBER" ? "partNumber" : parentLocationLayout && label === "LOCATION" ? "refs" : fieldByHeader.get(label));
  const mapping = blankMapping(headerRow);
  const ambiguous: NvBomField[] = [];
  let fieldCount = 0;
  for (const { key } of NV_BOM_FIELDS) {
    const column = meanings.indexOf(key);
    if (column === -1) continue;
    fieldCount++;
    if (meanings.lastIndexOf(key) === column) mapping[key] = column + 1;
    else ambiguous.push(key);
  }
  return { mapping, ambiguous, headers, meanings, fieldCount, hasIdentity: meanings.includes("partNumber") || meanings.includes("mpn") };
}

export function inferNvBomMappingAt(sheet: NvBomSheet, headerRow: number): NvBomMapping {
  return inspectHeader(sheet, headerRow).mapping;
}

export function getNvBomHeaderAmbiguities(sheet: NvBomSheet, headerRow: number): NvBomField[] {
  return inspectHeader(sheet, headerRow).ambiguous;
}

/** Exact header aliases only. Candidate rows with different layouts need an explicit choice. */
export function inferNvBomMapping(sheet: NvBomSheet): NvBomMapping | null {
  const candidates = sheet.rows.slice(0, Math.min(60, sheet.rows.length - 1)).flatMap((_, index) => {
    const candidate = inspectHeader(sheet, index + 1);
    return candidate.hasIdentity && candidate.fieldCount >= 2 ? [candidate] : [];
  });
  const first = candidates[0];
  if (!first) return null;
  const layout = JSON.stringify(first.headers);
  return candidates.slice(1).some(candidate => JSON.stringify(candidate.headers) !== layout) ? null : first.mapping;
}

/** A custom header can be manually confirmed. Known field names cannot impersonate another field. */
export function validateNvBomHeaderMapping(value: unknown, sheet: NvBomSheet): NvBomMapping {
  const mapping = validateNvBomMapping(value, sheet);
  const { headers, meanings } = inspectHeader(sheet, mapping.headerRow);
  for (const { key, label } of NV_BOM_FIELDS) {
    const column = mapping[key];
    if (column === null) continue;
    const source = headers[column - 1], meaning = meanings[column - 1];
    if (!source || metadata.has(source) || meaning && meaning !== key) {
      const heading = sheet.rows[mapping.headerRow - 1][column - 1] || "（空白表頭）";
      throw new Error(`「${sheet.name}」的「${heading}」不是${label}，請確認欄位對應。`);
    }
  }
  return mapping;
}
