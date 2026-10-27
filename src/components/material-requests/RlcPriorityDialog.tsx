import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MaterialGroup } from "./materialRequestUtils";
import {
  buildRlcPriorityGroups, isRlcPriorityRank,
  type RlcPriorityCandidate, type RlcPriorityRule, type RlcPrioritySpecGroup, type RlcQualification,
} from "./rlcPriority";

export interface RlcPriorityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current BOM's own assigned project; never use the page's unrelated active project. */
  projectId: string | null;
  projectName: string;
  /** Full BOM groups, before the page's pending/status/keyword filters. */
  groups: MaterialGroup[];
  rules: RlcPriorityRule[];
  canEdit: boolean;
  loading?: boolean;
  saving?: boolean;
  error?: string | null;
  onReload?: () => Promise<void> | void;
  /** Persist one immutable project/spec/candidate identity; reject on failure. */
  onSaveRule: (rule: RlcPriorityRule) => Promise<void> | void;
}

const QUALIFICATIONS: Array<[RlcQualification, string]> = [
  ["pending", "待確認"], ["approved", "已通過"], ["not-required", "不適用／免承認"], ["blocked", "未通過"],
];
const STATUS_LABELS = { all: "全部狀態", "needs-action": "待處理", recommended: "已有建議" };
const KIND_LABELS = { all: "全部 R／L／C", R: "R 電阻", L: "L 電感", C: "C 電容" };
const PAGE_SIZE = 8;

function recommendationText(spec: RlcPrioritySpecGroup): string {
  const { status, candidateKey, rank } = spec.recommendation;
  if (status === "unassigned") return "未指派專案";
  if (status === "needs-qualification") return "待確認使用資格";
  if (status === "needs-ranking") return "合格料待設定優先序";
  if (status === "tied") return `優先序 ${rank} 同名次，請調整`;
  const candidate = spec.candidates.find(item => item.key === candidateKey);
  return `建議：${candidate?.manufacturer} · ${candidate?.mpn}`;
}

function CandidateEditor({ candidate, draft, onDraftChange, editable, saving, onSaveRule }: {
  candidate: RlcPriorityCandidate;
  draft: RlcPriorityRule;
  onDraftChange: (rule: RlcPriorityRule | null) => void;
  editable: boolean;
  saving: boolean;
  onSaveRule: RlcPriorityDialogProps["onSaveRule"];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const label = `${candidate.manufacturer || "未提供廠商"} ${candidate.mpn || "未提供 MPN"}`;
  const disabled = !editable || saving || busy || !candidate.manufacturer || !candidate.mpn;
  const rankValid = draft.rank === null || isRlcPriorityRank(draft.rank);
  const dirty = JSON.stringify(draft) !== JSON.stringify(candidate.rule);
  const change = (patch: Partial<RlcPriorityRule>) => { onDraftChange({ ...draft, ...patch }); setMessage(""); setSaveError(""); };
  const save = async () => {
    if (disabled || !rankValid || !dirty) return;
    setBusy(true); setSaveError(""); setMessage("");
    try { await onSaveRule(draft); onDraftChange(null); setMessage("已儲存此專案的候選料規則"); }
    catch (error) { setSaveError(error instanceof Error ? error.message : "儲存失敗，請重試"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 border-b border-border py-4 last:border-b-0" data-testid="rlc-candidate">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="break-all font-semibold">{candidate.manufacturer || "未提供廠商"} <span className="font-mono">{candidate.mpn || "未提供 MPN"}</span></h4>
        <span className={cn("text-sm", candidate.eligible ? "text-primary" : "text-warning")}>{candidate.eligible ? "資格齊備" : "尚不可推薦"}</span>
        {!candidate.inCurrentBom && <span className="text-sm text-warning">目前 BOM 未包含</span>}
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">來源實體料號：</dt><dd className="inline break-all font-mono">{candidate.realPartNumbers.join("、") || "未提供"}</dd></div>
        <div><dt className="inline text-muted-foreground">來源虛擬料號：</dt><dd className="inline break-all font-mono">{candidate.virtualPartNumbers.join("、") || "未提供"}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-muted-foreground">來源供料／零件狀態：</dt><dd className="inline">{[...new Set(candidate.records.flatMap(record => [record.sourcingStatus, record.partUsageStatus, record.phaseOutStatus].filter(Boolean)))].join("、") || "未提供"}</dd></div>
      </dl>
      {candidate.exclusionReasons.length > 0 && <p className="break-words text-sm text-warning">排除原因：{candidate.exclusionReasons.join("；")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([ ["customerApproval", "客戶承認"], ["avl", "AVL"], ["engineering", "工程確認"] ] as const).map(([field, title]) => (
          <label key={field} className="space-y-1 text-sm"><span>{title}</span>
            <Select value={draft[field]} onValueChange={value => change({ [field]: value as RlcQualification })} disabled={disabled} aria-label={`${label} ${title}`}>
              <SelectTrigger aria-label={`${label} ${title}`} className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{QUALIFICATIONS.map(([value, caption]) => <SelectItem key={value} value={value}>{caption}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        ))}
        <label className="space-y-1 text-sm"><span>優先序（數字越小越優先）</span>
          <Input type="number" min={1} step={1} value={draft.rank ?? ""} disabled={disabled} aria-label={`${label} 優先序`} aria-invalid={!rankValid} onChange={event => change({ rank: event.target.value === "" ? null : Number(event.target.value) })} placeholder="未排序" className="rounded-lg" />
        </label>
      </div>
      {!rankValid && <p role="alert" className="text-sm text-destructive">優先序請填正整數，或留空表示未排序</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span>確認依據／文件或單號</span><Textarea value={draft.evidence} onChange={event => change({ evidence: event.target.value })} disabled={disabled} aria-label={`${label} 確認依據`} rows={2} className="min-h-20 rounded-lg" placeholder="記錄此專案的承認依據，供人工核對" /></label>
        <label className="space-y-1 text-sm"><span>備註</span><Textarea value={draft.notes} onChange={event => change({ notes: event.target.value })} disabled={disabled} aria-label={`${label} 備註`} rows={2} className="min-h-20 rounded-lg" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={disabled || !rankValid || !dirty} onClick={save} data-testid="rlc-save-rule">{busy ? "儲存中…" : "儲存候選料規則"}</Button>
        {dirty && <Button type="button" size="sm" variant="ghost" disabled={saving || busy} onClick={() => { onDraftChange(null); setSaveError(''); }}>還原最新規則</Button>}
        {dirty && <span className="text-sm text-warning">尚有未儲存變更</span>}
        {message && <span role="status" className="text-sm text-primary">{message}</span>}
        {saveError && <span role="alert" className="text-sm text-destructive">{saveError}</span>}
      </div>
    </div>
  );
}

export function RlcPriorityDialog({ open, onOpenChange, projectId, projectName, groups, rules, canEdit, loading = false, saving = false, error, onReload, onSaveRule }: RlcPriorityDialogProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS_LABELS>("all");
  const [kind, setKind] = useState<keyof typeof KIND_LABELS>("all");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RlcPriorityRule>>({});
  const specs = useMemo(() => buildRlcPriorityGroups(groups, projectId, rules), [groups, projectId, rules]);
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return specs.filter(spec => (
      (kind === "all" || spec.kind === kind)
      && (status === "all" || (status === "recommended" ? spec.recommendation.status === "recommended" : spec.recommendation.status !== "recommended"))
      && (!keyword || [spec.spec, ...spec.refs, ...spec.candidates.flatMap(candidate => [candidate.manufacturer, candidate.mpn, ...candidate.realPartNumbers, ...candidate.virtualPartNumbers])].join(" ").toLowerCase().includes(keyword))
    ));
  }, [specs, query, status, kind]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = pageRows.find(spec => spec.key === selectedKey) || pageRows[0];
  const editable = !!projectId && canEdit && !loading && !error;
  const filtered = !!query || status !== "all" || kind !== "all";
  const resetPage = () => { setPage(1); setSelectedKey(null); };
  useEffect(() => { setPage(1); setSelectedKey(null); setDrafts({}); }, [projectId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="rlc-priority-dialog" className="flex max-h-[94dvh] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>RLC 專案替代料優先順序</DialogTitle>
          <DialogDescription className="pr-8">適用專案：{projectId ? (projectName || projectId) : "尚未指派"}。依完整 Name 規格與 R／L／C 分組，確認使用資格後再排序；供料 Approved 不代表本專案已承認。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {!projectId && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">此 BOM 尚未指派專案。請先到「BOM 管理」指派專案，再設定承認與優先序。</p>}
          {projectId && !canEdit && <p role="status" className="text-sm text-muted-foreground">目前為唯讀，請由具有物料編輯權限的人員維護規則。</p>}
          {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><span>{error}</span>{onReload && <Button type="button" variant="outline" disabled={loading || saving} onClick={() => void Promise.resolve(onReload()).catch(() => {})}>重新載入規則</Button>}</div>}
          <p className="text-sm text-muted-foreground">完整規格 {specs.length} 組 · 多廠商規格 {specs.filter(spec => spec.manufacturerCount > 1).length} 組 · 來源位號群組 {new Set(specs.flatMap(spec => spec.sourceGroupKeys)).size} 組。僅納入有完整 Name 與可識別 R／L／C 位號的資料。</p>
          <section aria-label="RLC 規格清單" className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 space-y-1 text-sm"><span>搜尋</span><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input aria-label="搜尋 RLC 完整規格、位號、廠商或 MPN" placeholder="完整規格、位號、廠商或 MPN" value={query} onChange={event => { setQuery(event.target.value); resetPage(); }} className="min-w-[220px] rounded-lg pl-9" /></div></label>
              <label className="w-full space-y-1 text-sm sm:w-44"><span>狀態</span><Select value={status} onValueChange={value => { setStatus(value as keyof typeof STATUS_LABELS); resetPage(); }}><SelectTrigger aria-label="RLC 規格狀態" className="rounded-lg"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
              <label className="w-full space-y-1 text-sm sm:w-40"><span>元件類型</span><Select value={kind} onValueChange={value => { setKind(value as keyof typeof KIND_LABELS); resetPage(); }}><SelectTrigger aria-label="RLC 元件類型" className="rounded-lg"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KIND_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
            </div>
            {filtered && <div className="flex flex-wrap items-center gap-2" aria-label="作用中篩選條件">
              {query && <Button type="button" variant="outline" size="sm" aria-label="清除搜尋條件" onClick={() => { setQuery(""); resetPage(); }}>搜尋：{query}<X className="ml-2 h-3 w-3" aria-hidden="true" /></Button>}
              {status !== "all" && <Button type="button" variant="outline" size="sm" aria-label="清除狀態條件" onClick={() => { setStatus("all"); resetPage(); }}>狀態：{STATUS_LABELS[status]}<X className="ml-2 h-3 w-3" aria-hidden="true" /></Button>}
              {kind !== "all" && <Button type="button" variant="outline" size="sm" aria-label="清除元件類型條件" onClick={() => { setKind("all"); resetPage(); }}>元件類型：{KIND_LABELS[kind]}<X className="ml-2 h-3 w-3" aria-hidden="true" /></Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setQuery(""); setStatus("all"); setKind("all"); resetPage(); }}>全部清除</Button>
            </div>}
            <div className="overflow-x-auto rounded-lg border border-border" aria-busy={loading}>
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-secondary/70 text-muted-foreground"><tr><th className="px-3 py-3">完整 Name 規格</th><th className="px-3 py-3">來源位號／群組</th><th className="whitespace-nowrap px-3 py-3">廠商／候選料</th><th className="px-3 py-3">本專案建議</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {loading ? <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">正在載入專案規則…</td></tr> : pageRows.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">目前篩選條件沒有符合的 RLC 規格</td></tr> : pageRows.map(spec => <tr key={spec.key} className={cn(selected?.key === spec.key && "bg-primary/10")}>
                    <td className="max-w-[30rem] px-3 py-3"><Button type="button" variant="ghost" className="h-auto justify-start whitespace-normal p-0 text-left text-sm" aria-pressed={selected?.key === spec.key} onClick={() => setSelectedKey(spec.key)}>{spec.kind} · {spec.spec}</Button></td>
                    <td className="max-w-[15rem] px-3 py-3">
                      <span className="line-clamp-2 break-all font-mono">{spec.refs.join('、').split(/[,;、\s]+/).filter(Boolean).slice(0, 3).join('、') || '目前 BOM 未包含'}</span>
                      <span className="text-xs text-muted-foreground">{spec.sourceGroupKeys.length} 個群組</span>
                      {spec.refs.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs text-primary">檢視全部位號</summary><p className="mt-2 max-h-32 overflow-y-auto break-all font-mono text-xs leading-5">{spec.refs.join('、')}</p></details>}
                    </td>
                    <td className="px-3 py-3">{spec.manufacturerCount} 廠商／{spec.candidates.length} 候選</td>
                    <td className={cn("max-w-[22rem] break-words px-3 py-3", spec.recommendation.status === "recommended" ? "text-primary" : "text-warning")}>{recommendationText(spec)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{visible.length} 組規格 · 第 {currentPage}／{pages} 頁</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" aria-label="上一頁 RLC 規格" disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1); setSelectedKey(null); }}><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button><Button type="button" variant="outline" size="sm" aria-label="下一頁 RLC 規格" disabled={currentPage >= pages} onClick={() => { setPage(currentPage + 1); setSelectedKey(null); }}>下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
          </section>
          {!loading && selected && <section aria-label="所選規格候選料" className="rounded-xl border border-border bg-background/40 px-4 py-3">
            <h3 className="break-words font-semibold">{selected.kind} · {selected.spec}</h3>
            <p className="mt-1 text-sm text-muted-foreground">客戶承認、AVL、工程確認皆為已通過或不適用，且無來源禁用／不建議限制，才可列入推薦。未排序與同名次不會自動選料。切換規格時保留草稿，儲存後才更新專案建議。</p>
            {selected.candidates.map(candidate => {
              const key = JSON.stringify([projectId, selected.key, candidate.key]);
              return <CandidateEditor key={key} candidate={candidate} draft={drafts[key] ?? candidate.rule} onDraftChange={rule => setDrafts(current => { const next = { ...current }; if (rule) next[key] = rule; else delete next[key]; return next; })} editable={editable} saving={saving} onSaveRule={onSaveRule} />;
            })}
          </section>}
        </div>
        <DialogFooter className="items-center gap-3 sm:justify-between"><p className="text-sm text-muted-foreground">規則只屬於此專案；來源 BOM、虛擬料號與實體料號保持原值。缺少於目前 BOM 的既存候選料會保留規則並排除推薦。</p><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>關閉</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
