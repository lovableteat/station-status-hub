import {
  type ChangeEvent,
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

type AvailabilityFilter = "all" | "usable" | "pending" | "risk";
type SortMode = "reference" | "alternatives" | "approved" | "pending";
type EditorMode = "create" | "edit" | "view";

interface SavedMaterialChanges {
  added: MaterialWorkbookRecord[];
  updated: Record<string, MaterialWorkbookRecord>;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";

function toWorkbookRecord(record: MaterialWorkbookRecord): MaterialWorkbookRecord {
  return {
    id: record.id,
    sectionName: record.sectionName,
    assemblyName: record.assemblyName,
    level: record.level,
    name: record.name,
    qty: record.qty,
    refDes: record.refDes,
    manufacturerPartNumber: record.manufacturerPartNumber,
    manufacturerPartNumberAlt: record.manufacturerPartNumberAlt,
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
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sectionName: group?.sectionName ?? "",
    assemblyName: group?.assemblyName ?? "",
    level: 2,
    name: group?.name ?? "",
    qty: group?.qty ?? 1,
    refDes: group?.displayRef ?? "",
    manufacturerPartNumber: "",
    manufacturerPartNumberAlt: "",
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

function parseSearchTokens(query: string) {
  return (query.match(/"[^"]+"|\S+/g) ?? [])
    .map((token) => token.replace(/^"|"$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

function getAlternativeScore(record: MaterialRecord) {
  if (record.isApproved && record.isReady && !record.isRisk) return 0;
  if (record.isApproved && !record.isRisk) return 1;
  if (record.isReady && !record.isRisk) return 2;
  if (!record.isRisk) return 3;
  return 4;
}

function getSortedAlternatives(group: MaterialGroup) {
  return [...group.records].sort((left, right) => {
    const scoreDiff = getAlternativeScore(left) - getAlternativeScore(right);
    if (scoreDiff !== 0) return scoreDiff;

    return left.manufacturer.localeCompare(right.manufacturer);
  });
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

function StatusPill({ record }: { record: MaterialRecord }) {
  if (record.isRisk) {
    return (
      <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
        {record.sourcingStatus || "風險料"}
      </span>
    );
  }

  if (record.isApproved) {
    return (
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
        Approved
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
      {record.sourcingStatus || "未標記"}
    </span>
  );
}

function ActionPill({ record }: { record: MaterialRecord }) {
  const className = record.isReady
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : record.isPending
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-semibold", className)}>
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

function AlternativeTable({
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
  const alternatives = getSortedAlternatives(group);

  return (
    <div className="border-y border-blue-200 bg-blue-50/70 px-5 py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">可用廠商料號</h3>
          <p className="mt-1 text-xs text-slate-600">
            已優先排列 Approved、已建檔且非風險的料；點複製可直接帶去原理圖或料庫搜尋。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {group.schematicPart && (
            <span className="rounded-lg border border-cyan-200 bg-white px-3 py-1.5 font-mono text-cyan-800">
              Symbol: {group.schematicPart}
            </span>
          )}
          {group.footprint && (
            <span className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 font-mono text-indigo-800">
              Footprint: {group.footprint}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1320px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-600">
              <th className="w-16 border-b border-r border-slate-200 px-3 py-3 text-center">順位</th>
              <th className="min-w-44 border-b border-r border-slate-200 px-3 py-3">廠商</th>
              <th className="min-w-60 border-b border-r border-slate-200 px-3 py-3">Manufacturer P/N</th>
              <th className="min-w-52 border-b border-r border-slate-200 px-3 py-3">第二料號</th>
              <th className="min-w-32 border-b border-r border-slate-200 px-3 py-3">供料狀態</th>
              <th className="min-w-44 border-b border-r border-slate-200 px-3 py-3">建料狀態</th>
              <th className="min-w-40 border-b border-r border-slate-200 px-3 py-3">內部料號</th>
              <th className="min-w-64 border-b border-slate-200 px-3 py-3">規格 / 備註</th>
              <th className="w-32 border-b border-l border-slate-200 px-3 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {alternatives.map((record, index) => {
              const preferred = index === 0 && getAlternativeScore(record) <= 1;
              return (
                <tr
                  key={record.id}
                  className={cn(
                    "border-b border-slate-100 align-top text-slate-700 last:border-b-0",
                    preferred ? "bg-emerald-50/70" : "bg-white hover:bg-sky-50/60"
                  )}
                >
                  <td className="border-r border-slate-100 px-3 py-3 text-center">
                    {preferred ? (
                      <span className="inline-flex rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white">
                        首選
                      </span>
                    ) : (
                      <span className="font-mono text-slate-400">{index + 1}</span>
                    )}
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3 font-semibold text-slate-900">
                    {record.manufacturer || "-"}
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="break-all font-mono font-semibold text-blue-700">
                        {record.manufacturerPartNumber || "-"}
                      </span>
                      {record.manufacturerPartNumber && (
                        <button
                          type="button"
                          onClick={() => onCopy(record.manufacturerPartNumber)}
                          className="rounded-md border border-blue-200 bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100"
                          title="複製廠商料號"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3 font-mono text-xs text-slate-700">
                    {record.manufacturerPartNumberAlt || "-"}
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3">
                    <StatusPill record={record} />
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3">
                    <ActionPill record={record} />
                  </td>
                  <td className="border-r border-slate-100 px-3 py-3 font-mono text-xs font-semibold text-slate-800">
                    {record.partNumber || "尚未建立"}
                  </td>
                  <td className="px-3 py-3 text-xs leading-5 text-slate-600">
                    <p>{record.partName || record.partSpec || "-"}</p>
                    {record.remark && <p className="mt-1 text-slate-500">{record.remark}</p>}
                  </td>
                  <td className="border-l border-slate-100 px-3 py-3">
                    <div className="flex justify-center gap-1">
                      <button type="button" onClick={() => onView(record)} className="rounded-md border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300 hover:bg-cyan-400/20" title="查看詳細資訊">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onEdit(record)} className="rounded-md border border-blue-400/30 bg-blue-400/10 p-2 text-blue-300 hover:bg-blue-400/20" title="修改">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MaterialRequestPage() {
  const [basePayload, setBasePayload] = useState<MaterialWorkbookPayload>(
    seedPayload as MaterialWorkbookPayload
  );
  const [savedChanges, setSavedChanges] = useState<SavedMaterialChanges>(loadSavedChanges);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [manufacturer, setManufacturer] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isImporting, setIsImporting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("view");
  const [editorRecord, setEditorRecord] = useState<MaterialWorkbookRecord>(createRecordTemplate());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const { toast } = useToast();

  const effectivePayload = useMemo<MaterialWorkbookPayload>(() => {
    const records = basePayload.records
      .map((record) => savedChanges.updated[record.id] ?? record)
      .concat(savedChanges.added);

    return {
      ...basePayload,
      recordCount: records.length,
      records,
    };
  }, [basePayload, savedChanges]);

  const dataset = useMemo<MaterialDataset>(
    () => buildMaterialDataset(effectivePayload),
    [effectivePayload]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_CHANGES_KEY, JSON.stringify(savedChanges));
    } catch {
      // The page remains usable even if browser storage is unavailable.
    }
  }, [savedChanges]);

  const manufacturers = useMemo(
    () =>
      Array.from(new Set(dataset.records.map((record) => record.manufacturer).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [dataset.records]
  );

  const searchTokens = useMemo(() => parseSearchTokens(deferredQuery), [deferredQuery]);

  const filteredGroups = useMemo(() => {
    const result = dataset.groups.filter((group) => {
      const matchesSearch = searchTokens.every((token) => group.searchText.includes(token));
      const matchesManufacturer =
        manufacturer === "all" || group.manufacturers.includes(manufacturer);
      const matchesAvailability =
        availability === "all" ||
        (availability === "usable" && group.approvedCount > 0 && group.riskCount < group.totalCount) ||
        (availability === "pending" && group.pendingCount > 0) ||
        (availability === "risk" && group.riskCount > 0);

      return matchesSearch && matchesManufacturer && matchesAvailability;
    });

    return [...result].sort((left, right) => {
      if (sortMode === "alternatives" && left.totalCount !== right.totalCount) {
        return right.totalCount - left.totalCount;
      }
      if (sortMode === "approved" && left.approvedCount !== right.approvedCount) {
        return right.approvedCount - left.approvedCount;
      }
      if (sortMode === "pending" && left.pendingCount !== right.pendingCount) {
        return right.pendingCount - left.pendingCount;
      }
      return left.displayRef.localeCompare(right.displayRef, undefined, { numeric: true });
    });
  }, [availability, dataset.groups, manufacturer, searchTokens, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const visibleGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [availability, deferredQuery, manufacturer, pageSize, sortMode]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (searchTokens.length > 0 && filteredGroups.length <= 12) {
      setExpandedKeys(new Set(filteredGroups.map((group) => group.key)));
    }
  }, [deferredQuery]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const payload = await parseMaterialWorkbookFile(file);
      setBasePayload(payload);
      setSavedChanges({ added: [], updated: {} });
      setExpandedKeys(new Set());
      setPage(1);
      toast({
        title: "Excel 已更新",
        description: `已載入 ${payload.recordCount.toLocaleString()} 筆廠商料明細。`,
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

  const handleSaveRecord = (record: MaterialWorkbookRecord) => {
    setSavedChanges((current) => {
      if (record.id.startsWith("manual-")) {
        const exists = current.added.some((item) => item.id === record.id);
        return {
          ...current,
          added: exists
            ? current.added.map((item) => (item.id === record.id ? record : item))
            : [...current.added, record],
        };
      }

      return {
        ...current,
        updated: { ...current.updated, [record.id]: record },
      };
    });

    setEditorOpen(false);
    setExpandedKeys((current) => new Set(current).add(`${record.refGroup}::${record.name}`));
    toast({
      title: editorMode === "create" ? "料件已新增" : "料件已更新",
      description: `${record.manufacturer || "未指定廠商"} ${record.manufacturerPartNumber || record.name}`,
    });
  };

  const handleExport = () => {
    const rows = filteredGroups.flatMap((group) =>
      getSortedAlternatives(group).map((record) => ({
        Ref_Group: group.displayRef,
        電路料名稱: group.name,
        模組: group.assemblyName,
        Qty: group.qty,
        Symbol: group.schematicPart,
        Footprint: group.footprint,
        廠商: record.manufacturer,
        Manufacturer_PN: record.manufacturerPartNumber,
        Manufacturer_PN_2: record.manufacturerPartNumberAlt,
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
    setAvailability("all");
    setManufacturer("all");
    setSortMode("reference");
    setExpandedKeys(new Set());
  };

  const expandCurrentPage = () => {
    const allVisibleExpanded = visibleGroups.every((group) => expandedKeys.has(group.key));
    setExpandedKeys((current) => {
      const next = new Set(current);
      visibleGroups.forEach((group) => {
        if (allVisibleExpanded) next.delete(group.key);
        else next.add(group.key);
      });
      return next;
    });
  };

  return (
    <div className="material-sheet-theme min-h-full bg-[#07101f] p-4 text-slate-100 sm:p-6 lg:p-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleWorkbookImport}
      />

      <MaterialRecordDialog
        open={editorOpen}
        mode={editorMode}
        record={editorRecord}
        onOpenChange={setEditorOpen}
        onModeChange={setEditorMode}
        onSave={handleSaveRecord}
      />

      <section className="overflow-hidden rounded-3xl border border-sky-400/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.13),transparent_32%),linear-gradient(135deg,#111d33,#0c1629)] shadow-[0_24px_70px_-38px_rgba(56,189,248,0.6)]">
        <div className="flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">BOM / AVL WORKSHEET</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">料號與替代料工作表</h1>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">
              一個電路料一列，展開即可比較所有廠商料號。適合畫原理圖、建立 Symbol / Footprint，以及確認可替代料。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => openCreate()} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
              <Plus className="mr-2 h-4 w-4" />
              新增料件
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20 hover:text-white"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isImporting ? "讀取中..." : "更新 Excel"}
            </Button>
            <Button type="button" onClick={handleExport} className="bg-blue-600 text-white hover:bg-blue-500">
              <Download className="mr-2 h-4 w-4" />
              匯出搜尋結果
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="電路料群組" value={dataset.stats.totalGroups} note="主料列數" icon={Layers3} tone="blue" />
        <SummaryTile label="Approved" value={dataset.stats.approvedRecords} note="已核准廠商料" icon={CircleCheck} tone="green" />
        <SummaryTile label="待申請" value={dataset.stats.pendingRecords} note="待建立 Part / Symbol" icon={TriangleAlert} tone="amber" />
        <SummaryTile label="廠商料明細" value={dataset.stats.totalRecords} note="Excel 原始料件列" icon={Factory} tone="cyan" />
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_190px_220px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='搜尋 Ref、料名、內部料號、廠商、MPN、規格、Footprint、Symbol；空白代表 AND，可用 "完整詞"'
              className="h-11 border-slate-200 bg-sky-50/60 pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500"
            />
          </div>

          <Select value={availability} onValueChange={(value) => setAvailability(value as AvailabilityFilter)}>
            <SelectTrigger className="h-11 border-slate-200 bg-white text-slate-800">
              <Filter className="mr-2 h-4 w-4 text-blue-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="usable">有可用料</SelectItem>
              <SelectItem value="pending">有待申請</SelectItem>
              <SelectItem value="risk">有風險料</SelectItem>
            </SelectContent>
          </Select>

          <Select value={manufacturer} onValueChange={setManufacturer}>
            <SelectTrigger className="h-11 border-slate-200 bg-white text-slate-800">
              <SelectValue placeholder="選擇廠商" />
            </SelectTrigger>
            <SelectContent className="max-h-80 border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部廠商</SelectItem>
              {manufacturers.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-11 border-slate-200 bg-white text-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="reference">依 Ref 排序</SelectItem>
              <SelectItem value="alternatives">替代料多到少</SelectItem>
              <SelectItem value="approved">Approved 多到少</SelectItem>
              <SelectItem value="pending">待申請多到少</SelectItem>
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" onClick={clearFilters} className="h-11 border-slate-200 bg-white text-slate-700 hover:bg-slate-100">
            <RotateCcw className="mr-2 h-4 w-4" />
            清除
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            找到 <strong className="text-blue-700">{filteredGroups.length.toLocaleString()}</strong> 個電路料群組；搜尋會比對群組內所有替代料。
          </p>
          <p>來源：{dataset.meta.sourceFile} / {dataset.meta.sheetName} / {formatTimestamp(dataset.meta.generatedAt)}</p>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-600">A1</span>
            <span className="text-sm font-semibold text-slate-700">料號總表</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={expandCurrentPage} className="border-slate-200 bg-white text-slate-700 hover:bg-sky-50">
            {visibleGroups.every((group) => expandedKeys.has(group.key)) && visibleGroups.length > 0 ? (
              <ChevronUp className="mr-2 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-2 h-4 w-4" />
            )}
            展開 / 收合本頁
          </Button>
        </div>

        <div className="max-h-[68vh] overflow-auto">
          <table className="min-w-[1540px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-blue-600 text-left text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                <th className="sticky left-0 z-30 w-14 border-r border-blue-500 bg-blue-700 px-2 py-3 text-center">#</th>
                <th className="w-14 border-r border-blue-500 px-2 py-3 text-center">開啟</th>
                <th className="min-w-36 border-r border-blue-500 px-3 py-3">Ref Group</th>
                <th className="min-w-72 border-r border-blue-500 px-3 py-3">電路料名稱 / 規格</th>
                <th className="min-w-52 border-r border-blue-500 px-3 py-3">模組</th>
                <th className="w-20 border-r border-blue-500 px-3 py-3 text-center">Qty</th>
                <th className="min-w-44 border-r border-blue-500 px-3 py-3">Symbol</th>
                <th className="min-w-44 border-r border-blue-500 px-3 py-3">Footprint</th>
                <th className="min-w-48 border-r border-blue-500 px-3 py-3">內部料號</th>
                <th className="w-28 border-r border-blue-500 px-3 py-3 text-center">替代料</th>
                <th className="w-36 px-3 py-3 text-center">可用狀態</th>
                <th className="w-32 border-l border-blue-500 px-3 py-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group, index) => {
                const expanded = expandedKeys.has(group.key);
                const rowNumber = (page - 1) * pageSize + index + 1;
                const usableCount = group.records.filter((record) => record.isApproved && !record.isRisk).length;

                return (
                  <Fragment key={group.key}>
                    <tr
                      className={cn(
                        "border-b border-slate-200 text-slate-700 transition-colors",
                        expanded ? "bg-sky-100" : index % 2 === 0 ? "bg-white hover:bg-sky-50" : "bg-slate-50/70 hover:bg-sky-50"
                      )}
                    >
                      <td className={cn("sticky left-0 z-10 border-r border-slate-200 px-2 py-3 text-center font-mono text-xs text-slate-400", expanded ? "bg-sky-100" : index % 2 === 0 ? "bg-white" : "bg-slate-50")}>{rowNumber}</td>
                      <td className="border-r border-slate-200 px-2 py-3 text-center">
                        <button type="button" onClick={() => toggleExpanded(group.key)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 shadow-sm hover:bg-blue-100" aria-label={expanded ? "收合替代料" : "展開替代料"}>
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-3 font-mono font-bold text-blue-700">{group.displayRef}</td>
                      <td className="border-r border-slate-200 px-3 py-3">
                        <button type="button" onClick={() => toggleExpanded(group.key)} className="block w-full text-left">
                          <p className="font-bold text-slate-900">{group.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{group.partSpec || group.partName || "-"}</p>
                        </button>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-3 text-xs">{group.assemblyName || "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-3 text-center font-mono">{group.qty}</td>
                      <td className="border-r border-slate-200 px-3 py-3 font-mono text-xs text-cyan-800">{group.schematicPart || "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-3 font-mono text-xs text-indigo-800">{group.footprint || "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-3">
                        <div className="flex max-w-48 flex-wrap gap-1">
                          {group.internalPartNumbers.slice(0, 2).map((partNumber) => (
                            <span key={partNumber} className="rounded bg-slate-100 px-1.5 py-1 font-mono text-[11px] text-slate-700">{partNumber}</span>
                          ))}
                          {group.internalPartNumbers.length > 2 && <span className="rounded bg-blue-50 px-1.5 py-1 text-[11px] font-semibold text-blue-700">+{group.internalPartNumbers.length - 2}</span>}
                        </div>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-3 text-center">
                        <button type="button" onClick={() => toggleExpanded(group.key)} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-bold text-blue-700 hover:bg-blue-100">{group.totalCount} 筆</button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {usableCount > 0 ? (
                          <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">可用 {usableCount}</Badge>
                        ) : group.pendingCount > 0 ? (
                          <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">待申請 {group.pendingCount}</Badge>
                        ) : (
                          <Badge className="border-0 bg-slate-100 text-slate-600 hover:bg-slate-100">待確認</Badge>
                        )}
                      </td>
                      <td className="border-l border-slate-200 px-3 py-3 text-center">
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-8 border-cyan-400/30 bg-cyan-400/10 px-2 text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100">
                          <Plus className="mr-1 h-3.5 w-3.5" />替代料
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={12} className="p-0">
                          <AlternativeTable
                            group={group}
                            onCopy={handleCopy}
                            onView={(record) => openRecord(record, "view")}
                            onEdit={(record) => openRecord(record, "edit")}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {visibleGroups.length === 0 && (
            <div className="flex min-h-52 flex-col items-center justify-center bg-white px-6 text-center">
              <Search className="h-10 w-10 text-slate-300" />
              <p className="mt-3 font-bold text-slate-700">找不到符合條件的料</p>
              <p className="mt-1 text-sm text-slate-500">可清除篩選，或改用 MPN、廠商、Footprint 搜尋。</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>每頁</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-24 border-slate-200 bg-white text-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
                {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size} 列</SelectItem>)}
              </SelectContent>
            </Select>
            <span>第 {page} / {totalPages} 頁</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="border-slate-200 bg-white text-slate-700"><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button>
            <Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="border-slate-200 bg-white text-slate-700">下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
