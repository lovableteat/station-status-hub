import {
  type ChangeEvent,
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

type AvailabilityFilter = "all" | "usable" | "required" | "pending" | "risk" | "single";
type SortMode = "reference" | "alternatives" | "approved" | "pending" | "single-source";
type EditorMode = "create" | "edit" | "view";

interface SavedMaterialChanges {
  added: MaterialWorkbookRecord[];
  updated: Record<string, MaterialWorkbookRecord>;
}

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const LOCAL_CHANGES_KEY = "station-status-hub:material-changes:v1";
const COLUMN_WIDTHS_KEY = "station-status-hub:material-column-widths:v3";
const DEFAULT_COLUMN_WIDTHS = [300, 190, 300, 250, 240, 200, 280, 150];
const MIN_COLUMN_WIDTHS = [240, 140, 220, 200, 170, 160, 220, 120];
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

function ResizableHeader({
  children,
  width,
  minWidth,
  maxWidth,
  onResize,
  className,
}: {
  children: ReactNode;
  width: number;
  minWidth: number;
  maxWidth: number;
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
      <button
        type="button"
        aria-label="拖曳調整欄寬"
        title="拖曳調整欄寬"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        className="absolute inset-y-0 right-0 z-30 w-2 touch-none cursor-col-resize border-r-2 border-transparent hover:border-cyan-300 active:border-cyan-200"
      />
    </th>
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
                ["藍色列開新主料", "每個主料第一列填藍色；直到下一個藍色列以前，都視為它底下的替代料。"],
                ["Level 可有可無", "有階層時用 0=大分類、1=模組、2=料件；一般平面表沒有 Level 也能上傳。"],
                ["可用料必須同時符合兩項", "任何一列只要 Remark = OK 且 Part Number 尾數為 00 就算可用；主料不符時會繼續檢查底下替代料。"],
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
              <p><strong className="text-slate-100">分組：</strong>有藍色起始列時完全依底色分組；沒有底色標記的其他格式，才退回 Ref Group＋料名規則。</p>
              <p><strong className="text-slate-100">問題料：</strong>整組每一列都沒有同時符合 Remark = OK 與 Part Number 尾數 00，才列入待申請；只要一顆替代料可用就不算問題。</p>
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
                <Label htmlFor="material-virtual-alternative">虛擬替代料</Label>
                <Input id="material-virtual-alternative" disabled={readOnly} value={form.virtualAlternative ?? ""} onChange={(event) => updateField("virtualAlternative", event.target.value)} placeholder="填寫暫用、規劃或追蹤紀錄" />
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
}: {
  group: MaterialGroup;
  onCopy: (value: string) => void;
  onView: (record: MaterialRecord) => void;
  onEdit: (record: MaterialRecord) => void;
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
              <button type="button" onClick={() => onEdit(record)} className="group flex w-full items-center justify-between gap-2 rounded border border-teal-400/20 bg-teal-400/[0.07] px-3 py-2 text-left hover:bg-teal-400/15" title="修改虛擬替代料">
                <span className={cn("break-all text-[15px] font-bold leading-6", record.virtualAlternative ? "text-teal-200 group-hover:text-teal-100" : "text-slate-400")}>{record.virtualAlternative || "點擊填寫"}</span>
                <Pencil className="h-4 w-4 flex-none text-teal-400" />
              </button>
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
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
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

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    } catch {
      // Column resizing still works for the current session without browser storage.
    }
  }, [columnWidths]);

  const resizeColumn = (index: number, width: number) => {
    setColumnWidths((current) => current.map((value, columnIndex) => columnIndex === index ? width : value));
  };

  const tableWidth = columnWidths.reduce((total, width) => total + width, 0);

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
      const noAlternative = hasNoAlternative(group);
      const mustApply = requiresApplication(group);
      const alternativeSearchText = noAlternative
        ? "單一料 無替代料 單一來源 single source no alternative"
        : "有替代料 multiple source alternative";
      const applicationSearchText = mustApply
        ? "完全無料 主料與替代都無料 待申請料 必須申請 must apply no usable material"
        : "至少一顆可用料 有可用替代 remark ok 尾數 00 usable material";
      const searchableText = `${group.searchText} ${alternativeSearchText} ${applicationSearchText}`;
      const matchesSearch = searchTokens.every((token) => searchableText.includes(token));
      const matchesManufacturer =
        manufacturer === "all" || group.manufacturers.includes(manufacturer);
      const matchesAvailability =
        availability === "all" ||
        (availability === "usable" && !mustApply) ||
        (availability === "required" && mustApply) ||
        (availability === "pending" && group.pendingCount > 0) ||
        (availability === "risk" && group.riskCount > 0) ||
        (availability === "single" && noAlternative);

      return matchesSearch && matchesManufacturer && matchesAvailability;
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
  }, [availability, dataset.groups, manufacturer, searchTokens, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const noAlternativeCount = useMemo(
    () => dataset.groups.filter(hasNoAlternative).length,
    [dataset.groups]
  );
  const requiredApplicationCount = useMemo(
    () => dataset.groups.filter(requiresApplication).length,
    [dataset.groups]
  );
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
        REF_DES: record.refDes || group.primaryRecord.refDes,
        電路料名稱: group.name,
        模組: group.assemblyName,
        Qty: group.qty,
        Symbol: group.schematicPart,
        Footprint: group.footprint,
        廠商: record.manufacturer,
        Manufacturer_PN: record.manufacturerPartNumber,
        Manufacturer_PN_2: record.manufacturerPartNumberAlt,
        虛擬替代料: record.virtualAlternative ?? "",
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

  const showRequiredApplications = () => {
    setQuery("");
    setAvailability("required");
    setManufacturer("all");
    setExpandedKey(null);
  };

  return (
    <div className="material-sheet-theme min-h-full bg-[#07101f] p-4 text-slate-100 sm:p-5 lg:p-6">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleWorkbookImport} />

      <UploadGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
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
              <Upload className="mr-2 h-4 w-4" />{isImporting ? "讀取中..." : "更新 Excel"}
            </Button>
            <Button type="button" variant="outline" onClick={handleExport} className="h-9 border-blue-400/20 bg-transparent px-3 text-sm text-slate-300 hover:bg-blue-400/10 hover:text-white">
              <Download className="mr-2 h-4 w-4" />匯出結果
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-blue-400/15 pt-3 text-sm">
          <span className="text-slate-400">主料總數 <strong className="ml-1 text-blue-200">{dataset.stats.totalGroups.toLocaleString()}</strong></span>
          <button type="button" onClick={showRequiredApplications} className="rounded-md border border-amber-300/50 bg-amber-400/20 px-2.5 py-1 font-bold text-amber-200 hover:bg-amber-400/30 hover:text-amber-100">主料與替代都無料 <strong className="ml-1 text-amber-100">{requiredApplicationCount.toLocaleString()}</strong></button>
          <span className="text-slate-400">無替代料 <strong className="ml-1 text-orange-300">{noAlternativeCount.toLocaleString()}</strong></span>
          <span className="text-slate-400">廠商料明細 <strong className="ml-1 text-cyan-300">{dataset.stats.totalRecords.toLocaleString()}</strong></span>
        </div>
      </header>

      <section className="mt-3 rounded-xl border border-blue-400/15 bg-[#0d182b] p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(390px,1fr)_180px_220px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料名、MPN、內部料號；也可輸入『完全無料』" className="h-10 border-blue-400/30 bg-[#111f36] pl-12 text-[15px] text-slate-100 placeholder:text-slate-400 focus-visible:ring-blue-500" />
          </div>

          <Select value={availability} onValueChange={(value) => setAvailability(value as AvailabilityFilter)}>
            <SelectTrigger className="h-10 border-blue-400/20 bg-[#111f36] text-sm text-slate-200"><Filter className="mr-2 h-4 w-4 text-blue-400" /><SelectValue /></SelectTrigger>
            <SelectContent className="border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部狀態</SelectItem><SelectItem value="required">主料與替代都無料</SelectItem><SelectItem value="single">單一料 / 無替代</SelectItem><SelectItem value="usable">至少一顆可用料</SelectItem><SelectItem value="pending">有待申請明細</SelectItem><SelectItem value="risk">有風險料</SelectItem>
            </SelectContent>
          </Select>

          <Select value={manufacturer} onValueChange={setManufacturer}>
            <SelectTrigger className="h-10 border-blue-400/20 bg-[#111f36] text-sm text-slate-200"><SelectValue placeholder="全部廠商" /></SelectTrigger>
            <SelectContent className="max-h-80 border-blue-400/25 bg-[#101a2d] text-slate-100">
              <SelectItem value="all">全部廠商</SelectItem>{manufacturers.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>

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
          <table className="table-fixed border-collapse text-[15px]" style={{ width: tableWidth, minWidth: tableWidth }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#244b96] text-left text-[15px] font-bold text-white shadow-sm">
                {[
                  "主料 / 廠商",
                  "REF DES",
                  "MPN",
                  "內部料號 / 圖面",
                  "虛擬替代料",
                  "狀態",
                  "規格 / 備註",
                  "操作",
                ].map((label, columnIndex) => (
                  <ResizableHeader
                    key={label}
                    width={columnWidths[columnIndex]}
                    minWidth={MIN_COLUMN_WIDTHS[columnIndex]}
                    maxWidth={MAX_COLUMN_WIDTHS[columnIndex]}
                    onResize={(width) => resizeColumn(columnIndex, width)}
                    className={columnIndex === 7 ? "border-r-0 text-center" : undefined}
                  >
                    {label}
                  </ResizableHeader>
                ))}
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
                        <button type="button" onClick={() => primaryAlternative && openRecord(primaryAlternative, "edit")} className="group flex w-full items-center justify-between gap-2 rounded border border-teal-400/20 bg-teal-400/[0.07] px-3 py-2 text-left hover:bg-teal-400/15" title="修改虛擬替代料">
                          <span className={cn("break-all text-[15px] font-bold leading-6", primaryAlternative?.virtualAlternative ? "text-teal-200 group-hover:text-teal-100" : "text-slate-400")}>{primaryAlternative?.virtualAlternative || "點擊填寫"}</span>
                          <Pencil className="h-4 w-4 flex-none text-teal-400" />
                        </button>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3">
                        <div className="flex flex-col items-start gap-2">{mustApply ? <span className="rounded-md border border-amber-300/50 bg-amber-400/25 px-3 py-1.5 text-[15px] font-black text-amber-100">主料與替代都無料</span> : primaryReady ? <span className="rounded-md border border-emerald-300/40 bg-emerald-400/20 px-3 py-1.5 text-[15px] font-black text-emerald-200">主料已建</span> : <span className="rounded-md border border-cyan-300/40 bg-cyan-400/20 px-3 py-1.5 text-[15px] font-black text-cyan-100">已有可用替代 {availableAlternativeCount}</span>}{!primaryReady && <span className={cn("text-sm font-semibold leading-5", mustApply ? "text-amber-200" : "text-cyan-200")}>主料 Remark: {primaryAlternative?.remark || "未填"}<br />主料 Part Number: {primaryAlternative?.partNumber || "未填"}</span>}{availableAlternativeCount > 0 && <span className="rounded bg-emerald-400/15 px-2.5 py-1 text-sm font-bold text-emerald-300">可用替代 {availableAlternativeCount}</span>}{group.pendingCount > 0 && <span className="rounded bg-slate-400/10 px-2.5 py-1 text-sm font-semibold text-slate-300">待建明細 {group.pendingCount}</span>}</div>
                      </td>
                      <td className="border-r border-blue-400/10 px-4 py-3 text-[15px] leading-6 text-slate-400"><p className="line-clamp-2">{group.partSpec || group.partName || "-"}</p></td>
                      <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreate(group)} className="h-8 w-full border-cyan-400/25 bg-cyan-400/10 px-2 text-sm text-cyan-300 hover:bg-cyan-400/20 hover:text-cyan-100"><Plus className="mr-1 h-3.5 w-3.5" />替代料</Button>
                      </td>
                    </tr>
                    {expanded && <CompactAlternativeRows group={group} onCopy={handleCopy} onView={(record) => openRecord(record, "view")} onEdit={(record) => openRecord(record, "edit")} />}
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
