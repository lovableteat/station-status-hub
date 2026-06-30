import * as XLSX from "xlsx";

export interface MaterialWorkbookRecord {
  id: string;
  sectionName: string;
  assemblyName: string;
  level: number;
  name: string;
  qty: number | string;
  refDes: string;
  manufacturerPartNumber: string;
  manufacturerPartNumberAlt: string;
  manufacturer: string;
  sourcingStatus: string;
  refGroup: string;
  lv: number | string;
  remark: string;
  partNumber: string;
  partName: string;
  partSpec: string;
  schematicPart: string;
  pcbFootprint: string;
}

export interface MaterialWorkbookPayload {
  sourceFile: string;
  sheetName: string;
  generatedAt: string;
  recordCount: number;
  records: MaterialWorkbookRecord[];
}

export type MaterialActionKind =
  | "pending-00-part-symbol"
  | "pending-part-symbol"
  | "pending-unlock"
  | "pending-symbol"
  | "ok"
  | "other";

export interface MaterialRecord extends MaterialWorkbookRecord {
  groupKey: string;
  displayRef: string;
  mpnCandidates: string[];
  partSummary: string;
  actionKind: MaterialActionKind;
  isPending: boolean;
  isReady: boolean;
  isApproved: boolean;
  isRisk: boolean;
  searchText: string;
}

export interface MaterialGroup {
  key: string;
  displayRef: string;
  sectionName: string;
  assemblyName: string;
  name: string;
  qty: string;
  partName: string;
  partSpec: string;
  schematicPart: string;
  footprint: string;
  internalPartNumbers: string[];
  manufacturers: string[];
  records: MaterialRecord[];
  totalCount: number;
  pendingCount: number;
  okCount: number;
  approvedCount: number;
  riskCount: number;
  searchText: string;
}

export interface MaterialDataset {
  meta: {
    sourceFile: string;
    sheetName: string;
    generatedAt: string;
    recordCount: number;
  };
  records: MaterialRecord[];
  groups: MaterialGroup[];
  sourcingStatuses: string[];
  stats: {
    totalRecords: number;
    totalGroups: number;
    pendingRecords: number;
    readyRecords: number;
    approvedRecords: number;
    riskRecords: number;
    pendingGroups: number;
  };
}

type MaterialField =
  | "level"
  | "name"
  | "qty"
  | "refDes"
  | "mpn1"
  | "mpn2"
  | "manufacturer"
  | "sourcingStatus"
  | "refGroup"
  | "lv"
  | "remark"
  | "partNumber"
  | "partName"
  | "partSpec"
  | "schematicPart"
  | "pcbFootprint"
  | "sectionName"
  | "assemblyName";

const FIELD_ALIASES: Record<MaterialField, string[]> = {
  level: ["Level", "層級", "階層", "BOM Level"],
  name: ["Name", "Material Name", "料件名稱", "料名", "品名", "元件名稱"],
  qty: ["Qty", "Quantity", "數量", "用量"],
  refDes: ["Ref Des", "RefDes", "Reference Designator", "位號", "參考位號"],
  mpn1: ["Manufacturer Part Number(1)", "Manufacturer Part Number", "MPN", "Mfr Part Number", "廠商料號", "製造商料號"],
  mpn2: ["Manufacturer Part Number(2)", "MPN2", "Alternate MPN", "第二料號", "替代廠商料號"],
  manufacturer: ["Manufacturer", "Mfr", "Maker", "Vendor", "廠商", "製造商", "品牌"],
  sourcingStatus: ["Sourcing Status", "AVL Status", "Approval Status", "Status", "供料狀態", "核准狀態", "料件狀態"],
  refGroup: ["Ref_tmp", "Ref Group", "Group", "替代料群組", "料件群組", "群組代碼"],
  lv: ["LV", "Version", "版本", "版次"],
  remark: ["Remark", "Remarks", "Comment", "Note", "備註", "申請狀態"],
  partNumber: ["Part Number", "Internal Part Number", "Internal PN", "PN", "內部料號", "公司料號"],
  partName: ["Part Name", "Internal Part Name", "內部料名", "料號名稱"],
  partSpec: ["Part Spec", "Specification", "Spec", "規格", "料件規格"],
  schematicPart: ["Schematic_Part", "Schematic Part", "Symbol", "原理圖元件", "原理圖符號"],
  pcbFootprint: ["PCB_Footprint", "PCB Footprint", "Footprint", "封裝", "PCB封裝"],
  sectionName: ["Section", "Section Name", "系統", "區段", "大分類"],
  assemblyName: ["Assembly", "Assembly Name", "Module", "模組", "子系統"],
};

const APPROVED_STATUS_WORDS = ["approved", "qualified", "active", "已核准", "合格", "可用", "啟用"];
const RISK_STATUS_WORDS = ["obsolete", "disqualified", "qualificationpending", "nrnd", "eol", "停產", "淘汰", "禁用", "不建議採用", "認證中"];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-\/().（）]+/g, "");
}

const NORMALIZED_FIELD_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
    field,
    new Set(aliases.map(normalizeHeader)),
  ])
) as Record<MaterialField, Set<string>>;

function normalizeCellValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : Number(value.toFixed(4));
  }

  return normalizeText(value);
}

function firstNonEmpty(...values: unknown[]) {
  return values.map(normalizeText).find(Boolean) ?? "";
}

function uniqueValues(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

export function getActionKind(remark: string): MaterialActionKind {
  const normalizedRemark = normalizeText(remark).toLowerCase();

  if (normalizedRemark.includes("00/part/symbol")) {
    return "pending-00-part-symbol";
  }

  if (normalizedRemark.includes("#解除") || normalizedRemark.includes("unlock")) {
    return "pending-unlock";
  }

  if (normalizedRemark.includes("part/symbol")) {
    return "pending-part-symbol";
  }

  if (
    normalizedRemark.includes("symbol") &&
    (normalizedRemark.includes("需申請") || normalizedRemark.includes("pending") || normalizedRemark.includes("request"))
  ) {
    return "pending-symbol";
  }

  if (["ok", "ready", "completed", "已完成", "已建檔"].includes(normalizedRemark)) {
    return "ok";
  }

  return "other";
}

export function getActionLabel(actionKind: MaterialActionKind) {
  switch (actionKind) {
    case "pending-00-part-symbol":
      return "待申請 00/Part/Symbol";
    case "pending-part-symbol":
      return "待申請 Part/Symbol";
    case "pending-unlock":
      return "待申請 #解除";
    case "pending-symbol":
      return "待申請 Symbol";
    case "ok":
      return "OK";
    default:
      return "未分類";
  }
}

function buildSearchText(values: unknown[]) {
  return values
    .map(normalizeText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareActionPriority(left: MaterialRecord, right: MaterialRecord) {
  const order: Record<MaterialActionKind, number> = {
    "pending-00-part-symbol": 0,
    "pending-part-symbol": 1,
    "pending-unlock": 2,
    "pending-symbol": 3,
    ok: 4,
    other: 5,
  };

  const leftPriority = order[left.actionKind];
  const rightPriority = order[right.actionKind];

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (left.isRisk !== right.isRisk) {
    return left.isRisk ? -1 : 1;
  }

  return left.manufacturer.localeCompare(right.manufacturer);
}

function buildRecord(raw: MaterialWorkbookRecord): MaterialRecord {
  const manufacturerPartNumber = normalizeText(raw.manufacturerPartNumber);
  const manufacturerPartNumberAlt = normalizeText(raw.manufacturerPartNumberAlt);
  const mpnCandidates = uniqueValues([
    manufacturerPartNumber,
    manufacturerPartNumberAlt,
  ]);
  const remark = normalizeText(raw.remark);
  const actionKind = getActionKind(remark);
  const displayRef = firstNonEmpty(raw.refGroup, raw.refDes, raw.partNumber, raw.name);
  const inferredGroup = [raw.name, raw.partSpec, raw.pcbFootprint]
    .map(normalizeText)
    .filter(Boolean)
    .join("::");
  const groupIdentity = firstNonEmpty(raw.refGroup, raw.refDes, inferredGroup, raw.name);
  const groupKey = `${groupIdentity}::${normalizeText(raw.name)}`;
  const partSummary = uniqueValues([
    raw.partNumber,
    raw.partName,
    raw.pcbFootprint,
  ]).join(" • ");

  const normalizedStatus = normalizeHeader(raw.sourcingStatus);
  const isPending = actionKind !== "ok" && actionKind !== "other";
  const isApproved = APPROVED_STATUS_WORDS.some((word) => normalizedStatus.includes(normalizeHeader(word)));
  const isRisk = RISK_STATUS_WORDS.some((word) => normalizedStatus.includes(normalizeHeader(word)));

  return {
    ...raw,
    manufacturerPartNumber,
    manufacturerPartNumberAlt,
    remark,
    displayRef,
    groupKey,
    mpnCandidates,
    partSummary,
    actionKind,
    isPending,
    isReady: actionKind === "ok" || (Boolean(normalizeText(raw.partNumber)) && !isPending),
    isApproved,
    isRisk,
    searchText: buildSearchText([
      raw.sectionName,
      raw.assemblyName,
      raw.name,
      raw.refGroup,
      raw.refDes,
      manufacturerPartNumber,
      manufacturerPartNumberAlt,
      raw.manufacturer,
      raw.partNumber,
      raw.partName,
      raw.partSpec,
      raw.pcbFootprint,
      raw.remark,
      raw.sourcingStatus,
    ]),
  };
}

export function buildMaterialDataset(payload: MaterialWorkbookPayload): MaterialDataset {
  const records = payload.records.map(buildRecord).sort(compareActionPriority);
  const groupMap = new Map<string, MaterialRecord[]>();

  records.forEach((record) => {
    const current = groupMap.get(record.groupKey) ?? [];
    current.push(record);
    groupMap.set(record.groupKey, current);
  });

  const groups = Array.from(groupMap.entries())
    .map(([key, groupRecords]) => {
      const firstRecord = groupRecords[0];

      return {
        key,
        displayRef: firstRecord.displayRef,
        sectionName: firstNonEmpty(...groupRecords.map((item) => item.sectionName)),
        assemblyName: firstNonEmpty(...groupRecords.map((item) => item.assemblyName)),
        name: firstNonEmpty(...groupRecords.map((item) => item.name)),
        qty: firstNonEmpty(...groupRecords.map((item) => item.qty), "-"),
        partName: firstNonEmpty(...groupRecords.map((item) => item.partName)),
        partSpec: firstNonEmpty(...groupRecords.map((item) => item.partSpec)),
        schematicPart: firstNonEmpty(...groupRecords.map((item) => item.schematicPart)),
        footprint: firstNonEmpty(...groupRecords.map((item) => item.pcbFootprint)),
        internalPartNumbers: uniqueValues(groupRecords.map((item) => item.partNumber)),
        manufacturers: uniqueValues(groupRecords.map((item) => item.manufacturer)),
        records: [...groupRecords].sort(compareActionPriority),
        totalCount: groupRecords.length,
        pendingCount: groupRecords.filter((item) => item.isPending).length,
        okCount: groupRecords.filter((item) => item.isReady).length,
        approvedCount: groupRecords.filter((item) => item.isApproved).length,
        riskCount: groupRecords.filter((item) => item.isRisk).length,
        searchText: buildSearchText([
          ...groupRecords.map((item) => item.searchText),
          key,
        ]),
      } satisfies MaterialGroup;
    })
    .sort((left, right) => {
      if (left.pendingCount !== right.pendingCount) {
        return right.pendingCount - left.pendingCount;
      }

      if (left.riskCount !== right.riskCount) {
        return right.riskCount - left.riskCount;
      }

      return left.displayRef.localeCompare(right.displayRef);
    });

  return {
    meta: {
      sourceFile: payload.sourceFile,
      sheetName: payload.sheetName,
      generatedAt: payload.generatedAt,
      recordCount: payload.recordCount,
    },
    records,
    groups,
    sourcingStatuses: uniqueValues(records.map((record) => record.sourcingStatus)).sort(),
    stats: {
      totalRecords: records.length,
      totalGroups: groups.length,
      pendingRecords: records.filter((record) => record.isPending).length,
      readyRecords: records.filter((record) => record.isReady).length,
      approvedRecords: records.filter((record) => record.isApproved).length,
      riskRecords: records.filter((record) => record.isRisk).length,
      pendingGroups: groups.filter((group) => group.pendingCount > 0).length,
    },
  };
}

function resolveHeaderFields(row: unknown[]) {
  const fields = new Map<MaterialField, number>();

  row.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    (Object.keys(NORMALIZED_FIELD_ALIASES) as MaterialField[]).forEach((field) => {
      if (!fields.has(field) && NORMALIZED_FIELD_ALIASES[field].has(normalized)) {
        fields.set(field, index);
      }
    });
  });

  return fields;
}

function findHeaderRow(rows: unknown[][]) {
  let bestMatch: { index: number; fields: Map<MaterialField, number>; score: number } | null = null;

  rows.slice(0, 40).forEach((row, index) => {
    const fields = resolveHeaderFields(row);
    const hasName = fields.has("name") || fields.has("partName");
    const hasMaterialIdentity = fields.has("mpn1") || fields.has("partNumber") || fields.has("refDes") || fields.has("refGroup");
    const score = fields.size;

    if (hasName && hasMaterialIdentity && score >= 3 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { index, fields, score };
    }
  });

  return bestMatch;
}

function getFieldValue(row: unknown[], fields: Map<MaterialField, number>, field: MaterialField) {
  const index = fields.get(field);
  return index == null ? "" : row[index];
}

function extractSheetRecords(sheetName: string, worksheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerMatch = findHeaderRow(rows);

  if (!headerMatch) {
    return null;
  }

  const { index: headerRowIndex, fields } = headerMatch;
  const records: MaterialWorkbookRecord[] = [];
  const hasLevelColumn = fields.has("level");

  let currentSection = "";
  let currentAssembly = "";

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const levelCell = getFieldValue(row, fields, "level");
    const parsedLevel = Number(levelCell);
    const levelValue = hasLevelColumn && normalizeText(levelCell) && Number.isFinite(parsedLevel) ? parsedLevel : 2;
    const partName = normalizeText(getFieldValue(row, fields, "partName"));
    const partNumber = normalizeText(getFieldValue(row, fields, "partNumber"));
    const mpn1 = normalizeText(getFieldValue(row, fields, "mpn1"));
    const name = firstNonEmpty(getFieldValue(row, fields, "name"), partName, partNumber, mpn1);

    if (!name) continue;

    if (levelValue === 0) {
      currentSection = name;
      continue;
    }

    if (levelValue === 1) {
      currentAssembly = name;
      continue;
    }

    if (levelValue < 2) {
      continue;
    }

    const refDes = normalizeText(getFieldValue(row, fields, "refDes"));
    const refGroup = firstNonEmpty(getFieldValue(row, fields, "refGroup"), refDes);

    records.push({
      id: `${sheetName}-${index}`,
      sectionName: firstNonEmpty(getFieldValue(row, fields, "sectionName"), currentSection),
      assemblyName: firstNonEmpty(getFieldValue(row, fields, "assemblyName"), currentAssembly),
      level: 2,
      name,
      qty: normalizeCellValue(getFieldValue(row, fields, "qty")),
      refDes,
      manufacturerPartNumber: mpn1,
      manufacturerPartNumberAlt: normalizeText(getFieldValue(row, fields, "mpn2")),
      manufacturer: normalizeText(getFieldValue(row, fields, "manufacturer")),
      sourcingStatus: normalizeText(getFieldValue(row, fields, "sourcingStatus")),
      refGroup,
      lv: normalizeCellValue(getFieldValue(row, fields, "lv")),
      remark: normalizeText(getFieldValue(row, fields, "remark")),
      partNumber,
      partName,
      partSpec: normalizeText(getFieldValue(row, fields, "partSpec")),
      schematicPart: normalizeText(getFieldValue(row, fields, "schematicPart")),
      pcbFootprint: normalizeText(getFieldValue(row, fields, "pcbFootprint")),
    });
  }

  return {
    sheetName,
    score: records.length + fields.size * 250,
    records,
  };
}

export async function parseMaterialWorkbookFile(file: File): Promise<MaterialWorkbookPayload> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
  });

  const candidates = workbook.SheetNames.map((sheetName) =>
    extractSheetRecords(sheetName, workbook.Sheets[sheetName])
  ).filter(Boolean) as Array<{
    sheetName: string;
    score: number;
    records: MaterialWorkbookRecord[];
  }>;

  const bestMatch = candidates.sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.records.length === 0) {
    throw new Error("找不到可解析的料號資料。至少需要料名欄，以及 MPN、內部料號、Ref Des 或群組欄其中一項。");
  }

  return {
    sourceFile: file.name,
    sheetName: bestMatch.sheetName,
    generatedAt: new Date().toISOString(),
    recordCount: bestMatch.records.length,
    records: bestMatch.records,
  };
}
