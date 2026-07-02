import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  Fragment,
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
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
  Upload,
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
  type MaterialWorkbookRecord,
  type MaterialWorkbookPayload,
  buildMaterialDataset,
  getActionLabel,
  parseMaterialWorkbookFile,
} from "./materialRequestUtils";
import {
  type BomWorkspace,
  loadBomWorkspaces,
  removeBomWorkspace,
  saveBomWorkspace,
} from "./materialBomStorage";

type AvailabilityFilter = "all" | "usable" | "required" | "pending" | "risk" | "single";
type SortMode = "reference" | "alternatives" | "approved" | "pending" | "single-source";
type EditorMode = "create" | "edit" | "view";

interface ExcelFilterOption {
  label: string;
  value: string;
  count: number;
  keywords?: string;
}

interface SavedMaterialChanges {
  added: MaterialWorkbookRecord[];
  updated: Record<string, MaterialWorkbookRecord>;
}

interface MaterialColumnFilters {
  material: string[];
  refDes: string[];
  mpn: string[];
  internal: string[];
  virtualAlternative: string[];
  trackingStatus: string[];
  specification: string[];
}

type ColumnFilterKey = keyof MaterialColumnFilters;

const EMPTY_COLUMN_FILTERS: MaterialColumnFilters = {
  material: [],
  refDes: [],
  mpn: [],
  internal: [],
  virtualAlternative: [],
  trackingStatus: [],
  specification: [],
};

const DEFAULT_BOM_ID = "bom:申請carrier料.xlsx";
const ACTIVE_BOM_KEY = "station-status-hub:active-material-bom:v1";

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const COLUMN_WIDTHS_KEY = "station-status-hub:material-column-widths:v4";
const DEFAULT_COLUMN_WIDTHS = [260, 160, 260, 210, 190, 180, 250, 130];
const MIN_COLUMN_WIDTHS = [200, 120, 180, 170, 150, 140, 180, 110];
const MAX_COLUMN_WIDTHS = [520, 360, 520, 460, 420, 360, 520, 260];

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

function createBomId(fileName: string) {
  return `bom:${fileName.trim().toLowerCase()}`;
}

function loadActiveBomId() {
  if (typeof window === "undefined") return DEFAULT_BOM_ID;
  return window.localStorage.getItem(ACTIVE_BOM_KEY) || DEFAULT_BOM_ID;
}

function parseSearchTokens(query: string) {
  return (query.match(/"[^"]+"|\S+/g) ?? [])
    .map((token) => token.replace(/^"|"$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

function isPrimaryInternalPart(record: MaterialRecord) {
  return /00$/i.test(record.partNumber.trim());
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

function getUniqueMpnCount(group: MaterialGroup) {
  return new Set(
    group.records
      .flatMap((record) => record.mpnCandidates)
      .map((mpn) => mpn.trim().toLowerCase())
      .filter(Boolean)
  ).size;
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
      ];
    case "refDes":
      return group.records.flatMap((record) => [record.refDes, record.refGroup]);
    case "mpn":
      return group.records.flatMap((record) => [record.manufacturerPartNumber, record.manufacturerPartNumberAlt]);
    case "internal":
      return group.records.flatMap((record) => [record.partNumber, record.schematicPart, record.pcbFootprint]);
    case "virtualAlternative":
      return group.records.map((record) => record.virtualAlternative ?? "");
    case "trackingStatus": {
      const values = group.records.flatMap((record) => [
        record.trackingStatus ?? "",
        record.sourcingStatus,
        record.remark,
      ]);

      if (group.requiresApplication) values.push("主料與替代都無料");
      if (group.pendingCount > 0) values.push("有待申請");
      if (group.riskCount > 0) values.push("有風險");

      return values;
    }
    case "specification":
      return [
        group.partSpec,
        group.partName,
        group.schematicPart,
        group.footprint,
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

function normalizeFilterValue(value: string) {
  const normalized = value.trim();
  return normalized || "(空白)";
}

function uniqueNormalizedValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeFilterValue)));
}

function buildExcelFilterOptions(values: string[]) {
  const counter = new Map<string, number>();

  values.forEach((value) => {
    const normalized = normalizeFilterValue(value);
    counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
  });

  return Array.from(counter.entries())
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
    .map(([value, count]) => ({
      label: value,
      value,
      count,
      keywords: value,
    }));
}

function matchesExcelFilter(selectedValues: string[], candidateValues: string[]) {
  if (selectedValues.length === 0) return true;
  const normalizedCandidates = uniqueNormalizedValues(candidateValues);
  return normalizedCandidates.some((value) => selectedValues.includes(value));
}

function matchesColumnFilters(
  group: MaterialGroup,
  filters: MaterialColumnFilters,
  ignoredKey?: ColumnFilterKey,
) {
  const keys = Object.keys(filters) as ColumnFilterKey[];
  return keys.every((key) => {
    if (key === ignoredKey) return true;
    return matchesExcelFilter(filters[key], getGroupColumnValues(group, key));
  });
}

function ExcelFilterPopover({
  label,
  options,
  selectedValues,
  onSelectedValuesChange,
  searchPlaceholder,
}: {
  label: string;
  options: ExcelFilterOption[];
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const effectiveSelected = selectedValues.length === 0 ? options.map((option) => option.value) : selectedValues;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const next = normalizedQuery
      ? options.filter((option) => `${option.label} ${option.keywords ?? ""}`.toLowerCase().includes(normalizedQuery))
      : options;

    return [...next].sort((left, right) => sortDirection === "asc"
      ? left.label.localeCompare(right.label, undefined, { numeric: true })
      : right.label.localeCompare(left.label, undefined, { numeric: true }));
  }, [options, query, sortDirection]);

  const allSelected = options.length > 0 && effectiveSelected.length === options.length;
  const summary = options.length === 0 || allSelected ? "全部" : `${effectiveSelected.length}/${options.length}`;

  const toggleValue = (value: string, checked: boolean) => {
    const current = selectedValues.length === 0 ? options.map((option) => option.value) : selectedValues;
    const next = checked
      ? Array.from(new Set([...current, value]))
      : current.filter((item) => item !== value);

    onSelectedValuesChange(next.length === options.length ? [] : next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between rounded border border-blue-300/25 bg-[#07182d] px-2 text-left text-xs font-bold text-slate-200 hover:border-cyan-300/50 hover:bg-cyan-400/10"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 flex-none text-cyan-300" />
            <span className="truncate">{label}</span>
          </span>
          <span className="ml-2 flex-none rounded bg-cyan-400/10 px-1.5 py-0.5 text-[11px] text-cyan-200">
            {summary}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] border border-blue-400/25 bg-[#0d182b] p-3 text-slate-100"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-100">{label}</p>
            <p className="text-xs text-slate-500">只顯示目前篩選結果內、這一欄真正存在的值。</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSortDirection("asc")}
              className={cn(
                "rounded border px-2 py-1.5 text-xs font-semibold",
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
                "rounded border px-2 py-1.5 text-xs font-semibold",
                sortDirection === "desc"
                  ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                  : "border-blue-300/20 bg-[#111f36] text-slate-300 hover:bg-blue-400/10"
              )}
            >
              從 Z 到 A
            </button>
          </div>

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-blue-400/20 bg-[#111f36] text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
          />

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectedValuesChange([])}
              className="h-8 px-2 text-xs text-blue-300 hover:bg-blue-400/10 hover:text-blue-200"
            >
              全選
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectedValuesChange(filteredOptions.map((option) => option.value))}
              className="h-8 px-2 text-xs text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
            >
              只留搜尋結果
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
              className="h-8 px-2 text-xs text-slate-400 hover:bg-slate-400/10 hover:text-slate-200"
            >
              清空搜尋
            </Button>
          </div>

          <ScrollArea className="h-64 rounded-xl border border-blue-400/15 bg-[#091222]">
            <div className="space-y-1 p-2">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const checked = effectiveSelected.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-200 hover:bg-blue-400/10"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleValue(option.value, value === true)}
                        className="border-blue-400/40 data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="text-xs text-slate-500">{option.count}</span>
                    </label>
                  );
                })
              ) : (
                <div className="px-2 py-8 text-center text-sm text-slate-500">找不到符合的篩選值</div>
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

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const commit = () => {
    const nextValue = draft.trim();
    setEditing(false);
    if (nextValue !== value) onSave(nextValue);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        autoFocus
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
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-center justify-between gap-2 rounded border border-teal-400/20 bg-teal-400/[0.07] px-3 py-2 text-left hover:bg-teal-400/15"
      title="直接修改 TX"
    >
      <span className={cn("break-all text-[15px] font-bold leading-6", value ? "text-teal-200 group-hover:text-teal-100" : "text-slate-400")}>{value || "點擊填寫"}</span>
      <Pencil className="h-4 w-4 flex-none text-teal-400" />
    </button>
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
          <DialogTitle className="text-2xl text-slate-50">Excel 整理與上傳流程</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            每個 BOM 保留為獨立工作區；可一次上傳多個檔案，再切換、篩選與追蹤處理狀態。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-[15px]">
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-cyan-200">1. 先下載標準範本</h3>
                <p className="mt-1 leading-6 text-slate-400">內含「上傳資料」與「填寫說明」兩張工作表，以及可直接修改的範例。</p>
              </div>
              <Button asChild className="bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400">
                <a href={templateUrl} download="料號替代料_上傳範本.xlsx">
                  <Download className="mr-2 h-4 w-4" />下載上傳範本
                </a>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-blue-400/20 bg-[#101d33] p-5">
            <h3 className="text-lg font-bold text-blue-200">2. 資料怎麼整理</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["每個廠商料一列", "同一顆料有 Murata、Samsung、TDK，就建立三列；不要把多個 MPN 塞在同一格。"],
                ["藍色列開新主料", "每個主料第一列填藍色；直到下一個藍色列以前，都視為它底下的替代料。"],
                ["Level 可有可無", "有階層時用 0=大分類、1=模組、2=料件；一般平面表沒有 Level 也能上傳。"],
                ["可用料必須同時符合兩項", "任何一列只要 Remark = OK 且 Part Number 尾數為 00 就算可用；主料不符時會繼續檢查底下替代料。"],
                ["原理圖資訊要一致", "同群組的 Part Spec、Schematic_Part、PCB_Footprint 應維持一致。"],
                ["狀態使用標準詞", "建議使用 Approved、Active、NRND、Obsolete、Disqualified，系統也支援常見中文狀態。"],
                ["追蹤欄位可選填", "TX 與 Tracking Status／處理狀態可直接放在 Excel；TX 有值時會自動帶入，空白時也能上傳後於網站填寫。"],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border border-blue-400/15 bg-[#0a1527] p-4">
                  <p className="font-bold text-slate-100">{title}</p>
                  <p className="mt-2 leading-6 text-slate-400">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
            <h3 className="text-lg font-bold text-emerald-200">3. 系統如何通用分析</h3>
            <div className="mt-4 space-y-3 leading-6 text-slate-300">
              <p><strong className="text-slate-100">欄位：</strong>辨識 Name／料名、MPN／廠商料號、Part Number／內部料號、Ref Group／群組等中英文別名。</p>
              <p><strong className="text-slate-100">工作表：</strong>比較所有工作表，選擇可辨識欄位最多且有效資料列最多的一張。</p>
              <p><strong className="text-slate-100">分組：</strong>有藍色起始列時完全依底色分組；沒有底色標記的其他格式，才退回 Ref Group＋料名規則。</p>
              <p><strong className="text-slate-100">問題料：</strong>整組每一列都沒有同時符合 Remark = OK 與 Part Number 尾數 00，且沒有填任何 TX，才列入待申請；只要一顆替代料可用或有 TX 就不算問題。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5">
            <h3 className="text-lg font-bold text-amber-200">4. 多 BOM 上傳與管理 SOP</h3>
            <ol className="mt-3 space-y-2 leading-6 text-slate-300">
              <li>1. 每個專案／板號各存成一個 `.xlsx` 或 `.xls`，檔名請包含專案與版本，避免混淆。</li>
              <li>2. 按「上傳 BOM」；可一次選取多個檔案。相同檔名會更新該 BOM，不會覆蓋其他 BOM。</li>
              <li>3. 從「目前 BOM」切換工作區；資料與網站手動修改會保存在此瀏覽器。</li>
              <li>4. 先用各欄表頭下方的篩選確認 REF DES、MPN、內部料號及問題料，再展開替代料抽查。</li>
              <li>5. TX 直接在表格內點擊填寫；處理狀態可在修改資料中填「待確認、申請中、已完成」。</li>
              <li>6. 確認後用「匯出結果」下載目前 BOM 的篩選結果；不再使用的 BOM 可按「刪除目前 BOM」。</li>
            </ol>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-blue-400/30 bg-[#0d1729] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-2xl text-slate-50">BOM 管理</DialogTitle>
          <DialogDescription className="text-[15px] leading-6 text-slate-400">
            集中管理目前瀏覽器內的 BOM 工作區，可直接切換或刪除。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {bomWorkspaces.map((workspace) => {
            const isActive = workspace.id === activeBomId;

            return (
              <div
                key={workspace.id}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  isActive ? "border-cyan-300/40 bg-cyan-400/10" : "border-blue-400/15 bg-[#101d33]"
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-bold text-slate-50">{workspace.name}</p>
                      {isActive && (
                        <span className="rounded bg-cyan-400/15 px-2 py-0.5 text-xs font-bold text-cyan-100">
                          目前使用中
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {workspace.payload.recordCount.toLocaleString()} 筆 · {workspace.payload.sheetName} · 更新 {formatTimestamp(workspace.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isActive && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelect(workspace.id)}
                        className="h-9 border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
                      >
                        切換
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(workspace.id)}
                      className="h-9 border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 hover:text-rose-100"
                    >
                      刪除
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
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
                <Label htmlFor="material-tracking-status">處理狀態</Label>
                <Input id="material-tracking-status" disabled={readOnly} value={form.trackingStatus ?? ""} onChange={(event) => updateField("trackingStatus", event.target.value)} placeholder="例如：待確認、申請中、已完成" />
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
      <td colSpan={8} className="p-0">
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
                              {primaryByPartNumber ? "尾數 00 首選" : "優先可用"}
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
                      <p className="text-center text-sm font-bold uppercase tracking-[0.16em] text-slate-500">操作</p>
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
  onCopy,
  onView,
  onEdit,
  onSaveVirtual,
}: {
  group: MaterialGroup;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
  onSaveVirtual: (record: MaterialRecord, value: string) => void;
}) {
  const alternatives = getSortedAlternatives(group).slice(1);
  const groupRefDes = group.primaryRecord.refDes || group.primaryRecord.refGroup || "-";

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
                {record.trackingStatus && <span className="rounded border border-sky-300/30 bg-sky-400/15 px-2.5 py-1 text-sm font-bold text-sky-200">{record.trackingStatus}</span>}
              </div>
            </td>

            <td className="border-r border-blue-400/10 px-4 py-3.5">
              <p className="line-clamp-2 text-[15px] leading-6 text-slate-200">{record.partSpec || record.partName || "-"}</p>
              {record.remark && <p className="mt-1 text-sm text-slate-500">{record.remark}</p>}
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
  const [activeBomId, setActiveBomId] = useState(loadActiveBomId);
  const [query, setQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<MaterialColumnFilters>(EMPTY_COLUMN_FILTERS);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();

  const activeWorkspace = bomWorkspaces.find((workspace) => workspace.id === activeBomId) ?? bomWorkspaces[0];
  const basePayload = activeWorkspace.payload;

  const dataset = useMemo<MaterialDataset>(
    () => buildMaterialDataset(basePayload),
    [basePayload]
  );

  useEffect(() => {
    let active = true;
    loadBomWorkspaces()
      .then((storedWorkspaces) => {
        if (!active) return;
        if (storedWorkspaces.length === 0) {
          const fallbackWorkspace = createDefaultBomWorkspace();
          setBomWorkspaces([fallbackWorkspace]);
          setActiveBomId(fallbackWorkspace.id);
          void saveBomWorkspace(fallbackWorkspace).catch(() => undefined);
          return;
        }
        setBomWorkspaces(storedWorkspaces);
        const preferredBomId = loadActiveBomId();
        setActiveBomId(
          storedWorkspaces.some((workspace) => workspace.id === preferredBomId)
            ? preferredBomId
            : storedWorkspaces[0].id
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
    void saveBomWorkspace(workspace).catch(() => undefined);
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
      : "至少一顆可用料 有可用替代 remark ok 尾數 00 usable material";
    const searchableText = `${group.searchText} ${alternativeSearchText} ${applicationSearchText}`;

    return searchTokens.every((token) => searchableText.includes(token));
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

  const columnFilterOptions = useMemo(() => {
    const keys = Object.keys(EMPTY_COLUMN_FILTERS) as ColumnFilterKey[];

    return keys.reduce((result, key) => {
      const values = dataset.groups
        .filter((group) => matchesSearch(group) && matchesAvailability(group) && matchesColumnFilters(group, columnFilters, key))
        .flatMap((group) => getGroupColumnValues(group, key));

      result[key] = buildExcelFilterOptions(values);
      return result;
    }, {} as Record<ColumnFilterKey, ExcelFilterOption[]>);
  }, [availability, columnFilters, dataset.groups, searchTokens]);

  const filteredGroups = useMemo(() => {
    const result = dataset.groups.filter((group) => {
      return matchesSearch(group) && matchesColumnFilters(group, columnFilters) && matchesAvailability(group);
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
  }, [availability, columnFilters, dataset.groups, searchTokens, sortMode]);

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

  useEffect(() => {
    setPage(1);
  }, [availability, columnFilters, deferredQuery, pageSize, sortMode]);

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

  const handleWorkbookImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsImporting(true);
    try {
      let lastWorkspaceId = activeBomId;
      let totalRecords = 0;
      for (const file of files) {
        const payload = await parseMaterialWorkbookFile(file);
        const workspace: BomWorkspace = {
          id: createBomId(file.name),
          name: file.name,
          payload,
          updatedAt: new Date().toISOString(),
        };
        replaceBomWorkspace(workspace);
        lastWorkspaceId = workspace.id;
        totalRecords += payload.recordCount;
      }
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
    setEditorRecord(createRecordTemplate(group));
    setEditorMode("create");
    setEditorOpen(true);
  };

  const openRecord = (record: MaterialRecord, mode: EditorMode) => {
    setEditorRecord(toWorkbookRecord(record));
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const saveRecordToActiveBom = (record: MaterialWorkbookRecord) => {
    const exists = basePayload.records.some((item) => item.id === record.id);
    const records = exists
      ? basePayload.records.map((item) => item.id === record.id ? record : item)
      : [...basePayload.records, record];
    replaceBomWorkspace({
      ...activeWorkspace,
      payload: { ...basePayload, records, recordCount: records.length },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveRecord = (record: MaterialWorkbookRecord) => {
    saveRecordToActiveBom(record);

    setEditorOpen(false);
    toast({
      title: editorMode === "create" ? "料件已新增" : "料件已更新",
      description: `${record.manufacturer || "未指定廠商"} ${record.manufacturerPartNumber || record.name}`,
    });
  };

  const saveVirtualAlternative = (record: MaterialRecord, value: string) => {
    saveRecordToActiveBom({ ...toWorkbookRecord(record), virtualAlternative: value });
  };

  const switchActiveBom = (value: string) => {
    setActiveBomId(value);
    setQuery("");
    setColumnFilters(EMPTY_COLUMN_FILTERS);
    setAvailability("all");
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
      toast({
        title: "BOM 已刪除",
        description: remaining.length === 0 ? "已自動建立新的預設備援 BOM。" : `剩餘 ${remaining.length} 個 BOM。`,
      });
    } catch {
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
      getSortedAlternatives(group).map((record) => ({
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
        處理狀態: record.trackingStatus ?? "",
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
            <Button type="button" onClick={() => openCreate()} className="h-9 bg-cyan-500 px-3 text-sm font-bold text-slate-950 hover:bg-cyan-400">
              <Plus className="mr-2 h-4 w-4" />新增料件
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white">
              <Upload className="mr-2 h-4 w-4" />{isImporting ? "讀取中..." : "上傳 BOM"}
            </Button>
            <Button type="button" variant="outline" onClick={handleExport} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white">
              <Download className="mr-2 h-4 w-4" />匯出結果
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-blue-400/15 pt-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-slate-300">切換 BOM</span>
            <Select value={activeBomId} onValueChange={switchActiveBom}>
              <SelectTrigger className="h-10 w-full max-w-xl border-cyan-400/30 bg-[#0a1527] text-cyan-100 sm:w-[28rem]"><SelectValue /></SelectTrigger>
              <SelectContent className="border-cyan-400/25 bg-[#101a2d] text-slate-100">
                {orderedBomWorkspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    <div className="flex flex-col py-0.5">
                      <span className="font-semibold text-slate-100">{workspace.name}</span>
                      <span className="text-xs text-slate-400">{workspace.payload.recordCount.toLocaleString()} 筆 · 更新 {formatTimestamp(workspace.updatedAt)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="rounded bg-blue-400/10 px-2.5 py-1 text-sm font-bold text-blue-200">{bomWorkspaces.length} 個 BOM</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setBomManagerOpen(true)} className="h-9 border-blue-400/20 bg-blue-400/10 text-slate-200 hover:bg-blue-400/20 hover:text-white">
              <Layers3 className="mr-2 h-4 w-4" />BOM管理
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{activeWorkspace.payload.sheetName} · {formatTimestamp(activeWorkspace.updatedAt)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void deleteActiveBom()} className="h-9 border-rose-400/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 hover:text-rose-100">刪除目前 BOM</Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-blue-400/15 pt-3 text-sm">
          <button type="button" onClick={clearFilters} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "all" ? "border-blue-300/50 bg-blue-400/20 text-blue-100" : "border-blue-300/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20 hover:text-blue-100")}>主料總數 <strong className="ml-1">{dataset.stats.totalGroups.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("required")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "required" ? "border-amber-300/60 bg-amber-400/25 text-amber-100" : "border-amber-300/35 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25 hover:text-amber-100")}>主料與替代都無料 <strong className="ml-1">{requiredApplicationCount.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("usable")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "usable" ? "border-emerald-300/55 bg-emerald-400/25 text-emerald-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20 hover:text-emerald-100")}>至少一顆可用 <strong className="ml-1">{usableGroupCount.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("single")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "single" ? "border-orange-300/55 bg-orange-400/25 text-orange-100" : "border-orange-300/25 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20 hover:text-orange-100")}>無替代料 <strong className="ml-1">{noAlternativeCount.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("pending")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "pending" ? "border-yellow-300/55 bg-yellow-400/25 text-yellow-100" : "border-yellow-300/25 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/20 hover:text-yellow-100")}>有待申請 <strong className="ml-1">{pendingGroupCount.toLocaleString()}</strong></button>
          <button type="button" onClick={() => applyAvailabilityFilter("risk")} className={cn("rounded-md border px-2.5 py-1 font-bold transition-colors", availability === "risk" ? "border-rose-300/55 bg-rose-400/25 text-rose-100" : "border-rose-300/25 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 hover:text-rose-100")}>有風險 <strong className="ml-1">{riskGroupCount.toLocaleString()}</strong></button>
          <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 font-bold text-cyan-200">廠商料明細 <strong className="ml-1">{dataset.stats.totalRecords.toLocaleString()}</strong></span>
        </div>
      </header>

      <section className="mt-3 rounded-xl border border-blue-400/15 bg-[#0d182b] p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(390px,1fr)_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料名、MPN、內部料號；也可輸入『完全無料』" className="h-10 border-blue-400/30 bg-[#111f36] pl-12 text-[15px] text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500" />
          </div>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-10 border-blue-400/20 bg-[#111f36] text-sm text-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="reference">依 Ref 排序</SelectItem><SelectItem value="single-source">無替代料優先</SelectItem><SelectItem value="alternatives">替代料多到少</SelectItem><SelectItem value="approved">Approved 多到少</SelectItem><SelectItem value="pending">待申請多到少</SelectItem>
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
                  "操作",
                ].map((label, columnIndex) => (
                  <ResizableHeader
                    key={label}
                    width={columnWidths[columnIndex]}
                    minWidth={MIN_COLUMN_WIDTHS[columnIndex]}
                    maxWidth={MAX_COLUMN_WIDTHS[columnIndex]}
                    resizable={columnIndex < 7}
                    onResize={(width) => resizeColumn(columnIndex, width)}
                    className={columnIndex === 7 ? "border-r-0 text-center" : undefined}
                  >
                    {label}
                  </ResizableHeader>
                ))}
              </tr>
              <tr className="bg-[#102b57] text-slate-100">
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="料件" options={columnFilterOptions.material} selectedValues={columnFilters.material} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, material: values }))} searchPlaceholder="搜尋料名 / 廠商" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="REF DES" options={columnFilterOptions.refDes} selectedValues={columnFilters.refDes} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, refDes: values }))} searchPlaceholder="搜尋 REF DES" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="MPN" options={columnFilterOptions.mpn} selectedValues={columnFilters.mpn} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, mpn: values }))} searchPlaceholder="搜尋 MPN" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="內部料號" options={columnFilterOptions.internal} selectedValues={columnFilters.internal} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, internal: values }))} searchPlaceholder="搜尋料號 / Symbol / Footprint" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="TX" options={columnFilterOptions.virtualAlternative} selectedValues={columnFilters.virtualAlternative} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, virtualAlternative: values }))} searchPlaceholder="搜尋 TX" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="狀態" options={columnFilterOptions.trackingStatus} selectedValues={columnFilters.trackingStatus} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, trackingStatus: values }))} searchPlaceholder="搜尋處理狀態 / Remark" /></th>
                <th className="border-r border-blue-300/20 p-2"><ExcelFilterPopover label="規格" options={columnFilterOptions.specification} selectedValues={columnFilters.specification} onSelectedValuesChange={(values) => setColumnFilters((current) => ({ ...current, specification: values }))} searchPlaceholder="搜尋規格 / 備註" /></th>
                <th className="p-2 text-center"><button type="button" onClick={clearFilters} className="h-8 rounded border border-blue-300/25 bg-blue-400/10 px-2 text-xs font-bold text-blue-100 hover:bg-blue-400/20">清除</button></th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group) => {
                const expanded = expandedKey === group.key;
                const mustApply = group.requiresApplication;
                const uniqueMpnCount = getUniqueMpnCount(group);
                const noAlternative = uniqueMpnCount <= 1;
                const sortedAlternatives = getSortedAlternatives(group);
                const primaryAlternative = sortedAlternatives[0];
                const secondaryAlternatives = sortedAlternatives.slice(1);
                const primaryReady = Boolean(primaryAlternative?.isPreferred);
                const availableAlternativeCount = secondaryAlternatives.filter((record) => record.isPreferred).length;
                const groupRefDes = primaryAlternative?.refDes || group.primaryRecord.refDes || group.primaryRecord.refGroup || "-";

                return (
                  <Fragment key={group.key}>
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
                        <div className="flex flex-col items-start gap-2">{mustApply ? <span className="rounded-md border border-amber-300/50 bg-amber-400/25 px-3 py-1.5 text-[15px] font-black text-amber-100">主料與替代都無料</span> : primaryReady ? <span className="rounded-md border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-[15px] font-black text-emerald-200">主料已建</span> : <span className="rounded-md border border-cyan-300/40 bg-cyan-400/20 px-3 py-1.5 text-[15px] font-black text-cyan-100">已有可用替代 {availableAlternativeCount}</span>}{primaryAlternative?.trackingStatus && <span className="rounded border border-sky-300/30 bg-sky-400/15 px-2.5 py-1 text-sm font-bold text-sky-200">{primaryAlternative.trackingStatus}</span>}{!primaryReady && <span className={cn("text-sm font-semibold leading-5", mustApply ? "text-amber-200" : "text-cyan-200")}>主料 Remark: {primaryAlternative?.remark || "未填"}<br />主料 Part Number: {primaryAlternative?.partNumber || "未填"}</span>}{availableAlternativeCount > 0 && <span className="rounded bg-emerald-400/15 px-2.5 py-1 text-sm font-bold text-emerald-300">可用替代 {availableAlternativeCount}</span>}{group.pendingCount > 0 && <span className="rounded bg-slate-400/10 px-2.5 py-1 text-sm font-semibold text-slate-300">待建明細 {group.pendingCount}</span>}</div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 text-[15px] leading-6 text-slate-400"><p className="line-clamp-2">{group.partSpec || group.partName || "-"}</p></td>
                      <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-8 w-full border-cyan-400/25 bg-cyan-400/10 px-2 text-sm text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100"><Plus className="mr-1 h-3.5 w-3.5" />替代料</Button>
                      </td>
                    </tr>
                    {expanded && <CompactAlternativeRows group={group} onCopy={handleCopy} onView={(record) => openRecord(record, "view")} onEdit={(record) => openRecord(record, "edit")} onSaveVirtual={saveVirtualAlternative} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {visibleGroups.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Search className="h-10 w-10 text-slate-600" /><p className="mt-3 text-lg font-bold text-slate-300">找不到符合條件的料</p><p className="mt-1 text-[15px] text-slate-500">請清除篩選，或改用 MPN、廠商、Footprint 搜尋。</p></div>}
        </div>

        <div className="flex flex-col gap-3 border-t border-blue-400/15 bg-[#101d33] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-400"><span>每頁</span><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="h-9 w-24 border-blue-400/20 bg-[#0b1527] text-slate-200"><SelectValue /></SelectTrigger><SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">{PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} 列</SelectItem>)}</SelectContent></Select><span>第 {page} / {totalPages} 頁</span></div>
          <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300"><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button><Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="h-9 border-blue-400/20 bg-[#0b1527] text-sm text-slate-300">下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
        </div>
      </section>
    </div>
  );
}
