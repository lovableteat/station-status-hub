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
import { startTransition } from "react";
import type { CSSProperties } from "react";
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
  Star,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  type BomPageTracker,
  type BomPageTrackerPage,
  type BomPageTrackerStatus,
  type BomStorageMode,
  type BomWorkspace,
  loadBomWorkspacesDetailed,
  removeBomWorkspace,
  saveBomWorkspace,
  saveBomWorkspacePageTracker,
  saveBomWorkspaceRecord,
  subscribeBomWorkspaceChanges,
} from "./materialBomStorage";
import type { BomTableColorTheme } from "./materialBomStorage";
import { saveBomWorkspaceTableColorTheme } from "./materialBomStorage";

type AvailabilityFilter = "all" | "usable" | "required" | "pending" | "risk" | "single";
type SortMode = "reference" | "alternatives" | "approved" | "pending" | "single-source";
type EditorMode = "create" | "edit" | "view";
type CollaborationStatus = BomStorageMode | "checking" | "error";

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

type ColumnFilterKey = keyof MaterialColumnFilters;

interface CachedColumnValues {
  raw: string[];
  searchable: string;
}

type CachedRecordColumnValues = Record<ColumnFilterKey, CachedColumnValues>;

const EMPTY_COLUMN_FILTERS: MaterialColumnFilters = {
  material: null,
  refDes: null,
  mpn: null,
  internal: null,
  virtualAlternative: null,
  trackingStatus: null,
  specification: null,
};

const FILTER_KEYS = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];

const DEFAULT_BOM_ID = "bom:申請carrier料.xlsx";
const ACTIVE_BOM_KEY = "station-status-hub:active-material-bom:v1";
const MARKED_GROUPS_KEY_PREFIX = "station-status-hub:material-marked-groups:v1:";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const COLUMN_WIDTHS_KEY = "station-status-hub:material-column-widths:v7";
const TRACKING_STATUS_OPTIONS = ["新增追蹤", "處理中", "已完成"] as const;
const MAX_BOM_TRACKER_PAGES = 500;
const BOM_PAGE_STATUS_OPTIONS: Array<{
  value: BomPageTrackerStatus;
  label: string;
  activeClassName: string;
  idleClassName: string;
}> = [
  {
    value: "done",
    label: "已完成",
    activeClassName: "border-emerald-300/35 bg-emerald-400/18 text-emerald-50",
    idleClassName: "border-emerald-400/18 bg-emerald-400/8 text-emerald-200 hover:bg-emerald-400/14",
  },
  {
    value: "pending",
    label: "待處理",
    activeClassName: "border-amber-300/35 bg-amber-400/18 text-amber-50",
    idleClassName: "border-amber-400/18 bg-amber-400/8 text-amber-200 hover:bg-amber-400/14",
  },
  {
    value: "done_missing",
    label: "已完成但缺料",
    activeClassName: "border-violet-300/35 bg-violet-400/18 text-violet-50",
    idleClassName: "border-violet-400/18 bg-violet-400/8 text-violet-200 hover:bg-violet-400/14",
  },
];
const DEFAULT_COLUMN_WIDTHS = [96, 92, 260, 160, 260, 210, 190, 180, 250, 220, 130];
const MIN_COLUMN_WIDTHS = [80, 76, 200, 120, 180, 170, 150, 140, 180, 180, 110];
const MAX_COLUMN_WIDTHS = [148, 108, 520, 360, 520, 460, 420, 360, 520, 420, 260];
const DEFAULT_BOM_TABLE_COLOR_THEME: BomTableColorTheme = {
  primary: "#0F5D74",
  alternative: "#343B73",
  secondary: "#10243D",
};
const FILTER_OPTION_ROW_HEIGHT = 38;
const FILTER_OPTION_LIST_HEIGHT = 224;
const FILTER_OPTION_OVERSCAN = 8;

const BOM_TABLE_COLOR_FIELDS: Array<{
  key: keyof BomTableColorTheme;
  label: string;
  description: string;
}> = [
  { key: "primary", label: "主料", description: "主料列與首筆主資料背景。" },
  { key: "alternative", label: "替代料", description: "替代料列與可用替代背景。" },
  { key: "secondary", label: "其餘料", description: "其他替代料或未首選列背景。" },
];

function normalizeBomTableColorTheme(theme: Partial<BomTableColorTheme> | null | undefined): BomTableColorTheme {
  const pickColor = (value: unknown, fallback: string) => (
    typeof value === "string" && /^#([0-9a-f]{6})$/i.test(value.trim())
      ? value.trim().toUpperCase()
      : fallback
  );

  return {
    primary: pickColor(theme?.primary, DEFAULT_BOM_TABLE_COLOR_THEME.primary),
    alternative: pickColor(theme?.alternative, DEFAULT_BOM_TABLE_COLOR_THEME.alternative),
    secondary: pickColor(theme?.secondary, DEFAULT_BOM_TABLE_COLOR_THEME.secondary),
  };
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const parsed = Number.parseInt(normalized, 16);

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function withAlpha(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTableRowStyle(
  color: string,
  options?: {
    backgroundAlpha?: number;
    hoverAlpha?: number;
    accentAlpha?: number;
  },
): CSSProperties {
  const backgroundAlpha = options?.backgroundAlpha ?? 0.16;
  const hoverAlpha = options?.hoverAlpha ?? 0.24;
  const accentAlpha = options?.accentAlpha ?? 0.92;

  return {
    "--material-row-bg": withAlpha(color, backgroundAlpha),
    "--material-row-hover": withAlpha(color, hoverAlpha),
    "--material-row-accent": withAlpha(color, accentAlpha),
  } as CSSProperties;
}

function getMarkedGroupsStorageKey(bomId: string) {
  return `${MARKED_GROUPS_KEY_PREFIX}${bomId}`;
}

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

function clampBomTrackerPageCount(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_BOM_TRACKER_PAGES, Math.max(0, Math.trunc(value))) : 0;
}

function sortBomTrackerPages(pages: BomPageTrackerPage[]) {
  return [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
}

function syncBomTrackerPages(pages: BomPageTrackerPage[], totalPages: number) {
  const normalizedTotalPages = clampBomTrackerPageCount(totalPages);
  const pageMap = new Map<number, BomPageTrackerPage>();

  pages.forEach((page) => {
    const pageNumber = clampBomTrackerPageCount(page.pageNumber);
    if (pageNumber < 1) return;

    pageMap.set(pageNumber, {
      pageNumber,
      status: page.status ?? (page.completed === true ? "done" : "pending"),
      note: page.note ?? "",
    });
  });

  for (let pageNumber = 1; pageNumber <= normalizedTotalPages; pageNumber += 1) {
    if (!pageMap.has(pageNumber)) {
      pageMap.set(pageNumber, {
        pageNumber,
        status: "pending",
        note: "",
      });
    }
  }

  return sortBomTrackerPages([...pageMap.values()]);
}

function getBomPageTrackerSummary(pageTracker?: BomPageTracker) {
  const totalPages = clampBomTrackerPageCount(pageTracker?.totalPages ?? 0);
  const pages = syncBomTrackerPages(pageTracker?.pages ?? [], totalPages);
  const completedPages = pages.filter((page) => page.pageNumber <= totalPages && page.status !== "pending").length;
  const missingPages = pages.filter((page) => page.pageNumber <= totalPages && page.status === "done_missing").length;
  const highestTouchedPage = pages.reduce((maxPage, page) => (
    page.status !== "pending" || page.note.trim()
      ? Math.max(maxPage, page.pageNumber)
      : maxPage
  ), 0);
  const requestedCurrentPage = clampBomTrackerPageCount(pageTracker?.currentPage ?? 0);
  const currentPage = totalPages > 0
    ? Math.min(totalPages, requestedCurrentPage > 0 ? requestedCurrentPage : highestTouchedPage)
    : 0;
  const currentPageEntry = currentPage > 0
    ? pages.find((page) => page.pageNumber === currentPage) ?? null
    : null;

  return {
    totalPages,
    completedPages,
    missingPages,
    currentPage,
    currentPageEntry,
    highestTouchedPage,
    pages,
  };
}

function getBomPageStatusMeta(status: BomPageTrackerStatus) {
  switch (status) {
    case "done":
      return {
        label: "已完成",
        cardClassName: "border-emerald-400/20 bg-emerald-400/[0.08]",
        textClassName: "text-emerald-100",
      };
    case "done_missing":
      return {
        label: "已完成但缺料",
        cardClassName: "border-violet-400/20 bg-violet-400/[0.08]",
        textClassName: "text-violet-100",
      };
    default:
      return {
        label: "待處理",
        cardClassName: "border-blue-400/10 bg-[#10192c]",
        textClassName: "text-slate-100",
      };
  }
}

function BomPageTrackerSummaryPill({
  pageTracker,
  className,
}: {
  pageTracker?: BomPageTracker;
  className?: string;
}) {
  const summary = getBomPageTrackerSummary(pageTracker);
  const ready = summary.totalPages > 0;
  const hasCurrentPage = ready && summary.currentPage > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
        ready
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
          : "border-slate-400/25 bg-slate-500/10 text-slate-300",
        className,
      )}
    >
      <CircleCheck className={cn("h-3.5 w-3.5", ready ? "text-emerald-300" : "text-slate-400")} />
      {ready
        ? hasCurrentPage
          ? `目前第 ${summary.currentPage} / ${summary.totalPages} 頁 · 已完成 ${summary.completedPages} 頁`
          : `已完成 ${summary.completedPages} / ${summary.totalPages} 頁`
        : "頁數未設定"}
    </span>
  );
}

function BomPageTrackerStatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "slate" | "emerald" | "cyan";
}) {
  const toneClassName = tone === "emerald"
    ? "border-emerald-300/26 bg-emerald-300/[0.14]"
    : tone === "cyan"
      ? "border-cyan-300/26 bg-cyan-300/[0.14]"
      : "border-sky-300/18 bg-[#162338]";

  return (
    <div className={cn("rounded-xl border px-3 py-3", toneClassName)}>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-slate-50">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{hint}</p>
    </div>
  );
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
    trackingNote: record.trackingNote ?? "",
    requestTicket: record.requestTicket ?? "",
    requestUrl: record.requestUrl ?? "",
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
    trackingNote: "",
    requestTicket: "",
    requestUrl: "",
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
    tableColorTheme: DEFAULT_BOM_TABLE_COLOR_THEME,
    updatedAt: payload.generatedAt,
  };
}

function createBomId(fileName: string) {
  const normalizedFileName = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "bom";

  return `bom:${normalizedFileName}`;
}

function isImportedTrackingEntry(entry: MaterialTrackingHistoryEntry) {
  return entry.id.startsWith("imported-tracking-");
}

function mergeTrackingHistories(
  existingHistory: MaterialTrackingHistoryEntry[] = [],
  importedHistory: MaterialTrackingHistoryEntry[] = []
) {
  const existingById = new Map(existingHistory.map((entry) => [entry.id, entry]));
  const importedIds = new Set(importedHistory.map((entry) => entry.id));
  const importedEntries = importedHistory.map((entry) => {
    const existingEntry = existingById.get(entry.id) as (MaterialTrackingHistoryEntry & { virtualPartNumber?: string }) | undefined;
    const { virtualPartNumber: _legacyVirtualPartNumber, ...safeExistingEntry } = existingEntry ?? {};
    return { ...safeExistingEntry, ...entry };
  });
  const preservedExistingEntries = existingHistory.filter((entry) =>
    !importedIds.has(entry.id) && !isImportedTrackingEntry(entry)
  );

  return [...importedEntries, ...preservedExistingEntries];
}

function hasTrackingContent(entry: MaterialTrackingHistoryEntry) {
  return [
    entry.status,
    entry.note,
    entry.requestInfo,
    entry.requestTicket,
    entry.requestUrl,
  ].some((value) => String(value ?? "").trim().length > 0);
}

function hasImportedTrackingData(record: Pick<MaterialWorkbookRecord, "trackingStatus" | "trackingHistory">) {
  return Boolean(
    record.trackingStatus?.trim()
      || (record.trackingHistory ?? []).some(hasTrackingContent)
  );
}

function getBestTrackingRecord(records: MaterialRecord[], fallback: MaterialRecord) {
  return records.find((record) =>
    record.trackingStatus?.trim()
      || (record.trackingHistory ?? []).some(hasTrackingContent)
  ) ?? fallback;
}

function loadActiveBomId() {
  if (typeof window === "undefined") return DEFAULT_BOM_ID;
  return window.localStorage.getItem(ACTIVE_BOM_KEY) || DEFAULT_BOM_ID;
}

function loadMarkedGroups(bomId: string) {
  if (typeof window === "undefined") return [] as string[];

  try {
    const stored = JSON.parse(window.localStorage.getItem(getMarkedGroupsStorageKey(bomId)) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return Array.from(new Set(stored.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
  } catch {
    return [];
  }
}

function saveMarkedGroups(bomId: string, values: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getMarkedGroupsStorageKey(bomId),
      JSON.stringify(Array.from(new Set(values.filter((value) => value.trim().length > 0)))),
    );
  } catch {
    // Ignore browser storage failures and keep current session state usable.
  }
}

function getGroupItemValue(group: MaterialGroup, fallbackIndex: number) {
  void group;
  return fallbackIndex;
}

function mergeImportedWorkspace(existingWorkspace: BomWorkspace | undefined, workspaceId: string, payload: MaterialWorkbookPayload): BomWorkspace {
  const existingRecords = new Map((existingWorkspace?.payload.records ?? []).map((record) => [record.id, record]));
  const importedRecordIds = new Set<string>();
  const mergedRecords = payload.records.map((record) => {
    importedRecordIds.add(record.id);
    const existingRecord = existingRecords.get(record.id);
    const importedHasTrackingData = hasImportedTrackingData(record);
    const existingHadImportedTracking = (existingRecord?.trackingHistory ?? []).some(isImportedTrackingEntry);
    const mergedTrackingHistory = mergeTrackingHistories(existingRecord?.trackingHistory, record.trackingHistory);
    const latestMergedTrackingEntry = getLatestTrackingEntry({
      trackingHistory: mergedTrackingHistory,
      trackingStatus: "",
      trackingNote: "",
      requestTicket: "",
      requestUrl: "",
    });

    return {
      ...existingRecord,
      ...record,
      // For same-file uploads, TX should reflect the latest Excel exactly, including clearing old values.
      virtualAlternative: record.virtualAlternative?.trim() ?? "",
      trackingStatus: importedHasTrackingData
        ? (record.trackingStatus?.trim() || "新增追蹤")
        : latestMergedTrackingEntry?.status?.trim()
          || (existingHadImportedTracking ? "" : existingRecord?.trackingStatus?.trim() || "")
          || "",
      trackingHistory: mergedTrackingHistory,
      trackingNote: record.trackingNote?.trim()
        ? record.trackingNote
        : latestMergedTrackingEntry?.note?.trim()
          || (existingHadImportedTracking ? "" : existingRecord?.trackingNote ?? ""),
      requestTicket: record.requestTicket?.trim()
        ? record.requestTicket
        : latestMergedTrackingEntry?.requestTicket?.trim()
          || (existingHadImportedTracking ? "" : existingRecord?.requestTicket ?? ""),
      requestUrl: record.requestUrl?.trim()
        ? record.requestUrl
        : latestMergedTrackingEntry?.requestUrl?.trim()
          || (existingHadImportedTracking ? "" : existingRecord?.requestUrl ?? ""),
      remark: record.remark?.trim()
        ? record.remark
        : existingRecord?.remark ?? "",
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
    pageTracker: existingWorkspace?.pageTracker,
    tableColorTheme: existingWorkspace?.tableColorTheme,
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

function getBestVirtualAlternativeRecord(records: MaterialRecord[], fallback: MaterialRecord | null) {
  return records.find((record) => record.virtualAlternative?.trim()) ?? fallback;
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
          latestEntry?.requestInfo ?? "",
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
        latestTrackingEntry?.requestInfo ?? "",
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

function isExternalUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

function getCollaborationStatusMeta(status: CollaborationStatus) {
  switch (status) {
    case "remote":
      return {
        label: "多人共享已啟用",
        description: "目前正在使用共用雲端 BOM，其他電腦新增的 BOM 也會同步出現。",
        badgeClassName: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        dotClassName: "bg-emerald-300",
        bannerClassName: "",
        bannerText: "",
      };
    case "recovery":
      return {
        label: "唯讀恢復模式",
        description: "目前不是多人同步，只能查看恢復資料；上傳與編輯會被鎖住。",
        badgeClassName: "border-amber-400/30 bg-amber-400/10 text-amber-100",
        dotClassName: "bg-amber-300",
        bannerClassName: "border-amber-400/30 bg-amber-400/10 text-amber-100",
        bannerText: "目前是唯讀恢復模式，還不是多人同步。請先把 Supabase migration `20260702094500_4a79e28e-90e1-48d2-9487-f78e49b0d90a.sql` 套到正式資料庫。",
      };
    case "error":
      return {
        label: "雲端同步異常",
        description: "最近一次共用 BOM 同步失敗，畫面可能停留在上次載入的資料。",
        badgeClassName: "border-rose-400/30 bg-rose-400/10 text-rose-100",
        dotClassName: "bg-rose-300",
        bannerClassName: "border-rose-400/30 bg-rose-400/10 text-rose-100",
        bannerText: "共用雲端 BOM 目前連線異常，畫面可能停留在上次載入的資料。請重新整理，或稍後再試一次。",
      };
    default:
      return {
        label: "檢查共享狀態中",
        description: "系統正在確認是否連上共用雲端 BOM，完成前先不要判斷是否可多人共享。",
        badgeClassName: "border-sky-400/30 bg-sky-400/10 text-sky-100",
        dotClassName: "bg-sky-300",
        bannerClassName: "border-sky-400/30 bg-sky-400/10 text-sky-100",
        bannerText: "系統正在檢查共用 BOM 是否可用，確認完成前會暫時鎖住需要多人同步的操作。",
      };
  }
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
  if (["無狀態", "新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
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

  if (["無狀態", "新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
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

function createCachedColumnValues(values: string[]): CachedColumnValues {
  const raw = uniqueNormalizedValues(values);

  return {
    raw,
    searchable: raw.map((value) => value.toLowerCase()).join(" "),
  };
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
  if (["無狀態", "新增追蹤", "待", "申請", "確認", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "amber";
  }
  if (["處理中", "追蹤", "進行", "progress"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "sky";
  }

  return "slate";
}

function getTrackingStatusDisplayLabel(status: string) {
  const workflowStatus = normalizeTrackingWorkflowStatus(status);
  return workflowStatus === "新增追蹤" ? "無狀態" : workflowStatus;
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

  if (["無狀態", "新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "新增追蹤" as const;
  }

  return "新增追蹤" as const;
}

function getTrackingWorkflowStatus(record: MaterialRecord) {
  const latestEntry = getLatestTrackingEntry(record);
  const workflowStatus = normalizeTrackingWorkflowStatus(latestEntry?.status || record.trackingStatus || "");
  const hasImportedStatusContent = Boolean(
    latestEntry?.note?.trim()
      || latestEntry?.createdBy?.trim()
      || latestEntry?.requestInfo?.trim()
  );

  return workflowStatus === "新增追蹤" && hasImportedStatusContent ? "處理中" : workflowStatus;
}

function normalizeRequestUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;

  return "";
}

function getTrackingRequestMeta(record: Pick<MaterialWorkbookRecord, "trackingHistory" | "trackingStatus" | "trackingNote" | "requestTicket" | "requestUrl">) {
  const latestEntry = getLatestTrackingEntry(record);
  const importedRequestInfo = latestEntry?.requestInfo?.trim() || "";
  const rawUrl = latestEntry?.requestUrl?.trim()
    || record.requestUrl?.trim()
    || (isExternalUrl(importedRequestInfo) ? importedRequestInfo : "");
  const ticket = latestEntry?.requestTicket?.trim()
    || record.requestTicket?.trim()
    || (isExternalUrl(importedRequestInfo) ? rawUrl : importedRequestInfo);
  const url = normalizeRequestUrl(rawUrl || (isExternalUrl(importedRequestInfo) ? importedRequestInfo : ""));

  return {
    ticket,
    url,
  };
}

function hasTrackingActivity(record: Pick<MaterialWorkbookRecord, "trackingHistory" | "trackingStatus" | "trackingNote" | "requestTicket" | "requestUrl">) {
  const latestEntry = getLatestTrackingEntry(record);
  return Boolean(
    (record.trackingHistory?.length ?? 0) > 0
    || record.trackingStatus?.trim()
    || record.trackingNote?.trim()
    || record.requestTicket?.trim()
    || record.requestUrl?.trim()
    || latestEntry?.note?.trim()
    || latestEntry?.requestInfo?.trim()
  );
}

function workspaceHasTrackingActivity(workspace: BomWorkspace) {
  return workspace.payload.records.some((record) => hasTrackingActivity(record));
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
      label: getTrackingStatusDisplayLabel(status),
      value: status,
      count: counter.get(status) ?? 0,
      keywords: `${status} ${getTrackingStatusDisplayLabel(status)}`,
      tone: inferFilterOptionTone(status),
    }));
}

function matchesExcelFilter(selectedValues: ColumnFilterSelection, candidateValues: string[]) {
  if (selectedValues === null) return true;
  if (selectedValues.length === 0) return false;
  const normalizedCandidates = uniqueNormalizedValues(candidateValues);
  return normalizedCandidates.some((value) => selectedValues.includes(value));
}

function matchesRecordColumnFilters(
  record: MaterialRecord,
  group: MaterialGroup,
  filters: MaterialColumnFilters,
  ignoredKey?: ColumnFilterKey,
) {
  const keys = Object.keys(filters) as ColumnFilterKey[];

  return keys.every((key) => {
    if (key === ignoredKey) return true;
    const candidateValues = getRecordColumnValues(record, group, key);

    return matchesExcelFilter(filters[key], candidateValues);
  });
}

function matchesColumnFilters(
  group: MaterialGroup,
  filters: MaterialColumnFilters,
  ignoredKey?: ColumnFilterKey,
) {
  return group.records.some((record) =>
    matchesRecordColumnFilters(record, group, filters, ignoredKey)
  );
}

function normalizeColumnFilterSelection(selectedValues: ColumnFilterSelection) {
  if (selectedValues === null) return null;

  return Array.from(new Set(
    selectedValues.map((value) => normalizeFilterValue(
      value === "無狀態" ? "新增追蹤" : String(value ?? ""),
    )),
  ));
}

function DeferredTextInput({
  className,
  commitDelay = 90,
  onCommit,
  placeholder,
  value,
}: {
  className?: string;
  commitDelay?: number;
  onCommit: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  useEffect(() => {
    if (draftValue === value) return undefined;

    const timerId = window.setTimeout(() => {
      startTransition(() => {
        onCommit(draftValue);
      });
    }, commitDelay);

    return () => window.clearTimeout(timerId);
  }, [commitDelay, draftValue, onCommit, value]);

  return (
    <Input
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function ExcelFilterPopover({
  label,
  options,
  selectedValues,
  onSelectedValuesChange,
}: {
  label: string;
  options: ExcelFilterOption[];
  selectedValues: ColumnFilterSelection;
  onSelectedValuesChange: (values: ColumnFilterSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPanelReady, setIsPanelReady] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [mergeSearchSelection, setMergeSearchSelection] = useState(true);
  const [draftSelectedValues, setDraftSelectedValues] = useState<ColumnFilterSelection>(
    normalizeColumnFilterSelection(selectedValues),
  );
  const [draftSearchValue, setDraftSearchValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const wasOpenRef = useRef(false);
  const selectedValuesRef = useRef(selectedValues);
  const deferredDraftSearchValue = useDeferredValue(draftSearchValue);
  const allOptionValues = useMemo(() => options.map((option) => option.value), [options]);
  const optionValueSet = useMemo(() => new Set(allOptionValues), [allOptionValues]);
  const appliedSelectedValues = useMemo(
    () => normalizeColumnFilterSelection(selectedValues),
    [selectedValues],
  );

  useEffect(() => {
    selectedValuesRef.current = selectedValues;
  }, [selectedValues]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftSelectedValues(normalizeColumnFilterSelection(selectedValuesRef.current));
      setDraftSearchValue("");
      setMergeSearchSelection(true);
      setScrollTop(0);
    }

    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDraftSelectedValues(normalizeColumnFilterSelection(selectedValues));
    }
  }, [open, selectedValues]);

  useEffect(() => {
    if (!open) {
      setIsPanelReady(false);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsPanelReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  const effectiveSelected = useMemo(
    () => draftSelectedValues === null
      ? allOptionValues
      : normalizeColumnFilterSelection(draftSelectedValues) ?? [],
    [allOptionValues, draftSelectedValues],
  );
  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelected), [effectiveSelected]);
  const hiddenSelectedValues = useMemo(
    () => draftSelectedValues === null
      ? []
      : effectiveSelected.filter((value) => !optionValueSet.has(value)),
    [draftSelectedValues, effectiveSelected, optionValueSet],
  );
  const selectedCount = appliedSelectedValues === null ? options.length : appliedSelectedValues.length;
  const triggerSummary = appliedSelectedValues === null ? "全部" : `${selectedCount}項`;

  const filteredOptions = useMemo(() => {
    if (!isPanelReady) return options;

    const searchTokens = parseSearchTokens(deferredDraftSearchValue);
    const next = options.filter((option) => {
      if (searchTokens.length === 0) return true;

      const searchableText = `${option.label} ${option.keywords ?? option.value}`.toLowerCase();
      return searchTokens.every((token) => searchableText.includes(token));
    });

    return [...next].sort((left, right) => sortDirection === "asc"
      ? left.label.localeCompare(right.label, undefined, { numeric: true })
      : right.label.localeCompare(left.label, undefined, { numeric: true }));
  }, [deferredDraftSearchValue, isPanelReady, options, sortDirection]);

  const visibleCheckedCount = filteredOptions.filter((option) => effectiveSelectedSet.has(option.value)).length;
  const allVisibleChecked = filteredOptions.length > 0 && visibleCheckedCount === filteredOptions.length;
  const allOptionsChecked = draftSelectedValues === null || (
    hiddenSelectedValues.length === 0
    && options.length > 0
    && options.every((option) => effectiveSelectedSet.has(option.value))
  );
  const virtualStartIndex = Math.max(
    0,
    Math.floor(scrollTop / FILTER_OPTION_ROW_HEIGHT) - FILTER_OPTION_OVERSCAN,
  );
  const virtualEndIndex = Math.min(
    filteredOptions.length,
    Math.ceil((scrollTop + FILTER_OPTION_LIST_HEIGHT) / FILTER_OPTION_ROW_HEIGHT) + FILTER_OPTION_OVERSCAN,
  );
  const visibleOptionSlice = filteredOptions.slice(virtualStartIndex, virtualEndIndex);
  const panelSummary = draftSelectedValues === null ? "全部" : `${effectiveSelected.length} 項`;
  const exactMatchingCount = useMemo(() => {
    const searchTokens = parseSearchTokens(deferredDraftSearchValue);
    return options.filter((option) => {
      if (searchTokens.length === 0) return true;
      const searchableText = `${option.label} ${option.keywords ?? option.value}`.toLowerCase();
      return searchTokens.every((token) => searchableText.includes(token));
    }).length;
  }, [deferredDraftSearchValue, options]);
  const searchHasValue = deferredDraftSearchValue.trim().length > 0;
  const currentVisibleValues = useMemo(
    () => filteredOptions.map((option) => option.value),
    [filteredOptions],
  );
  const hiddenBySearchCount = useMemo(
    () => searchHasValue
      ? effectiveSelected.filter((value) => !currentVisibleValues.includes(value)).length
      : 0,
    [currentVisibleValues, effectiveSelected, searchHasValue],
  );

  const convertSelectionState = useCallback((values: string[]) => {
    const normalized = normalizeColumnFilterSelection(values) ?? [];

    if (
      hiddenSelectedValues.length === 0
      && options.length > 0
      && normalized.length === options.length
      && options.every((option) => normalized.includes(option.value))
    ) {
      return null;
    }

    return normalized;
  }, [hiddenSelectedValues.length, options]);

  const applySelection = (nextValues: string[]) => {
    setDraftSelectedValues(convertSelectionState(nextValues));
  };

  const commitSelection = () => {
    const nextSelection = draftSelectedValues === null
      ? null
      : normalizeColumnFilterSelection(draftSelectedValues);
    startTransition(() => {
      onSelectedValuesChange(nextSelection);
    });
    setOpen(false);
  };

  const cancelSelection = () => {
    setDraftSelectedValues(normalizeColumnFilterSelection(selectedValues));
    setOpen(false);
  };

  const clearColumnDraft = () => {
    setDraftSearchValue("");
    setDraftSelectedValues(null);
    setMergeSearchSelection(true);
    setScrollTop(0);
  };

  const toggleValue = (value: string, checked: boolean) => {
    const current = draftSelectedValues === null
      ? allOptionValues
      : effectiveSelected;
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((item) => item !== value);

    applySelection(next);
  };

  const toggleAllOptions = (checked: boolean) => {
    setDraftSelectedValues(checked ? null : []);
  };

  const toggleVisibleSelection = (checked: boolean) => {
    const current = draftSelectedValues === null
      ? allOptionValues
      : effectiveSelected;

    if (checked) {
      applySelection(
        searchHasValue && !mergeSearchSelection
          ? currentVisibleValues
          : Array.from(new Set([...current, ...currentVisibleValues])),
      );
      return;
    }

    applySelection(current.filter((value) => !currentVisibleValues.includes(value)));
  };

  useEffect(() => {
    setScrollTop(0);
  }, [deferredDraftSearchValue, filteredOptions.length, sortDirection]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            {triggerSummary}
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
            <span className="rounded bg-cyan-400/10 px-2 py-0.5 text-[11px] font-bold text-cyan-100">{panelSummary}</span>
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

          <button
            type="button"
            onClick={clearColumnDraft}
            className="flex w-full items-center justify-start rounded-xl border border-blue-400/15 bg-[#10192e] px-3 py-2 text-left text-[13px] font-semibold text-slate-200 transition-colors hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-cyan-100"
          >
            清除「{label}」中的篩選
          </button>

          <div className="rounded-xl border border-cyan-400/18 bg-cyan-400/[0.05] p-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">搜尋</p>
              <Input
                value={draftSearchValue}
                onChange={(event) => setDraftSearchValue(event.target.value)}
                placeholder={`輸入 ${label} 關鍵字，只縮小清單`}
                className="h-9 rounded-lg border-blue-400/20 bg-[#111f36] px-3 text-[13px] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-blue-400/15 bg-[#10192e] px-3 py-2 text-[12px] text-slate-300">
            <span>目前勾選 {draftSelectedValues === null ? options.length : effectiveSelected.length} / {options.length}</span>
            <span>搜尋命中 {exactMatchingCount} 筆</span>
          </div>

          {hiddenBySearchCount > 0 ? (
            <div className="rounded-xl border border-sky-300/18 bg-sky-400/10 px-3 py-2 text-[12px] text-sky-100">
              目前搜尋只顯示其中 {visibleCheckedCount} 個已勾選值；另有 {hiddenBySearchCount} 個已勾選值被搜尋關鍵字暫時隱藏。
            </div>
          ) : null}

          {hiddenSelectedValues.length > 0 ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
              另有 {hiddenSelectedValues.length} 個已勾選值因目前條件未顯示，套用時仍會保留。
            </div>
          ) : null}

          {isPanelReady ? (
            <div className="rounded-xl border border-blue-400/15 bg-[#091222]">
              {options.length > 0 && (
                <div className="border-b border-blue-400/10 p-2">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-blue-400/10 bg-blue-400/[0.06] px-2.5 py-2 text-[13px] font-semibold text-slate-100 hover:bg-blue-400/10">
                    <Checkbox
                      checked={allOptionsChecked ? true : (draftSelectedValues !== null && draftSelectedValues.length > 0 ? "indeterminate" : false)}
                      onCheckedChange={(value) => toggleAllOptions(value === true)}
                      className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                    />
                    <span className="min-w-0 flex-1 truncate">(全選)</span>
                    <span className="text-sm text-slate-300">
                      {draftSelectedValues === null ? options.length : effectiveSelected.length}/{options.length}
                    </span>
                  </label>
                </div>
              )}

              {searchHasValue ? (
                <div className="border-b border-blue-400/10 p-2">
                  <div className="space-y-2 rounded-lg border border-cyan-400/12 bg-cyan-400/[0.04] p-2">
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-[13px] font-semibold text-slate-100 hover:bg-blue-400/10">
                      <Checkbox
                        checked={allVisibleChecked ? true : visibleCheckedCount > 0 ? "indeterminate" : false}
                        onCheckedChange={(value) => toggleVisibleSelection(value === true)}
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                      />
                      <span className="min-w-0 flex-1 truncate">(選取所有搜尋結果)</span>
                      <span className="text-sm text-cyan-200">{visibleCheckedCount}/{filteredOptions.length}</span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-[13px] text-slate-300 hover:bg-blue-400/10">
                      <Checkbox
                        checked={mergeSearchSelection}
                        onCheckedChange={(value) => setMergeSearchSelection(value === true)}
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                      />
                      <span>[新增目前的選取範圍至篩選]</span>
                    </label>
                  </div>
                </div>
              ) : null}

              {filteredOptions.length > 0 ? (
                <div
                  className="h-56 overflow-y-auto"
                  onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                >
                  <div
                    className="relative"
                    style={{ height: filteredOptions.length * FILTER_OPTION_ROW_HEIGHT }}
                  >
                    {visibleOptionSlice.map((option, index) => {
                      const checked = effectiveSelectedSet.has(option.value);
                      const tone = option.tone ?? "slate";
                      const offsetY = (virtualStartIndex + index) * FILTER_OPTION_ROW_HEIGHT;

                      return (
                        <label
                          key={option.value}
                          className="absolute left-0 right-0 flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[13px] text-slate-100 hover:border-blue-400/10 hover:bg-blue-400/10"
                          style={{ top: offsetY, height: FILTER_OPTION_ROW_HEIGHT }}
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
                    })}
                  </div>
                </div>
              ) : (
                <div className="px-2 py-6 text-center text-[13px] text-slate-400">找不到符合的篩選值</div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-blue-400/15 bg-[#091222] px-3 py-8 text-center text-[13px] text-slate-400">
              正在載入篩選清單...
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-blue-400/10 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelSelection}
              className="h-9 rounded-lg border-slate-500/30 bg-slate-500/10 px-4 text-slate-200 hover:bg-slate-500/20 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={commitSelection}
              className="h-9 rounded-lg bg-cyan-500 px-5 font-bold text-slate-950 hover:bg-cyan-400"
            >
              確定
            </Button>
          </div>
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
  const requestMeta = getTrackingRequestMeta(record);
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
          {getTrackingStatusDisplayLabel(workflowStatus)}
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
        {requestMeta.ticket && (
          <div className="mt-2">
            {requestMeta.url ? (
              <a
                href={requestMeta.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex max-w-full items-center rounded-full border border-amber-300/35 bg-amber-400/16 px-2.5 py-1 text-xs font-bold text-amber-100 hover:bg-amber-400/24"
                title={requestMeta.url}
              >
                單號 {requestMeta.ticket}
              </a>
            ) : (
              <span className="inline-flex max-w-full items-center rounded-full border border-amber-300/35 bg-amber-400/16 px-2.5 py-1 text-xs font-bold text-amber-100">
                單號 {requestMeta.ticket}
              </span>
            )}
          </div>
        )}
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
  const [requestTicket, setRequestTicket] = useState("");
  const [requestUrl, setRequestUrl] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [requestInfo, setRequestInfo] = useState("");
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
    setRequestTicket(record?.requestTicket ?? "");
    setRequestUrl(record?.requestUrl ?? "");
    setCreatedBy("");
    setRequestInfo("");
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
      requestTicket: requestTicket.trim(),
      requestUrl: normalizeRequestUrl(requestUrl.trim()),
      createdAt: new Date().toISOString(),
      createdBy: createdBy.trim(),
      requestInfo: requestInfo.trim(),
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
      requestTicket: requestTicket.trim() || latestEntry?.requestTicket?.trim() || record.requestTicket?.trim() || "",
      requestUrl: normalizeRequestUrl(requestUrl.trim() || latestEntry?.requestUrl?.trim() || record.requestUrl?.trim() || ""),
      createdAt: new Date().toISOString(),
      createdBy: createdBy.trim(),
      requestInfo: latestEntry?.requestInfo?.trim() || "",
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
                      {getTrackingStatusDisplayLabel(latestWorkflowStatus)}
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
                  {getTrackingRequestMeta(record).ticket && <span>單號 {getTrackingRequestMeta(record).ticket}</span>}
                </div>
                {latestEntry?.requestInfo && (
                  <div className="mt-3">
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">單號 / 申請狀態資訊</p>
                      {isExternalUrl(latestEntry.requestInfo) ? (
                        <a
                          href={latestEntry.requestInfo}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-sm font-bold text-cyan-100 underline decoration-cyan-300/60 underline-offset-4 hover:text-cyan-50"
                        >
                          {latestEntry.requestInfo}
                        </a>
                      ) : (
                        <p className="mt-1 break-all text-sm font-bold text-slate-100">{latestEntry.requestInfo}</p>
                      )}
                    </div>
                  </div>
                )}

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
                              {getTrackingStatusDisplayLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tracking-ticket-input">單號</Label>
                      <Input id="tracking-ticket-input" value={requestTicket} onChange={(event) => setRequestTicket(event.target.value)} placeholder="例如：Excel 單號 / ticket 編號" className="border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tracking-request-url-input">連結</Label>
                      <Input id="tracking-request-url-input" value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} placeholder="貼上 request URL，可留空" className="border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tracking-owner-input">更新人</Label>
                      <Input id="tracking-owner-input" value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder="例如：採購 / RD / Peggy" className="border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tracking-request-info-input">申請狀態資訊</Label>
                      <Input id="tracking-request-info-input" value={requestInfo} onChange={(event) => setRequestInfo(event.target.value)} placeholder="Excel 單號 / ticket / request URL" className="border-blue-400/25 bg-[#071522] text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
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
                            {getTrackingStatusDisplayLabel(entry.status)}
                          </span>
                          <div className={cn("mt-2 flex flex-wrap gap-2 text-xs", entryTone.meta)}>
                            {entry.createdAt ? <span>{formatTimestamp(entry.createdAt)}</span> : <span>舊版狀態</span>}
                            {entry.createdBy && <span>更新人 {entry.createdBy}</span>}
                            {entry.requestInfo && (
                              isExternalUrl(entry.requestInfo) ? (
                                <a
                                  href={entry.requestInfo}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-cyan-100 underline decoration-cyan-300/60 underline-offset-4 hover:text-cyan-50"
                                >
                                  單號連結
                                </a>
                              ) : <span>單號 {entry.requestInfo}</span>
                            )}
                            {!entry.requestInfo && entry.requestTicket && <span>單號 {entry.requestTicket}</span>}
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

                      {entry.requestTicket && (
                        entry.requestUrl ? (
                          <a
                            href={normalizeRequestUrl(entry.requestUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex rounded-full border border-amber-300/35 bg-amber-400/16 px-3 py-1.5 text-sm font-bold text-amber-100 hover:bg-amber-400/24"
                          >
                            開啟單號：{entry.requestTicket}
                          </a>
                        ) : (
                          <div className="mt-3 inline-flex rounded-full border border-amber-300/35 bg-amber-400/16 px-3 py-1.5 text-sm font-bold text-amber-100">
                            單號：{entry.requestTicket}
                          </div>
                        )
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
              先用範本整理欄位，再確認 Excel 欄位會對應到網站哪個位置；匯入後再用篩選與狀態追蹤檢查結果。
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

          <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-sky-200">2. 範本欄位與網站欄位對應</h3>
            <p className="mt-1 leading-6 text-slate-400">
              表頭不用完全同名，但建議照範本命名。下面是目前系統會優先辨識的欄位與匯入後的位置。
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-sky-400/15">
              <div className="grid grid-cols-[1fr_1fr_1.4fr] bg-sky-400/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-sky-200">
                <span>Excel 欄位</span>
                <span>網站位置</span>
                <span>用途</span>
              </div>
              {[
                ["Name / Part Name", "主料 / 廠商", "料件名稱，表格第一欄會用來辨識同一組主料。"],
                ["Qty", "數量", "顯示該料件或該組 location 的數量。"],
                ["Ref Des / location", "REF DES", "電路板上的 location，例如 C418、J10、U73。"],
                ["Manufacturer Part Number", "MPN", "廠商料號，主料與替代料都會讀這個欄位。"],
                ["Manufacturer", "廠商", "廠商名稱，會跟 MPN 一起顯示。"],
                ["Sourcing Status", "料況", "Approved、Obsolete、NRND 等供應狀態。"],
                ["Virtual PN / PEGA P/N / TX P/N", "TX", "匯入優先順序是 Virtual PN，再來 PEGA P/N，最後才是 TX P/N；填在主料或替代料都可以，不會寫入狀態追蹤。"],
                ["料號追蹤 / Tracking Note", "狀態追蹤：追蹤說明", "有內容才會建立匯入追蹤；不要再把料況或 CIS/Remark 放進這裡。"],
                ["單號", "狀態追蹤：申請狀態資訊", "申請單、ticket 或 request number。"],
                ["EE", "狀態追蹤：更新人", "只會當成追蹤紀錄的更新人；如果沒有料號追蹤或單號，單填 EE 不會變成黃色追蹤。"],
              ].map(([excelField, appField, usage]) => (
                <div key={excelField} className="grid grid-cols-[1fr_1fr_1.4fr] border-t border-sky-400/10 px-4 py-3 text-sm">
                  <span className="font-bold text-slate-100">{excelField}</span>
                  <span className="font-semibold text-cyan-200">{appField}</span>
                  <span className="leading-6 text-slate-400">{usage}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-5">
            <h3 className="text-lg font-bold text-blue-200">3. Excel 要怎麼排，網站才看得懂</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["一列只放一個廠商料", "同一個 location 如果有 3 個候選 MPN，就要拆成 3 列，不要把 3 個料號塞在同一格。"],
                ["主料與替代料要排在一起", "同一組資料請連續擺放，主料在前，替代料接在後面，避免網站把它拆成不同群組。"],
                ["有藍色起始列就照藍色分組", "如果你的 Excel 有用底色標主料，網站會優先用這個規則；下一個藍色列出現前，都算同一組。"],
                ["Ref Des / location 要寫清楚", "像 `C418`、`J10`、`U73` 這些位號是網站判斷焊位的核心欄位，能填就一定要填。"],
                ["同一組的圖面資料要一致", "Part Spec、Schematic_Part、PCB_Footprint 這些資料，在同一主料與替代料群組裡不要亂變。"],
                ["CIS/Remark 不會匯入追蹤", "CIS/Remark 只保留在你的 Excel 參考，網站不會再把它當成狀態追蹤說明。"],
                ["料況欄請用固定字", "Sourcing Status 建議用 Approved、Active、NRND、Obsolete、Disqualified，中文也能吃，但固定寫法最穩。"],
                ["TX 與追蹤欄可後補", "Virtual PN、PEGA P/N、料號追蹤、單號、EE 不一定要在 Excel 就填好，匯入後也能直接在網站上補；主表 TX 會依序吃 Virtual PN、PEGA P/N、TX P/N。"],
                ["同檔名會覆蓋前一個", "如果你重新上傳同檔名 Excel，網站會直接更新原本那個 BOM；要保留舊版請先改檔名。"],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border border-blue-400/15 bg-[#0a1527] p-4">
                  <p className="font-bold text-slate-100">{title}</p>
                  <p className="mt-2 leading-6 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-emerald-200">4. 上傳後系統怎麼判斷</h3>
            <div className="mt-4 space-y-3 leading-6 text-slate-300">
              <p><strong className="text-slate-100">先找主工作表：</strong>如果檔案裡有很多 sheet，系統會挑欄位最完整、有效資料最多的那一張來讀。</p>
              <p><strong className="text-slate-100">再判斷分組：</strong>有藍色列就先照藍色列；沒有藍色列才退回用 Ref Group、Ref Des、料名等欄位去猜。</p>
              <p><strong className="text-slate-100">再判斷可用料：</strong>一列如果有可用的內部料號，或你已經填了 TX，系統就不會把它當成完全無料。</p>
              <p><strong className="text-slate-100">TX 怎麼顯示：</strong>同一組主料與替代料只要有任一列有值，主表 TX 會依序優先顯示 `Virtual PN`、`PEGA P/N`、`TX P/N`。</p>
              <p><strong className="text-slate-100">黃色追蹤何時出現：</strong>只有 `料號追蹤` 或 `單號` 有內容時，才會建立匯入追蹤；單填 `EE` 不會變黃。</p>
              <p><strong className="text-slate-100">你看到的主料總表：</strong>是一行一個主料群組，展開後才會看到下面所有替代料與追蹤資訊。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5">
            <h3 className="text-lg font-bold text-amber-200">5. 實際操作流程</h3>
            <ol className="mt-3 space-y-2 leading-6 text-slate-300">
              <li>1. 先把單一專案 / 單一版本 BOM 整理成一個 Excel 檔。</li>
              <li>2. 按「上傳 BOM」匯入；可以一次選多個檔。相同檔名會覆蓋原本 BOM，不同檔名才會建立新的 BOM 工作區。</li>
              <li>3. 匯入後先看上方統計數字，再用表頭篩選檢查 `REF DES`、`MPN`、`內部料號`、`TX`、`狀態追蹤`。</li>
              <li>4. 如果某組料需要補 `TX` 可直接在表格內填；如果要補 `料號追蹤`、`單號` 或圖片，就到「狀態追蹤」欄位新增紀錄。</li>
              <li>5. 要切不同版本或不同專案，直接用上方 BOM 切換器，或進 `BOM管理` 看所有歷史 BOM。</li>
              <li>6. 確認畫面篩選結果沒問題後，再用「匯出結果」下載你目前看到的結果。</li>
            </ol>
          </section>

          <section className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-rose-200">6. 常見錯誤先看這裡</h3>
            <div className="mt-3 space-y-3 leading-6 text-slate-300">
              <p><strong className="text-slate-100">搜不到資料：</strong>先按右上角或表頭的「清除」，很多時候是舊篩選還留著，不是真的沒有資料。</p>
              <p><strong className="text-slate-100">TX 沒顯示：</strong>先確認 Excel 欄名是不是 `Virtual PN`、`PEGA P/N` 或 `TX P/N`；系統會先吃 `Virtual PN`，空白才退回後面的欄位。</p>
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

function BomPageTrackerDialog({
  workspace,
  open,
  onOpenChange,
  onSave,
}: {
  workspace: BomWorkspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workspaceId: string, pageTracker: BomPageTracker) => Promise<void>;
}) {
  const [totalPagesInput, setTotalPagesInput] = useState("0");
  const [currentPageInput, setCurrentPageInput] = useState("0");
  const [rangeStartInput, setRangeStartInput] = useState("1");
  const [rangeEndInput, setRangeEndInput] = useState("1");
  const [pages, setPages] = useState<BomPageTrackerPage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !workspace) return;

    const summary = getBomPageTrackerSummary(workspace.pageTracker);
    setTotalPagesInput(String(summary.totalPages));
    setCurrentPageInput(String(summary.currentPage));
    const defaultRangePage = summary.currentPage > 0
      ? summary.currentPage
      : summary.totalPages > 0
        ? 1
        : 0;
    setRangeStartInput(String(defaultRangePage));
    setRangeEndInput(String(defaultRangePage));
    setPages(syncBomTrackerPages(workspace.pageTracker?.pages ?? [], summary.totalPages));
    setIsSaving(false);
  }, [open, workspace?.id, workspace?.pageTracker?.updatedAt]);

  if (!workspace) return null;

  const totalPages = clampBomTrackerPageCount(Number(totalPagesInput || 0));
  const currentPage = totalPages > 0
    ? Math.min(totalPages, clampBomTrackerPageCount(Number(currentPageInput || 0)))
    : 0;
  const rawRangeStart = clampBomTrackerPageCount(Number(rangeStartInput || 0));
  const rawRangeEnd = clampBomTrackerPageCount(Number(rangeEndInput || 0));
  const rangeStartPage = totalPages > 0 && rawRangeStart > 0 ? Math.min(totalPages, rawRangeStart) : 0;
  const rangeEndPage = totalPages > 0 && rawRangeEnd > 0 ? Math.min(totalPages, rawRangeEnd) : 0;
  const rangeSelectionStart = rangeStartPage > 0 && rangeEndPage > 0 ? Math.min(rangeStartPage, rangeEndPage) : 0;
  const rangeSelectionEnd = rangeStartPage > 0 && rangeEndPage > 0 ? Math.max(rangeStartPage, rangeEndPage) : 0;
  const rangeSelectionCount = rangeSelectionStart > 0 && rangeSelectionEnd > 0
    ? rangeSelectionEnd - rangeSelectionStart + 1
    : 0;
  const syncedPages = syncBomTrackerPages(pages, totalPages);
  const visiblePages = syncedPages.filter((page) => page.pageNumber <= totalPages);
  const completedPages = visiblePages.filter((page) => page.status !== "pending").length;
  const completionRate = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

  const updatePage = (pageNumber: number, patch: Partial<BomPageTrackerPage>) => {
    setPages((current) =>
      syncBomTrackerPages(current, Math.max(totalPages, pageNumber)).map((page) =>
        page.pageNumber === pageNumber ? { ...page, ...patch } : page
      )
    );
  };

  const applyRangeStatus = (status: BomPageTrackerStatus) => {
    if (rangeSelectionCount === 0) return;

    startTransition(() => {
      setPages((current) =>
        syncBomTrackerPages(current, Math.max(totalPages, rangeSelectionEnd)).map((page) => (
          page.pageNumber >= rangeSelectionStart && page.pageNumber <= rangeSelectionEnd
            ? { ...page, status }
            : page
        ))
      );
    });

    if (status !== "pending" && (currentPage === 0 || rangeSelectionEnd > currentPage)) {
      setCurrentPageInput(String(rangeSelectionEnd));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(workspace.id, {
        totalPages,
        currentPage,
        pages: syncedPages,
        updatedAt: new Date().toISOString(),
      });
      onOpenChange(false);
    } catch {
      // Save handler already shows the error toast.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">BOM 頁數追蹤</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            先填這份 BOM 一共有幾頁，再逐頁切換狀態，最後補每一頁備註。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-black text-slate-50">{workspace.name}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {workspace.payload.sheetName} · {workspace.payload.recordCount.toLocaleString()} 筆料件
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BomPageTrackerSummaryPill pageTracker={{ totalPages, currentPage, pages: syncedPages, updatedAt: workspace.pageTracker?.updatedAt ?? workspace.updatedAt }} />
                  <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
                    完成率 {completionRate}%
                  </span>
                  {currentPage > 0 && (
                    <span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-bold text-blue-100">
                      目前做到第 {currentPage} 頁
                    </span>
                  )}
                </div>
              </div>

              <div className="grid w-full gap-3 md:max-w-[440px] md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bom-total-pages">總頁數</Label>
                  <Input
                    id="bom-total-pages"
                    type="number"
                    min={0}
                    max={MAX_BOM_TRACKER_PAGES}
                    step={1}
                    value={totalPagesInput}
                    onChange={(event) => setTotalPagesInput(event.target.value)}
                    placeholder="例如 12"
                    className="h-10 border-blue-400/20 bg-[#111f36] text-slate-100"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    可填 0 到 {MAX_BOM_TRACKER_PAGES} 頁；若頁數調小，原本後面頁面的備註會先保留不刪掉。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bom-current-page">目前做到第幾頁</Label>
                  <Input
                    id="bom-current-page"
                    type="number"
                    min={0}
                    max={Math.max(totalPages, MAX_BOM_TRACKER_PAGES)}
                    step={1}
                    value={currentPageInput}
                    onChange={(event) => setCurrentPageInput(event.target.value)}
                    placeholder={totalPages > 0 ? `1 ~ ${totalPages}` : "先設定總頁數"}
                    disabled={totalPages === 0}
                    className="h-10 border-blue-400/20 bg-[#111f36] text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    這裡記錄你現在畫到哪一頁；主畫面會直接顯示這個進度。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-400/20 bg-[#101d33] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-black text-slate-50">逐頁完成狀態</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  每頁先按狀態，再補「卡在哪裡、已送誰、還缺什麼」。
                </p>
              </div>
              <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-bold text-blue-100">
                {completedPages} / {totalPages} 頁
              </span>
            </div>

            {totalPages === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-blue-400/20 bg-[#0b1322] px-6 py-12 text-center">
                <p className="text-lg font-bold text-slate-200">先填總頁數</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  設定好這份 BOM 一共有幾頁之後，下面就會自動展開逐頁勾選與備註欄位。
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-base font-black text-slate-50">批次套用頁數狀態</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        填好起訖頁後，可以整段一起標成已完成，不用一頁頁點。原本備註會保留，只改狀態。
                      </p>
                    </div>
                    {rangeSelectionCount > 0 ? (
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                        目前選取第 {rangeSelectionStart} ~ {rangeSelectionEnd} 頁，共 {rangeSelectionCount} 頁
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-500/25 bg-slate-500/10 px-3 py-1 text-xs font-bold text-slate-300">
                        先填起始頁與結束頁
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,140px)_minmax(0,140px)_1fr]">
                    <div className="space-y-2">
                      <Label htmlFor="bom-range-start">起始頁</Label>
                      <Input
                        id="bom-range-start"
                        type="number"
                        min={1}
                        max={Math.max(totalPages, 1)}
                        step={1}
                        value={rangeStartInput}
                        onChange={(event) => setRangeStartInput(event.target.value)}
                        placeholder="例如 1"
                        className="h-10 border-emerald-400/20 bg-[#111f36] text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-range-end">結束頁</Label>
                      <Input
                        id="bom-range-end"
                        type="number"
                        min={1}
                        max={Math.max(totalPages, 1)}
                        step={1}
                        value={rangeEndInput}
                        onChange={(event) => setRangeEndInput(event.target.value)}
                        placeholder={totalPages > 0 ? `1 ~ ${totalPages}` : "先填總頁數"}
                        className="h-10 border-emerald-400/20 bg-[#111f36] text-slate-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>一鍵套用狀態</Label>
                      <div className="flex flex-wrap gap-2">
                        {BOM_PAGE_STATUS_OPTIONS.map((option) => (
                          <Button
                            key={`range-${option.value}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => applyRangeStatus(option.value)}
                            disabled={rangeSelectionCount === 0}
                            className={cn(
                              "h-10 px-4 text-xs font-bold disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/20 disabled:text-slate-500",
                              option.idleClassName,
                            )}
                          >
                            第 {rangeSelectionStart || "?"} ~ {rangeSelectionEnd || "?"} 頁設為{option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <ScrollArea className="h-[52vh] rounded-2xl border border-blue-400/15 bg-[#0b1322]">
                  <div className="space-y-3 p-3">
                  {visiblePages.map((page) => (
                    (() => {
                      const statusMeta = getBomPageStatusMeta(page.status);

                      return (
                        <div
                          key={page.pageNumber}
                          className={cn(
                            "rounded-2xl border px-4 py-3 transition-colors",
                            page.pageNumber === currentPage
                              ? "border-cyan-300/30 bg-cyan-400/[0.08]"
                              : statusMeta.cardClassName,
                          )}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className={cn("text-base font-black", statusMeta.textClassName)}>第 {page.pageNumber} 頁</span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-200">
                                  {statusMeta.label}
                                </span>
                                {page.pageNumber === currentPage ? (
                                  <span className="rounded-full border border-cyan-300/35 bg-cyan-400/16 px-2.5 py-1 text-xs font-bold text-cyan-100">
                                    目前頁
                                  </span>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPageInput(String(page.pageNumber))}
                                    className="h-8 border-cyan-400/20 bg-cyan-400/10 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-400/16"
                                  >
                                    設為目前頁
                                  </Button>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {BOM_PAGE_STATUS_OPTIONS.map((option) => (
                                  <Button
                                    key={option.value}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      updatePage(page.pageNumber, { status: option.value });
                                      if (currentPage === 0 || page.pageNumber > currentPage) {
                                        setCurrentPageInput(String(page.pageNumber));
                                      }
                                    }}
                                    className={cn(
                                      "h-8 px-3 text-xs font-bold",
                                      page.status === option.value ? option.activeClassName : option.idleClassName,
                                    )}
                                  >
                                    {option.label}
                                  </Button>
                                ))}
                              </div>
                            </div>

                            <Input
                              value={page.note}
                              onChange={(event) => {
                                updatePage(page.pageNumber, { note: event.target.value });
                                if (currentPage === 0 || page.pageNumber > currentPage) {
                                  setCurrentPageInput(String(page.pageNumber));
                                }
                              }}
                              placeholder="先按狀態，再補備註，例如：缺 A 料、等 RD 回覆、已送審"
                              className="h-10 border-blue-400/20 bg-[#111f36] text-slate-100 placeholder:text-slate-500"
                            />
                          </div>
                        </div>
                      );
                    })()
                  ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-blue-400/20 bg-blue-400/10 text-slate-200 hover:bg-blue-400/20"
          >
            先關閉
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isSaving ? "儲存中..." : "儲存頁數追蹤"}
          </Button>
        </DialogFooter>
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
  onOpenPageTracker,
  onSelect,
}: {
  activeBomId: string;
  bomWorkspaces: BomWorkspace[];
  open: boolean;
  onDelete: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onOpenPageTracker: (workspaceId: string) => void;
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
            const pageTrackerSummary = getBomPageTrackerSummary(workspace.pageTracker);
            const hasTracking = workspaceHasTrackingActivity(workspace);

            return (
              <div
                key={workspace.id}
                className={cn(
                  "rounded-2xl border px-4 py-4 transition-colors",
                  isActive
                    ? hasTracking
                      ? "border-amber-300/45 bg-amber-400/12 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
                      : "border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.08)]"
                    : hasTracking
                      ? "border-amber-400/24 bg-amber-400/[0.07] hover:bg-amber-400/[0.11]"
                      : "border-blue-400/15 bg-[#101d33] hover:bg-[#13223b]"
                )}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-black text-blue-100">
                        #{index + 1}
                      </span>
                      <p className="min-w-0 flex-1 line-clamp-2 break-all text-lg font-black leading-6 text-slate-50">{workspace.name}</p>
                      <BomPageTrackerSummaryPill pageTracker={workspace.pageTracker} />
                      {isActive && (
                        <span className="rounded-full border border-cyan-300/35 bg-cyan-400/15 px-2 py-0.5 text-[11px] font-black text-cyan-100">
                          目前使用中
                        </span>
                      )}
                      {hasTracking && (
                        <span className="rounded-full border border-amber-300/35 bg-amber-400/16 px-2 py-0.5 text-[11px] font-black text-amber-100">
                          含狀態追蹤
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
                      <div className="rounded-xl border border-blue-400/10 bg-[#0b1322] px-3 py-2.5">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">頁數追蹤</p>
                        <p className="mt-1.5 text-[13px] font-semibold leading-5 text-slate-200">
                          {pageTrackerSummary.totalPages > 0
                            ? `${pageTrackerSummary.currentPage > 0 ? `目前第 ${pageTrackerSummary.currentPage} / ${pageTrackerSummary.totalPages} 頁 · ` : ""}已完成 ${pageTrackerSummary.completedPages} 頁`
                            : "尚未設定頁數"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 xl:w-[260px] xl:justify-end xl:pl-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenPageTracker(workspace.id)}
                      className="h-9 border-emerald-400/25 bg-emerald-400/10 px-3 text-[13px] font-bold text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-100"
                    >
                      頁數設定
                    </Button>
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
              <div className="space-y-2">
                <Label htmlFor="material-request-ticket">單號</Label>
                <Input id="material-request-ticket" disabled={readOnly} value={form.requestTicket ?? ""} onChange={(event) => updateField("requestTicket", event.target.value)} placeholder="例如 Excel 單號 / ticket" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="material-request-url">單號連結</Label>
                <Input id="material-request-url" disabled={readOnly} value={form.requestUrl ?? ""} onChange={(event) => updateField("requestUrl", event.target.value)} placeholder="可貼上 request URL" />
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
                  {getTrackingRequestMeta(form).ticket && (
                    <p className="mt-2 text-xs text-amber-200">
                      單號：{getTrackingRequestMeta(form).ticket}
                    </p>
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
      <td colSpan={11} className="p-0">
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
  itemValue,
  isMarked,
  colorTheme,
  onCopy,
  onView,
  onEdit,
  onSaveVirtual,
  onOpenTracking,
  onToggleMarked,
}: {
  group: MaterialGroup;
  records: MaterialRecord[];
  primaryRecord: MaterialRecord;
  itemValue: number;
  isMarked: boolean;
  colorTheme: BomTableColorTheme;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
  onSaveVirtual: (record: MaterialRecord, value: string) => void;
  onOpenTracking: (record: MaterialRecord) => void;
  onToggleMarked: () => void;
}) {
  const alternatives = records.filter((record) => record.id !== primaryRecord.id);
  const groupRefDes = primaryRecord.refDes || primaryRecord.refGroup || "-";

  return (
    <>
      {alternatives.map((record, index) => {
        const preferred = record.isPreferred;
        const rowColor = preferred ? colorTheme.alternative : colorTheme.secondary;
        const rowStyle = {
          ...buildTableRowStyle(rowColor, {
            backgroundAlpha: preferred ? 0.18 : 0.12,
            hoverAlpha: preferred ? 0.26 : 0.18,
            accentAlpha: 0.9,
          }),
          boxShadow: `inset 4px 0 0 ${withAlpha(rowColor, 0.9)}`,
        } as CSSProperties;

        return (
          <tr
            key={record.id}
            style={rowStyle}
            className={cn(
              "border-b border-blue-400/10 text-slate-200 transition-colors",
              "bg-[var(--material-row-bg)] hover:bg-[var(--material-row-hover)]"
            )}
          >
            <td className="border-r border-blue-400/10 px-3 py-3.5 text-center align-middle">
              <div className="flex flex-col items-center justify-center">
                <span className="font-mono text-base font-black text-slate-100">{itemValue}</span>
                <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300/85">Alt</span>
              </div>
            </td>

            <td className="border-r border-blue-400/10 px-2 py-3.5 text-center align-middle">
              <button
                type="button"
                onClick={onToggleMarked}
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                  isMarked
                    ? "border-amber-300/40 bg-amber-400/18 text-amber-200 hover:bg-amber-400/24"
                    : "border-slate-500/25 bg-slate-900/35 text-slate-500 hover:border-amber-300/24 hover:bg-amber-400/10 hover:text-amber-200",
                )}
                title={isMarked ? "移除我的標記" : "加入我的標記"}
              >
                <Star className={cn("h-4.5 w-4.5", isMarked && "fill-current")} />
              </button>
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <div className="flex items-center gap-3 pl-8">
                <span
                  className={cn("flex h-8 min-w-8 items-center justify-center rounded-lg font-mono text-sm font-black", preferred ? "text-slate-950" : "text-slate-100")}
                  style={{ backgroundColor: preferred ? withAlpha(colorTheme.alternative, 0.92) : withAlpha(colorTheme.secondary, 0.46) }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-bold text-slate-50">{record.manufacturer || "未填廠商"}</p>
                    {preferred && (
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold text-slate-50"
                        style={{
                          border: `1px solid ${withAlpha(colorTheme.alternative, 0.45)}`,
                          backgroundColor: withAlpha(colorTheme.alternative, 0.28),
                        }}
                      >
                        可用替代・OK + 00
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 text-xs", preferred ? "text-slate-200" : "text-slate-400")}>替代料 #{index + 1}</p>
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

function BomTableColorDialog({
  open,
  theme,
  workspaceName,
  onOpenChange,
  onThemeChange,
  onReset,
  onApply,
}: {
  open: boolean;
  theme: BomTableColorTheme;
  workspaceName: string;
  onOpenChange: (open: boolean) => void;
  onThemeChange: (key: keyof BomTableColorTheme, value: string) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-blue-400/20 bg-[#0a1324] text-slate-100 sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white">自訂表格配色</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-400">
            目前只會套用到 BOM「{workspaceName}」，會同步儲存並分享給開啟這份 BOM 的其他人。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {BOM_TABLE_COLOR_FIELDS.map((field) => (
            <div
              key={field.key}
              className="rounded-2xl border border-blue-400/15 bg-slate-950/40 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label className="text-sm font-bold text-slate-100">{field.label}</Label>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{field.description}</p>
                </div>
                <span
                  className="h-10 w-10 flex-none rounded-xl border border-white/10 shadow-[0_0_24px_rgba(15,23,42,0.24)]"
                  style={{ backgroundColor: theme[field.key] }}
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Input
                  type="color"
                  value={theme[field.key]}
                  onChange={(event) => onThemeChange(field.key, event.target.value)}
                  className="h-12 w-16 cursor-pointer border-blue-400/20 bg-[#0c1b31] p-1"
                />
                <Input
                  value={theme[field.key]}
                  readOnly
                  className="h-12 border-blue-400/20 bg-[#0c1b31] font-mono text-base font-bold tracking-[0.04em] text-slate-100"
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            className="border-blue-400/20 bg-blue-400/10 text-slate-200 hover:bg-blue-400/20"
          >
            還原預設
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-500/25 bg-slate-800/60 text-slate-300 hover:bg-slate-700/80"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onApply}
              className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            >
              套用到目前 BOM
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MaterialRequestPage() {
  const [bomWorkspaces, setBomWorkspaces] = useState<BomWorkspace[]>(() => [createDefaultBomWorkspace()]);
  const [collaborationStatus, setCollaborationStatus] = useState<CollaborationStatus>("checking");
  const [activeBomId, setActiveBomId] = useState(loadActiveBomId);
  const [markedGroupKeys, setMarkedGroupKeys] = useState<string[]>(() => loadMarkedGroups(loadActiveBomId()));
  const [showMarkedOnly, setShowMarkedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<MaterialColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const [tableColorDialogOpen, setTableColorDialogOpen] = useState(false);
  const [tableColorDraft, setTableColorDraft] = useState<BomTableColorTheme>(DEFAULT_BOM_TABLE_COLOR_THEME);
  const [isImporting, setIsImporting] = useState(false);
  const [bomManagerOpen, setBomManagerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [editorRecord, setEditorRecord] = useState<MaterialWorkbookRecord>(createRecordTemplate());
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackingRecord, setTrackingRecord] = useState<MaterialRecord | null>(null);
  const [pageTrackerDialogOpen, setPageTrackerDialogOpen] = useState(false);
  const [pageTrackerWorkspaceId, setPageTrackerWorkspaceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceSyncRequestRef = useRef(0);
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();
  const isCollaborativeReady = collaborationStatus === "remote";
  const canManageBomPageTracker = collaborationStatus !== "checking" && collaborationStatus !== "error";
  const collaborationStatusMeta = useMemo(
    () => getCollaborationStatusMeta(collaborationStatus),
    [collaborationStatus],
  );

  const activeWorkspace = bomWorkspaces.find((workspace) => workspace.id === activeBomId) ?? bomWorkspaces[0];
  const activeTableColorTheme = useMemo(
    () => normalizeBomTableColorTheme(activeWorkspace.tableColorTheme),
    [activeWorkspace.tableColorTheme],
  );
  const pageTrackerWorkspace = bomWorkspaces.find((workspace) => workspace.id === (pageTrackerWorkspaceId ?? activeBomId)) ?? activeWorkspace;
  const basePayload = activeWorkspace.payload;
  const activePageTrackerSummary = useMemo(
    () => getBomPageTrackerSummary(activeWorkspace.pageTracker),
    [activeWorkspace.pageTracker],
  );
  const [pageTrackerQuickTotalInput, setPageTrackerQuickTotalInput] = useState("0");
  const [pageTrackerQuickCurrentInput, setPageTrackerQuickCurrentInput] = useState("0");
  const [pageTrackerQuickSaving, setPageTrackerQuickSaving] = useState(false);
  const [pageTrackerPanelCollapsed, setPageTrackerPanelCollapsed] = useState(true);
  const activePageTrackerCurrentNote = activePageTrackerSummary.currentPageEntry?.note.trim() ?? "";
  const activePageTrackerCurrentStatus = activePageTrackerSummary.currentPageEntry?.status ?? "pending";
  const activePageTrackerCurrentStatusMeta = getBomPageStatusMeta(activePageTrackerCurrentStatus);

  const dataset = useMemo<MaterialDataset>(
    () => buildMaterialDataset(basePayload),
    [basePayload]
  );

  useEffect(() => {
    if (!tableColorDialogOpen) return;
    setTableColorDraft(activeTableColorTheme);
  }, [activeTableColorTheme, tableColorDialogOpen]);
  const validGroupKeys = useMemo(
    () => new Set(dataset.groups.map((group) => group.key)),
    [dataset.groups],
  );
  const markedGroupKeySet = useMemo(
    () => new Set(markedGroupKeys),
    [markedGroupKeys],
  );
  const markedGroupCount = useMemo(
    () => dataset.groups.filter((group) => markedGroupKeySet.has(group.key)).length,
    [dataset.groups, markedGroupKeySet],
  );

  useEffect(() => {
    setPageTrackerQuickTotalInput(String(activePageTrackerSummary.totalPages));
    setPageTrackerQuickCurrentInput(String(activePageTrackerSummary.currentPage));
    setPageTrackerQuickSaving(false);
  }, [activeWorkspace.id, activeWorkspace.pageTracker?.updatedAt, activePageTrackerSummary.currentPage, activePageTrackerSummary.totalPages]);

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
    try {
      const result = await loadBomWorkspacesDetailed();
      if (requestId !== workspaceSyncRequestRef.current) {
        return result.workspaces;
      }

      setCollaborationStatus(result.mode);
      applyLoadedWorkspaces(result.workspaces, preferredBomId);
      return result.workspaces;
    } catch (error) {
      if (requestId === workspaceSyncRequestRef.current) {
        setCollaborationStatus("error");
      }
      throw error;
    }
  }, [applyLoadedWorkspaces]);

  useEffect(() => {
    let active = true;
    const syncWorkspaces = async (preferredBomId?: string) => {
      const requestId = ++workspaceSyncRequestRef.current;
      try {
        const result = await loadBomWorkspacesDetailed();
        if (!active || requestId !== workspaceSyncRequestRef.current) return;
        setCollaborationStatus(result.mode);
        applyLoadedWorkspaces(result.workspaces, preferredBomId);
      } catch {
        if (!active || requestId !== workspaceSyncRequestRef.current) return;
        setCollaborationStatus("error");
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
    setMarkedGroupKeys(loadMarkedGroups(activeBomId));
  }, [activeBomId]);

  useEffect(() => {
    setMarkedGroupKeys((current) => {
      const normalized = current.filter((key) => validGroupKeys.has(key));
      return normalized.length === current.length ? current : normalized;
    });
  }, [validGroupKeys]);

  useEffect(() => {
    saveMarkedGroups(activeBomId, markedGroupKeys);
  }, [activeBomId, markedGroupKeys]);

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
  const groupRuntimeIndex = useMemo(() => {
    const searchableTextByGroup = new Map<string, string>();
    const exactRefTokensByGroup = new Map<string, Set<string>>();
    const sortedRecordsByGroup = new Map<string, MaterialRecord[]>();
    const uniqueMpnCountByGroup = new Map<string, number>();
    const recordColumnsByRecordId = new Map<string, CachedRecordColumnValues>();

    dataset.groups.forEach((group) => {
      const sortedRecords = getSortedAlternatives(group);
      const uniqueMpnCount = getUniqueMpnCountForRecords(group.records);
      const mustApply = requiresApplication(group);
      const noAlternative = uniqueMpnCount <= 1;
      const alternativeSearchText = noAlternative
        ? "單一料 無替代料 單一來源 single source no alternative"
        : "有替代料 multiple source alternative";
      const applicationSearchText = mustApply
        ? "完全無料 主料與替代都無料 待申請料 必須申請 must apply no usable material"
        : "至少一顆可用料 有可用替代 remark ok 尾數 00 或 zz 或 zy usable material";

      searchableTextByGroup.set(group.key, `${group.searchText} ${alternativeSearchText} ${applicationSearchText}`);
      exactRefTokensByGroup.set(
        group.key,
        new Set(
          [
            group.displayRef,
            ...group.records.flatMap((record) => [record.refDes, record.refGroup]),
          ]
            .flatMap((value) => splitRefDesignators(value))
            .map((value) => value.toLowerCase()),
        ),
      );
      sortedRecordsByGroup.set(group.key, sortedRecords);
      uniqueMpnCountByGroup.set(group.key, uniqueMpnCount);

      group.records.forEach((record) => {
        const latestTrackingEntry = getLatestTrackingEntry(record);
        const splitRefs = splitRefDesignators(record.refDes);
        const refValues = splitRefs.length > 0
          ? splitRefs
          : splitRefDesignators(record.refGroup, group.displayRef);

        recordColumnsByRecordId.set(record.id, {
          material: createCachedColumnValues([
            group.displayRef,
            group.name,
            group.assemblyName,
            record.manufacturer,
            record.refDes,
            record.refGroup,
          ]),
          refDes: createCachedColumnValues(refValues),
          mpn: createCachedColumnValues([record.manufacturerPartNumber, record.manufacturerPartNumberAlt]),
          internal: createCachedColumnValues([record.partNumber, record.schematicPart, record.pcbFootprint]),
          virtualAlternative: createCachedColumnValues([record.virtualAlternative ?? ""]),
          trackingStatus: createCachedColumnValues([
            getTrackingWorkflowStatus(record),
            latestTrackingEntry?.note ?? "",
            latestTrackingEntry?.createdBy ?? "",
            latestTrackingEntry?.requestInfo ?? "",
          ]),
          specification: createCachedColumnValues([
            group.partSpec,
            group.partName,
            group.schematicPart,
            group.footprint,
            record.partSpec,
            record.partName,
            record.remark,
          ]),
        });
      });
    });

    return {
      exactRefTokensByGroup,
      recordColumnsByRecordId,
      searchableTextByGroup,
      sortedRecordsByGroup,
      uniqueMpnCountByGroup,
    };
  }, [dataset.groups]);

  const columnFilterSets = useMemo(
    () => FILTER_KEYS.reduce((result, key) => {
      const normalized = normalizeColumnFilterSelection(columnFilters[key]);
      result[key] = normalized === null ? null : new Set(normalized);
      return result;
    }, {} as Record<ColumnFilterKey, Set<string> | null>),
    [columnFilters],
  );

  const matchesSearch = useCallback((group: MaterialGroup) => {
    const searchableText = groupRuntimeIndex.searchableTextByGroup.get(group.key) ?? group.searchText;
    const exactRefTokens = groupRuntimeIndex.exactRefTokensByGroup.get(group.key) ?? new Set<string>();

    return searchTokens.every((token) => {
      if (isExactRefDesToken(token)) {
        return exactRefTokens.has(token);
      }

      return searchableText.includes(token);
    });
  }, [groupRuntimeIndex, searchTokens]);

  const matchesAvailability = useCallback((group: MaterialGroup) => {
    const noAlternative = (groupRuntimeIndex.uniqueMpnCountByGroup.get(group.key) ?? 0) <= 1;
    const mustApply = requiresApplication(group);

    return (
      availability === "all" ||
      (availability === "usable" && !mustApply) ||
      (availability === "required" && mustApply) ||
      (availability === "pending" && group.pendingCount > 0) ||
      (availability === "risk" && group.riskCount > 0) ||
      (availability === "single" && noAlternative)
    );
  }, [availability, groupRuntimeIndex.uniqueMpnCountByGroup]);

  const matchesMarkedState = useCallback((group: MaterialGroup) => {
    return !showMarkedOnly || markedGroupKeySet.has(group.key);
  }, [markedGroupKeySet, showMarkedOnly]);

  const getMatchingRecords = useCallback((group: MaterialGroup, ignoredKey?: ColumnFilterKey) => {
    const sortedRecords = groupRuntimeIndex.sortedRecordsByGroup.get(group.key) ?? getSortedAlternatives(group);

    return sortedRecords.filter((record) =>
      FILTER_KEYS.every((key) => {
        if (key === ignoredKey) return true;

        const cachedValues = groupRuntimeIndex.recordColumnsByRecordId.get(record.id)?.[key]
          ?? createCachedColumnValues(getRecordColumnValues(record, group, key));
        const selectedSet = columnFilterSets[key];

        if (selectedSet !== null && !cachedValues.raw.some((value) => selectedSet.has(value))) {
          return false;
        }

        return true;
      })
    );
  }, [columnFilterSets, groupRuntimeIndex]);

  const searchAvailabilityGroups = useMemo(
    () => dataset.groups.filter((group) => matchesMarkedState(group) && matchesSearch(group) && matchesAvailability(group)),
    [dataset.groups, matchesAvailability, matchesMarkedState, matchesSearch],
  );

  const columnFilterOptions = useMemo(() => {
    return FILTER_KEYS.reduce((result, key) => {
      const valueGroups = searchAvailabilityGroups
        .flatMap((group) => getMatchingRecords(group, key).map((record) => getRecordColumnValues(record, group, key)));

      result[key] = key === "trackingStatus"
        ? buildTrackingStatusFilterOptions(valueGroups)
        : buildExcelFilterOptions(valueGroups);
      return result;
    }, {} as Record<ColumnFilterKey, ExcelFilterOption[]>);
  }, [getMatchingRecords, searchAvailabilityGroups]);

  const filteredGroups = useMemo(() => {
    const result = searchAvailabilityGroups.filter((group) => {
      return getMatchingRecords(group).length > 0;
    });

    return [...result].sort((left, right) => {
      const leftUniqueMpnCount = groupRuntimeIndex.uniqueMpnCountByGroup.get(left.key) ?? getUniqueMpnCount(left);
      const rightUniqueMpnCount = groupRuntimeIndex.uniqueMpnCountByGroup.get(right.key) ?? getUniqueMpnCount(right);
      const leftNoAlternative = leftUniqueMpnCount <= 1;
      const rightNoAlternative = rightUniqueMpnCount <= 1;

      if (sortMode === "single-source" && leftNoAlternative !== rightNoAlternative) {
        return leftNoAlternative ? -1 : 1;
      }
      if (sortMode === "alternatives" && leftUniqueMpnCount !== rightUniqueMpnCount) {
        return rightUniqueMpnCount - leftUniqueMpnCount;
      }
      if (sortMode === "approved" && left.approvedCount !== right.approvedCount) {
        return right.approvedCount - left.approvedCount;
      }
      if (sortMode === "pending" && left.pendingCount !== right.pendingCount) {
        return right.pendingCount - left.pendingCount;
      }
      return left.displayRef.localeCompare(right.displayRef, undefined, { numeric: true });
    });
  }, [getMatchingRecords, groupRuntimeIndex.uniqueMpnCountByGroup, searchAvailabilityGroups, sortMode]);

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
      const virtualAlternativeRecord = getBestVirtualAlternativeRecord(
        matchingRecords.length > 0 ? matchingRecords : group.records,
        primaryAlternative,
      );
      const secondaryAlternatives = matchingRecords.slice(primaryAlternative ? 1 : 0);
      const trackingRecord = getBestTrackingRecord(matchingRecords.length > 0 ? matchingRecords : group.records, primaryAlternative);

      return {
        group,
        matchingRecords,
        primaryAlternative,
        virtualAlternativeRecord,
        trackingRecord,
        secondaryAlternatives,
        uniqueMpnCount: getUniqueMpnCountForRecords(matchingRecords),
      };
    }),
    [getMatchingRecords, visibleGroups],
  );

  useEffect(() => {
    setPage(1);
  }, [availability, columnFilters, deferredQuery, pageSize, showMarkedOnly, sortMode]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (searchTokens.length > 0 && filteredGroups.length === 1) {
      setExpandedKey(filteredGroups[0].key);
    }
  }, [filteredGroups, searchTokens.length]);

  const pageTrackerQuickTotalPages = clampBomTrackerPageCount(Number(pageTrackerQuickTotalInput || 0));
  const pageTrackerQuickCurrentPage = pageTrackerQuickTotalPages > 0
    ? Math.min(pageTrackerQuickTotalPages, clampBomTrackerPageCount(Number(pageTrackerQuickCurrentInput || 0)))
    : 0;
  const pageTrackerQuickDirty = (
    pageTrackerQuickTotalPages !== activePageTrackerSummary.totalPages ||
    pageTrackerQuickCurrentPage !== activePageTrackerSummary.currentPage
  );

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
    const title = collaborationStatus === "error"
      ? "多人同步暫時異常"
      : collaborationStatus === "checking"
        ? "正在檢查共享狀態"
        : "多人同步未啟用";
    toast({
      title,
      description: collaborationStatusMeta.bannerText || collaborationStatusMeta.description,
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
        const workspaceId = createBomId(file.name);
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

  const openBomPageTrackerDialog = (workspaceId = activeBomId) => {
    if (!canManageBomPageTracker) {
      showCollaborativeUnavailableToast();
      return;
    }

    setPageTrackerWorkspaceId(workspaceId);
    setPageTrackerDialogOpen(true);
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
      await saveRecordToActiveBom({
        ...record,
        requestUrl: normalizeRequestUrl(record.requestUrl ?? ""),
      });
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
      requestTicket: entry.requestTicket?.trim() || record.requestTicket || "",
      requestUrl: normalizeRequestUrl(entry.requestUrl?.trim() || record.requestUrl || ""),
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

  const saveBomPageTracker = async (workspaceId: string, pageTracker: BomPageTracker) => {
    const workspace = bomWorkspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found.`);
    }
    const pageTrackerSummary = getBomPageTrackerSummary(pageTracker);

    const nextWorkspace: BomWorkspace = {
      ...workspace,
      pageTracker,
    };
    replaceBomWorkspace(nextWorkspace);

    try {
      await saveBomWorkspacePageTracker(workspaceId, pageTracker);
      toast({
        title: "頁數追蹤已更新",
        description: `${workspace.name} · ${pageTrackerSummary.currentPage > 0 ? `目前第 ${pageTrackerSummary.currentPage} / ${pageTrackerSummary.totalPages} 頁 · ` : ""}已完成 ${pageTrackerSummary.completedPages} 頁`,
      });
    } catch (error) {
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({
        title: "頁數追蹤更新失敗",
        description: "共用頁數狀態尚未同步成功，已重新載入最新版本。",
        variant: "destructive",
      });
      throw error;
    }
  };

  const saveQuickBomPageTracker = async () => {
    setPageTrackerQuickSaving(true);
    try {
      await saveBomPageTracker(activeWorkspace.id, {
        totalPages: pageTrackerQuickTotalPages,
        currentPage: pageTrackerQuickCurrentPage,
        pages: syncBomTrackerPages(activeWorkspace.pageTracker?.pages ?? [], pageTrackerQuickTotalPages),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setPageTrackerQuickSaving(false);
    }
  };

  const switchActiveBom = (value: string) => {
    setActiveBomId(value);
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
    setShowMarkedOnly(false);
    setExpandedKey(null);
    setPage(1);
  };

  const applyAvailabilityFilter = (nextAvailability: AvailabilityFilter) => {
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
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
    const rows = filteredGroups.flatMap((group, groupIndex) =>
      getMatchingRecords(group)
        .map((record) => {
          const latestTrackingEntry = getLatestTrackingEntry(record);
          const requestMeta = getTrackingRequestMeta(record);

          return {
            Item: getGroupItemValue(group, groupIndex + 1),
            我的標記: markedGroupKeySet.has(group.key) ? "★" : "",
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
            狀態追蹤: latestTrackingEntry?.note ?? record.trackingNote ?? record.trackingStatus ?? "",
            單號: requestMeta.ticket,
            申請連結: requestMeta.url,
            申請狀態資訊: latestTrackingEntry?.requestInfo ?? "",
            更新人: latestTrackingEntry?.createdBy ?? "",
            Sourcing_Status: record.sourcingStatus,
            建料狀態: getActionLabel(record.actionKind),
            內部料號: record.partNumber,
            規格: record.partSpec,
          };
        })
    );

    if (!rows.length) {
      toast({ title: "沒有可匯出的資料", variant: "destructive" });
      return;
    }

    const exportFileName = `${activeWorkspace.name || "material-alternatives"}-${new Date().toISOString().slice(0, 10)}`
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-");

    exportToCsv(rows, `${exportFileName}.csv`);
    toast({ title: "CSV 已下載", description: `共匯出 ${rows.length.toLocaleString()} 筆替代料。` });
  };

  const clearFilters = () => {
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
    setShowMarkedOnly(false);
    setSortMode("reference");
    setExpandedKey(null);
  };

  const toggleMarkedGroup = (groupKey: string) => {
    setMarkedGroupKeys((current) => current.includes(groupKey)
      ? current.filter((key) => key !== groupKey)
      : [...current, groupKey]);
  };

  const handleTableColorFieldChange = (key: keyof BomTableColorTheme, value: string) => {
    const nextValue = value.trim().toUpperCase();
    setTableColorDraft((current) => ({
      ...current,
      [key]: /^#([0-9A-F]{6})$/.test(nextValue) ? nextValue : current[key],
    }));
  };

  const resetTableColorTheme = () => {
    setTableColorDraft(DEFAULT_BOM_TABLE_COLOR_THEME);
  };

  const applyTableColorTheme = async () => {
    const nextTheme = normalizeBomTableColorTheme(tableColorDraft);

    setBomWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspace.id
        ? { ...workspace, tableColorTheme: nextTheme }
        : workspace
    )));
    setTableColorDialogOpen(false);

    try {
      await saveBomWorkspaceTableColorTheme(activeWorkspace.id, nextTheme);
      toast({
        title: "表格配色已更新",
        description: `已套用到 BOM「${activeWorkspace.name}」，其他人開啟同一份 BOM 也會看到相同配色。`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "表格配色儲存失敗",
        description: "共享配色尚未寫入資料庫，請稍後再試。",
      });
    }
  };

  return (
    <div className="material-sheet-theme min-h-full bg-[#050b16] p-4 text-slate-100 sm:p-5 lg:p-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleWorkbookImport} />

      <UploadGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <BomTableColorDialog
        open={tableColorDialogOpen}
        theme={tableColorDraft}
        workspaceName={activeWorkspace.name}
        onOpenChange={setTableColorDialogOpen}
        onThemeChange={handleTableColorFieldChange}
        onReset={resetTableColorTheme}
        onApply={() => {
          void applyTableColorTheme();
        }}
      />
      <BomPageTrackerDialog workspace={pageTrackerWorkspace} open={pageTrackerDialogOpen} onOpenChange={setPageTrackerDialogOpen} onSave={saveBomPageTracker} />
      <BomManagerDialog activeBomId={activeBomId} bomWorkspaces={orderedBomWorkspaces} open={bomManagerOpen} onDelete={(id) => void deleteBomWorkspaceById(id)} onOpenChange={setBomManagerOpen} onOpenPageTracker={openBomPageTrackerDialog} onSelect={(id) => { switchActiveBom(id); setBomManagerOpen(false); }} />
      <MaterialRecordDialog open={editorOpen} mode={editorMode} record={editorRecord} onOpenChange={setEditorOpen} onModeChange={setEditorMode} onSave={handleSaveRecord} />
      <TrackingHistoryDialog open={trackingDialogOpen} record={trackingRecord} onOpenChange={(open) => { setTrackingDialogOpen(open); if (!open) setTrackingRecord(null); }} onSave={saveTrackingHistory} />

      <header className="overflow-hidden rounded-2xl border border-cyan-400/14 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_30%),linear-gradient(180deg,#122033_0%,#0c1626_100%)] p-4 shadow-[0_20px_60px_rgba(2,8,23,0.24)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-cyan-300/16 bg-cyan-400/12 text-cyan-100 shadow-[0_12px_30px_rgba(34,211,238,0.12)]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-50">料號總表</h1>
              <p className="mt-0.5 text-sm text-slate-300">一行一個主料，點箭頭查看其他替代料。</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("border px-2.5 py-1 text-xs font-bold", collaborationStatusMeta.badgeClassName)}>
                  <span className={cn("mr-2 h-2 w-2 rounded-full", collaborationStatusMeta.dotClassName)} />
                  {collaborationStatusMeta.label}
                </Badge>
                <span className="text-xs text-slate-400">{collaborationStatusMeta.description}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMarkedOnly((current) => !current)}
              className={cn(
                "h-9 px-3 text-sm font-bold transition-colors",
                showMarkedOnly
                  ? "border-amber-300/35 bg-amber-400/18 text-amber-50 hover:bg-amber-400/24"
                  : "border-slate-500/30 bg-slate-900/35 text-slate-200 hover:border-amber-300/25 hover:bg-amber-400/10 hover:text-amber-100",
              )}
            >
              <Star className={cn("mr-2 h-4 w-4", showMarkedOnly && "fill-current")} />
              我的標記
              <span className="ml-2 rounded-full border border-current/20 px-2 py-0.5 text-[11px] leading-none">
                {markedGroupCount}
              </span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setGuideOpen(true)} className="h-9 border-slate-500/30 bg-slate-900/35 px-3 text-sm text-slate-200 hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-white">
              <CircleHelp className="mr-2 h-4 w-4" />上傳說明
            </Button>
            <Button type="button" onClick={() => openCreate()} disabled={!isCollaborativeReady} className="h-9 border border-cyan-300/30 bg-cyan-500 px-3 text-sm font-bold text-white shadow-[0_14px_34px_rgba(14,165,233,0.28)] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-600 disabled:text-slate-300">
              <Plus className="mr-2 h-4 w-4" />新增料件
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting || !isCollaborativeReady} className="h-9 border-slate-500/30 bg-slate-900/35 px-3 text-sm text-slate-200 hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-500">
              <Upload className="mr-2 h-4 w-4" />{isImporting ? "讀取中..." : "上傳 BOM"}
            </Button>
            <Button type="button" variant="outline" onClick={handleExport} className="h-9 border-slate-500/30 bg-slate-900/35 px-3 text-sm text-slate-200 hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-white">
              <Download className="mr-2 h-4 w-4" />匯出結果
            </Button>
          </div>
        </div>

        {collaborationStatus !== "remote" && (
          <div className={cn("mt-3 rounded-lg border px-3 py-2 text-sm", collaborationStatusMeta.bannerClassName)}>
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" />
              <div>
                <p className="font-bold">{collaborationStatusMeta.label}</p>
                <p className="mt-0.5">{collaborationStatusMeta.bannerText}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-3 border-t border-cyan-400/10 pt-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <span className="inline-flex h-10 items-center text-sm font-bold text-slate-200">切換 BOM</span>
            <Select value={activeBomId} onValueChange={switchActiveBom}>
              <SelectTrigger className="h-10 w-full max-w-[38rem] flex-1 items-center border-cyan-400/24 bg-[#08111d] px-4 py-0 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:min-w-[24rem] sm:flex-[1_1_28rem]">
                <div className="flex min-w-0 items-center text-left">
                  <span className="block max-w-full truncate text-[14px] font-semibold leading-5 text-cyan-100">
                    {activeWorkspace.name}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">
                {orderedBomWorkspaces.map((workspace) => {
                  const pageTrackerSummary = getBomPageTrackerSummary(workspace.pageTracker);
                  const hasTracking = workspaceHasTrackingActivity(workspace);

                  return (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      <div className="flex max-w-[30rem] flex-col py-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="line-clamp-2 break-all font-semibold leading-5 text-slate-100">{workspace.name}</span>
                          {hasTracking && (
                            <span className="rounded-full border border-amber-300/35 bg-amber-400/16 px-2 py-0.5 text-[10px] font-black text-amber-100">
                              追蹤
                            </span>
                          )}
                        </div>
                        <span className="mt-1 text-xs leading-5 text-slate-400">
                          {workspace.payload.recordCount.toLocaleString()} 筆 · 更新 {formatTimestamp(workspace.updatedAt)} · {pageTrackerSummary.totalPages > 0
                            ? `${pageTrackerSummary.currentPage > 0 ? `目前第 ${pageTrackerSummary.currentPage}/${pageTrackerSummary.totalPages} 頁 · ` : ""}已完成 ${pageTrackerSummary.completedPages} 頁`
                            : "頁數未設定"}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <span className="inline-flex h-10 items-center rounded-lg border border-sky-300/16 bg-sky-400/10 px-3 text-sm font-bold text-sky-100">{bomWorkspaces.length} 個 BOM</span>
            <BomPageTrackerSummaryPill pageTracker={activeWorkspace.pageTracker} className="h-10" />
            <Button type="button" variant="outline" size="sm" onClick={() => openBomPageTrackerDialog(activeWorkspace.id)} disabled={!canManageBomPageTracker} className="h-10 border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-bold text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500">
              <CircleCheck className="mr-2 h-4 w-4" />逐頁勾選
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setBomManagerOpen(true)} disabled={!isCollaborativeReady} className="h-10 border-slate-500/30 bg-slate-900/40 px-3 text-sm font-bold text-slate-200 hover:border-sky-300/20 hover:bg-sky-400/10 hover:text-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500">
              <Layers3 className="mr-2 h-4 w-4" />BOM管理
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{activeWorkspace.payload.sheetName} · {formatTimestamp(activeWorkspace.updatedAt)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void deleteActiveBom()} disabled={!isCollaborativeReady} className="h-10 border-rose-400/24 bg-rose-500/10 px-3 text-sm font-bold text-rose-100 hover:bg-rose-500/18 hover:text-white disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500">刪除目前 BOM</Button>
          </div>
        </div>

        <section className="mt-3 rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,#16253b_0%,#101c30_100%)] p-4 shadow-[0_16px_36px_rgba(8,15,30,0.18)]">
          <div className="flex flex-col gap-3 border-b border-cyan-400/10 pb-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-black text-slate-50">頁數設定與目前進度</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                直接設定總頁數、目前做到第幾頁；若要逐頁切狀態與備註，再展開細節。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPageTrackerPanelCollapsed((current) => !current)}
              className="h-10 border-cyan-300/24 bg-cyan-300/14 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-300/22"
            >
              {pageTrackerPanelCollapsed ? (
                <ChevronDown className="mr-2 h-4 w-4" />
              ) : (
                <ChevronUp className="mr-2 h-4 w-4" />
              )}
              {pageTrackerPanelCollapsed ? "展開頁數區" : "收合頁數區"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BomPageTrackerStatCard
              label="總頁數"
              value={activePageTrackerSummary.totalPages > 0 ? `${activePageTrackerSummary.totalPages} 頁` : "未設定"}
              hint="先填 BOM 一共有幾頁。"
              tone={activePageTrackerSummary.totalPages > 0 ? "cyan" : "slate"}
            />
            <BomPageTrackerStatCard
              label="目前做到"
              value={activePageTrackerSummary.currentPage > 0 ? `第 ${activePageTrackerSummary.currentPage} 頁` : "尚未指定"}
              hint={activePageTrackerCurrentStatusMeta.label}
              tone={activePageTrackerSummary.currentPage > 0 ? "emerald" : "slate"}
            />
            <BomPageTrackerStatCard
              label="已完成"
              value={activePageTrackerSummary.totalPages > 0 ? `${activePageTrackerSummary.completedPages} / ${activePageTrackerSummary.totalPages} 頁` : "0 / 0 頁"}
              hint={activePageTrackerSummary.missingPages > 0 ? `其中 ${activePageTrackerSummary.missingPages} 頁為缺料` : "逐頁切狀態後會自動累計。"}
              tone={activePageTrackerSummary.completedPages > 0 ? "emerald" : "slate"}
            />
          </div>

          {!pageTrackerPanelCollapsed && (
            <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="rounded-xl border border-sky-300/18 bg-[#1b2a42] px-3 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  {activePageTrackerSummary.totalPages === 0 ? (
                    <p className="leading-6 text-amber-200">這份 BOM 還沒設定頁數。先填總頁數後按「儲存頁數設定」，下面才會知道你目前做到哪一頁。</p>
                  ) : activePageTrackerSummary.currentPage > 0 ? (
                    <>
                      <p className="font-bold text-slate-100">
                        目前進度：第 {activePageTrackerSummary.currentPage} / {activePageTrackerSummary.totalPages} 頁
                      </p>
                      <p className="mt-1 leading-6 text-slate-300">
                        目前狀態：{activePageTrackerCurrentStatusMeta.label}
                      </p>
                      <p className="mt-1 leading-6 text-slate-300">
                        {activePageTrackerCurrentNote
                          ? `目前頁備註：${activePageTrackerCurrentNote}`
                          : "目前這一頁還沒填備註，可以按「逐頁勾選 / 備註」補上說明。"}
                      </p>
                    </>
                  ) : (
                    <p className="leading-6 text-slate-300">總頁數已設定，但還沒指定目前做到第幾頁。填好之後主畫面會直接顯示進度。</p>
                  )}
                </div>
              </div>

              <div className="w-full max-w-[420px] space-y-3 rounded-2xl border border-sky-300/18 bg-[#16253b] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="page-tracker-quick-total">總頁數</Label>
                    <Input
                      id="page-tracker-quick-total"
                      type="number"
                      min={0}
                      max={MAX_BOM_TRACKER_PAGES}
                      step={1}
                      value={pageTrackerQuickTotalInput}
                      onChange={(event) => setPageTrackerQuickTotalInput(event.target.value)}
                      placeholder="例如 12"
                      className="h-10 border-sky-300/18 bg-[#21324c] text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="page-tracker-quick-current">目前做到第幾頁</Label>
                    <Input
                      id="page-tracker-quick-current"
                      type="number"
                      min={0}
                      max={Math.max(pageTrackerQuickTotalPages, MAX_BOM_TRACKER_PAGES)}
                      step={1}
                      value={pageTrackerQuickCurrentInput}
                      onChange={(event) => setPageTrackerQuickCurrentInput(event.target.value)}
                      placeholder={pageTrackerQuickTotalPages > 0 ? `1 ~ ${pageTrackerQuickTotalPages}` : "先填總頁數"}
                      disabled={pageTrackerQuickTotalPages === 0}
                      className="h-10 border-sky-300/18 bg-[#21324c] text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void saveQuickBomPageTracker()}
                    disabled={!canManageBomPageTracker || pageTrackerQuickSaving || !pageTrackerQuickDirty}
                    className="h-10 bg-cyan-500 px-4 font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                  >
                    {pageTrackerQuickSaving ? "儲存中..." : activePageTrackerSummary.totalPages > 0 ? "更新頁數進度" : "儲存頁數設定"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openBomPageTrackerDialog(activeWorkspace.id)}
                    disabled={!canManageBomPageTracker}
                    className="h-10 border-emerald-400/25 bg-emerald-400/10 px-4 font-bold text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500"
                  >
                    逐頁勾選 / 備註
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-cyan-400/10 pt-3 text-sm">
          <button type="button" onClick={clearFilters} className={cn("rounded-lg border px-3 py-1.5 font-bold transition-colors", availability === "all" ? "border-sky-300/34 bg-sky-400/18 text-sky-50 shadow-[0_10px_24px_rgba(56,189,248,0.12)]" : "border-slate-500/28 bg-slate-900/42 text-slate-200 hover:border-sky-300/20 hover:bg-sky-400/10 hover:text-sky-100")}>主料總數 <strong className="ml-1">{dataset.stats.totalGroups.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("required")} className={cn("rounded-lg border px-3 py-1.5 font-bold transition-colors", availability === "required" ? "border-amber-300/50 bg-amber-400/20 text-amber-50 shadow-[0_10px_24px_rgba(251,191,36,0.10)]" : "border-amber-300/28 bg-amber-400/10 text-amber-100 hover:bg-amber-400/18 hover:text-amber-50")}>主料與替代都無料 <strong className="ml-1">{requiredApplicationCount.toLocaleString()}</strong></button>
          <span className="rounded-lg border border-emerald-300/24 bg-emerald-400/10 px-3 py-1.5 font-bold text-emerald-100">廠商料明細 <strong className="ml-1">{dataset.stats.totalRecords.toLocaleString()}</strong></span>
        </div>
      </header>

      <div className="mt-3">
        <div className="min-w-0">
      <section className="rounded-2xl border border-cyan-400/10 bg-[linear-gradient(180deg,#0c1627_0%,#09111d_100%)] p-3 shadow-[0_18px_44px_rgba(2,8,23,0.18)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(390px,1fr)_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-300" />
            <DeferredTextInput
              value={query}
              onCommit={setQuery}
              placeholder="搜尋料名、REF DES、MPN、內部料號、狀態追蹤；也可輸入『完全無料』"
              className="h-10 border-cyan-400/18 bg-[#111b2a] pl-12 text-[15px] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400"
            />
          </div>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-10 border-slate-500/28 bg-[#111b2a] text-sm text-slate-200">
              <SelectValue>{SORT_MODE_LABELS[sortMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="border-cyan-400/15 bg-[#0d1727] text-slate-100">
              <SelectItem value="reference">{SORT_MODE_LABELS.reference}</SelectItem>
              <SelectItem value="single-source">{SORT_MODE_LABELS["single-source"]}</SelectItem>
              <SelectItem value="alternatives">{SORT_MODE_LABELS.alternatives}</SelectItem>
              <SelectItem value="approved">{SORT_MODE_LABELS.approved}</SelectItem>
              <SelectItem value="pending">{SORT_MODE_LABELS.pending}</SelectItem>
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" onClick={clearFilters} className="h-10 border-slate-500/28 bg-[#111b2a] px-3 text-sm text-slate-200 hover:border-cyan-300/22 hover:bg-cyan-400/10 hover:text-white"><RotateCcw className="mr-2 h-4 w-4" />清除</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          <p>顯示 <strong className="text-cyan-200">{filteredGroups.length.toLocaleString()}</strong> / {dataset.stats.totalGroups.toLocaleString()} 個主料。</p>
          <p>{showMarkedOnly ? `目前只顯示我的標記 · ${markedGroupCount.toLocaleString()} 筆` : `${dataset.meta.sourceFile} · ${dataset.meta.sheetName} · ${formatTimestamp(dataset.meta.generatedAt)}`}</p>
        </div>
      </section>

      <section className="mt-3 overflow-hidden rounded-xl border border-blue-400/15 bg-[#0b1527]">
        <div className="flex items-center justify-between border-b border-blue-400/15 bg-[#101d33] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">料號總表</h2>
            <p className="mt-0.5 text-sm text-slate-500">展開後才顯示替代料；拖曳表頭右邊緣可調整欄寬。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTableColorDraft(activeTableColorTheme);
                setTableColorDialogOpen(true);
              }}
              className="border-cyan-400/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
            >
              自訂表格配色
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setColumnWidths([...DEFAULT_COLUMN_WIDTHS])} className="border-blue-400/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20">重設欄寬</Button>
            {expandedKey && <Button type="button" variant="outline" size="sm" onClick={() => setExpandedKey(null)} className="border-blue-400/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20">收合目前料件</Button>}
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="table-fixed border-collapse text-[15px]" style={{ width: `max(100%, ${tableWidth}px)`, minWidth: tableWidth }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#244b96] text-left text-[15px] font-bold text-white shadow-sm">
                {[
                  "Item",
                  "標記",
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
                    resizable={columnIndex < 10}
                    onResize={(width) => resizeColumn(columnIndex, width)}
                    className={columnIndex === 10 ? "border-r-0 text-center" : undefined}
                  >
                    {label}
                  </ResizableHeader>
                ))}
              </tr>
              <tr className="bg-[#102b57] text-slate-100">
                <th className="border-r border-blue-300/20 p-2">
                  <div className="flex h-8 items-center justify-center rounded border border-blue-300/20 bg-[#07182d] px-2 text-xs font-bold text-slate-400">
                    項次
                  </div>
                </th>
                <th className="border-r border-blue-300/20 p-2">
                  <div className="flex h-8 items-center justify-center rounded border border-blue-300/20 bg-[#07182d] px-2 text-xs font-bold text-amber-200">
                    {markedGroupCount} 筆
                  </div>
                </th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="料件" options={columnFilterOptions.material} selectedValues={columnFilters.material} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, material: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="REF DES" options={columnFilterOptions.refDes} selectedValues={columnFilters.refDes} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, refDes: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="MPN" options={columnFilterOptions.mpn} selectedValues={columnFilters.mpn} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, mpn: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="內部料號" options={columnFilterOptions.internal} selectedValues={columnFilters.internal} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, internal: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="TX" options={columnFilterOptions.virtualAlternative} selectedValues={columnFilters.virtualAlternative} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, virtualAlternative: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2">
                  <div className="flex h-8 items-center justify-center rounded border border-blue-300/20 bg-[#07182d] px-2 text-xs font-bold text-slate-400">
                    狀態摘要
                  </div>
                </th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="規格" options={columnFilterOptions.specification} selectedValues={columnFilters.specification} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, specification: values }))} /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="狀態追蹤" options={columnFilterOptions.trackingStatus} selectedValues={columnFilters.trackingStatus} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, trackingStatus: values }))} /></th>
                <th className="p-2 text-center"><button type="button" onClick={clearFilters} className="h-8 rounded border border-blue-300/25 bg-blue-400/10 px-2 text-xs font-bold text-blue-100 hover:bg-blue-400/20">清除</button></th>
              </tr>
            </thead>
              {visibleGroupRows.map(({ group, matchingRecords, primaryAlternative, virtualAlternativeRecord, trackingRecord, secondaryAlternatives, uniqueMpnCount }, rowIndex) => {
                const expanded = expandedKey === group.key;
                const mustApply = group.requiresApplication;
                const noAlternative = uniqueMpnCount <= 1;
                const primaryReady = Boolean(primaryAlternative?.isPreferred);
                const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred).length;
                const groupRefDes = primaryAlternative?.refDes || group.primaryRecord.refDes || group.primaryRecord.refGroup || "-";
                const itemValue = getGroupItemValue(group, (page - 1) * pageSize + rowIndex + 1);
                const isMarked = markedGroupKeySet.has(group.key);
                const primaryRowColor = activeTableColorTheme.primary;
                const mainRowStyle = buildTableRowStyle(primaryRowColor, {
                  backgroundAlpha: mustApply ? 0.2 : primaryReady ? 0.17 : 0.14,
                  hoverAlpha: mustApply ? 0.28 : primaryReady ? 0.23 : 0.19,
                  accentAlpha: 0.95,
                });

                return (
                  <tbody key={group.key}>
                    <tr
                      onClick={() => secondaryAlternatives.length > 0 && toggleExpanded(group.key)}
                      style={mainRowStyle}
                      className={cn(
                        "border-b border-blue-400/15 text-slate-200 transition-colors",
                        secondaryAlternatives.length > 0 ? "cursor-pointer" : "cursor-default",
                        "bg-[var(--material-row-bg)] hover:bg-[var(--material-row-hover)]",
                      )}
                    >
                      <td className="border-r border-blue-400/10 px-3 py-3 text-center align-middle">
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-mono text-base font-black text-slate-100">{itemValue}</span>
                          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Item</span>
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-2 py-3 text-center align-middle" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleMarkedGroup(group.key)}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                            isMarked
                              ? "border-amber-300/40 bg-amber-400/18 text-amber-200 hover:bg-amber-400/24"
                              : "border-slate-500/25 bg-slate-900/35 text-slate-500 hover:border-amber-300/24 hover:bg-amber-400/10 hover:text-amber-200",
                          )}
                          title={isMarked ? "移除我的標記" : "加入我的標記"}
                        >
                          <Star className={cn("h-4.5 w-4.5", isMarked && "fill-current")} />
                        </button>
                      </td>
                      <td className="relative overflow-hidden border-r border-blue-400/10 px-4 py-3">
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-1 bg-[var(--material-row-accent)]"
                        />
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded border", secondaryAlternatives.length > 0 ? expanded ? "border-blue-300/40 bg-blue-400/20 text-blue-200" : "border-blue-400/20 bg-blue-400/10 text-blue-300" : "border-slate-600/30 bg-slate-700/20 text-slate-600")}>{secondaryAlternatives.length > 0 ? expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : <span className="text-sm">—</span>}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-bold text-blue-300">{group.displayRef}</span>
                              {isMarked && (
                                <span className="rounded-full border border-amber-300/35 bg-amber-400/16 px-2.5 py-1 text-xs font-bold text-amber-200">
                                  已標記
                                </span>
                              )}
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
                        {virtualAlternativeRecord && <InlineVirtualAlternativeEditor value={virtualAlternativeRecord.virtualAlternative ?? ""} onSave={(value) => saveVirtualAlternative(virtualAlternativeRecord, value)} />}
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3">
                        <div className="flex flex-col items-start gap-2">{mustApply ? <span className="rounded-md border border-amber-300/50 bg-amber-400/25 px-3 py-1.5 text-[15px] font-black text-amber-100">主料與替代都無料</span> : primaryReady ? <span className="rounded-md border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-[15px] font-black text-emerald-200">主料已建</span> : <span className="rounded-md border border-cyan-300/40 bg-cyan-400/20 px-3 py-1.5 text-[15px] font-black text-cyan-100">已有可用替代 {availableAlternativeCount}</span>}{!primaryReady && <span className={cn("text-sm font-semibold leading-5", mustApply ? "text-amber-200" : "text-cyan-200")}>主料 Remark: {primaryAlternative?.remark || "未填"}<br />主料 Part Number: {primaryAlternative?.partNumber || "未填"}</span>}{availableAlternativeCount > 0 && <span className="rounded border border-violet-300/30 bg-violet-400/15 px-2.5 py-1 text-sm font-bold text-violet-200">可用替代 {availableAlternativeCount}</span>}{group.pendingCount > 0 && <span className="rounded bg-slate-400/10 px-2.5 py-1 text-sm font-semibold text-slate-300">待建明細 {group.pendingCount}</span>}</div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 text-[15px] leading-6 text-slate-400"><p className="line-clamp-2">{group.partSpec || group.partName || "-"}</p></td>
                      <td className="border-r border-blue-400/10 px-4 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                        {trackingRecord && <TrackingHistoryCell record={trackingRecord} onOpen={openTrackingDialog} />}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-8 w-full border-cyan-400/25 bg-cyan-400/10 px-2 text-sm text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100"><Plus className="mr-1 h-3.5 w-3.5" />資料更新</Button>
                      </td>
                    </tr>
                    {expanded && (
                      <CompactAlternativeRows
                        group={group}
                        records={matchingRecords}
                        primaryRecord={primaryAlternative}
                        itemValue={itemValue}
                        isMarked={isMarked}
                        colorTheme={activeTableColorTheme}
                        onCopy={handleCopy}
                        onView={(record) => openRecord(record, "view")}
                        onEdit={(record) => openRecord(record, "edit")}
                        onSaveVirtual={saveVirtualAlternative}
                        onOpenTracking={openTrackingDialog}
                        onToggleMarked={() => toggleMarkedGroup(group.key)}
                      />
                    )}
                  </tbody>
                );
              })}
          </table>

          {visibleGroupRows.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Search className="h-10 w-10 text-slate-600" /><p className="mt-3 text-lg font-bold text-slate-300">{showMarkedOnly ? "目前沒有標記料件" : "找不到符合條件的料"}</p><p className="mt-1 text-[15px] text-slate-500">{showMarkedOnly ? "先點每列星號加入我的標記，再切回這裡集中檢查或匯出給主管。" : "請清除篩選，或改用 MPN、廠商、Footprint 搜尋。"}</p></div>}
        </div>

        <div className="flex flex-col gap-3 border-t border-blue-400/15 bg-[#101d33] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-400"><span>每頁</span><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="h-9 w-24 border-blue-400/20 bg-[#0b1527] text-slate-200"><SelectValue /></SelectTrigger><SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">{PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} 列</SelectItem>)}</SelectContent></Select><span>第 {page} / {totalPages} 頁</span></div>
          <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300"><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button><Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300">下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
        </div>
      </section>
        </div>
      </div>
    </div>
  );
}
