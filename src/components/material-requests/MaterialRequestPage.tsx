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

function isPrimaryInternalPart(record: MaterialRecord) {
  return /00$/i.test(record.partNumber.trim());
}

function getAlternativeScore(record: MaterialRecord) {
  const primaryOffset = isPrimaryInternalPart(record) ? 0 : 10;

  if (record.isApproved && record.isReady && !record.isRisk) return primaryOffset;
  if (record.isApproved && !record.isRisk) return primaryOffset + 1;
  if (record.isReady && !record.isRisk) return primaryOffset + 2;
  if (!record.isRisk) return primaryOffset + 3;
  return primaryOffset + 4;
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
            使用標準範本最穩定；系統也能辨識常見中英文欄名與沒有 Level 的一般明細表。
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
                ["同料固定同一群組", "替代料的 Ref_tmp 與 Name 必須完全相同，這是最可靠的分組方式。"],
                ["Level 可有可無", "有階層時用 0=大分類、1=模組、2=料件；一般平面表沒有 Level 也能上傳。"],
                ["已建料才填內部料號", "Part Number 有值代表已建立；尾數 00 會排為第一首選，未建立就留白並在 Remark 填需申請項目。"],
                ["原理圖資訊要一致", "同群組的 Part Spec、Schematic_Part、PCB_Footprint 應維持一致。"],
                ["狀態使用標準詞", "建議使用 Approved、Active、NRND、Obsolete、Disqualified，系統也支援常見中文狀態。"],
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
              <p><strong className="text-slate-100">分組：</strong>依 Ref Group → Ref Des → 料名＋規格＋Footprint 的順序判斷替代料關係。</p>
              <p><strong className="text-slate-100">狀態：</strong>自動區分可用、待申請與 Obsolete／NRND／停產等風險狀態。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-5">
            <h3 className="text-lg font-bold text-amber-200">4. 上傳前後</h3>
            <ol className="mt-3 space-y-2 leading-6 text-slate-300">
              <li>1. 在 Excel 篩選檢查空白 MPN、錯誤群組與重複列。</li>
              <li>2. 回到本頁按「更新 Excel」，選擇 `.xlsx` 或 `.xls`。</li>
              <li>3. 上傳新檔會以該檔案作為新的資料來源，並清除目前瀏覽器中的手動異動。</li>
              <li>4. 上傳後先搜尋一個 Ref，展開確認廠商料、內部料號、Symbol 與 Footprint。</li>
            </ol>
          </section>
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
  const alternatives = getSortedAlternatives(group);
  const allMpns = alternatives
    .map((record) => record.manufacturerPartNumber)
    .filter(Boolean)
    .join("\n");

  return (
    <tr className="border-b border-blue-400/20 bg-[#07111f]">
      <td colSpan={6} className="p-0">
        <div className="border-y border-blue-400/20 bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(7,17,31,0.96))] px-5 py-5 lg:px-7">
          <div className="mb-4 flex flex-col gap-3 border-b border-blue-400/15 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-50">廠商替代料比較</h3>
                <span className="rounded-full bg-blue-400/15 px-3 py-1 text-sm font-bold text-blue-200">
                  {alternatives.length} 筆
                </span>
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
                    "rounded-2xl border p-4 transition-colors",
                    preferred
                      ? "border-emerald-400/35 bg-emerald-400/[0.08] shadow-[inset_4px_0_0_rgba(52,211,153,0.65)]"
                      : "border-blue-400/15 bg-[#0d192b] hover:border-blue-400/30"
                  )}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(150px,1fr)_minmax(180px,1.25fr)_minmax(160px,0.9fr)_minmax(160px,0.95fr)_minmax(180px,1.1fr)_100px] xl:items-start">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">順位 / 廠商</p>
                      <div className="mt-2 flex items-start gap-3">
                        <span className={cn("flex h-8 min-w-8 items-center justify-center rounded-lg font-mono text-sm font-black", preferred ? "bg-emerald-400 text-emerald-950" : "bg-slate-700 text-slate-200")}>{index + 1}</span>
                        <div>
                          <p className="text-[15px] font-bold leading-6 text-slate-50">{record.manufacturer || "未填廠商"}</p>
                          {preferred && (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                              {primaryByPartNumber ? "尾數 00 首選" : "優先可用"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Manufacturer P/N</p>
                      {record.manufacturerPartNumber ? (
                        <button type="button" onClick={() => onCopy(record.manufacturerPartNumber)} className="group mt-2 flex max-w-full items-start gap-2 rounded-lg border border-blue-400/25 bg-blue-400/10 px-3 py-2.5 text-left hover:bg-blue-400/20" title="複製 MPN">
                          <span className="break-all font-mono text-[15px] font-black leading-5 text-blue-200">{record.manufacturerPartNumber}</span>
                          <Copy className="mt-0.5 h-4 w-4 flex-none text-blue-300 opacity-80 group-hover:opacity-100" />
                        </button>
                      ) : (
                        <p className="mt-2 font-semibold text-amber-300">未填 MPN</p>
                      )}
                      {record.manufacturerPartNumberAlt && <p className="mt-2 break-all font-mono text-sm text-slate-400">第二料號：{record.manufacturerPartNumberAlt}</p>}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">內部料號</p>
                      {record.partNumber ? (
                        <button type="button" onClick={() => onCopy(record.partNumber)} className="group mt-2 flex max-w-full items-start gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2.5 text-left hover:bg-cyan-300/20" title="複製內部料號">
                          <span className="break-all font-mono text-[15px] font-black leading-5 text-cyan-200">{record.partNumber}</span>
                          <Copy className="mt-0.5 h-4 w-4 flex-none text-cyan-300 opacity-80 group-hover:opacity-100" />
                        </button>
                      ) : (
                        <p className="mt-2 font-bold text-amber-300">尚未建立</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">狀態</p>
                      <div className="mt-2 flex flex-col items-start gap-2">
                        <StatusPill record={record} />
                        <ActionPill record={record} />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">規格 / 備註</p>
                      <p className="mt-2 text-[15px] leading-6 text-slate-200">{record.partSpec || record.partName || "-"}</p>
                      {record.remark && <p className="mt-1 text-sm leading-5 text-slate-400">{record.remark}</p>}
                    </div>

                    <div>
                      <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-slate-500">操作</p>
                      <div className="mt-2 grid gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => onView(record)} className="border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 hover:text-white">
                          <Eye className="mr-1.5 h-4 w-4" />詳細
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(record)} className="border-blue-400/25 bg-blue-400/10 text-blue-200 hover:bg-blue-400/20 hover:text-white">
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

export function MaterialRequestPage() {
  const [basePayload, setBasePayload] = useState<MaterialWorkbookPayload>(
    seedPayload as MaterialWorkbookPayload
  );
  const [savedChanges, setSavedChanges] = useState<SavedMaterialChanges>(loadSavedChanges);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [manufacturer, setManufacturer] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("reference");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isImporting, setIsImporting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
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
    if (searchTokens.length > 0 && filteredGroups.length === 1) {
      setExpandedKey(filteredGroups[0].key);
    }
  }, [deferredQuery]);

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
    const file = event.target.files?.[0];
    if (!file) return;

    const hasLocalChanges = savedChanges.added.length > 0 || Object.keys(savedChanges.updated).length > 0;
    if (
      hasLocalChanges &&
      !window.confirm("上傳新的 Excel 會清除目前瀏覽器中的手動新增與修改。確定要繼續嗎？")
    ) {
      event.target.value = "";
      return;
    }

    setIsImporting(true);
    try {
      const payload = await parseMaterialWorkbookFile(file);
      setBasePayload(payload);
      setSavedChanges({ added: [], updated: {} });
      setExpandedKey(null);
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
    setExpandedKey(`${record.refGroup}::${record.name}`);
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
    setExpandedKey(null);
  };

  return (
    <div className="material-sheet-theme min-h-full bg-[#07101f] p-4 text-slate-100 sm:p-5 lg:p-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleWorkbookImport} />

      <UploadGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <MaterialRecordDialog open={editorOpen} mode={editorMode} record={editorRecord} onOpenChange={setEditorOpen} onModeChange={setEditorMode} onSave={handleSaveRecord} />

      <header className="rounded-2xl border border-blue-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.11),transparent_34%),linear-gradient(135deg,#111d33,#0b1527)] p-5 shadow-[0_18px_55px_-38px_rgba(56,189,248,0.65)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-50 sm:text-[28px]">料號與替代料</h1>
              <p className="mt-1 text-[15px] text-slate-400">點主料展開廠商料；一次只開一組，方便逐列比較。</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setGuideOpen(true)} className="h-11 border-amber-400/30 bg-amber-400/10 px-4 text-[15px] font-bold text-amber-200 hover:bg-amber-400/20 hover:text-amber-100">
              <CircleHelp className="mr-2 h-4 w-4" />上傳說明
            </Button>
            <Button type="button" onClick={() => openCreate()} className="h-11 bg-cyan-500 px-4 text-[15px] font-bold text-slate-950 hover:bg-cyan-400">
              <Plus className="mr-2 h-4 w-4" />新增料件
            </Button>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="h-11 border-sky-400/30 bg-sky-400/10 px-4 text-[15px] text-sky-200 hover:bg-sky-400/20 hover:text-white">
              <Upload className="mr-2 h-4 w-4" />{isImporting ? "讀取中..." : "更新 Excel"}
            </Button>
            <Button type="button" onClick={handleExport} className="h-11 bg-blue-600 px-4 text-[15px] text-white hover:bg-blue-500">
              <Download className="mr-2 h-4 w-4" />匯出結果
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-blue-400/15 pt-4 text-[15px]">
          <span className="text-slate-400">電路料 <strong className="ml-1 text-blue-300">{dataset.stats.totalGroups.toLocaleString()}</strong></span>
          <span className="text-slate-400">Approved <strong className="ml-1 text-emerald-300">{dataset.stats.approvedRecords.toLocaleString()}</strong></span>
          <span className="text-slate-400">待申請 <strong className="ml-1 text-amber-300">{dataset.stats.pendingRecords.toLocaleString()}</strong></span>
          <span className="text-slate-400">廠商料 <strong className="ml-1 text-cyan-300">{dataset.stats.totalRecords.toLocaleString()}</strong></span>
        </div>
      </header>

      <section className="mt-4 rounded-2xl border border-blue-400/15 bg-[#0d182b] p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(390px,1fr)_180px_220px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋 Ref、料名、廠商、MPN、內部料號、Symbol、Footprint..." className="h-12 border-blue-400/20 bg-[#111f36] pl-12 text-base text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
          </div>

          <Select value={availability} onValueChange={(value) => setAvailability(value as AvailabilityFilter)}>
            <SelectTrigger className="h-12 border-blue-400/20 bg-[#111f36] text-[15px] text-slate-200"><Filter className="mr-2 h-4 w-4 text-blue-400" /><SelectValue /></SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部狀態</SelectItem><SelectItem value="usable">有可用料</SelectItem><SelectItem value="pending">有待申請</SelectItem><SelectItem value="risk">有風險料</SelectItem>
            </SelectContent>
          </Select>

          <Select value={manufacturer} onValueChange={setManufacturer}>
            <SelectTrigger className="h-12 border-blue-400/20 bg-[#111f36] text-[15px] text-slate-200"><SelectValue placeholder="全部廠商" /></SelectTrigger>
            <SelectContent className="max-h-80 border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部廠商</SelectItem>{manufacturers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-12 border-blue-400/20 bg-[#111f36] text-[15px] text-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="reference">依 Ref 排序</SelectItem><SelectItem value="alternatives">替代料多到少</SelectItem><SelectItem value="approved">Approved 多到少</SelectItem><SelectItem value="pending">待申請多到少</SelectItem>
            </SelectContent>
          </Select>

          <Button type="button" variant="outline" onClick={clearFilters} className="h-12 border-blue-400/20 bg-[#111f36] px-4 text-[15px] text-slate-300 hover:bg-blue-400/10 hover:text-white"><RotateCcw className="mr-2 h-4 w-4" />清除</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <p>找到 <strong className="text-blue-300">{filteredGroups.length.toLocaleString()}</strong> 組，搜尋會包含每組底下所有廠商料。</p>
          <p>{dataset.meta.sourceFile} · {dataset.meta.sheetName} · {formatTimestamp(dataset.meta.generatedAt)}</p>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-blue-400/15 bg-[#0b1527] shadow-sm">
        <div className="flex items-center justify-between border-b border-blue-400/15 bg-[#101d33] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">料號總表</h2>
            <p className="mt-1 text-sm text-slate-500">點擊整列展開替代料；內部料號尾數 00 固定排第一首選。</p>
          </div>
          {expandedKey && <Button type="button" variant="outline" size="sm" onClick={() => setExpandedKey(null)} className="border-blue-400/20 bg-blue-400/10 text-slate-300 hover:bg-blue-400/20">收合目前料件</Button>}
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[1120px] w-full table-fixed border-collapse text-[15px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#244b96] text-left text-sm font-bold text-white shadow-sm">
                <th className="w-[30%] border-r border-blue-300/20 px-4 py-3.5">料件 / 廠商</th>
                <th className="w-[23%] border-r border-blue-300/20 px-4 py-3.5">料號 / MPN</th>
                <th className="w-[17%] border-r border-blue-300/20 px-4 py-3.5">原理圖 / 內部料號</th>
                <th className="w-[14%] border-r border-blue-300/20 px-4 py-3.5">狀態</th>
                <th className="w-[16%] border-r border-blue-300/20 px-4 py-3.5">規格 / 備註</th>
                <th className="w-28 px-3 py-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group, index) => {
                const expanded = expandedKey === group.key;
                const usableCount = group.records.filter((record) => record.isApproved && !record.isRisk).length;

                return (
                  <Fragment key={group.key}>
                    <tr onClick={() => toggleExpanded(group.key)} className={cn("cursor-pointer border-b border-blue-400/15 text-slate-200 transition-colors", expanded ? "bg-blue-500/[0.16]" : index % 2 === 0 ? "bg-[#101b2f] hover:bg-blue-400/[0.09]" : "bg-[#0d182b] hover:bg-blue-400/[0.09]") }>
                      <td className="border-r border-blue-400/10 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg border", expanded ? "border-blue-300/40 bg-blue-400/20 text-blue-200" : "border-blue-400/20 bg-blue-400/10 text-blue-300")}>{expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold text-blue-300">{group.displayRef}</span><span className="rounded bg-blue-400/10 px-2 py-0.5 text-xs font-semibold text-blue-200">{group.totalCount} 個廠商料</span></div>
                            <p className="mt-1.5 text-base font-bold leading-6 text-slate-50">{group.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{group.assemblyName || "未指定模組"} · Qty {group.qty}</p>
                          </div>
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {group.internalPartNumbers.slice(0, 2).map((partNumber) => (
                            <button
                              key={partNumber}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCopy(partNumber);
                              }}
                              className="group flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 hover:bg-cyan-300/20"
                              title="複製內部料號"
                            >
                              <span className="font-mono text-[15px] font-black text-cyan-200">{partNumber}</span>
                              <Copy className="h-4 w-4 text-cyan-300 opacity-80 group-hover:opacity-100" />
                            </button>
                          ))}
                          {group.internalPartNumbers.length === 0 && <span className="text-sm font-semibold text-amber-300">尚未建立</span>}
                          {group.internalPartNumbers.length > 2 && <span className="self-center rounded-md bg-blue-400/10 px-2 py-1 text-sm font-semibold text-blue-300">另有 {group.internalPartNumbers.length - 2} 個</span>}
                        </div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-4">
                        <p className="font-mono text-sm font-semibold text-cyan-300">{group.schematicPart || "No Symbol"}</p>
                        <p className="mt-2 break-all font-mono text-sm text-indigo-300">{group.footprint || "No Footprint"}</p>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-4">
                        <div className="flex flex-col items-start gap-2">{usableCount > 0 ? <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">可用 {usableCount}</span> : <span className="rounded-full bg-slate-400/10 px-3 py-1 text-sm text-slate-400">尚無可用料</span>}{group.pendingCount > 0 && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-300">待申請 {group.pendingCount}</span>}</div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-4 text-sm leading-6 text-slate-400"><p className="line-clamp-3">{group.partSpec || group.partName || "-"}</p></td>
                      <td className="px-3 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-9 border-cyan-400/25 bg-cyan-400/10 px-3 text-sm text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100"><Plus className="mr-1 h-4 w-4" />替代料</Button>
                      </td>
                    </tr>
                    {expanded && <AlternativeRows group={group} onCopy={handleCopy} onView={(record) => openRecord(record, "view")} onEdit={(record) => openRecord(record, "edit")} />}
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
