import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { CSSProperties } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Columns3,
  CircleHelp,
  CircleCheck,
  Copy,
  Download,
  Eye,
  Factory,
  FileArchive,
  FileCode2,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useIsCompactLayout } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspaceMutationScope, WorkspaceMutationScopeChangedError } from "@/hooks/useWorkspaceMutationScope";

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
  getMaterialBuildRequirementLabel,
  getLatestTrackingEntry,
  isPreferredInternalPartNumber,
  normalizeMaterialSearchText,
  parseMaterialWorkbookFile,
} from "./materialRequestUtils";
import {
  type BomPageTracker,
  type BomPageTrackerPage,
  type BomPageTrackerStatus,
  type BomStorageMode,
  type BomWorkspace,
  type BomWorkspaceLoadResult,
  BomRecordConflictError,
  loadCachedBomWorkspacesDetailed,
  loadBomWorkspacesDetailed,
  removeBomWorkspace,
  saveBomWorkspace,
  saveBomWorkspacePageTracker,
  saveBomWorkspaceRecord,
  subscribeBomWorkspaceChanges,
} from "./materialBomStorage";
import type { BomTableColorTheme } from "./materialBomStorage";
import { saveBomWorkspaceTableColorTheme } from "./materialBomStorage";
import { UploadGuideDialog } from "./MaterialUploadGuideDialog";
import { MATERIAL_CE_FIELDS } from "./materialUploadContract.mjs";
import type {
  MaterialExportProgress,
  MaterialReportSnapshot,
} from "./materialRequestExport";
import {
  MATERIAL_TABLE_COLUMNS,
  type MaterialTableColumnKey,
  createClipboardImageName,
  createCompactValueSummary,
  getMaterialExportScopeLabel,
  getMaterialStickyColumnClasses,
  getMaterialSourceValue,
  getMaterialTableWidth,
  normalizeHiddenMaterialColumns,
  resizeMaterialColumnWidths,
  shouldApplyBomWorkspaceCache,
} from "./materialRequestPresentation";
import { useMaterialBomPresence } from "./useMaterialBomPresence";
import { canReuseBomPayloadReference } from "./materialBomPerformance";
import { isLatestBomWorkspaceLoad } from "./materialBomSyncPolicy";
import {
  logMaterialRecordChange,
  logMaterialReportExport,
  logMaterialWorkspaceAction,
} from "./materialRequestAudit";

type AvailabilityFilter = "all" | "usable" | "required" | "pending" | "risk" | "single";
type SortMode = "reference" | "alternatives" | "approved" | "pending" | "single-source";
type EditorMode = "create" | "edit" | "view";
type CollaborationStatus = BomStorageMode | "checking" | "reconnecting" | "error";

const SORT_MODE_LABELS: Record<SortMode, string> = {
  reference: "Ref 由小到大",
  "single-source": "無替代料優先",
  alternatives: "替代料數由多到少",
  approved: "Approved 數由多到少",
  pending: "待申請數由多到少",
};

const AVAILABILITY_FILTER_LABELS: Record<AvailabilityFilter, string> = {
  all: "全部狀態",
  usable: "已提供料號",
  required: "未提供虛擬／實體料號",
  pending: "有待申請明細",
  risk: "有風險",
  single: "單一來源",
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
}

type ColumnFilterKey = keyof MaterialColumnFilters;

const COLUMN_FILTER_LABELS: Record<ColumnFilterKey, string> = {
  material: "料件",
  refDes: "REF DES",
  mpn: "MPN",
  internal: "實體料號",
  virtualAlternative: "虛擬料號",
  trackingStatus: "狀態追蹤",
};

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
};

const FILTER_KEYS = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];

const DEFAULT_BOM_ID = "bom:申請carrier料.xlsx";
const ACTIVE_BOM_KEY = "station-status-hub:active-material-bom:v1";
const MARKED_GROUPS_KEY_PREFIX = "station-status-hub:material-marked-groups:v1:";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const VIEW_STATE_KEY_PREFIX = "station-status-hub:material-view:v1:";
const COLUMN_WIDTHS_SESSION_KEY = "station-status-hub:material-column-widths:v8";
const HIDDEN_COLUMNS_KEY = "station-status-hub:material-hidden-columns:v1";
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
const DEFAULT_COLUMN_WIDTHS = [96, 92, 260, 160, 260, 210, 190, 180, 160, 180, 220, 130];
const MIN_COLUMN_WIDTHS = [80, 76, 200, 120, 180, 170, 150, 140, 140, 140, 180, 110];
const MAX_COLUMN_WIDTHS = [148, 108, 520, 360, 520, 460, 420, 360, 320, 360, 420, 260];
const DEFAULT_BOM_TABLE_COLOR_THEME: BomTableColorTheme = {
  primary: "#0F5D74",
  alternative: "#343B73",
  secondary: "#10243D",
};
const FILTER_OPTION_ROW_HEIGHT = 38;
const FILTER_OPTION_LIST_HEIGHT = 224;
const FILTER_OPTION_OVERSCAN = 8;
// One collator for the Ref sort; localeCompare with options builds one per comparison.
const REF_COLLATOR = new Intl.Collator(undefined, { numeric: true });

const BOM_TABLE_COLOR_FIELDS: Array<{
  key: keyof BomTableColorTheme;
  label: string;
  description: string;
}> = [
  { key: "primary", label: "主料", description: "主料列與首筆主資料背景。" },
  { key: "alternative", label: "替代料", description: "替代料列與已建料候選背景。" },
  { key: "secondary", label: "其餘料", description: "其他替代料或未首選列背景。" },
];

const MATERIAL_CE_HELP_BY_HEADER = new Map<string, { header: string; meaning: string; requirement: string; example: string }>(
  MATERIAL_CE_FIELDS.map((field) => [field.header, field]),
);

function getMaterialCeFieldHelp(header: string) {
  const field = MATERIAL_CE_HELP_BY_HEADER.get(header);
  if (!field) throw new Error(`Unknown CE field: ${header}`);
  return {
    header: field.header,
    description: `${field.meaning}。${field.requirement}`,
    example: field.example,
  };
}

const MATERIAL_FIELD_HELP = {
  refGroup: { description: "網站內部分組參考，不是 CE Excel 欄位。新格式以 Ref Des 填寫位號，不需額外準備代碼；相同虛擬料號不會合併不同位號。", example: "C101" },
  refDes: getMaterialCeFieldHelp("Ref Des"),
  name: getMaterialCeFieldHelp("Name"),
  qty: getMaterialCeFieldHelp("Qty"),
  assemblyName: { description: "Level 1 模組列所代表的模組名稱；網站保留作分類，料件列不需另填這一欄。", example: "C2 Carrier Board" },
  schematicPart: getMaterialCeFieldHelp("Schematic_Part"),
  symbolStatus: getMaterialCeFieldHelp("Symbol"),
  pcbFootprint: getMaterialCeFieldHelp("PCB_Footprint"),
  partSpec: getMaterialCeFieldHelp("Part Spec"),
  manufacturer: getMaterialCeFieldHelp("Manufacturer"),
  manufacturerPartNumber: getMaterialCeFieldHelp("Manufacturer Part Number"),
  manufacturerPartNumberAlt: { description: "舊檔保留的第二個廠商料號，新 CE Excel 沒有這一欄。新資料請拆成另一列，每列對應一個廠商及一個 MPN。", example: "舊檔的第二 MPN 原值" },
  virtualAlternative: getMaterialCeFieldHelp("虛擬料號"),
  requestTicket: { description: "網站維護的申請單或工單編號，不是 CE Excel 欄位，供回查申請進度。", example: "REQ-20260713-001" },
  requestUrl: { description: "網站維護的申請單完整網址，不是 CE Excel 欄位；沒有可留白。", example: "https://..." },
  tracking: { description: "網站維護的最新追蹤內容，不是 CE Excel 欄位。新增歷史、圖片與狀態請從表格的「狀態追蹤」進入。", example: "新增追蹤、處理中、已完成" },
  sourcingStatus: getMaterialCeFieldHelp("Sourcing Status"),
  partUsageStatus: getMaterialCeFieldHelp("零件狀態"),
  phaseOutStatus: getMaterialCeFieldHelp("phase out"),
  partNumber: getMaterialCeFieldHelp("實體料號"),
  partName: getMaterialCeFieldHelp("Part Name"),
  remark: { description: "網站維護的人工申請狀態或備註，不是 CE Excel 欄位，不會由零件狀態自動建立申請。", example: "待確認實體料號、只需補 Symbol" },
} as const;

const MATERIAL_TABLE_COLUMN_HELP: Partial<Record<MaterialTableColumnKey, string>> = {
  material: ["Name", "Manufacturer"].map((header) => getMaterialCeFieldHelp(header).description).join("\n"),
  refDes: getMaterialCeFieldHelp("Ref Des").description,
  mpn: getMaterialCeFieldHelp("Manufacturer Part Number").description,
  internal: ["實體料號", "Schematic_Part", "PCB_Footprint"].map((header) => getMaterialCeFieldHelp(header).description).join("\n"),
  tx: getMaterialCeFieldHelp("虛擬料號").description,
  phaseOut: getMaterialCeFieldHelp("phase out").description,
  symbol: getMaterialCeFieldHelp("Symbol").description,
  status: ["Sourcing Status", "零件狀態"].map((header) => getMaterialCeFieldHelp(header).description).join("\n"),
  tracking: "網站人工維護的狀態追蹤，與 CE Excel 的供應／核准狀態、phase out 及零件狀態分開。",
};

function CompactHoverValue({
  label,
  maxItems = 3,
  onCopy,
  previewClassName,
  values,
}: {
  label: string;
  maxItems?: number;
  onCopy?: (value: string) => void;
  previewClassName?: string;
  values: string | string[];
}) {
  const summary = createCompactValueSummary(values, { maxItems });
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredValues = normalizedQuery
    ? summary.values.filter((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    : summary.values;
  const canSearch = summary.values.length > 10;

  return (
    <HoverCard
      openDelay={160}
      closeDelay={140}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="compact-hover-trigger"
          aria-label={`查看${label}完整內容`}
          onClick={(event) => {
            event.stopPropagation();
            if (onCopy && summary.fullText !== "-") onCopy(summary.fullText);
          }}
          className="group inline-flex w-full min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <span
            data-testid="compact-hover-preview"
            className={cn("block min-w-0 flex-1 truncate whitespace-nowrap", previewClassName)}
          >
            {summary.preview}
          </span>
          {summary.remainingCount > 0 && (
            <span className="inline-flex flex-none rounded border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-cyan-200">
              +{summary.remainingCount} 項
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        data-testid="compact-hover-content"
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="w-[min(540px,calc(100vw-24px))] overflow-hidden rounded-2xl border-cyan-200/35 bg-[#071522] p-0 text-slate-100 shadow-[0_28px_80px_-28px_rgba(6,182,212,0.55)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(59,130,246,0.05))] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-100">
              <Layers3 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{label}</p>
              <p className="mt-0.5 text-xs text-cyan-100/65">共 {summary.values.length} 項完整資料</p>
            </div>
          </div>
          <span className="rounded-full border border-cyan-200/20 bg-black/20 px-2.5 py-1 font-mono text-xs font-black text-cyan-100">
            {filteredValues.length}/{summary.values.length}
          </span>
        </div>

        {canSearch ? (
          <div className="border-b border-white/[0.07] px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/70" />
              <input
                data-testid="compact-hover-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`搜尋${label}...`}
                className="h-9 w-full rounded-xl border border-cyan-200/20 bg-black/25 pl-9 pr-9 text-sm text-white outline-none placeholder:text-slate-400 focus:border-cyan-200/55 focus:ring-2 focus:ring-cyan-300/10"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="清除搜尋"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <ScrollArea className="h-[min(288px,42vh)]">
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredValues.length > 0 ? filteredValues.map((value, index) => (
              <div
                key={`${value}-${index}`}
                className="group/value flex min-w-0 items-center gap-2 rounded-xl border border-sky-300/14 bg-sky-400/[0.055] px-2.5 py-2 transition-colors hover:border-cyan-200/35 hover:bg-cyan-300/[0.09]"
                title={value}
              >
                <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-md bg-cyan-300/10 px-1 font-mono text-[10px] font-black text-cyan-200">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-sky-50">{value}</span>
              </div>
            )) : (
              <div className="col-span-full py-10 text-center">
                <Search className="mx-auto h-5 w-5 text-slate-600" />
                <p className="mt-2 text-sm font-semibold text-slate-400">找不到符合「{query}」的內容</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-black/15 px-4 py-3">
          <p className="text-xs text-slate-400">滑鼠可停留瀏覽；搜尋不會改動原始資料</p>
          {onCopy && summary.fullText !== "-" ? (
            <button
              type="button"
              data-testid="compact-hover-copy-all"
              onClick={(event) => {
                event.stopPropagation();
                onCopy(summary.fullText);
              }}
              className="inline-flex h-8 flex-none items-center gap-1.5 rounded-lg border border-cyan-200/30 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition-colors hover:border-cyan-100/60 hover:bg-cyan-300/20"
            >
              <Copy className="h-3.5 w-3.5" />
              複製全部
            </button>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MaterialIdentityHover({
  assemblyName,
  manufacturer,
  mpnValues,
  name,
  qty,
  refValues,
}: {
  assemblyName: string;
  manufacturer: string;
  mpnValues: string[];
  name: string;
  qty: MaterialGroup["qty"];
  refValues: string[];
}) {
  const cleanValues = (values: string[]) => Array.from(new Set(
    values.map((value) => value.trim()).filter((value) => value && value !== "-"),
  ));
  const refs = cleanValues(refValues);
  const mpns = cleanValues(mpnValues);

  return (
    <HoverCard openDelay={160} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="material-identity-trigger"
          aria-label={`查看${name}的 REF DES 與 MPN`}
          onClick={(event) => event.stopPropagation()}
          className="group/identity flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-cyan-300/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <span className="min-w-0 flex-1">
            <span
              data-testid="material-primary-name"
              className="block truncate text-[13px] font-black leading-5 text-slate-50"
              title={name || "未命名料件"}
            >
              {name || "未命名料件"}
            </span>
            <span
              data-testid="material-primary-vendor"
              className="block truncate text-xs leading-4 text-cyan-200"
            >
              {manufacturer || "未填廠商"}
            </span>
          </span>
          <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200 opacity-70 transition-opacity group-hover/identity:opacity-100">
            <CircleHelp className="h-3.5 w-3.5" />
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={16}
        className="w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-xl border-cyan-200/35 bg-[#071522] p-0 text-slate-100 shadow-[0_28px_80px_-28px_rgba(6,182,212,0.55)]"
      >
        <div className="flex items-center gap-3 border-b border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(59,130,246,0.05))] px-4 py-3">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-300/12 text-cyan-100">
            <Factory className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">{name || "未命名料件"}</p>
            <p className="truncate text-xs font-semibold text-cyan-200">{manufacturer || "未填廠商"}</p>
          </div>
        </div>

        <div data-testid="material-identity-metrics" className="grid grid-cols-3 border-b border-white/[0.07] bg-black/10">
          {[
            ["REF DES", refs.length],
            ["MPN", mpns.length],
            ["數量", qty],
          ].map(([metricLabel, metricValue], index) => (
            <div key={metricLabel} className={cn("flex items-baseline gap-2 px-4 py-2", index > 0 && "border-l border-white/[0.07]")}>
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{metricLabel}</span>
              <span className="font-mono text-base font-black text-white">{metricValue}</span>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 sm:grid-cols-2">
          <section data-testid="material-identity-ref-list" className="min-w-0 border-b border-white/[0.07] sm:border-b-0 sm:border-r">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2">
              <Layers3 className="h-4 w-4 text-sky-200" />
              <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-100">REF DES</p>
            </div>
            <ScrollArea className="h-40">
              <div className="space-y-1 p-2.5">
              {refs.length > 0 ? (
                refs.map((value, index) => (
                  <div key={value} className="flex items-center gap-2 rounded-md border border-sky-300/12 bg-sky-400/[0.05] px-2 py-1" title={value}>
                    <span className="font-mono text-[10px] font-black text-sky-300/70">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 truncate font-mono text-xs text-sky-50">{value}</span>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">尚未設定 REF DES</p>
              )}
              </div>
            </ScrollArea>
          </section>

          <section data-testid="material-identity-mpn-list" className="min-w-0">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2">
              <FileCode2 className="h-4 w-4 text-emerald-200" />
              <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-100">MPN</p>
            </div>
            <ScrollArea className="h-40">
              <div className="space-y-1 p-2.5">
              {mpns.length > 0 ? (
                mpns.map((value, index) => (
                  <div key={value} className="flex items-center gap-2 rounded-md border border-emerald-300/12 bg-emerald-400/[0.045] px-2 py-1" title={value}>
                    <span className="font-mono text-[10px] font-black text-emerald-300/70">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 truncate font-mono text-xs text-emerald-50">{value}</span>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">尚未設定 MPN</p>
              )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] bg-black/15 px-4 py-2 text-xs text-slate-400">
          <span className="min-w-0 truncate">模組：<strong className="font-semibold text-slate-200">{assemblyName || "未指定"}</strong></span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MaterialFieldLabel({
  field,
  htmlFor,
  label,
  required = false,
}: {
  field: keyof typeof MATERIAL_FIELD_HELP;
  htmlFor?: string;
  label: string;
  required?: boolean;
}) {
  const help = MATERIAL_FIELD_HELP[field];

  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-bold text-slate-200">
        {label}{required ? <span className="ml-1 text-rose-300">*</span> : null}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label}填寫說明`}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-cyan-300 transition-colors hover:bg-cyan-300/12 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="max-w-80 border-cyan-300/25 bg-[#071522] px-3 py-2.5 text-slate-100 shadow-xl"
        >
          <p className="text-sm leading-5">{help.description}</p>
          {"header" in help && <p className="mt-1.5 text-xs text-slate-400">Excel 欄名：{help.header}</p>}
          <p className="mt-1.5 text-xs text-cyan-200">範例：{help.example}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

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

function blendWithSurface(value: string, alpha: number) {
  const foreground = hexToRgb(value);
  const surface = hexToRgb("#0B1B2D");
  const blend = (foregroundValue: number, surfaceValue: number) => (
    Math.round((foregroundValue * alpha) + (surfaceValue * (1 - alpha)))
  );

  return `rgb(${blend(foreground.r, surface.r)}, ${blend(foreground.g, surface.g)}, ${blend(foreground.b, surface.b)})`;
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
    "--material-row-solid": blendWithSurface(color, backgroundAlpha),
    "--material-row-hover": withAlpha(color, hoverAlpha),
    "--material-row-hover-solid": blendWithSurface(color, hoverAlpha),
    "--material-row-accent": withAlpha(color, accentAlpha),
  } as CSSProperties;
}

const MATERIAL_STICKY_COLUMN_CLASSES = getMaterialStickyColumnClasses();

function getMarkedGroupsStorageKey(bomId: string) {
  return `${MARKED_GROUPS_KEY_PREFIX}${bomId}`;
}

function loadColumnWidths() {
  if (typeof window === "undefined") return DEFAULT_COLUMN_WIDTHS;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(COLUMN_WIDTHS_SESSION_KEY) ?? "null");
    const legacyWidths = Array.isArray(parsed) && parsed.length === 11
      ? parsed.filter((_, index) => index !== 8)
      : parsed;
    const widths = Array.isArray(legacyWidths) && legacyWidths.length === 10
      ? [...legacyWidths.slice(0, 7), DEFAULT_COLUMN_WIDTHS[7], DEFAULT_COLUMN_WIDTHS[8], ...legacyWidths.slice(7)]
      : legacyWidths;
    if (!Array.isArray(widths) || widths.length !== DEFAULT_COLUMN_WIDTHS.length) {
      return DEFAULT_COLUMN_WIDTHS;
    }

    return widths.map((width, index) => Number.isFinite(width)
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
    partUsageStatus: record.partUsageStatus ?? "",
    ...(Object.prototype.hasOwnProperty.call(record, "phaseOutStatus") ? { phaseOutStatus: record.phaseOutStatus ?? "" } : {}),
    ...(Object.prototype.hasOwnProperty.call(record, "symbolStatus") ? { symbolStatus: record.symbolStatus ?? "" } : {}),
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
    partUsageStatus: "",
    phaseOutStatus: "",
    symbolStatus: "",
    refGroup: group?.displayRef ?? "",
    lv: "",
    remark: "",
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

function createDefaultBomWorkspace(sourcePayload?: MaterialWorkbookPayload): BomWorkspace {
  const payload = sourcePayload ?? {
    sourceFile: "申請carrier料.xlsx",
    sheetName: "",
    generatedAt: new Date(0).toISOString(),
    recordCount: 0,
    records: [],
  };
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

async function loadDefaultBomWorkspace() {
  const module = await import("@/data/materialRequestSeed.json");
  return createDefaultBomWorkspace(module.default as MaterialWorkbookPayload);
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

function loadHiddenColumns(): MaterialTableColumnKey[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeHiddenMaterialColumns(JSON.parse(window.localStorage.getItem(HIDDEN_COLUMNS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function getBomWorkspaceRecordRangeKey(workspaces: BomWorkspace[], workspaceId: string) {
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) return "";

  const hasAllRecords = workspace.isLoaded !== false
    && workspace.payload.records.length >= workspace.payload.recordCount;
  if (hasAllRecords) return `${workspaceId}:full`;
  return workspace.payload.records.length > 0 ? `${workspaceId}:preview` : "";
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
  const mergedRecords: MaterialWorkbookRecord[] = payload.records.map((record) => {
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
    .map((token) => normalizeMaterialSearchText(token.replace(/^"|"$/g, "")))
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
    case "reconnecting":
      return {
        label: "重新連線中",
        description: "正在背景重新連接共用雲端 BOM，畫面不會重新整理。",
        badgeClassName: "border-sky-400/30 bg-sky-400/10 text-sky-100",
        dotClassName: "bg-sky-300",
        bannerClassName: "border-sky-400/30 bg-sky-500/10 text-sky-100",
        bannerText: "正在重新讀取共用 BOM；目前畫面與已載入資料會保留，不會重新整理整頁。",
      };
    case "error":
      return {
        label: "雲端同步暫時中斷",
        description: "共用 BOM 暫時無法連線；已載入資料會保留，系統會背景重試。",
        badgeClassName: "border-rose-400/30 bg-rose-400/10 text-rose-100",
        dotClassName: "bg-rose-300",
        bannerClassName: "border-rose-400/30 bg-rose-400/10 text-rose-100",
        bannerText: "目前已載入的 BOM 仍會保留；系統會在背景重試，也可按「重新連線」，不需要重新整理頁面。",
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
  const normalized = String(value ?? "").normalize("NFKC").replace(/\u3000/g, " ").trim();
  return normalized || "(空白)";
}

function uniqueNormalizedValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeFilterValue)));
}

function createCachedColumnValues(values: string[]): CachedColumnValues {
  const raw = uniqueNormalizedValues(values);

  return {
    raw,
    searchable: raw.map(normalizeMaterialSearchText).join(" "),
  };
}

function inferFilterOptionTone(value: string): ExcelFilterTone {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return "slate";
  if (["完成", "已完成", "ok", "approved", "結案", "可用", "已建"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "emerald";
  }
  if (["風險", "缺料", "阻塞", "blocked", "失敗"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "rose";
  }
  if (["無狀態", "新增追蹤", "待", "申請", "確認", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "slate";
  }
  if (["處理中", "追蹤", "進行", "progress"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "amber";
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

function ExcelFilterPopover({
  filterKey,
  getOptions,
  label,
  selectedValues,
  onSelectedValuesChange,
}: {
  filterKey: ColumnFilterKey;
  getOptions: (key: ColumnFilterKey) => ExcelFilterOption[];
  label: string;
  selectedValues: ColumnFilterSelection;
  onSelectedValuesChange: (values: ColumnFilterSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPanelReady, setIsPanelReady] = useState(false);
  const [options, setOptions] = useState<ExcelFilterOption[]>([]);
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
      setOptions([]);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOptions(getOptions(filterKey));
      setIsPanelReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [filterKey, getOptions, open]);

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
    onSelectedValuesChange(nextSelection);
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
          className={cn(
            "flex h-8 w-full items-center justify-between rounded border px-2 text-left text-xs font-bold transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/10",
            appliedSelectedValues === null
              ? "border-blue-300/20 bg-[#07182d] text-slate-200"
              : "border-cyan-300/45 bg-cyan-400/12 text-cyan-50",
          )}
          title={appliedSelectedValues === null ? `篩選${label}` : `${label}：已選 ${selectedCount} 項`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Filter className={cn("h-3.5 w-3.5 flex-none", appliedSelectedValues === null ? "text-cyan-300/70" : "text-cyan-200")} />
            <span className="truncate">{label}</span>
          </span>
          {appliedSelectedValues !== null && (
            <span className="ml-1 flex-none rounded bg-cyan-400/15 px-1.5 text-[10px] leading-4 text-cyan-100">
              {triggerSummary}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        sticky="always"
        data-testid="material-column-filter-panel"
        style={{
          maxHeight: "min(640px, calc(var(--radix-popover-content-available-height) - 12px))",
        }}
        className="w-[min(320px,calc(100vw-24px))] overflow-y-auto overscroll-contain border border-blue-400/25 bg-[#0d182b] p-2.5 text-slate-100 shadow-[0_24px_80px_rgba(2,8,23,0.55)] [scrollbar-color:rgba(103,232,249,0.45)_rgba(15,23,42,0.35)] [scrollbar-width:thin]"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-blue-400/15 bg-[#111f36] px-3 py-2">
            <p className="text-sm font-black text-slate-50">{label}</p>
            <span className="rounded bg-cyan-400/10 px-2 py-0.5 text-[11px] font-bold text-cyan-100">{panelSummary}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setSortDirection("asc")}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors",
                sortDirection === "asc"
                  ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                  : "border-blue-300/20 bg-[#111f36] text-slate-300 hover:bg-blue-400/10"
              )}
            >
              A → Z
            </button>
            <button
              type="button"
              onClick={() => setSortDirection("desc")}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors",
                sortDirection === "desc"
                  ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                  : "border-blue-300/20 bg-[#111f36] text-slate-300 hover:bg-blue-400/10"
              )}
            >
              Z → A
            </button>
            <button
              type="button"
              onClick={clearColumnDraft}
              className="rounded-lg border border-blue-400/15 bg-[#10192e] px-2 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              清除篩選
            </button>
          </div>

          <div className="rounded-xl border border-cyan-400/18 bg-cyan-400/[0.05] p-2">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200">搜尋</p>
              <Input
                value={draftSearchValue}
                onChange={(event) => setDraftSearchValue(event.target.value)}
                placeholder={`輸入 ${label} 關鍵字，只縮小清單`}
                className="h-9 rounded-lg border-blue-400/20 bg-[#111f36] px-3 text-[13px] text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500"
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
                      className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-[#192522]"
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
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-[#192522]"
                      />
                      <span className="min-w-0 flex-1 truncate">(選取所有搜尋結果)</span>
                      <span className="text-sm text-cyan-200">{visibleCheckedCount}/{filteredOptions.length}</span>
                    </label>

                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-[13px] text-slate-300 hover:bg-blue-400/10">
                      <Checkbox
                        checked={mergeSearchSelection}
                        onCheckedChange={(value) => setMergeSearchSelection(value === true)}
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-[#192522]"
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
                            className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-[#192522]"
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

          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t border-blue-400/15 bg-[#0d182b]/95 px-1 pb-0.5 pt-2 backdrop-blur">
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
      className={cn("relative border-r border-blue-300/20 px-2 py-2", className)}
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
  canEdit,
  value,
  onSave,
}: {
  canEdit: boolean;
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
      const confirmed = window.confirm("虛擬料號尚未填入資訊，確定要維持空白嗎？");
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
    if (!canEdit || pendingValue == null) return;
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
        className="h-8 border-teal-300/50 bg-[#071522] font-mono text-[13px] font-bold text-teal-100 focus-visible:ring-teal-400"
        placeholder="輸入虛擬料號"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setEditing(true)}
        className="group flex h-8 w-full items-center justify-between gap-2 rounded-md border border-teal-400/20 bg-teal-400/[0.07] px-2 text-left transition-colors hover:bg-teal-400/15 disabled:cursor-default disabled:hover:bg-teal-400/[0.07]"
        title={value ? `虛擬料號：${value}（點擊修改）` : "點擊填寫虛擬料號"}
      >
        <span className={cn("min-w-0 truncate font-mono text-[13px] font-bold", value ? "text-teal-200 group-hover:text-teal-100" : "text-slate-400")}>{value || "填寫虛擬料號"}</span>
        <Pencil className="h-3.5 w-3.5 flex-none text-teal-400/80" />
      </button>
      {/* Mounted only while confirming so a page of rows does not carry a dialog each. */}
      {confirmOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) closeConfirmation(); }}>
          <DialogContent className="max-w-sm border-teal-400/25 bg-[#0d1729] p-5 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-lg text-slate-50">確認更新虛擬料號</DialogTitle>
              <DialogDescription className="text-slate-400">送出後會寫入共用資料。</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border border-teal-400/15 bg-[#091222] px-3 py-2.5 text-sm">
              <dt className="text-slate-400">原本</dt>
              <dd className="break-all font-mono font-bold text-slate-200">{value || "空白"}</dd>
              <dt className="text-slate-400">更新後</dt>
              <dd className="break-all font-mono font-bold text-teal-200">{pendingValue || "空白"}</dd>
            </dl>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={closeConfirmation} className="border-slate-400/20 bg-transparent text-slate-300 hover:bg-slate-400/10 hover:text-slate-100">取消</Button>
              <Button type="button" size="sm" onClick={confirmSave} className="bg-teal-500 font-bold text-slate-950 hover:bg-teal-400">確認更新</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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
  const statusLabel = getTrackingStatusDisplayLabel(workflowStatus);
  const summary = latestEntry?.note || (latestEntry ? `${historyCount} 筆紀錄` : "建立第一筆追蹤");
  const tooltip = [
    `${statusLabel} · ${historyCount} 筆${latestEntry?.createdAt ? ` · ${formatTimestamp(latestEntry.createdAt)}` : ""}`,
    latestEntry?.note ?? "",
  ].filter(Boolean).join("\n");

  return (
    <button
      type="button"
      data-testid="tracking-history-cell"
      onClick={() => onOpen(record)}
      className={cn(
        "group flex min-h-[40px] w-full items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors",
        cardTone.wrapper,
      )}
      title={tooltip}
    >
      <span className={cn("inline-flex flex-none rounded-full border px-1.5 py-0.5 text-[11px] font-bold leading-4", getTrackingStatusTone(workflowStatus))}>
        {statusLabel}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-xs", latestEntry?.note ? "text-slate-200" : "text-slate-400")}>
        {summary}
      </span>
      {requestMeta.ticket && (
        requestMeta.url ? (
          <a
            href={requestMeta.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex max-w-20 flex-none truncate rounded border border-amber-300/30 bg-amber-400/12 px-1 text-[10px] font-bold leading-4 text-amber-100 hover:bg-amber-400/22"
            title={`${requestMeta.ticket} · ${requestMeta.url}`}
          >
            {requestMeta.ticket}
          </a>
        ) : (
          <span className="inline-flex max-w-20 flex-none truncate rounded border border-amber-300/30 bg-amber-400/12 px-1 text-[10px] font-bold leading-4 text-amber-100" title={requestMeta.ticket}>
            {requestMeta.ticket}
          </span>
        )
      )}
      <History className={cn("h-3.5 w-3.5 flex-none opacity-75 transition-opacity group-hover:opacity-100", cardTone.icon)} />
    </button>
  );
}

function TrackingHistoryDialog({
  canEdit,
  open,
  record,
  onOpenChange,
  onSave,
}: {
  canEdit: boolean;
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
  }, [open, record?.id, record?.requestTicket, record?.requestUrl]);

  const appendImageFiles = useCallback(async (files: File[], source: "picker" | "clipboard") => {
    if (files.length === 0) return;

    const invalidFiles = files.filter((file) => !file.type.startsWith("image/"));
    if (invalidFiles.length > 0) {
      toast({
        title: "只支援圖片檔案",
        description: invalidFiles.map((file) => file.name).join("、"),
        variant: "destructive",
      });
    }

    const timestamp = new Date();
    const validFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file, index) => {
        if (source !== "clipboard") return file;
        const baseName = createClipboardImageName(file.type, timestamp);
        const name = index === 0 ? baseName : baseName.replace(/(\.[^.]+)$/, `-${index + 1}$1`);
        return new File([file], name, { type: file.type, lastModified: timestamp.getTime() });
      });
    if (validFiles.length === 0) return;

    try {
      const nextImages = await Promise.all(validFiles.map(readImageFile));
      setImages((current) => [...current, ...nextImages]);
      if (source === "clipboard") {
        toast({
          title: `已貼上 ${nextImages.length} 張圖片`,
          description: "圖片已加入這筆追蹤，儲存追蹤後才會正式寫入。",
        });
      }
    } catch (error) {
      toast({
        title: "圖片讀取失敗",
        description: error instanceof Error ? error.message : "請重新選擇圖片後再試一次。",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    void appendImageFiles(files, "picker");
    event.target.value = "";
  };

  const handleImagePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    const clipboardFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .flatMap((item) => {
        const file = item.getAsFile();
        return file ? [file] : [];
      });
    if (clipboardFiles.length === 0) return;

    event.preventDefault();
    void appendImageFiles(clipboardFiles, "clipboard");
  };

  const handleSave = () => {
    if (!canEdit || !record || !status.trim()) return;

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
    if (!canEdit || !record) return;

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

  const requestMeta = record ? getTrackingRequestMeta(record) : { ticket: "", url: "" };
  const fieldClassName = "h-9 border-blue-400/25 bg-[#071522] text-sm text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500";
  const dialogDescription = record
    ? `${record.name || "未命名料件"} · ${record.manufacturerPartNumber || record.partNumber || record.displayRef}`
    : "管理目前料件的追蹤歷史與附件圖片。";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onPaste={handleImagePaste} className="max-h-[92vh] max-w-5xl gap-0 overflow-hidden border-cyan-300/25 bg-[#071422] p-0 text-slate-100 shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
          <DialogHeader className="border-b border-cyan-300/15 bg-[linear-gradient(115deg,rgba(24,83,118,0.38),rgba(8,25,42,0.96)_52%,rgba(10,57,63,0.34))] px-5 py-3 pr-12">
            <DialogTitle className="text-lg text-slate-50">狀態追蹤</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-400" title={dialogDescription}>
              {dialogDescription}
            </DialogDescription>
          </DialogHeader>

          {record && (
            <div className="grid max-h-[calc(92vh-64px)] items-start gap-3 overflow-y-auto px-4 py-3 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="self-start overflow-hidden rounded-xl border border-sky-300/20 bg-[linear-gradient(155deg,rgba(16,41,65,0.96),rgba(8,24,40,0.98))]">
                <div data-testid="tracking-current-summary" className="flex flex-wrap items-center gap-2 border-b border-sky-300/15 bg-sky-300/[0.055] px-4 py-2.5">
                  <h3 className="text-sm font-bold text-slate-50">最新狀態</h3>
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold", getTrackingStatusTone(latestWorkflowStatus))}>
                    {getTrackingStatusDisplayLabel(latestWorkflowStatus)}
                  </span>
                  <span className="text-xs text-slate-400">歷史 {historyEntries.length} 筆</span>
                  {latestEntry?.createdAt && <span className="text-xs text-slate-400">· {formatTimestamp(latestEntry.createdAt)}</span>}
                  {latestEntry?.createdBy && <span className="text-xs text-slate-400">· {latestEntry.createdBy}</span>}
                  {requestMeta.ticket && (
                    requestMeta.url
                      ? <a href={requestMeta.url} target="_blank" rel="noreferrer" className="rounded border border-amber-300/30 bg-amber-400/12 px-1.5 text-[11px] font-bold leading-5 text-amber-100 hover:bg-amber-400/22">單號 {requestMeta.ticket}</a>
                      : <span className="rounded border border-amber-300/30 bg-amber-400/12 px-1.5 text-[11px] font-bold leading-5 text-amber-100">單號 {requestMeta.ticket}</span>
                  )}
                  {latestWorkflowStatus !== "已完成" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleMarkCompleted} disabled={!canEdit}
                      className="ml-auto h-8 border-emerald-400/30 bg-emerald-400/15 px-3 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25 hover:text-emerald-50"
                    >
                      <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
                      直接標記完成
                    </Button>
                  )}
                </div>
                <div className="px-4 py-2.5">
                  <p className="text-sm leading-6 text-slate-300">
                    {latestEntry?.note || "還沒有追蹤備註，建立第一筆後會顯示在這裡。"}
                  </p>
                  {latestEntry?.requestInfo && (
                    <p className="mt-1.5 truncate text-xs text-amber-200" title={latestEntry.requestInfo}>
                      申請狀態資訊：
                      {isExternalUrl(latestEntry.requestInfo) ? (
                        <a href={latestEntry.requestInfo} target="_blank" rel="noreferrer" className="font-bold text-cyan-100 underline decoration-cyan-300/60 underline-offset-4 hover:text-cyan-50">
                          {latestEntry.requestInfo}
                        </a>
                      ) : (
                        <span className="font-bold text-slate-100">{latestEntry.requestInfo}</span>
                      )}
                    </p>
                  )}
                </div>

                <div data-testid="tracking-compose-panel" className="border-t border-cyan-300/15 bg-[#081726] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-cyan-300" />
                    <p className="text-sm font-bold text-cyan-100">新增一筆進度</p>
                    <span className="text-xs text-slate-400">狀態必填，其餘可留空</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="tracking-status-select" className="text-xs">最新狀態 *</Label>
                      <Select value={status} onValueChange={(value) => setStatus(value as (typeof TRACKING_STATUS_OPTIONS)[number])}>
                        <SelectTrigger id="tracking-status-select" className={fieldClassName}>
                          <SelectValue placeholder="選擇狀態" />
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
                    <div className="space-y-1">
                      <Label htmlFor="tracking-ticket-input" className="text-xs">單號</Label>
                      <Input id="tracking-ticket-input" value={requestTicket} onChange={(event) => setRequestTicket(event.target.value)} placeholder="Excel 單號 / ticket" className={fieldClassName} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tracking-request-url-input" className="text-xs">連結</Label>
                      <Input id="tracking-request-url-input" value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} placeholder="request URL" className={fieldClassName} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tracking-owner-input" className="text-xs">更新人</Label>
                      <Input id="tracking-owner-input" value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} placeholder="採購 / RD / 姓名" className={fieldClassName} />
                    </div>
                    <div className="space-y-1 md:col-span-2 xl:col-span-4">
                      <Label htmlFor="tracking-request-info-input" className="text-xs">申請狀態資訊</Label>
                      <Input id="tracking-request-info-input" value={requestInfo} onChange={(event) => setRequestInfo(event.target.value)} placeholder="Excel 單號 / ticket / request URL" className={fieldClassName} />
                    </div>
                    <div className="space-y-1 md:col-span-2 xl:col-span-4">
                      <Label htmlFor="tracking-note-input" className="text-xs">追蹤說明</Label>
                      <Textarea id="tracking-note-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="這次做了什麼、卡在哪、下一步" className="min-h-20 border-blue-400/25 bg-[#071522] text-sm text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
                      <label htmlFor="tracking-images-input" className="flex h-9 cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-cyan-300/40 bg-cyan-400/[0.08] px-3 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/[0.14]">
                        <span className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" />選擇圖片</span>
                        <span className="text-slate-400">或</span>
                        <span className="flex items-center gap-1.5 text-sky-200"><ClipboardPaste className="h-3.5 w-3.5" />在這個視窗按 Ctrl+V 貼上截圖</span>
                      </label>
                      <input id="tracking-images-input" type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                      {images.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                          {images.map((image) => (
                            <div key={image.id} className="relative overflow-hidden rounded-lg border border-blue-400/20 bg-[#0a1527]">
                              <button
                                type="button"
                                onClick={() => setPreviewImage(image)}
                                className="block aspect-[4/3] w-full bg-slate-950/40 transition hover:opacity-90"
                                title={`預覽圖片：${image.name} · ${(image.size / 1024).toFixed(1)} KB`}
                              >
                                <img src={image.dataUrl} alt={image.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                              </button>
                              <button type="button" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} className="absolute right-1 top-1 rounded-md border border-rose-400/30 bg-[#0a1527]/90 p-1 text-rose-200 hover:bg-rose-400/20" title="移除圖片">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div data-testid="tracking-dialog-footer" className="sticky bottom-0 -mx-4 mt-3 flex items-center justify-end gap-2 border-t border-cyan-300/15 bg-[#081726]/95 px-4 pt-3 backdrop-blur">
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="border-slate-400/20 bg-transparent text-slate-300 hover:bg-slate-400/10 hover:text-slate-100">
                      取消
                    </Button>
                    <Button type="button" size="sm" onClick={handleSave} disabled={!canEdit || !status.trim()} className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">
                      儲存這次追蹤
                    </Button>
                  </div>
                </div>
              </section>

            <section data-testid="tracking-history-panel" className="self-start rounded-xl border border-blue-300/20 bg-[linear-gradient(160deg,rgba(15,37,62,0.96),rgba(8,22,38,0.98))] p-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-300" />
                <h3 className="text-sm font-bold text-slate-50">過去歷史</h3>
                <span className="text-xs text-slate-400">{historyEntries.length} 筆</span>
              </div>

              <div className="mt-2.5 space-y-2">
                {historyEntries.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-400/20 bg-[#071522] px-3 py-4 text-center text-xs text-slate-400">
                    還沒有歷史紀錄
                  </div>
                )}

                {historyEntries.map((entry, index) => {
                  const entryTone = getTrackingStatusCardTone(entry.status);

                  return (
                    <article key={`${entry.id}-${index}`} className={cn("rounded-lg border p-2.5", entryTone.wrapper)}>
                      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", entryTone.meta)}>
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold", getTrackingStatusTone(entry.status))}>
                          {getTrackingStatusDisplayLabel(entry.status)}
                        </span>
                        {index === 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 text-[10px] font-bold leading-4 text-emerald-200"><CircleCheck className="h-3 w-3" />最新</span>}
                        <span>{entry.createdAt ? formatTimestamp(entry.createdAt) : "舊版狀態"}</span>
                        {entry.createdBy && <span>· {entry.createdBy}</span>}
                        {(entry.images?.length ?? 0) > 0 && <span>· {entry.images?.length} 張圖</span>}
                      </div>

                      {entry.note && (
                        <p className={cn("mt-2 whitespace-pre-wrap rounded-md px-2.5 py-2 text-sm leading-5", entryTone.note)}>
                          {entry.note}
                        </p>
                      )}

                      {(entry.requestTicket || entry.requestInfo) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          {entry.requestTicket && (
                            entry.requestUrl ? (
                              <a href={normalizeRequestUrl(entry.requestUrl)} target="_blank" rel="noreferrer" className="rounded border border-amber-300/35 bg-amber-400/16 px-1.5 font-bold leading-5 text-amber-100 hover:bg-amber-400/24">
                                單號 {entry.requestTicket}
                              </a>
                            ) : (
                              <span className="rounded border border-amber-300/35 bg-amber-400/16 px-1.5 font-bold leading-5 text-amber-100">單號 {entry.requestTicket}</span>
                            )
                          )}
                          {entry.requestInfo && (
                            isExternalUrl(entry.requestInfo)
                              ? <a href={entry.requestInfo} target="_blank" rel="noreferrer" className="truncate text-cyan-100 underline decoration-cyan-300/60 underline-offset-4 hover:text-cyan-50" title={entry.requestInfo}>申請狀態連結</a>
                              : <span className="truncate text-slate-300" title={entry.requestInfo}>{entry.requestInfo}</span>
                          )}
                        </div>
                      )}

                      {entry.images && entry.images.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {entry.images.map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => setPreviewImage(image)}
                              className="aspect-[4/3] overflow-hidden rounded-md border border-blue-400/15 bg-slate-950/30 hover:border-cyan-400/30"
                              title={`檢視圖片：${image.name}`}
                            >
                              <img src={image.dataUrl} alt={image.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
        <DialogContent className="max-w-4xl border-blue-400/30 bg-[#0d1729] p-4 text-slate-100">
          {previewImage && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate text-base text-slate-50">{previewImage.name}</DialogTitle>
                <DialogDescription className="text-xs text-slate-400">{(previewImage.size / 1024).toFixed(1)} KB</DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden rounded-xl border border-blue-400/15 bg-slate-950/40">
                <img src={previewImage.dataUrl} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" />
              </div>
              <div className="flex justify-end">
                <a
                  href={previewImage.dataUrl}
                  download={previewImage.name}
                  className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
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

function SymbolBuildStatus({ record, className }: { record: MaterialRecord; className?: string }) {
  const value = getMaterialSourceValue(record.symbolStatus);
  return (
    <span
      data-testid="material-symbol-build-status"
      className={cn("block min-w-0 max-w-full truncate text-xs font-semibold leading-5 text-slate-200", className)}
      title={`Symbol：${value}`}
    >
      {value}
    </span>
  );
}

function PhaseOutStatus({ record }: { record: MaterialRecord }) {
  const value = getMaterialSourceValue(record.phaseOutStatus);
  return <span data-testid="material-phase-out-status" className="block truncate text-xs font-semibold leading-5 text-slate-200" title={`phase out（零件狀態）：${value}`}>{value}</span>;
}

function StatusPill({ record }: { record: MaterialRecord }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid="material-source-status">
      <div className="flex min-w-0 items-center gap-1">
        <ActionPill record={record} />
        <span className="inline-flex min-w-0 truncate rounded border border-slate-400/25 bg-slate-400/10 px-1.5 text-[11px] font-bold leading-5 text-slate-300" title={`供應／核准狀態：${record.sourcingStatus || "未提供"}`}>
          {record.sourcingStatus || "供應／核准狀態未提供"}
        </span>
        <span className={cn("inline-flex min-w-0 truncate rounded border px-1.5 text-[11px] font-bold leading-5", record.isRisk ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-slate-400/25 bg-slate-400/10 text-slate-300")} title={`零件狀態：${record.partUsageStatus || "未提供"}`}>
          {record.partUsageStatus || "零件狀態未提供"}
        </span>
      </div>
    </div>
  );
}

function PartUsageSummary({ records }: { records: MaterialRecord[] }) {
  const statuses = [...new Set(records.map(record => record.partUsageStatus?.trim()).filter(Boolean))];
  if (!statuses.length) return null;
  const risk = records.some(record => record.isRisk);
  return (
    <span
      data-testid="material-part-usage-summary"
      className={cn("inline-flex max-w-[9rem] flex-none truncate rounded border px-1.5 text-[11px] font-semibold leading-5", risk ? "border-rose-300/35 bg-rose-400/12 text-rose-100" : "border-slate-500/30 bg-slate-500/10 text-slate-300")}
      title={`零件狀態：${statuses.join("；")}`}
    >
      {statuses.join("；")}
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
    <span className={cn("inline-flex min-w-0 truncate rounded-full border px-2 text-[11px] font-bold leading-5", className)} title={getActionLabel(record.actionKind)}>
      {getActionLabel(record.actionKind)}
    </span>
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
  }, [open, workspace]);

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

  const numberFieldClassName = "h-8 w-24 border-blue-400/20 bg-[#111f36] text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60";
  const dialogDescription = `${workspace.name} · ${workspace.payload.sheetName} · ${workspace.payload.recordCount.toLocaleString()} 筆料件`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-3 overflow-hidden border-blue-400/30 bg-[#0d1729] p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg text-slate-50">頁數進度</DialogTitle>
          <DialogDescription className="truncate text-xs text-slate-400" title={dialogDescription}>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-blue-400/20 bg-[#101d33] px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="bom-total-pages" className="text-xs">總頁數</Label>
            <Input
              id="bom-total-pages"
              type="number"
              min={0}
              max={MAX_BOM_TRACKER_PAGES}
              step={1}
              value={totalPagesInput}
              onChange={(event) => setTotalPagesInput(event.target.value)}
              placeholder="例如 12"
              title={`可填 0 到 ${MAX_BOM_TRACKER_PAGES} 頁；頁數調小時，後面頁面的備註會先保留`}
              className={numberFieldClassName}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bom-current-page" className="text-xs">目前做到第幾頁</Label>
            <Input
              id="bom-current-page"
              type="number"
              min={0}
              max={Math.max(totalPages, MAX_BOM_TRACKER_PAGES)}
              step={1}
              value={currentPageInput}
              onChange={(event) => setCurrentPageInput(event.target.value)}
              placeholder={totalPages > 0 ? `1 ~ ${totalPages}` : "先填總頁數"}
              disabled={totalPages === 0}
              title="主畫面的頁數進度會顯示這一頁"
              className={numberFieldClassName}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pb-0.5 text-xs font-bold">
            <BomPageTrackerSummaryPill pageTracker={{ totalPages, currentPage, pages: syncedPages, updatedAt: workspace.pageTracker?.updatedAt ?? workspace.updatedAt }} />
            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">完成率 {completionRate}%</span>
          </div>
        </div>

        {totalPages === 0 ? (
          <div className="rounded-xl border border-dashed border-blue-400/20 bg-[#0b1322] px-6 py-10 text-center">
            <p className="text-sm font-bold text-slate-200">先填總頁數，下面就會列出每一頁</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2.5">
              <span className="text-xs font-bold text-slate-200">批次設定</span>
              <Label htmlFor="bom-range-start" className="text-xs text-slate-400">第</Label>
              <Input
                id="bom-range-start"
                type="number"
                min={1}
                max={Math.max(totalPages, 1)}
                step={1}
                value={rangeStartInput}
                onChange={(event) => setRangeStartInput(event.target.value)}
                aria-label="起始頁"
                className="h-8 w-20 border-emerald-400/20 bg-[#111f36] text-sm text-slate-100"
              />
              <Label htmlFor="bom-range-end" className="text-xs text-slate-400">~</Label>
              <Input
                id="bom-range-end"
                type="number"
                min={1}
                max={Math.max(totalPages, 1)}
                step={1}
                value={rangeEndInput}
                onChange={(event) => setRangeEndInput(event.target.value)}
                aria-label="結束頁"
                className="h-8 w-20 border-emerald-400/20 bg-[#111f36] text-sm text-slate-100"
              />
              <span className="text-xs text-slate-400">頁設為</span>
              {BOM_PAGE_STATUS_OPTIONS.map((option) => (
                <Button
                  key={`range-${option.value}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyRangeStatus(option.value)}
                  disabled={rangeSelectionCount === 0}
                  className={cn("h-8 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/20 disabled:text-slate-400", option.idleClassName)}
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-auto text-xs text-slate-400">
                {rangeSelectionCount > 0 ? `共 ${rangeSelectionCount} 頁，備註會保留` : "先填起訖頁"}
              </span>
            </div>

            <div className="flex items-center justify-between px-1 text-xs text-slate-400">
              <span>逐頁狀態與備註</span>
              <span>{completedPages} / {totalPages} 頁完成</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-blue-400/15 bg-[#0b1322]">
              <div className="divide-y divide-blue-400/10">
                {visiblePages.map((page) => {
                  const statusMeta = getBomPageStatusMeta(page.status);
                  const isCurrent = page.pageNumber === currentPage;

                  return (
                    <div
                      key={page.pageNumber}
                      className={cn("flex flex-wrap items-center gap-2 px-3 py-1.5", isCurrent && "bg-cyan-400/[0.08]")}
                    >
                      <span className={cn("w-16 flex-none text-sm font-black", statusMeta.textClassName)}>第 {page.pageNumber} 頁</span>
                      <div className="flex flex-none gap-1">
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
                            className={cn("h-7 px-2.5 text-xs font-bold", page.status === option.value ? option.activeClassName : option.idleClassName)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      {isCurrent ? (
                        <span className="flex-none rounded-full border border-cyan-300/35 bg-cyan-400/16 px-2 text-[11px] font-bold leading-5 text-cyan-100">目前頁</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentPageInput(String(page.pageNumber))}
                          className="flex-none rounded-full border border-cyan-400/20 px-2 text-[11px] font-bold leading-5 text-cyan-200/80 hover:bg-cyan-400/10 hover:text-cyan-100"
                        >
                          設為目前頁
                        </button>
                      )}
                      <Input
                        value={page.note}
                        onChange={(event) => {
                          updatePage(page.pageNumber, { note: event.target.value });
                          if (currentPage === 0 || page.pageNumber > currentPage) {
                            setCurrentPageInput(String(page.pageNumber));
                          }
                        }}
                        placeholder="備註：缺 A 料、等 RD 回覆、已送審"
                        aria-label={`第 ${page.pageNumber} 頁備註`}
                        className="h-8 min-w-[12rem] flex-1 border-blue-400/20 bg-[#111f36] text-sm text-slate-100 placeholder:text-slate-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-blue-400/20 bg-blue-400/10 text-slate-200 hover:bg-blue-400/20"
          >
            關閉
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isSaving ? "儲存中..." : "儲存頁數進度"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BomManagerDialog({
  canEdit,
  activeBomId,
  bomWorkspaces,
  open,
  onDelete,
  onOpenChange,
  onOpenPageTracker,
  onSelect,
}: {
  canEdit: boolean;
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
  const activeWorkspaceName = bomWorkspaces.find((workspace) => workspace.id === activeBomId)?.name ?? "未選擇";
  const dialogDescription = `共 ${bomWorkspaces.length} 個 BOM · ${totalRecordCount.toLocaleString()} 筆明細 · 目前使用：${activeWorkspaceName}`;
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
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-3 overflow-hidden border-blue-400/30 bg-[#0d1729] p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg text-slate-50">BOM 管理</DialogTitle>
          <DialogDescription className="truncate text-xs text-slate-400" title={dialogDescription}>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-300" />
          <Input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="搜尋 BOM 名稱、工作表或來源檔名"
            className="h-9 border-blue-400/20 bg-[#111f36] pl-9 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {filteredWorkspaces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-400/20 bg-[#10192c] px-6 py-10 text-center text-sm text-slate-400">
              找不到符合條件的 BOM
            </div>
          ) : filteredWorkspaces.map((workspace, index) => {
            const isActive = workspace.id === activeBomId;
            const pageTrackerSummary = getBomPageTrackerSummary(workspace.pageTracker);
            const hasTracking = workspaceHasTrackingActivity(workspace);
            const pageText = pageTrackerSummary.totalPages > 0
              ? `${pageTrackerSummary.currentPage > 0 ? `第 ${pageTrackerSummary.currentPage}/${pageTrackerSummary.totalPages} 頁 · ` : ""}完成 ${pageTrackerSummary.completedPages} 頁`
              : "頁數未設定";
            const detail = [
              `來源：${workspace.payload.sourceFile}`,
              `工作表：${workspace.payload.sheetName}`,
              `建立：${formatTimestamp(workspace.payload.generatedAt)}`,
              `最後更新：${formatTimestamp(workspace.updatedAt)}`,
              `BOM ID：${workspace.id}`,
            ].join("\n");

            return (
              <div
                key={workspace.id}
                className={cn(
                  "rounded-lg border px-3 py-2 transition-colors",
                  isActive
                    ? hasTracking
                      ? "border-amber-300/45 bg-amber-400/12"
                      : "border-cyan-300/40 bg-cyan-400/10"
                    : hasTracking
                      ? "border-amber-400/24 bg-amber-400/[0.07] hover:bg-amber-400/[0.11]"
                      : "border-blue-400/15 bg-[#101d33] hover:bg-[#13223b]"
                )}
                title={detail}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-none rounded-full border border-blue-300/20 bg-blue-400/10 px-1.5 text-[10px] font-black leading-4 text-blue-100">#{index + 1}</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-50">{workspace.name}</p>
                  {isActive && <span className="flex-none rounded-full border border-cyan-300/35 bg-cyan-400/15 px-1.5 text-[10px] font-black leading-4 text-cyan-100">使用中</span>}
                  {hasTracking && <span className="flex-none rounded-full border border-amber-300/35 bg-amber-400/16 px-1.5 text-[10px] font-black leading-4 text-amber-100">含追蹤</span>}
                  {!isActive && index === 0 && <span className="flex-none rounded-full border border-violet-300/35 bg-violet-400/15 px-1.5 text-[10px] font-black leading-4 text-violet-100">最近更新</span>}
                  <div className="ml-1 flex flex-none items-center gap-1">
                    <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => onOpenPageTracker(workspace.id)} className="h-7 border-emerald-400/25 bg-emerald-400/10 px-2 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-100">頁數</Button>
                    {!isActive && (
                      <Button type="button" variant="outline" size="sm" onClick={() => onSelect(workspace.id)} className="h-7 border-cyan-400/25 bg-cyan-400/10 px-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100">切換</Button>
                    )}
                    <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => onDelete(workspace.id)} className="h-7 border-rose-400/25 bg-rose-400/10 px-2 text-xs font-bold text-rose-200 hover:bg-rose-400/20 hover:text-rose-100">刪除</Button>
                  </div>
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {workspace.payload.sourceFile} · {workspace.payload.sheetName} · {workspace.payload.recordCount.toLocaleString()} 筆 · 更新 {formatRelativeTimestamp(workspace.updatedAt)} · {pageText}
                </p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MaterialRecordDialog({
  canEdit,
  open,
  mode,
  record,
  onOpenChange,
  onModeChange,
  onSave,
}: {
  canEdit: boolean;
  open: boolean;
  mode: EditorMode;
  record: MaterialWorkbookRecord;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: EditorMode) => void;
  onSave: (record: MaterialWorkbookRecord) => void;
}) {
  const [form, setForm] = useState(record);
  const { toast } = useToast();
  const readOnly = mode === "view" || !canEdit;
  const latestTrackingEntry = getLatestTrackingEntry(form);
  const trackingMeta = getTrackingRequestMeta(form);

  useEffect(() => {
    if (open) setForm(toWorkbookRecord(record));
  }, [open, record]);

  const updateField = (field: keyof MaterialWorkbookRecord, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    if (!form.refGroup.trim() || !form.name.trim()) return;
    if (!isValidBomUsage(form.qty)) {
      toast({ title: "Qty 是單一產品用量，不能為負數", variant: "destructive" });
      return;
    }
    onSave({ ...form, level: 2 });
  };

  const title = mode === "create" ? "新增料件 / 替代料" : mode === "edit" ? "修改料件資料" : "料件詳細資訊";

  return (
    <TooltipProvider delayDuration={160}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="material-record-dialog max-h-[90vh] max-w-4xl gap-3 overflow-y-auto border-cyan-300/30 bg-[#091727] p-5 text-slate-100 shadow-[0_28px_90px_rgba(0,0,0,0.55)] [&_input]:h-9 [&_input]:text-sm">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg text-slate-50">{title}</DialogTitle>
            <span className={cn("rounded-full border px-2 text-[11px] font-black leading-5", readOnly ? "border-slate-400/25 bg-slate-400/10 text-slate-300" : "border-cyan-300/30 bg-cyan-300/12 text-cyan-100")}>
              {readOnly ? "唯讀" : "編輯中"}
            </span>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            <span className="text-rose-300">*</span> 為必填；? 說明與 CE Excel 一致。內部分組、模組及申請追蹤由網站管理。
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border border-sky-300/24 bg-[linear-gradient(145deg,rgba(18,46,74,0.96),rgba(10,27,45,0.98))] p-3 [&_input]:border-sky-300/22 [&_input]:bg-[#071522] [&_textarea]:border-sky-300/22 [&_textarea]:bg-[#071522]">
          <h3 className="mb-2.5 text-sm font-black text-sky-100">電路與原理圖 <span className="font-normal text-slate-400">· 決定主料分組與位置</span></h3>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <div className="space-y-1">
              <MaterialFieldLabel field="refGroup" htmlFor="material-ref" label="內部分組（網站）" required />
              <Input id="material-ref" disabled={readOnly} value={form.refGroup} onChange={(event) => updateField("refGroup", event.target.value)} placeholder="例如 C101；僅供網站分組" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="refDes" htmlFor="material-ref-des" label="REF DES" />
              <Input id="material-ref-des" disabled={readOnly} value={form.refDes} onChange={(event) => updateField("refDes", event.target.value)} placeholder="例如 C418、R806" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <MaterialFieldLabel field="name" htmlFor="material-name" label="料件名稱" required />
              <Input id="material-name" disabled={readOnly} value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="例如 CAP CER 0.1UF 16V" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="qty" htmlFor="material-qty" label="Qty" />
              <Input id="material-qty" disabled={readOnly} value={String(form.qty)} onChange={(event) => updateField("qty", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="assemblyName" htmlFor="material-assembly" label="模組" />
              <Input id="material-assembly" disabled={readOnly} value={form.assemblyName} onChange={(event) => updateField("assemblyName", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="schematicPart" htmlFor="material-symbol" label="原理圖符號名稱" />
              <Input id="material-symbol" disabled={readOnly} value={form.schematicPart} onChange={(event) => updateField("schematicPart", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="symbolStatus" htmlFor="material-symbol-status" label="Symbol" />
              <Input id="material-symbol-status" disabled={readOnly} value={form.symbolStatus ?? ""} onChange={(event) => updateField("symbolStatus", event.target.value)} placeholder="保留 Excel 原始值" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="pcbFootprint" htmlFor="material-footprint" label="PCB 封裝名稱" />
              <Input id="material-footprint" disabled={readOnly} value={form.pcbFootprint} onChange={(event) => updateField("pcbFootprint", event.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-3">
              <MaterialFieldLabel field="partSpec" htmlFor="material-spec" label="料件規格" />
              <Textarea id="material-spec" disabled={readOnly} value={form.partSpec} onChange={(event) => updateField("partSpec", event.target.value)} className="min-h-9 text-sm" rows={1} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-teal-300/24 bg-[linear-gradient(145deg,rgba(13,50,59,0.94),rgba(8,28,42,0.98))] p-3 [&_input]:border-teal-300/22 [&_input]:bg-[#071522] [&_textarea]:border-teal-300/22 [&_textarea]:bg-[#071522]">
          <h3 className="mb-2.5 text-sm font-black text-teal-100">廠商、料號與申請 <span className="font-normal text-slate-400">· 展開後的替代料明細</span></h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <MaterialFieldLabel field="manufacturer" htmlFor="material-maker" label="廠商" />
              <Input id="material-maker" disabled={readOnly} value={form.manufacturer} onChange={(event) => updateField("manufacturer", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="manufacturerPartNumber" htmlFor="material-mpn" label="廠商料號（MPN）" />
              <Input id="material-mpn" disabled={readOnly} value={form.manufacturerPartNumber} onChange={(event) => updateField("manufacturerPartNumber", event.target.value)} />
            </div>
            {form.manufacturerPartNumberAlt.trim() && (
              <div className="space-y-1">
                <MaterialFieldLabel field="manufacturerPartNumberAlt" htmlFor="material-mpn-2" label="舊檔第二 MPN" />
                <Input id="material-mpn-2" disabled={readOnly} value={form.manufacturerPartNumberAlt} onChange={(event) => updateField("manufacturerPartNumberAlt", event.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <MaterialFieldLabel field="partNumber" htmlFor="material-internal-pn" label="實體料號" />
              <Input id="material-internal-pn" disabled={readOnly} value={form.partNumber} onChange={(event) => updateField("partNumber", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="partName" htmlFor="material-part-name" label="實體料名" />
              <Input id="material-part-name" disabled={readOnly} value={form.partName} onChange={(event) => updateField("partName", event.target.value)} />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="virtualAlternative" htmlFor="material-virtual-alternative" label="虛擬料號" />
              <Input id="material-virtual-alternative" disabled={readOnly} value={form.virtualAlternative ?? ""} onChange={(event) => updateField("virtualAlternative", event.target.value)} placeholder="多個可共用實體料的上層料號" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="sourcingStatus" htmlFor="material-sourcing" label="供應／核准狀態" />
              <Input id="material-sourcing" disabled={readOnly} value={form.sourcingStatus} onChange={(event) => updateField("sourcingStatus", event.target.value)} placeholder="Approved / NRND / Obsolete" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="phaseOutStatus" htmlFor="material-phase-out" label="phase out（零件狀態）" />
              <Input id="material-phase-out" disabled={readOnly} value={form.phaseOutStatus ?? ""} onChange={(event) => updateField("phaseOutStatus", event.target.value)} placeholder="保留原文，例如 ACTIVE／PHASEOUT" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="partUsageStatus" htmlFor="material-part-usage" label="零件狀態" />
              <Input id="material-part-usage" disabled={readOnly} value={form.partUsageStatus ?? ""} onChange={(event) => updateField("partUsageStatus", event.target.value)} placeholder="禁用／EOL／待確認" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="requestTicket" htmlFor="material-request-ticket" label="單號" />
              <Input id="material-request-ticket" disabled={readOnly} value={form.requestTicket ?? ""} onChange={(event) => updateField("requestTicket", event.target.value)} placeholder="Excel 單號 / ticket" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <MaterialFieldLabel field="requestUrl" htmlFor="material-request-url" label="單號連結" />
              <Input id="material-request-url" disabled={readOnly} value={form.requestUrl ?? ""} onChange={(event) => updateField("requestUrl", event.target.value)} placeholder="request URL" />
            </div>
            <div className="space-y-1">
              <MaterialFieldLabel field="tracking" label="狀態追蹤" />
              <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-sky-400/20 bg-sky-400/[0.06] px-3 text-xs" title={latestTrackingEntry?.note || "從表格的「狀態追蹤」欄位新增歷史與圖片"}>
                <span className="flex-none font-bold text-sky-200">{latestTrackingEntry?.status || "尚未建立"}</span>
                <span className="min-w-0 truncate text-slate-300">{latestTrackingEntry?.note || "從表格的「狀態追蹤」管理"}</span>
                {latestTrackingEntry?.createdAt && <span className="flex-none text-slate-400">{formatTimestamp(latestTrackingEntry.createdAt)}</span>}
                {trackingMeta.ticket && <span className="flex-none text-amber-200">單號 {trackingMeta.ticket}</span>}
              </div>
            </div>
            <div className="space-y-1 md:col-span-3">
              <MaterialFieldLabel field="remark" htmlFor="material-remark" label="申請狀態 / 備註" />
              <Textarea id="material-remark" disabled={readOnly} value={form.remark} onChange={(event) => updateField("remark", event.target.value)} className="min-h-9 text-sm" rows={1} placeholder="例如 待確認實體料號、只需補 Symbol" />
            </div>
          </div>
        </section>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="border-slate-400/20 bg-transparent text-slate-300 hover:bg-slate-400/10 hover:text-slate-100">
            {readOnly ? "關閉" : "取消"}
          </Button>
          {readOnly ? (
            <Button type="button" size="sm" disabled={!canEdit} onClick={() => onModeChange("edit")} className="bg-blue-600 text-white hover:bg-blue-500">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />修改這筆
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleSave} disabled={!form.refGroup.trim() || !form.name.trim()} className="bg-blue-600 text-white hover:bg-blue-500">
              儲存資料
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}

type MaterialColumnVisibility = Record<MaterialTableColumnKey, boolean>;

interface MaterialRowActions {
  toggleExpanded: (key: string) => void;
  toggleMarked: (key: string) => void;
  copy: (value: string) => void;
  openCreate: (group: MaterialGroup) => void;
  openTracking: (record: MaterialRecord) => void;
  saveVirtual: (record: MaterialRecord, value: string) => void;
  viewRecord: (record: MaterialRecord) => void;
  editRecord: (record: MaterialRecord) => void;
}

interface VisibleGroupRow {
  group: MaterialGroup;
  matchingRecords: MaterialRecord[];
  primaryAlternative: MaterialRecord;
  virtualAlternativeRecord: MaterialRecord | null;
  trackingRecord: MaterialRecord;
  secondaryAlternatives: MaterialRecord[];
  uniqueMpnCount: number;
}

const MATERIAL_CELL_CLASS = "border-r border-blue-400/10 px-2 py-1.5 align-middle";

const stopRowToggle = (event: { stopPropagation: () => void }) => event.stopPropagation();

function MaterialColumnSettings({
  hiddenColumns,
  onToggle,
  onShowAll,
  onResetWidths,
  onOpenColors,
}: {
  hiddenColumns: MaterialTableColumnKey[];
  onToggle: (key: MaterialTableColumnKey) => void;
  onShowAll: () => void;
  onResetWidths: () => void;
  onOpenColors: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="material-column-visibility"
          className="h-8 border-violet-300/35 bg-violet-400/12 px-2.5 text-xs font-bold text-violet-100 hover:bg-violet-400/22 hover:text-white"
        >
          <Columns3 className="mr-1.5 h-3.5 w-3.5" />
          欄位
          {hiddenColumns.length > 0 && (
            <span className="ml-1.5 rounded-full border border-current/25 px-1.5 text-[10px] leading-4">隱藏 {hiddenColumns.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-60 border border-blue-400/25 bg-[#0d182b] p-2 text-slate-100 shadow-[0_24px_80px_rgba(2,8,23,0.55)]">
        <p className="px-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">顯示欄位</p>
        <div className="mt-1.5 space-y-0.5">
          {MATERIAL_TABLE_COLUMNS.map((column) => {
            const visible = !hiddenColumns.includes(column.key);
            return (
              <label
                key={column.key}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px]",
                  column.locked ? "cursor-default text-slate-400" : "cursor-pointer text-slate-100 hover:bg-blue-400/10",
                )}
              >
                <Checkbox
                  checked={visible}
                  disabled={column.locked}
                  onCheckedChange={() => onToggle(column.key)}
                  className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-[#192522]"
                />
                <span className="min-w-0 flex-1 truncate" title={MATERIAL_TABLE_COLUMN_HELP[column.key]}>{column.label}</span>
                {column.locked && <span className="text-[10px] text-slate-400">固定</span>}
              </label>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 border-t border-blue-400/15 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onShowAll} disabled={hiddenColumns.length === 0} className="h-7 px-1 text-xs text-slate-200 hover:bg-blue-400/10 hover:text-white">全部顯示</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onResetWidths} className="h-7 px-1 text-xs text-amber-100 hover:bg-amber-400/10 hover:text-amber-50">重設欄寬</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onOpenColors} className="h-7 px-1 text-xs text-violet-100 hover:bg-violet-400/10 hover:text-white">配色</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One main-material row. Memoised so typing in the search box or opening a
 * dialog does not re-render every row on the page; everything the row needs
 * arrives as primitives, memoised objects, or the stable `actions` bundle.
 */
const MaterialGroupRow = memo(function MaterialGroupRow({
  row,
  itemValue,
  expanded,
  isMarked,
  canEdit,
  editingNames,
  latestRecordUpdate,
  latestUpdater,
  colorTheme,
  columns,
  actions,
}: {
  row: VisibleGroupRow;
  itemValue: number;
  expanded: boolean;
  isMarked: boolean;
  canEdit: boolean;
  editingNames: string;
  latestRecordUpdate: string;
  latestUpdater: string;
  colorTheme: BomTableColorTheme;
  columns: MaterialColumnVisibility;
  actions: MaterialRowActions;
}) {
  const { group, matchingRecords, primaryAlternative, virtualAlternativeRecord, trackingRecord, secondaryAlternatives } = row;
  const mustApply = group.requiresApplication;
  const primaryReady = Boolean(primaryAlternative?.isPreferred && !primaryAlternative.isRisk);
  const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred && !record.isRisk).length;
  const hasAlternatives = secondaryAlternatives.length > 0;
  const groupRefDes = primaryAlternative?.refDes || group.primaryRecord.refDes || group.primaryRecord.refGroup || "-";
  const groupRefValues = splitRefDesignators(groupRefDes);
  const materialRefValues = splitRefDesignators(group.displayRef || groupRefDes);
  const materialMpnValues = group.records
    .flatMap((record) => [getDisplayMpn(record), record.manufacturerPartNumberAlt || ""])
    .filter(Boolean);
  const primaryMpn = primaryAlternative ? getDisplayMpn(primaryAlternative) : "";
  const statusRecord = primaryAlternative ?? group.primaryRecord;
  const statusLabel = group.riskCount > 0
    ? "料況需 RD 確認"
    : mustApply
      ? "未提供虛擬／實體料號"
      : primaryReady
        ? "主料資料齊備"
        : availableAlternativeCount > 0
          ? `資料齊備候選 ${availableAlternativeCount}`
          : "已有實體／虛擬料號，待確認";
  const statusClassName = group.riskCount > 0
    ? "border-rose-300/40 bg-rose-400/15 text-rose-200"
    : mustApply
      ? "border-amber-300/50 bg-amber-400/25 text-amber-100"
      : primaryReady
        ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-200"
        : "border-cyan-300/40 bg-cyan-400/20 text-cyan-100";
  const statusTitle = [
    primaryAlternative?.remark ? `主料 Remark：${primaryAlternative.remark}` : "",
    availableAlternativeCount > 0 ? `資料齊備候選 ${availableAlternativeCount}` : "",
    group.pendingCount > 0 ? `待建明細 ${group.pendingCount}` : "",
  ].filter(Boolean).join("\n");
  const valueClassName = primaryReady ? "text-emerald-100" : mustApply ? "text-amber-100" : "text-cyan-100";
  const iconClassName = primaryReady ? "text-emerald-300" : mustApply ? "text-amber-300" : "text-cyan-300";
  const mainRowStyle = buildTableRowStyle(colorTheme.primary, {
    backgroundAlpha: mustApply ? 0.2 : primaryReady ? 0.17 : 0.14,
    hoverAlpha: mustApply ? 0.28 : primaryReady ? 0.23 : 0.19,
    accentAlpha: 0.95,
  });
  const updateTitle = latestRecordUpdate
    ? `最後修改：${latestUpdater ? `${latestUpdater} · ` : ""}${formatTimestamp(latestRecordUpdate)}`
    : "新增或更新這組料的資料";
  const expandLabel = hasAlternatives ? `${expanded ? "收合" : "展開"} ${secondaryAlternatives.length} 筆替代料` : "沒有替代料";

  return (
    <tbody>
      <tr
        onClick={() => hasAlternatives && actions.toggleExpanded(group.key)}
        style={mainRowStyle}
        className={cn(
          "group/material-row border-b border-blue-400/15 text-slate-200 transition-colors",
          hasAlternatives ? "cursor-pointer" : "cursor-default",
          "bg-[var(--material-row-bg)] hover:bg-[var(--material-row-hover)]",
        )}
      >
        {columns.item && (
          <td data-material-cell="item" className={cn(MATERIAL_CELL_CLASS, "text-center font-mono text-[13px] font-black text-slate-100")}>
            {itemValue}
          </td>
        )}
        {columns.marked && (
          <td data-material-cell="marked" className={cn(MATERIAL_CELL_CLASS, "text-center")} onClick={stopRowToggle}>
            <button
              type="button"
              onClick={() => actions.toggleMarked(group.key)}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                isMarked
                  ? "border-amber-300/40 bg-amber-400/18 text-amber-200 hover:bg-amber-400/24"
                  : "border-slate-500/25 bg-slate-900/35 text-slate-500 hover:border-amber-300/24 hover:bg-amber-400/10 hover:text-amber-200",
              )}
              title={isMarked ? "移除我的標記" : "加入我的標記"}
            >
              <Star className={cn("h-3.5 w-3.5", isMarked && "fill-current")} />
            </button>
          </td>
        )}
        {columns.material && (
          <td data-material-cell="material" className="relative overflow-hidden border-r border-blue-400/10 px-2 py-1.5">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--material-row-accent)]" />
            <div className="flex items-center gap-1.5 pl-1">
              <button
                type="button"
                disabled={!hasAlternatives}
                aria-expanded={hasAlternatives ? expanded : undefined}
                aria-label={expandLabel}
                title={expandLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  actions.toggleExpanded(group.key);
                }}
                className={cn(
                  "flex h-5 w-5 flex-none items-center justify-center rounded border disabled:cursor-default",
                  hasAlternatives
                    ? expanded
                      ? "border-blue-300/40 bg-blue-400/20 text-blue-200"
                      : "border-blue-400/20 bg-blue-400/10 text-blue-300"
                    : "border-slate-600/30 bg-slate-700/20 text-slate-600",
                )}
              >
                {hasAlternatives ? expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <span className="text-xs">—</span>}
              </button>
              <div className="min-w-0 flex-1">
                <MaterialIdentityHover
                  assemblyName={group.assemblyName || ""}
                  manufacturer={primaryAlternative?.manufacturer || group.primaryRecord.manufacturer || ""}
                  mpnValues={materialMpnValues}
                  name={group.name || ""}
                  qty={group.qty}
                  refValues={materialRefValues}
                />
              </div>
              <PartUsageSummary records={group.records} />
            </div>
          </td>
        )}
        {columns.refDes && (
          <td data-material-cell="refDes" className={MATERIAL_CELL_CLASS} onClick={stopRowToggle}>
            <CompactHoverValue
              label="REF DES"
              values={groupRefValues.length > 0 ? groupRefValues : groupRefDes}
              maxItems={1}
              onCopy={groupRefDes !== "-" ? () => actions.copy(groupRefDes) : undefined}
              previewClassName="font-mono text-[13px] font-black leading-5 text-sky-200 group-hover:text-sky-100"
            />
          </td>
        )}
        {columns.mpn && (
          <td data-material-cell="mpn" className={MATERIAL_CELL_CLASS}>
            {primaryAlternative ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (primaryMpn) actions.copy(primaryMpn);
                }}
                className="group flex w-full min-w-0 items-center gap-1.5 text-left"
                title={primaryMpn ? `複製首選 MPN：${primaryMpn}` : "尚未填 MPN"}
              >
                <span className={cn("min-w-0 truncate font-mono text-[13px] font-black leading-5", primaryMpn ? valueClassName : "text-amber-300")}>
                  {primaryMpn || "未填 MPN"}
                </span>
                {primaryMpn && <Copy className={cn("h-3.5 w-3.5 flex-none opacity-60 group-hover:opacity-100", iconClassName)} />}
              </button>
            ) : (
              <span className="text-xs font-semibold text-amber-300">尚未建立首選資料</span>
            )}
          </td>
        )}
        {columns.internal && (
          <td data-material-cell="internal" className={MATERIAL_CELL_CLASS}>
            <div className="flex min-w-0 flex-col">
              {primaryAlternative?.partNumber ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.copy(primaryAlternative.partNumber);
                  }}
                  className="group flex min-w-0 items-center gap-1.5 text-left"
                  title={`複製實體料號：${primaryAlternative.partNumber}`}
                >
                  <span className={cn("min-w-0 truncate font-mono text-[13px] font-black leading-5", valueClassName)}>{primaryAlternative.partNumber}</span>
                  <Copy className={cn("h-3.5 w-3.5 flex-none opacity-60 group-hover:opacity-100", iconClassName)} />
                </button>
              ) : (
                <span className="text-xs font-semibold leading-5 text-amber-300">實體料號未提供</span>
              )}
              <span
                className="truncate text-xs leading-4 text-slate-400"
                title={`原理圖符號名稱：${statusRecord.schematicPart || "原理圖符號未提供"}\nPCB 封裝名稱：${statusRecord.pcbFootprint || "封裝未提供"}`}
              >
                <span className="font-mono text-cyan-300/90">{statusRecord.schematicPart || "原理圖符號未提供"}</span>
                <span className="text-slate-600"> · </span>
                <span className="font-mono text-indigo-300/90">{statusRecord.pcbFootprint || "封裝未提供"}</span>
              </span>
            </div>
          </td>
        )}
        {columns.tx && (
          <td data-material-cell="tx" className={MATERIAL_CELL_CLASS} onClick={stopRowToggle}>
            {virtualAlternativeRecord && (
              <InlineVirtualAlternativeEditor
                canEdit={canEdit}
                value={virtualAlternativeRecord.virtualAlternative ?? ""}
                onSave={(value) => actions.saveVirtual(virtualAlternativeRecord, value)}
              />
            )}
          </td>
        )}
        {columns.phaseOut && (
          <td data-material-cell="phaseOut" className={MATERIAL_CELL_CLASS}><PhaseOutStatus record={statusRecord} /></td>
        )}
        {columns.symbol && (
          <td data-material-cell="symbol" className={MATERIAL_CELL_CLASS}><SymbolBuildStatus record={statusRecord} /></td>
        )}
        {columns.status && (
          <td data-material-cell="status" className={MATERIAL_CELL_CLASS}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("inline-flex min-w-0 truncate rounded border px-1.5 text-xs font-black leading-5", statusClassName)} title={statusTitle || undefined}>
                  {statusLabel}
                </span>
                {group.pendingCount > 0 && (
                  <span className="flex-none rounded bg-slate-400/10 px-1.5 text-[11px] font-semibold leading-5 text-slate-300" title="待建明細">
                    待建 {group.pendingCount}
                  </span>
                )}
              </span>
            </div>
          </td>
        )}
        {columns.tracking && (
          <td data-material-cell="tracking" className={MATERIAL_CELL_CLASS} onClick={stopRowToggle}>
            {trackingRecord && <TrackingHistoryCell record={trackingRecord} onOpen={actions.openTracking} />}
          </td>
        )}
        {columns.actions && (
          <td
            data-material-cell="actions"
            className={cn(MATERIAL_STICKY_COLUMN_CLASSES.row, "px-2 py-1.5 text-center")}
            data-testid="material-data-update-cell"
            onClick={stopRowToggle}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => actions.openCreate(group)}
              className="h-7 w-full border-cyan-400/25 bg-cyan-400/10 px-2 text-xs text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-50"
              title={updateTitle}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />更新
            </Button>
            {editingNames && (
              <p className="mt-1 truncate rounded border border-amber-300/28 bg-amber-400/12 px-1 text-[10px] font-bold leading-4 text-amber-100" title={`${editingNames} 正在編輯`}>
                {editingNames.split("、")[0]} 編輯中
              </p>
            )}
          </td>
        )}
      </tr>
      {expanded && (
        <CompactAlternativeRows
          canEdit={canEdit}
          group={group}
          records={matchingRecords}
          primaryRecord={primaryAlternative}
          itemValue={itemValue}
          colorTheme={colorTheme}
          columns={columns}
          primaryTxRecordId={virtualAlternativeRecord?.id ?? ""}
          primaryTrackingRecordId={trackingRecord?.id ?? ""}
          onCopy={actions.copy}
          onView={actions.viewRecord}
          onEdit={actions.editRecord}
          onSaveVirtual={actions.saveVirtual}
          onOpenTracking={actions.openTracking}
        />
      )}
    </tbody>
  );
});

function CompactAlternativeRows({
  canEdit,
  records,
  primaryRecord,
  itemValue,
  colorTheme,
  columns,
  primaryTxRecordId,
  primaryTrackingRecordId,
  onCopy,
  onView,
  onEdit,
  onSaveVirtual,
  onOpenTracking,
}: {
  canEdit: boolean;
  group: MaterialGroup;
  records: MaterialRecord[];
  primaryRecord: MaterialRecord;
  itemValue: number;
  colorTheme: BomTableColorTheme;
  columns: MaterialColumnVisibility;
  /** Records whose TX editor / tracking cell already sit on the main row; they render as plain text here. */
  primaryTxRecordId: string;
  primaryTrackingRecordId: string;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
  onSaveVirtual: (record: MaterialRecord, value: string) => void;
  onOpenTracking: (record: MaterialRecord) => void;
}) {
  const alternatives = records.filter((record) => record.id !== primaryRecord.id);
  const groupRefDes = primaryRecord.refDes || primaryRecord.refGroup || "-";
  const refValues = splitRefDesignators(groupRefDes);

  return (
    <>
      {alternatives.map((record, index) => {
        const preferred = record.isPreferred && !record.isRisk;
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
              "group/material-row border-b border-blue-400/10 text-slate-200 transition-colors",
              "bg-[var(--material-row-bg)] hover:bg-[var(--material-row-hover)]"
            )}
          >
            {columns.item && (
              <td className={cn(MATERIAL_CELL_CLASS, "text-center")}>
                <span className="font-mono text-[13px] font-black text-slate-100">{itemValue}</span>
                <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-300/85">Alt</span>
              </td>
            )}
            {columns.marked && <td className={MATERIAL_CELL_CLASS} />}
            {columns.material && (
              <td className={MATERIAL_CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-2 pl-1">
                  <span
                    className={cn("flex h-6 min-w-6 flex-none items-center justify-center rounded-md px-1 font-mono text-[11px] font-black", preferred ? "text-slate-950" : "text-slate-100")}
                    style={{ backgroundColor: preferred ? withAlpha(colorTheme.alternative, 0.92) : withAlpha(colorTheme.secondary, 0.46) }}
                    title={`替代料 #${index + 1}`}
                  >
                    #{index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <CompactHoverValue
                      label="廠商"
                      values={[record.manufacturer || "未填廠商"]}
                      previewClassName="text-[13px] font-bold leading-5 text-slate-50"
                    />
                  </div>
                  {preferred && (
                    <span
                      className="flex-none rounded-full px-2 text-[11px] font-bold leading-5 text-slate-50"
                      style={{
                        border: `1px solid ${withAlpha(colorTheme.alternative, 0.45)}`,
                        backgroundColor: withAlpha(colorTheme.alternative, 0.28),
                      }}
                    >
                      已建料候選
                    </span>
                  )}
                </div>
              </td>
            )}
            {columns.refDes && (
              <td className={MATERIAL_CELL_CLASS}>
                <CompactHoverValue
                  label="REF DES"
                  values={refValues.length > 0 ? refValues : groupRefDes}
                  maxItems={1}
                  onCopy={groupRefDes !== "-" ? () => onCopy(groupRefDes) : undefined}
                  previewClassName="font-mono text-[13px] font-black leading-5 text-sky-200 group-hover:text-sky-100"
                />
              </td>
            )}
            {columns.mpn && (
              <td className={MATERIAL_CELL_CLASS}>
                {record.manufacturerPartNumber ? (
                  <button type="button" onClick={() => onCopy(record.manufacturerPartNumber)} className="group flex w-full min-w-0 flex-col text-left" title={`複製 MPN：${record.manufacturerPartNumber}`}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-mono text-[13px] font-black leading-5 text-blue-200 group-hover:text-blue-100">{record.manufacturerPartNumber}</span>
                      <Copy className="h-3.5 w-3.5 flex-none text-blue-400 opacity-60 group-hover:opacity-100" />
                    </span>
                    {record.manufacturerPartNumberAlt && <span className="truncate font-mono text-xs leading-4 text-slate-500" title={`舊檔第二 MPN：${record.manufacturerPartNumberAlt}`}>舊檔第二 MPN：{record.manufacturerPartNumberAlt}</span>}
                  </button>
                ) : (
                  <span className="text-xs font-bold text-amber-300">未填 MPN</span>
                )}
              </td>
            )}
            {columns.internal && (
              <td className={MATERIAL_CELL_CLASS}>
                <div className="flex min-w-0 flex-col">
                  {record.partNumber ? (
                    <button type="button" onClick={() => onCopy(record.partNumber)} className="group flex min-w-0 items-center gap-1.5 text-left" title={`複製實體料號：${record.partNumber}`}>
                      <span className="min-w-0 truncate font-mono text-[13px] font-black leading-5 text-cyan-200">{record.partNumber}</span>
                      <Copy className="h-3.5 w-3.5 flex-none text-cyan-300 opacity-60 group-hover:opacity-100" />
                    </button>
                  ) : (
                    <span className="text-xs font-bold leading-5 text-amber-300">實體料號未提供</span>
                  )}
                  <span className="truncate text-xs leading-4 text-slate-500" title={`原理圖符號名稱：${record.schematicPart || "未提供"}\nPCB 封裝名稱：${record.pcbFootprint || "未提供"}`}>
                    <span className="font-mono text-cyan-300/80">{record.schematicPart || "原理圖符號未提供"}</span>
                    <span className="text-slate-600"> · </span>
                    <span className="font-mono text-indigo-300/80">{record.pcbFootprint || "封裝未提供"}</span>
                  </span>
                </div>
              </td>
            )}
            {columns.tx && (
              <td className={MATERIAL_CELL_CLASS}>
                {record.id === primaryTxRecordId ? (
                  <span className="block truncate font-mono text-[13px] font-bold text-teal-200/70" title="這筆的虛擬料號已顯示在主料列，請在主料列修改">{record.virtualAlternative || "—"}</span>
                ) : (
                  <InlineVirtualAlternativeEditor canEdit={canEdit} value={record.virtualAlternative ?? ""} onSave={(value) => onSaveVirtual(record, value)} />
                )}
              </td>
            )}
            {columns.phaseOut && (
              <td className={MATERIAL_CELL_CLASS}><PhaseOutStatus record={record} /></td>
            )}
            {columns.symbol && (
              <td className={MATERIAL_CELL_CLASS}><SymbolBuildStatus record={record} /></td>
            )}
            {columns.status && (
              <td className={MATERIAL_CELL_CLASS}>
                <StatusPill record={record} />
              </td>
            )}
            {columns.tracking && (
              <td className={MATERIAL_CELL_CLASS} onClick={stopRowToggle}>
                {record.id === primaryTrackingRecordId ? (
                  <span className="block truncate text-xs text-slate-400" title="這筆的狀態追蹤已顯示在主料列">同主料列</span>
                ) : (
                  <TrackingHistoryCell record={record} onOpen={onOpenTracking} />
                )}
              </td>
            )}
            {columns.actions && (
              <td className={cn(MATERIAL_STICKY_COLUMN_CLASSES.row, "px-2 py-1.5")}>
                <div className="flex justify-center gap-1.5">
                  <button type="button" onClick={() => onView(record)} className="rounded-md border border-cyan-400/25 bg-cyan-400/10 p-1.5 text-cyan-300 hover:bg-cyan-400/20" title="詳細資訊">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={!canEdit} onClick={() => onEdit(record)} className="rounded-md border border-blue-400/25 bg-blue-400/10 p-1.5 text-blue-300 hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-50" title="修改">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            )}
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
      <DialogContent className="border-blue-400/20 bg-[#0a1324] p-5 text-slate-100 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-white">表格配色</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            只套用到「{workspaceName}」，開啟同一份 BOM 的人會看到同樣的配色。
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-blue-400/10 rounded-xl border border-blue-400/15 bg-slate-950/40">
          {BOM_TABLE_COLOR_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-3 px-3 py-2">
              <span className="h-7 w-7 flex-none rounded-md border border-white/10" style={{ backgroundColor: theme[field.key] }} />
              <div className="min-w-0 flex-1">
                <Label className="text-sm font-bold text-slate-100">{field.label}</Label>
                <p className="truncate text-xs text-slate-400" title={field.description}>{field.description}</p>
              </div>
              <Input
                type="color"
                value={theme[field.key]}
                onChange={(event) => onThemeChange(field.key, event.target.value)}
                aria-label={`${field.label}顏色`}
                className="h-9 w-12 flex-none cursor-pointer border-blue-400/20 bg-[#0c1b31] p-1"
              />
              <Input
                value={theme[field.key]}
                readOnly
                aria-label={`${field.label}色碼`}
                className="h-9 w-24 flex-none border-blue-400/20 bg-[#0c1b31] font-mono text-sm font-bold text-slate-100"
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onReset} className="border-blue-400/20 bg-blue-400/10 text-slate-200 hover:bg-blue-400/20">
            還原預設
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} className="border-slate-500/25 bg-slate-800/60 text-slate-300 hover:bg-slate-700/80">
              取消
            </Button>
            <Button type="button" size="sm" onClick={onApply} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              套用到目前 BOM
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaterialExportDialog({
  activeFormat,
  onExport,
  onOpenChange,
  open,
  progress,
  snapshot,
}: {
  activeFormat: "excel" | "html" | "zip" | null;
  onExport: (format: "excel" | "html" | "zip") => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  progress: MaterialExportProgress | null;
  snapshot: MaterialReportSnapshot | null;
}) {
  const progressLabel = (() => {
    if (!progress) return "查詢結果已固定，可用同一份資料產生不同格式。";
    if (progress.phase === "images") {
      return `正在處理圖片 ${progress.current ?? 0} / ${progress.total ?? 0}`;
    }
    if (progress.phase === "excel") return "正在產生 Excel";
    if (progress.phase === "html") return "正在產生 HTML";
    if (progress.phase === "complete") return "報表已完成";
    return "正在整理資料";
  })();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!activeFormat) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl border-cyan-300/25 bg-[#0b1829] p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg text-slate-50">匯出主管報表</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            三種格式用同一份固定查詢結果，匯出期間不會重新查詢或改動原始資料。
          </DialogDescription>
        </DialogHeader>

        {snapshot ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-500/20 bg-[#081322] px-3 py-2 text-sm">
              <span><span className="text-slate-400">原始主料 </span><strong className="text-white">{snapshot.originalGroupCount.toLocaleString()}</strong></span>
              <span><span className="text-slate-400">篩選後 </span><strong className="text-cyan-100">{snapshot.filteredGroupCount.toLocaleString()}</strong></span>
              <span><span className="text-slate-400">匯出明細 </span><strong className="text-emerald-100">{snapshot.rows.length.toLocaleString()}</strong></span>
              <span className="ml-auto truncate text-xs text-slate-400" title={`${snapshot.exportedBy} · ${formatTimestamp(snapshot.dataAsOf)}`}>{snapshot.exportedBy} · {formatTimestamp(snapshot.dataAsOf)}</span>
            </div>

            <div className="rounded-lg border border-slate-500/20 bg-[#081322] px-3 py-2 text-sm">
              <p className="truncate" title={snapshot.workspaceName}><span className="text-slate-400">BOM：</span>{snapshot.workspaceName}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">範圍 {snapshot.scopeLabel}：</span>
                {(snapshot.filterSummary.length > 0 ? snapshot.filterSummary : ["全部資料"]).map((filter) => (
                  <span key={filter} className="rounded border border-cyan-300/20 bg-cyan-300/[0.08] px-1.5 text-[11px] leading-5 text-cyan-100">{filter}</span>
                ))}
              </div>
            </div>

            <p className="rounded-lg border border-cyan-300/18 bg-cyan-300/[0.06] px-3 py-1.5 text-xs text-cyan-100" role="status" aria-live="polite">
              {progressLabel}
            </p>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" disabled={Boolean(activeFormat)} onClick={() => onExport("excel")} className="h-10 bg-emerald-500 font-bold text-slate-950 hover:bg-emerald-400 disabled:bg-slate-600">
                <FileSpreadsheet className="mr-2 h-4 w-4" />{activeFormat === "excel" ? "產生中" : "Excel"}
              </Button>
              <Button type="button" disabled={Boolean(activeFormat)} onClick={() => onExport("html")} className="h-10 bg-sky-500 font-bold text-slate-950 hover:bg-sky-400 disabled:bg-slate-600">
                <FileCode2 className="mr-2 h-4 w-4" />{activeFormat === "html" ? "產生中" : "HTML"}
              </Button>
              <Button type="button" disabled={Boolean(activeFormat)} onClick={() => onExport("zip")} className="h-10 bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400 disabled:bg-slate-600">
                <FileArchive className="mr-2 h-4 w-4" />{activeFormat === "zip" ? "封裝中" : "HTML + 圖片 ZIP"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300/20 bg-amber-400/[0.08] p-3 text-sm text-amber-100">尚未建立報表快照。</div>
        )}
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
  const [searchDraft, setSearchDraft] = useState("");
  const [columnFilters, setColumnFilters] = useState<MaterialColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const [tableColorDialogOpen, setTableColorDialogOpen] = useState(false);
  const [tableColorDraft, setTableColorDraft] = useState<BomTableColorTheme>(DEFAULT_BOM_TABLE_COLOR_THEME);
  const [isImporting, setIsImporting] = useState(false);
  const [bomManagerOpen, setBomManagerOpen] = useState(false);
  const [pendingDeleteBomId, setPendingDeleteBomId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [editorRecord, setEditorRecord] = useState<MaterialWorkbookRecord>(createRecordTemplate());
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackingRecord, setTrackingRecord] = useState<MaterialRecord | null>(null);
  const [pageTrackerDialogOpen, setPageTrackerDialogOpen] = useState(false);
  const [pageTrackerWorkspaceId, setPageTrackerWorkspaceId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSnapshotRequested, setExportSnapshotRequested] = useState(false);
  const [exportSnapshot, setExportSnapshot] = useState<MaterialReportSnapshot | null>(null);
  const [exportProgress, setExportProgress] = useState<MaterialExportProgress | null>(null);
  const [activeExportFormat, setActiveExportFormat] = useState<"excel" | "html" | "zip" | null>(null);
  const [pendingRemoteRecordIds, setPendingRemoteRecordIds] = useState<string[]>([]);
  const [hasPendingWorkspaceUpdate, setHasPendingWorkspaceUpdate] = useState(false);
  const [isSearchPending, startSearchTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceSyncRequestRef = useRef(0);
  const workspaceLoadingRequestRef = useRef(0);
  const progressiveWorkspaceLoadsRef = useRef(new Set<string>());
  const bomSyncRetryAttemptRef = useRef(0);
  const bomSyncRetryTimerRef = useRef<number | null>(null);
  const activeBomIdRef = useRef(activeBomId);
  const loadedRecordRangeRef = useRef("");
  const recentLocalRecordIdsRef = useRef(new Map<string, number>());
  const loadedViewStateKeyRef = useRef("");
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();
  const { user } = useUser();
  const { canEditModule } = usePermissions();
  const canEdit = canEditModule("material-requests");
  const {capture: captureBomWrite, isCurrent: isBomWriteCurrent, assertCurrent: assertBomWriteCurrent}
    = useWorkspaceMutationScope(user?.userId ?? null, canEdit);
  const bomAccountRef = useRef({accountId: user?.userId, generation: 0});
  if (bomAccountRef.current.accountId !== user?.userId) {
    bomAccountRef.current = {accountId: user?.userId, generation: bomAccountRef.current.generation + 1};
    workspaceSyncRequestRef.current += 1;
    workspaceLoadingRequestRef.current += 1;
    progressiveWorkspaceLoadsRef.current.clear();
  }
  useEffect(() => {setIsImporting(false);}, [canEdit, user?.userId]);
  const isCompactLayout = useIsCompactLayout();
  const presenceEditingRecordId = editorOpen && editorMode !== "view"
    ? editorRecord.id
    : trackingDialogOpen
      ? trackingRecord?.id ?? null
      : null;
  const { editorsByRecordId, onlineUserCount } = useMaterialBomPresence(
    activeBomId,
    user,
    presenceEditingRecordId,
  );
  const isCollaborativeReady = collaborationStatus === "remote";
  const canManageBomPageTracker = canEdit && !["checking", "reconnecting", "error"].includes(collaborationStatus);
  const collaborationStatusMeta = useMemo(
    () => getCollaborationStatusMeta(collaborationStatus),
    [collaborationStatus],
  );
  const startWorkspaceLoad = useCallback(() => {
    const requestId = workspaceLoadingRequestRef.current + 1;
    workspaceLoadingRequestRef.current = requestId;
    setIsWorkspaceLoading(true);
    return requestId;
  }, []);
  const finishWorkspaceLoad = useCallback((requestId: number) => {
    if (isLatestBomWorkspaceLoad(requestId, workspaceLoadingRequestRef.current)) {
      setIsWorkspaceLoading(false);
    }
  }, []);

  const activeWorkspace = bomWorkspaces.find((workspace) => workspace.id === activeBomId) ?? bomWorkspaces[0];
  const isFullDatasetLoaded = activeWorkspace.isLoaded !== false
    && activeWorkspace.payload.records.length >= activeWorkspace.payload.recordCount;
  const isPreviewDataset = !isFullDatasetLoaded && activeWorkspace.payload.records.length > 0;
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
    if (!isCompactLayout || pageSize <= 25) return;
    setPageSize(25);
    setPage(1);
  }, [isCompactLayout, pageSize]);

  const applyLoadedWorkspaces = useCallback((storedWorkspaces: BomWorkspace[], preferredBomId?: string) => {
    if (user?.userId !== bomAccountRef.current.accountId) return;
    if (storedWorkspaces.length === 0) {
      const loadingWorkspace = createDefaultBomWorkspace();
      setBomWorkspaces([loadingWorkspace]);
      setActiveBomId(loadingWorkspace.id);
      const generation = bomAccountRef.current.generation;
      let writeScope;
      try {writeScope = captureBomWrite();} catch { /* View-only accounts may read the local default. */ }
      void loadDefaultBomWorkspace().then((fallbackWorkspace) => {
        if (generation !== bomAccountRef.current.generation) return;
        setBomWorkspaces((current) => current.length === 1 && current[0].id === loadingWorkspace.id
          ? [fallbackWorkspace]
          : current);
        const approvedScope = writeScope;
        if (approvedScope && isBomWriteCurrent(approvedScope)) return saveBomWorkspace(fallbackWorkspace, () => assertBomWriteCurrent(approvedScope));
      }).catch(() => undefined);
      return;
    }

    setBomWorkspaces((currentWorkspaces) => storedWorkspaces.map((workspace) => {
      const currentWorkspace = currentWorkspaces.find((candidate) => candidate.id === workspace.id);
      if (
        currentWorkspace
        && canReuseBomPayloadReference(currentWorkspace.payload, workspace.payload)
      ) {
        return { ...workspace, payload: currentWorkspace.payload };
      }
      return workspace;
    }));
    setActiveBomId((current) => {
      const candidateBomId = preferredBomId ?? current ?? loadActiveBomId();
      return storedWorkspaces.some((workspace) => workspace.id === candidateBomId)
        ? candidateBomId
        : storedWorkspaces[0].id;
    });
  }, [assertBomWriteCurrent, captureBomWrite, isBomWriteCurrent, user?.userId]);

  const reloadBomWorkspaces = useCallback(async (
    preferredBomId?: string,
    options: {
      forceRefresh?: boolean;
      recordPage?: number;
      recordPageSize?: number;
      loadAllRecords?: boolean;
      cachedResult?: BomWorkspaceLoadResult | null;
      onPreviewReady?: () => void;
      progressive?: boolean;
      requestId?: number;
    } = {},
  ) => {
    if (user?.userId !== bomAccountRef.current.accountId) return [];
    const {
      onPreviewReady,
      progressive = false,
      requestId: requestedRequestId,
      ...loadOptions
    } = options;
    const requestId = requestedRequestId ?? (workspaceSyncRequestRef.current + 1);
    const workspaceId = preferredBomId ?? activeBomIdRef.current;
    workspaceSyncRequestRef.current = requestId;
    if (progressive) progressiveWorkspaceLoadsRef.current.add(workspaceId);
    let previewApplied = false;

    try {
      const result = await loadBomWorkspacesDetailed(preferredBomId, {
        ...loadOptions,
        loadAllRecords: loadOptions.loadAllRecords ?? true,
        onPreview: progressive
          ? (previewResult) => {
              if (!isLatestBomWorkspaceLoad(requestId, workspaceSyncRequestRef.current)) return;
              previewApplied = true;
              bomSyncRetryAttemptRef.current = 0;
              setCollaborationStatus(previewResult.mode);
              loadedRecordRangeRef.current = getBomWorkspaceRecordRangeKey(
                previewResult.workspaces,
                workspaceId,
              );
              applyLoadedWorkspaces(previewResult.workspaces, workspaceId);
              onPreviewReady?.();
            }
          : undefined,
      });
      if (!isLatestBomWorkspaceLoad(requestId, workspaceSyncRequestRef.current)) {
        return result.workspaces;
      }

      bomSyncRetryAttemptRef.current = 0;
      setCollaborationStatus(result.mode);
      loadedRecordRangeRef.current = getBomWorkspaceRecordRangeKey(result.workspaces, workspaceId);
      const applyResult = () => applyLoadedWorkspaces(result.workspaces, preferredBomId);
      if (previewApplied) startTransition(applyResult);
      else applyResult();
      return result.workspaces;
    } catch (error) {
      if (isLatestBomWorkspaceLoad(requestId, workspaceSyncRequestRef.current)) {
        setCollaborationStatus("error");
      }
      throw error;
    } finally {
      if (progressive) progressiveWorkspaceLoadsRef.current.delete(workspaceId);
    }
  }, [applyLoadedWorkspaces, user?.userId]);

  const retryBomSync = useCallback(async (showFeedback = false) => {
    setCollaborationStatus("reconnecting");
    try {
      await reloadBomWorkspaces(activeBomIdRef.current, {
        forceRefresh: true,
        loadAllRecords: true,
        progressive: true,
      });
      if (showFeedback) {
        toast({
          title: "雲端同步已恢復",
          description: "已重新連接共用 BOM，畫面與資料皆已更新。",
        });
      }
    } catch {
      if (showFeedback) {
        toast({
          variant: "destructive",
          title: "重新連線失敗",
          description: "系統會繼續在背景重試，目前畫面不會重新整理。",
        });
      }
    }
  }, [reloadBomWorkspaces, toast]);

  useEffect(() => {
    let active = true;
    const syncWorkspaces = async (preferredBomId?: string) => {
      const requestId = ++workspaceSyncRequestRef.current;
      const preferredWorkspaceId = preferredBomId ?? loadActiveBomId();
      const cachedResult = await loadCachedBomWorkspacesDetailed();
      let cachedRangeKey = "";
      if (
        shouldApplyBomWorkspaceCache({
          active,
          currentRequest: requestId === workspaceSyncRequestRef.current,
          preferredWorkspaceId,
          remoteSettled: false,
          result: cachedResult,
        })
      ) {
        applyLoadedWorkspaces(cachedResult!.workspaces, preferredWorkspaceId);
        cachedRangeKey = getBomWorkspaceRecordRangeKey(cachedResult!.workspaces, preferredWorkspaceId);
        loadedRecordRangeRef.current = cachedRangeKey;
      }

      if (!active || !isLatestBomWorkspaceLoad(requestId, workspaceSyncRequestRef.current)) return;

      try {
        const remoteLoad = reloadBomWorkspaces(preferredWorkspaceId, {
          cachedResult,
          loadAllRecords: true,
          onPreviewReady: () => {
            if (active) setIsInitialLoading(false);
          },
          progressive: cachedRangeKey !== `${preferredWorkspaceId}:full`,
          requestId,
        });
        setIsInitialLoading(false);
        await remoteLoad;
      } catch {
        if (!active || !isLatestBomWorkspaceLoad(requestId, workspaceSyncRequestRef.current)) return;
        // Keep the current local state when collaborative sync is temporarily unavailable.
      } finally {
        if (active) setIsInitialLoading(false);
      }
    };

    void syncWorkspaces(loadActiveBomId());
    const unsubscribe = subscribeBomWorkspaceChanges((change) => {
      if (!change.workspaceIds.includes(activeBomIdRef.current)) return;

      const now = Date.now();
      const externalRecordIds = change.recordIds.filter((recordId) => {
        const localTimestamp = recentLocalRecordIdsRef.current.get(recordId) ?? 0;
        return now - localTimestamp > 5000;
      });
      if (externalRecordIds.length > 0) {
        setPendingRemoteRecordIds((current) => Array.from(new Set([...current, ...externalRecordIds])));
      }
      if (change.recordIds.length === 0) {
        setHasPendingWorkspaceUpdate(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyLoadedWorkspaces, reloadBomWorkspaces]);

  useEffect(() => {
    if (collaborationStatus !== "error") {
      if (bomSyncRetryTimerRef.current !== null) {
        window.clearTimeout(bomSyncRetryTimerRef.current);
        bomSyncRetryTimerRef.current = null;
      }
      return;
    }

    const retryDelaysMs = [2000, 5000, 15000, 30000] as const;
    const retryAttempt = bomSyncRetryAttemptRef.current;
    const retryDelayMs = retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length - 1)];
    bomSyncRetryAttemptRef.current = retryAttempt + 1;
    bomSyncRetryTimerRef.current = window.setTimeout(() => {
      bomSyncRetryTimerRef.current = null;
      void retryBomSync(false);
    }, retryDelayMs);

    return () => {
      if (bomSyncRetryTimerRef.current !== null) {
        window.clearTimeout(bomSyncRetryTimerRef.current);
        bomSyncRetryTimerRef.current = null;
      }
    };
  }, [collaborationStatus, retryBomSync]);

  useEffect(() => {
    activeBomIdRef.current = activeBomId;
  }, [activeBomId]);

  useEffect(() => {
    const selectedWorkspace = bomWorkspaces.find((workspace) => workspace.id === activeBomId);
    if (!selectedWorkspace || selectedWorkspace.isLoaded !== false) return;
    if (progressiveWorkspaceLoadsRef.current.has(activeBomId)) return;

    let active = true;
    const requestId = startWorkspaceLoad();
    void reloadBomWorkspaces(activeBomId, {
      requestId,
      loadAllRecords: true,
      progressive: true,
      onPreviewReady: () => {
        if (active) finishWorkspaceLoad(requestId);
      },
    })
      .catch(() => undefined)
      .finally(() => {
        if (active) finishWorkspaceLoad(requestId);
      });

    return () => {
      active = false;
    };
  }, [activeBomId, bomWorkspaces, finishWorkspaceLoad, reloadBomWorkspaces, startWorkspaceLoad]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_BOM_KEY, activeBomId);
  }, [activeBomId]);

  useEffect(() => {
    const key = `${VIEW_STATE_KEY_PREFIX}${user?.userId || "guest"}:${activeBomId}`;
    loadedViewStateKeyRef.current = "";
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<{
          availability: AvailabilityFilter;
          columnFilters: MaterialColumnFilters;
          page: number;
          pageSize: number;
          query: string;
          sortMode: SortMode;
        }>;
        const restoredQuery = typeof parsed.query === "string" ? parsed.query : "";
        setQuery(restoredQuery);
        setSearchDraft(restoredQuery);
        if (parsed.columnFilters && typeof parsed.columnFilters === "object") {
          const restoredFilters = { ...EMPTY_COLUMN_FILTERS };
          for (const key of FILTER_KEYS) {
            const values = parsed.columnFilters[key];
            const validValues = Array.isArray(values)
              ? values.filter((value) => typeof value === "string")
              : [];
            restoredFilters[key] = validValues.length ? validValues : null;
          }
          setColumnFilters(restoredFilters);
        }
        if (parsed.availability && parsed.availability in AVAILABILITY_FILTER_LABELS) {
          setAvailability(parsed.availability);
        }
        if (parsed.sortMode && parsed.sortMode in SORT_MODE_LABELS) setSortMode(parsed.sortMode);
        if (PAGE_SIZE_OPTIONS.includes(Number(parsed.pageSize))) setPageSize(Number(parsed.pageSize));
        if (Number.isFinite(parsed.page) && Number(parsed.page) > 0) setPage(Math.trunc(Number(parsed.page)));
      }
    } catch {
      // Invalid per-user view state must never block the shared production data.
    } finally {
      loadedViewStateKeyRef.current = key;
    }
  }, [activeBomId, user?.userId]);

  useEffect(() => {
    const key = `${VIEW_STATE_KEY_PREFIX}${user?.userId || "guest"}:${activeBomId}`;
    if (loadedViewStateKeyRef.current !== key) return undefined;

    const timerId = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify({
          availability,
          columnFilters,
          page,
          pageSize,
          query,
          sortMode,
        }));
      } catch {
        // View preferences are optional; shared BOM data is unaffected.
      }
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [activeBomId, availability, columnFilters, page, pageSize, query, sortMode, user?.userId]);

  useEffect(() => {
    setMarkedGroupKeys(loadMarkedGroups(activeBomId));
  }, [activeBomId]);

  useEffect(() => {
    if (!isFullDatasetLoaded) return;
    setMarkedGroupKeys((current) => {
      const normalized = current.filter((key) => validGroupKeys.has(key));
      return normalized.length === current.length ? current : normalized;
    });
  }, [isFullDatasetLoaded, validGroupKeys]);

  useEffect(() => {
    saveMarkedGroups(activeBomId, markedGroupKeys);
  }, [activeBomId, markedGroupKeys]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(COLUMN_WIDTHS_SESSION_KEY, JSON.stringify(columnWidths));
    } catch {
      // Column resizing still works in memory when session storage is unavailable.
    }
  }, [columnWidths]);

  const [hiddenColumns, setHiddenColumns] = useState<MaterialTableColumnKey[]>(loadHiddenColumns);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(hiddenColumns));
    } catch {
      // Column visibility still works in memory when storage is unavailable.
    }
  }, [hiddenColumns]);

  const columnVisibility = useMemo(
    () => Object.fromEntries(
      MATERIAL_TABLE_COLUMNS.map((column) => [column.key, !hiddenColumns.includes(column.key)]),
    ) as MaterialColumnVisibility,
    [hiddenColumns],
  );
  const visibleColumnCount = MATERIAL_TABLE_COLUMNS.length - hiddenColumns.length;
  const toggleHiddenColumn = (key: MaterialTableColumnKey) => {
    setHiddenColumns((current) => normalizeHiddenMaterialColumns(
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    ));
  };
  const tableWidth = getMaterialTableWidth(columnWidths, hiddenColumns);

  const resizeColumn = (index: number, width: number) => {
    // Borrow width from the next *visible* column so a hidden neighbour never shrinks silently.
    const adjacentIndex = MATERIAL_TABLE_COLUMNS.findIndex(
      (column, candidate) => candidate > index && !hiddenColumns.includes(column.key),
    );
    setColumnWidths((current) => resizeMaterialColumnWidths({
      adjacentIndex,
      index,
      maxWidths: MAX_COLUMN_WIDTHS,
      minWidths: MIN_COLUMN_WIDTHS,
      requestedWidth: width,
      widths: current,
    }));
  };


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
  const hasActiveColumnFilters = Object.values(columnFilters).some((values) => Boolean(values?.length));

  const groupRuntimeIndex = useMemo(() => {
    const searchableTextByGroup = new Map<string, string>();
    const refTokensByGroup = new Map<string, string[]>();
    const refPrefixes = new Set<string>();
    const sortedRecordsByGroup = new Map<string, MaterialRecord[]>();
    const uniqueMpnCountByGroup = new Map<string, number>();
    const recordColumnsByRecordId = new Map<string, CachedRecordColumnValues>();

    dataset.groups.forEach((group) => {
      const sortedRecords = getSortedAlternatives(group);
      const uniqueMpnCount = getUniqueMpnCountForRecords(group.records);
      sortedRecordsByGroup.set(group.key, sortedRecords);
      uniqueMpnCountByGroup.set(group.key, uniqueMpnCount);

      if (searchTokens.length > 0) {
        const mustApply = requiresApplication(group);
        const noAlternative = uniqueMpnCount <= 1;
        const alternativeSearchText = noAlternative
          ? "單一料 無替代料 單一來源 single source no alternative"
          : "有替代料 multiple source alternative";
        const applicationSearchText = mustApply
          ? "未提供虛擬／實體料號 料號待補 完全無料 主料與替代都無料"
          : "已提供料號 已提供實體料號或虛擬料號";

        searchableTextByGroup.set(group.key, `${group.searchText} ${alternativeSearchText} ${applicationSearchText}`);
        const refTokens = Array.from(new Set(
          [
            group.displayRef,
            ...group.records.flatMap((record) => [record.refDes, record.refGroup]),
          ]
            .flatMap((value) => splitRefDesignators(value))
            .map(normalizeMaterialSearchText)
            .filter(Boolean),
        ));
        refTokensByGroup.set(group.key, refTokens);
        refTokens.forEach((refToken) => {
          for (let prefixLength = 1; prefixLength <= refToken.length; prefixLength += 1) {
            refPrefixes.add(refToken.slice(0, prefixLength));
          }
        });
      }

      if (!hasActiveColumnFilters) return;

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
        });
      });
    });

    return {
      recordColumnsByRecordId,
      refPrefixes,
      refTokensByGroup,
      searchableTextByGroup,
      sortedRecordsByGroup,
      uniqueMpnCountByGroup,
    };
  }, [dataset.groups, hasActiveColumnFilters, searchTokens.length]);

  const columnFilterSets = useMemo(
    () => FILTER_KEYS.reduce((result, key) => {
      const normalized = normalizeColumnFilterSelection(columnFilters[key]);
      result[key] = normalized === null ? null : new Set(normalized);
      return result;
    }, {} as Record<ColumnFilterKey, Set<string> | null>),
    [columnFilters],
  );

  const matchesSearch = useCallback((group: MaterialGroup) => {
    if (searchTokens.length === 0) return true;
    const searchableText = groupRuntimeIndex.searchableTextByGroup.get(group.key) ?? group.searchText;
    const refTokens = groupRuntimeIndex.refTokensByGroup.get(group.key) ?? [];

    return searchTokens.every((token) => {
      const shouldMatchRefPrefix = (
        token.length === 1
        || /\d/.test(token)
      ) && groupRuntimeIndex.refPrefixes.has(token);

      return shouldMatchRefPrefix
        ? refTokens.some((refToken) => refToken.startsWith(token))
        : searchableText.includes(token);
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

  // Only the "marked only" view depends on the marked set; toggling a star
  // otherwise must not re-filter and re-sort every group on the page.
  const markedFilterSet = showMarkedOnly ? markedGroupKeySet : null;
  const matchesMarkedState = useCallback((group: MaterialGroup) => {
    return !markedFilterSet || markedFilterSet.has(group.key);
  }, [markedFilterSet]);

  const getMatchingRecords = useCallback((group: MaterialGroup, ignoredKey?: ColumnFilterKey) => {
    const sortedRecords = groupRuntimeIndex.sortedRecordsByGroup.get(group.key) ?? getSortedAlternatives(group);
    if (!hasActiveColumnFilters) return sortedRecords;

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
  }, [columnFilterSets, groupRuntimeIndex, hasActiveColumnFilters]);

  const searchAvailabilityGroups = useMemo(
    () => dataset.groups.filter((group) => matchesMarkedState(group) && matchesSearch(group) && matchesAvailability(group)),
    [dataset.groups, matchesAvailability, matchesMarkedState, matchesSearch],
  );

  const getColumnFilterOptions = useCallback((key: ColumnFilterKey) => {
    const valueGroups = searchAvailabilityGroups
      .flatMap((group) => getMatchingRecords(group, key).map((record) => getRecordColumnValues(record, group, key)));

    return key === "trackingStatus"
      ? buildTrackingStatusFilterOptions(valueGroups)
      : buildExcelFilterOptions(valueGroups);
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
      return REF_COLLATOR.compare(left.displayRef, right.displayRef);
    });
  }, [getMatchingRecords, groupRuntimeIndex.uniqueMpnCountByGroup, searchAvailabilityGroups, sortMode]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];

    if (query) chips.push({ key: "query", label: `關鍵字：${query}` });
    if (availability !== "all") {
      chips.push({ key: "availability", label: `狀態：${AVAILABILITY_FILTER_LABELS[availability]}` });
    }
    if (showMarkedOnly) chips.push({ key: "marked", label: "僅顯示我的標記" });

    FILTER_KEYS.forEach((key) => {
      const values = columnFilters[key];
      if (!values?.length) return;
      const preview = values.slice(0, 2).join("、");
      const remainder = values.length > 2 ? ` 等 ${values.length} 項` : "";
      chips.push({ key: `column:${key}`, label: `${COLUMN_FILTER_LABELS[key]}：${preview}${remainder}` });
    });

    return chips;
  }, [availability, columnFilters, query, showMarkedOnly]);

  const totalPages = isFullDatasetLoaded
    ? Math.max(1, Math.ceil(filteredGroups.length / pageSize))
    : 1;
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
    const start = isFullDatasetLoaded ? (page - 1) * pageSize : 0;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, isFullDatasetLoaded, page, pageSize]);

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

  const showDatasetSyncingToast = () => {
    toast({
      title: "完整資料仍在背景同步",
      description: "目前已可先查看料號；完整資料到齊後會自動開放新增、修改與上傳。",
    });
  };

  const handleWorkbookImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    if (!canEdit) {event.target.value = ""; return;}
    if (!isCollaborativeReady) {
      event.target.value = "";
      showCollaborativeUnavailableToast();
      return;
    }
    if (!isFullDatasetLoaded) {
      event.target.value = "";
      showDatasetSyncingToast();
      return;
    }

    setIsImporting(true);
    let writeScope;
    try {
      writeScope = captureBomWrite();
      let lastWorkspaceId = activeBomId;
      let totalRecords = 0;
      const workspaceMap = new Map(bomWorkspaces.map((workspace) => [workspace.id, workspace]));

      for (const file of files) {
        const payload = await parseMaterialWorkbookFile(file);
        assertBomWriteCurrent(writeScope);
        const workspaceId = createBomId(file.name);
        const existingWorkspace = workspaceMap.get(workspaceId);
        const workspace = mergeImportedWorkspace(existingWorkspace, workspaceId, payload);
        await saveBomWorkspace(workspace, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
        void logMaterialWorkspaceAction({
          action: "import",
          actor: user,
          metadata: {
            fileName: file.name,
            recordCount: workspace.payload.recordCount,
            replacedExistingWorkspace: Boolean(existingWorkspace),
            sheetName: workspace.payload.sheetName,
          },
          workspaceId: workspace.id,
        });
        replaceBomWorkspace(workspace);
        workspaceMap.set(workspaceId, workspace);
        lastWorkspaceId = workspace.id;
        totalRecords += workspace.payload.recordCount;
      }

      await reloadBomWorkspaces(lastWorkspaceId);
      if (!isBomWriteCurrent(writeScope)) return;
      setActiveBomId(lastWorkspaceId);
      setExpandedKey(null);
      setPage(1);
      toast({
        title: files.length === 1 ? "BOM 已載入" : `${files.length} 個 BOM 已載入`,
        description: `共 ${totalRecords.toLocaleString()} 筆廠商料明細，可從 BOM 切換器管理。`,
      });
    } catch (error) {
      if (writeScope && !isBomWriteCurrent(writeScope)) return;
      toast({
        title: "Excel 讀取失敗",
        description: error instanceof Error ? error.message : "請確認欄位格式。",
        variant: "destructive",
      });
    } finally {
      if (!writeScope || isBomWriteCurrent(writeScope)) setIsImporting(false);
      event.target.value = "";
    }
  };

  const openCreate = (group?: MaterialGroup) => {
    if (!canEdit) return;
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    if (!isFullDatasetLoaded) {
      showDatasetSyncingToast();
      return;
    }
    setEditorRecord(createRecordTemplate(group));
    setEditorMode("create");
    setEditorOpen(true);
  };

  const openRecord = (record: MaterialRecord, mode: EditorMode) => {
    if (mode !== "view" && !canEdit) return;
    if (mode !== "view" && !isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    if (mode !== "view" && !isFullDatasetLoaded) {
      showDatasetSyncingToast();
      return;
    }
    setEditorRecord(toWorkbookRecord(record));
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const openTrackingDialog = (record: MaterialRecord) => {
    if (!canEdit) return;
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
    let writeScope;
    try {writeScope = captureBomWrite();} catch (error) {return Promise.reject(error);}
    if (!isCollaborativeReady) {
      return Promise.reject(new Error("Collaborative BOM storage unavailable"));
    }
    if (!isFullDatasetLoaded) {
      showDatasetSyncingToast();
      return Promise.reject(new Error("Full BOM dataset is still loading"));
    }

    const exists = basePayload.records.some((item) => item.id === record.id);
    const previousRecord = basePayload.records.find((item) => item.id === record.id);
    const previousUpdatedAt = activeWorkspace.recordMeta?.[record.id]?.updatedAt;
    const previousImageCount = (previousRecord?.trackingHistory ?? [])
      .reduce((count, entry) => count + (entry.images?.length ?? 0), 0);
    const records = exists
      ? basePayload.records.map((item) => item.id === record.id ? record : item)
      : [...basePayload.records, record];
    const nextWorkspace: BomWorkspace = {
      ...activeWorkspace,
      payload: { ...basePayload, records, recordCount: records.length },
      updatedAt: new Date().toISOString(),
    };
    recentLocalRecordIdsRef.current.set(record.id, Date.now());
    replaceBomWorkspace(nextWorkspace);

    return saveBomWorkspaceRecord(nextWorkspace, record, () => assertBomWriteCurrent(writeScope))
      .then((recordMeta) => {
        assertBomWriteCurrent(writeScope);
        setBomWorkspaces((current) => current.map((workspace) => workspace.id === nextWorkspace.id
          ? {
              ...workspace,
              recordMeta: {
                ...workspace.recordMeta,
                [record.id]: recordMeta,
              },
            }
          : workspace));
        void logMaterialRecordChange({
          action: exists ? "update" : "create",
          actor: user,
          imageCount: (record.trackingHistory ?? []).reduce((count, entry) => count + (entry.images?.length ?? 0), 0),
          previousImageCount,
          newUpdatedAt: recordMeta.updatedAt,
          previousUpdatedAt,
          recordId: record.id,
          workspaceId: nextWorkspace.id,
        });
        return recordMeta;
      })
      .catch(async (error) => {
        if (!isBomWriteCurrent(writeScope)) throw error;
        await reloadBomWorkspaces(activeBomId).catch(() => undefined);
        throw error;
      });
  };

  const handleSaveRecord = async (record: MaterialWorkbookRecord) => {
    if (!isValidBomUsage(record.qty)) {
      toast({ title: "Qty 是單一產品用量，不能為負數", variant: "destructive" });
      return;
    }
    try {
      const writeScope = captureBomWrite();
      await saveRecordToActiveBom({
        ...record,
        requestUrl: normalizeRequestUrl(record.requestUrl ?? ""),
      });
      if (!isBomWriteCurrent(writeScope)) return;
      setEditorOpen(false);
      toast({
        title: editorMode === "create" ? "料件已新增" : "料件已更新",
        description: `${record.manufacturer || "未指定廠商"} ${record.manufacturerPartNumber || record.name}`,
      });
    } catch (error) {
      if (error instanceof WorkspaceMutationScopeChangedError) return;
      toast({
        title: error instanceof BomRecordConflictError ? "偵測到版本衝突" : "同步更新失敗",
        description: error instanceof BomRecordConflictError
          ? "此筆資料已由其他使用者更新，系統沒有覆蓋對方內容；你的表單仍保留，請比對最新資料後再送出。"
          : "這筆料件還沒寫進共用資料，請稍後再試一次。",
        variant: "destructive",
      });
    }
  };

  const saveVirtualAlternative = (record: MaterialRecord, value: string) => {
    if (!canEdit) return;
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    if (!isFullDatasetLoaded) {
      showDatasetSyncingToast();
      return;
    }
    void saveRecordToActiveBom({ ...toWorkbookRecord(record), virtualAlternative: value }).catch(() => {
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: "資料更新失敗",
        description: "虛擬料號尚未同步到共用資料，已重新載入最新版本。",
        variant: "destructive",
      });
    });
  };

  const saveTrackingHistory = (record: MaterialRecord, entry: MaterialTrackingHistoryEntry) => {
    if (!canEdit) return;
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    if (!isFullDatasetLoaded) {
      showDatasetSyncingToast();
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
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: "狀態追蹤已更新",
        description: `${record.name || record.displayRef} · ${entry.status}`,
      });
    }).catch(() => {
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: "狀態追蹤更新失敗",
        description: "這筆追蹤還沒同步到共用資料，已重新載入最新版本。",
        variant: "destructive",
      });
    });
  };

  const saveBomPageTracker = async (workspaceId: string, pageTracker: BomPageTracker) => {
    const writeScope = captureBomWrite();
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
      await saveBomWorkspacePageTracker(workspaceId, pageTracker, () => assertBomWriteCurrent(writeScope));
      if (!isBomWriteCurrent(writeScope)) return;
      void logMaterialWorkspaceAction({
        action: "page_tracker.update",
        actor: user,
        metadata: {
          completedPages: pageTrackerSummary.completedPages,
          currentPage: pageTrackerSummary.currentPage,
          totalPages: pageTrackerSummary.totalPages,
        },
        workspaceId,
      });
      toast({
        title: "頁數追蹤已更新",
        description: `${workspace.name} · ${pageTrackerSummary.currentPage > 0 ? `目前第 ${pageTrackerSummary.currentPage} / ${pageTrackerSummary.totalPages} 頁 · ` : ""}已完成 ${pageTrackerSummary.completedPages} 頁`,
      });
    } catch (error) {
      if (!isBomWriteCurrent(writeScope)) throw error;
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({
        title: "頁數追蹤更新失敗",
        description: "共用頁數狀態尚未同步成功，已重新載入最新版本。",
        variant: "destructive",
      });
      throw error;
    }
  };

  const switchActiveBom = (value: string) => {
    setActiveBomId(value);
    setPendingRemoteRecordIds([]);
    setHasPendingWorkspaceUpdate(false);
    setQuery("");
    setSearchDraft("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
    setShowMarkedOnly(false);
    setExpandedKey(null);
    setPage(1);
  };

  const applyAvailabilityFilter = (nextAvailability: AvailabilityFilter) => {
    setQuery("");
    setSearchDraft("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability((current) => current === nextAvailability ? "all" : nextAvailability);
    setExpandedKey(null);
    setPage(1);
  };

  const deleteBomWorkspaceById = async (targetBomId: string) => {
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    const targetWorkspace = bomWorkspaces.find((workspace) => workspace.id === targetBomId);
    if (!targetWorkspace) return;

    const remaining = bomWorkspaces.filter((workspace) => workspace.id !== targetBomId);
    const fallbackWorkspace = remaining.length > 0
      ? createDefaultBomWorkspace()
      : await loadDefaultBomWorkspace();
    const nextWorkspaces = remaining.length > 0 ? remaining : [fallbackWorkspace];
    if (!isBomWriteCurrent(writeScope)) return;

    setBomWorkspaces(nextWorkspaces);
    if (activeBomId === targetBomId) {
      switchActiveBom(nextWorkspaces[0].id);
    }

    try {
      await removeBomWorkspace(targetBomId, () => assertBomWriteCurrent(writeScope));
      if (!isBomWriteCurrent(writeScope)) return;
      void logMaterialWorkspaceAction({
        action: "delete",
        actor: user,
        metadata: {
          deletedWorkspaceId: targetBomId,
          name: targetWorkspace.name,
          recordCount: targetWorkspace.payload.recordCount,
        },
      });
      if (remaining.length === 0) {
        await saveBomWorkspace(fallbackWorkspace, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
      }
      await reloadBomWorkspaces(nextWorkspaces[0].id);
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: "BOM 已刪除",
        description: remaining.length === 0 ? "已自動建立新的預設備援 BOM。" : `剩餘 ${remaining.length} 個 BOM。`,
      });
    } catch {
      if (!isBomWriteCurrent(writeScope)) return;
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({
        title: "刪除 BOM 失敗",
        description: "請重新整理後再試一次。",
        variant: "destructive",
      });
    }
  };

  const confirmDeleteBom = async () => {
    if (!pendingDeleteBomId) return;
    const targetBomId = pendingDeleteBomId;
    setPendingDeleteBomId(null);
    await deleteBomWorkspaceById(targetBomId);
  };

  const createExportSnapshot = () => {
    const rows = filteredGroups.flatMap((group, groupIndex) =>
      getMatchingRecords(group).map((record) => {
        const latestTrackingEntry = getLatestTrackingEntry(record);
        const requestMeta = getTrackingRequestMeta(record);
        const images = Array.from(
          new Map(
            (record.trackingHistory ?? [])
              .flatMap((entry) => entry.images ?? [])
              .map((image) => [image.id, image]),
          ).values(),
        );

        return {
          actionStatus: getActionLabel(record.actionKind),
          assembly: group.assemblyName,
          footprint: record.pcbFootprint,
          images: images.map((image) => ({
            dataUrl: image.dataUrl,
            id: image.id,
            mimeType: image.mimeType,
            name: image.name,
          })),
          internalPartNumber: record.partNumber,
          item: String(getGroupItemValue(group, groupIndex + 1)),
          manufacturer: record.manufacturer,
          manufacturerPartNumber: record.manufacturerPartNumber,
          manufacturerPartNumberAlt: record.manufacturerPartNumberAlt,
          marked: markedGroupKeySet.has(group.key),
          materialName: record.name,
          partName: record.partName,
          qty: String(group.qty),
          refDes: record.refDes || group.primaryRecord.refDes,
          refGroup: group.displayRef,
          requestInfo: latestTrackingEntry?.requestInfo ?? "",
          requestTicket: requestMeta.ticket,
          requestUrl: requestMeta.url,
          sourcingStatus: record.sourcingStatus,
          partUsageStatus: record.partUsageStatus ?? "",
          phaseOutStatus: record.phaseOutStatus ?? "",
          specification: record.partSpec,
          symbol: record.schematicPart,
          symbolStatus: record.symbolStatus ?? "",
          buildRequirement: getMaterialBuildRequirementLabel(record),
          trackingOwner: latestTrackingEntry?.createdBy ?? "",
          trackingStatus: getTrackingWorkflowStatus(record),
          trackingSummary: latestTrackingEntry?.note ?? record.trackingNote ?? record.trackingStatus ?? "",
          tx: record.virtualAlternative ?? "",
        };
      }),
    );

    if (!rows.length) {
      toast({ title: "沒有可匯出的資料", description: "請調整搜尋或篩選條件後再試。", variant: "destructive" });
      return null;
    }

    const statusCounts = rows.reduce<Record<string, number>>((counts, row) => {
      const status = row.trackingStatus || "未設定";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    const timestamp = new Date().toISOString();
    const activeFilterLabels = activeFilterChips.map((chip) => chip.label);
    const snapshot: MaterialReportSnapshot = {
      dataAsOf: timestamp,
      exportedAt: timestamp,
      exportedBy: user?.displayName || user?.username || "未知使用者",
      filteredGroupCount: filteredGroups.length,
      filterSummary: [
        ...(activeFilterLabels.length > 0 ? activeFilterLabels : ["全部資料"]),
        `排序：${SORT_MODE_LABELS[sortMode]}`,
      ],
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `material-export-${Date.now()}`,
      originalGroupCount: dataset.stats.totalGroups,
      reportName: `${activeWorkspace.name}_料號申請篩選報表`,
      rows,
      sheetName: dataset.meta.sheetName,
      scopeLabel: getMaterialExportScopeLabel(activeFilterLabels),
      sourceFile: dataset.meta.sourceFile,
      statusCounts,
      workspaceName: activeWorkspace.name,
    };

    setExportSnapshot(snapshot);
    setExportProgress({ phase: "snapshot" });
    setExportDialogOpen(true);
    return snapshot;
  };

  const prepareExportSnapshot = async () => {
    if (isFullDatasetLoaded) {
      createExportSnapshot();
      return;
    }

    setExportSnapshotRequested(true);
    const requestId = startWorkspaceLoad();
    await reloadBomWorkspaces(activeBomId, {
      forceRefresh: true,
      loadAllRecords: true,
      requestId,
    }).catch(() => undefined).finally(() => {
      finishWorkspaceLoad(requestId);
    });
  };

  const createExportSnapshotRef = useRef(createExportSnapshot);
  createExportSnapshotRef.current = createExportSnapshot;

  useEffect(() => {
    if (!exportSnapshotRequested || !isFullDatasetLoaded || isWorkspaceLoading) return;
    setExportSnapshotRequested(false);
    createExportSnapshotRef.current();
  }, [exportSnapshotRequested, isFullDatasetLoaded, isWorkspaceLoading]);

  const runExport = async (format: "excel" | "html" | "zip") => {
    if (!exportSnapshot || activeExportFormat) return;
    setActiveExportFormat(format);
    setExportProgress({ phase: "snapshot" });

    try {
      const {
        exportMaterialReportExcel,
        exportMaterialReportHtml,
        exportMaterialReportHtmlZip,
      } = await import("./materialRequestExport");
      const fileName = format === "excel"
        ? await exportMaterialReportExcel(exportSnapshot, setExportProgress)
        : format === "html"
          ? await exportMaterialReportHtml(exportSnapshot, setExportProgress)
          : await exportMaterialReportHtmlZip(exportSnapshot, setExportProgress);
      await logMaterialReportExport({
        actor: user,
        fileName,
        format: format === "zip" ? "html_zip" : format,
        snapshot: exportSnapshot,
        workspaceId: activeWorkspace.id,
      });
      toast({
        title: "主管報表已匯出",
        description: `${fileName} · ${exportSnapshot.rows.length.toLocaleString()} 筆明細`,
      });
    } catch (error) {
      toast({
        title: "報表匯出失敗",
        description: error instanceof Error ? error.message : "產生報表時發生未預期錯誤。",
        variant: "destructive",
      });
    } finally {
      setActiveExportFormat(null);
    }
  };

  const applySearch = async () => {
    const normalizedQuery = searchDraft.normalize("NFKC").replace(/\u3000/g, " ").trim();
    if (isSearchPending || isWorkspaceLoading) return;

    startSearchTransition(() => {
      setQuery(normalizedQuery);
      setExpandedKey(null);
      setPage(1);
    });
  };

  const clearFilters = () => {
    setQuery("");
    setSearchDraft("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
    setShowMarkedOnly(false);
    setSortMode("reference");
    setExpandedKey(null);
  };

  const removeFilterChip = (key: string) => {
    if (key === "query") {
      setQuery("");
      setSearchDraft("");
    } else if (key === "availability") {
      setAvailability("all");
    } else if (key === "marked") {
      setShowMarkedOnly(false);
    } else if (key.startsWith("column:")) {
      const columnKey = key.slice("column:".length) as ColumnFilterKey;
      if (FILTER_KEYS.includes(columnKey)) {
        setColumnFilters((current) => ({ ...current, [columnKey]: null }));
      }
    }

    setExpandedKey(null);
    setPage(1);
  };

  const loadLatestBomData = async () => {
    const requestId = startWorkspaceLoad();
    try {
      await reloadBomWorkspaces(activeBomId, {
        forceRefresh: true,
        loadAllRecords: true,
        requestId,
      });
      setPendingRemoteRecordIds([]);
      setHasPendingWorkspaceUpdate(false);
      toast({ title: "已載入最新資料", description: "搜尋、篩選與分頁條件皆已保留。" });
    } catch {
      toast({ title: "載入最新資料失敗", description: "目前仍保留畫面中的資料與輸入內容。", variant: "destructive" });
    } finally {
      finishWorkspaceLoad(requestId);
    }
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
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    const nextTheme = normalizeBomTableColorTheme(tableColorDraft);

    setBomWorkspaces((current) => current.map((workspace) => (
      workspace.id === activeWorkspace.id
        ? { ...workspace, tableColorTheme: nextTheme }
        : workspace
    )));
    setTableColorDialogOpen(false);

    try {
      await saveBomWorkspaceTableColorTheme(activeWorkspace.id, nextTheme, () => assertBomWriteCurrent(writeScope));
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: "表格配色已更新",
        description: `已套用到 BOM「${activeWorkspace.name}」，其他人開啟同一份 BOM 也會看到相同配色。`,
      });
    } catch {
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        variant: "destructive",
        title: "表格配色儲存失敗",
        description: "共享配色尚未寫入資料庫，請稍後再試。",
      });
    }
  };

  // Rows receive one stable actions object; the ref always points at the
  // handlers from the latest render, so memoised rows never call stale closures.
  const rowActionsRef = useRef<MaterialRowActions | null>(null);
  rowActionsRef.current = {
    toggleExpanded,
    toggleMarked: toggleMarkedGroup,
    copy: (value) => { void handleCopy(value); },
    openCreate,
    openTracking: openTrackingDialog,
    saveVirtual: saveVirtualAlternative,
    viewRecord: (record) => openRecord(record, "view"),
    editRecord: (record) => openRecord(record, "edit"),
  };
  const rowActions = useMemo<MaterialRowActions>(() => ({
    toggleExpanded: (key) => rowActionsRef.current?.toggleExpanded(key),
    toggleMarked: (key) => rowActionsRef.current?.toggleMarked(key),
    copy: (value) => rowActionsRef.current?.copy(value),
    openCreate: (group) => rowActionsRef.current?.openCreate(group),
    openTracking: (record) => rowActionsRef.current?.openTracking(record),
    saveVirtual: (record, value) => rowActionsRef.current?.saveVirtual(record, value),
    viewRecord: (record) => rowActionsRef.current?.viewRecord(record),
    editRecord: (record) => rowActionsRef.current?.editRecord(record),
  }), []);

  if (isInitialLoading) {
    return (
      <div className="material-sheet-theme min-h-full bg-[#08111f] p-4 text-slate-100 sm:p-5 lg:p-6" aria-live="polite" aria-busy="true">
        <div className="rounded-2xl border border-cyan-300/20 bg-[#102139] p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl bg-cyan-200/10" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40 bg-cyan-200/10" />
              <Skeleton className="h-3 w-72 max-w-[70vw] bg-cyan-200/10" />
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-[#0d1b2f] p-4">
          <p className="text-sm font-bold text-cyan-100">正在取得最新料號資料</p>
          <p className="mt-1 text-sm text-slate-400">先載入 BOM 摘要，再載入目前使用中的資料，不會一次下載所有 BOM 與圖片。</p>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full bg-slate-500/10" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="material-sheet-theme maintenance-workspace min-h-full w-full min-w-0 overflow-x-clip bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.10),transparent_26rem),radial-gradient(circle_at_88%_2%,rgba(251,191,36,0.08),transparent_24rem),#06111f] p-2 text-slate-100 sm:p-3 lg:p-4">
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
      <BomManagerDialog canEdit={canEdit} activeBomId={activeBomId} bomWorkspaces={orderedBomWorkspaces} open={bomManagerOpen} onDelete={setPendingDeleteBomId} onOpenChange={setBomManagerOpen} onOpenPageTracker={openBomPageTrackerDialog} onSelect={(id) => { switchActiveBom(id); setBomManagerOpen(false); }} />
      <MaterialRecordDialog canEdit={canEdit} open={editorOpen} mode={editorMode} record={editorRecord} onOpenChange={setEditorOpen} onModeChange={setEditorMode} onSave={handleSaveRecord} />
      <TrackingHistoryDialog canEdit={canEdit} open={trackingDialogOpen} record={trackingRecord} onOpenChange={(open) => { setTrackingDialogOpen(open); if (!open) setTrackingRecord(null); }} onSave={saveTrackingHistory} />
      <MaterialExportDialog
        activeFormat={activeExportFormat}
        onExport={(format) => { void runExport(format); }}
        onOpenChange={setExportDialogOpen}
        open={exportDialogOpen}
        progress={exportProgress}
        snapshot={exportSnapshot}
      />
      <AlertDialog open={Boolean(pendingDeleteBomId)} onOpenChange={(open) => !open && setPendingDeleteBomId(null)}>
        <AlertDialogContent className="border-rose-300/35 bg-[radial-gradient(circle_at_100%_0%,rgba(244,63,94,0.18),transparent_18rem),#0b1b2d] text-slate-100 shadow-[0_30px_90px_-28px_rgba(244,63,94,0.55)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg text-rose-50">永久刪除這份 BOM？</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-300">
              「{bomWorkspaces.find((workspace) => workspace.id === pendingDeleteBomId)?.name || "目前 BOM"}」及其料件、頁數與追蹤資料會一併移除，這個動作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-400/25 bg-slate-900/40 text-slate-200 hover:bg-slate-800 hover:text-white">保留 BOM</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 font-bold text-white hover:bg-rose-500" onClick={() => void confirmDeleteBom()}>
              確認永久刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isCompactLayout && <section
        data-testid="material-mobile-command-center"
        className="overflow-hidden rounded-2xl border border-cyan-200/25 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.16),transparent_16rem),radial-gradient(circle_at_100%_100%,rgba(251,191,36,0.09),transparent_14rem),#0d2033] shadow-[0_20px_46px_-32px_rgba(34,211,238,0.75)] lg:hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-cyan-200/10 px-2.5 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white">料號快查</h1>
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black", collaborationStatusMeta.badgeClassName)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", collaborationStatusMeta.dotClassName)} />
                {collaborationStatusMeta.label}
              </span>
            </div>
            <p className="max-w-[48vw] truncate text-[11px] text-slate-400">{activeWorkspace.name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBomManagerOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-400/12 px-2.5 text-[11px] font-black text-violet-100"
            >
              <Layers3 className="h-4 w-4" />{bomWorkspaces.length} BOM
            </button>
            <Button
              type="button"
              onClick={() => openCreate()}
              disabled={!canEdit || !isCollaborativeReady || !isFullDatasetLoaded}
              aria-label="新增料號"
              className="h-11 w-11 rounded-xl bg-[linear-gradient(135deg,#bef264,#67e8f9)] p-0 text-[#062230] disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div data-mobile-material-primary-controls="true" className="space-y-2 p-2.5">
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-cyan-300" />
              <Input
                value={searchDraft}
                onChange={(event) => {
                  const nextSearchDraft = event.target.value;
                  const normalizedQuery = nextSearchDraft.normalize("NFKC").replace(/\u3000/g, " ").trim();
                  setSearchDraft(nextSearchDraft);
                  startSearchTransition(() => {
                    setQuery(normalizedQuery);
                    setExpandedKey(null);
                    setPage(1);
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void applySearch();
                  }
                }}
                enterKeyHint="search"
                placeholder="掃料名、MPN、REF DES、實體料號"
                aria-label="快速搜尋料號"
                className="h-11 rounded-xl border-cyan-300/35 bg-[#071522] pl-10 pr-3 text-base text-white placeholder:text-slate-500 focus-visible:ring-cyan-300"
              />
            </div>
            <Button
              type="button"
              onClick={() => void applySearch()}
              aria-label={isSearchPending ? "搜尋中" : "搜尋"}
              className="h-11 w-11 rounded-xl bg-cyan-300 p-0 text-[#062230] hover:bg-cyan-200"
            >
              {isSearchPending ? <RotateCcw className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </Button>
          </div>

          <div className="flex snap-x gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={clearFilters} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", availability === "all" && !showMarkedOnly ? "border-sky-200/50 bg-sky-300 text-sky-950" : "border-sky-300/20 bg-sky-400/10 text-sky-100")}>全部 {dataset.stats.totalGroups.toLocaleString()}</button>
            <button type="button" onClick={() => applyAvailabilityFilter("required")} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", availability === "required" ? "border-amber-200/60 bg-amber-300 text-amber-950" : "border-amber-300/25 bg-amber-400/10 text-amber-100")}>料號待補 {requiredApplicationCount.toLocaleString()}</button>
            <button type="button" onClick={() => setShowMarkedOnly((current) => !current)} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", showMarkedOnly ? "border-lime-200/60 bg-lime-300 text-lime-950" : "border-lime-300/20 bg-lime-400/10 text-lime-100")}><Star className={cn("mr-1 inline h-3.5 w-3.5", showMarkedOnly && "fill-current")} />標記 {markedGroupCount}</button>
          </div>

          <details data-mobile-material-tools="true" className="group rounded-xl border border-slate-600/60 bg-slate-950/25 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-black text-slate-200">
              <span className="flex min-w-0 items-center gap-2"><Layers3 className="h-4 w-4 text-violet-200" /><span className="truncate">排序與工具</span></span>
              <span className="flex items-center gap-2 text-[11px] text-slate-400">{SORT_MODE_LABELS[sortMode]}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-white/8 p-2.5">
              <Select value={sortMode} onValueChange={(value) => { setSortMode(value as SortMode); setPage(1); }}>
                <SelectTrigger aria-label="料號排序" className="col-span-2 h-11 rounded-xl border-slate-600/70 bg-[#071522] text-sm text-slate-100"><SelectValue /></SelectTrigger>
                <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">{Object.entries(SORT_MODE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!canEdit || isImporting || !isCollaborativeReady || !isFullDatasetLoaded} className="h-11 border-emerald-300/30 bg-emerald-400/10 text-emerald-100"><Upload className="mr-2 h-4 w-4" />上傳 BOM</Button>
              <Button type="button" variant="outline" onClick={() => openBomPageTrackerDialog(activeWorkspace.id)} disabled={!canManageBomPageTracker} className="h-11 border-sky-300/30 bg-sky-400/10 text-sky-100"><CircleCheck className="mr-2 h-4 w-4" />頁數進度</Button>
              <Button type="button" variant="outline" onClick={() => setGuideOpen(true)} className="h-11 border-violet-300/30 bg-violet-400/10 text-violet-100"><CircleHelp className="mr-2 h-4 w-4" />使用說明</Button>
              <Button type="button" variant="outline" onClick={() => void prepareExportSnapshot()} disabled={isWorkspaceLoading} className="h-11 border-amber-300/30 bg-amber-400/10 text-amber-100"><Download className="mr-2 h-4 w-4" />匯出報表</Button>
            </div>
          </details>
        </div>
      </section>}

      {!isCompactLayout && <header data-material-zone="overview" className="hidden overflow-hidden rounded-xl border border-cyan-300/25 bg-[linear-gradient(120deg,rgba(21,54,77,0.96),rgba(13,34,53,0.98))] px-3 py-2 shadow-[0_18px_48px_-38px_rgba(34,211,238,0.7)] lg:block">
        <div data-material-zone="command-center" className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-cyan-300/24 bg-cyan-300/12 text-cyan-100">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <h1 className="shrink-0 text-base font-black text-white">料號申請</h1>
            <div data-material-zone="collaboration" className="flex min-w-0 items-center gap-1.5">
              <Badge className={cn("h-6 shrink-0 border px-2 text-[11px] font-black", collaborationStatusMeta.badgeClassName)} title={collaborationStatusMeta.description}>
                <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", collaborationStatusMeta.dotClassName)} />
                {collaborationStatusMeta.label}
              </Badge>
              <span className="h-6 shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/[0.08] px-2 text-[11px] font-black leading-6 text-emerald-100">
                {onlineUserCount} 人在線
              </span>
              {isPreviewDataset && (
                <span
                  data-testid="material-progressive-status"
                  className="h-6 shrink-0 rounded-full border border-cyan-300/24 bg-cyan-400/10 px-2 text-[11px] font-black leading-6 text-cyan-100"
                >
                  已顯示 {activeWorkspace.payload.records.length.toLocaleString()} 筆，同步中
                </span>
              )}
            </div>
          </div>

          <div data-material-zone="actions" className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setGuideOpen(true)} className="h-8 px-2.5 text-xs font-bold text-violet-100 hover:bg-violet-400/15 hover:text-white">
              <CircleHelp className="mr-1 h-3.5 w-3.5" />上傳說明
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canEdit || isImporting || !isCollaborativeReady || !isFullDatasetLoaded} className="h-8 border-emerald-300/40 bg-emerald-400/15 px-2.5 text-xs font-bold text-emerald-50 hover:border-emerald-200/70 hover:bg-emerald-400/30 hover:text-white disabled:cursor-not-allowed disabled:border-emerald-950/50 disabled:bg-emerald-950/30 disabled:text-emerald-100/55">
              <Upload className="mr-1 h-3.5 w-3.5" />{isImporting ? "讀取中..." : "上傳 BOM"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void prepareExportSnapshot()} disabled={isWorkspaceLoading} className="h-8 border-amber-300/40 bg-amber-400/15 px-2.5 text-xs font-bold text-amber-50 hover:border-amber-200/75 hover:bg-amber-400/30 hover:text-white disabled:cursor-wait disabled:opacity-60">
              <Download className="mr-1 h-3.5 w-3.5" />匯出報表
            </Button>
            <Button type="button" size="sm" onClick={() => openCreate()} disabled={!canEdit || !isCollaborativeReady || !isFullDatasetLoaded} className="h-8 border border-cyan-100/60 bg-cyan-300 px-3 text-xs font-black text-[#052536] hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-cyan-900/50 disabled:bg-cyan-950/35 disabled:text-cyan-100/60">
              <Plus className="mr-1 h-3.5 w-3.5" />新增料件
            </Button>
          </div>
        </div>

        {collaborationStatus !== "remote" && (
          <div className={cn("mt-2 rounded-lg border px-3 py-1.5 text-xs", collaborationStatusMeta.bannerClassName)}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {collaborationStatus === "checking" || collaborationStatus === "reconnecting" ? (
                  <RotateCcw className="h-3.5 w-3.5 flex-none animate-spin" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5 flex-none" />
                )}
                <p className="shrink-0 font-black">{collaborationStatusMeta.label}</p>
                <span className="text-current/60">/</span>
                <p className="min-w-0 truncate">{collaborationStatusMeta.bannerText}</p>
              </div>
              {collaborationStatus === "error" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void retryBomSync(true)}
                  className="h-7 shrink-0 border-rose-300/35 bg-rose-400/10 px-2.5 text-xs text-rose-50 hover:bg-rose-400/20 hover:text-white"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />重新連線
                </Button>
              )}
            </div>
          </div>
        )}

        <div data-material-zone="bom-workspace" className="mt-2 flex flex-wrap items-center gap-2 border-t border-cyan-300/15 pt-2">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-cyan-100">BOM</span>
          <Select value={activeBomId} onValueChange={switchActiveBom}>
            <SelectTrigger aria-label="切換 BOM" className="h-8 w-full max-w-[30rem] flex-1 items-center border-cyan-300/35 bg-[#08111d] px-2.5 py-0 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:min-w-[18rem]">
              <span className="block min-w-0 truncate text-left text-[13px] font-bold leading-5 text-cyan-100">{activeWorkspace.name}</span>
            </SelectTrigger>
            <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">
              {orderedBomWorkspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  <span className="flex max-w-[28rem] items-center gap-2 text-left">
                    <span className="min-w-0 truncate font-semibold text-slate-100">{workspace.name}</span>
                    {workspaceHasTrackingActivity(workspace) && (
                      <span className="flex-none rounded-full border border-amber-300/35 bg-amber-400/16 px-1.5 text-[10px] font-black leading-4 text-amber-100">追蹤</span>
                    )}
                    <span className="flex-none text-xs text-slate-400">{workspace.payload.recordCount.toLocaleString()} 筆 · {formatTimestamp(workspace.updatedAt)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-material-zone="page-progress"
            onClick={() => openBomPageTrackerDialog(activeWorkspace.id)}
            disabled={!canManageBomPageTracker}
            title="設定總頁數、目前頁與逐頁狀態"
            className={cn(
              "h-8 px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500",
              activePageTrackerSummary.totalPages > 0
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20 hover:text-emerald-50"
                : "border-slate-400/25 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 hover:text-slate-100",
            )}
          >
            <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
            {activePageTrackerSummary.totalPages > 0
              ? `${activePageTrackerSummary.currentPage > 0 ? `第 ${activePageTrackerSummary.currentPage}/${activePageTrackerSummary.totalPages} 頁 · ` : ""}已完成 ${activePageTrackerSummary.completedPages}/${activePageTrackerSummary.totalPages} 頁${activePageTrackerSummary.missingPages > 0 ? ` · 缺料 ${activePageTrackerSummary.missingPages}` : ""}`
              : "頁數進度未設定"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBomManagerOpen(true)} disabled={!isCollaborativeReady} className="h-8 border-violet-300/45 bg-violet-400/20 px-2.5 text-xs font-bold text-violet-50 hover:border-violet-200/70 hover:bg-violet-400/30 hover:text-white disabled:cursor-not-allowed disabled:border-violet-950/50 disabled:bg-violet-950/25 disabled:text-violet-100/50">
            <Layers3 className="mr-1.5 h-3.5 w-3.5" />BOM 管理
            <span className="ml-1.5 rounded-full border border-current/25 px-1.5 text-[10px] leading-4">{bomWorkspaces.length}</span>
          </Button>
          <span className="ml-auto min-w-0 truncate text-[11px] text-slate-400" title={`${activeWorkspace.payload.sheetName} · ${formatTimestamp(activeWorkspace.updatedAt)}`}>{activeWorkspace.payload.sheetName} · {formatTimestamp(activeWorkspace.updatedAt)}</span>
        </div>
      </header>}

      {(pendingRemoteRecordIds.length > 0 || hasPendingWorkspaceUpdate) && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-300/30 bg-amber-400/[0.09] px-3 py-2 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
          <div className="flex min-w-0 items-center gap-2">
            <TriangleAlert className="h-4 w-4 flex-none text-amber-300" />
            <p className="truncate text-sm font-bold text-amber-100">
              {pendingRemoteRecordIds.length > 0 ? `有 ${pendingRemoteRecordIds.length} 筆資料已由其他使用者更新` : "BOM 設定已由其他使用者更新"}
              <span className="ml-2 font-normal text-amber-100/70">
                {editorOpen || trackingDialogOpen ? "你正在填的內容不會被清掉，完成後再載入。" : "不會自動刷新，方便時再載入最新內容。"}
              </span>
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { void loadLatestBomData(); }} disabled={isWorkspaceLoading} className="h-8 flex-none border-amber-300/35 bg-amber-300/12 text-xs text-amber-50 hover:bg-amber-300/20">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />載入最新資料
          </Button>
        </div>
      )}

      {isWorkspaceLoading && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#0d2035] px-3 py-2" role="status" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 motion-reduce:animate-none" />
          <p className="text-sm font-bold text-cyan-100">正在切換 BOM</p>
          <p className="truncate text-xs text-slate-400">只下載這份 BOM 的最新記錄，完成前不顯示其他 BOM 的舊資料。</p>
        </div>
      )}

      <div className={cn("mt-2 transition-opacity", isWorkspaceLoading && "pointer-events-none opacity-35")} aria-busy={isWorkspaceLoading}>
        <div className="min-w-0">
      <section
        data-testid="material-table-card"
        className="overflow-hidden rounded-[14px] border border-[#2a526f] bg-[#0b1b2d]"
      >
        <h2 className="sr-only">料號總表</h2>

        <div data-testid="material-table-toolbar" className="hidden bg-[#0c1f33] px-3 py-2 lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[18rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
              <Input
                value={searchDraft}
                onChange={(event) => {
                  const nextSearchDraft = event.target.value;
                  const normalizedQuery = nextSearchDraft.normalize("NFKC").replace(/\u3000/g, " ").trim();
                  setSearchDraft(nextSearchDraft);
                  startSearchTransition(() => {
                    setQuery(normalizedQuery);
                    setExpandedKey(null);
                    setPage(1);
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void applySearch();
                  }
                }}
                aria-label="搜尋料號"
                placeholder="搜尋料名、REF DES、MPN、實體料號、虛擬料號、狀態追蹤；可輸入『料號待補』"
                className="h-9 border-[#356985] bg-[#071522] pl-9 pr-9 text-sm text-slate-100 placeholder:text-[#a9c0d1] focus-visible:ring-cyan-400"
              />
              {isSearchPending && (
                <RotateCcw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" aria-label="搜尋中" />
              )}
            </div>
            <div data-material-zone="summary-filters" className="flex items-center gap-1">
              <button type="button" onClick={clearFilters} aria-pressed={availability === "all" && !showMarkedOnly} className={cn("inline-flex h-9 items-center rounded-lg border px-2.5 text-xs font-black transition-colors", availability === "all" ? "border-sky-300/34 bg-sky-400/18 text-sky-50" : "border-slate-500/28 bg-slate-900/42 text-slate-200 hover:border-sky-300/20 hover:bg-sky-400/10 hover:text-sky-100")}>主料 <strong className="ml-1">{dataset.stats.totalGroups.toLocaleString()}</strong></button>
              <button type="button" onClick={() => applyAvailabilityFilter("required")} aria-pressed={availability === "required"} className={cn("inline-flex h-9 items-center rounded-lg border px-2.5 text-xs font-black transition-colors", availability === "required" ? "border-amber-300/50 bg-amber-400/20 text-amber-50" : "border-amber-300/28 bg-amber-400/10 text-amber-100 hover:bg-amber-400/18 hover:text-amber-50")}>料號待補 <strong className="ml-1">{requiredApplicationCount.toLocaleString()}</strong></button>
              {!columnVisibility.marked && (
                <button
                  type="button"
                  onClick={() => setShowMarkedOnly((current) => !current)}
                  aria-pressed={showMarkedOnly}
                  aria-label="只看我的標記"
                  title="只看我的標記"
                  className={cn("inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-black transition-colors", showMarkedOnly ? "border-amber-300/40 bg-amber-400/18 text-amber-100" : "border-slate-500/28 bg-slate-900/42 text-amber-200 hover:bg-amber-400/10")}
                >
                  <Star className={cn("h-3.5 w-3.5", showMarkedOnly && "fill-current")} />
                  <span aria-hidden="true">{markedGroupCount}</span>
                </button>
              )}
            </div>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger aria-label="排序" className="h-9 w-48 border-[#2a526f] bg-[#071522] text-xs text-slate-200">
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
            <MaterialColumnSettings
              hiddenColumns={hiddenColumns}
              onToggle={toggleHiddenColumn}
              onShowAll={() => setHiddenColumns([])}
              onResetWidths={() => setColumnWidths([...DEFAULT_COLUMN_WIDTHS])}
              onOpenColors={() => {
                setTableColorDraft(activeTableColorTheme);
                setTableColorDialogOpen(true);
              }}
            />
            <span className="ml-auto text-xs text-slate-400">
              {isPreviewDataset
                ? <>先顯示 <strong className="text-cyan-200">{visibleGroupRows.length.toLocaleString()}</strong> 個主料，完整清單同步中</>
                : <>顯示 <strong className="text-cyan-200">{filteredGroups.length.toLocaleString()}</strong> / {dataset.stats.totalGroups.toLocaleString()} 個主料 · {dataset.stats.totalRecords.toLocaleString()} 筆廠商明細</>}
            </span>
          </div>
          {activeFilterChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => removeFilterChip(chip.key)}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-sky-300/24 bg-sky-400/10 px-2 text-xs font-semibold leading-6 text-sky-100 hover:bg-sky-400/18"
                  title="移除此條件"
                >
                  <span className="max-w-[20rem] truncate">{chip.label}</span>
                  <X className="h-3 w-3 flex-none" />
                </button>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-xs text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                全部清除
              </Button>
            </div>
          )}
        </div>

        {isCompactLayout && <div className="space-y-2 p-2 lg:hidden" data-testid="material-mobile-cards">
          <h2 className="sr-only">手機以料件卡片呈現，點開即可查看替代料與追蹤紀錄</h2>
          {visibleGroupRows.map(({ group, primaryAlternative, trackingRecord, secondaryAlternatives }, rowIndex) => {
            const expanded = expandedKey === group.key;
            const mainRecord = primaryAlternative ?? group.primaryRecord;
            const itemValue = getGroupItemValue(group, (page - 1) * pageSize + rowIndex + 1);
            const isMarked = markedGroupKeySet.has(group.key);
            const mustApply = group.requiresApplication;
            const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred && !record.isRisk).length;

            return (
              <article
                key={group.key}
                className={cn(
                  "overflow-hidden rounded-xl border bg-[linear-gradient(145deg,rgba(16,38,58,0.98),rgba(8,24,40,0.98))] shadow-[0_18px_40px_-30px_rgba(34,211,238,0.7)]",
                  mustApply ? "border-amber-300/35" : "border-cyan-200/20",
                )}
              >
                <div className="flex items-start gap-2.5 p-2.5">
                  <button
                    type="button"
                    onClick={() => toggleMarkedGroup(group.key)}
                    aria-label={isMarked ? "移除我的標記" : "加入我的標記"}
                    className={cn(
                      "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-[10px] font-black",
                      isMarked ? "border-amber-200/45 bg-amber-300 text-amber-950" : "border-slate-500/25 bg-slate-900/50 text-slate-400",
                    )}
                  >
                    <Star className={cn("h-4 w-4", isMarked && "fill-current")} />
                    {itemValue}
                  </button>
                  <button type="button" onClick={() => openRecord(mainRecord, "view")} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-black leading-5 text-white">{group.name || mainRecord.name || "未命名料件"}</p>
                    <p className="truncate text-xs font-semibold text-cyan-200">{getDisplayMpn(mainRecord) || "尚未填寫 MPN"} · <span className="font-normal text-slate-400">{mainRecord.manufacturer || "未指定廠商"}</span></p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><PartUsageSummary records={group.records} /><span className="inline-flex min-w-0 items-center gap-1"><span className="text-xs text-slate-500">phase out</span><PhaseOutStatus record={mainRecord} /></span><span className="inline-flex min-w-0 items-center gap-1"><span className="text-xs text-slate-500">Symbol</span><SymbolBuildStatus record={mainRecord} /></span></div>
                  </button>
                  <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-500" />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto border-y border-white/5 bg-[#091827]/85 px-2.5 py-1.5 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-black", group.riskCount > 0 ? "border-rose-300/35 bg-rose-400/12 text-rose-100" : mustApply ? "border-amber-300/35 bg-amber-400/12 text-amber-100" : "border-slate-300/30 bg-slate-400/10 text-slate-100")}>{group.riskCount > 0 ? "料況需確認" : mustApply ? "未提供虛擬／實體料號" : mainRecord.sourcingStatus || "供應／核准狀態未提供"}</span>
                  <span className="max-w-[11rem] shrink-0 truncate rounded-full border border-slate-500/20 bg-slate-800/35 px-2 py-0.5 text-slate-200">REF {mainRecord.refDes || mainRecord.refGroup || "-"}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-bold", availableAlternativeCount > 0 ? "border-emerald-300/25 bg-emerald-400/8 text-emerald-200" : "border-slate-500/25 bg-slate-800/40 text-slate-300")}>替代 {availableAlternativeCount}/{secondaryAlternatives.length}</span>
                </div>

                {expanded ? (
                  <div className="space-y-2 border-b border-cyan-200/10 bg-[#071522] p-2.5">
                    {secondaryAlternatives.length ? secondaryAlternatives.map((record) => (
                      <button key={record.id} type="button" onClick={() => openRecord(record, "view")} className="flex w-full items-center gap-3 rounded-xl border border-violet-300/15 bg-violet-400/[0.07] px-3 py-2 text-left">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-300/15 text-xs font-black text-violet-100">ALT</span>
                        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{getDisplayMpn(record) || "未填 MPN"}</strong><span className="block truncate text-xs text-slate-400">{record.manufacturer || "未指定廠商"}</span></span>
                        <ChevronRight className="h-4 w-4 text-violet-200" />
                      </button>
                    )) : <p className="rounded-lg border border-dashed border-slate-600/50 px-3 py-2 text-xs text-slate-400">目前沒有替代料</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={!trackingRecord} onClick={() => trackingRecord && openTrackingDialog(trackingRecord)} className="h-11 rounded-xl border-emerald-300/25 bg-emerald-400/10 px-2 text-emerald-100">狀態追蹤</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => openRecord(mainRecord, "view")} className="h-11 rounded-xl border-slate-400/25 bg-slate-400/10 px-2 text-slate-100">完整資料</Button>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 p-2">
                  <Button type="button" size="sm" onClick={() => openCreate(group)} className="h-11 rounded-xl bg-cyan-300 px-3 font-black text-[#062230] hover:bg-cyan-200"><Plus className="mr-1 h-4 w-4" />更新料號</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleExpanded(group.key)} aria-expanded={expanded} className="h-11 rounded-xl border-violet-300/25 bg-violet-400/10 px-2 text-violet-100">
                    {expanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}更多
                  </Button>
                </div>
              </article>
            );
          })}
          {visibleGroupRows.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center text-slate-400"><Search className="h-9 w-9" /><p className="mt-3 font-bold text-slate-200">目前篩選條件沒有符合的料件</p></div>
          ) : null}
        </div>}

        {!isCompactLayout && <div className="hidden border-t border-[#2a526f] lg:block">
        <div
          className="relative max-h-[72vh] overflow-auto"
          data-testid="material-table-scroll"
        >
          <table className="table-fixed border-collapse text-[13px]" style={{ width: `max(100%, ${tableWidth}px)`, minWidth: tableWidth }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d2137] text-left text-[13px] font-bold text-white">
                {MATERIAL_TABLE_COLUMNS.map((column, columnIndex) => columnVisibility[column.key] && (
                  <ResizableHeader
                    key={column.key}
                    width={columnWidths[columnIndex]}
                    minWidth={MIN_COLUMN_WIDTHS[columnIndex]}
                    maxWidth={MAX_COLUMN_WIDTHS[columnIndex]}
                    onResize={(width) => resizeColumn(columnIndex, width)}
                    className={column.key === "actions"
                      ? MATERIAL_STICKY_COLUMN_CLASSES.header
                      : undefined}
                  >
                    <span data-testid={column.key === "actions" ? "material-data-update-header" : undefined} title={MATERIAL_TABLE_COLUMN_HELP[column.key]}>
                      {column.label}
                    </span>
                  </ResizableHeader>
                ))}
              </tr>
              <tr className="bg-[#10263a] text-slate-100">
                {columnVisibility.item && (
                  <th className="border-r border-blue-300/20 p-1.5">
                    <div className="flex h-8 items-center justify-center text-[11px] font-bold text-slate-500">#</div>
                  </th>
                )}
                {columnVisibility.marked && (
                  <th className="border-r border-blue-300/20 p-1.5">
                    <button
                      type="button"
                      onClick={() => setShowMarkedOnly((current) => !current)}
                      aria-pressed={showMarkedOnly}
                      className={cn(
                        "flex h-8 w-full items-center justify-center gap-1 rounded border text-xs font-bold transition-colors",
                        showMarkedOnly
                          ? "border-amber-300/40 bg-amber-400/18 text-amber-100"
                          : "border-blue-300/20 bg-[#07182d] text-amber-200 hover:bg-amber-400/10",
                      )}
                      aria-label="只看我的標記"
                      title="只看我的標記"
                    >
                      <Star className={cn("h-3.5 w-3.5", showMarkedOnly && "fill-current")} />
                      <span aria-hidden="true">{markedGroupCount}</span>
                    </button>
                  </th>
                )}
                {columnVisibility.material && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="material" getOptions={getColumnFilterOptions} label="料件" selectedValues={columnFilters.material} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, material: values }))} /></th>}
                {columnVisibility.refDes && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="refDes" getOptions={getColumnFilterOptions} label="REF DES" selectedValues={columnFilters.refDes} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, refDes: values }))} /></th>}
                {columnVisibility.mpn && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="mpn" getOptions={getColumnFilterOptions} label="MPN" selectedValues={columnFilters.mpn} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, mpn: values }))} /></th>}
                {columnVisibility.internal && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="internal" getOptions={getColumnFilterOptions} label="實體料號" selectedValues={columnFilters.internal} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, internal: values }))} /></th>}
                {columnVisibility.tx && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="virtualAlternative" getOptions={getColumnFilterOptions} label="虛擬料號" selectedValues={columnFilters.virtualAlternative} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, virtualAlternative: values }))} /></th>}
                {columnVisibility.phaseOut && <th className="border-r border-blue-300/20 p-1.5"><div className="flex h-8 items-center justify-center text-[11px] text-slate-500">來源原文</div></th>}
                {columnVisibility.symbol && <th className="border-r border-blue-300/20 p-1.5"><div className="flex h-8 items-center justify-center text-[11px] text-slate-500">來源原文</div></th>}
                {columnVisibility.status && (
                  <th className="border-r border-blue-300/20 p-1.5">
                    <div className="flex h-8 items-center justify-center text-[11px] text-slate-500">—</div>
                  </th>
                )}
                {columnVisibility.tracking && <th className="border-r border-blue-300/20 p-1.5"><ExcelFilterPopover filterKey="trackingStatus" getOptions={getColumnFilterOptions} label="狀態追蹤" selectedValues={columnFilters.trackingStatus} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, trackingStatus: values }))} /></th>}
                {columnVisibility.actions && (
                  <th className={MATERIAL_STICKY_COLUMN_CLASSES.filter}>
                    <div className="flex h-8 items-center justify-center text-[11px] text-slate-500">操作</div>
                  </th>
                )}
              </tr>
            </thead>
            {visibleGroupRows.map((row, rowIndex) => {
              const editingNames = Array.from(new Set(
                row.group.records.flatMap((record) => editorsByRecordId.get(record.id) ?? []),
              )).join("、");
              const latestRecordUpdate = row.group.records
                .map((record) => activeWorkspace.recordMeta?.[record.id]?.updatedAt)
                .filter((value): value is string => Boolean(value))
                .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? "";
              const latestUpdater = row.trackingRecord ? getLatestTrackingEntry(row.trackingRecord)?.createdBy ?? "" : "";

              return (
                <MaterialGroupRow
                  key={row.group.key}
                  row={row}
                  itemValue={getGroupItemValue(row.group, (page - 1) * pageSize + rowIndex + 1)}
                  expanded={expandedKey === row.group.key}
                  isMarked={markedGroupKeySet.has(row.group.key)}
                  canEdit={canEdit}
                  editingNames={editingNames}
                  latestRecordUpdate={latestRecordUpdate}
                  latestUpdater={latestUpdater}
                  colorTheme={activeTableColorTheme}
                  columns={columnVisibility}
                  actions={rowActions}
                />
              );
            })}
            {visibleGroupRows.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={visibleColumnCount} className="px-6 py-8 text-center text-sm font-bold text-slate-300">目前篩選條件沒有符合的料件</td>
                </tr>
              </tbody>
            )}
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-400/15 bg-[#101d33] px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-400"><span>每頁</span><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger aria-label="每頁筆數" className="h-8 w-20 border-blue-400/20 bg-[#0b1527] text-xs text-slate-200"><SelectValue /></SelectTrigger><SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">{PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} 列</SelectItem>)}</SelectContent></Select><span>第 {page} / {totalPages} 頁</span></div>
          <div className="flex items-center gap-1.5"><Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-8 border-blue-400/20 bg-[#0b1527] px-2.5 text-xs text-slate-300"><ChevronLeft className="mr-1 h-3.5 w-3.5" />上一頁</Button><Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="h-8 border-blue-400/20 bg-[#0b1527] px-2.5 text-xs text-slate-300">下一頁<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div>
        </div>
        </div>}
      </section>
        </div>
      </div>
    </div>
  );
}
import { isValidBomUsage } from "@/lib/inputValidation";
