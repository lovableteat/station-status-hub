import {
  type ChangeEvent,
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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  FileText,
  Filter,
  History,
  Layers3,
  Paperclip,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useIsCompactLayout } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { useWorkspaceMutationScope, WorkspaceMutationScopeChangedError } from "@/hooks/useWorkspaceMutationScope";

import {
  type MaterialDataset,
  type MaterialGroup,
  type MaterialRecord,
  type MaterialTrackingHistoryEntry,
  type MaterialWorkbookRecord,
  type MaterialWorkbookPayload,
  buildMaterialDataset,
  getActionLabel,
  getLatestTrackingEntry,
  isPreferredInternalPartNumber,
  normalizeMaterialSearchText,
  hasMaterialPartNumber,
  isMeManufacturedRecord,
  ME_APPLICATION_EXEMPTION_LABEL,
  parseMaterialWorkbookFile,
} from "./materialRequestUtils";
import {
  type BomPageTracker,
  type BomPageTrackerPage,
  type BomPageTrackerStatus,
  type BomRecordSyncMeta,
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
import type { BomTableColorTheme, BomWorkspaceArchive, BomWorkspaceProject } from "./materialBomStorage";
import { loadBomWorkspaceArchives, loadBomWorkspaceProjects, saveBomWorkspaceArchive, saveBomWorkspaceProject, saveBomWorkspaceTableColorTheme } from "./materialBomStorage";
import { loadBomWorkspaceRecords, loadBomWorkspaceVersions, saveBomWorkspaceVersion } from "./materialBomStorage";
import { BomVersionCenter } from "./BomVersionCenter";
import { BomUploadDialog, NEW_BOM_SERIES_TARGET, type BomUploadMeta, type PendingBomUpload } from "./BomUploadDialog";
import { carryBomTracking } from "./bomDiff";
import {
  BOM_SERIES_NAME_LIMIT, BOM_VERSION_LABEL_LIMIT, BOM_VERSION_NOTE_LIMIT, bomFileBaseName, buildBomSeriesList, createBomSeriesId,
  createBomVersionWorkspaceId, findBomSeriesByWorkspace, inferBomSeriesForFile, nextBomVersionNumber,
  type BomSeries, type BomSeriesVersion, type BomWorkspaceVersion,
} from "./bomVersioning";
import { createBomSourceUrl, uploadBomSourceFile } from "./materialBomSources";
import { UploadGuideDialog } from "./MaterialUploadGuideDialog";
import { MaterialTrackingEditor } from "./MaterialTrackingEditor";
import { applyMaterialTrackingDraft, createMaterialTrackingDraft } from "./materialTrackingDraft";
import { MATERIAL_SPEC_ACCEPT, MATERIAL_SPEC_MAX_BYTES, createMaterialSpecUrl, formatMaterialSpecSize, uploadMaterialSpecDocuments } from "./materialSpecDocuments";
import { getMaterialSpecDocuments, withMaterialSpecDocuments } from "./materialAttachments";
import { getMaterialTrackingStatusMeaning, isExplicitMaterialApplication, materialTrackingStatusTone } from "./materialTrackingStatus";
import { MaterialRequestOwnerPicker, type MaterialRequestOwner } from "./MaterialRequestOwnerPicker";
import { useMaterialRequestOwners } from "./useMaterialRequestOwners";
import { exportPendingMaterialsExcel } from "./pendingMaterialsExport";
import { MATERIAL_CE_FIELDS } from "./materialUploadContract.mjs";
import { isMaterialReferenceQuery, matchesMaterialReference } from "./materialSearch";
import { clearMaterialCrosshair, markMaterialCrosshair } from "./materialTableCrosshair";
import { MaterialTableSettingsDialog, type MaterialTableSettings } from "./MaterialTableSettingsDialog";
import { DEFAULT_BOM_TABLE_COLOR_THEME, normalizeBomTableColorTheme, blendWithSurface, withAlpha, buildTableRowStyle, buildMaterialCrosshairStyle } from "./materialTableTheme";
import type {
  MaterialExportProgress,
  MaterialReportSnapshot,
} from "./materialRequestExport";
import { buildVendorMailSections, collectDiscouragedMaterialRows, collectNonPvlPartNumbers, countExcludedDiscouragedRows, DEFAULT_VENDOR_MAIL_SUBJECT, exportDiscouragedMaterialsExcel, exportNonPvlApplyList, exportVendorMailHtml, mailHtmlToText, renderVendorMailText, splitVendorMailTemplate, VENDOR_MAIL_ITEMS_TOKEN } from "./materialRequestExport";
import { VendorMailEditor, type VendorMailEditorHandle } from './VendorMailEditor';
import { RlcPriorityDialog } from './RlcPriorityDialog';
import { useRlcPriority } from './useRlcPriority';
import { MaterialNonPvlDialog } from "./MaterialNonPvlDialog";
import { getVendorRecipients } from "./vendorContacts";
import { useVendorContacts } from "./useVendorContacts";
import { VendorContactsPanel } from "./VendorContactsPanel";
import { SupplierDirectoryDialog } from "./SupplierDirectoryDialog";
import { useCompanySuppliers } from "./useCompanySuppliers";
import { emptySupplierData, getCompanyRecipients, supplierEmails, validateSupplierData } from "./supplierDirectory";
import {
  MATERIAL_TABLE_COLUMNS,
  type BomProjectGroup,
  type MaterialTableColumnKey,
  type PendingMaterialCategory,
  createCompactValueSummary,
  getMaterialExportScopeLabel,
  getMaterialStickyColumnClasses,
  getMaterialSourceValue,
  getMaterialTableWidth,
  groupBomWorkspacesByProject,
  buildPendingApplications,
  groupPendingMaterials,
  getPendingMaterialCategory,
  PENDING_MATERIAL_CATEGORIES,
  resolvePendingMaterialCategory,
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
type MaterialEditorTab = "details" | "tracking";
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
  qty: ColumnFilterSelection;
  refDes: ColumnFilterSelection;
  mpn: ColumnFilterSelection;
  manufacturer: ColumnFilterSelection;
  sourcingStatus: ColumnFilterSelection;
  virtualAlternative: ColumnFilterSelection;
  internal: ColumnFilterSelection;
  partName: ColumnFilterSelection;
  partSpec: ColumnFilterSelection;
  schematicPart: ColumnFilterSelection;
  footprint: ColumnFilterSelection;
  phaseOut: ColumnFilterSelection;
  partUsage: ColumnFilterSelection;
  trackingStatus: ColumnFilterSelection;
}

type ColumnFilterKey = keyof MaterialColumnFilters;

const COLUMN_FILTER_LABELS: Record<ColumnFilterKey, string> = {
  material: "料件",
  qty: "Qty",
  refDes: "REF DES",
  mpn: "MPN",
  manufacturer: "Manufacturer",
  sourcingStatus: "Sourcing Status",
  virtualAlternative: "虛擬料號",
  internal: "實體料號",
  partName: "Part Name",
  partSpec: "Part Spec",
  schematicPart: "Schematic_Part",
  footprint: "PCB_Footprint",
  phaseOut: "phase out",
  partUsage: "零件狀態",
  trackingStatus: "狀態追蹤",
};

interface CachedColumnValues {
  raw: string[];
  searchable: string;
}

type CachedRecordColumnValues = Record<ColumnFilterKey, CachedColumnValues>;

const EMPTY_COLUMN_FILTERS: MaterialColumnFilters = {
  material: null,
  qty: null,
  refDes: null,
  mpn: null,
  manufacturer: null,
  sourcingStatus: null,
  virtualAlternative: null,
  internal: null,
  partName: null,
  partSpec: null,
  schematicPart: null,
  footprint: null,
  phaseOut: null,
  partUsage: null,
  trackingStatus: null,
};

const FILTER_KEYS = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];

const DEFAULT_BOM_ID = "bom:申請carrier料.xlsx";
const ACTIVE_BOM_KEY = "station-status-hub:active-material-bom:v1";
const ACTIVE_BOM_PROJECT_KEY = "station-status-hub:active-material-bom-project:v1";
const MARKED_GROUPS_KEY_PREFIX = "station-status-hub:material-marked-groups:v1:";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const VIEW_STATE_KEY_PREFIX = "station-status-hub:material-view:v1:";
const COLUMN_WIDTHS_SESSION_KEY = "station-status-hub:material-column-widths:v14";
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
    activeClassName: "bg-success text-success-foreground",
    idleClassName: "text-muted-foreground hover:bg-accent hover:text-foreground",
  },
  {
    value: "pending",
    label: "待處理",
    activeClassName: "bg-accent text-foreground",
    idleClassName: "text-muted-foreground hover:bg-accent hover:text-foreground",
  },
  {
    value: "done_missing",
    label: "已完成但缺料",
    activeClassName: "bg-warning text-warning-foreground",
    idleClassName: "text-muted-foreground hover:bg-accent hover:text-foreground",
  },
];
const DEFAULT_COLUMN_WIDTHS = [56, 240, 56, 130, 200, 150, 130, 160, 150, 150, 180, 130, 130, 110, 170, 150];
const MIN_COLUMN_WIDTHS = [48, 180, 48, 100, 150, 110, 100, 130, 120, 110, 120, 100, 100, 90, 120, 130];
const MAX_COLUMN_WIDTHS = [96, 520, 96, 360, 520, 360, 300, 400, 360, 360, 480, 300, 300, 260, 400, 360];
const FILTER_OPTION_ROW_HEIGHT = 38;
const FILTER_OPTION_LIST_HEIGHT = 224;
const FILTER_OPTION_OVERSCAN = 8;
// One collator for the Ref sort; localeCompare with options builds one per comparison.
const REF_COLLATOR = new Intl.Collator(undefined, { numeric: true });
// Status chips share one shape and the page's semantic tones.
const CHIP_BASE = "inline-flex min-w-0 max-w-full items-center truncate rounded-md border px-1.5 text-[11px] font-semibold leading-5";
const CHIP_TONES = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  primary: "border-primary/35 bg-primary/15 text-primary",
  success: "border-success/35 bg-success/15 text-success",
  warning: "border-warning/35 bg-warning/15 text-warning",
  danger: "border-destructive/35 bg-destructive/15 text-destructive",
} as const;

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
  level: getMaterialCeFieldHelp("Level"),
  refGroup: { description: "網站內部分組參考，不是 CE Excel 欄位。新格式以 Ref Des 填寫位號，不需額外準備代碼；相同虛擬料號不會合併不同位號。", example: "C101" },
  refDes: getMaterialCeFieldHelp("Ref Des"),
  name: getMaterialCeFieldHelp("Name"),
  qty: getMaterialCeFieldHelp("Qty"),
  assemblyName: { description: "Level 1 模組列所代表的模組名稱；網站保留作分類，料件列不需另填這一欄。", example: "C2 Carrier Board" },
  schematicPart: getMaterialCeFieldHelp("Schematic_Part"),
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
  remark: { description: "網站維護的人工申請狀態或備註，不是 CE Excel 欄位，不會由零件狀態自動建立申請。", example: "待確認實體料號、待核對原理圖符號" },
  specDocument: { description: "這顆料的 SPEC／datasheet 檔案，存在網站的檔案空間，不是 CE Excel 欄位。表格的 Part Spec 欄會出現迴紋針，點了直接開啟。", example: "PDF、Word、Excel、圖片或 zip，單檔 25 MB 以內" },
} as const;

// Plain-language version of each field's help for the record dialog. The CE
// contract text stays the source of truth for meanings and exports; this only
// explains the same thing in everyday words.
const MATERIAL_FIELD_PLAIN: Record<keyof typeof MATERIAL_FIELD_HELP, string> = {
  level: "這裡新增或修改的是料件列，階層固定為 2。",
  refGroup: "網站用來把同一個位號的主料和替代料放在一起的分組代碼，通常直接填位號，例如 C101。這不是 CE Excel 的欄位，CE 不用填。",
  refDes: "這顆料在電路圖上的位號，例如 C101、R1。同一顆料用在好幾個位置，就用逗號分開，例如 C101, C102。",
  name: "設計 BOM 上的料件名稱，照原本的寫法填，例如 CAP CER 0.1UF 16V X7R。",
  qty: "一台產品要用幾顆，填數字就好。",
  assemblyName: "這顆料屬於哪個模組（Level 1 的模組名稱），網站拿來分類；一般料件列不用特別填。",
  schematicPart: "OrCAD 要叫得出來的原理圖符號名稱，例如 CAP。由 CE 核對後填。",
  pcbFootprint: "PCB 上的零件封裝（footprint）名稱，例如 C_0402。",
  partSpec: "料件規格，照原本的內容填，例如 0.1uF / 16V / X7R。同一顆料有多個廠商時，規格要一致，不一致請交給 RD 確認。",
  manufacturer: "這一列 MPN 的製造商（原廠）名稱，一列只填一家。",
  manufacturerPartNumber: "原廠料號（MPN），一列只填一個。同一顆料還有別的廠商或料號，就另外開一列。",
  manufacturerPartNumberAlt: "舊檔留下來的第二個廠商料號。新的 CE Excel 已經沒有這一欄，新資料請拆成另一列。",
  virtualAlternative: "虛擬料號：可以共用好幾個實體料的上層料號，同一個虛擬料號底下可以對應多列實體料。",
  partNumber: "實體料號：公司系統裡已經申請好的料號，對應單一廠商、單一 MPN。還沒申請就留白，網站會把這顆料列在「待處理料」。",
  partName: "實體料號在公司系統裡對應的料名。",
  sourcingStatus: "公司／原廠的供應與核准狀態，照原文填，例如 Approved、NRND、Obsolete。不要拿它來填 phase out 或零件狀態。",
  phaseOutStatus: "公司系統裡這顆料的 phase out 狀態，照原文填，例如 ACTIVE、PHASEOUT、UNDERREVIEW。它和右邊的「零件狀態」是兩回事，各填各的。",
  partUsageStatus: "新設計能不能用這顆料的限制，照公司原文填，例如「新設計產品不建議使用－ODM 不建議用料」；不清楚就填「待確認」。",
  requestTicket: "申請單或工單的編號，方便之後回查進度。這是網站自己維護的欄位，CE Excel 沒有。",
  requestUrl: "申請單的完整網址，貼上去就能從網站直接開；沒有可以留白。",
  tracking: "這顆料最新的追蹤進度。要新增紀錄、貼圖片或改狀態，請用表格最右邊的「狀態追蹤」。",
  remark: "人工備註，例如「待確認實體料號」。只給網站上的人看，不會自動建立申請。",
  specDocument: "這顆料的規格書／datasheet 檔案。上傳後存在網站上，表格的 Part Spec 欄會多一個迴紋針，點了直接開。",
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
          className="group inline-flex w-full min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            data-testid="compact-hover-preview"
            className={cn("block min-w-0 flex-1 truncate whitespace-nowrap", previewClassName)}
          >
            {summary.preview}
          </span>
          {summary.remainingCount > 0 && (
            <span className="inline-flex flex-none rounded border border-border bg-secondary px-1.5 text-[11px] font-semibold leading-4 text-muted-foreground">
              +{summary.remainingCount}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        data-testid="compact-hover-content"
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={16}
        className={cn("w-auto min-w-[14rem] max-w-[min(820px,calc(100vw-24px))] rounded-xl border-border bg-popover p-3 text-popover-foreground shadow-lg", summary.values.length > 8 && "w-[min(820px,calc(100vw-24px))]")}
      >
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <span className="font-mono text-[11px] text-muted-foreground">{filteredValues.length}/{summary.values.length}</span>
          {onCopy && summary.fullText !== "-" ? (
            <button
              type="button"
              data-testid="compact-hover-copy-all"
              aria-label={`複製全部${label}`}
              title="複製全部"
              onClick={(event) => {
                event.stopPropagation();
                onCopy(summary.fullText);
              }}
              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {canSearch ? (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="compact-hover-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`搜尋${label}`}
              className="h-7 w-full rounded-md border border-input bg-secondary pl-8 pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
            />
            {query ? (
              <button
                type="button"
                aria-label="清除搜尋"
                onClick={() => setQuery("")}
                className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}

        <ul className="grid max-h-[min(360px,55vh)] grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 overflow-y-auto rounded-md border border-border bg-background/40 px-1">
          {filteredValues.length > 0 ? filteredValues.map((value, index) => (
            <li key={`${value}-${index}`} className="truncate border-b border-border/40 px-1 font-mono text-xs leading-6 text-foreground" title={value}>
              {value}
            </li>
          )) : (
            <li className="w-full py-3 text-center text-xs text-muted-foreground">找不到符合「{query}」的內容</li>
          )}
        </ul>
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
          className="group/identity flex w-full min-w-0 items-start gap-2 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* The full name always shows; long names wrap instead of being cut off. */}
          <span
            data-testid="material-primary-name"
            className="block min-w-0 flex-1 whitespace-normal break-words text-[13px] font-semibold leading-5 text-foreground"
            title={name || "未命名料件"}
          >
            {name || "未命名料件"}
          </span>
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground opacity-60 transition-opacity group-hover/identity:opacity-100" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={16}
        className={cn("w-auto min-w-[16rem] max-w-[min(820px,calc(100vw-24px))] rounded-xl border-border bg-popover p-3 text-popover-foreground shadow-lg", refs.length + mpns.length > 8 && "w-[min(820px,calc(100vw-24px))]")}
      >
        <p className="truncate text-sm font-semibold text-foreground">{name || "未命名料件"}</p>
        <p data-testid="material-primary-vendor" className="truncate text-xs text-muted-foreground">
          {manufacturer || "未填廠商"} · 模組：<span className="text-foreground">{assemblyName || "未指定"}</span>
        </p>
        <p data-testid="material-identity-metrics" className="mt-1 font-mono text-[11px] text-muted-foreground">
          REF DES {refs.length} · MPN {mpns.length} · 數量 {qty}
        </p>

        {[
          ["REF DES", refs, "尚未設定 REF DES", "material-identity-ref-list"],
          ["MPN", mpns, "尚未設定 MPN", "material-identity-mpn-list"],
        ].map(([sectionLabel, values, emptyText, testId]) => (
          <section key={sectionLabel as string} data-testid={testId as string} className="mt-2 min-w-0 border-t border-border pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{sectionLabel as string}</p>
            <ScrollArea className={cn((values as string[]).length > 30 && "h-56")}>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3 rounded-md border border-border bg-background/40 px-1">
                {(values as string[]).length > 0 ? (values as string[]).map((value) => (
                  <li key={value} className="truncate border-b border-border/40 px-1 font-mono text-xs leading-6 text-foreground" title={value}>
                    {value}
                  </li>
                )) : (
                  <li className="px-2 text-xs leading-6 text-muted-foreground">{emptyText as string}</li>
                )}
              </ul>
            </ScrollArea>
          </section>
        ))}
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
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {/* HoverCard portals to the body, so the help never gets clipped by a scrolling dialog. */}
      <HoverCard openDelay={120} closeDelay={150}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label={`${label}填寫說明`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="h-4 w-4" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-[60] w-[24rem] max-w-[calc(100vw-24px)] rounded-xl border-border bg-popover px-4 py-3 text-popover-foreground shadow-lg"
        >
          <p className="text-base font-semibold text-foreground">{label}</p>
          <p className="mt-1.5 whitespace-normal text-sm leading-6 text-foreground/90">{MATERIAL_FIELD_PLAIN[field] ?? help.description}</p>
          <p className="mt-2 text-sm text-foreground/70">範例：{help.example}</p>
          {"header" in help && <p className="mt-1 text-sm text-foreground/70">Excel 欄名：{help.header}</p>}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

const MATERIAL_COLUMN_FILTER_KEYS: Partial<Record<MaterialTableColumnKey, ColumnFilterKey>> = {
  name: "material", qty: "qty", refDes: "refDes", mpn: "mpn", manufacturer: "manufacturer", sourcingStatus: "sourcingStatus", virtual: "virtualAlternative", physical: "internal",
  partName: "partName", partSpec: "partSpec", schematicPart: "schematicPart", footprint: "footprint", phaseOut: "phaseOut", partUsage: "partUsage", actions: "trackingStatus",
};

// Row 5 of the CE workbook (the Chinese meaning) shown under each workbook column header.
const MATERIAL_TABLE_COLUMN_MEANING: Partial<Record<MaterialTableColumnKey, string>> = Object.fromEntries(
  MATERIAL_TABLE_COLUMNS
    .filter((column) => column.ceHeader)
    .map((column) => [column.key, MATERIAL_CE_HELP_BY_HEADER.get(column.ceHeader)?.meaning ?? ""]),
);

const MATERIAL_TABLE_COLUMN_HELP: Partial<Record<MaterialTableColumnKey, string>> = {
  ...Object.fromEntries(
    MATERIAL_TABLE_COLUMNS
      .filter((column) => column.ceHeader)
      .map((column) => [column.key, `Excel 欄名：${column.ceHeader}\n${getMaterialCeFieldHelp(column.ceHeader).description}`]),
  ),
  item: "網站列號，依目前排序與分頁編號。",
  actions: "網站人工維護的狀態追蹤與資料更新，與 CE Excel 的供應／核准狀態、phase out 及零件狀態分開。",
};

const MATERIAL_STICKY_COLUMN_CLASSES = getMaterialStickyColumnClasses();

function getMarkedGroupsStorageKey(bomId: string) {
  return `${MARKED_GROUPS_KEY_PREFIX}${bomId}`;
}

function loadColumnWidths() {
  if (typeof window === "undefined") return DEFAULT_COLUMN_WIDTHS;

  try {
    // Older layouts had different column sets; anything that is not the current 19-column shape starts from defaults.
    const parsed = JSON.parse(window.sessionStorage.getItem(COLUMN_WIDTHS_SESSION_KEY) ?? "null");
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
        cardClassName: "border-success/30 bg-success/10",
        textClassName: "text-success",
      };
    case "done_missing":
      return {
        label: "已完成但缺料",
        cardClassName: "border-warning/30 bg-warning/10",
        textClassName: "text-warning",
      };
    default:
      return {
        label: "待處理",
        cardClassName: "border-border bg-background/40",
        textClassName: "text-foreground",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        ready ? CHIP_TONES.success : CHIP_TONES.neutral,
        className,
      )}
    >
      <CircleCheck className="h-3.5 w-3.5" />
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
    specDocument: record.specDocument,
    specDocuments: record.specDocuments,
    requestOwnerId: record.requestOwnerId,
    requestOwnerName: record.requestOwnerName,
    ...(record.pendingCategory ? { pendingCategory: record.pendingCategory } : {}),
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
      return group.records.map((record) => record.partNumber);
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
    // 實體料號 only: Schematic_Part and PCB_Footprint have their own filters, and mixing them in made
    // a blank footprint match "實體料號 is blank" on rows that do have a PEGA P/N.
    case "internal":
      return [record.partNumber];
    case "virtualAlternative":
      return [record.virtualAlternative ?? ""];
    case "qty":
      return [String(group.qty ?? "")];
    case "manufacturer":
      return [record.manufacturer];
    case "sourcingStatus":
      return [record.sourcingStatus];
    case "partName":
      return [record.partName];
    case "partSpec":
      return [record.partSpec];
    case "schematicPart":
      return [record.schematicPart];
    case "footprint":
      return [record.pcbFootprint];
    case "phaseOut":
      return [record.phaseOutStatus ?? ""];
    case "partUsage":
      return [record.partUsageStatus ?? ""];
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
  if (!normalized) return CHIP_TONES.neutral;
  if (["完成", "已完成", "ok", "approved", "完成申請", "結案"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return CHIP_TONES.success;
  }
  if (["處理中", "進行", "progress", "working", "wip"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return CHIP_TONES.warning;
  }
  if (["無狀態", "新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return CHIP_TONES.neutral;
  }
  return CHIP_TONES.primary;
}

function getTrackingStatusCardTone(status: string) {
  const normalized = status.trim().toLowerCase();
  const neutral = {
    wrapper: "border-border bg-secondary/60 hover:bg-secondary",
    accent: "bg-muted-foreground/60",
    note: "bg-background/40 text-foreground",
    meta: "text-muted-foreground",
    icon: "text-muted-foreground",
  };

  if (!normalized) return neutral;

  if (["完成", "已完成", "ok", "approved", "完成申請", "結案"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return {
      wrapper: "border-success/30 bg-success/10 hover:bg-success/15",
      accent: "bg-success",
      note: "bg-background/40 text-foreground",
      meta: "text-success",
      icon: "text-success",
    };
  }

  if (["處理中", "進行", "progress", "working", "wip"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return {
      wrapper: "border-warning/30 bg-warning/10 hover:bg-warning/15",
      accent: "bg-warning",
      note: "bg-background/40 text-foreground",
      meta: "text-warning",
      icon: "text-warning",
    };
  }

  if (["無狀態", "新增追蹤", "待", "申請", "確認", "排程", "追蹤", "pending"].some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return neutral;
  }

  return {
    wrapper: "border-primary/30 bg-primary/10 hover:bg-primary/15",
    accent: "bg-primary",
    note: "bg-background/40 text-foreground",
    meta: "text-primary",
    icon: "text-primary",
  };
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

function toBomWorkspaceProject(project: { id: string; name: string } | null | undefined): BomWorkspaceProject | undefined {
  if (!project?.id) return undefined;
  return { projectId: project.id, projectName: project.name, updatedAt: new Date().toISOString() };
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

function normalizeColumnFilterSelection(selectedValues: ColumnFilterSelection | undefined) {
  // Filters restored from an older saved layout may lack newer columns.
  if (selectedValues == null) return null;

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
  const [searchValue, setSearchValue] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const deferredSearchValue = useDeferredValue(searchValue);
  // Every click applies immediately: the table is the preview, so no draft, 取消 or 確定.
  const selected = useMemo(() => normalizeColumnFilterSelection(selectedValues), [selectedValues]);
  const allOptionValues = useMemo(() => options.map((option) => option.value), [options]);
  const optionValueSet = useMemo(() => new Set(allOptionValues), [allOptionValues]);
  const selectedList = useMemo(() => (selected === null ? allOptionValues : selected), [allOptionValues, selected]);
  const selectedSet = useMemo(() => new Set(selectedList), [selectedList]);
  const hiddenSelectedCount = selected === null ? 0 : selected.filter((value) => !optionValueSet.has(value)).length;

  useEffect(() => {
    if (!open) {
      setIsPanelReady(false);
      setOptions([]);
      setSearchValue("");
      setScrollTop(0);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setOptions(getOptions(filterKey));
      setIsPanelReady(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [filterKey, getOptions, open]);

  const searchTokens = useMemo(() => parseSearchTokens(deferredSearchValue), [deferredSearchValue]);
  const searchHasValue = searchTokens.length > 0;
  const filteredOptions = useMemo(() => {
    const next = searchHasValue
      ? options.filter((option) => {
          const searchableText = `${option.label} ${option.keywords ?? option.value}`.toLowerCase();
          return searchTokens.every((token) => filterKey === "refDes" ? matchesMaterialReference(option.value, token) : searchableText.includes(token));
        })
      : options;
    return [...next].sort((left, right) => sortDirection === "asc"
      ? left.label.localeCompare(right.label, undefined, { numeric: true })
      : right.label.localeCompare(left.label, undefined, { numeric: true }));
  }, [filterKey, options, searchHasValue, searchTokens, sortDirection]);
  const visibleValues = useMemo(() => filteredOptions.map((option) => option.value), [filteredOptions]);
  const visibleCheckedCount = filteredOptions.filter((option) => selectedSet.has(option.value)).length;
  const allOptionsChecked = selected === null || (hiddenSelectedCount === 0 && options.length > 0 && options.every((option) => selectedSet.has(option.value)));

  useEffect(() => {
    setScrollTop(0);
  }, [deferredSearchValue, sortDirection]);

  const virtualStartIndex = Math.max(0, Math.floor(scrollTop / FILTER_OPTION_ROW_HEIGHT) - FILTER_OPTION_OVERSCAN);
  const virtualEndIndex = Math.min(filteredOptions.length, Math.ceil((scrollTop + FILTER_OPTION_LIST_HEIGHT) / FILTER_OPTION_ROW_HEIGHT) + FILTER_OPTION_OVERSCAN);
  const visibleOptionSlice = filteredOptions.slice(virtualStartIndex, virtualEndIndex);

  const apply = (values: string[] | null) => {
    if (values === null) {
      onSelectedValuesChange(null);
      return;
    }
    const normalized = normalizeColumnFilterSelection(values) ?? [];
    const isEverything = hiddenSelectedCount === 0
      && options.length > 0
      && normalized.length === options.length
      && options.every((option) => normalized.includes(option.value));
    onSelectedValuesChange(isEverything ? null : normalized);
  };
  const toggleValue = (value: string, checked: boolean) => {
    apply(checked ? Array.from(new Set([...selectedList, value])) : selectedList.filter((item) => item !== value));
  };
  const keepOnlyVisible = () => apply(visibleValues);
  const addVisible = () => apply(Array.from(new Set([...selectedList, ...visibleValues])));
  const removeVisible = () => apply(selectedList.filter((value) => !visibleValues.includes(value)));

  const appliedCount = selected === null ? options.length : selected.length;
  const triggerSummary = selected === null ? "全部" : `${selected.length}項`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between rounded-md border px-2 text-left text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/10",
            selected === null
              ? "border-border bg-secondary/60 text-foreground"
              : "border-primary/45 bg-primary/15 text-foreground",
          )}
          title={selected === null ? `篩選${label}` : `${label}：已選 ${selected.length} 項`}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Filter className={cn("h-3.5 w-3.5 flex-none", selected === null ? "text-muted-foreground" : "text-primary")} />
            <span className="truncate">{label}</span>
          </span>
          {selected !== null && (
            <span className="ml-1 flex-none rounded bg-primary/20 px-1.5 text-[10px] leading-4 text-primary">
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
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("input")?.focus();
        }}
        className="w-[min(320px,calc(100vw-24px))] rounded-2xl border border-border bg-popover p-2.5 text-popover-foreground shadow-lg"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</p>
            <span className="font-mono text-[11px] text-muted-foreground">{appliedCount}/{options.length}</span>
            <button
              type="button"
              onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              aria-label={sortDirection === "asc" ? "改為 Z 到 A 排序" : "改為 A 到 Z 排序"}
              title={sortDirection === "asc" ? "目前 A → Z，點擊改為 Z → A" : "目前 Z → A，點擊改為 A → Z"}
              className="rounded-md border border-border bg-secondary/60 px-1.5 font-mono text-[11px] leading-5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {sortDirection === "asc" ? "A→Z" : "Z→A"}
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchHasValue && filteredOptions.length > 0) {
                  event.preventDefault();
                  keepOnlyVisible();
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="輸入關鍵字；Enter 只留符合的值"
              aria-label={`搜尋${label}篩選值`}
              className="h-9 rounded-lg pl-8 pr-3 text-[13px]"
            />
          </div>

          {isPanelReady ? (
            <div className="rounded-xl border border-border bg-background/40">
              <div className="flex items-center gap-1 border-b border-border p-1.5">
                {searchHasValue ? (
                  <>
                    <span className="px-1 text-[11px] text-muted-foreground">符合 {filteredOptions.length} 筆</span>
                    <button type="button" onClick={keepOnlyVisible} disabled={filteredOptions.length === 0} className="rounded-md border border-primary/40 bg-primary/15 px-2 text-xs font-semibold leading-6 text-foreground hover:bg-primary/25 disabled:opacity-50">只留符合</button>
                    <button type="button" onClick={addVisible} disabled={filteredOptions.length === 0} className="rounded-md border border-border bg-secondary/60 px-2 text-xs font-semibold leading-6 text-foreground hover:bg-secondary disabled:opacity-50">加入符合</button>
                    <button type="button" onClick={removeVisible} disabled={visibleCheckedCount === 0} className="rounded-md border border-border bg-secondary/60 px-2 text-xs font-semibold leading-6 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50">移除符合</button>
                  </>
                ) : (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-foreground hover:bg-accent">
                    <Checkbox
                      checked={allOptionsChecked ? true : (selectedList.length > 0 ? "indeterminate" : false)}
                      onCheckedChange={(value) => apply(value === true ? null : [])}
                    />
                    <span className="min-w-0 flex-1 truncate">全選</span>
                    <span className="text-xs text-muted-foreground">{selectedList.length - hiddenSelectedCount}/{options.length}</span>
                  </label>
                )}
                <button type="button" onClick={() => apply([])} className="shrink-0 rounded-md border border-border px-2 text-xs font-semibold leading-6 hover:bg-accent">取消全選</button>
                {selected !== null && (
                  <button type="button" onClick={() => apply(null)} className="ml-auto rounded-md px-2 text-xs font-semibold leading-6 text-muted-foreground hover:bg-accent hover:text-foreground">清除</button>
                )}
              </div>

              {filteredOptions.length > 0 ? (
                <div className="h-56 overflow-y-auto" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
                  <div className="relative" style={{ height: filteredOptions.length * FILTER_OPTION_ROW_HEIGHT }}>
                    {visibleOptionSlice.map((option, index) => {
                      const checked = selectedSet.has(option.value);
                      const tone = option.tone ?? "slate";
                      const offsetY = (virtualStartIndex + index) * FILTER_OPTION_ROW_HEIGHT;

                      return (
                        <label
                          key={option.value}
                          className={cn(
                            "absolute left-0 right-0 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-accent",
                            checked ? "text-foreground" : "text-muted-foreground",
                          )}
                          style={{ top: offsetY, height: FILTER_OPTION_ROW_HEIGHT }}
                        >
                          <Checkbox checked={checked} onCheckedChange={(value) => toggleValue(option.value, value === true)} />
                          <span
                            className={cn(
                              "h-2 w-2 flex-none rounded-full",
                              tone === "emerald" && "bg-success",
                              tone === "amber" && "bg-warning",
                              tone === "sky" && "bg-primary",
                              tone === "rose" && "bg-destructive",
                              tone === "slate" && "bg-muted-foreground/60",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          <span className="rounded-full bg-secondary px-2 text-[11px] leading-5 text-muted-foreground">{option.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">找不到符合的篩選值</div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background/40 px-3 py-8 text-center text-[13px] text-muted-foreground">
              正在載入篩選清單...
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-1">
            <p className="min-w-0 truncate text-[11px] text-muted-foreground">
              {hiddenSelectedCount > 0 ? `另有 ${hiddenSelectedCount} 個已選值不在目前清單，仍會保留` : "點一下立即套用，表格同步更新"}
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} className="h-7 px-3 text-xs">完成</Button>
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

export function VirtualAlternativeValue({ value, onCopy }: { value: string; onCopy: (value: string) => void }) {
  if (!value.trim()) return <span className="block text-[13px] text-muted-foreground/70" title="虛擬料號：未提供">未提供</span>;
  return (
    <button type="button" onClick={() => onCopy(value)} aria-label={`複製虛擬料號：${value}`} title={`複製虛擬料號：${value}`} className="group flex w-full min-w-0 items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 truncate font-mono text-[13px] font-semibold leading-5 text-primary">{value}</span>
      <Copy className="h-3.5 w-3.5 flex-none text-primary opacity-60 group-hover:opacity-100" aria-hidden="true" />
    </button>
  );
}

function TrackingHistoryCell({
  record,
  onOpen,
  embedded = false,
}: {
  record: MaterialRecord;
  onOpen: (record: MaterialRecord) => void;
  /** Inside the merged 狀態追蹤 / 更新 control the cell drops its own frame and shares the group's. */
  embedded?: boolean;
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
    latestEntry?.note ?? (embedded && !latestEntry ? summary : ""),
    embedded && requestMeta.ticket ? `單號 ${requestMeta.ticket}` : "",
  ].filter(Boolean).join("\n");

  return (
    <button
      type="button"
      data-testid="tracking-history-cell"
      onClick={() => onOpen(record)}
      className={cn(
        "group flex min-h-[40px] w-full items-center gap-2 px-2 py-1 text-left transition-colors",
        embedded ? "rounded-none border-0" : "rounded-lg border",
        cardTone.wrapper,
      )}
      title={tooltip}
      aria-label={embedded ? `${record.manufacturerPartNumber || record.name}，${statusLabel}，追蹤與更新料件（${historyCount} 筆）` : undefined}
    >
      <span className={cn(CHIP_BASE, embedded ? "min-w-0 max-w-full truncate" : "flex-none", getTrackingStatusTone(workflowStatus))}>
        {statusLabel}
      </span>
      {embedded && <span className="ml-auto flex-none text-xs font-semibold text-primary">更新</span>}
      {/* The merged 狀態追蹤 / 更新 column is narrow: only the status chip stays; the note, ticket and
          history count are in the tooltip and the whole chip opens the history. */}
      {!embedded && (
        <span className={cn("min-w-0 flex-1 truncate text-xs", latestEntry?.note ? "text-foreground" : "text-muted-foreground")}>
          {summary}
        </span>
      )}
      {requestMeta.ticket && !embedded && (
        requestMeta.url ? (
          <a
            href={requestMeta.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className={cn(CHIP_BASE, "max-w-20 flex-none hover:bg-warning/25", CHIP_TONES.warning)}
            title={`${requestMeta.ticket} · ${requestMeta.url}`}
          >
            {requestMeta.ticket}
          </a>
        ) : (
          <span className={cn(CHIP_BASE, "max-w-20 flex-none", CHIP_TONES.warning)} title={requestMeta.ticket}>
            {requestMeta.ticket}
          </span>
        )
      )}
      {!embedded && <History className={cn("h-3.5 w-3.5 flex-none opacity-70 transition-opacity group-hover:opacity-100", cardTone.icon)} />}
    </button>
  );
}


function PhaseOutStatus({ record }: { record: MaterialRecord }) {
  const value = getMaterialSourceValue(record.phaseOutStatus);
  return <span data-testid="material-phase-out-status" className="block truncate text-xs font-semibold leading-5 text-foreground" title={`phase out（零件狀態）：${value}`}>{value}</span>;
}

function MaterialSourceText({ value, label, mono = false, chip = false }: { value: string | number | null | undefined; label: string; mono?: boolean; chip?: boolean }) {
  const text = getMaterialSourceValue(value == null ? "" : String(value));
  const missing = text === "未提供";
  if (chip && !missing) {
    return <span className={cn(CHIP_BASE, CHIP_TONES.neutral)} title={`${label}：${text}`}>{text}</span>;
  }
  return (
    <span
      className={cn("block truncate text-[13px] leading-5", mono && "font-mono", missing ? "text-muted-foreground/70" : "text-foreground")}
      title={`${label}：${text}`}
    >
      {text}
    </span>
  );
}

function PartUsageStatus({ record }: { record: MaterialRecord }) {
  const text = getMaterialSourceValue(record.partUsageStatus);
  if (text === "未提供") return <span className="block truncate text-[13px] leading-5 text-muted-foreground/70" title="零件狀態：未提供">未提供</span>;
  return (
    <span
      className={cn(CHIP_BASE, record.isRisk ? CHIP_TONES.danger : CHIP_TONES.neutral)}
      title={record.partUsageStatusSource === "legacy-tracking" ? `零件狀態（由舊格式的料號追蹤欄帶入）：${text}` : `零件狀態：${text}`}
    >
      {text}
    </span>
  );
}

function PartUsageSummary({ records }: { records: MaterialRecord[] }) {
  const statuses = [...new Set(records.map(record => record.partUsageStatus?.trim()).filter(Boolean))];
  if (!statuses.length) return null;
  const risk = records.some(record => record.isRisk);
  return (
    <span
      data-testid="material-part-usage-summary"
      className={cn(CHIP_BASE, "max-w-[9rem] flex-none", risk ? CHIP_TONES.danger : CHIP_TONES.neutral)}
      title={`零件狀態：${statuses.join("；")}`}
    >
      {statuses.join("；")}
    </span>
  );
}

function ActionPill({ record }: { record: MaterialRecord }) {
  const tone = record.isReady ? CHIP_TONES.success : record.isPending ? CHIP_TONES.warning : CHIP_TONES.neutral;
  return (
    <span className={cn(CHIP_BASE, tone)} title={getActionLabel(record.actionKind)}>
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

  const numberFieldClassName = "h-9 w-24 rounded-xl px-3 text-sm";
  const dialogDescription = `${workspace.name} · ${workspace.payload.sheetName} · ${workspace.payload.recordCount.toLocaleString()} 筆料件`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] w-[min(92vw,1400px)] max-w-[min(92vw,1400px)] flex-col gap-4 overflow-hidden p-5 text-base sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl">頁數進度</DialogTitle>
          <DialogDescription className="truncate" title={dialogDescription}>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <section className="workspace-dialog-section flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="bom-total-pages" className="text-xs font-semibold">總頁數</Label>
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
            <Label htmlFor="bom-current-page" className="text-xs font-semibold">目前做到第幾頁</Label>
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
          <div className="flex flex-wrap items-center gap-2 pb-1.5">
            <BomPageTrackerSummaryPill pageTracker={{ totalPages, currentPage, pages: syncedPages, updatedAt: workspace.pageTracker?.updatedAt ?? workspace.updatedAt }} />
            <span className="text-xs text-muted-foreground">完成率 {completionRate}%</span>
          </div>
        </section>

        {totalPages === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            先填總頁數，下面就會列出每一頁
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/40 px-4 py-2.5">
              <span className="text-xs font-semibold text-foreground">批次設定</span>
              <Label htmlFor="bom-range-start" className="text-xs text-muted-foreground">第</Label>
              <Input
                id="bom-range-start"
                type="number"
                min={1}
                max={Math.max(totalPages, 1)}
                step={1}
                value={rangeStartInput}
                onChange={(event) => setRangeStartInput(event.target.value)}
                aria-label="起始頁"
                className="h-8 w-20 rounded-lg px-2 text-sm"
              />
              <Label htmlFor="bom-range-end" className="text-xs text-muted-foreground">~</Label>
              <Input
                id="bom-range-end"
                type="number"
                min={1}
                max={Math.max(totalPages, 1)}
                step={1}
                value={rangeEndInput}
                onChange={(event) => setRangeEndInput(event.target.value)}
                aria-label="結束頁"
                className="h-8 w-20 rounded-lg px-2 text-sm"
              />
              <span className="text-xs text-muted-foreground">頁設為</span>
              <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
                {BOM_PAGE_STATUS_OPTIONS.map((option) => (
                  <button
                    key={`range-${option.value}`}
                    type="button"
                    onClick={() => applyRangeStatus(option.value)}
                    disabled={rangeSelectionCount === 0}
                    className={cn("h-7 rounded-md px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50", option.idleClassName)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {rangeSelectionCount > 0 ? `共 ${rangeSelectionCount} 頁，備註會保留` : "先填起訖頁"}
              </span>
            </div>

            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span>逐頁狀態與備註</span>
              <span>{completedPages} / {totalPages} 頁完成</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-background/40">
              <div className="divide-y divide-border/70">
                {visiblePages.map((page) => {
                  const statusMeta = getBomPageStatusMeta(page.status);
                  const isCurrent = page.pageNumber === currentPage;

                  return (
                    <div
                      key={page.pageNumber}
                      className={cn("flex flex-wrap items-center gap-2 px-3 py-1.5", isCurrent && "bg-primary/10")}
                    >
                      <span className={cn("w-16 flex-none text-sm font-semibold", statusMeta.textClassName)}>第 {page.pageNumber} 頁</span>
                      <div className="inline-flex flex-none rounded-lg border border-border bg-secondary p-0.5" role="group" aria-label={`第 ${page.pageNumber} 頁狀態`}>
                        {BOM_PAGE_STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={page.status === option.value}
                            onClick={() => {
                              updatePage(page.pageNumber, { status: option.value });
                              if (currentPage === 0 || page.pageNumber > currentPage) {
                                setCurrentPageInput(String(page.pageNumber));
                              }
                            }}
                            className={cn("h-7 rounded-md px-2.5 text-xs font-semibold transition-colors", page.status === option.value ? option.activeClassName : option.idleClassName)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {isCurrent ? (
                        <span className={cn(CHIP_BASE, "flex-none", CHIP_TONES.primary)}>目前頁</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentPageInput(String(page.pageNumber))}
                          className="flex-none rounded-md px-2 text-[11px] font-semibold leading-5 text-muted-foreground hover:bg-accent hover:text-foreground"
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
                        placeholder="備註"
                        aria-label={`第 ${page.pageNumber} 頁備註`}
                        className="h-8 min-w-[12rem] flex-1 rounded-lg px-2.5 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>關閉</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存頁數進度"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STALE_PENDING_MS = 3 * 24 * 60 * 60 * 1000;

/** Latest change on any record of the group: a saved edit or a tracking entry. Zero when nothing is dated. */
function getPendingGroupUpdatedAt(group: MaterialGroup, recordMeta?: Record<string, BomRecordSyncMeta>) {
  let latest = 0;
  for (const record of group.records) {
    for (const value of [recordMeta?.[record.id]?.updatedAt, ...(record.trackingHistory ?? []).map((entry) => entry.createdAt)]) {
      const time = value ? new Date(value).getTime() : 0;
      if (Number.isFinite(time) && time > latest) latest = time;
    }
  }
  return latest;
}

const DEFAULT_VENDOR_MAIL_MESSAGE = "<p>您好，以下料件需要申請料號／取得建料資料（規格書、Symbol、Footprint），再麻煩協助提供，謝謝。</p>";
const VENDOR_MAIL_SIGNATURE_KEY = "station-status-hub:material-mail-signature:v1";
const VENDOR_MAIL_MESSAGE_KEY = "station-status-hub:material-mail-message:v1";
const VENDOR_MAIL_CONTENT_KEY = 'station-status-hub:material-mail-content:v2';
const VENDOR_MAIL_SUBJECT_KEY = 'station-status-hub:material-mail-subject:v2';

function loadStoredHtml(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storeHtml(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
}


export function PendingMailDialog({
  groups,
  open,
  workspaceName,
  exportedBy,
  onOpenChange,
}: {
  groups: MaterialGroup[];
  open: boolean;
  workspaceName: string;
  exportedBy: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [contentHtml, setContentHtml] = useState(() => loadStoredHtml(VENDOR_MAIL_CONTENT_KEY, `${loadStoredHtml(VENDOR_MAIL_MESSAGE_KEY, DEFAULT_VENDOR_MAIL_MESSAGE)}<p>${VENDOR_MAIL_ITEMS_TOKEN}</p>${loadStoredHtml(VENDOR_MAIL_SIGNATURE_KEY, '')}`));
  const [subjectFormat, setSubjectFormat] = useState(() => loadStoredHtml(VENDOR_MAIL_SUBJECT_KEY, DEFAULT_VENDOR_MAIL_SUBJECT));
  const contentRef = useRef<VendorMailEditorHandle>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [subjectOverrides, setSubjectOverrides] = useState<Record<string, string>>({});
  const [recipientOverrides, setRecipientOverrides] = useState<Record<string, { to: string; cc: string }>>({});
  const { toast } = useToast();
  const book = useVendorContacts(open);
  const companyBook = useCompanySuppliers(open);
  const generatedSections = useMemo(() => buildVendorMailSections(groups, workspaceName, subjectFormat), [groups, workspaceName, subjectFormat]);
  const subjectKey = (vendor: string) => `${book.ownerId ?? "signed-out"}\0${workspaceName}\0${vendor}`;
  const sections = generatedSections.map((section) => {
    const recipients = getVendorRecipients(book.contacts, section.vendor);
    const companyRecipients = getCompanyRecipients(companyBook.contacts, section.vendor);
    const overrides = recipientOverrides[subjectKey(section.vendor)];
    const to = overrides?.to ?? [...new Set(supplierEmails(`${companyRecipients.to}; ${recipients.to}`))].join('; ');
    const cc = overrides?.cc ?? [...new Set(supplierEmails(`${companyRecipients.cc}; ${recipients.cc}`))].filter(email => !supplierEmails(to).includes(email)).join('; ');
    return {
      ...section,
      subject: subjectOverrides[subjectKey(section.vendor)] ?? section.subject,
      to: to.split(/[;,\n]+/).map(value => value.trim()).filter(Boolean),
      cc: cc.split(/[;,\n]+/).map(value => value.trim()).filter(Boolean),
      toText: to,
      ccText: cc,
      companyMatches: companyRecipients.matched,
      recipientErrors: validateSupplierData({ ...emptySupplierData(), company: section.vendor, email: to, cc }),
    };
  });
  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  const template = useMemo(() => {
    try { return { ...splitVendorMailTemplate(contentHtml), error: '' }; }
    catch (cause) { return { messageHtml: contentHtml, signatureHtml: '', error: cause instanceof Error ? cause.message : '請檢查料件位置標記' }; }
  }, [contentHtml]);
  const message = mailHtmlToText(template.messageHtml), signature = mailHtmlToText(template.signatureHtml);
  useEffect(() => { storeHtml(VENDOR_MAIL_CONTENT_KEY, contentHtml); }, [contentHtml]);
  useEffect(() => { storeHtml(VENDOR_MAIL_SUBJECT_KEY, subjectFormat); }, [subjectFormat]);
  useEffect(() => { if (!open) setEditorBusy(false); }, [open]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const snapshot = contentRef.current?.snapshot() ?? contentHtml;
      const { messageHtml, signatureHtml } = splitVendorMailTemplate(snapshot);
      setContentHtml(snapshot);
      const fileName = await exportVendorMailHtml({ sections, messageHtml, signatureHtml, workspaceName, exportedBy });
      toast({ title: "信件 HTML 已產生", description: `${sections.length} 家廠商 · ${itemCount} 項 · ${fileName}，開啟後每家按「複製」即可貼到郵件群發。` });
    } catch (error) {
      toast({ title: "信件生成失敗", description: error instanceof Error ? error.message : "請稍後再試。", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pending-mail-dialog" className="flex max-h-[94vh] w-[min(92vw,1400px)] max-w-[min(92vw,1400px)] flex-col gap-4 overflow-hidden p-5 text-base sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl">信件生成</DialogTitle>
          <DialogDescription>把目前 {groups.length.toLocaleString()} 筆待處理料整理成每家廠商一封信（共 {sections.length} 家、{itemCount.toLocaleString()} 項），匯出 HTML 後逐家複製貼到郵件即可群發。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">主旨可逐封修改。收件人依公司、別名與明列代理品牌帶入，請核對窗口後匯出。</p>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setDirectoryOpen(true)}><Factory className="h-4 w-4" />供應商聯絡資料</Button>
            <Button type="button" variant="outline" className="h-11 shrink-0 gap-2" aria-expanded={contactsOpen} onClick={() => setContactsOpen((value) => !value)}>
              <Factory className="h-4 w-4" />個人聯絡簿（{book.contacts.length}）
            </Button>
          </div>
          {book.loading ? <p role="status" className="text-sm text-muted-foreground">正在載入個人聯絡簿…</p> : null}
          {companyBook.loading ? <p role="status" className="text-sm text-muted-foreground">正在載入公司聯絡資料…</p> : null}
          {companyBook.error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">公司聯絡資料讀取失敗：{companyBook.error}<Button variant="outline" onClick={() => void companyBook.reload().catch(() => {})}>重新載入公司聯絡資料</Button></div> : null}
          {book.error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>{book.error}</span>
              <Button type="button" variant="outline" className="h-11" disabled={book.loading || book.busy} onClick={() => void book.reload().catch(() => undefined)}>重新載入聯絡簿</Button>
            </div>
          ) : null}
          {contactsOpen ? <VendorContactsPanel key={book.ownerId ?? "signed-out"} book={book} /> : null}
          <section className="workspace-dialog-section space-y-4 rounded-2xl p-4">
            <div className="space-y-2">
              <Label htmlFor="pending-mail-subject-format">預設主旨格式</Label>
              <Input id="pending-mail-subject-format" value={subjectFormat} onChange={event => setSubjectFormat(event.target.value)} maxLength={500} className="h-11" />
              <p className="text-sm text-muted-foreground">{'{廠商} 會帶入廠商名稱，{BOM} 可帶入目前 BOM。VERA_GPU 與其他文字可直接修改；逐封修改的主旨會保留。'}</p>
            </div>
            <VendorMailEditor ref={contentRef} value={contentHtml} onChange={setContentHtml} onBusyChange={setEditorBusy} />
            {template.error ? <p role="alert" className="text-sm text-destructive">{template.error}</p> : null}
          </section>
          <section className="workspace-dialog-section rounded-2xl p-4">
            <h3 className="text-base font-semibold text-foreground">廠商分組預覽</h3>
            {sections.length === 0 ? (
              <p className="mt-2 text-sm text-foreground/75">目前沒有待處理料，無法產生信件。</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border">
                {sections.map((section, index) => (
                  <li key={section.vendor} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate text-base text-foreground">{section.vendor}</strong>
                      <span className={cn(CHIP_BASE, "flex-none", CHIP_TONES.primary)}>{section.items.length} 項</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`pending-mail-subject-${index}`} className="text-sm">信件主旨</Label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          id={`pending-mail-subject-${index}`}
                          aria-label={`${section.vendor} 信件主旨`}
                          value={section.subject}
                          maxLength={500}
                          onChange={(event) => setSubjectOverrides((current) => ({ ...current, [subjectKey(section.vendor)]: event.target.value }))}
                          className="h-11 min-w-0 flex-1 basis-64 text-sm"
                        />
                        <Button type="button" variant="outline" className="h-11 shrink-0" aria-label={`重新產生 ${section.vendor} 主旨`} onClick={() => setSubjectOverrides((current) => ({ ...current, [subjectKey(section.vendor)]: generatedSections[index].subject }))}>自動產生</Button>
                      </div>
                      {!section.subject.trim() ? <p className="text-sm text-destructive">請填寫主旨後再匯出。</p> : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div><Label htmlFor={`pending-mail-to-${index}`}>收件人</Label><Input id={`pending-mail-to-${index}`} aria-label={`${section.vendor} 收件人`} value={section.toText} placeholder="Email，多位以分號分隔" maxLength={6000} onChange={event => setRecipientOverrides(prior => ({ ...prior, [subjectKey(section.vendor)]: { to: event.target.value, cc: section.ccText } }))} /></div>
                        <div><Label htmlFor={`pending-mail-cc-${index}`}>副本</Label><Input id={`pending-mail-cc-${index}`} aria-label={`${section.vendor} 副本`} value={section.ccText} maxLength={6000} onChange={event => setRecipientOverrides(prior => ({ ...prior, [subjectKey(section.vendor)]: { to: section.toText, cc: event.target.value } }))} /></div>
                      </div>
                      {section.recipientErrors.length ? <p role="alert" className="text-sm text-destructive">{section.recipientErrors.join('；')}</p> : null}
                      {section.companyMatches.length ? <details className="rounded-lg border border-primary/20 p-2 text-sm"><summary className="cursor-pointer text-primary">公司資料匹配 {section.companyMatches.length} 位窗口，展開選擇</summary><div className="mt-2 space-y-2">{section.companyMatches.map(contact => <label key={contact.id} className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={!contact.data.email} checked={!!contact.data.email && supplierEmails(contact.data.email).every(email => supplierEmails(section.to.join('; ')).includes(email))} onChange={event => {
                        const emails = supplierEmails(contact.data.email), current = supplierEmails(section.to.join('; '));
                        const to = event.target.checked ? [...new Set([...current, ...emails])] : current.filter(email => !emails.includes(email));
                        setRecipientOverrides(prior => ({ ...prior, [subjectKey(section.vendor)]: { to: to.join('; '), cc: section.cc.join('; ') } }));
                      }} /><span className="break-words">{contact.data.company} · {contact.data.name || '未填姓名'} · {contact.data.title}<br /><span className="text-muted-foreground">{contact.data.email || '無有效 Email'} · {contact.source.group} / {contact.source.sheet}</span></span></label>)}</div></details> : <p className="text-sm text-muted-foreground">公司資料沒有精確匹配的窗口，可手動填寫收件人。</p>}
                    </div>
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background/40 p-2 font-sans text-sm text-foreground/80">{renderVendorMailText(section, message, signature)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 px-4 text-sm">關閉</Button>
          <Button type="button" data-testid="pending-mail-export" disabled={isExporting || editorBusy || !!template.error || companyBook.loading || !!companyBook.error || sections.length === 0 || sections.some((section) => !section.subject.trim() || section.recipientErrors.length > 0)} onClick={() => void handleExport()} className="h-10 px-4 text-sm font-bold">
            <FileCode2 className="mr-1.5 h-4 w-4" />{isExporting ? "產生中…" : "匯出信件 HTML"}
          </Button>
        </DialogFooter>
        <SupplierDirectoryDialog open={directoryOpen} onOpenChange={setDirectoryOpen} />
      </DialogContent>
    </Dialog>
  );
}

function MaterialApplicationExemptionBadge({ record }: { record: Pick<MaterialWorkbookRecord, 'refDes' | 'refGroup'> }) {
  return isMeManufacturedRecord(record) ? <span data-testid="me-application-exempt" title={ME_APPLICATION_EXEMPTION_LABEL} aria-label={ME_APPLICATION_EXEMPTION_LABEL} className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">ME 免申請</span> : null;
}

// Ref Des prefixes decide the category by default; companies that name parts differently can override it per part.
function PendingCategoryPicker({ group, disabled, onChange }: { group: MaterialGroup; disabled: boolean; onChange: (category: PendingMaterialCategory | null) => void }) {
  const { category, manual } = resolvePendingMaterialCategory(group);
  const automatic = PENDING_MATERIAL_CATEGORIES.find((item) => item.key === getPendingMaterialCategory(group.displayRef));
  const label = PENDING_MATERIAL_CATEGORIES.find((item) => item.key === category)?.label ?? category;
  return (
    <Select value={manual ? category : "auto"} disabled={disabled} onValueChange={(value) => onChange(value === "auto" ? null : value as PendingMaterialCategory)}>
      <SelectTrigger
        data-testid="pending-category-picker"
        aria-label={`調整 ${group.displayRef} 的分類，目前 ${label}${manual ? "（手動）" : "（依位號）"}`}
        title={manual ? `手動分類為 ${label}；可改回依位號自動分類` : `依位號自動分類為 ${label}；分錯可在這裡改`}
        className={cn("pending-row-category h-9 gap-1 rounded-md px-2 text-xs font-bold", manual ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-secondary/60 text-foreground/80")}
      >
        <SelectValue>{manual ? `${label} · 手動` : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">依位號自動（{automatic?.label ?? "其他"}）</SelectItem>
        {PENDING_MATERIAL_CATEGORIES.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function PendingMaterialsDialog({
  canEdit,
  groups,
  open,
  restoreView = false,
  recordMeta,
  workspaceName,
  exportedBy,
  onOpenChange,
  onOpenTracking,
  onSetCategory,
  accountId,
  onSetOwner,
  markedGroupKeys,
  onToggleMarked,
}: {
  canEdit: boolean;
  groups: MaterialGroup[];
  open: boolean;
  /** Reopened after editing one of its items: keep the tab, search and scroll position. */
  restoreView?: boolean;
  recordMeta?: Record<string, BomRecordSyncMeta>;
  workspaceName: string;
  exportedBy: string;
  onOpenChange: (open: boolean) => void;
  onOpenTracking: (record: MaterialRecord) => void;
  /** Saves a hand-picked category for a pending part; null returns it to the Ref Des rule. */
  onSetCategory: (group: MaterialGroup, category: PendingMaterialCategory | null) => void;
  accountId?: string;
  onSetOwner: (record: MaterialRecord, owner: MaterialRequestOwner | null) => Promise<void>;
  markedGroupKeys: ReadonlySet<string>;
  onToggleMarked: (groupKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const ownerDirectory = useMaterialRequestOwners(open, accountId);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PendingMaterialCategory | "all" | "marked">("all");
  // Default: locations with no number on any vendor row (one line each). The switch adds every vendor
  // row that has neither a 實體料號 nor a 虛擬料號, even beside vendors that already have one.
  const [includeAlternates, setIncludeAlternates] = useState(false);
  const locationApplications = useMemo(() => buildPendingApplications(groups), [groups]);
  const vendorApplications = useMemo(() => buildPendingApplications(groups, { includeAlternates: true }), [groups]);
  const applications = includeAlternates ? vendorApplications : locationApplications;
  const markedCount = applications.filter(application => markedGroupKeys.has(application.group.key)).length;
  const categories = useMemo(() => groupPendingMaterials(applications), [applications]);
  const mailGroups = useMemo(() => {
    const listed = new Set(applications.map((application) => application.group.key));
    return groups
      .filter((group) => listed.has(group.key))
      .map((group) => ({ ...group, records: group.records.filter((record) => record.needsApplication || isExplicitMaterialApplication(record.trackingStatus)) }));
  }, [applications, groups]);
  const keyword = query.trim().toLowerCase();
  // One category at a time keeps long BOMs from becoming one endless scroll; the tabs carry the counts.
  const selectedCategory = activeCategory === "marked" || categories.some((category) => category.key === activeCategory) ? activeCategory : "all";
  const visibleCategories = useMemo(() => (
    categories
      .filter((category) => selectedCategory === "all" || selectedCategory === "marked" || category.key === selectedCategory)
      .map((category) => ({ ...category, groups: category.groups.filter(application => (!keyword || application.searchText.includes(keyword)) && (selectedCategory !== "marked" || markedGroupKeys.has(application.group.key))) }))
      .filter((category) => category.groups.length > 0)
  ), [categories, keyword, markedGroupKeys, selectedCategory]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTopRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    if (restoreView) {
      const top = scrollTopRef.current;
      const frame = requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = top;
      });
      return () => cancelAnimationFrame(frame);
    }
    setQuery("");
    setActiveCategory(categories[0]?.key ?? "all");
    scrollTopRef.current = 0;
    // Only re-run when the dialog opens; the category list may change while it is open without resetting the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const priorityCount = categories.filter((category) => category.priority).reduce((sum, category) => sum + category.groups.length, 0);
  const staleThreshold = Date.now() - STALE_PENDING_MS;
  const isStale = (group: MaterialGroup) => getPendingGroupUpdatedAt(group, recordMeta) < staleThreshold;
  const staleCount = applications.filter((application) => isStale(application.group)).length;
  const listedLocations = new Set(applications.map((application) => application.group.key)).size;
  const description = `共 ${applications.length.toLocaleString()} 筆待處理（${listedLocations.toLocaleString()} 組位號） · 含手動料號／SYMBOL申請 · 優先 ${priorityCount.toLocaleString()} 筆 · ${staleCount.toLocaleString()} 筆逾 3 天未更新`;
  const exportRows = visibleCategories.flatMap(category => category.groups.map(application => ({ category: category.label, displayRef: application.displayRef, record: toWorkbookRecord(application.record) })));
  const exportVisible = async () => {
    if (exporting || !exportRows.length) return;
    setExporting(true); setExportError("");
    try {
      await exportPendingMaterialsExcel({ rows: exportRows, workspaceName, exportedBy, scope: [selectedCategory === "all" ? "全部分類" : selectedCategory === "marked" ? "特別標記" : categories.find(category => category.key === selectedCategory)?.label, keyword ? `搜尋：${query.trim()}` : "", includeAlternates ? "含缺料號的替代廠商" : "位號及手動申請"].filter(Boolean).join(" · ") });
    } catch { setExportError("匯出失敗，請重試。資料未被更動。"); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pending-materials-dialog" className="flex max-h-[94vh] w-[min(96vw,1760px)] max-w-[min(96vw,1760px)] flex-col gap-3 overflow-hidden p-5 text-base sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-xl">待處理料</DialogTitle>
          <DialogDescription className="truncate" title={description}>{description}</DialogDescription>
        </DialogHeader>

        <div className="pending-materials-actions flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" data-testid="pending-export-button" disabled={exporting || !exportRows.length} onClick={() => void exportVisible()} className="pending-action--export h-10 px-4 text-sm"><Download className="mr-1.5 h-4 w-4" />{exporting ? "匯出中…" : `匯出表格（${exportRows.length}）`}</Button>
          <Button type="button" data-testid="pending-mail-button" disabled={applications.length === 0} onClick={() => setMailOpen(true)} className="pending-action--mail h-10 px-4 text-sm font-bold" title="把待處理料依廠商整理成信件內容並匯出 HTML"><FileCode2 className="mr-1.5 h-4 w-4" />信件生成</Button>
          <Button type="button" data-testid="pending-suppliers-button" variant="outline" onClick={() => setDirectoryOpen(true)} className="pending-action--suppliers h-10 px-4 text-sm"><Factory className="mr-1.5 h-4 w-4" />供應商聯絡資料</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋位號、料名、MPN、狀態或負責人"
              aria-label="搜尋待處理料"
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            data-testid="pending-include-alternates"
            aria-pressed={includeAlternates}
            aria-describedby="pending-alternates-help"
            onClick={() => setIncludeAlternates((value) => !value)}
            title="同一個位號裡已有廠商有實體或虛擬料號，但其他廠商什麼號碼都沒有時，把那些廠商也列出來"
            className={cn("h-10 gap-2 px-3 text-sm font-bold", includeAlternates ? "border-warning bg-warning/15 text-warning hover:bg-warning/25 hover:text-warning" : "border-border bg-secondary/60 text-foreground hover:bg-accent")}
          >
            <span className={cn("flex h-4 w-4 flex-none items-center justify-center rounded border", includeAlternates ? "border-warning bg-warning text-warning-foreground" : "border-muted-foreground")} aria-hidden="true">{includeAlternates ? <Check className="h-3 w-3" /> : null}</span>
            含缺料號的替代廠商 <span className="text-xs font-normal">勾選後 <strong className="font-mono">{vendorApplications.length.toLocaleString()}</strong> 筆</span>
          </Button>
        </div>
        <p id="pending-alternates-help" className="text-xs leading-5 text-muted-foreground">例：同一位號 A 廠已有料號、B 廠還沒有；勾選後也會列出 B 廠。數字是整份 BOM 的勾選後總筆數（分類／搜尋前），不是新增筆數。</p>
        {(exportError || ownerDirectory.error) && <p role="alert" className="text-sm text-destructive">{exportError || ownerDirectory.error}</p>}
        <PendingMailDialog groups={mailGroups} open={mailOpen} workspaceName={workspaceName} exportedBy={exportedBy} onOpenChange={setMailOpen} />
        <SupplierDirectoryDialog open={directoryOpen} onOpenChange={setDirectoryOpen} />

        <div role="tablist" aria-label="待處理料分類" className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-background/40 p-1">
          {[{ key: "all" as const, label: "全部", count: applications.length, priority: false }, { key: "marked" as const, label: "特別標記", count: markedCount, priority: false }, ...categories.map((category) => ({ key: category.key, label: category.label, count: category.groups.length, priority: category.priority }))].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedCategory === tab.key}
              onClick={() => setActiveCategory(tab.key)}
              title={tab.key === "marked" ? "點每列星號加入或取消；依位號標記，同組替代廠商共用。標記保存在此瀏覽器，依 BOM 分開。" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors",
                selectedCategory === tab.key ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]" : "border-border bg-secondary/60 text-foreground/80 hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.key === "marked" && <Star className="h-4 w-4 fill-current" aria-hidden="true" />}{tab.label}
              {tab.priority && <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />}
              <span className={cn("rounded-full px-1.5 font-mono text-xs leading-4", selectedCategory === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background/60 text-foreground/80")}>{tab.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
        {(query.trim() || includeAlternates || selectedCategory !== "all") && <div className="flex flex-wrap items-center gap-2" aria-label="待處理料作用中條件">
          {query.trim() && <Button type="button" variant="outline" size="sm" aria-label="清除待處理料搜尋條件" onClick={() => setQuery("")}>搜尋：{query.trim()}<X className="ml-1 h-3 w-3" aria-hidden="true" /></Button>}
          {selectedCategory !== "all" && <Button type="button" variant="outline" size="sm" aria-label="清除待處理料分類條件" onClick={() => setActiveCategory("all")}>分類：{selectedCategory === "marked" ? "特別標記" : categories.find(category => category.key === selectedCategory)?.label}<X className="ml-1 h-3 w-3" aria-hidden="true" /></Button>}
          {includeAlternates && <Button type="button" variant="outline" size="sm" aria-label="清除待處理料替代廠商條件" onClick={() => setIncludeAlternates(false)}>含缺料號的替代廠商<X className="ml-1 h-3 w-3" aria-hidden="true" /></Button>}
          <Button type="button" variant="ghost" size="sm" onClick={() => { setQuery(""); setActiveCategory("all"); setIncludeAlternates(false); }}>全部清除</Button>
        </div>}

        <div ref={listRef} onScroll={(event) => { scrollTopRef.current = event.currentTarget.scrollTop; }} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {visibleCategories.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {applications.length === 0 ? "目前沒有待處理的料號" : selectedCategory === "marked" && markedCount === 0 && !keyword ? "尚未特別標記待處理料，請到「全部」點選每列星號" : "目前篩選條件沒有符合的待處理料"}
            </p>
          ) : visibleCategories.flatMap((category) => [
            <div key={`category:${category.key}`} className="flex items-center gap-2 px-1 pt-2 first:pt-0">
              <h3 className="text-xs font-bold text-foreground">{category.label}</h3>
              <span className="text-[11px] text-muted-foreground">{category.hint}</span>
              {category.priority && <span className={cn(CHIP_BASE, "flex-none", CHIP_TONES.danger)}>優先處理</span>}
              <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground">{category.groups.length.toLocaleString()} 筆</span>
            </div>,
            ...category.groups.map((application) => {
              const { group, record } = application;
              const trackingStatus = record.trackingStatus?.trim() || "";
              const stale = isStale(group);
              const marked = markedGroupKeys.has(group.key);
              return (
                <div key={application.key} data-testid="pending-application" className={cn("pending-material-row rounded-lg border bg-background/40 px-2.5 py-1.5 hover:bg-accent/40", stale ? "border-destructive/40" : "border-border")}>
                  <Button type="button" variant="ghost" size="icon" data-testid="pending-mark-toggle" aria-pressed={marked} aria-label={`${marked ? '取消特別標記' : '特別標記'} ${group.displayRef}`} title="標記此位號；同組替代廠商共用，保存在此瀏覽器" onClick={() => onToggleMarked(group.key)} className={cn("pending-row-mark relative h-9 w-8", marked ? "bg-warning/15 text-warning hover:text-warning" : "text-muted-foreground hover:text-warning")}><Star className={cn("h-4 w-4", marked && "fill-current")} aria-hidden="true" />{stale && <span className="material-blink absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />}</Button>
                  <span className="pending-row-reference min-w-0 truncate font-mono text-sm font-semibold text-foreground" title={group.displayRef}>{group.displayRef}</span>
                  <PendingCategoryPicker group={group} disabled={!canEdit} onChange={(next) => onSetCategory(group, next)} />
                  <span className="pending-row-name min-w-0 text-base text-foreground" title={application.name}>{application.name || "未命名料件"}</span>
                  <span className="pending-row-mpn min-w-0 truncate font-mono text-sm text-foreground/75" title={record.manufacturerPartNumber}>{record.manufacturerPartNumber || "未填 MPN"}</span>
                  <span className="pending-row-manufacturer min-w-0 truncate text-xs text-muted-foreground" title={record.manufacturer}>{record.manufacturer || "未填廠商"}</span>
                  <MaterialRequestOwnerPicker record={record} owners={ownerDirectory.owners} disabled={!canEdit} onChange={owner => onSetOwner(record, owner)} />
                  <div className="pending-row-warning" data-testid="pending-stale-slot" aria-hidden={!stale || undefined}>{stale && <span className="pending-stale-badge" role="img" aria-label="逾 3 天未更新" title="這筆待處理料已超過 3 天沒有更新資料"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="pending-stale-label" aria-hidden="true">逾 3 天未更新</span></span>}</div>
                  <div className="pending-row-status">
                    <Button type="button" data-testid="pending-tracking-control" variant="secondary" size="sm" onClick={() => onOpenTracking(record)} className="pending-tracking-button h-10 w-full gap-0 overflow-hidden rounded-lg border border-border p-0 text-xs" aria-label={`追蹤／更新 ${group.displayRef}，目前${trackingStatus || '未處理'}`}>
                      <span data-testid="pending-status-segment" className={cn("inline-flex h-full min-w-0 flex-col items-center justify-center px-2", materialTrackingStatusTone(trackingStatus))}><span className="block w-full truncate" title={trackingStatus || "未處理"}>{trackingStatus || "未處理"}</span>{getMaterialTrackingStatusMeaning(trackingStatus) && <span className="block w-full truncate text-[10px] font-normal" title={getMaterialTrackingStatusMeaning(trackingStatus)}>{getMaterialTrackingStatusMeaning(trackingStatus)}</span>}</span>
                      <span data-testid="pending-update-segment" className="inline-flex h-full min-w-0 items-center justify-center whitespace-nowrap border-l border-border px-1.5">追蹤／更新</span>
                    </Button>
                  </div>
                </div>
              );
            }),
          ])}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MATERIAL_CE_EDITOR_FIELDS = [
  { key: "level", id: "material-level", width: 80 },
  { key: "name", id: "material-name", width: 240 },
  { key: "qty", id: "material-qty", width: 72 },
  { key: "refDes", id: "material-ref-des", width: 180 },
  { key: "manufacturerPartNumber", id: "material-mpn", width: 220 },
  { key: "manufacturer", id: "material-maker", width: 144 },
  { key: "sourcingStatus", id: "material-sourcing", width: 140 },
  { key: "virtualAlternative", id: "material-virtual-alternative", width: 160 },
  { key: "partNumber", id: "material-internal-pn", width: 160 },
  { key: "partName", id: "material-part-name", width: 180 },
  { key: "partSpec", id: "material-spec", width: 200 },
  { key: "schematicPart", id: "material-symbol", width: 160 },
  { key: "pcbFootprint", id: "material-footprint", width: 160 },
  { key: "phaseOutStatus", id: "material-phase-out", width: 120 },
  { key: "partUsageStatus", id: "material-part-usage", width: 200 },
] as const;

export function MaterialRecordDialog({
  canEdit,
  open,
  mode,
  record,
  uploaderName,
  workspaceId,
  initialTab = "details",
  onOpenChange,
  onModeChange,
  onOpenSpec,
  onSave,
  onAddAlternate,
}: {
  canEdit: boolean;
  open: boolean;
  mode: EditorMode;
  record: MaterialWorkbookRecord;
  uploaderName?: string;
  workspaceId: string;
  initialTab?: MaterialEditorTab;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: EditorMode) => void;
  onOpenSpec: (record: Pick<MaterialWorkbookRecord, "specDocument">, download?: boolean) => void;
  onSave: (record: MaterialWorkbookRecord) => Promise<void>;
  /** Opens a blank alternate in this record's group; absent when creating. */
  onAddAlternate?: () => void;
}) {
  const [form, setForm] = useState(() => toWorkbookRecord(record));
  const [trackingDraft, setTrackingDraft] = useState(() => createMaterialTrackingDraft(record));
  const [activeTab, setActiveTab] = useState<MaterialEditorTab>(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const editorScopeRef = useRef("");
  editorScopeRef.current = `${open}:${workspaceId}:${record.id}:${canEdit}`;
  const [isUploadingSpec, setIsUploadingSpec] = useState(false);
  const [isDraggingSpec, setIsDraggingSpec] = useState(false);
  const [specProgress, setSpecProgress] = useState({ completed: 0, total: 0 });
  const [specFailures, setSpecFailures] = useState<Array<{ file: File; error: string }>>([]);
  const specUploadRef = useRef(false);
  const specDragDepthRef = useRef(0);
  const specGenerationRef = useRef(0);
  const specInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const readOnly = mode === "view" || !canEdit;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    specGenerationRef.current += 1;
    specUploadRef.current = false;
    specDragDepthRef.current = 0;
    setIsUploadingSpec(false);
    setIsDraggingSpec(false);
    setSpecFailures([]);
    setSpecProgress({ completed: 0, total: 0 });
  }, [open, workspaceId, record.id, readOnly]);
  const uploadSpecFile = async (files: File[]) => {
    if (!open || !files.length || readOnly || savingRef.current || specUploadRef.current) return;
    const scope = editorScopeRef.current;
    const generation = specGenerationRef.current;
    const isCurrent = () => mountedRef.current && editorScopeRef.current === scope && specGenerationRef.current === generation;
    specUploadRef.current = true;
    setIsUploadingSpec(true);
    setSpecFailures([]);
    setSpecProgress({ completed: 0, total: files.length });
    try {
      const result = await uploadMaterialSpecDocuments({ workspaceId, recordId: form.id, files, uploadedBy: uploaderName,
        onProgress: (completed, total) => { if (isCurrent()) setSpecProgress({ completed, total }); },
      });
      if (!isCurrent()) return;
      if (result.documents.length) setForm(current => withMaterialSpecDocuments(current, [...getMaterialSpecDocuments(current), ...result.documents]));
      setSpecFailures(result.failures);
      toast({ title: result.failures.length ? `已上傳 ${result.documents.length} 份，${result.failures.length} 份失敗` : `SPEC 已上傳 ${result.documents.length} 份`, description: "成功的檔案已加入清單；按「儲存資料與追蹤」保存到料件。", variant: result.failures.length ? "destructive" : undefined });
    } finally {
      if (isCurrent()) { specUploadRef.current = false; setIsUploadingSpec(false); }
    }
  };
  const handleSpecFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    return uploadSpecFile(files);
  };
  useEffect(() => {
    if (!open) return;
    setForm(toWorkbookRecord(record));
    setTrackingDraft(createMaterialTrackingDraft(record));
    setSaveError("");
  }, [open, record]);

  const updateField = (field: keyof MaterialWorkbookRecord, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (readOnly || savingRef.current || specUploadRef.current || !form.name.trim()) return;
    if (!isValidBomUsage(form.qty)) {
      toast({ title: "Qty 是單一產品用量，不能為負數", variant: "destructive" });
      return;
    }
    setSaveError("");
    try {
      const next = applyMaterialTrackingDraft({
        ...form,
        ...(mode === "create" && !form.refGroup.trim() ? { refGroup: form.refDes.trim(), sourceGroupKey: form.sourceGroupKey || form.id } : {}),
        level: 2,
      }, trackingDraft, uploaderName);
      savingRef.current = true;
      setIsSaving(true);
      await onSave(next);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : "資料尚未儲存，請稍後再試。";
      setSaveError(message);
      toast({ title: "資料尚未儲存", description: message, variant: "destructive" });
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  };

  const title = mode === "create" ? "新增料件 / 替代料" : mode === "edit" ? "修改料件資料" : "料件詳細資訊";
  const hasTrackingChanges = Boolean(trackingDraft.status || trackingDraft.note.trim() || trackingDraft.createdBy.trim() || trackingDraft.requestInfo.trim() || trackingDraft.images.length || trackingDraft.pendingImageReads || trackingDraft.requestTicket !== (record.requestTicket ?? "") || trackingDraft.requestUrl !== (record.requestUrl ?? ""));
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(toWorkbookRecord(record)) || hasTrackingChanges;

  return (
    <TooltipProvider delayDuration={160}>
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!savingRef.current) onOpenChange(nextOpen); }}>
      <DialogContent className="material-record-dialog flex flex-col overflow-hidden" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}>
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            <span className={cn(CHIP_BASE, readOnly ? CHIP_TONES.neutral : CHIP_TONES.primary)}>
              {readOnly ? "唯讀" : "編輯中"}
            </span>
          </div>
          <DialogDescription>
            依 CE Excel 順序排列全部 15 個欄位；<span className="text-destructive">*</span> 為必填。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MaterialEditorTab)} className="material-record-tabs flex min-h-0 min-w-0 flex-1 flex-col">
          <TabsList className="h-12 w-full shrink-0 justify-start">
            <TabsTrigger value="details" className="h-10">料件資料</TabsTrigger>
            <TabsTrigger value="tracking" className="h-10">狀態追蹤{hasTrackingChanges ? " · 未儲存" : ""}</TabsTrigger>
          </TabsList>
          <div className="material-record-scroll min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="details" forceMount className="flex flex-col gap-4 data-[state=inactive]:hidden">
          <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-4">
        <section className="workspace-dialog-section material-ce-section min-w-0 rounded-xl">
          <h3 id="material-ce-grid-title" className="mb-3 text-sm font-semibold">CE Excel 欄位 · 依交付格式順序</h3>
          <div className="material-ce-table-scroll" role="region" aria-labelledby="material-ce-grid-title" tabIndex={0}>
            <table className="material-ce-table" style={{ width: MATERIAL_CE_EDITOR_FIELDS.reduce((sum, field) => sum + field.width, 0) }}>
              <colgroup>{MATERIAL_CE_EDITOR_FIELDS.map(field => <col key={field.key} style={{ width: field.width }} />)}</colgroup>
              <thead><tr>{MATERIAL_CE_EDITOR_FIELDS.map((field, index) => <th key={field.key} scope="col"><MaterialFieldLabel field={field.key} htmlFor={field.id} label={MATERIAL_CE_FIELDS[index].header} required={field.key === "name"} /></th>)}</tr></thead>
              <tbody><tr>{MATERIAL_CE_EDITOR_FIELDS.map((field, index) => <td key={field.key} data-testid="material-ce-field">
                {field.key === "level" || field.key === "qty" ? (
                  <Input id={field.id} disabled={readOnly} readOnly={field.key === "level"} value={field.key === "level" ? "2" : String(form[field.key] ?? "")} onChange={event => updateField(field.key, event.target.value)} inputMode={field.key === "qty" ? "decimal" : undefined} className="material-ce-control" />
                ) : (
                  <Textarea id={field.id} disabled={readOnly} value={String(form[field.key] ?? "")} onChange={event => updateField(field.key, event.target.value)} rows={2} placeholder={MATERIAL_CE_FIELDS[index].meaning} className={cn("material-ce-control", (field.key === "virtualAlternative" || field.key === "partNumber") && "material-pn-input", field.key === "partNumber" && !form.partNumber.trim() && "material-pn-missing")} />
                )}
                {field.key === "partUsageStatus" && (record as Partial<MaterialRecord>).partUsageStatusSource === "legacy-tracking" && <p className="text-xs text-muted-foreground">取自舊格式匯入追蹤原文；原追蹤保留。</p>}
              </td>)}</tr></tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">全部 15 欄維持同一排，可左右捲動檢視及編輯。</p>
        </section>

        <section
          aria-label="SPEC 檔案區"
          aria-busy={isUploadingSpec}
          data-testid="material-spec-dropzone"
          data-drag-active={isDraggingSpec}
          className="workspace-dialog-section material-spec-section rounded-xl"
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            specDragDepthRef.current += 1;
            if (!readOnly && !isSaving && !isUploadingSpec) setIsDraggingSpec(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = readOnly || isSaving || isUploadingSpec ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            specDragDepthRef.current = Math.max(0, specDragDepthRef.current - 1);
            if (!specDragDepthRef.current) setIsDraggingSpec(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            specDragDepthRef.current = 0;
            setIsDraggingSpec(false);
            if (readOnly || isSaving || isUploadingSpec) return;
            if (Array.from(event.dataTransfer.items ?? []).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
              toast({ title: "請拖入文件，而不是資料夾", description: "請開啟資料夾，選取裡面的檔案一起拖入；不必壓縮。", variant: "destructive" });
              return;
            }
            void uploadSpecFile(Array.from(event.dataTransfer.files));
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">SPEC 文件</h3>
            <input ref={specInputRef} type="file" accept={MATERIAL_SPEC_ACCEPT} multiple className="hidden" onChange={(event) => void handleSpecFile(event)} />
            {!readOnly && <Button type="button" variant="secondary" disabled={isSaving || isUploadingSpec} onClick={() => specInputRef.current?.click()} className="h-11"><Upload data-icon="inline-start" />{isUploadingSpec ? `上傳中 ${specProgress.completed}/${specProgress.total}` : "新增 SPEC 檔案"}</Button>}
          </div>
          <div data-testid="material-spec-document" className="material-spec-files mt-3" aria-live="polite">
            {getMaterialSpecDocuments(form).map(document => <div className="material-spec-file" key={document.path}>
              <button type="button" className="material-spec-file-open" onClick={() => onOpenSpec({ specDocument: document })} aria-label={`開啟 ${document.name}`}>
                <FileText className="material-spec-file-icon" aria-hidden="true" />
                <span className="material-spec-file-copy"><strong>{document.name}</strong><span>{formatMaterialSpecSize(document.size)} · {document.uploadedBy || "未提供上傳人"}</span></span>
              </button>
              <div className="flex w-full justify-end gap-1 border-t border-border pt-2">
                <Button type="button" variant="outline" size="sm" className="h-9" aria-label={`下載 SPEC ${document.name}`} onClick={() => onOpenSpec({ specDocument: document }, true)}><Download data-icon="inline-start" />下載</Button>
                {!readOnly && <Button type="button" variant="ghost" size="sm" className="h-9" aria-label={`移除 ${document.name}`} disabled={isSaving || isUploadingSpec} onClick={() => setForm(current => withMaterialSpecDocuments(current, getMaterialSpecDocuments(current).filter(item => item.path !== document.path)))}>移除關聯</Button>}
              </div>
            </div>)}
            {getMaterialSpecDocuments(form).length === 0 && <div className="material-spec-empty"><Upload aria-hidden="true" /><span>{readOnly ? "尚未上傳 SPEC" : isDraggingSpec ? "放開滑鼠以上傳所有檔案" : "將多個檔案一起拖放到這裡，或按「新增 SPEC 檔案」"}</span></div>}
          </div>
          {isUploadingSpec && <p role="status" className="mt-2 text-sm">上傳進度 {specProgress.completed}／{specProgress.total}，完成後即可儲存。</p>}
          {specFailures.length > 0 && <div role="alert" className="mt-3 space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"><p>以下檔案未上傳，其他成功檔案已保留：</p><ul className="list-inside list-disc">{specFailures.map((failure, index) => <li key={`${failure.file.name}:${index}`}>{failure.file.name}：{failure.error}</li>)}</ul><Button type="button" variant="outline" size="sm" disabled={readOnly || isSaving || isUploadingSpec} onClick={() => void uploadSpecFile(specFailures.map(failure => failure.file))}>重試失敗檔案</Button></div>}
          {!readOnly && <p className="mt-3 text-xs text-muted-foreground">可一次拖入 10 份以上，不需壓縮。支援 GLB、GLTF、STP、STEP、STL、DWG、DXF、PDF、Office、圖片等；單檔上限 {formatMaterialSpecSize(MATERIAL_SPEC_MAX_BYTES)}。新增檔案會加入清單，不會取代舊檔。</p>}
          {!readOnly && JSON.stringify(getMaterialSpecDocuments(form)) !== JSON.stringify(getMaterialSpecDocuments(record)) && <p className="mt-2 text-xs text-warning">附件清單尚未儲存，請按「儲存資料與追蹤」。</p>}
        </section>

          </fieldset>
          </TabsContent>
          <TabsContent value="tracking" forceMount className="data-[state=inactive]:hidden">
            <section className="workspace-dialog-section workspace-dialog-section--teal rounded-2xl p-4">
              <MaterialTrackingEditor record={form} draft={trackingDraft} onDraftChange={setTrackingDraft} disabled={readOnly || isSaving} defaultAuthor={uploaderName} />
            </section>
          </TabsContent>
          </div>
        </Tabs>

        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter data-testid="material-record-save-footer" className="shrink-0 gap-2 border-t border-border pt-3">
          {onAddAlternate && mode !== "create" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="material-add-alternate"
              disabled={!canEdit || isSaving || isUploadingSpec || hasUnsavedChanges}
              title={hasUnsavedChanges ? "先儲存或取消目前的修改，再新增替代料" : "在同一組位號下新增另一家廠商的替代料"}
              onClick={onAddAlternate}
              className="h-11 sm:mr-auto"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />新增替代料
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-11" disabled={isSaving} onClick={() => onOpenChange(false)}>
            {readOnly ? "關閉" : "取消"}
          </Button>
          {readOnly ? (
            <Button type="button" size="sm" className="h-11" disabled={!canEdit} onClick={() => onModeChange("edit")}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />修改這筆
            </Button>
          ) : (
            <Button type="button" size="sm" className="h-11" onClick={() => void handleSave()} disabled={isSaving || isUploadingSpec || trackingDraft.pendingImageReads > 0 || !form.name.trim()}>
              {isSaving ? "儲存中…" : "儲存資料與追蹤"}
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
  copy: (value: string) => void;
  openCreate: (group: MaterialGroup) => void;
  openTracking: (record: MaterialRecord) => void;
  openSpec: (record: MaterialRecord) => void;
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

// White-based grid lines stay visible on every custom row colour; the old blue 10% vanished on green rows.
const MATERIAL_CELL_CLASS = "border-r border-white/20 px-2 py-1.5 align-middle";

const stopRowToggle = (event: { stopPropagation: () => void }) => event.stopPropagation();

const MaterialGroupRow = memo(function MaterialGroupRow({
  row,
  itemValue,
  expanded,
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
  editingNames: string;
  latestRecordUpdate: string;
  latestUpdater: string;
  colorTheme: BomTableColorTheme;
  columns: MaterialColumnVisibility;
  actions: MaterialRowActions;
}) {
  const { group, matchingRecords, primaryAlternative, virtualAlternativeRecord, secondaryAlternatives } = row;
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
  // The main row shows the same Excel columns as the CE workbook, read from the
  // first matching record of the group (the alternatives expand below it).
  const statusRecord = primaryAlternative ?? group.primaryRecord;
  const partSpec = statusRecord.partSpec || group.partSpec || "";
  const valueClassName = primaryReady ? "text-emerald-100" : mustApply ? "text-amber-100" : "text-cyan-100";
  const iconClassName = primaryReady ? "text-emerald-300" : mustApply ? "text-amber-300" : "text-cyan-300";
  const mainRowStyle = buildTableRowStyle(colorTheme.primary, {
    backgroundAlpha: mustApply ? 0.56 : primaryReady ? 0.52 : 0.48,
    hoverAlpha: mustApply ? 0.64 : primaryReady ? 0.6 : 0.56,
    accentAlpha: 0.95,
  });
  const updateTitle = latestRecordUpdate
    ? `最後修改：${latestUpdater ? `${latestUpdater} · ` : ""}${formatTimestamp(latestRecordUpdate)}`
    : "修改這列的料件資料（廠商、MPN、實體料號、備註）";
  const expandLabel = hasAlternatives ? `${expanded ? "收合" : "展開"} ${secondaryAlternatives.length} 筆替代料` : "沒有替代料";

  return (
    <tbody>
      <tr
        data-material-kind="primary"
        onClick={() => hasAlternatives && actions.toggleExpanded(group.key)}
        style={mainRowStyle}
        className={cn(
          "group/material-row border-b border-white/20 text-slate-200 transition-colors",
          hasAlternatives ? "cursor-pointer" : "cursor-default",
          "bg-[var(--material-row-solid)] hover:bg-[var(--material-row-hover-solid)]",
        )}
      >
        {columns.item && (
          <td data-material-cell="item" className={cn(MATERIAL_CELL_CLASS, "text-center font-mono text-[13px] font-black text-slate-100")}>
            {itemValue}
          </td>
        )}
        {columns.name && (
          <td data-material-cell="name" className="relative overflow-hidden border-r border-blue-400/10 px-2 py-1.5">
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
              <MaterialApplicationExemptionBadge record={statusRecord} />
            </div>
          </td>
        )}
        {columns.qty && (
          <td data-material-cell="qty" className={cn(MATERIAL_CELL_CLASS, "text-center font-mono text-[13px] font-bold text-slate-100")}>
            {group.qty}
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
                title={primaryMpn ? `複製 MPN：${primaryMpn}` : "尚未填 MPN"}
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
        {columns.manufacturer && (
          <td data-material-cell="manufacturer" className={MATERIAL_CELL_CLASS}>
            <MaterialSourceText value={statusRecord.manufacturer} label="Manufacturer" />
          </td>
        )}
        {columns.sourcingStatus && (
          <td data-material-cell="sourcingStatus" className={MATERIAL_CELL_CLASS}>
            <MaterialSourceText value={statusRecord.sourcingStatus} label="Sourcing Status" chip />
          </td>
        )}
        {columns.virtual && (
          <td data-material-cell="virtual" className={MATERIAL_CELL_CLASS} onClick={stopRowToggle}>
            {virtualAlternativeRecord && (
              <VirtualAlternativeValue value={virtualAlternativeRecord.virtualAlternative ?? ""} onCopy={actions.copy} />
            )}
          </td>
        )}
        {columns.physical && (
          <td data-material-cell="physical" className={MATERIAL_CELL_CLASS}>
            {primaryAlternative?.partNumber ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.copy(primaryAlternative.partNumber);
                }}
                className="group flex w-full min-w-0 items-center gap-1.5 text-left"
                title={`複製實體料號：${primaryAlternative.partNumber}`}
              >
                <span className={cn("min-w-0 truncate font-mono text-[13px] font-black leading-5", valueClassName)}>{primaryAlternative.partNumber}</span>
                <Copy className={cn("h-3.5 w-3.5 flex-none opacity-60 group-hover:opacity-100", iconClassName)} />
              </button>
            ) : (
              <span className={cn("text-xs font-semibold leading-5", isMeManufacturedRecord(statusRecord) ? 'text-primary' : 'text-amber-300')}>{isMeManufacturedRecord(statusRecord) ? ME_APPLICATION_EXEMPTION_LABEL : '實體料號未提供'}</span>
            )}
          </td>
        )}
        {columns.partName && (
          <td data-material-cell="partName" className={MATERIAL_CELL_CLASS}>
            <MaterialSourceText value={statusRecord.partName} label="Part Name" />
          </td>
        )}
        {columns.partSpec && (
          <td data-material-cell="partSpec" className={MATERIAL_CELL_CLASS}>
            <div className="flex min-w-0 items-center gap-1">
              <MaterialSourceText value={partSpec} label="Part Spec" />
              {getMaterialSpecDocuments(statusRecord).length > 0 && (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); actions.openSpec(statusRecord); }}
                  title={`開啟 ${getMaterialSpecDocuments(statusRecord).length} 份 SPEC：${getMaterialSpecDocuments(statusRecord).map(document => document.name).join("、")}`}
                  aria-label={`開啟 ${getMaterialSpecDocuments(statusRecord).length} 份 SPEC`}
                  className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md border border-primary/35 bg-primary/15 text-primary hover:bg-primary/25"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </td>
        )}
        {columns.schematicPart && (
          <td data-material-cell="schematicPart" className={MATERIAL_CELL_CLASS}>
            <MaterialSourceText value={statusRecord.schematicPart} label="Schematic_Part" mono />
          </td>
        )}
        {columns.footprint && (
          <td data-material-cell="footprint" className={MATERIAL_CELL_CLASS}>
            <MaterialSourceText value={statusRecord.pcbFootprint} label="PCB_Footprint" mono />
          </td>
        )}
        {columns.phaseOut && (
          <td data-material-cell="phaseOut" className={MATERIAL_CELL_CLASS}><PhaseOutStatus record={statusRecord} /></td>
        )}
        {columns.partUsage && (
          <td data-material-cell="partUsage" className={MATERIAL_CELL_CLASS}>
            <PartUsageStatus record={statusRecord} />
          </td>
        )}
        {columns.actions && (
          <td
            data-material-cell="actions"
            className={cn(MATERIAL_STICKY_COLUMN_CLASSES.row, "px-2 py-1.5")}
            data-testid="material-data-update-cell"
            onClick={stopRowToggle}
          >
            <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-primary/30 bg-primary/5" data-testid="material-tracking-update-control" title={updateTitle}>
              <div className="min-w-0 flex-1" data-material-cell="tracking">
                <TrackingHistoryCell record={statusRecord} onOpen={actions.openTracking} embedded />
              </div>
            </div>
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
          group={group}
          records={matchingRecords}
          primaryRecord={primaryAlternative}
          itemValue={itemValue}
          colorTheme={colorTheme}
          columns={columns}
          onCopy={actions.copy}
          onOpenTracking={actions.openTracking}
        />
      )}
    </tbody>
  );
});

function CompactAlternativeRows({
  group,
  records,
  primaryRecord,
  itemValue,
  colorTheme,
  columns,
  onCopy,
  onOpenTracking,
}: {
  group: MaterialGroup;
  records: MaterialRecord[];
  primaryRecord: MaterialRecord;
  itemValue: number;
  colorTheme: BomTableColorTheme;
  columns: MaterialColumnVisibility;
  onCopy: (value: string) => void;
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
            data-material-kind="alternative"
            style={rowStyle}
            className={cn(
              "group/material-row border-b border-white/15 text-slate-200 transition-colors",
              "bg-[var(--material-row-solid)] hover:bg-[var(--material-row-hover-solid)]"
            )}
          >
            {columns.item && (
              <td className={MATERIAL_CELL_CLASS} aria-label={`主料 ${itemValue} 的替代料 ${index + 1}`} />
            )}
            {columns.name && (
              <td className={MATERIAL_CELL_CLASS}>
                <div className="flex min-w-0 items-center gap-2 pl-4">
                  <span
                    className={cn("flex h-6 min-w-6 flex-none items-center justify-center rounded-md px-1 font-mono text-[11px] font-black", preferred ? "text-slate-950" : "text-slate-100")}
                    style={{ backgroundColor: preferred ? withAlpha(colorTheme.alternative, 0.92) : withAlpha(colorTheme.secondary, 0.46) }}
                    title={`替代料 #${index + 1}`}
                  >
                    #{index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-300" title={record.name || group.name}>{record.name || group.name || "未命名料件"}</span>
                  <MaterialApplicationExemptionBadge record={record} />
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
            {columns.qty && (
              <td className={cn(MATERIAL_CELL_CLASS, "text-center font-mono text-[13px] text-slate-300")}>{record.qty || group.qty}</td>
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
            {columns.manufacturer && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.manufacturer} label="Manufacturer" /></td>
            )}
            {columns.sourcingStatus && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.sourcingStatus} label="Sourcing Status" chip /></td>
            )}
            {columns.virtual && (
              <td className={MATERIAL_CELL_CLASS}>
                <VirtualAlternativeValue value={record.virtualAlternative ?? ""} onCopy={onCopy} />
              </td>
            )}
            {columns.physical && (
              <td className={MATERIAL_CELL_CLASS}>
                {record.partNumber ? (
                  <button type="button" onClick={() => onCopy(record.partNumber)} className="group flex w-full min-w-0 items-center gap-1.5 text-left" title={`複製實體料號：${record.partNumber}`}>
                    <span className="min-w-0 truncate font-mono text-[13px] font-black leading-5 text-cyan-200">{record.partNumber}</span>
                    <Copy className="h-3.5 w-3.5 flex-none text-cyan-300 opacity-60 group-hover:opacity-100" />
                  </button>
                ) : (
                  <span className={cn("text-xs font-bold leading-5", isMeManufacturedRecord(record) ? 'text-primary' : 'text-amber-300')}>{isMeManufacturedRecord(record) ? ME_APPLICATION_EXEMPTION_LABEL : '實體料號未提供'}</span>
                )}
              </td>
            )}
            {columns.partName && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.partName} label="Part Name" /></td>
            )}
            {columns.partSpec && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.partSpec || group.partSpec} label="Part Spec" /></td>
            )}
            {columns.schematicPart && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.schematicPart} label="Schematic_Part" mono /></td>
            )}
            {columns.footprint && (
              <td className={MATERIAL_CELL_CLASS}><MaterialSourceText value={record.pcbFootprint} label="PCB_Footprint" mono /></td>
            )}
            {columns.phaseOut && (
              <td className={MATERIAL_CELL_CLASS}><PhaseOutStatus record={record} /></td>
            )}
            {columns.partUsage && (
              <td className={MATERIAL_CELL_CLASS}><PartUsageStatus record={record} /></td>
            )}
            {columns.actions && (
              <td className={cn(MATERIAL_STICKY_COLUMN_CLASSES.row, "px-2 py-1.5")} onClick={stopRowToggle}>
                <div className="min-w-0 overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
                  <TrackingHistoryCell record={record} onOpen={onOpenTracking} embedded />
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </>
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
      <DialogContent className="max-w-3xl gap-4 p-5 text-base sm:p-7">
        <DialogHeader>
          <DialogTitle>匯出主管報表</DialogTitle>
          <DialogDescription>
            三種格式用同一份固定查詢結果，匯出期間不會重新查詢或改動原始資料。
          </DialogDescription>
        </DialogHeader>

        {snapshot ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-background/40 text-center">
              {[
                ["原始主料", snapshot.originalGroupCount],
                ["篩選後主料", snapshot.filteredGroupCount],
                ["匯出明細", snapshot.rows.length],
              ].map(([label, value]) => (
                <div key={label} className="px-3 py-2.5">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-lg font-semibold text-foreground">{Number(value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>

            <dl className="space-y-1.5 rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted-foreground">BOM</dt><dd className="min-w-0 truncate text-foreground" title={snapshot.workspaceName}>{snapshot.workspaceName}</dd></div>
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted-foreground">匯出人</dt><dd className="min-w-0 truncate text-foreground">{snapshot.exportedBy} · {formatTimestamp(snapshot.dataAsOf)}</dd></div>
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted-foreground">範圍</dt><dd className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="text-foreground">{snapshot.scopeLabel}</span>{(snapshot.filterSummary.length > 0 ? snapshot.filterSummary : ["全部資料"]).map((filter) => (
                <span key={filter} className={cn(CHIP_BASE, CHIP_TONES.neutral)}>{filter}</span>
              ))}</dd></div>
            </dl>

            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              {activeFormat && <RotateCcw className="h-3.5 w-3.5 animate-spin text-primary" />}
              {progressLabel}
            </p>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" disabled={Boolean(activeFormat)} onClick={() => onExport("excel")} className="h-10">
                <FileSpreadsheet className="mr-2 h-4 w-4" />{activeFormat === "excel" ? "產生中" : "Excel"}
              </Button>
              <Button type="button" variant="secondary" disabled={Boolean(activeFormat)} onClick={() => onExport("html")} className="h-10">
                <FileCode2 className="mr-2 h-4 w-4" />{activeFormat === "html" ? "產生中" : "HTML"}
              </Button>
              <Button type="button" variant="secondary" disabled={Boolean(activeFormat)} onClick={() => onExport("zip")} className="h-10">
                <FileArchive className="mr-2 h-4 w-4" />{activeFormat === "zip" ? "封裝中" : "HTML + 圖片 ZIP"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">尚未建立報表快照。</p>
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
  const [searchColumn, setSearchColumn] = useState<ColumnFilterKey | "all">("all");
  const [columnFilters, setColumnFilters] = useState<MaterialColumnFilters>(EMPTY_COLUMN_FILTERS);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [bomManagerOpen, setBomManagerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ title: string; description: string; workspaceIds: string[] } | null>(null);
  const [pendingCurrent, setPendingCurrent] = useState<{ version: BomSeriesVersion; series: BomSeries } | null>(null);
  const [carryOnSwitch, setCarryOnSwitch] = useState(true);
  const [pendingUploads, setPendingUploads] = useState<PendingBomUpload[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const uploadTargetSeriesRef = useRef<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  // Set while an editor opened from 待處理料 is showing, so closing it returns to the list.
  const [returnToPending, setReturnToPending] = useState(false);
  const [pendingRestoreView, setPendingRestoreView] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [editorRecord, setEditorRecord] = useState<MaterialWorkbookRecord>(createRecordTemplate());
  const [editorInitialTab, setEditorInitialTab] = useState<MaterialEditorTab>("details");
  const [editorSession, setEditorSession] = useState(0);
  const [editorContext, setEditorContext] = useState<{ workspaceId: string; accountId?: string; recordMeta?: BomRecordSyncMeta } | null>(null);
  useEffect(() => {
    if (!returnToPending || editorOpen) return;
    setReturnToPending(false);
    setPendingRestoreView(true);
    setPendingDialogOpen(true);
  }, [editorOpen, returnToPending]);
  const openPendingDialog = () => {
    setReturnToPending(false);
    setPendingRestoreView(false);
    setPendingDialogOpen(true);
  };
  const [pageTrackerDialogOpen, setPageTrackerDialogOpen] = useState(false);
  const [pageTrackerWorkspaceId, setPageTrackerWorkspaceId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [workspaceListSettled, setWorkspaceListSettled] = useState(false);
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
  const recentLocalWorkspaceWritesRef = useRef(new Map<string, number>());
  const loadedViewStateKeyRef = useRef("");
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();
  const { user } = useUser();
  useEffect(() => {
    setEditorOpen(false);
    setReturnToPending(false);
    setPendingDialogOpen(false);
  }, [activeBomId, user?.userId]);
  const { canEditModule } = usePermissions();
  const canEditModuleAccess = canEditModule("material-requests");
  // Versions of one board form a series; only the series' current version accepts record edits.
  const seriesList = useMemo(() => buildBomSeriesList(bomWorkspaces), [bomWorkspaces]);
  const activeVersionInfo = useMemo(() => findBomSeriesByWorkspace(seriesList, activeBomId), [seriesList, activeBomId]);
  const isHistoricalVersion = Boolean(activeVersionInfo && !activeVersionInfo.version.isCurrent);
  const canEdit = canEditModuleAccess && !isHistoricalVersion;
  const { activeProject, activeProjectId, allProjects, projects } = useTestProject();
  const projectNames = useMemo(() => new Map(allProjects.map((project) => [project.id, project.name])), [allProjects]);
  const {capture: captureBomWrite, isCurrent: isBomWriteCurrent, assertCurrent: assertBomWriteCurrent}
    = useWorkspaceMutationScope(user?.userId ?? null, canEditModuleAccess);
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
  const activeSeriesName = activeVersionInfo?.series.name ?? activeWorkspace.name;
  const activeWorkspaceProjectLabel = activeWorkspace.project
    ? projectNames.get(activeWorkspace.project.projectId) ?? activeWorkspace.project.projectName
    : "";
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

  // Project assignments regroup every BOM, so another client's change only needs the project map, not a full reload.
  const refreshBomProjects = useCallback(async () => {
    const generation = bomAccountRef.current.generation;
    try {
      const [projectByWorkspace, archiveByWorkspace, versionByWorkspace] = await Promise.all([loadBomWorkspaceProjects(), loadBomWorkspaceArchives(), loadBomWorkspaceVersions()]);
      if (generation !== bomAccountRef.current.generation) return;
      setBomWorkspaces((current) => current.map((workspace) => {
        const project = projectByWorkspace.get(workspace.id);
        const archive = archiveByWorkspace.get(workspace.id);
        const version = versionByWorkspace.get(workspace.id);
        const sameProject = project?.projectId === workspace.project?.projectId && project?.projectName === workspace.project?.projectName;
        const sameArchive = archive?.archivedAt === workspace.archive?.archivedAt;
        const sameVersion = JSON.stringify(version ?? null) === JSON.stringify(workspace.version ?? null);
        return sameProject && sameArchive && sameVersion ? workspace : { ...workspace, project, archive, version };
      }));
    } catch { /* keep the current grouping until the next full reload */ }
  }, []);

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
      const applyResult = () => {
        applyLoadedWorkspaces(result.workspaces, preferredBomId);
        setWorkspaceListSettled(true);
      };
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
      const now = Date.now();
      if (change.recordIds.length === 0 && change.workspaceIds.length > 0) void refreshBomProjects();
      if (!change.workspaceIds.includes(activeBomIdRef.current)) return;

      const externalRecordIds = change.recordIds.filter((recordId) => {
        const localTimestamp = recentLocalRecordIdsRef.current.get(recordId) ?? 0;
        return now - localTimestamp > 5000;
      });
      if (externalRecordIds.length > 0) {
        setPendingRemoteRecordIds((current) => Array.from(new Set([...current, ...externalRecordIds])));
      }
      const localWorkspaceWriteAt = recentLocalWorkspaceWritesRef.current.get(activeBomIdRef.current) ?? 0;
      if (change.recordIds.length === 0 && now - localWorkspaceWriteAt > 5000) {
        setHasPendingWorkspaceUpdate(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyLoadedWorkspaces, refreshBomProjects, reloadBomWorkspaces]);

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
          searchColumn: ColumnFilterKey | "all";
          sortMode: SortMode;
        }>;
        const restoredQuery = typeof parsed.query === "string" ? parsed.query : "";
        setQuery(restoredQuery);
        setSearchDraft(restoredQuery);
        setSearchColumn(parsed.searchColumn && FILTER_KEYS.includes(parsed.searchColumn as ColumnFilterKey) ? parsed.searchColumn : "all");
        if (parsed.columnFilters && typeof parsed.columnFilters === "object") {
          const restoredFilters = { ...EMPTY_COLUMN_FILTERS };
          for (const key of FILTER_KEYS) {
            const values = parsed.columnFilters[key];
            const validValues = Array.isArray(values)
              ? values.filter((value) => typeof value === "string")
              : [];
            restoredFilters[key] = Array.isArray(values) && (values.length === 0 || validValues.length > 0) ? validValues : null;
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
          searchColumn,
          sortMode,
        }));
      } catch {
        // View preferences are optional; shared BOM data is unaffected.
      }
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [activeBomId, availability, columnFilters, page, pageSize, query, searchColumn, sortMode, user?.userId]);

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
  const activeSeriesList = useMemo(() => seriesList.filter((series) => !series.archive), [seriesList]);
  const bomSeriesGroups = useMemo(
    () => groupBomWorkspacesByProject(activeSeriesList, { activeProjectId, activeProjectName: activeProject?.name, projectNames }),
    [activeSeriesList, activeProject?.name, activeProjectId, projectNames],
  );

  // Switching the global project pulls the BOM switcher along: once the remote
  // BOM list has settled (the final apply re-asserts the remembered BOM, so an
  // earlier jump would be undone) and the project differs from the one the
  // current BOM was picked under, jump to that project's most recent BOM.
  // Manual picks of another project's BOM stay put because they happen under
  // the same project.
  const switchActiveBomRef = useRef<(value: string) => void>(() => {});
  useEffect(() => {
    if (!activeProjectId || !workspaceListSettled) return;
    let pickedUnderProjectId: string | null = null;
    try { pickedUnderProjectId = window.localStorage.getItem(ACTIVE_BOM_PROJECT_KEY); } catch { /* storage unavailable */ }
    if (pickedUnderProjectId === activeProjectId) return;
    try { window.localStorage.setItem(ACTIVE_BOM_PROJECT_KEY, activeProjectId); } catch { /* storage unavailable */ }
    if (!pickedUnderProjectId) return;
    const current = bomWorkspaces.find((workspace) => workspace.id === activeBomId);
    if (current?.project?.projectId === activeProjectId) return;
    const target = orderedBomWorkspaces.find((workspace) => !workspace.archive && workspace.project?.projectId === activeProjectId);
    if (target && target.id !== activeBomId) switchActiveBomRef.current(target.id);
  }, [activeBomId, activeProjectId, bomWorkspaces, orderedBomWorkspaces, workspaceListSettled]);

  const searchTokens = useMemo(() => parseSearchTokens(deferredQuery), [deferredQuery]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((values) => values != null);

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
        const applicationSearchText = group.records.every(isMeManufacturedRecord)
          ? ME_APPLICATION_EXEMPTION_LABEL
          : mustApply
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
          qty: createCachedColumnValues([String(group.qty ?? "")]),
          manufacturer: createCachedColumnValues([record.manufacturer]),
          sourcingStatus: createCachedColumnValues([record.sourcingStatus]),
          partName: createCachedColumnValues([record.partName]),
          partSpec: createCachedColumnValues([record.partSpec]),
          schematicPart: createCachedColumnValues([record.schematicPart]),
          footprint: createCachedColumnValues([record.pcbFootprint]),
          phaseOut: createCachedColumnValues([record.phaseOutStatus ?? ""]),
          partUsage: createCachedColumnValues([record.partUsageStatus ?? ""]),
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

  const matchesRecordSearch = useCallback((record: MaterialRecord, group: MaterialGroup) => {
    if (searchColumn === "all" || searchTokens.length === 0) return true;
    const values = searchColumn === "material" ? [record.name] : getRecordColumnValues(record, group, searchColumn);
    return searchTokens.every(token => values.some(value => searchColumn === "refDes"
      ? matchesMaterialReference(value, token)
      : normalizeMaterialSearchText(value).includes(token)));
  }, [searchColumn, searchTokens]);

  const matchesSearch = useCallback((group: MaterialGroup) => {
    if (searchTokens.length === 0) return true;
    if (searchColumn !== "all") return group.records.some(record => matchesRecordSearch(record, group));
    const searchableText = groupRuntimeIndex.searchableTextByGroup.get(group.key) ?? group.searchText;
    const refTokens = groupRuntimeIndex.refTokensByGroup.get(group.key) ?? [];

    return searchTokens.every((token) => {
      if (isMaterialReferenceQuery(token)) return refTokens.some(ref => matchesMaterialReference(ref, token)) || matchesMaterialReference(searchableText, token);
      const shouldMatchRefPrefix = (
        token.length === 1
        || /\d/.test(token)
      ) && groupRuntimeIndex.refPrefixes.has(token);

      return shouldMatchRefPrefix
        ? refTokens.some((refToken) => refToken.startsWith(token))
        : searchableText.includes(token);
    });
  }, [groupRuntimeIndex, matchesRecordSearch, searchColumn, searchTokens]);

  const matchesAvailability = useCallback((group: MaterialGroup) => {
    const noAlternative = (groupRuntimeIndex.uniqueMpnCountByGroup.get(group.key) ?? 0) <= 1;
    const mustApply = requiresApplication(group);

    return (
      availability === "all" ||
      (availability === "usable" && group.records.some(hasMaterialPartNumber)) ||
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
    const searchedRecords = searchColumn === "all" ? sortedRecords : sortedRecords.filter(record => matchesRecordSearch(record, group));
    if (!hasActiveColumnFilters) return searchedRecords;

    return searchedRecords.filter((record) =>
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
  }, [columnFilterSets, groupRuntimeIndex, hasActiveColumnFilters, matchesRecordSearch, searchColumn]);

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
    if (searchColumn !== "all") chips.push({ key: "searchColumn", label: `搜尋篩選工具：${COLUMN_FILTER_LABELS[searchColumn]}` });
    if (availability !== "all") {
      chips.push({ key: "availability", label: `狀態：${AVAILABILITY_FILTER_LABELS[availability]}` });
    }
    if (showMarkedOnly) chips.push({ key: "marked", label: "僅顯示我的標記" });

    FILTER_KEYS.forEach((key) => {
      const values = columnFilters[key];
      if (values == null) return;
      const preview = values.slice(0, 2).join("、");
      const remainder = values.length > 2 ? ` 等 ${values.length} 項` : "";
      chips.push({ key: `column:${key}`, label: `${COLUMN_FILTER_LABELS[key]}：${values.length ? `${preview}${remainder}` : "未選任何值"}` });
    });

    return chips;
  }, [availability, columnFilters, query, searchColumn, showMarkedOnly]);

  const totalPages = isFullDatasetLoaded
    ? Math.max(1, Math.ceil(filteredGroups.length / pageSize))
    : 1;
  const noAlternativeCount = useMemo(
    () => dataset.groups.filter(hasNoAlternative).length,
    [dataset.groups]
  );
  const usableGroupCount = useMemo(
    () => dataset.groups.filter((group) => group.records.some(hasMaterialPartNumber)).length,
    [dataset.groups]
  );
  const pendingMaterialGroups = useMemo(() => dataset.groups.filter((group) => group.records.some((record) => record.needsApplication || isExplicitMaterialApplication(record.trackingStatus))), [dataset.groups]);
  const discouragedMaterialRows = useMemo(() => collectDiscouragedMaterialRows(dataset.records), [dataset.records]);
  const excludedDiscouragedCount = useMemo(() => countExcludedDiscouragedRows(dataset.records), [dataset.records]);
  const discouragedMaterialCount = discouragedMaterialRows.length;
  const [nonPvlDialogOpen, setNonPvlDialogOpen] = useState(false);
  const [rlcPriorityOpen, setRlcPriorityOpen] = useState(false);
  const [assigningBomProjectId, setAssigningBomProjectId] = useState<string | null>(null);
  const bomProjectAssignmentRef = useRef<ReturnType<typeof captureBomWrite> | null>(null);
  useEffect(() => { setAssigningBomProjectId(null); }, [canEdit, user?.userId]);
  const rlcProjectId = activeWorkspace.project?.projectId ?? null;
  const rlcRules = useRlcPriority(rlcProjectId, user?.userId ?? null, rlcPriorityOpen);
  const [isExportingDiscouraged, setIsExportingDiscouraged] = useState(false);
  const exportDiscouragedMaterials = async () => {
    const rows = discouragedMaterialRows;
    if (rows.length === 0) {
      toast({ title: "沒有不建議料", description: "目前 BOM 的零件狀態沒有「不建議使用／不建議用料」的料。" });
      return;
    }
    setIsExportingDiscouraged(true);
    try {
      const fileName = await exportDiscouragedMaterialsExcel({
        rows,
        workspaceName: activeWorkspace.name,
        exportedBy: user?.displayName || user?.username || "未知使用者",
      });
      toast({ title: "不建議料明細已匯出", description: `${rows.length.toLocaleString()} 筆 · ${fileName}` });
    } catch (error) {
      toast({ title: "不建議料匯出失敗", description: error instanceof Error ? error.message : "請稍後再試。", variant: "destructive" });
    } finally {
      setIsExportingDiscouraged(false);
    }
  };
  const exportNonPvlList = async (selectedParts: string[]) => {
    const allowed = new Set(collectNonPvlPartNumbers(discouragedMaterialRows));
    const partNumbers = [...new Set(selectedParts)].filter(partNumber => allowed.has(partNumber));
    if (partNumbers.length === 0) {
      toast({ title: "沒有可申請的實體料號", description: "不建議料都還沒有實體料號，先補料號再匯出 PLM 申請清單。" });
      return;
    }
    setIsExportingDiscouraged(true);
    try {
      const fileName = await exportNonPvlApplyList({ partNumbers, workspaceName: activeWorkspace.name });
      toast({ title: "PLM 申請清單已匯出", description: `${partNumbers.length.toLocaleString()} 個實體料號 · ${fileName}，請到 PLM 的 Non PVL 申請上傳。` });
    } catch (error) {
      toast({ title: "PLM 申請清單匯出失敗", description: error instanceof Error ? error.message : "請稍後再試。", variant: "destructive" });
    } finally {
      setIsExportingDiscouraged(false);
    }
  };
  const requiredApplicationCount = useMemo(() => dataset.groups.filter(requiresApplication).length, [dataset.groups]);
  const pendingApplicationCount = useMemo(() => buildPendingApplications(pendingMaterialGroups).length, [pendingMaterialGroups]);
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
    const boundSeriesId = uploadTargetSeriesRef.current;
    uploadTargetSeriesRef.current = null;
    if (files.length === 0) return;
    if (!canEditModuleAccess) {event.target.value = ""; return;}
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
    try {
      // Parsing only. Nothing is written until the user confirms which series each file belongs to.
      const uploads: PendingBomUpload[] = [];
      for (const file of files) {
        const { importNotes, ...payload } = await parseMaterialWorkbookFile(file);
        const boundSeries = boundSeriesId ? seriesList.find((series) => series.id === boundSeriesId) ?? null : null;
        const inferred = boundSeries ?? inferBomSeriesForFile(file.name, seriesList);
        uploads.push({
          key: `${file.name}:${file.size}:${file.lastModified}:${uploads.length}`,
          file,
          payload,
          importNotes,
          target: inferred?.id ?? NEW_BOM_SERIES_TARGET,
          seriesName: inferred?.name ?? bomFileBaseName(file.name),
        });
      }
      setPendingUploads(uploads);
      setBomManagerOpen(false);
      setUploadDialogOpen(true);
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

  const loadVersionRecords = async (workspaceId: string) => {
    if (workspaceId === activeWorkspace.id && isFullDatasetLoaded) return activeWorkspace.payload.records;
    return loadBomWorkspaceRecords(workspaceId);
  };

  const confirmBomUploads = async (meta: BomUploadMeta) => {
    const uploads = pendingUploads;
    if (uploads.length === 0) return;
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }

    setIsImporting(true);
    const actor = user?.displayName || user?.username || "";
    const importProject = toBomWorkspaceProject(activeProject);
    const report: string[] = [];
    const createdSeriesIds = new Set<string>();
    let workspaces = bomWorkspaces;
    let lastWorkspaceId = activeBomId;
    let totalRecords = 0;
    let orphanedTotal = 0;
    let newSeriesCount = 0;
    let newVersionCount = 0;
    try {
      for (const upload of uploads) {
        assertBomWriteCurrent(writeScope);
        const currentSeriesList = buildBomSeriesList(workspaces);
        const requestedName = upload.seriesName.trim().slice(0, BOM_SERIES_NAME_LIMIT) || bomFileBaseName(upload.file.name);
        // Two files that both start "the same new series" in one batch become V1 and V2 of it.
        const series = upload.target === NEW_BOM_SERIES_TARGET
          ? currentSeriesList.find((candidate) => createdSeriesIds.has(candidate.id) && candidate.name === requestedName) ?? null
          : currentSeriesList.find((candidate) => candidate.id === upload.target) ?? null;
        if (upload.target !== NEW_BOM_SERIES_TARGET && !series) throw new Error(`找不到要加入的 BOM 系列（${upload.file.name}），請重新整理後再試。`);
        const previous = series?.current ?? null;
        const versionNumber = series ? nextBomVersionNumber(series) : 1;
        const seriesId = series ? series.id : createBomSeriesId();
        const seriesName = series?.name ?? requestedName;
        const workspaceId = createBomVersionWorkspaceId(seriesName, versionNumber);
        let records = upload.payload.records;
        let carry: BomWorkspaceVersion["carry"];
        if (previous) {
          const previousRecords = await loadVersionRecords(previous.workspace.id);
          assertBomWriteCurrent(writeScope);
          const carried = carryBomTracking(previousRecords, upload.payload.records);
          records = carried.records;
          carry = { matched: carried.matched, orphaned: carried.orphaned.length, manual: carried.manual };
          orphanedTotal += carried.orphaned.length;
        }
        const stamp = new Date().toISOString();
        const workspace: BomWorkspace = {
          id: workspaceId,
          name: seriesName,
          payload: { ...upload.payload, records, recordCount: records.length },
          pageTracker: previous?.workspace.pageTracker,
          tableColorTheme: previous?.workspace.tableColorTheme,
          project: previous?.workspace.project ?? importProject,
          updatedAt: stamp,
        };
        await saveBomWorkspace(workspace, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
        if (workspace.project) {
          recentLocalWorkspaceWritesRef.current.set(workspaceId, Date.now());
          await saveBomWorkspaceProject(workspaceId, workspace.project, () => assertBomWriteCurrent(writeScope));
          if (!isBomWriteCurrent(writeScope)) return;
        }
        if (series && !series.current.stored) {
          // A BOM uploaded before versioning gets its metadata stored now, as the earlier versions of this series.
          for (const item of series.versions) {
            await saveBomWorkspaceVersion(item.workspace.id, { ...item.version, seriesId, seriesName, isCurrent: false, currentChangedAt: stamp }, () => assertBomWriteCurrent(writeScope));
          }
        } else if (previous) {
          await saveBomWorkspaceVersion(previous.workspace.id, { ...previous.version, isCurrent: false, currentChangedAt: stamp }, () => assertBomWriteCurrent(writeScope));
        }
        if (!isBomWriteCurrent(writeScope)) return;
        let version: BomWorkspaceVersion = {
          seriesId, seriesName, versionNumber,
          label: meta.label.slice(0, BOM_VERSION_LABEL_LIMIT),
          note: meta.note.slice(0, BOM_VERSION_NOTE_LIMIT),
          uploadedAt: stamp, uploadedBy: actor,
          previousWorkspaceId: previous?.workspace.id,
          isCurrent: true, currentChangedAt: stamp, carry,
        };
        await saveBomWorkspaceVersion(workspaceId, version, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
        try {
          const source = await uploadBomSourceFile({ workspaceId, file: upload.file });
          assertBomWriteCurrent(writeScope);
          version = { ...version, source };
          await saveBomWorkspaceVersion(workspaceId, version, () => assertBomWriteCurrent(writeScope));
        } catch (error) {
          if (!isBomWriteCurrent(writeScope)) return;
          report.push(`${upload.file.name}：原始 Excel 未保存（${error instanceof Error ? error.message : "儲存空間無法使用"}），版本本身已建立`);
        }
        void logMaterialWorkspaceAction({
          action: "import",
          actor: user,
          metadata: {
            fileName: upload.file.name,
            projectId: workspace.project?.projectId ?? null,
            recordCount: workspace.payload.recordCount,
            sheetName: workspace.payload.sheetName,
            seriesId, seriesName, versionNumber,
            previousWorkspaceId: previous?.workspace.id ?? null,
            carry: carry ?? null,
            replacedExistingWorkspace: false,
          },
          workspaceId,
        });
        const finalWorkspace: BomWorkspace = { ...workspace, version };
        replaceBomWorkspace(finalWorkspace);
        workspaces = [...workspaces.filter((item) => item.id !== workspaceId).map((item) => {
          const legacy = series && !series.current.stored ? series.versions.find((candidate) => candidate.workspace.id === item.id) : undefined;
          return legacy ? { ...item, version: { ...legacy.version, seriesId, seriesName, isCurrent: false, currentChangedAt: stamp } } : item;
        }), finalWorkspace];
        if (series) newVersionCount += 1;
        else { createdSeriesIds.add(seriesId); newSeriesCount += 1; }
        lastWorkspaceId = workspaceId;
        totalRecords += workspace.payload.recordCount;
      }

      await reloadBomWorkspaces(lastWorkspaceId);
      if (!isBomWriteCurrent(writeScope)) return;
      setUploadDialogOpen(false);
      setPendingUploads([]);
      setActiveBomId(lastWorkspaceId);
      setExpandedKey(null);
      setPage(1);
      toast({
        title: uploads.length === 1 ? "BOM 版本已建立" : `${uploads.length} 個 BOM 版本已建立`,
        description: `共 ${totalRecords.toLocaleString()} 筆廠商料明細；新系列 ${newSeriesCount} 個、新版本 ${newVersionCount} 個${importProject && newSeriesCount > 0 ? `，新系列已歸入專案「${importProject.projectName}」` : ""}。可在 BOM 管理比對版本差異。`,
      });
      if (orphanedTotal > 0) {
        toast({
          title: "有追蹤紀錄沒有帶到新版本",
          description: `${orphanedTotal.toLocaleString()} 筆舊版追蹤找不到對應的位號或料號，舊版本完整保留；請在 BOM 管理的差異檢視用「追蹤未帶入」確認。`,
          duration: 30_000,
        });
      }
      if (report.length > 0) {
        toast({ title: "上傳時有資料需要注意", description: report.join("；"), duration: 30_000 });
      }
    } catch (error) {
      if (writeScope && !isBomWriteCurrent(writeScope)) return;
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({
        title: "BOM 版本建立失敗",
        description: error instanceof Error ? error.message : "請稍後再試。",
        variant: "destructive",
      });
    } finally {
      if (!writeScope || isBomWriteCurrent(writeScope)) setIsImporting(false);
    }
  };

  const requestSetCurrentBomVersion = (version: BomSeriesVersion, series: BomSeries) => {
    if (!canEditModuleAccess || version.isCurrent) return;
    setCarryOnSwitch(true);
    setPendingCurrent({ version, series });
  };

  const applyCurrentBomVersion = async () => {
    const target = pendingCurrent;
    setPendingCurrent(null);
    if (!target) return;
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    const { version, series } = target;
    const previous = series.current;
    const stamp = new Date().toISOString();
    try {
      let carry = version.version.carry;
      if (carryOnSwitch && previous.workspace.id !== version.workspace.id) {
        const [previousRecords, targetRecords] = await Promise.all([loadVersionRecords(previous.workspace.id), loadVersionRecords(version.workspace.id)]);
        assertBomWriteCurrent(writeScope);
        const carried = carryBomTracking(previousRecords, targetRecords);
        await saveBomWorkspace({ ...version.workspace, payload: { ...version.workspace.payload, records: carried.records, recordCount: carried.records.length }, updatedAt: stamp }, () => assertBomWriteCurrent(writeScope));
        carry = { matched: carried.matched, orphaned: carried.orphaned.length, manual: carried.manual };
      }
      if (!isBomWriteCurrent(writeScope)) return;
      for (const item of series.versions) {
        const isTarget = item.workspace.id === version.workspace.id;
        if (!isTarget && item.stored && !item.version.isCurrent) continue;
        await saveBomWorkspaceVersion(item.workspace.id, { ...item.version, seriesId: series.id, seriesName: series.name, isCurrent: isTarget, currentChangedAt: stamp, ...(isTarget ? { carry } : {}) }, () => assertBomWriteCurrent(writeScope));
      }
      if (!isBomWriteCurrent(writeScope)) return;
      void logMaterialWorkspaceAction({
        action: "version.current",
        actor: user,
        metadata: { seriesId: series.id, seriesName: series.name, versionNumber: version.version.versionNumber, previousWorkspaceId: previous.workspace.id, carried: carryOnSwitch },
        workspaceId: version.workspace.id,
      });
      await reloadBomWorkspaces(version.workspace.id);
      if (!isBomWriteCurrent(writeScope)) return;
      switchActiveBom(version.workspace.id);
      toast({
        title: `${series.name} 已切換到 ${version.displayNumber}`,
        description: carryOnSwitch && previous.workspace.id !== version.workspace.id ? `這個版本現在是目前版本；${previous.displayNumber} 的追蹤紀錄已依位號與料號帶過來。` : "這個版本現在是目前版本，其他人也會看到相同結果。",
      });
    } catch (error) {
      if (!isBomWriteCurrent(writeScope)) return;
      await reloadBomWorkspaces(activeBomId).catch(() => undefined);
      toast({ variant: "destructive", title: "切換目前版本失敗", description: error instanceof Error ? error.message : "尚未寫入資料庫，請稍後再試。" });
    }
  };

  const assignBomSeriesProject = async (series: BomSeries, projectId: string | null) => {
    for (const item of series.versions) await assignBomProject(item.workspace.id, projectId);
  };

  const renameBomSeries = async (series: BomSeries, name: string) => {
    const writeScope = captureBomWrite();
    if (!isCollaborativeReady) throw new Error("共用資料尚未連線，請稍後再改名。");
    const trimmed = name.trim().slice(0, BOM_SERIES_NAME_LIMIT);
    if (!trimmed) throw new Error("系列名稱不能空白。");
    for (const item of series.versions) {
      recentLocalWorkspaceWritesRef.current.set(item.workspace.id, Date.now());
      await saveBomWorkspaceVersion(item.workspace.id, { ...item.version, seriesId: series.id, seriesName: trimmed }, () => assertBomWriteCurrent(writeScope));
    }
    assertBomWriteCurrent(writeScope);
    setBomWorkspaces((current) => current.map((workspace) => {
      const item = series.versions.find((candidate) => candidate.workspace.id === workspace.id);
      return item ? { ...workspace, version: { ...item.version, seriesId: series.id, seriesName: trimmed } } : workspace;
    }));
  };

  const updateBomVersionMeta = async (version: BomSeriesVersion, series: BomSeries, patch: { label: string; note: string }) => {
    const writeScope = captureBomWrite();
    if (!isCollaborativeReady) throw new Error("共用資料尚未連線，請稍後再試。");
    const next: BomWorkspaceVersion = { ...version.version, seriesId: series.id, seriesName: series.name, label: patch.label.slice(0, BOM_VERSION_LABEL_LIMIT), note: patch.note.slice(0, BOM_VERSION_NOTE_LIMIT) };
    recentLocalWorkspaceWritesRef.current.set(version.workspace.id, Date.now());
    await saveBomWorkspaceVersion(version.workspace.id, next, () => assertBomWriteCurrent(writeScope));
    assertBomWriteCurrent(writeScope);
    setBomWorkspaces((current) => current.map((workspace) => (workspace.id === version.workspace.id ? { ...workspace, version: next } : workspace)));
  };

  const setBomSeriesArchived = async (series: BomSeries, archived: boolean) => {
    for (const item of series.versions) await setBomArchived(item.workspace.id, archived);
  };

  const requestDeleteBomVersion = (version: BomSeriesVersion, series: BomSeries) => {
    if (version.isCurrent && series.versions.length > 1) {
      toast({ variant: "destructive", title: "目前版本不能直接刪除", description: "請先把另一個版本設為目前版本，再刪除這一版。" });
      return;
    }
    setPendingDelete({
      title: `永久刪除 ${series.name} ${version.displayNumber}？`,
      description: `這個版本的 ${version.workspace.payload.recordCount.toLocaleString()} 筆料件、頁數與追蹤資料會一併移除，這個動作無法復原。${series.versions.length > 1 ? "系列的其他版本不受影響。" : "這是系列的最後一個版本，整個系列會一起消失。"}`,
      workspaceIds: [version.workspace.id],
    });
  };

  const requestDeleteBomSeries = (series: BomSeries) => {
    const total = series.versions.reduce((sum, item) => sum + item.workspace.payload.recordCount, 0);
    setPendingDelete({
      title: `永久刪除系列「${series.name}」？`,
      description: `${series.versions.length} 個版本、共 ${total.toLocaleString()} 筆料件、頁數與追蹤資料會一併移除，這個動作無法復原。`,
      workspaceIds: series.versions.map((item) => item.workspace.id),
    });
  };

  const openBomSourceFile = async (version: BomSeriesVersion) => {
    if (!version.version.source) return;
    try {
      const url = await createBomSourceUrl(version.version.source);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast({ variant: "destructive", title: "無法下載原始 Excel", description: error instanceof Error ? error.message : "請稍後再試。" });
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
    setEditorContext({ workspaceId: activeWorkspace.id, accountId: user?.userId });
    setEditorInitialTab("details");
    setEditorSession((current) => current + 1);
    setEditorMode("create");
    setEditorOpen(true);
  };

  const openRecord = (record: MaterialRecord, mode: EditorMode, initialTab: MaterialEditorTab = "details") => {
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
    setEditorContext({ workspaceId: activeWorkspace.id, accountId: user?.userId, recordMeta: activeWorkspace.recordMeta?.[record.id] });
    setEditorInitialTab(initialTab);
    setEditorSession((current) => current + 1);
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const openSpecDocument = async (record: Pick<MaterialWorkbookRecord, "specDocument">, download = false) => {
    if (!record.specDocument) return;
    try {
      const url = await createMaterialSpecUrl(record.specDocument.path, download ? record.specDocument.name : undefined);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = record.specDocument.name;
        link.click();
      } else window.open(url, "_blank", "noopener");
    } catch (error) {
      toast({ title: "無法開啟 SPEC", description: error instanceof Error ? error.message : "請稍後再試。", variant: "destructive" });
    }
  };

  const openTrackingDialog = (record: MaterialRecord) => {
    openRecord(record, canEdit && isCollaborativeReady && isFullDatasetLoaded ? "edit" : "view", "tracking");
  };

  const openBomPageTrackerDialog = (workspaceId = activeBomId) => {
    if (!canManageBomPageTracker) {
      showCollaborativeUnavailableToast();
      return;
    }

    setPageTrackerWorkspaceId(workspaceId);
    setPageTrackerDialogOpen(true);
  };

  const saveRecordToActiveBom = (record: MaterialWorkbookRecord, expectedRecordMeta?: BomRecordSyncMeta) => {
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
      ...(expectedRecordMeta ? { recordMeta: { ...activeWorkspace.recordMeta, [record.id]: expectedRecordMeta } } : {}),
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

  const countTrackingImages = (record?: MaterialWorkbookRecord) =>
    (record?.trackingHistory ?? []).reduce((count, entry) => count + (entry.images?.length ?? 0), 0);

  // Writes several rows in one local replace, then one remote write per row, threading each row's
  // new version into the next write. The first row decides success; the rest are best effort.
  const saveRecordsToActiveBom = async (list: MaterialWorkbookRecord[]): Promise<{ saved: number; failed: number }> => {
    if (list.length === 0) return { saved: 0, failed: 0 };
    const writeScope = captureBomWrite();
    if (!isCollaborativeReady) throw new Error("Collaborative BOM storage unavailable");
    if (!isFullDatasetLoaded) {
      showDatasetSyncingToast();
      throw new Error("Full BOM dataset is still loading");
    }
    const byId = new Map(list.map((item) => [item.id, item] as const));
    const previousById = new Map(basePayload.records.map((item) => [item.id, item] as const));
    const records = [
      ...basePayload.records.map((item) => byId.get(item.id) ?? item),
      ...list.filter((item) => !previousById.has(item.id)),
    ];
    const nextWorkspace: BomWorkspace = {
      ...activeWorkspace,
      payload: { ...basePayload, records, recordCount: records.length },
      updatedAt: new Date().toISOString(),
    };
    for (const item of list) recentLocalRecordIdsRef.current.set(item.id, Date.now());
    replaceBomWorkspace(nextWorkspace);
    const metas: Record<string, BomRecordSyncMeta> = {};
    let failed = 0;
    let savingWorkspace = nextWorkspace;
    for (const [index, item] of list.entries()) {
      try {
        const recordMeta = await saveBomWorkspaceRecord(savingWorkspace, item, () => assertBomWriteCurrent(writeScope));
        assertBomWriteCurrent(writeScope);
        metas[item.id] = recordMeta;
        savingWorkspace = { ...savingWorkspace, recordMeta: { ...savingWorkspace.recordMeta, [item.id]: recordMeta } };
        const previous = previousById.get(item.id);
        void logMaterialRecordChange({
          action: previous ? "update" : "create",
          actor: user,
          imageCount: countTrackingImages(item),
          previousImageCount: countTrackingImages(previous),
          newUpdatedAt: recordMeta.updatedAt,
          previousUpdatedAt: activeWorkspace.recordMeta?.[item.id]?.updatedAt,
          recordId: item.id,
          workspaceId: savingWorkspace.id,
        });
      } catch (error) {
        if (!isBomWriteCurrent(writeScope)) throw error;
        if (index === 0) {
          await reloadBomWorkspaces(activeBomId).catch(() => undefined);
          throw error;
        }
        failed += 1;
      }
    }
    setBomWorkspaces((current) => current.map((workspace) => workspace.id === nextWorkspace.id
      ? { ...workspace, recordMeta: { ...workspace.recordMeta, ...metas } }
      : workspace));
    if (failed > 0) await reloadBomWorkspaces(activeBomId).catch(() => undefined);
    return { saved: list.length - failed, failed };
  };

  // A hand-picked 待處理料 category is written to every row of the part, so it stays put when
  // another row becomes the main row; choosing 依位號自動 removes it from all of them.
  const setPendingCategory = (group: MaterialGroup, category: PendingMaterialCategory | null) => {
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
    const updates = group.records
      .filter((record) => (record.pendingCategory ?? null) !== category)
      .map((record) => {
        const next = toWorkbookRecord(record);
        if (category) next.pendingCategory = category;
        else delete next.pendingCategory;
        return next;
      });
    if (updates.length === 0) return;
    const label = category ? PENDING_MATERIAL_CATEGORIES.find((item) => item.key === category)?.label ?? category : "依位號自動";
    void saveRecordsToActiveBom(updates).then(() => {
      if (!isBomWriteCurrent(writeScope)) return;
      toast({ title: "分類已更新", description: `${group.displayRef} → ${label}` });
    }).catch(() => {
      if (!isBomWriteCurrent(writeScope)) return;
      toast({ title: "分類更新失敗", description: "這筆分類還沒同步到共用資料，已重新載入最新版本。", variant: "destructive" });
    });
  };

  const setPendingOwner = async (record: MaterialRecord, owner: MaterialRequestOwner | null) => {
    if (!canEdit || !isCollaborativeReady || !isFullDatasetLoaded) throw new Error("尚未同步，請稍後重試。");
    const writeScope = captureBomWrite();
    await saveRecordToActiveBom({ ...toWorkbookRecord(record), requestOwnerId: owner?.id ?? "", requestOwnerName: owner?.name ?? "" }, activeWorkspace.recordMeta?.[record.id]);
    if (!isBomWriteCurrent(writeScope)) return;
    toast({ title: "負責人已儲存", description: `${record.refDes || record.name} → ${owner?.name ?? "未指定"}` });
  };

  const handleSaveRecord = async (record: MaterialWorkbookRecord) => {
    if (!isValidBomUsage(record.qty)) {
      toast({ title: "Qty 是單一產品用量，不能為負數", variant: "destructive" });
      throw new Error("Qty 是單一產品用量，不能為負數");
    }
    try {
      if (editorContext?.workspaceId !== activeWorkspace.id || editorContext.accountId !== user?.userId) throw new WorkspaceMutationScopeChangedError();
      const writeScope = captureBomWrite();
      await saveRecordToActiveBom({
        ...record,
        ...(record.requestOwnerId === undefined && record.requestOwnerName === undefined ? { requestOwnerId: user?.userId, requestOwnerName: user?.displayName || user?.username } : {}),
        requestUrl: normalizeRequestUrl(record.requestUrl ?? ""),
      }, editorContext.recordMeta);
      if (!isBomWriteCurrent(writeScope)) return;
      setEditorOpen(false);
      toast({
        title: editorMode === "create" ? "料件已新增" : "料件已更新",
        description: `${record.manufacturer || "未指定廠商"} ${record.manufacturerPartNumber || record.name}`,
      });
    } catch (error) {
      if (error instanceof WorkspaceMutationScopeChangedError) throw error;
      toast({
        title: error instanceof BomRecordConflictError ? "偵測到版本衝突" : "同步更新失敗",
        description: error instanceof BomRecordConflictError
          ? "此筆資料已由其他使用者更新，系統沒有覆蓋對方內容；你的表單仍保留，請比對最新資料後再送出。"
          : "這筆料件還沒寫進共用資料，請稍後再試一次。",
        variant: "destructive",
      });
      throw error;
    }
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
      recentLocalWorkspaceWritesRef.current.set(workspaceId, Date.now());
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
    setSearchColumn("all");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
    setShowMarkedOnly(false);
    setExpandedKey(null);
    setPage(1);
  };
  switchActiveBomRef.current = switchActiveBom;

  const setBomArchived = async (workspaceId: string, archived: boolean) => {
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    const workspace = bomWorkspaces.find((item) => item.id === workspaceId);
    if (!workspace || Boolean(workspace.archive) === archived) return;
    const nextArchive: BomWorkspaceArchive | null = archived
      ? { archivedAt: new Date().toISOString(), archivedBy: user?.displayName || user?.username || "" }
      : null;

    setBomWorkspaces((current) => current.map((item) => (item.id === workspaceId ? { ...item, archive: nextArchive ?? undefined } : item)));
    if (archived && workspaceId === activeBomId) {
      const fallback = orderedBomWorkspaces.find((item) => item.id !== workspaceId && !item.archive);
      if (fallback) switchActiveBom(fallback.id);
    }

    try {
      recentLocalWorkspaceWritesRef.current.set(workspaceId, Date.now());
      await saveBomWorkspaceArchive(workspaceId, nextArchive, () => assertBomWriteCurrent(writeScope));
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: archived ? "BOM 已封存" : "BOM 已解除封存",
        description: archived ? `「${workspace.name}」移到封存區，不再出現在切換器與專案分組；資料都還在，隨時可解除。` : `「${workspace.name}」已回到清單。`,
      });
    } catch {
      if (!isBomWriteCurrent(writeScope)) return;
      setBomWorkspaces((current) => current.map((item) => (item.id === workspaceId ? { ...item, archive: workspace.archive } : item)));
      toast({ variant: "destructive", title: archived ? "封存失敗" : "解除封存失敗", description: "尚未寫入資料庫，請稍後再試。" });
    }
  };

  const assignBomProject = async (workspaceId: string, projectId: string | null) => {
    const writeScope = captureBomWrite();
    if (!isCollaborativeReady) throw new Error('共用資料尚未連線，請稍後再指定專案。');
    if (bomProjectAssignmentRef.current && isBomWriteCurrent(bomProjectAssignmentRef.current)) throw new Error('專案正在儲存，請稍候。');
    const workspace = bomWorkspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error('找不到這份 BOM，請重新載入。');
    const project = projectId ? allProjects.find((item) => item.id === projectId) : null;
    if (projectId && !project) throw new Error('找不到選取的專案，請重新選擇。');
    const nextProject = toBomWorkspaceProject(project) ?? null;
    if ((workspace.project?.projectId ?? null) === (nextProject?.projectId ?? null)) return;
    bomProjectAssignmentRef.current = writeScope;
    setAssigningBomProjectId(workspaceId);
    try {
      recentLocalWorkspaceWritesRef.current.set(workspaceId, Date.now());
      await saveBomWorkspaceProject(workspaceId, nextProject, () => assertBomWriteCurrent(writeScope));
      assertBomWriteCurrent(writeScope);
      setBomWorkspaces((current) => current.map((item) => (
        item.id === workspaceId ? { ...item, project: nextProject ?? undefined } : item
      )));
      toast({
        title: nextProject ? "BOM 已歸入專案" : "BOM 已移出專案",
        description: nextProject
          ? `「${workspace.name}」現在屬於專案「${nextProject.projectName}」，其他人也會看到相同分組。`
          : `「${workspace.name}」已改為未指定專案。`,
      });
    } catch (error) {
      if (isBomWriteCurrent(writeScope)) toast({
        variant: "destructive",
        title: "專案歸屬儲存失敗",
        description: "分組尚未寫入資料庫，請稍後再試。",
      });
      throw error;
    } finally {
      if (bomProjectAssignmentRef.current === writeScope) bomProjectAssignmentRef.current = null;
      if (isBomWriteCurrent(writeScope)) setAssigningBomProjectId(null);
    }
  };

  const applyAvailabilityFilter = (nextAvailability: AvailabilityFilter) => {
    setQuery("");
    setSearchDraft("");
    setSearchColumn("all");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability((current) => current === nextAvailability ? "all" : nextAvailability);
    setExpandedKey(null);
    setPage(1);
  };

  const deleteBomWorkspaceById = async (target: string | string[]) => {
    let writeScope;
    try {writeScope = captureBomWrite();} catch {return;}
    if (!isCollaborativeReady) {
      showCollaborativeUnavailableToast();
      return;
    }
    const targetIds = Array.isArray(target) ? target : [target];
    const targetWorkspaces = bomWorkspaces.filter((workspace) => targetIds.includes(workspace.id));
    if (targetWorkspaces.length === 0) return;

    const remaining = bomWorkspaces.filter((workspace) => !targetIds.includes(workspace.id));
    const fallbackWorkspace = remaining.length > 0
      ? createDefaultBomWorkspace()
      : await loadDefaultBomWorkspace();
    const nextWorkspaces = remaining.length > 0 ? remaining : [fallbackWorkspace];
    if (!isBomWriteCurrent(writeScope)) return;

    setBomWorkspaces(nextWorkspaces);
    if (targetIds.includes(activeBomId)) {
      switchActiveBom(nextWorkspaces[0].id);
    }

    try {
      for (const targetWorkspace of targetWorkspaces) {
        await removeBomWorkspace(targetWorkspace.id, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
        void logMaterialWorkspaceAction({
          action: "delete",
          actor: user,
          metadata: {
            deletedWorkspaceId: targetWorkspace.id,
            name: targetWorkspace.name,
            recordCount: targetWorkspace.payload.recordCount,
            seriesId: targetWorkspace.version?.seriesId ?? null,
            versionNumber: targetWorkspace.version?.versionNumber ?? null,
          },
        });
      }
      if (remaining.length === 0) {
        await saveBomWorkspace(fallbackWorkspace, () => assertBomWriteCurrent(writeScope));
        if (!isBomWriteCurrent(writeScope)) return;
      }
      await reloadBomWorkspaces(nextWorkspaces[0].id);
      if (!isBomWriteCurrent(writeScope)) return;
      toast({
        title: targetWorkspaces.length > 1 ? `已刪除 ${targetWorkspaces.length} 個 BOM 版本` : "BOM 版本已刪除",
        description: remaining.length === 0 ? "已自動建立新的預設備援 BOM。" : `剩餘 ${remaining.length} 個 BOM 版本。`,
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
    if (!pendingDelete) return;
    const targetIds = pendingDelete.workspaceIds;
    setPendingDelete(null);
    await deleteBomWorkspaceById(targetIds);
  };

  const createExportSnapshot = (openDialog = true) => {
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
          materialName: record.name,
          partName: record.partName,
          qty: String(group.qty),
          remark: record.remark ?? "",
          specDocumentName: getMaterialSpecDocuments(record).map(document => document.name).join("、"),
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
          trackingOwner: latestTrackingEntry?.createdBy ?? "",
          trackingStatus: latestTrackingEntry?.status?.trim() || record.trackingStatus?.trim() || "未追蹤",
          trackingSummary: latestTrackingEntry?.note ?? record.trackingNote ?? "",
          trackingUpdatedAt: latestTrackingEntry?.createdAt ?? "",
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

    if (openDialog) {
      setExportSnapshot(snapshot);
      setExportProgress({ phase: "snapshot" });
      setExportDialogOpen(true);
    }
    return snapshot;
  };

  const [exportingVisibleColumns, setExportingVisibleColumns] = useState(false);
  const exportVisibleColumns = async () => {
    if (exportingVisibleColumns || !isFullDatasetLoaded || isSearchPending || isWorkspaceLoading) return;
    const snapshot = createExportSnapshot(false);
    if (!snapshot) return;
    const columns = MATERIAL_TABLE_COLUMNS.filter(column => columnVisibility[column.key]);
    setExportingVisibleColumns(true);
    try {
      const { exportMaterialVisibleColumns } = await import("./materialRequestExport");
      const fileName = await exportMaterialVisibleColumns(snapshot, columns);
      toast({ title: "顯示欄位已匯出", description: `${columns.length} 欄 · ${snapshot.rows.length} 筆明細 · ${fileName}` });
    } catch (error) {
      toast({ title: "匯出失敗", description: error instanceof Error ? error.message : "請稍後再試。", variant: "destructive" });
    } finally { setExportingVisibleColumns(false); }
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
    setSearchColumn("all");
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
    } else if (key === "searchColumn") {
      setSearchColumn("all");
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

  const applyTableSettings = async (settings: MaterialTableSettings) => {
    const nextTheme = normalizeBomTableColorTheme(settings.theme);
    const colorsChanged = (Object.keys(nextTheme) as Array<keyof typeof nextTheme>).some(key => nextTheme[key] !== activeTableColorTheme[key]);
    if (colorsChanged) {
      const writeScope = captureBomWrite();
      if (!isCollaborativeReady) throw new Error("尚未連上共享資料，請稍後再套用配色。");
      recentLocalWorkspaceWritesRef.current.set(activeWorkspace.id, Date.now());
      try {
        await saveBomWorkspaceTableColorTheme(activeWorkspace.id, nextTheme, () => assertBomWriteCurrent(writeScope));
      } catch {
        throw new Error("配色尚未儲存，請保留此視窗並重試。");
      }
      assertBomWriteCurrent(writeScope);
      setBomWorkspaces(current => current.map(workspace => workspace.id === activeWorkspace.id ? { ...workspace, tableColorTheme: nextTheme } : workspace));
    }
    setHiddenColumns(settings.hiddenColumns);
    if (settings.resetWidths) setColumnWidths([...DEFAULT_COLUMN_WIDTHS]);
  };

  // Rows receive one stable actions object; the ref always points at the
  // handlers from the latest render, so memoised rows never call stale closures.
  const rowActionsRef = useRef<MaterialRowActions | null>(null);
  rowActionsRef.current = {
    toggleExpanded,
    copy: (value) => { void handleCopy(value); },
    openCreate,
    openTracking: openTrackingDialog,
    openSpec: (record) => { if (getMaterialSpecDocuments(record).length > 1) openRecord(record, canEdit && isCollaborativeReady && isFullDatasetLoaded ? "edit" : "view", "details"); else void openSpecDocument({ specDocument: getMaterialSpecDocuments(record)[0] }); },
  };
  const rowActions = useMemo<MaterialRowActions>(() => ({
    toggleExpanded: (key) => rowActionsRef.current?.toggleExpanded(key),
    copy: (value) => rowActionsRef.current?.copy(value),
    openCreate: (group) => rowActionsRef.current?.openCreate(group),
    openTracking: (record) => rowActionsRef.current?.openTracking(record),
    openSpec: (record) => rowActionsRef.current?.openSpec(record),
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

  const searchColumnControl = (
    <Select value={searchColumn} onValueChange={value => { setSearchColumn(value as ColumnFilterKey | "all"); setPage(1); setExpandedKey(null); }}>
      <SelectTrigger aria-label="搜尋篩選工具" className="h-11 w-40 shrink-0 text-sm [&>span]:truncate lg:h-9 lg:text-xs"><SelectValue>{searchColumn === "all" ? "搜尋篩選工具" : COLUMN_FILTER_LABELS[searchColumn]}</SelectValue></SelectTrigger>
      <SelectContent><SelectItem value="all">全部欄位</SelectItem>{FILTER_KEYS.map(key => <SelectItem key={key} value={key}>{COLUMN_FILTER_LABELS[key]}</SelectItem>)}</SelectContent>
    </Select>
  );
  const tableSettingsControl = (
    <Button type="button" variant="outline" size="sm" data-testid="material-column-visibility" aria-haspopup="dialog" aria-expanded={tableSettingsOpen} onClick={() => setTableSettingsOpen(true)} className="h-11 gap-1.5 border-border bg-background/40 px-3 text-sm font-medium text-foreground hover:bg-secondary lg:h-9 lg:px-2.5 lg:text-xs">
      <Columns3 className="h-4 w-4" />欄位設定
      {hiddenColumns.length > 0 && <span className="rounded bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">隱藏 {hiddenColumns.length}</span>}
    </Button>
  );
  const activeFilterControls = activeFilterChips.length > 0 && (
    <div data-testid="material-active-filters" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      {activeFilterChips.map(chip => <button key={chip.key} type="button" onClick={() => removeFilterChip(chip.key)} aria-label={`移除篩選：${chip.label}`} className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-2 text-foreground lg:min-h-8"><span className="max-w-[20rem] truncate">{chip.label}</span><X className="h-3 w-3 shrink-0" /></button>)}
      <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="min-h-11 text-destructive lg:min-h-8">全部清除</Button>
    </div>
  );
  return (
    <div className="material-sheet-theme maintenance-workspace min-h-full w-full min-w-0 overflow-x-clip bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.10),transparent_26rem),radial-gradient(circle_at_88%_2%,rgba(251,191,36,0.08),transparent_24rem),#06111f] p-2 text-slate-100 sm:p-3 lg:p-4">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleWorkbookImport} />

      <UploadGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <RlcPriorityDialog key={`${user?.userId}:${activeWorkspace.id}:${rlcProjectId}`} open={rlcPriorityOpen} onOpenChange={setRlcPriorityOpen} projectId={rlcProjectId} projectName={activeWorkspace.project?.projectName ?? ''} workspaceName={activeWorkspace.name} projects={projects.map(project => ({ id: project.id, name: project.name }))} onAssignProject={projectId => assignBomProject(activeWorkspace.id, projectId)} assigningProject={assigningBomProjectId === activeWorkspace.id} groups={dataset.groups} rules={rlcRules.rules} canEdit={canEdit && isCollaborativeReady && isFullDatasetLoaded} loading={rlcRules.loading || !isFullDatasetLoaded} saving={rlcRules.saving} error={rlcRules.error} onSaveRule={rlcRules.saveRule} onReload={rlcRules.reload} />
      <MaterialNonPvlDialog
        key={activeWorkspace.id}
        isExporting={isExportingDiscouraged}
        open={nonPvlDialogOpen}
        rows={discouragedMaterialRows}
        excludedCount={excludedDiscouragedCount}
        workspaceName={activeWorkspace.name}
        onExportApplyList={parts => void exportNonPvlList(parts)}
        onExportDetail={() => void exportDiscouragedMaterials()}
        onOpenChange={setNonPvlDialogOpen}
      />
      <PendingMaterialsDialog
        canEdit={canEdit && isCollaborativeReady && isFullDatasetLoaded}
        groups={pendingMaterialGroups}
        open={pendingDialogOpen}
        restoreView={pendingRestoreView}
        recordMeta={activeWorkspace.recordMeta}
        workspaceName={activeWorkspace.name}
        exportedBy={user?.displayName || user?.username || "未知使用者"}
        onOpenChange={setPendingDialogOpen}
        onOpenTracking={(record) => { setPendingDialogOpen(false); setReturnToPending(true); openTrackingDialog(record); }}
        onSetCategory={setPendingCategory}
        accountId={user?.userId}
        onSetOwner={setPendingOwner}
        markedGroupKeys={markedGroupKeySet}
        onToggleMarked={toggleMarkedGroup}
      />
      <MaterialTableSettingsDialog
        key={activeWorkspace.id}
        open={tableSettingsOpen}
        onOpenChange={setTableSettingsOpen}
        workspaceName={activeWorkspace.name}
        hiddenColumns={hiddenColumns}
        theme={activeTableColorTheme}
        canEditColors={canEdit && isCollaborativeReady}
        onApply={applyTableSettings}
      />
      <BomPageTrackerDialog workspace={pageTrackerWorkspace} open={pageTrackerDialogOpen} onOpenChange={setPageTrackerDialogOpen} onSave={saveBomPageTracker} />
      <BomVersionCenter
        open={bomManagerOpen}
        onOpenChange={setBomManagerOpen}
        canEdit={canEditModuleAccess}
        ready={isCollaborativeReady}
        busy={isImporting}
        activeBomId={activeBomId}
        activeProjectId={activeProjectId}
        activeProjectName={activeProject?.name}
        projects={projects}
        projectNames={projectNames}
        seriesList={seriesList}
        exportedBy={user?.displayName || user?.username || ""}
        loadRecords={loadVersionRecords}
        onView={(id) => { switchActiveBom(id); setBomManagerOpen(false); }}
        onSetCurrent={requestSetCurrentBomVersion}
        onUploadVersion={(series) => { uploadTargetSeriesRef.current = series.id; fileInputRef.current?.click(); }}
        onUploadNew={() => { uploadTargetSeriesRef.current = null; fileInputRef.current?.click(); }}
        onAssignProject={assignBomSeriesProject}
        onRenameSeries={renameBomSeries}
        onUpdateVersion={updateBomVersionMeta}
        onSetArchived={(series, archived) => void setBomSeriesArchived(series, archived)}
        onDeleteVersion={requestDeleteBomVersion}
        onDeleteSeries={requestDeleteBomSeries}
        onOpenPageTracker={openBomPageTrackerDialog}
        onDownloadSource={(version) => void openBomSourceFile(version)}
      />
      <BomUploadDialog open={uploadDialogOpen} uploads={pendingUploads} seriesList={seriesList} activeProjectName={activeProject?.name} busy={isImporting} onChange={setPendingUploads} onConfirm={(meta) => void confirmBomUploads(meta)} onCancel={() => { if (!isImporting) { setUploadDialogOpen(false); setPendingUploads([]); } }} />
      <MaterialRecordDialog key={`${user?.userId}:${activeWorkspace.id}:${editorSession}`} canEdit={canEdit && isCollaborativeReady && isFullDatasetLoaded} open={editorOpen && editorContext?.workspaceId === activeWorkspace.id && editorContext.accountId === user?.userId} mode={editorMode} record={editorRecord} initialTab={editorInitialTab} workspaceId={activeWorkspace.id} uploaderName={user?.displayName || user?.username || undefined} onOpenChange={setEditorOpen} onModeChange={setEditorMode} onOpenSpec={(target, download) => void openSpecDocument(target, download)} onSave={handleSaveRecord} onAddAlternate={editorMode === "create" ? undefined : () => {
        const group = dataset.groups.find((candidate) => candidate.records.some((item) => item.id === editorRecord.id));
        if (group) openCreate(group);
      }} />
      <MaterialExportDialog
        activeFormat={activeExportFormat}
        onExport={(format) => { void runExport(format); }}
        onOpenChange={setExportDialogOpen}
        open={exportDialogOpen}
        progress={exportProgress}
        snapshot={exportSnapshot}
      />
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent data-dialog-tone="danger" className="gap-4 p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.title ?? "永久刪除這份 BOM？"}</AlertDialogTitle>
            <AlertDialogDescription>{pendingDelete?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留 BOM</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmDeleteBom()}>
              確認永久刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingCurrent)} onOpenChange={(open) => !open && setPendingCurrent(null)}>
        <AlertDialogContent className="gap-4 p-5 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>把「{pendingCurrent?.series.name}」切換到 {pendingCurrent?.version.displayNumber}？</AlertDialogTitle>
            <AlertDialogDescription>
              目前版本是 {pendingCurrent?.series.current.displayNumber}。切換後所有人在切換器看到的都是 {pendingCurrent?.version.displayNumber}，料件與追蹤改在這一版維護；舊版本仍保留可比對。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={carryOnSwitch} onCheckedChange={(value) => setCarryOnSwitch(value === true)} aria-label="帶入追蹤紀錄" />
            把 {pendingCurrent?.series.current.displayNumber} 的追蹤紀錄依位號與料號帶到 {pendingCurrent?.version.displayNumber}
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applyCurrentBomVersion()}>設為目前版本</AlertDialogAction>
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
              {collaborationStatus !== "remote" && <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black", collaborationStatusMeta.badgeClassName)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", collaborationStatusMeta.dotClassName)} />
                {collaborationStatusMeta.label}
              </span>}
            </div>
            <p className="flex max-w-[48vw] items-center gap-1 text-[11px] text-slate-400">
              {activeWorkspaceProjectLabel && <span className="min-w-0 truncate text-cyan-200/70">{activeWorkspaceProjectLabel} /</span>}
              <span className="min-w-0 truncate">{activeSeriesName}{isHistoricalVersion && activeVersionInfo ? ` · ${activeVersionInfo.version.displayNumber}（歷史）` : ""}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBomManagerOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-violet-300/30 bg-violet-400/12 px-2.5 text-[11px] font-black text-violet-100"
            >
              <Layers3 className="h-4 w-4" />{seriesList.length} BOM
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
              <Button type="button" variant="outline" onClick={openPendingDialog} className={cn("h-11 border-rose-300/30 bg-rose-400/10 text-rose-100", pendingApplicationCount > 0 && "material-attention")}><TriangleAlert className="mr-2 h-4 w-4" />待處理料 {pendingApplicationCount.toLocaleString()}</Button>
              <Button type="button" variant="outline" onClick={() => setNonPvlDialogOpen(true)} disabled={isWorkspaceLoading} className="h-11 border-orange-300/30 bg-orange-400/10 text-orange-100"><FileSpreadsheet className="mr-2 h-4 w-4" />不建議料匯出 {discouragedMaterialCount.toLocaleString()}</Button>
              <Button type="button" variant="outline" onClick={() => setRlcPriorityOpen(true)} className="h-11 border-primary/30 bg-primary/10 text-primary">RLC 優先順序</Button>
              <Button type="button" variant="outline" onClick={() => setGuideOpen(true)} className="h-11 border-violet-300/30 bg-violet-400/10 text-violet-100"><CircleHelp className="mr-2 h-4 w-4" />使用說明</Button>
              {tableSettingsControl}
              <Button type="button" variant="outline" onClick={() => void prepareExportSnapshot()} disabled={isWorkspaceLoading} className="h-11 border-amber-300/30 bg-amber-400/10 text-amber-100"><Download className="mr-2 h-4 w-4" />匯出報表</Button>
            </div>
          </details>
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

          {searchColumnControl}
          <div className="flex snap-x gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" onClick={clearFilters} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", availability === "all" && !showMarkedOnly ? "border-sky-200/50 bg-sky-300 text-sky-950" : "border-sky-300/20 bg-sky-400/10 text-sky-100")}>全部 {dataset.stats.totalGroups.toLocaleString()}</button>
            <button type="button" onClick={() => applyAvailabilityFilter("required")} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", availability === "required" ? "border-amber-200/60 bg-amber-300 text-amber-950" : "border-amber-300/25 bg-amber-400/10 text-amber-100")}>料號待補 {requiredApplicationCount.toLocaleString()}</button>
            <button type="button" onClick={() => setShowMarkedOnly((current) => !current)} className={cn("h-11 min-w-[96px] snap-start rounded-xl border px-3 text-xs font-black", showMarkedOnly ? "border-lime-200/60 bg-lime-300 text-lime-950" : "border-lime-300/20 bg-lime-400/10 text-lime-100")}><Star className={cn("mr-1 inline h-3.5 w-3.5", showMarkedOnly && "fill-current")} />標記 {markedGroupCount}</button>
          </div>

          {activeFilterControls}
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
              {collaborationStatus !== "remote" && <Badge className={cn("h-6 shrink-0 border px-2 text-[11px] font-black", collaborationStatusMeta.badgeClassName)} title={collaborationStatusMeta.description}>
                <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", collaborationStatusMeta.dotClassName)} />
                {collaborationStatusMeta.label}
              </Badge>}
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
            <Button type="button" variant="outline" size="sm" data-testid="pending-materials-button" onClick={openPendingDialog} className={cn("h-9 border-destructive/60 bg-destructive px-3 text-sm font-black text-destructive-foreground hover:bg-destructive/85 hover:text-destructive-foreground", pendingApplicationCount > 0 && "material-attention")}>
              <TriangleAlert className="mr-1 h-3.5 w-3.5" />待處理料 <strong className="ml-1">{pendingApplicationCount.toLocaleString()}</strong>
            </Button>
            <Button type="button" variant="outline" size="sm" data-testid="discouraged-export-button" onClick={() => setNonPvlDialogOpen(true)} disabled={isWorkspaceLoading} title="查看依專案解除不建議使用料的申請 SOP、預覽並匯出 PLM 申請清單" className="h-9 border-warning/60 bg-warning px-3 text-sm font-black text-warning-foreground hover:bg-warning/85 hover:text-warning-foreground disabled:cursor-wait disabled:opacity-60">
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />{isExportingDiscouraged ? "匯出中…" : "不建議料匯出"} <strong className="ml-1">{discouragedMaterialCount.toLocaleString()}</strong>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canEdit || isImporting || !isCollaborativeReady || !isFullDatasetLoaded} className="h-9 border-success/60 bg-success px-3 text-sm font-black text-success-foreground hover:bg-success/85 hover:text-success-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <Upload className="mr-1 h-3.5 w-3.5" />{isImporting ? "讀取中..." : "上傳 BOM"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void prepareExportSnapshot()} disabled={isWorkspaceLoading} className="h-9 border-info/60 bg-info px-3 text-sm font-black text-info-foreground hover:bg-info/85 hover:text-info-foreground disabled:cursor-wait disabled:opacity-60">
              <Download className="mr-1 h-3.5 w-3.5" />匯出報表
            </Button>
            <Button type="button" size="sm" onClick={() => openCreate()} disabled={!canEdit || !isCollaborativeReady || !isFullDatasetLoaded} className="h-9 border border-primary/60 bg-primary px-3.5 text-sm font-black text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="mr-1 h-3.5 w-3.5" />新增料件
            </Button>
            <Button type="button" variant="outline" size="sm" data-testid="rlc-priority-button" onClick={() => setRlcPriorityOpen(true)} className="material-action-highlight h-9 border-primary/40 bg-primary/10 px-3 text-sm font-bold text-primary">RLC 優先順序</Button>
            <Button type="button" variant="outline" size="sm" data-testid="material-guide-button" onClick={() => setGuideOpen(true)} className="material-guide-attention h-9 border-[hsl(var(--platform-violet)/0.6)] bg-[hsl(var(--platform-violet))] px-3 text-sm font-black text-primary-foreground hover:bg-[hsl(var(--platform-violet)/0.85)] hover:text-primary-foreground">
              <CircleHelp className="mr-1 h-3.5 w-3.5" />上傳說明
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
              <span className="block min-w-0 truncate text-left text-[13px] font-bold leading-5 text-cyan-100">
                {activeWorkspaceProjectLabel && <span className="mr-1 font-semibold text-cyan-200/70">{activeWorkspaceProjectLabel} /</span>}
                {activeSeriesName}
                {activeVersionInfo && <span className="ml-1 text-xs font-semibold text-cyan-200/80">{activeVersionInfo.version.displayNumber}{isHistoricalVersion ? "（歷史）" : ""}</span>}
              </span>
            </SelectTrigger>
            <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">
              {bomSeriesGroups.filter((group) => group.workspaces.length > 0).map((group) => (
                <SelectGroup key={group.key}>
                  <SelectLabel className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-cyan-200/80">
                    <span className="min-w-0 truncate">{group.label}</span>
                    {group.isActive && <span className="flex-none rounded-full border border-emerald-300/35 bg-emerald-400/15 px-1.5 text-[10px] font-black normal-case leading-4 tracking-normal text-emerald-100">目前專案</span>}
                  </SelectLabel>
                  {group.workspaces.map((series) => (
                    <SelectItem key={series.id} value={series.current.workspace.id}>
                      <span className="flex max-w-[28rem] items-center gap-2 text-left">
                        <span className="min-w-0 truncate font-semibold text-slate-100">{series.name}</span>
                        <span className="flex-none rounded-full border border-cyan-300/35 bg-cyan-400/15 px-1.5 text-[10px] font-black leading-4 text-cyan-100">{series.current.displayNumber}</span>
                        {workspaceHasTrackingActivity(series.current.workspace) && (
                          <span className="flex-none rounded-full border border-amber-300/35 bg-amber-400/16 px-1.5 text-[10px] font-black leading-4 text-amber-100">追蹤</span>
                        )}
                        <span className="flex-none text-xs text-slate-400">{series.recordCount.toLocaleString()} 筆 · {formatTimestamp(series.updatedAt)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {isHistoricalVersion && activeVersionInfo && (
                <SelectGroup key="historical">
                  <SelectLabel className="text-[11px] font-black uppercase tracking-wide text-amber-200/80">檢視中的歷史版本</SelectLabel>
                  <SelectItem value={activeBomId}>
                    <span className="flex max-w-[28rem] items-center gap-2 text-left">
                      <span className="min-w-0 truncate font-semibold text-slate-100">{activeVersionInfo.series.name}</span>
                      <span className="flex-none rounded-full border border-amber-300/35 bg-amber-400/16 px-1.5 text-[10px] font-black leading-4 text-amber-100">{activeVersionInfo.version.displayNumber} 歷史</span>
                    </span>
                  </SelectItem>
                </SelectGroup>
              )}
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
              "material-action-highlight h-8 px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/30 disabled:text-slate-500",
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
          <Button type="button" variant="outline" size="sm" onClick={() => setBomManagerOpen(true)} disabled={!isCollaborativeReady} className="material-action-highlight h-8 border-violet-300/45 bg-violet-400/20 px-2.5 text-xs font-bold text-violet-50 hover:border-violet-200/70 hover:bg-violet-400/30 hover:text-white disabled:cursor-not-allowed disabled:border-violet-950/50 disabled:bg-violet-950/25 disabled:text-violet-100/50">
            <Layers3 className="mr-1.5 h-3.5 w-3.5" />BOM 管理
            <span className="ml-1.5 rounded-full border border-current/25 px-1.5 text-[10px] leading-4">{seriesList.length}</span>
          </Button>
        </div>
      </header>}

      {isHistoricalVersion && activeVersionInfo && (
        <div data-testid="material-historical-banner" role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/[0.09] px-3 py-2 text-sm text-amber-100">
          <History className="h-4 w-4 flex-none" aria-hidden="true" />
          <span className="min-w-0 flex-1">正在檢視「{activeVersionInfo.series.name}」{activeVersionInfo.version.displayNumber}（歷史版本，唯讀）；目前版本為 {activeVersionInfo.series.current.displayNumber}。料件與追蹤只能在目前版本修改。</span>
          <Button type="button" variant="outline" size="sm" onClick={() => switchActiveBom(activeVersionInfo.series.current.workspace.id)} className="h-9 border-amber-300/40 bg-amber-400/10 text-amber-50 hover:bg-amber-400/20 lg:h-8">回到目前版本 {activeVersionInfo.series.current.displayNumber}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setBomManagerOpen(true)} className="h-9 text-amber-100 hover:bg-amber-400/15 lg:h-8">比對差異</Button>
        </div>
      )}
      {(pendingRemoteRecordIds.length > 0 || hasPendingWorkspaceUpdate) && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-300/30 bg-amber-400/[0.09] px-3 py-2 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
          <div className="flex min-w-0 items-center gap-2">
            <TriangleAlert className="h-4 w-4 flex-none text-amber-300" />
            <p className="truncate text-sm font-bold text-amber-100">
              {pendingRemoteRecordIds.length > 0 ? `有 ${pendingRemoteRecordIds.length} 筆資料已由其他使用者更新` : "BOM 設定已由其他使用者更新"}
              <span className="ml-2 font-normal text-amber-100/70">
                {editorOpen ? "你正在填的內容不會被清掉，完成後再載入。" : "不會自動刷新，方便時再載入最新內容。"}
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
            <div className="relative min-w-[12rem] flex-1">
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
            {searchColumnControl}
            <div data-material-zone="summary-filters" className="flex items-center gap-1">
              <button type="button" onClick={clearFilters} aria-pressed={availability === "all" && !showMarkedOnly} className={cn("inline-flex h-9 items-center rounded-lg border px-2.5 text-xs font-black transition-colors", availability === "all" ? "border-sky-300/34 bg-sky-400/18 text-sky-50" : "border-slate-500/28 bg-slate-900/42 text-slate-200 hover:border-sky-300/20 hover:bg-sky-400/10 hover:text-sky-100")}>主料 <strong className="ml-1">{dataset.stats.totalGroups.toLocaleString()}</strong></button>
              <button type="button" onClick={() => applyAvailabilityFilter("required")} aria-pressed={availability === "required"} className={cn("inline-flex h-9 items-center rounded-lg border px-2.5 text-xs font-black transition-colors", availability === "required" ? "border-amber-300/50 bg-amber-400/20 text-amber-50" : "border-amber-300/28 bg-amber-400/10 text-amber-100 hover:bg-amber-400/18 hover:text-amber-50")}>料號待補 <strong className="ml-1">{requiredApplicationCount.toLocaleString()}</strong></button>
            </div>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger aria-label="排序" className="h-9 w-32 border-[#2a526f] bg-[#071522] text-xs text-slate-200">
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
            {tableSettingsControl}
            <Button type="button" variant="outline" size="sm" data-testid="material-export-visible" className="material-action-highlight h-9 gap-1.5 px-2.5 text-xs" disabled={exportingVisibleColumns || !isFullDatasetLoaded || isWorkspaceLoading || isSearchPending} onClick={() => void exportVisibleColumns()} title="依目前顯示欄位與順序匯出所有符合篩選的廠商明細，不受分頁限制；狀態欄匯出文字"><Download className="h-3.5 w-3.5" />{exportingVisibleColumns ? "匯出中…" : "匯出顯示欄位"}</Button>
            <span className="ml-auto text-xs text-slate-400">
              {isPreviewDataset
                ? <>先顯示 <strong className="text-cyan-200">{visibleGroupRows.length.toLocaleString()}</strong> 個主料，完整清單同步中</>
                : <>顯示 <strong className="text-cyan-200">{filteredGroups.length.toLocaleString()}</strong> / {dataset.stats.totalGroups.toLocaleString()} 個主料 · {dataset.stats.totalRecords.toLocaleString()} 筆廠商明細</>}
            </span>
          </div>
          {activeFilterControls}
        </div>

        {isCompactLayout && <div className="space-y-2 p-2 lg:hidden" data-testid="material-mobile-cards">
          <h2 className="sr-only">手機以料件卡片呈現，點開即可查看替代料與追蹤紀錄</h2>
          {visibleGroupRows.map(({ group, primaryAlternative, secondaryAlternatives }, rowIndex) => {
            const expanded = expandedKey === group.key;
            const mainRecord = primaryAlternative ?? group.primaryRecord;
            const itemValue = getGroupItemValue(group, (page - 1) * pageSize + rowIndex + 1);
            const isMarked = markedGroupKeySet.has(group.key);
            const mustApply = group.requiresApplication;
            const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred && !record.isRisk).length;

            return (
              <article
                key={group.key}
                style={buildTableRowStyle(activeTableColorTheme.primary, { backgroundAlpha: 0.48 })}
                className={cn(
                  "overflow-hidden rounded-xl border bg-[var(--material-row-solid)]",
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
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><PartUsageSummary records={group.records} /><span className="inline-flex min-w-0 items-center gap-1"><span className="text-xs text-slate-500">phase out</span><PhaseOutStatus record={mainRecord} /></span></div>
                  </button>
                  <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-500" />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto border-y border-white/5 bg-[#091827]/85 px-2.5 py-1.5 text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-black", group.riskCount > 0 ? "border-rose-300/35 bg-rose-400/12 text-rose-100" : mustApply ? "border-amber-300/35 bg-amber-400/12 text-amber-100" : "border-slate-300/30 bg-slate-400/10 text-slate-100")}>{group.riskCount > 0 ? "料況需確認" : mustApply ? "未提供虛擬／實體料號" : mainRecord.sourcingStatus || "供應／核准狀態未提供"}</span>
                  <MaterialApplicationExemptionBadge record={mainRecord} />
                  <span className="max-w-[11rem] shrink-0 truncate rounded-full border border-slate-500/20 bg-slate-800/35 px-2 py-0.5 text-slate-200">REF {mainRecord.refDes || mainRecord.refGroup || "-"}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-bold", availableAlternativeCount > 0 ? "border-emerald-300/25 bg-emerald-400/8 text-emerald-200" : "border-slate-500/25 bg-slate-800/40 text-slate-300")}>替代 {availableAlternativeCount}/{secondaryAlternatives.length}</span>
                </div>

                {expanded ? (
                  <div className="space-y-2 border-b border-cyan-200/10 bg-[#071522] p-2.5">
                    {secondaryAlternatives.length ? secondaryAlternatives.map((record) => (
                      <button key={record.id} type="button" onClick={() => openRecord(record, "view")} style={{ backgroundColor: blendWithSurface(record.isPreferred && !record.isRisk ? activeTableColorTheme.alternative : activeTableColorTheme.secondary, 0.2) }} className="flex w-full items-center gap-3 rounded-xl border border-violet-300/15 px-3 py-2 text-left">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-300/15 text-xs font-black text-violet-100">ALT</span>
                        <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{getDisplayMpn(record) || "未填 MPN"}</strong><span className="block truncate text-xs text-slate-400">{record.manufacturer || "未指定廠商"}</span></span>
                        <MaterialApplicationExemptionBadge record={record} />
                        <ChevronRight className="h-4 w-4 text-violet-200" />
                      </button>
                    )) : <p className="rounded-lg border border-dashed border-slate-600/50 px-3 py-2 text-xs text-slate-400">目前沒有替代料</p>}
                  </div>
                ) : null}

                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 p-2">
                  <Button type="button" size="sm" onClick={() => openTrackingDialog(mainRecord)} className="h-11 rounded-xl px-3 font-bold"><Pencil className="mr-1 h-4 w-4" />追蹤／更新料件</Button>
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
          <table className="material-table-crosshair table-fixed border-collapse text-[13px]" style={{ ...buildMaterialCrosshairStyle(activeTableColorTheme.crosshair), width: `max(100%, ${tableWidth}px)`, minWidth: tableWidth }} onPointerOver={event => markMaterialCrosshair(event.currentTarget, event.target)} onPointerLeave={event => clearMaterialCrosshair(event.currentTarget)} onFocusCapture={event => markMaterialCrosshair(event.currentTarget, event.target)} onBlurCapture={event => { if (!event.currentTarget.matches(":hover") && !event.currentTarget.contains(event.relatedTarget as Node | null)) clearMaterialCrosshair(event.currentTarget); }}>
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
                    <span
                      data-testid={column.key === "actions" ? "material-data-update-header" : undefined}
                      className="block truncate"
                      title={MATERIAL_TABLE_COLUMN_HELP[column.key]}
                    >
                      {column.label}
                    </span>
                  </ResizableHeader>
                ))}
              </tr>
              {/* Second header row mirrors row 5 of the CE workbook: the Chinese meaning, or the column filter where one exists. */}
              <tr className="bg-[#10263a] text-slate-100">
                {MATERIAL_TABLE_COLUMNS.map((column) => {
                  if (!columnVisibility[column.key]) return null;
                  const filterKey = MATERIAL_COLUMN_FILTER_KEYS[column.key];
                  if (filterKey) {
                    return (
                      <th key={column.key} className={column.key === "actions" ? MATERIAL_STICKY_COLUMN_CLASSES.filter : "border-r border-white/20 p-1.5"}>
                        <ExcelFilterPopover
                          filterKey={filterKey}
                          getOptions={getColumnFilterOptions}
                          label={column.key === "actions" ? "狀態追蹤" : column.label}
                          selectedValues={columnFilters[filterKey]}
                          onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, [filterKey]: values }))}
                        />
                      </th>
                    );
                  }
                  const meaning = MATERIAL_TABLE_COLUMN_MEANING[column.key] ?? "";
                  return (
                    <th key={column.key} className="border-r border-white/20 p-1.5">
                      <div className="flex h-8 items-center justify-center truncate px-1 text-[10px] font-normal leading-4 text-slate-500" title={meaning || undefined}>
                        {meaning || "—"}
                      </div>
                    </th>
                  );
                })}
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-400/15 bg-[#101d33] px-3 py-1.5 lg:pr-28">
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
