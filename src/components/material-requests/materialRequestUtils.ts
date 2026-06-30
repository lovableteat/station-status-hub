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

const RISK_STATUSES = new Set([
  "Obsolete",
  "Disqualified",
  "Qualification Pending",
  "NRND",
]);

const REQUIRED_HEADERS = ["Level", "Name", "Qty", "Manufacturer", "Sourcing Status"];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

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
  if (remark.includes("00/Part/Symbol")) {
    return "pending-00-part-symbol";
  }

  if (remark.includes("#解除")) {
    return "pending-unlock";
  }

  if (remark.includes("Part/Symbol")) {
    return "pending-part-symbol";
  }

  if (remark.includes("需申請") && remark.includes("Symbol")) {
    return "pending-symbol";
  }

  if (remark === "OK") {
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
  const displayRef = firstNonEmpty(raw.refGroup, raw.refDes, raw.assemblyName, raw.name);
  const groupKey = `${displayRef}::${normalizeText(raw.name)}`;
  const partSummary = uniqueValues([
    raw.partNumber,
    raw.partName,
    raw.pcbFootprint,
  ]).join(" • ");

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
    isPending: actionKind !== "ok" && actionKind !== "other",
    isReady: actionKind === "ok",
    isApproved: normalizeText(raw.sourcingStatus) === "Approved",
    isRisk: RISK_STATUSES.has(normalizeText(raw.sourcingStatus)),
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

function findHeaderRow(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const normalizedRow = row.map(normalizeText);
    return REQUIRED_HEADERS.every((header) => normalizedRow.includes(header));
  });
}

function buildRowObject(headers: string[], row: unknown[]) {
  return headers.reduce<Record<string, unknown>>((result, header, index) => {
    if (header) {
      result[header] = row[index];
    }
    return result;
  }, {});
}

function extractSheetRecords(sheetName: string, worksheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex === -1) {
    return null;
  }

  const headers = rows[headerRowIndex].map(normalizeText);
  const records: MaterialWorkbookRecord[] = [];
  const hasRichColumns = ["Ref_tmp", "Remark", "Part Number", "PCB_Footprint"].every(
    (header) => headers.includes(header)
  );

  let currentSection = "";
  let currentAssembly = "";

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const rowObject = buildRowObject(headers, rows[index]);
    const levelValue = Number(rowObject.Level);

    if (!Number.isFinite(levelValue)) {
      continue;
    }

    const name = normalizeText(rowObject.Name);

    if (levelValue === 0) {
      currentSection = name;
      continue;
    }

    if (levelValue === 1) {
      currentAssembly = name;
      continue;
    }

    if (levelValue !== 2) {
      continue;
    }

    records.push({
      id: `${sheetName}-${index}`,
      sectionName: currentSection,
      assemblyName: currentAssembly,
      level: levelValue,
      name,
      qty: normalizeCellValue(rowObject.Qty),
      refDes: normalizeText(rowObject["Ref Des"]),
      manufacturerPartNumber: firstNonEmpty(
        rowObject["Manufacturer Part Number(1)"],
        rowObject["Manufacturer Part Number"]
      ),
      manufacturerPartNumberAlt: firstNonEmpty(
        rowObject["Manufacturer Part Number(2)"],
        rowObject["Manufacturer Part Number"]
      ),
      manufacturer: normalizeText(rowObject.Manufacturer),
      sourcingStatus: normalizeText(rowObject["Sourcing Status"]),
      refGroup: firstNonEmpty(rowObject.Ref_tmp, rowObject["Ref Des"]),
      lv: normalizeCellValue(rowObject.LV),
      remark: normalizeText(rowObject.Remark),
      partNumber: normalizeText(rowObject["Part Number"]),
      partName: normalizeText(rowObject["Part Name"]),
      partSpec: normalizeText(rowObject["Part Spec"]),
      schematicPart: normalizeText(rowObject.Schematic_Part),
      pcbFootprint: normalizeText(rowObject.PCB_Footprint),
    });
  }

  return {
    sheetName,
    score: records.length + (hasRichColumns ? 5000 : 0),
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
    throw new Error("找不到可解析的料號資料欄位，請確認 Excel 仍保留原始標題列。");
  }

  return {
    sourceFile: file.name,
    sheetName: bestMatch.sheetName,
    generatedAt: new Date().toISOString(),
    recordCount: bestMatch.records.length,
    records: bestMatch.records,
  };
}
