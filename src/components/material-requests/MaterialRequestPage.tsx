import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  CircleCheck,
  Copy,
  Download,
  Eye,
  Factory,
  FileSpreadsheet,
  Filter,
  History,
  ImagePlus,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import seedPayload from "@/data/materialRequestSeed.json";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { exportToCsv } from "@/utils/apiExportUtils";

import {
  type MaterialDataset,
  type MaterialGroup,
  type MaterialRecord,
  type MaterialTrackingHistoryEntry,
  type MaterialTrackingHistoryImage,
  type MaterialWorkbookRecord,
  type MaterialWorkbookPayload,
  buildMaterialDataset,
  getActionLabel,
  getLatestTrackingEntry,
  isPreferredInternalPartNumber,
  parseMaterialWorkbookFile,
} from "./materialRequestUtils";
import {
  type BomStorageMode,
  type BomWorkspace,
  loadBomWorkspacesDetailed,
  removeBomWorkspace,
  saveBomWorkspace,
  saveBomWorkspaceRecord,
  subscribeBomWorkspaceChanges,
} from "./materialBomStorage";

type AvailabilityFilter = "all" | "usable" | "required" | "pending" | "risk" | "single";
type SortMode = "reference" | "alternatives" | "approved" | "pending" | "single-source";
type EditorMode = "create" | "edit" | "view";

const SORT_MODE_LABELS: Record<SortMode, string> = {
  reference: "Ref 由小到大",
  "single-source": "無替代料優先",
  alternatives: "替代料數由多到少",
  approved: "Approved 數由多到少",
  pending: "待申請數由多到少",
};

interface ExcelFilterOption {
  label: string;
  value: string;
  count: number;
  keywords?: string;
  tone?: ExcelFilterTone;
}

type ExcelFilterTone = "emerald" | "amber" | "sky" | "rose" | "slate";
type ColumnFilterSelection = string[] | null;

interface SavedMaterialChanges {
  added: MaterialWorkbookRecord[];
  updated: Record<string, MaterialWorkbookRecord>;
}

interface MaterialColumnFilters {
  material: ColumnFilterSelection;
  refDes: ColumnFilterSelection;
  mpn: ColumnFilterSelection;
  internal: ColumnFilterSelection;
  virtualAlternative: ColumnFilterSelection;
  trackingStatus: ColumnFilterSelection;
  specification: ColumnFilterSelection;
}

interface MaterialColumnTextFilters {
  material: string;
  refDes: string;
  mpn: string;
  internal: string;
  virtualAlternative: string;
  trackingStatus: string;
  specification: string;
}

type ColumnFilterKey = keyof MaterialColumnFilters;

const EMPTY_COLUMN_FILTERS: MaterialColumnFilters = {
  material: null,
  refDes: null,
  mpn: null,
  internal: null,
  virtualAlternative: null,
  trackingStatus: null,
  specification: null,
};

const EMPTY_COLUMN_TEXT_FILTERS: MaterialColumnTextFilters = {
  material: "",
  refDes: "",
  mpn: "",
  internal: "",
  virtualAlternative: "",
  trackingStatus: "",
  specification: "",
};

const DEFAULT_BOM_ID = "bom:申請carrier料.xlsx";
const ACTIVE_BOM_KEY = "station-status-hub:active-material-bom:v1";

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const COLUMN_WIDTHS_KEY = "station-status-hub:material-column-widths:v6";
const TRACKING_STATUS_OPTIONS = ["新增追蹤", "處理中", "已完成"] as const;
const DEFAULT_COLUMN_WIDTHS = [260, 160, 260, 210, 190, 180, 250, 220, 130];
const MIN_COLUMN_WIDTHS = [200, 120, 180, 170, 150, 140, 180, 180, 110];
const MAX_COLUMN_WIDTHS = [520, 360, 520, 460, 420, 360, 520, 420, 260];

function loadColumnWidths() {
  if (typeof window === "undefined") return DEFAULT_COLUMN_WIDTHS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(COLUMN_WIDTHS_KEY) ?? "null");
    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_COLUMN_WIDTHS.length) {
      return DEFAULT_COLUMN_WIDTHS;
    }

    return parsed.map((width, index) => Number.isFinite(width)
      ? Math.min(MAX_COLUMN_WIDTHS[index], Math.max(MIN_COLUMN_WIDTHS[index], Number(width)))
      : DEFAULT_COLUMN_WIDTHS[index]);
  } catch {
    return DEFAULT_COLUMN_WIDTHS;
  }
}

function toWorkbookRecord(record: MaterialWorkbookRecord): MaterialWorkbookRecord {
  return {
    id: record.id,
    sourceGroupKey: record.sourceGroupKey,
    sourceRow: record.sourceRow,
    isGroupStart: record.isGroupStart,
    sectionName: record.sectionName,
    assemblyName: record.assemblyName,
    level: record.level,
    name: record.name,
    qty: record.qty,
    refDes: record.refDes,
    manufacturerPartNumber: record.manufacturerPartNumber,
    manufacturerPartNumberAlt: record.manufacturerPartNumberAlt,
    virtualAlternative: record.virtualAlternative ?? "",
    trackingStatus: record.trackingStatus ?? "",
    trackingHistory: record.trackingHistory ?? [],
    manufacturer: record.manufacturer,
    sourcingStatus: record.sourcingStatus,
    refGroup: record.refGroup,
    lv: record.lv,
    remark: record.remark,
    partNumber: record.partNumber,
    partName: record.partName,
    partSpec: record.partSpec,
    schematicPart: record.schematicPart,
    pcbFootprint: record.pcbFootprint,
  };
}

function createRecordTemplate(group?: MaterialGroup): MaterialWorkbookRecord {
  const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    sourceGroupKey: group?.primaryRecord.sourceGroupKey ?? id,
    isGroupStart: !group,
    sectionName: group?.sectionName ?? "",
    assemblyName: group?.assemblyName ?? "",
    level: 2,
    name: group?.name ?? "",
    qty: group?.qty ?? 1,
    refDes: group?.primaryRecord.refDes ?? "",
    manufacturerPartNumber: "",
    manufacturerPartNumberAlt: "",
    virtualAlternative: "",
    trackingStatus: "",
    trackingHistory: [],
    manufacturer: "",
    sourcingStatus: "",
    refGroup: group?.displayRef ?? "",
    lv: "",
    remark: group ? "需申請 00/Part/Symbol" : "",
    partNumber: "",
    partName: group?.partName ?? "",
    partSpec: group?.partSpec ?? "",
    schematicPart: group?.schematicPart ?? "",
    pcbFootprint: group?.footprint ?? "",
  };
}

function loadSavedChanges(): SavedMaterialChanges {
  if (typeof window === "undefined") return { added: [], updated: {} };

  try {
    const stored = window.localStorage.getItem(LOCAL_CHANGES_KEY);
    if (!stored) return { added: [], updated: {} };
    const parsed = JSON.parse(stored) as SavedMaterialChanges;
    return {
      added: Array.isArray(parsed.added) ? parsed.added : [],
      updated: parsed.updated && typeof parsed.updated === "object" ? parsed.updated : {},
    };
  } catch {
    return { added: [], updated: {} };
  }
}

function createDefaultBomWorkspace(): BomWorkspace {
  const payload = seedPayload as MaterialWorkbookPayload;
  const savedChanges = loadSavedChanges();
  const records = payload.records
    .map((record) => savedChanges.updated[record.id] ?? record)
    .concat(savedChanges.added);

  return {
    id: DEFAULT_BOM_ID,
    name: payload.sourceFile,
    payload: { ...payload, recordCount: records.length, records },
    updatedAt: payload.generatedAt,
  };
}

function hashBomSignature(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createBomSignature(payload: MaterialWorkbookPayload) {
  const signature = payload.records.map((record) => [
    record.sectionName,
    record.assemblyName,
    record.name,
    String(record.qty ?? ""),
    record.refDes,
    record.manufacturerPartNumber,
    record.manufacturerPartNumberAlt,
    record.manufacturer,
    record.refGroup,
    record.lv,
    record.remark,
    record.partNumber,
    record.partName,
    record.partSpec,
    record.schematicPart,
    record.pcbFootprint,
  ].map((value) => String(value ?? "").trim()).join("\u001f")).join("\u001e");

  return `${payload.sheetName}\u001d${payload.recordCount}\u001d${signature}`;
}

function createBomId(fileName: string, payload: MaterialWorkbookPayload) {
  const normalizedFileName = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "bom";
  const fingerprint = hashBomSignature(createBomSignature(payload));

  return `bom:${normalizedFileName}:${fingerprint}`;
}

function loadActiveBomId() {
  if (typeof window === "undefined") return DEFAULT_BOM_ID;
  return window.localStorage.getItem(ACTIVE_BOM_KEY) || DEFAULT_BOM_ID;
}

function mergeImportedWorkspace(existingWorkspace: BomWorkspace | undefined, workspaceId: string, payload: MaterialWorkbookPayload): BomWorkspace {
  const existingRecords = new Map((existingWorkspace?.payload.records ?? []).map((record) => [record.id, record]));
  const importedRecordIds = new Set<string>();
  const mergedRecords = payload.records.map((record) => {
    importedRecordIds.add(record.id);
    const existingRecord = existingRecords.get(record.id);

    return {
      ...existingRecord,
      ...record,
      virtualAlternative: record.virtualAlternative?.trim()
        ? record.virtualAlternative
        : existingRecord?.virtualAlternative ?? "",
      trackingStatus: record.trackingStatus?.trim()
        ? record.trackingStatus
        : existingRecord?.trackingStatus ?? "",
      trackingHistory: record.trackingHistory?.length
        ? record.trackingHistory
        : existingRecord?.trackingHistory ?? [],
    };
  });
  const preservedManualRecords = (existingWorkspace?.payload.records ?? []).filter((record) =>
    record.id.startsWith("manual-") && !importedRecordIds.has(record.id)
  );
  const records = mergedRecords.concat(preservedManualRecords);

  return {
    id: workspaceId,
    name: payload.sourceFile,
    payload: {
      ...payload,
      records,
      recordCount: records.length,
    },
    updatedAt: new Date().toISOString(),
  };
}

function parseSearchTokens(query: string) {
  return (query.match(/"[^"]+"|\S+/g) ?? [])
    .map((token) => token.replace(/^"|"$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

function isPrimaryInternalPart(record: MaterialRecord) {
  return isPreferredInternalPartNumber(record.partNumber);
}

function getAlternativeScore(record: MaterialRecord) {
  const primaryOffset = record.isPreferred ? 0 : isPrimaryInternalPart(record) ? 10 : 20;

  if (record.isApproved && record.isReady && !record.isRisk) return primaryOffset;
  if (record.isApproved && !record.isRisk) return primaryOffset + 1;
  if (record.isReady && !record.isRisk) return primaryOffset + 2;
  if (!record.isRisk) return primaryOffset + 3;
  return primaryOffset + 4;
}

function getSortedAlternatives(group: MaterialGroup) {
  const alternatives = group.records.filter((record) => record.id !== group.primaryRecord.id);
  alternatives.sort((left, right) => {
    const scoreDiff = getAlternativeScore(left) - getAlternativeScore(right);
    if (scoreDiff !== 0) return scoreDiff;

    return left.manufacturer.localeCompare(right.manufacturer);
  });

  return [group.primaryRecord, ...alternatives];
}

function getUniqueMpnCountForRecords(records: MaterialRecord[]) {
  return new Set(
    records
      .flatMap((record) => record.mpnCandidates)
      .map((mpn) => mpn.trim().toLowerCase())
      .filter(Boolean),
  ).size;
}

function getUniqueMpnCount(group: MaterialGroup) {
  return getUniqueMpnCountForRecords(group.records);
}

function splitRefDesignators(...values: string[]) {
  return Array.from(new Set(
    values
      .flatMap((value) => String(value ?? "")
        .split(/[\s,，、;；\n\r\t]+/g)
        .map((item) => item.trim())
        .filter(Boolean))
  ));
}

function isExactRefDesToken(token: string) {
  return /^[a-z]{1,4}\d+(?:[_-][a-z0-9]+)?$/i.test(token.trim());
}

function hasNoAlternative(group: MaterialGroup) {
  return getUniqueMpnCount(group) <= 1;
}

function requiresApplication(group: MaterialGroup) {
  return group.requiresApplication;
}

function getDisplayMpn(record: MaterialRecord) {
  return record.manufacturerPartNumber || record.manufacturerPartNumberAlt || "";
}

function getGroupColumnValues(group: MaterialGroup, key: ColumnFilterKey) {
  switch (key) {
    case "material":
      return [
        group.displayRef,
        group.name,
        group.assemblyName,
        ...group.manufacturers,
      ];
    case "refDes":
      return group.records.flatMap((record) => {
        const splitRefs = splitRefDesignators(record.refDes);
        return splitRefs.length > 0
          ? splitRefs
          : splitRefDesignators(record.refGroup, group.displayRef);
      });
    case "mpn":
      return group.records.flatMap((record) => [record.manufacturerPartNumber, record.manufacturerPartNumberAlt]);
    case "internal":
      return group.records.flatMap((record) => [record.partNumber, record.schematicPart, record.pcbFootprint]);
    case "virtualAlternative":
      return group.records.map((record) => record.virtualAlternative ?? "");
    case "trackingStatus": {
      return group.records.flatMap((record) => {
        const latestEntry = getLatestTrackingEntry(record);
        return [
          getTrackingWorkflowStatus(record),
          latestEntry?.note ?? "",
          latestEntry?.createdBy ?? "",
        ];
      });
    }
    case "specification":
      return [
        group.partSpec,
        group.partName,
        group.schematicPart,
        group.footprint,
        ...group.records.map((record) => record.remark),
      ];
    default:
      return [];
  }
}

function getRecordColumnValues(record: MaterialRecord, group: MaterialGroup, key: ColumnFilterKey) {
  const latestTrackingEntry = getLatestTrackingEntry(record);

  switch (key) {
    case "material":
      return [
        group.displayRef,
        group.name,
        group.assemblyName,
        record.manufacturer,
        record.refDes,
        record.refGroup,
      ];
    case "refDes":
      return splitRefDesignators(record.refDes).length > 0
        ? splitRefDesignators(record.refDes)
        : splitRefDesignators(record.refGroup, group.displayRef);
    case "mpn":
      return [record.manufacturerPartNumber, record.manufacturerPartNumberAlt];
    case "internal":
      return [record.partNumber, record.schematicPart, record.pcbFootprint];
    case "virtualAlternative":
      return [record.virtualAlternative ?? ""];
    case "trackingStatus": {
      const values = [
        getTrackingWorkflowStatus(record),
        latestTrackingEntry?.note ?? "",
        latestTrackingEntry?.createdBy ?? "",
      ];

      return values;
    }
    case "specification":
      return [
        group.partSpec,
        group.partName,
        group.schematicPart,
        group.footprint,
        record.partSpec,
        record.partName,
        record.remark,
      ];
    default:
      return [];
  }
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return value;

  const diffMs = Date.now() - parsed;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "剛剛更新";
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小時前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} 個月前`;

  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} 年前`;
}

function getTrackingStatusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return "border-slate-300/25 bg-slate-200/10 text-slate-200";
  if (["完成", "已完成", "ok", "approved", "完成申請", "結案"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "border-fuchsia-300/60 bg-fuchsia-500/20 text-fuchsia-50 shadow-[0_0_18px_rgba(217,70,239,0.28)]";
  }
  if (["處理中", "進行", "progress", "working", "wip"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "border-amber-300/60 bg-amber-400/20 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.24)]";
  }
  if (["新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "border-slate-300/25 bg-slate-200/10 text-slate-200";
  }
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

function getTrackingStatusCardTone(status: string) {
  const normalized = status.trim().toLowerCase();

  if (!normalized) {
    return {
      wrapper: "border-slate-300/25 bg-slate-200/[0.08] hover:bg-slate-200/[0.12]",
      accent: "bg-slate-200/80",
      note: "bg-slate-950/25 text-slate-200",
      meta: "text-slate-300",
      icon: "text-slate-200",
    };
  }

  if (["完成", "已完成", "ok", "approved", "完成申請", "結案"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return {
      wrapper: "border-fuchsia-300/55 bg-fuchsia-500/[0.2] shadow-[0_0_22px_rgba(217,70,239,0.18)] hover:bg-fuchsia-500/[0.26]",
      accent: "bg-fuchsia-200",
      note: "bg-fuchsia-950/40 text-fuchsia-50",
      meta: "text-fuchsia-100",
      icon: "text-fuchsia-100",
    };
  }

  if (["處理中", "進行", "progress", "working", "wip"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return {
      wrapper: "border-amber-300/55 bg-amber-400/[0.18] shadow-[0_0_22px_rgba(251,191,36,0.15)] hover:bg-amber-400/[0.24]",
      accent: "bg-amber-300",
      note: "bg-amber-950/30 text-amber-50",
      meta: "text-amber-100",
      icon: "text-amber-100",
    };
  }

  if (["新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return {
      wrapper: "border-slate-300/25 bg-slate-200/[0.08] hover:bg-slate-200/[0.12]",
      accent: "bg-slate-200/80",
      note: "bg-slate-950/25 text-slate-200",
      meta: "text-slate-300",
      icon: "text-slate-200",
    };
  }

  return {
    wrapper: "border-sky-400/40 bg-sky-500/[0.15] hover:bg-sky-500/[0.22]",
    accent: "bg-sky-300",
    note: "bg-sky-950/30 text-sky-50",
    meta: "text-sky-100",
    icon: "text-sky-100",
  };
}

function createTrackingHistoryId() {
  return `tracking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTrackingImageId() {
  return `tracking-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readImageFile(file: File) {
  return new Promise<MaterialTrackingHistoryImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`圖片「${file.name}」讀取失敗`));
        return;
      }

      resolve({
        id: createTrackingImageId(),
        name: file.name,
        mimeType: file.type || "image/*",
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => reject(new Error(`圖片「${file.name}」讀取失敗`));
    reader.readAsDataURL(file);
  });
}

function normalizeFilterValue(value: string) {
  const normalized = value.trim();
  return normalized || "(空白)";
}

function uniqueNormalizedValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeFilterValue)));
}

function inferFilterOptionTone(value: string): ExcelFilterTone {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return "amber";
  if (["完成", "已完成", "ok", "approved", "結案", "可用", "已建"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "emerald";
  }
  if (["風險", "缺料", "阻塞", "blocked", "失敗"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "rose";
  }
  if (["新增追蹤", "待", "申請", "確認", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "amber";
  }
  if (["處理中", "追蹤", "進行", "progress"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "sky";
  }

  return "slate";
}

function buildExcelFilterOptions(valueGroups: string[][]) {
  const counter = new Map<string, number>();

  valueGroups.forEach((values) => {
    uniqueNormalizedValues(values).forEach((value) => {
      counter.set(value, (counter.get(value) ?? 0) + 1);
    });
  });

  return Array.from(counter.entries())
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
    .map(([value, count]) => ({
      label: value,
      value,
      count,
      keywords: value,
      tone: inferFilterOptionTone(value),
    }));
}

function normalizeTrackingWorkflowStatus(status: string) {
  const normalized = status.trim().toLowerCase();

  if (["完成", "已完成", "ok", "approved", "完成申請", "結案"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "已完成" as const;
  }

  if (["處理中", "進行", "progress", "working", "wip"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "處理中" as const;
  }

  return "新增追蹤" as const;
}

function getTrackingWorkflowStatus(record: MaterialRecord) {
  const latestEntry = getLatestTrackingEntry(record);
  return normalizeTrackingWorkflowStatus(latestEntry?.status || record.trackingStatus || "");
}

function buildTrackingStatusFilterOptions(valueGroups: string[][]) {
  const counter = new Map<(typeof TRACKING_STATUS_OPTIONS)[number], number>(
    TRACKING_STATUS_OPTIONS.map((status) => [status, 0]),
  );

  valueGroups.forEach((values) => {
    const status = normalizeTrackingWorkflowStatus(values[0] ?? "");
    counter.set(status, (counter.get(status) ?? 0) + 1);
  });

  return TRACKING_STATUS_OPTIONS
    .filter((status) => (counter.get(status) ?? 0) > 0)
    .map((status) => ({
      label: status,
      value: status,
      count: counter.get(status) ?? 0,
      keywords: status,
      tone: inferFilterOptionTone(status),
    }));
}

function matchesExcelFilter(selectedValues: ColumnFilterSelection, candidateValues: string[]) {
  if (selectedValues === null) return true;
  if (selectedValues.length === 0) return false;
  const normalizedCandidates = uniqueNormalizedValues(candidateValues);
  return normalizedCandidates.some((value) => selectedValues.includes(value));
}

function matchesTextFilterQuery(query: string, candidateValues: string[]) {
  const tokens = parseSearchTokens(query);
  if (tokens.length === 0) return true;

  const searchableText = candidateValues
    .map((value) => normalizeFilterValue(value).toLowerCase())
    .join(" ");

  return tokens.every((token) => searchableText.includes(token));
}

function matchesRecordColumnFilters(
  record: MaterialRecord,
  group: MaterialGroup,
  filters: MaterialColumnFilters,
  textFilters: MaterialColumnTextFilters,
  ignoredKey?: ColumnFilterKey,
) {
  const keys = Object.keys(filters) as ColumnFilterKey[];

  return keys.every((key) => {
    if (key === ignoredKey) return true;
    const candidateValues = getRecordColumnValues(record, group, key);

    return (
      matchesExcelFilter(filters[key], candidateValues) &&
      matchesTextFilterQuery(textFilters[key], candidateValues)
    );
  });
}

function matchesColumnFilters(
  group: MaterialGroup,
  filters: MaterialColumnFilters,
  textFilters: MaterialColumnTextFilters,
  ignoredKey?: ColumnFilterKey,
) {
  return group.records.some((record) =>
    matchesRecordColumnFilters(record, group, filters, textFilters, ignoredKey)
  );
}

function normalizeColumnFilterSelection(
  selectedValues: ColumnFilterSelection,
  options: ExcelFilterOption[],
) {
  if (selectedValues === null) return null;

  const optionValueSet = new Set(options.map((option) => option.value));
  const normalized = Array.from(new Set(selectedValues.filter((value) => optionValueSet.has(value))));

  if (normalized.length === 0 && selectedValues.length > 0) {
    return null;
  }

  return normalized.length === options.length ? null : normalized;
}

function ExcelFilterPopover({
  label,
  options,
  selectedValues,
  onSelectedValuesChange,
  textFilterValue,
  onTextFilterValueChange,
  searchPlaceholder,
}: {
  label: string;
  options: ExcelFilterOption[];
  selectedValues: ColumnFilterSelection;
  onSelectedValuesChange: (values: ColumnFilterSelection) => void;
  textFilterValue: string;
  onTextFilterValueChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [optionSearchQuery, setOptionSearchQuery] = useState("");
  const [toneFilter, setToneFilter] = useState<ExcelFilterTone | "all">("all");
  const optionValueSet = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const effectiveSelected = useMemo(
    () => selectedValues === null
      ? options.map((option) => option.value)
      : selectedValues.filter((value) => optionValueSet.has(value)),
    [optionValueSet, options, selectedValues],
  );
  const hasContainsFilter = textFilterValue.trim().length > 0;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = optionSearchQuery.trim().toLowerCase();
    const next = options.filter((option) => {
      const matchesSearch = !normalizedQuery || `${option.label} ${option.keywords ?? ""}`.toLowerCase().includes(normalizedQuery);
      const matchesTone = toneFilter === "all" || (option.tone ?? "slate") === toneFilter;
      return matchesSearch && matchesTone;
    });

    return [...next].sort((left, right) => sortDirection === "asc"
      ? left.label.localeCompare(right.label, undefined, { numeric: true })
      : right.label.localeCompare(left.label, undefined, { numeric: true }));
  }, [optionSearchQuery, options, sortDirection, toneFilter]);

  const toneButtons = useMemo(() => {
    const availableTones = new Set(options.map((option) => option.tone ?? "slate"));
    return [
      {
        value: "all" as const,
        label: "全部顏色",
        className: "border-slate-400/20 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20",
        activeClassName: "border-cyan-300/50 bg-cyan-400/15 text-cyan-100",
      },
      availableTones.has("emerald") ? {
        value: "emerald" as const,
        label: "綠",
        className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
        activeClassName: "border-emerald-300/60 bg-emerald-500/25 text-emerald-50",
      } : null,
      availableTones.has("amber") ? {
        value: "amber" as const,
        label: "黃",
        className: "border-amber-400/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
        activeClassName: "border-amber-300/60 bg-amber-500/25 text-amber-50",
      } : null,
      availableTones.has("sky") ? {
        value: "sky" as const,
        label: "藍",
        className: "border-sky-400/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
        activeClassName: "border-sky-300/60 bg-sky-500/25 text-sky-50",
      } : null,
      availableTones.has("rose") ? {
        value: "rose" as const,
        label: "紅",
        className: "border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
        activeClassName: "border-rose-300/60 bg-rose-500/25 text-rose-50",
      } : null,
      availableTones.has("slate") ? {
        value: "slate" as const,
        label: "灰",
        className: "border-slate-400/20 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20",
        activeClassName: "border-slate-300/60 bg-slate-500/25 text-slate-50",
      } : null,
    ].filter(Boolean) as Array<{
      value: ExcelFilterTone | "all";
      label: string;
      className: string;
      activeClassName: string;
    }>;
  }, [options]);

  const visibleCheckedCount = filteredOptions.filter((option) => effectiveSelected.includes(option.value)).length;
  const allVisibleChecked = filteredOptions.length > 0 && visibleCheckedCount === filteredOptions.length;
  const hasValueFilter = selectedValues !== null;
  const summary = hasContainsFilter
    ? hasValueFilter
      ? effectiveSelected.length === 0
        ? `0/${options.length} + 包含`
        : `${effectiveSelected.length}/${options.length} + 包含`
      : "全部 + 包含"
    : hasValueFilter
      ? effectiveSelected.length === 0
        ? `0/${options.length}`
        : `${effectiveSelected.length}/${options.length}`
      : "全部";

  const applySelection = (nextValues: string[]) => {
    const normalized = Array.from(new Set(nextValues.filter((value) => optionValueSet.has(value))));
    onSelectedValuesChange(normalized.length === options.length ? null : normalized);
  };

  const toggleValue = (value: string, checked: boolean) => {
    const current = selectedValues === null ? options.map((option) => option.value) : effectiveSelected;
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((item) => item !== value);

    applySelection(next);
  };

  const toggleVisibleSelection = (checked: boolean) => {
    const next = new Set(selectedValues === null ? options.map((option) => option.value) : effectiveSelected);
    filteredOptions.forEach((option) => {
      if (checked) next.add(option.value);
      else next.delete(option.value);
    });
    applySelection(Array.from(next));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-lg border border-blue-300/25 bg-[#07182d] px-3 text-left text-sm font-bold text-slate-100 hover:border-cyan-300/50 hover:bg-cyan-400/10"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 flex-none text-cyan-300" />
            <span className="truncate">{label}</span>
          </span>
          <span className="ml-2 flex-none rounded bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-100">
            {summary}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] border border-blue-400/25 bg-[#0d182b] p-2.5 text-slate-100 shadow-[0_24px_80px_rgba(2,8,23,0.55)]"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-blue-400/15 bg-[#111f36] px-3 py-2">
            <p className="text-sm font-black text-slate-50">{label}</p>
            <span className="rounded bg-cyan-400/10 px-2 py-0.5 text-[11px] font-bold text-cyan-100">{summary}</span>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-[#10192e] p-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">排序</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSortDirection("asc")}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-colors",
                  sortDirection === "asc"
                    ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                    : "border-blue-300/20 bg-[#111f36] text-slate-300 hover:bg-blue-400/10"
                )}
              >
                從 A 到 Z
              </button>
              <button
                type="button"
                onClick={() => setSortDirection("desc")}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-colors",
                  sortDirection === "desc"
                    ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                    : "border-blue-300/20 bg-[#111f36] text-slate-300 hover:bg-blue-400/10"
                )}
              >
                從 Z 到 A
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-[#10192e] p-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">勾選清單搜尋</p>
              <Input
                value={optionSearchQuery}
                onChange={(event) => setOptionSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 rounded-lg border-blue-400/20 bg-[#111f36] px-3 text-[13px] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-cyan-400/18 bg-cyan-400/[0.05] p-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">文字包含</p>
              <Input
                value={textFilterValue}
                onChange={(event) => onTextFilterValueChange(event.target.value)}
                placeholder={`只顯示包含指定文字的${label}`}
                className="h-9 rounded-lg border-blue-400/20 bg-[#111f36] px-3 text-[13px] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-[#10192e] p-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">依顏色快速篩選</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {toneButtons.map((button) => (
                <button
                  key={button.value}
                  type="button"
                  onClick={() => setToneFilter(button.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    toneFilter === button.value ? button.activeClassName : button.className,
                  )}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-blue-400/15 bg-[#10192e] p-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">快捷操作</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectedValuesChange(null)}
                className="h-8 rounded-lg border border-blue-400/20 bg-blue-400/10 px-2 text-[12px] font-semibold text-blue-100 hover:bg-blue-400/20 hover:text-blue-50"
              >
                全選
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectedValuesChange([])}
                className="h-8 rounded-lg border border-rose-400/20 bg-rose-400/10 px-2 text-[12px] font-semibold text-rose-100 hover:bg-rose-400/20 hover:text-rose-50"
              >
                全不選
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applySelection(filteredOptions.map((option) => option.value))}
                className="h-8 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 text-[12px] font-semibold text-amber-100 hover:bg-amber-400/20 hover:text-amber-50"
              >
                只留搜尋結果
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOptionSearchQuery("");
                  setToneFilter("all");
                  onSelectedValuesChange(null);
                  onTextFilterValueChange("");
                }}
                className="h-8 rounded-lg border border-slate-400/20 bg-slate-400/10 px-2 text-[12px] font-semibold text-slate-200 hover:bg-slate-400/20 hover:text-slate-50"
              >
                清空此欄
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-blue-400/15 bg-[#10192e] px-3 py-2 text-[12px] text-slate-300">
            <span>目前勾選 {effectiveSelected.length} / {options.length}</span>
            <span>清單顯示 {filteredOptions.length} 筆</span>
          </div>

          <ScrollArea className="h-56 rounded-xl border border-blue-400/15 bg-[#091222]">
            <div className="space-y-1.5 p-2">
              {options.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-blue-400/10 bg-blue-400/[0.06] px-2.5 py-2 text-[13px] font-semibold text-slate-100 hover:bg-blue-400/10">
                  <Checkbox
                    checked={allVisibleChecked ? true : visibleCheckedCount > 0 ? "indeterminate" : false}
                    onCheckedChange={(value) => toggleVisibleSelection(value === true)}
                    className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                  />
                  <span className="min-w-0 flex-1 truncate">(全選)</span>
                  <span className="text-sm text-slate-300">{visibleCheckedCount}/{filteredOptions.length}</span>
                </label>
              )}

              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const checked = effectiveSelected.includes(option.value);
                  const tone = option.tone ?? "slate";
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[13px] text-slate-100 hover:border-blue-400/10 hover:bg-blue-400/10"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleValue(option.value, value === true)}
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                      />
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full flex-none",
                          tone === "emerald" && "bg-emerald-300",
                          tone === "amber" && "bg-amber-300",
                          tone === "sky" && "bg-sky-300",
                          tone === "rose" && "bg-rose-300",
                          tone === "slate" && "bg-slate-400",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-300">{option.count}</span>
                    </label>
                  );
                })
              ) : (
                <div className="px-2 py-6 text-center text-[13px] text-slate-400">找不到符合的篩選值</div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ResizableHeader({
  children,
  width,
  minWidth,
  maxWidth,
  resizable = true,
  onResize,
  className,
}: {
  children: ReactNode;
  width: number;
  minWidth: number;
  maxWidth: number;
  resizable?: boolean;
  onResize: (width: number) => void;
  className?: string;
}) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const nextWidth = dragRef.current.startWidth + event.clientX - dragRef.current.startX;
    onResize(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <th
      className={cn("relative border-r border-blue-300/20 px-4 py-4", className)}
      style={{ width, minWidth, maxWidth: width }}
    >
      {children}
      {resizable && <button
        type="button"
        aria-label="拖曳調整欄寬"
        title="拖曳調整欄寬"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className="absolute inset-y-0 right-0 z-30 w-2 touch-none cursor-col-resize border-r-2 border-transparent hover:border-cyan-300 active:border-cyan-200"
      />}
    </th>
  );
}

function InlineVirtualAlternativeEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const commit = () => {
    const nextValue = draft.trim();

    if (!nextValue) {
      const confirmed = window.confirm("TX 尚未填入資訊，確定要維持空白嗎？");
      if (!confirmed) {
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
    }

    setEditing(false);
    if (nextValue !== value) {
      setPendingValue(nextValue);
      setConfirmOpen(true);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  const closeConfirmation = () => {
    setConfirmOpen(false);
    setPendingValue(null);
    setDraft(value);
  };

  const confirmSave = () => {
    if (pendingValue == null) return;
    onSave(pendingValue);
    setConfirmOpen(false);
    setPendingValue(null);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="h-9 border-teal-300/50 bg-[#071522] text-[15px] font-bold text-teal-100 focus-visible:ring-teal-400"
        placeholder="輸入 TX"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center justify-between gap-2 rounded border border-teal-400/20 bg-teal-400/[0.07] px-3 py-2 text-left hover:bg-teal-400/15"
        title="直接修改 TX"
      >
        <span className={cn("break-all text-[15px] font-bold leading-6", value ? "text-teal-200 group-hover:text-teal-100" : "text-slate-400")}>{value || "點擊填寫"}</span>
        <Pencil className="h-4 w-4 flex-none text-teal-400" />
      </button>
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) closeConfirmation(); }}>
        <DialogContent className="max-w-md border-teal-400/25 bg-[#0d1729] text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-xl text-slate-50">確認更新 TX</DialogTitle>
            <DialogDescription className="text-slate-400">
              送出前再確認一次，避免誤動造成資料被改掉。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-xl border border-teal-400/15 bg-[#091222] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">原本 TX</p>
              <p className="mt-1 break-all text-sm font-bold text-slate-200">{value || "空白"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">更新後 TX</p>
              <p className="mt-1 break-all text-sm font-bold text-teal-200">{pendingValue || "空白"}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={closeConfirmation} className="border-slate-400/20 bg-transparent text-slate-300 hover:bg-slate-400/10 hover:text-slate-100">
              取消
            </Button>
            <Button type="button" onClick={confirmSave} className="bg-teal-500 font-bold text-slate-950 hover:bg-teal-400">
              確認更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TrackingHistoryCell({
  record,
  onOpen,
}: {
  record: MaterialRecord;
  onOpen: (record: MaterialRecord) => void;
}) {
  const latestEntry = getLatestTrackingEntry(record);
  const workflowStatus = getTrackingWorkflowStatus(record);
  const cardTone = getTrackingStatusCardTone(workflowStatus);
  const historyCount = record.trackingHistory?.length
    ? record.trackingHistory.length
    : latestEntry
      ? 1
      : 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
        cardTone.wrapper,
      )}
      title="查看狀態追蹤歷史"
    >
      <span className={cn("mt-1 h-14 w-1.5 flex-none rounded-full", cardTone.accent)} />
      <div className="min-w-0 flex-1">
        <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", getTrackingStatusTone(workflowStatus))}>
          {workflowStatus}
        </span>
        <p
          className={cn(
            "mt-2 rounded-lg px-2.5 py-2 text-sm leading-6",
            latestEntry?.note ? `${cardTone.note} line-clamp-2` : "bg-slate-950/25 text-slate-400",
          )}
        >
          {latestEntry?.note || (latestEntry ? "點擊查看完整歷史與圖片" : "點擊建立第一筆狀態追蹤")}
        </p>
        <p className={cn("mt-2 text-xs", cardTone.meta)}>
          {historyCount} 筆紀錄
          {latestEntry?.createdAt ? ` · ${formatTimestamp(latestEntry.createdAt)}` : ""}
        </p>
      </div>
      <History className={cn("mt-1 h-4 w-4 flex-none opacity-90 transition-opacity group-hover:opacity-100", cardTone.icon)} />
    </button>
  );
}

function TrackingHistoryDialog({
  open,
  record,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  record: MaterialRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (record: MaterialRecord, entry: MaterialTrackingHistoryEntry) => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<(typeof TRACKING_STATUS_OPTIONS)[number] | "">("");
  const [note, setNote] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [images, setImages] = useState<MaterialTrackingHistoryImage[]>([]);
  const [previewImage, setPreviewImage] = useState<MaterialTrackingHistoryImage | null>(null);
  const latestEntry = record ? getLatestTrackingEntry(record) : null;
  const latestWorkflowStatus = record ? getTrackingWorkflowStatus(record) : "新增追蹤";
  const historyEntries = useMemo(() => {
    if (!record) return [];

    const entries = record.trackingHistory?.length
      ? [...record.trackingHistory]
      : latestEntry
        ? [latestEntry]
        : [];

    return entries.sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [latestEntry, record]);

  useEffect(() => {
    if (!open) return;
    setStatus("");
    setNote("");
    setCreatedBy("");
    setImages([]);
    setPreviewImage(null);
  }, [open, record?.id]);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const invalidFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      toast({
        title: "只支援圖片檔案",
        description: invalidFiles.map((file) => file.name).join("、"),
        variant: "destructive",
      });
    }

    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validFiles.length === 0) {
      event.target.value = "";
      return;
    }

    try {
      const nextImages = await Promise.all(validFiles.map(readImageFile));
      setImages((current) => [...current, ...nextImages]);
    } catch (error) {
      toast({
        title: "圖片讀取失敗",
        description: error instanceof Error ? error.message : "請重新選擇圖片後再試一次。",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleSave = () => {
    if (!record || !status.trim()) return;

    onSave(record, {
      id: createTrackingHistoryId(),
      status: status.trim(),
      note: note.trim(),
      createdAt: new Date().toISOString(),
      createdBy: createdBy.trim(),
      images,
    });
    onOpenChange(false);
  };

  const handleMarkCompleted = () => {
    if (!record) return;

    onSave(record, {
      id: createTrackingHistoryId(),
      status: "已完成",
      note: latestEntry?.note?.trim() || "已手動標記完成",
      createdAt: new Date().toISOString(),
      createdBy: createdBy.trim(),
      images: [],
    });
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-2xl text-slate-50">狀態追蹤</DialogTitle>
            <DialogDescription className="text-slate-400">
              {record
                ? `${record.name || "未命名料件"} · ${record.manufacturerPartNumber || record.partNumber || record.displayRef}`
                : "管理目前料件的追蹤歷史與附件圖片。"}
            </DialogDescription>
          </DialogHeader>

          {record && (
            <div className="grid gap-5 py-2 xl:grid-cols-[1.15fr_0.95fr]">
              <section className="rounded-2xl border border-sky-400/20 bg-[#101d33] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-50">最新狀態</h3>
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em]", getTrackingStatusTone(latestWorkflowStatus))}>
                      {latestWorkflowStatus}
                    </span>
                  </div>
                  {latestWorkflowStatus !== "已完成" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMarkCompleted}
                      className="h-10 border-emerald-400/30 bg-emerald-400/15 px-4 text-sm font-bold text-emerald-100 hover:bg-emerald-400/25 hover:text-emerald-50"
                    >
                      <CircleCheck className="mr-2 h-4 w-4" />
                      直接標記完成
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {latestEntry?.note || "目前還沒有追蹤備註，建立第一筆後就會在這裡顯示最新內容。"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>歷史筆數 {historyEntries.length}</span>
                  {latestEntry?.createdAt && <span>最後更新 {formatTimestamp(latestEntry.createdAt)}</span>}
                  {latestEntry?.createdBy && <span>更新人 {latestEntry.createdBy}</span>}
                </div>

                <div className="mt-5 rounded-2xl border border-blue-400/20 bg-[#0a1527] p-4">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-cyan-300" />
                    <p className="text-sm font-bold text-cyan-200">新增追蹤紀錄</p>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tracking-status-select">最新狀態 *</Label>
                      <Select value={status} onValueChange={(value) => setStatus(value as (typeof TRACKING_STATUS_OPTIONS)[number])}>
                        <SelectTrigger id="tracking-status-select" className="border-blue-400/25 bg-[#071522] text-slate-100 focus:ring-blue-500">
                          <SelectValue placeholder="請選擇最新狀態" />
                        </SelectTrigger>
                        <SelectContent className="border-blue-400/25 bg-[#0d1729] text-slate-100">
                          {TRACKING_STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tracking-owner-input">更新人</Label>
                      <Input id="tracking-owner-input" value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder="例如：採購 / RD / Peggy" className="border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tracking-note-input">追蹤說明</Label>
                      <Textarea id="tracking-note-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="補充這次更新做了什麼、卡在哪裡、下一步是什麼。" className="min-h-28 border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tracking-images-input">上傳圖片</Label>
                      <label htmlFor="tracking-images-input" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-400/30 bg-cyan-400/[0.06] px-4 py-4 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/[0.12]">
                        <Upload className="h-4 w-4" />
                        選擇圖片
                      </label>
                      <input id="tracking-images-input" type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                      <p className="text-xs leading-5 text-slate-400">圖片會跟這筆狀態一起保存，之後打開歷史可以直接回看。</p>
                      {images.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {images.map((image) => (
                            <div key={image.id} className="overflow-hidden rounded-xl border border-blue-400/20 bg-[#0a1527]">
                              <button
                                type="button"
                                onClick={() => setPreviewImage(image)}
                                className="block aspect-[4/3] w-full bg-slate-950/40 transition hover:opacity-90"
                                title={`預覽圖片：${image.name}`}
                              >
                                <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                              </button>
                              <div className="flex items-start justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-200">{image.name}</p>
                                  <p className="text-xs text-slate-500">{(image.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button type="button" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} className="rounded-md border border-rose-400/20 bg-rose-400/10 p-1.5 text-rose-200 hover:bg-rose-400/20" title="移除圖片">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button type="button" onClick={handleSave} disabled={!status.trim()} className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">
                      儲存這次追蹤
                    </Button>
                  </div>
                </div>
              </section>

            <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-300" />
                <h3 className="text-lg font-bold text-slate-50">過去歷史</h3>
              </div>

              <div className="mt-4 space-y-3">
                {historyEntries.length === 0 && (
                  <div className="rounded-xl border border-slate-400/15 bg-[#0a1527] px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-slate-300">目前還沒有歷史紀錄</p>
                    <p className="mt-1 text-sm text-slate-500">新增第一筆後，之後每次更新都會留在這裡。</p>
                  </div>
                )}

                {historyEntries.map((entry, index) => {
                  const entryTone = getTrackingStatusCardTone(entry.status);

                  return (
                    <article key={`${entry.id}-${index}`} className={cn("rounded-2xl border p-4", entryTone.wrapper)}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", getTrackingStatusTone(entry.status))}>
                            {entry.status}
                          </span>
                          <div className={cn("mt-2 flex flex-wrap gap-2 text-xs", entryTone.meta)}>
                            {entry.createdAt ? <span>{formatTimestamp(entry.createdAt)}</span> : <span>舊版狀態</span>}
                            {entry.createdBy && <span>更新人 {entry.createdBy}</span>}
                            {(entry.images?.length ?? 0) > 0 && <span>{entry.images?.length} 張圖片</span>}
                          </div>
                        </div>
                        {index === 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200">
                            <CircleCheck className="h-3.5 w-3.5" />
                            最新
                          </span>
                        )}
                      </div>

                      {entry.note && (
                        <p className={cn("mt-3 whitespace-pre-wrap rounded-xl px-3 py-3 text-sm leading-6", entryTone.note)}>
                          {entry.note}
                        </p>
                      )}

                      {entry.images && entry.images.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {entry.images.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => setPreviewImage(image)}
                              className="overflow-hidden rounded-xl border border-blue-400/15 bg-slate-950/30 text-left hover:border-cyan-400/30"
                              title={`檢視圖片：${image.name}`}
                            >
                              <div className="aspect-[4/3]">
                                <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                              </div>
                              <div className="px-3 py-2">
                                <p className="truncate text-sm font-semibold text-slate-200">{image.name}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewImage)} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewImage(null); }}>
        <DialogContent className="max-w-4xl border-blue-400/30 bg-[#0d1729] text-slate-100">
          {previewImage && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl text-slate-50">{previewImage.name}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  點擊縮圖後直接在頁內預覽，避免被瀏覽器擋掉圖片開啟。
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden rounded-2xl border border-blue-400/15 bg-slate-950/40">
                <img src={previewImage.dataUrl} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                <span>{(previewImage.size / 1024).toFixed(1)} KB</span>
                <a
                  href={previewImage.dataUrl}
                  download={previewImage.name}
                  className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 font-semibold text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
                >
                  下載圖片
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusPill({ record }: { record: MaterialRecord }) {
  if (record.isRisk) {
    return (
      <span className="inline-flex rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-sm font-bold text-rose-300">
        {record.sourcingStatus || "風險料"}
      </span>
    );
  }

  if (record.isApproved) {
    return (
      <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-sm font-bold text-emerald-300">
        Approved
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-slate-400/25 bg-slate-400/10 px-3 py-1.5 text-sm font-bold text-slate-300">
      {record.sourcingStatus || "未標記"}
    </span>
  );
}

function ActionPill({ record }: { record: MaterialRecord }) {
  const className = record.isReady
    ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
    : record.isPending
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-slate-400/25 bg-slate-400/10 text-slate-300";

  return (
    <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-sm font-bold", className)}>
      {getActionLabel(record.actionKind)}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Layers3;
  tone: "blue" | "green" | "amber" | "cyan";
}) {
  const colors = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            {value.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", colors)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function UploadGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const templateUrl = `${import.meta.env.BASE_URL}material-upload-template.xlsx`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">上傳說明</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            這裡不是教你做 Excel 格式研究，而是告訴你這個網站要怎麼餵資料、怎麼看結果、出錯時先檢查哪裡。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-[15px]">
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-cyan-200">1. 先用標準範本整理</h3>
                <p className="mt-1 leading-6 text-slate-400">如果你手上的 BOM 很亂，先用範本重排一次最省事。範本裡有欄位示例，照著填，網站辨識率最高。</p>
              </div>
              <Button asChild className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">
                <a href={templateUrl} download="料號替代料_上傳範本.xlsx">
                  <Download className="mr-2 h-4 w-4" />下載上傳範本
                </a>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-5">
            <h3 className="text-lg font-bold text-blue-200">2. Excel 要怎麼排，網站才看得懂</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["一列只放一個廠商料", "同一個 location 如果有 3 個候選 MPN，就要拆成 3 列，不要把 3 個料號塞在同一格。"],
                ["主料與替代料要排在一起", "同一組資料請連續擺放，主料在前，替代料接在後面，避免網站把它拆成不同群組。"],
                ["有藍色起始列就照藍色分組", "如果你的 Excel 有用底色標主料，網站會優先用這個規則；下一個藍色列出現前，都算同一組。"],
                ["Ref Des / location 要寫清楚", "像 `C418`、`J10`、`U73` 這些位號是網站判斷焊位的核心欄位，能填就一定要填。"],
                ["同一組的圖面資料要一致", "Part Spec、Schematic_Part、PCB_Footprint 這些資料，在同一主料與替代料群組裡不要亂變。"],
                ["狀態欄請用固定字", "建議用 Approved、Active、NRND、Obsolete、Disqualified，中文也能吃，但固定寫法最穩。"],
                ["TX 與追蹤欄可後補", "TX、狀態追蹤不一定要在 Excel 就填好，匯入後也能直接在網站上補。"],
                ["一個 BOM 一個檔案", "不同板子、不同版本請分開存，檔名最好帶專案名與版次，不然後面很難查。"],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border border-blue-400/15 bg-[#0a1527] p-4">
                  <p className="font-bold text-slate-100">{title}</p>
                  <p className="mt-2 leading-6 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-emerald-200">3. 上傳後系統怎麼判斷</h3>
            <div className="mt-4 space-y-3 leading-6 text-slate-300">
              <p><strong className="text-slate-100">先找主工作表：</strong>如果檔案裡有很多 sheet，系統會挑欄位最完整、有效資料最多的那一張來讀。</p>
              <p><strong className="text-slate-100">再判斷分組：</strong>有藍色列就先照藍色列；沒有藍色列才退回用 Ref Group、Ref Des、料名等欄位去猜。</p>
              <p><strong className="text-slate-100">再判斷可用料：</strong>一列如果有可用的內部料號，或你已經填了 TX，系統就不會把它當成完全無料。</p>
              <p><strong className="text-slate-100">你看到的主料總表：</strong>是一行一個主料群組，展開後才會看到下面所有替代料與追蹤資訊。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5">
            <h3 className="text-lg font-bold text-amber-200">4. 實際操作流程</h3>
            <ol className="mt-3 space-y-2 leading-6 text-slate-300">
              <li>1. 先把單一專案 / 單一版本 BOM 整理成一個 Excel 檔。</li>
              <li>2. 按「上傳 BOM」匯入；可以一次選多個檔，但每個檔都會變成一個獨立 BOM 工作區。</li>
              <li>3. 匯入後先看上方統計數字，再用表頭篩選檢查 `REF DES`、`MPN`、`內部料號`、`TX`、`狀態追蹤`。</li>
              <li>4. 如果某組料需要補充說明，可直接在表格內填 `TX`；如果需要持續追蹤，就到「狀態追蹤」欄位新增紀錄。</li>
              <li>5. 要切不同版本或不同專案，直接用上方 BOM 切換器，或進 `BOM管理` 看所有歷史 BOM。</li>
              <li>6. 確認畫面篩選結果沒問題後，再用「匯出結果」下載你目前看到的結果。</li>
            </ol>
          </section>

          <section className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-rose-200">5. 常見錯誤先看這裡</h3>
            <div className="mt-3 space-y-3 leading-6 text-slate-300">
              <p><strong className="text-slate-100">搜不到資料：</strong>先按右上角或表頭的「清除」，很多時候是舊篩選還留著，不是真的沒有資料。</p>
              <p><strong className="text-slate-100">同一個 location 看起來重複：</strong>先回原始 BOM 看是不是同一個位號被展開成多個候選料，或同一顆料被分配到多個位號。</p>
              <p><strong className="text-slate-100">上傳後分組怪怪的：</strong>通常是主料與替代料沒有排在一起、藍色列沒標好，或 Ref Des / Ref Group 本身就不完整。</p>
              <p><strong className="text-slate-100">TX 被清空：</strong>現在空白送出前會跳確認框，若看到提示請確認是不是要故意留白，不要直接略過。</p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BomManagerDialog({
  activeBomId,
  bomWorkspaces,
  open,
  onDelete,
  onOpenChange,
  onSelect,
}: {
  activeBomId: string;
  bomWorkspaces: BomWorkspace[];
  open: boolean;
  onDelete: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}) {
  const [historyQuery, setHistoryQuery] = useState("");
  const totalRecordCount = useMemo(
    () => bomWorkspaces.reduce((sum, workspace) => sum + workspace.payload.recordCount, 0),
    [bomWorkspaces],
  );
  const latestWorkspace = bomWorkspaces[0];
  const filteredWorkspaces = useMemo(() => {
    const keyword = historyQuery.trim().toLowerCase();
    if (!keyword) return bomWorkspaces;

    return bomWorkspaces.filter((workspace) => {
      const haystack = [
        workspace.name,
        workspace.payload.sourceFile,
        workspace.payload.sheetName,
        workspace.id,
      ].join(" ").toLowerCase();

      return haystack.includes(keyword);
    });
  }, [bomWorkspaces, historyQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[1080px] overflow-y-auto border-blue-400/30 bg-[#0d1729] px-6 py-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">BOM 管理</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            查看所有歷史 BOM、最近更新時間、筆數與目前使用中的版本，可直接切換或刪除。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">歷史 BOM</p>
              <p className="mt-2 text-3xl font-black text-cyan-50">{bomWorkspaces.length}</p>
              <p className="mt-1 text-sm leading-6 text-cyan-100/80">目前可切換的 BOM 工作區</p>
            </div>
            <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200/80">總筆數</p>
              <p className="mt-2 text-3xl font-black text-blue-50">{totalRecordCount.toLocaleString()}</p>
              <p className="mt-1 text-sm leading-6 text-blue-100/80">所有歷史 BOM 的料件明細總和</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200/80">目前使用中</p>
              <p className="mt-2 line-clamp-2 break-all text-base font-black leading-6 text-emerald-50">{bomWorkspaces.find((workspace) => workspace.id === activeBomId)?.name ?? "未選擇"}</p>
              <p className="mt-1 text-sm leading-6 text-emerald-100/80">目前畫面正在使用的 BOM</p>
            </div>
            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200/80">最近更新</p>
              <p className="mt-2 line-clamp-1 text-lg font-black leading-7 text-violet-50">{latestWorkspace ? formatRelativeTimestamp(latestWorkspace.updatedAt) : "-"}</p>
              <p className="mt-1 line-clamp-2 break-all text-sm leading-6 text-violet-100/80">{latestWorkspace ? latestWorkspace.name : "沒有可用資料"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-400/15 bg-[#0b1322] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-lg font-black text-slate-50">歷史 BOM 清單</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">依最近更新時間排序，往下可查看舊版本、備援版本與目前正在用的 BOM。</p>
              </div>
              <div className="relative w-full lg:w-[380px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-300" />
                <Input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="搜尋 BOM 名稱、工作表或來源檔名"
                  className="h-10 border-blue-400/20 bg-[#111f36] pl-10 text-[14px] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
          {filteredWorkspaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-blue-400/20 bg-[#10192c] px-6 py-12 text-center">
              <p className="text-lg font-bold text-slate-200">找不到符合條件的歷史 BOM</p>
              <p className="mt-2 text-sm text-slate-500">請改用 BOM 名稱、工作表名稱或來源檔名搜尋。</p>
            </div>
          ) : filteredWorkspaces.map((workspace, index) => {
            const isActive = workspace.id === activeBomId;

            return (
              <div
                key={workspace.id}
                className={cn(
                  "rounded-2xl border px-4 py-4 transition-colors",
                  isActive ? "border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.08)]" : "border-blue-400/15 bg-[#101d33] hover:bg-[#13223b]"
                )}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-black text-blue-100">
                        #{index + 1}
                      </span>
                      <p className="min-w-0 flex-1 line-clamp-2 break-all text-lg font-black leading-6 text-slate-50">{workspace.name}</p>
                      {isActive && (
                        <span className="rounded-full border border-cyan-300/35 bg-cyan-400/15 px-2 py-0.5 text-[11px] font-black text-cyan-100">
                          目前使用中
                        </span>
                      )}
                      {!isActive && index === 0 && (
                        <span className="rounded-full border border-violet-300/35 bg-violet-400/15 px-2 py-0.5 text-[11px] font-black text-violet-100">
                          最近更新
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">來源檔案</p>
                        <p className="mt-1.5 line-clamp-2 break-all text-[13px] font-bold leading-5 text-slate-100">{workspace.payload.sourceFile}</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">工作表</p>
                        <p className="mt-1.5 line-clamp-2 break-all text-[13px] font-bold leading-5 text-slate-100">{workspace.payload.sheetName}</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">料件筆數</p>
                        <p className="mt-1.5 text-[13px] font-bold leading-5 text-slate-100">{workspace.payload.recordCount.toLocaleString()} 筆</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">更新時間</p>
                        <p className="mt-1.5 text-[13px] font-bold leading-5 text-slate-100">{formatRelativeTimestamp(workspace.updatedAt)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">建立時間</p>
                        <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-200">{formatTimestamp(workspace.payload.generatedAt)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">最後更新</p>
                        <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-200">{formatTimestamp(workspace.updatedAt)}</p>
                      </div>
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">BOM ID</p>
                        <p className="mt-1.5 line-clamp-2 break-all font-mono text-[12px] leading-5 text-slate-300">{workspace.id}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 xl:w-[160px] xl:justify-end xl:pl-3">
                    {!isActive && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelect(workspace.id)}
                        className="h-9 border-cyan-400/25 bg-cyan-400/10 px-3 text-[13px] font-bold text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
                      >
                        切換到這個 BOM
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(workspace.id)}
                      className="h-9 border-rose-400/25 bg-rose-400/10 px-3 text-[13px] font-bold text-rose-200 hover:bg-rose-400/20 hover:text-rose-100"
                    >
                      刪除
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MaterialRecordDialog({
  open,
  mode,
  record,
  onOpenChange,
  onModeChange,
  onSave,
}: {
  open: boolean;
  mode: EditorMode;
  record: MaterialWorkbookRecord;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: EditorMode) => void;
  onSave: (record: MaterialWorkbookRecord) => void;
}) {
  const [form, setForm] = useState(record);
  const readOnly = mode === "view";
  const latestTrackingEntry = getLatestTrackingEntry(form);

  useEffect(() => {
    if (open) setForm(toWorkbookRecord(record));
  }, [open, record]);

  const updateField = (field: keyof MaterialWorkbookRecord, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    if (!form.refGroup.trim() || !form.name.trim()) return;
    onSave({ ...form, level: 2 });
  };

  const title = mode === "create" ? "新增料件 / 替代料" : mode === "edit" ? "修改料件資料" : "料件詳細資訊";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="material-record-dialog max-h-[90vh] max-w-5xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">{title}</DialogTitle>
          <DialogDescription className="text-slate-400">
            電路資料決定分組；廠商與 MPN 是展開後的替代料明細。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-4">
            <h3 className="mb-4 text-sm font-bold text-blue-300">電路與原理圖資訊</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="material-ref">Ref Group *</Label>
                <Input id="material-ref" disabled={readOnly} value={form.refGroup} onChange={(event) => updateField("refGroup", event.target.value)} placeholder="例如 CARRIER_RAIL" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-ref-des">REF DES</Label>
                <Input id="material-ref-des" disabled={readOnly} value={form.refDes} onChange={(event) => updateField("refDes", event.target.value)} placeholder="例如 C418、R806" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="material-name">電路料名稱 *</Label>
                <Input id="material-name" disabled={readOnly} value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="例如 CAP CER 0.1UF 16V" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-qty">Qty</Label>
                <Input id="material-qty" disabled={readOnly} value={String(form.qty)} onChange={(event) => updateField("qty", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="material-assembly">模組</Label>
                <Input id="material-assembly" disabled={readOnly} value={form.assemblyName} onChange={(event) => updateField("assemblyName", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-symbol">Symbol</Label>
                <Input id="material-symbol" disabled={readOnly} value={form.schematicPart} onChange={(event) => updateField("schematicPart", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-footprint">Footprint</Label>
                <Input id="material-footprint" disabled={readOnly} value={form.pcbFootprint} onChange={(event) => updateField("pcbFootprint", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-4">
                <Label htmlFor="material-spec">料件規格</Label>
                <Textarea id="material-spec" disabled={readOnly} value={form.partSpec} onChange={(event) => updateField("partSpec", event.target.value)} className="min-h-20" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-400/20 bg-[#101d33] p-4">
            <h3 className="mb-4 text-sm font-bold text-cyan-300">廠商替代料資訊</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="material-maker">廠商</Label>
                <Input id="material-maker" disabled={readOnly} value={form.manufacturer} onChange={(event) => updateField("manufacturer", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-mpn">Manufacturer P/N</Label>
                <Input id="material-mpn" disabled={readOnly} value={form.manufacturerPartNumber} onChange={(event) => updateField("manufacturerPartNumber", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-mpn-2">第二廠商料號</Label>
                <Input id="material-mpn-2" disabled={readOnly} value={form.manufacturerPartNumberAlt} onChange={(event) => updateField("manufacturerPartNumberAlt", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-virtual-alternative">TX</Label>
                <Input id="material-virtual-alternative" disabled={readOnly} value={form.virtualAlternative ?? ""} onChange={(event) => updateField("virtualAlternative", event.target.value)} placeholder="填寫暫用、規劃或追蹤紀錄" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>狀態追蹤</Label>
                <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3">
                  <p className="text-sm font-bold text-sky-200">{latestTrackingEntry?.status || "尚未建立狀態追蹤"}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {latestTrackingEntry?.note || "狀態追蹤改由表格中的「狀態追蹤」欄位管理，可保留歷史紀錄與圖片。"}
                  </p>
                  {latestTrackingEntry?.createdAt && (
                    <p className="mt-2 text-xs text-slate-400">最後更新：{formatTimestamp(latestTrackingEntry.createdAt)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-sourcing">Sourcing Status</Label>
                <Input id="material-sourcing" disabled={readOnly} value={form.sourcingStatus} onChange={(event) => updateField("sourcingStatus", event.target.value)} placeholder="Approved / NRND / Obsolete" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-internal-pn">內部料號</Label>
                <Input id="material-internal-pn" disabled={readOnly} value={form.partNumber} onChange={(event) => updateField("partNumber", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-part-name">內部料名</Label>
                <Input id="material-part-name" disabled={readOnly} value={form.partName} onChange={(event) => updateField("partName", event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-3">
                <Label htmlFor="material-remark">申請狀態 / 備註</Label>
                <Textarea id="material-remark" disabled={readOnly} value={form.remark} onChange={(event) => updateField("remark", event.target.value)} className="min-h-20" placeholder="例如 OK、需申請 00/Part/Symbol" />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          {readOnly ? (
            <Button type="button" onClick={() => onModeChange("edit")} className="bg-blue-600 text-white hover:bg-blue-500">
              <Pencil className="mr-2 h-4 w-4" />修改這筆
            </Button>
          ) : (
            <Button type="button" onClick={handleSave} disabled={!form.refGroup.trim() || !form.name.trim()} className="bg-blue-600 text-white hover:bg-blue-500">
              儲存資料
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlternativeRows({
  group,
  onCopy,
  onView,
  onEdit,
}: {
  group: MaterialGroup;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
}) {
  const alternatives = getSortedAlternatives(group).slice(1);
  const uniqueMpnCount = getUniqueMpnCount(group);
  const allMpns = alternatives
    .map((record) => record.manufacturerPartNumber)
    .filter(Boolean)
    .join("\n");

  return (
    <tr className="border-b border-blue-400/20 bg-[#07111f]">
      <td colSpan={9} className="p-0">
        <div className="border-y border-blue-400/20 bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(7,17,31,0.96))] px-5 py-5 lg:px-7">
          <div className="mb-4 flex flex-col gap-3 border-b border-blue-400/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-50">廠商替代料比較</h3>
                <span className="rounded-full bg-blue-400/15 px-3 py-1 text-sm font-bold text-blue-200">
                  {alternatives.length} 筆資料 / {uniqueMpnCount} 個 MPN
                </span>
                {uniqueMpnCount <= 1 && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
                    單一料・無替代
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
                <span>Symbol：<strong className="font-mono text-cyan-300">{group.schematicPart || "未設定"}</strong></span>
                <span>Footprint：<strong className="font-mono text-indigo-300">{group.footprint || "未設定"}</strong></span>
              </div>
            </div>
            {allMpns && (
              <Button type="button" variant="outline" size="sm" onClick={() => onCopy(allMpns)} className="border-blue-400/25 bg-blue-400/10 text-blue-200 hover:bg-blue-400/20 hover:text-white">
                <Copy className="mr-2 h-4 w-4" />複製全部 MPN
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {alternatives.map((record, index) => {
              const preferred = index === 0;
              const primaryByPartNumber = preferred && isPrimaryInternalPart(record);

              return (
                <article
                  key={record.id}
                  className={cn(
                    "rounded-2xl border p-5 transition-colors",
                    preferred
                      ? "border-emerald-400/35 bg-emerald-400/[0.08] shadow-[inset_4px_0_0_rgba(52,211,153,0.65)]"
                      : "border-blue-400/15 bg-[#0d192b] hover:border-blue-400/30"
                  )}
                >
                  <div className="grid gap-5 xl:grid-cols-[minmax(180px,1fr)_minmax(230px,1.3fr)_minmax(190px,1fr)_minmax(180px,1fr)_minmax(230px,1.15fr)_150px] xl:items-start">
                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">順位 / 廠商</p>
                      <div className="mt-2 flex items-start gap-3">
                        <span className={cn("flex h-9 min-w-9 items-center justify-center rounded-lg font-mono text-base font-black", preferred ? "bg-emerald-400 text-emerald-950" : "bg-slate-700 text-slate-200")}>{index + 1}</span>
                        <div>
                          <p className="text-base font-bold leading-6 text-slate-50">{record.manufacturer || "未填廠商"}</p>
                          {preferred && (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-400/15 px-2.5 py-1 text-sm font-bold text-emerald-300">
                              {primaryByPartNumber ? "尾數 00 / ZZ / ZY 首選" : "優先可用"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-400">Manufacturer P/N</p>
                      {record.manufacturerPartNumber ? (
                        <button type="button" onClick={() => onCopy(record.manufacturerPartNumber)} className="group mt-2 flex max-w-full items-start gap-2 rounded-lg border border-blue-400/25 bg-blue-400/10 px-3 py-3 text-left hover:bg-blue-400/20" title="複製 MPN">
                          <span className="break-all font-mono text-base font-black leading-6 text-blue-200">{record.manufacturerPartNumber}</span>
                          <Copy className="mt-0.5 h-4 w-4 flex-none text-blue-300 opacity-80 group-hover:opacity-100" />
                        </button>
                      ) : (
                        <p className="mt-2 text-base font-semibold text-amber-300">未填 MPN</p>
                      )}
                      {record.manufacturerPartNumberAlt && <p className="mt-2 break-all font-mono text-[15px] text-slate-400">第二料號：{record.manufacturerPartNumberAlt}</p>}
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">內部料號</p>
                      {record.partNumber ? (
                        <button type="button" onClick={() => onCopy(record.partNumber)} className="group mt-2 flex max-w-full items-start gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-3 text-left hover:bg-cyan-300/20" title="複製內部料號">
                          <span className="break-all font-mono text-base font-black leading-6 text-cyan-200">{record.partNumber}</span>
                          <Copy className="mt-0.5 h-4 w-4 flex-none text-cyan-300 opacity-80 group-hover:opacity-100" />
                        </button>
                      ) : (
                        <p className="mt-2 text-base font-bold text-amber-300">尚未建立</p>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">狀態</p>
                      <div className="mt-2 flex flex-col items-start gap-2">
                        <StatusPill record={record} />
                        <ActionPill record={record} />
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">規格 / 備註</p>
                      <p className="mt-2 text-base leading-7 text-slate-200">{record.partSpec || record.partName || "-"}</p>
                      {record.remark && <p className="mt-1 text-[15px] leading-6 text-slate-400">{record.remark}</p>}
                    </div>

                    <div>
                      <p className="text-center text-sm font-bold uppercase tracking-[0.16em] text-slate-500">資料更新</p>
                      <div className="mt-2 grid gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => onView(record)} className="h-10 w-full justify-center border-cyan-400/25 bg-cyan-400/10 text-sm text-cyan-200 hover:bg-cyan-400/20 hover:text-white">
                          <Eye className="mr-1.5 h-4 w-4" />詳細
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(record)} className="h-10 w-full justify-center border-blue-400/25 bg-blue-400/10 text-sm text-blue-200 hover:bg-blue-400/20 hover:text-white">
                          <Pencil className="mr-1.5 h-4 w-4" />修改
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

function CompactAlternativeRows({
  group,
  records,
  primaryRecord,
  onCopy,
  onView,
  onEdit,
  onSaveVirtual,
  onOpenTracking,
}: {
  group: MaterialGroup;
  records: MaterialRecord[];
  primaryRecord: MaterialRecord;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
  onSaveVirtual: (record: MaterialRecord, value: string) => void;
  onOpenTracking: (record: MaterialRecord) => void;
}) {
  const alternatives = records.filter((record) => record.id !== primaryRecord.id);
  const groupRefDes = primaryRecord.refDes || primaryRecord.refGroup || "-";

  return (
    <>
      {alternatives.map((record, index) => {
        const preferred = record.isPreferred;

        return (
          <tr
            key={record.id}
            className={cn(
              "border-b border-blue-400/10 text-slate-200",
              preferred
                ? "bg-emerald-400/[0.09] shadow-[inset_4px_0_0_rgba(52,211,153,0.75)]"
                : index % 2 === 0
                  ? "bg-[#0a1526] hover:bg-blue-400/[0.07]"
                  : "bg-[#0c182a] hover:bg-blue-400/[0.07]"
            )}
          >
            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <div className="flex items-center gap-3 pl-8">
                <span className={cn("flex h-8 min-w-8 items-center justify-center rounded-lg font-mono text-sm font-black", preferred ? "bg-emerald-400 text-emerald-950" : "bg-slate-700 text-slate-200")}>{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-bold text-slate-50">{record.manufacturer || "未填廠商"}</p>
                    {preferred && (
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                        可用替代・OK + 00
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 text-xs", preferred ? "text-emerald-300" : "text-slate-400")}>替代料 #{index + 1}</p>
                </div>
              </div>
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <button type="button" onClick={() => groupRefDes !== "-" && onCopy(groupRefDes)} className="group flex max-w-full items-center gap-2 text-left" title="複製 REF DES">
                <span className="break-all font-mono text-base font-black text-sky-200 group-hover:text-sky-100">{groupRefDes}</span>
                {groupRefDes !== "-" && <Copy className="h-4 w-4 flex-none text-sky-400 opacity-75 group-hover:opacity-100" />}
              </button>
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              {record.manufacturerPartNumber ? (
                <button type="button" onClick={() => onCopy(record.manufacturerPartNumber)} className="group flex max-w-full items-center gap-2 text-left" title="複製 MPN">
                  <span className="break-all font-mono text-[15px] font-black text-blue-200 group-hover:text-blue-100">{record.manufacturerPartNumber}</span>
                  <Copy className="h-4 w-4 flex-none text-blue-400 opacity-75 group-hover:opacity-100" />
                </button>
              ) : (
                <span className="text-sm font-bold text-amber-300">未填 MPN</span>
              )}
              {record.manufacturerPartNumberAlt && <p className="mt-1 break-all font-mono text-sm text-slate-500">Alt: {record.manufacturerPartNumberAlt}</p>}
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              {record.partNumber ? (
                <button type="button" onClick={() => onCopy(record.partNumber)} className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-left hover:bg-cyan-300/20" title="複製內部料號">
                  <span className="break-all font-mono text-[15px] font-black text-cyan-200">{record.partNumber}</span>
                  <Copy className="h-4 w-4 flex-none text-cyan-300 opacity-80 group-hover:opacity-100" />
                </button>
              ) : (
                <span className="text-sm font-bold text-amber-300">尚未建立</span>
              )}
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <InlineVirtualAlternativeEditor value={record.virtualAlternative ?? ""} onSave={(value) => onSaveVirtual(record, value)} />
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill record={record} />
                <ActionPill record={record} />
              </div>
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <p className="line-clamp-2 text-[15px] leading-6 text-slate-200">{record.partSpec || record.partName || "-"}</p>
              {record.remark && <p className="mt-1 text-sm text-slate-500">{record.remark}</p>}
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
              <TrackingHistoryCell record={record} onOpen={onOpenTracking} />
            </td>

            <td className="px-3 py-3.5">
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => onView(record)} className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 p-2 text-cyan-300 hover:bg-cyan-400/20" title="詳細資訊">
                  <Eye className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => onEdit(record)} className="rounded-lg border border-blue-400/25 bg-blue-400/10 p-2 text-blue-300 hover:bg-blue-400/20" title="修改">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function MaterialRequestPage() {
  const [bomWorkspaces, setBomWorkspaces] = useState<BomWorkspace[]>(() => [createDefaultBomWorkspace()]);
  const [bomStorageMode, setBomStorageMode] = useState<BomStorageMode>("recovery");
  const [activeBomId, setActiveBomId] = useState(loadActiveBomId);
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<MaterialColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [columnTextFilters, setColumnTextFilters] = useState<MaterialColumnTextFilters>(EMPTY_COLUMN_TEXT_FILTERS);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const [isImporting, setIsImporting] = useState(false);
  const [bomManagerOpen, setBomManagerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [editorRecord, setEditorRecord] = useState<MaterialWorkbookRecord>(createRecordTemplate());
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackingRecord, setTrackingRecord] = useState<MaterialRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceSyncRequestRef = useRef(0);
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();
  const isCollaborativeReady = bomStorageMode === "remote";

  const activeWorkspace = bomWorkspaces.find((workspace) => workspace.id === activeBomId) ?? bomWorkspaces[0];
  const basePayload = activeWorkspace.payload;

  const dataset = useMemo<MaterialDataset>(
    () => buildMaterialDataset(basePayload),
    [basePayload]
  );

  const applyLoadedWorkspaces = useCallback((storedWorkspaces: BomWorkspace[], preferredBomId?: string) => {
    if (storedWorkspaces.length === 0) {
      const fallbackWorkspace = createDefaultBomWorkspace();
      setBomWorkspaces([fallbackWorkspace]);
      setActiveBomId(fallbackWorkspace.id);
      void saveBomWorkspace(fallbackWorkspace).catch(() => undefined);
      return;
    }

    setBomWorkspaces(storedWorkspaces);
    setActiveBomId((current) => {
      const candidateBomId = preferredBomId ?? current ?? loadActiveBomId();
      return storedWorkspaces.some((workspace) => workspace.id === candidateBomId)
        ? candidateBomId
        : storedWorkspaces[0].id;
    });
  }, []);

  const reloadBomWorkspaces = useCallback(async (preferredBomId?: string) => {
    const requestId = ++workspaceSyncRequestRef.current;
    const result = await loadBomWorkspacesDetailed();
    if (requestId !== workspaceSyncRequestRef.current) {
      return result.workspaces;
    }

    setBomStorageMode(result.mode);
    applyLoadedWorkspaces(result.workspaces, preferredBomId);
    return result.workspaces;
  }, [applyLoadedWorkspaces]);

  useEffect(() => {
    let active = true;
    const syncWorkspaces = async (preferredBomId?: string) => {
      const requestId = ++workspaceSyncRequestRef.current;
      try {
        const result = await loadBomWorkspacesDetailed();
        if (!active || requestId !== workspaceSyncRequestRef.current) return;
        setBomStorageMode(result.mode);
        applyLoadedWorkspaces(result.workspaces, preferredBomId);
      } catch {
        // Keep the current local state when collaborative sync is temporarily unavailable.
      }
    };

    void syncWorkspaces(loadActiveBomId());
    const unsubscribe = subscribeBomWorkspaceChanges(() => {
      void syncWorkspaces();
    });
    const pollId = window.setInterval(() => {
      void syncWorkspaces();
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, [applyLoadedWorkspaces]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_BOM_KEY, activeBomId);
  }, [activeBomId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    } catch {
      // Column resizing still works for the current session without browser storage.
    }
  }, [columnWidths]);

  const resizeColumn = (index: number, width: number) => {
    setColumnWidths((current) => {
      const adjacentIndex = index + 1;
      if (adjacentIndex >= current.length) return current;

      const requestedDelta = width - current[index];
      const adjacentWidth = Math.min(
        MAX_COLUMN_WIDTHS[adjacentIndex],
        Math.max(MIN_COLUMN_WIDTHS[adjacentIndex], current[adjacentIndex] - requestedDelta)
      );
      const appliedDelta = current[adjacentIndex] - adjacentWidth;
      const next = [...current];
      next[index] = current[index] + appliedDelta;
      next[adjacentIndex] = adjacentWidth;
      return next;
    });
  };

  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);

  const replaceBomWorkspace = (workspace: BomWorkspace) => {
    setBomWorkspaces((current) => {
      const exists = current.some((item) => item.id === workspace.id);
      return exists
        ? current.map((item) => item.id === workspace.id ? workspace : item)
        : [...current, workspace];
    });
  };

  const orderedBomWorkspaces = useMemo(
    () => [...bomWorkspaces].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [bomWorkspaces]
  );

  const searchTokens = useMemo(() => parseSearchTokens(deferredQuery), [deferredQuery]);

  const matchesSearch = (group: MaterialGroup) => {
    const noAlternative = hasNoAlternative(group);
    const mustApply = requiresApplication(group);
    const alternativeSearchText = noAlternative
      ? "單一料 無替代料 單一來源 single source no alternative"
      : "有替代料 multiple source alternative";
    const applicationSearchText = mustApply
      ? "完全無料 主料與替代都無料 待申請料 必須申請 must apply no usable material"
      : "至少一顆可用料 有可用替代 remark ok 尾數 00 或 zz 或 zy usable material";
    const searchableText = `${group.searchText} ${alternativeSearchText} ${applicationSearchText}`;
    const exactRefTokens = new Set(
      [
        group.displayRef,
        ...group.records.flatMap((record) => [record.refDes, record.refGroup]),
      ]
        .flatMap((value) => splitRefDesignators(value))
        .map((value) => value.toLowerCase())
    );

    return searchTokens.every((token) => {
      if (isExactRefDesToken(token)) {
        return exactRefTokens.has(token);
      }

      return searchableText.includes(token);
    });
  };

  const matchesAvailability = (group: MaterialGroup) => {
    const noAlternative = hasNoAlternative(group);
    const mustApply = requiresApplication(group);

    return (
      availability === "all" ||
      (availability === "usable" && !mustApply) ||
      (availability === "required" && mustApply) ||
      (availability === "pending" && group.pendingCount > 0) ||
      (availability === "risk" && group.riskCount > 0) ||
      (availability === "single" && noAlternative)
    );
  };

  const getMatchingRecords = (group: MaterialGroup, ignoredKey?: ColumnFilterKey) =>
    getSortedAlternatives(group).filter((record) =>
      matchesRecordColumnFilters(record, group, columnFilters, columnTextFilters, ignoredKey)
    );

  const columnFilterOptions = useMemo(() => {
    const keys = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];

    return keys.reduce((result, key) => {
      const valueGroups = dataset.groups
        .filter((group) => matchesSearch(group) && matchesAvailability(group))
        .flatMap((group) => getMatchingRecords(group, key).map((record) => getRecordColumnValues(record, group, key)));

      result[key] = key === "trackingStatus"
        ? buildTrackingStatusFilterOptions(valueGroups)
        : buildExcelFilterOptions(valueGroups);
      return result;
    }, {} as Record<ColumnFilterKey, ExcelFilterOption[]>);
  }, [columnFilters, columnTextFilters, dataset.groups, matchesAvailability, matchesSearch]);

  useEffect(() => {
    setColumnFilters((current) => {
      const keys = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];
      let changed = false;
      const next = { ...current };

      keys.forEach((key) => {
        const normalized = normalizeColumnFilterSelection(current[key], columnFilterOptions[key]);
        if (normalized !== current[key]) {
          next[key] = normalized;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [columnFilterOptions]);

  const filteredGroups = useMemo(() => {
    const result = dataset.groups.filter((group) => {
      return matchesSearch(group) && getMatchingRecords(group).length > 0 && matchesAvailability(group);
    });

    return [...result].sort((left, right) => {
      if (sortMode === "single-source" && hasNoAlternative(left) !== hasNoAlternative(right)) {
        return hasNoAlternative(left) ? -1 : 1;
      }
      if (sortMode === "alternatives" && getUniqueMpnCount(left) !== getUniqueMpnCount(right)) {
        return getUniqueMpnCount(right) - getUniqueMpnCount(left);
      }
      if (sortMode === "approved" && left.approvedCount !== right.approvedCount) {
        return right.approvedCount - left.approvedCount;
      }
      if (sortMode === "pending" && left.pendingCount !== right.pendingCount) {
        return right.pendingCount - left.pendingCount;
      }
      return left.displayRef.localeCompare(right.displayRef, undefined, { numeric: true });
    });
  }, [columnFilters, columnTextFilters, dataset.groups, matchesAvailability, matchesSearch, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const noAlternativeCount = useMemo(
    () => dataset.groups.filter(hasNoAlternative).length,
    [dataset.groups]
  );
  const usableGroupCount = useMemo(
    () => dataset.groups.filter((group) => !requiresApplication(group)).length,
    [dataset.groups]
  );
  const requiredApplicationCount = useMemo(
    () => dataset.groups.filter(requiresApplication).length,
    [dataset.groups]
  );
  const pendingGroupCount = useMemo(
    () => dataset.groups.filter((group) => group.pendingCount > 0).length,
    [dataset.groups]
  );
  const riskGroupCount = useMemo(
    () => dataset.groups.filter((group) => group.riskCount > 0).length,
    [dataset.groups]
  );
  const visibleGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize]);

  const visibleGroupRows = useMemo(
    () => visibleGroups.map((group) => {
      const matchingRecords = getMatchingRecords(group);
      const primaryAlternative = matchingRecords[0] ?? group.primaryRecord;
      const secondaryAlternatives = matchingRecords.slice(primaryAlternative ? 1 : 0);

      return {
        group,
        matchingRecords,
        primaryAlternative,
        secondaryAlternatives,
        uniqueMpnCount: getUniqueMpnCountForRecords(matchingRecords),
      };
    }),
    [visibleGroups, columnFilters, columnTextFilters],
  );

  useEffect(() => {
    setPage(1);
  }, [availability, columnFilters, columnTextFilters, deferredQuery, pageSize, sortMode]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (searchTokens.length > 0 && filteredGroups.length === 1) {
      setExpandedKey(filteredGroups[0].key);
    }
  }, [filteredGroups, searchTokens.length]);

  const toggleExpanded = (key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "已複製廠商料號", description: value });
    } catch {
      toast({ title: "無法複製", description: "請手動選取料號。", variant: "destructive" });
    }
  };

  const showCollaborativeUnavailableToast = () => {
    toast({
      title: "多人同步未啟用",
      description: "目前 BOM 共享資料表未連線，已切換成唯讀恢復模式。請先完成 Supabase migration 後再編輯。",
      variant: "destructive",
    });
  };

  const handleWorkbookImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (!isCollaborativeReady) {
      event.target.value = "";
      showCollaborativeUnavailableToast();
      return;
    }

    setIsImporting(true);
    try {
      let lastWorkspaceId = activeBomId;
      let totalRecords = 0;
      const workspaceMap = new Map(bomWorkspaces.map((workspace) => [workspace.id, workspace]));

      for (const file of files) {
        const payload = await parseMaterialWorkbookFile(file);
        const workspaceId = createBomId(file.name, payload);
        const existingWorkspace = workspaceMap.get(workspaceId);
        const workspace = mergeImportedWorkspace(existingWorkspace, workspaceId, payload);
        await saveBomWorkspace(workspace);
        replaceBomWorkspace(workspace);
        workspaceMap.set(workspaceId, workspace);
        lastWorkspaceId = workspace.id;
        totalRecords += workspace.payload.recordCount;
      }

      await reloadBomWorkspaces(lastWorkspaceId);
      setActiveBomId(lastWorkspaceId);
      setExpandedKey(null);
      setPage(1);
      toast({
        title: files.length === 1 ? "BOM 已載入" : `${files.length} 個 BOM 已載入`,
        description: `共 ${totalRecords.toLocaleString()} 筆廠商料明細，可從 BOM 切換器管理。`,
      });
    } catch (error) {
      toast({
        title: "Excel 讀取失敗",
        description: error instanceof Error ? error.message : "請確認欄位格式。",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  };

  const openCreate = (group?: MaterialGroup) => {
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    setEditorRecord(createRecordTemplate(group));
    setEditorMode("create");
    setEditorOpen(true);
  };

  const openRecord = (record: MaterialRecord, mode: EditorMode) => {
    if (mode !== "view" && !isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    setEditorRecord(toWorkbookRecord(record));
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const openTrackingDialog = (record: MaterialRecord) => {
    setTrackingRecord(record);
    setTrackingDialogOpen(true);
  };

  const saveRecordToActiveBom = (record: MaterialWorkbookRecord) => {
    if (!isCollaborativeReady) {
      return Promise.reject(new Error("Collaborative BOM storage unavailable"));
    }

    const exists = basePayload.records.some((item) => item.id === record.id);
    const records = exists
      ? basePayload.records.map((item) => item.id === record.id ? record : item)
      : [...basePayload.records, record];
    const nextWorkspace: BomWorkspace = {
      ...activeWorkspace,
      payload: { ...basePayload, records, recordCount: records.length },
      updatedAt: new Date().toISOString(),
    };
    replaceBomWorkspace(nextWorkspace);

    return saveBomWorkspaceRecord(nextWorkspace, record).catch(async (error) => {
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      throw error;
    });
  };

  const handleSaveRecord = async (record: MaterialWorkbookRecord) => {
    try {
      await saveRecordToActiveBom(record);
      setEditorOpen(false);
      toast({
        title: editorMode === "create" ? "料件已新增" : "料件已更新",
        description: `${record.manufacturer || "未指定廠商"} ${record.manufacturerPartNumber || record.name}`,
      });
    } catch {
      toast({
        title: "同步更新失敗",
        description: "這筆料件還沒寫進共用資料，請稍後再試一次。",
        variant: "destructive",
      });
    }
  };

  const saveVirtualAlternative = (record: MaterialRecord, value: string) => {
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    void saveRecordToActiveBom({ ...toWorkbookRecord(record), virtualAlternative: value }).catch(() => {
      toast({
        title: "資料更新失敗",
        description: "TX 尚未同步到共用資料，已重新載入最新版本。",
        variant: "destructive",
      });
    });
  };

  const saveTrackingHistory = (record: MaterialRecord, entry: MaterialTrackingHistoryEntry) => {
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    const currentHistory = record.trackingHistory ?? [];
    void saveRecordToActiveBom({
      ...toWorkbookRecord(record),
      trackingStatus: entry.status,
      trackingHistory: [...currentHistory, entry],
    }).then(() => {
      toast({
        title: "狀態追蹤已更新",
        description: `${record.name || record.displayRef} · ${entry.status}`,
      });
    }).catch(() => {
      toast({
        title: "狀態追蹤更新失敗",
        description: "這筆追蹤還沒同步到共用資料，已重新載入最新版本。",
        variant: "destructive",
      });
    });
  };

  const switchActiveBom = (value: string) => {
    setActiveBomId(value);
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setColumnTextFilters(EMPTY_COLUMN_TEXT_FILTERS);
    setAvailability("all");
    setExpandedKey(null);
    setPage(1);
  };

  const applyAvailabilityFilter = (nextAvailability: AvailabilityFilter) => {
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setColumnTextFilters(EMPTY_COLUMN_TEXT_FILTERS);
    setAvailability((current) => current === nextAvailability ? "all" : nextAvailability);
    setExpandedKey(null);
    setPage(1);
  };

  const deleteBomWorkspaceById = async (targetBomId: string) => {
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    const targetWorkspace = bomWorkspaces.find((workspace) => workspace.id === targetBomId);
    if (!targetWorkspace || !window.confirm(`確定刪除 BOM「${targetWorkspace.name}」？`)) return;

    const remaining = bomWorkspaces.filter((workspace) => workspace.id !== targetBomId);
    const fallbackWorkspace = createDefaultBomWorkspace();
    const nextWorkspaces = remaining.length > 0 ? remaining : [fallbackWorkspace];

    setBomWorkspaces(nextWorkspaces);
    if (activeBomId === targetBomId) {
      switchActiveBom(nextWorkspaces[0].id);
    }

    try {
      await removeBomWorkspace(targetBomId);
      if (remaining.length === 0) {
        await saveBomWorkspace(fallbackWorkspace);
      }
      await reloadBomWorkspaces(nextWorkspaces[0].id);
      toast({
        title: "BOM 已刪除",
        description: remaining.length === 0 ? "已自動建立新的預設備援 BOM。" : `剩餘 ${remaining.length} 個 BOM。`,
      });
    } catch {
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({
        title: "刪除 BOM 失敗",
        description: "請重新整理後再試一次。",
        variant: "destructive",
      });
    }
  };

  const deleteActiveBom = async () => {
    await deleteBomWorkspaceById(activeBomId);
  };

  const handleExport = () => {
    const rows = filteredGroups.flatMap((group) =>
      getMatchingRecords(group)
        .map((record) => ({
          Ref_Group: group.displayRef,
          REF_DES: record.refDes || group.primaryRecord.refDes,
        電路料名稱: group.name,
        模組: group.assemblyName,
        Qty: group.qty,
        Symbol: group.schematicPart,
        Footprint: group.footprint,
        廠商: record.manufacturer,
        Manufacturer_PN: record.manufacturerPartNumber,
        Manufacturer_PN_2: record.manufacturerPartNumberAlt,
        TX: record.virtualAlternative ?? "",
        狀態追蹤: record.trackingStatus ?? "",
        Sourcing_Status: record.sourcingStatus,
        建料狀態: getActionLabel(record.actionKind),
        內部料號: record.partNumber,
        規格: record.partSpec,
      }))
    );

    if (!rows.length) {
      toast({ title: "沒有可匯出的資料", variant: "destructive" });
      return;
    }

    exportToCsv(rows, `material-alternatives-${new Date().toISOString().slice(0, 10)}.csv`);
    toast({ title: "CSV 已下載", description: `共匯出 ${rows.length.toLocaleString()} 筆替代料。` });
  };

  const clearFilters = () => {
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setColumnTextFilters(EMPTY_COLUMN_TEXT_FILTERS);
    setAvailability("all");
    setSortMode("reference");
    setExpandedKey(null);
  };

  return (
    <div className="material-sheet-theme min-h-full bg-[#07101f] p-4 text-slate-100 sm:p-5 lg:p-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleWorkbookImport} />

      <UploadGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <BomManagerDialog activeBomId={activeBomId} bomWorkspaces={orderedBomWorkspaces} open={bomManagerOpen} onDelete={(id) => void deleteBomWorkspaceById(id)} onOpenChange={setBomManagerOpen} onSelect={(id) => { switchActiveBom(id); setBomManagerOpen(false); }} />
      <MaterialRecordDialog open={editorOpen} mode={editorMode} record={editorRecord} onOpenChange={setEditorOpen} onModeChange={setEditorMode} onSave={handleSaveRecord} />
      <TrackingHistoryDialog open={trackingDialogOpen} record={trackingRecord} onOpenChange={(open) => { setTrackingDialogOpen(open); if (!open) setTrackingRecord(null); }} onSave={saveTrackingHistory} />

      <header className="rounded-xl border border-blue-400/20 bg-[#101b2f] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded bg-blue-600 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-50">料號總表</h1>
              <p className="mt-0.5 text-sm text-slate-400">一行一個主料，點箭頭查看其他替代料。</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setGuideOpen(true)} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white">
              <CircleHelp className="mr-2 h-4 w-4" />上傳說明
            </Button>
            <Button type="button" onClick={() => openCreate()} disabled={!isCollaborativeReady} className="h-9 bg-cyan-500 px-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
              <Plus className="mr-2 h-4 w-4" />新增料件
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting || !isCollaborativeReady} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-500">
              <Upload className="mr-2 h-4 w-4" />{isImporting ? "讀取中..." : "上傳 BOM"}
            </Button>
            <Button type="button" variant="outline" onClick={handleExport} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white">
              <Download className="mr-2 h-4 w-4" />匯出結果
            </Button>
          </div>
        </div>

        {!isCollaborativeReady && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            目前是唯讀恢復模式，還不是多人同步。請先把 Supabase migration `20260702094500_4a79e28e-90e1-48d2-9487-f78e49b0d90a.sql` 套到正式資料庫。
          </div>
        )}

        <div className="mt-3 flex flex-col gap-3 border-t border-blue-400/15 pt-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <span className="inline-flex h-10 items-center text-sm font-bold text-slate-300">切換 BOM</span>
            <Select value={activeBomId} onValueChange={switchActiveBom}>
              <SelectTrigger className="h-10 w-full max-w-[38rem] flex-1 items-center border-cyan-400/30 bg-[#0a1527] px-4 py-0 text-cyan-100 sm:min-w-[24rem] sm:flex-[1_1_28rem]">
                <div className="flex min-w-0 items-center text-left">
                  <span className="block max-w-full truncate text-[14px] font-semibold leading-5 text-cyan-100">
                    {activeWorkspace.name}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">
                {orderedBomWorkspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    <div className="flex max-w-[30rem] flex-col py-1 text-left">
                      <span className="line-clamp-2 break-all font-semibold leading-5 text-slate-100">{workspace.name}</span>
                      <span className="mt-1 text-xs leading-5 text-slate-400">{workspace.payload.recordCount.toLocaleString()} 筆 · 更新 {formatTimestamp(workspace.updatedAt)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="inline-flex h-10 items-center rounded-md bg-blue-400/10 px-3 text-sm font-bold text-blue-200">{bomWorkspaces.length} 個 BOM</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setBomManagerOpen(true)} disabled={!isCollaborativeReady} className="h-10 border-blue-400/20 bg-blue-400/10 px-3 text-sm font-bold text-slate-200 hover:bg-blue-400/20 hover:text-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500">
              <Layers3 className="mr-2 h-4 w-4" />BOM管理
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{activeWorkspace.payload.sheetName} · {formatTimestamp(activeWorkspace.updatedAt)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void deleteActiveBom()} disabled={!isCollaborativeReady} className="h-10 border-rose-400/25 bg-rose-400/10 px-3 text-sm font-bold text-rose-200 hover:bg-rose-400/20 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500">刪除目前 BOM</Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-blue-400/15 pt-3 text-sm">
          <button type="button" onClick={clearFilters} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "all" ? "border-blue-300/50 bg-blue-400/20 text-blue-100" : "border-blue-300/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20 hover:text-blue-100")}>主料總數 <strong className="ml-1">{dataset.stats.totalGroups.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("required")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "required" ? "border-amber-300/60 bg-amber-400/25 text-amber-100" : "border-amber-300/35 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 hover:text-amber-100")}>主料與替代都無料 <strong className="ml-1">{requiredApplicationCount.toLocaleString()}</strong></button>
          <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 font-bold text-cyan-200">廠商料明細 <strong className="ml-1">{dataset.stats.totalRecords.toLocaleString()}</strong></span>
        </div>
      </header>

      <section className="mt-3 rounded-xl border border-blue-400/15 bg-[#0d182b] p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(390px,1fr)_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料名、REF DES、MPN、內部料號、狀態追蹤；也可輸入『完全無料』" className="h-10 border-blue-400/30 bg-[#111f36] pl-12 text-[15px] text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500" />
          </div>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-10 border-blue-400/20 bg-[#111f36] text-sm text-slate-200">
              <SelectValue>{SORT_MODE_LABELS[sortMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="reference">{SORT_MODE_LABELS.reference}</SelectItem>
              <SelectItem value="single-source">{SORT_MODE_LABELS["single-source"]}</SelectItem>
              <SelectItem value="alternatives">{SORT_MODE_LABELS.alternatives}</SelectItem>
              <SelectItem value="approved">{SORT_MODE_LABELS.approved}</SelectItem>
              <SelectItem value="pending">{SORT_MODE_LABELS.pending}</SelectItem>
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" onClick={clearFilters} className="h-10 border-blue-400/20 bg-[#111f36] px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white"><RotateCcw className="mr-2 h-4 w-4" />清除</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <p>顯示 <strong className="text-blue-300">{filteredGroups.length.toLocaleString()}</strong> / {dataset.stats.totalGroups.toLocaleString()} 個主料。</p>
          <p>{dataset.meta.sourceFile} · {dataset.meta.sheetName} · {formatTimestamp(dataset.meta.generatedAt)}</p>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-xl border border-blue-400/15 bg-[#0b1527]">
        <div className="flex items-center justify-between border-b border-blue-400/15 bg-[#101d33] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">料號總表</h2>
            <p className="mt-0.5 text-sm text-slate-500">展開後才顯示替代料；拖曳表頭右邊緣可調整欄寬。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setColumnWidths([...DEFAULT_COLUMN_WIDTHS])} className="border-blue-400/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20">重設欄寬</Button>
            {expandedKey && <Button type="button" variant="outline" size="sm" onClick={() => setExpandedKey(null)} className="border-blue-400/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20">收合目前料件</Button>}
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="table-fixed border-collapse text-[15px]" style={{ width: `max(100%, ${tableWidth}px)`, minWidth: tableWidth }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#244b96] text-left text-[15px] font-bold text-white shadow-sm">
                {[
                  "主料 / 廠商",
                  "REF DES",
                  "MPN",
                  "內部料號 / 圖面",
                  "TX",
                  "狀態",
                  "規格 / 備註",
                  "狀態追蹤",
                  "資料更新",
                ].map((label, columnIndex) => (
                  <ResizableHeader
                    key={label}
                    width={columnWidths[columnIndex]}
                    minWidth={MIN_COLUMN_WIDTHS[columnIndex]}
                    maxWidth={MAX_COLUMN_WIDTHS[columnIndex]}
                    resizable={columnIndex < 8}
                    onResize={(width) => resizeColumn(columnIndex, width)}
                    className={columnIndex === 8 ? "border-r-0 text-center" : undefined}
                  >
                    {label}
                  </ResizableHeader>
                ))}
              </tr>
              <tr className="bg-[#102b57] text-slate-100">
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="料件" options={columnFilterOptions.material} selectedValues={columnFilters.material} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, material: values }))} textFilterValue={columnTextFilters.material} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, material: value }))} searchPlaceholder="搜尋料名 / 廠商" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="REF DES" options={columnFilterOptions.refDes} selectedValues={columnFilters.refDes} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, refDes: values }))} textFilterValue={columnTextFilters.refDes} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, refDes: value }))} searchPlaceholder="搜尋 REF DES" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="MPN" options={columnFilterOptions.mpn} selectedValues={columnFilters.mpn} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, mpn: values }))} textFilterValue={columnTextFilters.mpn} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, mpn: value }))} searchPlaceholder="搜尋 MPN" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="內部料號" options={columnFilterOptions.internal} selectedValues={columnFilters.internal} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, internal: values }))} textFilterValue={columnTextFilters.internal} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, internal: value }))} searchPlaceholder="搜尋料號 / Symbol / Footprint" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="TX" options={columnFilterOptions.virtualAlternative} selectedValues={columnFilters.virtualAlternative} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, virtualAlternative: values }))} textFilterValue={columnTextFilters.virtualAlternative} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, virtualAlternative: value }))} searchPlaceholder="搜尋 TX" /></th>
                <th className="border-r border-blue-300/20 p-2">
                  <div className="flex h-8 items-center justify-center rounded border border-blue-300/20 bg-[#07182d] px-2 text-xs font-bold text-slate-400">
                    狀態摘要
                  </div>
                </th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="規格" options={columnFilterOptions.specification} selectedValues={columnFilters.specification} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, specification: values }))} textFilterValue={columnTextFilters.specification} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, specification: value }))} searchPlaceholder="搜尋規格 / 備註" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="狀態追蹤" options={columnFilterOptions.trackingStatus} selectedValues={columnFilters.trackingStatus} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, trackingStatus: values }))} textFilterValue={columnTextFilters.trackingStatus} onTextFilterValueChange={(value) => setColumnTextFilters((current) => ({ ...current, trackingStatus: value }))} searchPlaceholder="搜尋追蹤狀態 / 備註 / 更新人" /></th>
                <th className="p-2 text-center"><button type="button" onClick={clearFilters} className="h-8 rounded border border-blue-300/25 bg-blue-400/10 px-2 text-xs font-bold text-blue-100 hover:bg-blue-400/20">清除</button></th>
              </tr>
            </thead>
              {visibleGroupRows.map(({ group, matchingRecords, primaryAlternative, secondaryAlternatives, uniqueMpnCount }) => {
                const expanded = expandedKey === group.key;
                const mustApply = group.requiresApplication;
                const noAlternative = uniqueMpnCount <= 1;
                const primaryReady = Boolean(primaryAlternative?.isPreferred);
                const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred).length;
                const groupRefDes = primaryAlternative?.refDes || group.primaryRecord.refDes || group.primaryRecord.refGroup || "-";

                return (
                  <tbody key={group.key}>
                    <tr onClick={() => secondaryAlternatives.length > 0 && toggleExpanded(group.key)} className={cn("border-b border-l-4 border-blue-400/15 text-slate-200 transition-colors", secondaryAlternatives.length > 0 ? "cursor-pointer" : "cursor-default", mustApply ? "border-l-amber-400 bg-amber-400/[0.13] hover:bg-amber-400/[0.18]" : primaryReady ? "border-l-emerald-400 bg-emerald-400/[0.08] hover:bg-emerald-400/[0.13]" : "border-l-cyan-400 bg-cyan-400/[0.09] hover:bg-cyan-400/[0.14]") }>
                      <td className="border-r border-blue-400/10 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded border", secondaryAlternatives.length > 0 ? expanded ? "border-blue-300/40 bg-blue-400/20 text-blue-200" : "border-blue-400/20 bg-blue-400/10 text-blue-300" : "border-slate-600/30 bg-slate-700/20 text-slate-600")}>{secondaryAlternatives.length > 0 ? expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <span className="text-sm">—</span>}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-bold text-blue-300">{group.displayRef}</span>
                              {noAlternative ? (
                                <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs font-bold text-orange-300">單一料・無替代</span>
                              ) : (
                                <span className="rounded bg-blue-400/10 px-2 py-0.5 text-xs font-semibold text-blue-200">{uniqueMpnCount} 個 MPN</span>
                              )}
                            </div>
                            <p className="mt-1.5 text-base font-bold leading-6 text-slate-50">{group.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{group.assemblyName || "未指定模組"} · Qty {group.qty}</p>
                          </div>
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => groupRefDes !== "-" && handleCopy(groupRefDes)} className="group flex max-w-full items-center gap-2 text-left" title="複製 REF DES">
                          <span className="break-all font-mono text-base font-black text-sky-200 group-hover:text-sky-100">{groupRefDes}</span>
                          {groupRefDes !== "-" && <Copy className="h-4 w-4 flex-none text-sky-400 opacity-80 group-hover:opacity-100" />}
                        </button>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle">
                        <div>
                          {primaryAlternative ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                const value = getDisplayMpn(primaryAlternative);
                                if (value) handleCopy(value);
                              }}
                              className="group w-full text-left"
                              title="複製首選 MPN"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={cn("text-xs font-black", primaryReady ? "text-emerald-300" : mustApply ? "text-amber-300" : "text-cyan-300")}>{primaryReady ? "主料已建・OK + 00" : mustApply ? "主料與替代都待申請" : "主料未建・已有可用替代"}</p>
                                  <p className={cn("mt-0.5 break-all font-mono text-[15px] font-black leading-6", primaryReady ? "text-emerald-100" : mustApply ? "text-amber-100" : "text-cyan-100")}>
                                    {getDisplayMpn(primaryAlternative) || "未填 MPN"}
                                  </p>
                                  <p className={cn("mt-1 text-sm", primaryReady ? "text-slate-200" : mustApply ? "text-amber-200" : "text-cyan-200")}>
                                    {primaryAlternative.manufacturer || "未填廠商"}
                                  </p>
                                </div>
                                {getDisplayMpn(primaryAlternative) && (
                                  <Copy className={cn("mt-1 h-4 w-4 flex-none opacity-80 group-hover:opacity-100", primaryReady ? "text-emerald-200" : mustApply ? "text-amber-300" : "text-cyan-300")} />
                                )}
                              </div>
                            </button>
                          ) : (
                            <span className="text-base font-semibold text-amber-300">尚未建立首選資料</span>
                          )}

                          {secondaryAlternatives.length > 0 && (
                            <div className="hidden">
                              <p className="text-sm font-bold text-blue-300">其他替代料</p>
                              <div className="grid gap-2">
                                {secondaryAlternatives.map((record) => {
                                  const value = getDisplayMpn(record);
                                  return (
                                    <button
                                      key={record.id}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (value) handleCopy(value);
                                      }}
                                      className="min-h-[66px] w-full rounded-lg border border-blue-400/25 bg-blue-400/10 px-3 py-2 text-left hover:bg-blue-400/20"
                                      title={value ? "複製替代料 MPN" : "替代料"}
                                    >
                                      <p className="truncate text-sm font-bold text-slate-200">
                                        {record.manufacturer || "未填廠商"}
                                      </p>
                                      <p className="mt-0.5 truncate font-mono text-[15px] font-semibold text-blue-200">
                                        {value || "未填 MPN"}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle">
                        <div>
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={cn("text-sm font-bold", primaryReady ? "text-emerald-300" : mustApply ? "text-amber-300" : "text-cyan-300")}>內部料號 / 圖面</p>
                                {primaryAlternative?.partNumber ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleCopy(primaryAlternative.partNumber);
                                    }}
                                    className="group mt-1 flex w-full items-center gap-2 text-left"
                                    title="複製內部料號"
                                  >
                                    <span className={cn("truncate font-mono text-[15px] font-black", primaryReady ? "text-emerald-100" : mustApply ? "text-amber-100" : "text-cyan-100")}>
                                      {primaryAlternative.partNumber}
                                    </span>
                                    <Copy className={cn("h-4 w-4 flex-none opacity-80 group-hover:opacity-100", primaryReady ? "text-emerald-300" : mustApply ? "text-amber-300" : "text-cyan-300")} />
                                  </button>
                                ) : (
                                  <p className="mt-1 text-[15px] font-semibold text-amber-300">尚未建立內部料號</p>
                                )}
                                <p className="mt-2 truncate font-mono text-[13px] font-semibold text-cyan-300">
                                  {group.schematicPart || "No Symbol"}
                                </p>
                                <p className="mt-1 truncate font-mono text-[13px] text-indigo-300">
                                  {group.footprint || "No Footprint"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {secondaryAlternatives.length > 0 && (
                            <div className="hidden">
                              <p className="text-sm font-bold text-cyan-300">對應內部料號</p>
                              <div className="grid gap-2">
                                {secondaryAlternatives.map((record) => (
                                  <div
                                    key={`${record.id}-internal`}
                                    className="min-h-[66px] rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2"
                                  >
                                    {record.partNumber ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleCopy(record.partNumber);
                                        }}
                                        className="group flex w-full items-center justify-between gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-left hover:bg-cyan-300/20"
                                        title="複製內部料號"
                                      >
                                        <span className="truncate font-mono text-[15px] font-black text-cyan-200">
                                          {record.partNumber}
                                        </span>
                                        <Copy className="h-4 w-4 flex-none text-cyan-300 opacity-80 group-hover:opacity-100" />
                                      </button>
                                    ) : (
                                      <div className="flex h-full min-h-[42px] items-center rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3">
                                        <span className="text-[15px] font-semibold text-amber-300">尚未建立內部料號</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                        {primaryAlternative && <InlineVirtualAlternativeEditor value={primaryAlternative.virtualAlternative ?? ""} onSave={(value) => saveVirtualAlternative(primaryAlternative, value)} />}
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3">
                        <div className="flex flex-col items-start gap-2">{mustApply ? <span className="rounded-md border border-amber-300/50 bg-amber-400/25 px-3 py-1.5 text-[15px] font-black text-amber-100">主料與替代都無料</span> : primaryReady ? <span className="rounded-md border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-[15px] font-black text-emerald-200">主料已建</span> : <span className="rounded-md border border-cyan-300/40 bg-cyan-400/20 px-3 py-1.5 text-[15px] font-black text-cyan-100">已有可用替代 {availableAlternativeCount}</span>}{!primaryReady && <span className={cn("text-sm font-semibold leading-5", mustApply ? "text-amber-200" : "text-cyan-200")}>主料 Remark: {primaryAlternative?.remark || "未填"}<br />主料 Part Number: {primaryAlternative?.partNumber || "未填"}</span>}{availableAlternativeCount > 0 && <span className="rounded bg-emerald-400/15 px-2.5 py-1 text-sm font-bold text-emerald-300">可用替代 {availableAlternativeCount}</span>}{group.pendingCount > 0 && <span className="rounded bg-slate-400/10 px-2.5 py-1 text-sm font-semibold text-slate-300">待建明細 {group.pendingCount}</span>}</div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 text-[15px] leading-6 text-slate-400"><p className="line-clamp-2">{group.partSpec || group.partName || "-"}</p></td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                        {primaryAlternative && <TrackingHistoryCell record={primaryAlternative} onOpen={openTrackingDialog} />}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-8 w-full border-cyan-400/25 bg-cyan-400/10 px-2 text-sm text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100"><Plus className="mr-1 h-3.5 w-3.5" />資料更新</Button>
                      </td>
                    </tr>
                    {expanded && <CompactAlternativeRows group={group} records={matchingRecords} primaryRecord={primaryAlternative} onCopy={handleCopy} onView={(record) => openRecord(record, "view")} onEdit={(record) => openRecord(record, "edit")} onSaveVirtual={saveVirtualAlternative} onOpenTracking={openTrackingDialog} />}
                  </tbody>
                );
              })}
          </table>

          {visibleGroupRows.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Search className="h-10 w-10 text-slate-600" /><p className="mt-3 text-lg font-bold text-slate-300">找不到符合條件的料</p><p className="mt-1 text-[15px] text-slate-500">請清除篩選，或改用 MPN、廠商、Footprint 搜尋。</p></div>}
        </div>

        <div className="flex flex-col gap-3 border-t border-blue-400/15 bg-[#101d33] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-400"><span>每頁</span><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="h-9 w-24 border-blue-400/20 bg-[#0b1527] text-slate-200"><SelectValue /></SelectTrigger><SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">{PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} 列</SelectItem>)}</SelectContent></Select><span>第 {page} / {totalPages} 頁</span></div>
          <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300"><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button><Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300">下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
        </div>
      </section>
    </div>
  );
}
