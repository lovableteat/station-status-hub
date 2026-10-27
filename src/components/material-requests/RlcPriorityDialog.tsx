import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
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
  workspaceName?: string;
  projects?: Array<{ id: string; name: string }>;
  onAssignProject?: (projectId: string) => Promise<void>;
  assigningProject?: boolean;
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
const STATUS_LABELS = { all: "全部設定狀態", "needs-action": "尚未選出優先料", recommended: "已有優先使用料" };
const KIND_LABELS = { all: "全部 R／L／C", R: "R 電阻", L: "L 電感", C: "C 電容" };
const PAGE_SIZE = 8;

function recommendationText(spec: RlcPrioritySpecGroup): string {
  const { status, candidateKey, rank } = spec.recommendation;
  if (status === "unassigned") return "先選擇上方專案";
  if (status === "needs-qualification") return "尚未確認可用廠商";
  if (status === "needs-ranking") return "可用料號尚未排序";
  if (status === "tied") return `第 ${rank} 順位並列，請調整`;
  const candidate = spec.candidates.find(item => item.key === candidateKey);
  return `優先使用：${candidate?.manufacturer} · ${candidate?.mpn}`;
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
    <details className="group border-b border-border last:border-b-0" data-testid="rlc-candidate">
      <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-3 [&::-webkit-details-marker]:hidden">
        <strong className="min-w-0 flex-1 break-words">{candidate.manufacturer || "未提供廠商"} <span className="font-mono">{candidate.mpn || "未提供 MPN"}</span></strong>
        <span className={cn("text-sm", candidate.eligible ? "text-primary" : "text-warning")}>{candidate.eligible ? "已確認可用" : "尚未列入推薦"}</span>
        {!candidate.inCurrentBom && <span className="text-sm text-warning">目前 BOM 未包含</span>}
        <span className="text-sm">{draft.rank ? '第 ' + draft.rank + ' 順位' : '未排序'}</span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">設定／修改<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span>
      </summary>
      <div className="space-y-3 pb-5">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">來源實體料號：</dt><dd className="inline break-all font-mono">{candidate.realPartNumbers.join("、") || "未提供"}</dd></div>
        <div><dt className="inline text-muted-foreground">來源虛擬料號：</dt><dd className="inline break-all font-mono">{candidate.virtualPartNumbers.join("、") || "未提供"}</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-muted-foreground">來源供料／零件狀態：</dt><dd className="inline">{[...new Set(candidate.records.flatMap(record => [record.sourcingStatus, record.partUsageStatus, record.phaseOutStatus].filter(Boolean)))].join("、") || "未提供"}</dd></div>
      </dl>
      {candidate.exclusionReasons.length > 0 && <p className="break-words text-sm text-warning">目前未推薦的原因：{candidate.exclusionReasons.join("；")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([ ["customerApproval", "客戶承認"], ["avl", "AVL"], ["engineering", "工程確認"] ] as const).map(([field, title]) => (
          <label key={field} className="space-y-1 text-sm"><span>{title}</span>
            <Select value={draft[field]} onValueChange={value => change({ [field]: value as RlcQualification })} disabled={disabled} aria-label={`${label} ${title}`}>
              <SelectTrigger aria-label={`${label} ${title}`} className="rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{QUALIFICATIONS.map(([value, caption]) => <SelectItem key={value} value={value}>{caption}</SelectItem>)}</SelectContent>
            </Select>
          </label>
        ))}
        <label className="space-y-1 text-sm"><span>使用順位（1 最優先）</span>
          <Input type="number" min={1} step={1} value={draft.rank ?? ""} disabled={disabled} aria-label={`${label} 優先序`} aria-invalid={!rankValid} onChange={event => change({ rank: event.target.value === "" ? null : Number(event.target.value) })} placeholder="未排序" className="rounded-lg" />
        </label>
      </div>
      {!rankValid && <p role="alert" className="text-sm text-destructive">優先序請填正整數，或留空表示未排序</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span>確認依據／文件或單號</span><Textarea value={draft.evidence} onChange={event => change({ evidence: event.target.value })} disabled={disabled} aria-label={`${label} 確認依據`} rows={2} className="min-h-20 rounded-lg" placeholder="記錄此專案的承認依據，供人工核對" /></label>
        <label className="space-y-1 text-sm"><span>備註</span><Textarea value={draft.notes} onChange={event => change({ notes: event.target.value })} disabled={disabled} aria-label={`${label} 備註`} rows={2} className="min-h-20 rounded-lg" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={disabled || !rankValid || !dirty} onClick={save} data-testid="rlc-save-rule">{busy ? "儲存中…" : "儲存此廠商設定"}</Button>
        {dirty && <Button type="button" size="sm" variant="ghost" disabled={saving || busy} onClick={() => { onDraftChange(null); setSaveError(''); }}>還原最新規則</Button>}
        {dirty && <span className="text-sm text-warning">尚有未儲存變更</span>}
        {message && <span role="status" className="text-sm text-primary">{message}</span>}
        {saveError && <span role="alert" className="text-sm text-destructive">{saveError}</span>}
      </div>
      </div>
    </details>
  );
}

export function RlcPriorityDialog({
  open, onOpenChange, projectId, projectName, workspaceName, projects = [], onAssignProject,
  assigningProject = false, groups, rules, canEdit, loading = false, saving = false, error, onReload, onSaveRule,
}: RlcPriorityDialogProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS_LABELS>("all");
  const [kind, setKind] = useState<keyof typeof KIND_LABELS>("all");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RlcPriorityRule>>({});
  const [projectEditorOpen, setProjectEditorOpen] = useState(!projectId);
  const [projectChoice, setProjectChoice] = useState(projectId || "");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState("");
  const projectRequest = useRef(false), mounted = useRef(true);
  const body = useRef<HTMLDivElement>(null);
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
  const selected = specs.find(spec => spec.key === selectedKey);
  const assigning = projectBusy || assigningProject;
  const editable = !!projectId && canEdit && !loading && !error && !assigning;
  const filtered = !!query || status !== "all" || kind !== "all";
  const hasDrafts = Object.keys(drafts).length > 0;
  const resetPage = () => setPage(1);
  useEffect(() => {
    setPage(1); setSelectedKey(null); setDrafts({});
    setProjectChoice(projectId || ""); setProjectEditorOpen(!projectId); setProjectError("");
  }, [projectId]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [selectedKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const assignProject = async () => {
    if (!canEdit || !onAssignProject || !projectChoice || projectRequest.current || assigningProject || hasDrafts) return;
    projectRequest.current = true; setProjectBusy(true); setProjectError("");
    try {
      await onAssignProject(projectChoice);
      if (mounted.current) setProjectEditorOpen(false);
    } catch (cause) {
      if (mounted.current) setProjectError(cause instanceof Error ? cause.message : "專案尚未儲存，請重試");
    } finally {
      projectRequest.current = false;
      if (mounted.current) setProjectBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!saving && !assigning) onOpenChange(nextOpen); }}>
      <DialogContent data-testid="rlc-priority-dialog" className="flex max-h-[94dvh] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>RLC 選料優先順序</DialogTitle>
          <DialogDescription className="pr-8">讓同一專案、相同規格的電阻（R）、電感（L）、電容（C），優先使用一致的廠商料號。</DialogDescription>
        </DialogHeader>
        <div ref={body} className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <section aria-label="專案設定" className="space-y-3 rounded-xl border border-border bg-background/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">1 選擇專案 <span className="ml-2 text-primary">{projectId ? projectName || projectId : "尚未設定"}</span></h3>
              {workspaceName && <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={workspaceName}>BOM：{workspaceName}</p>}
              {projectId && onAssignProject && <Button type="button" variant="ghost" size="sm" className="ml-auto h-8" disabled={!canEdit || saving || assigning || hasDrafts} title={hasDrafts ? "請先儲存或還原目前草稿" : undefined} onClick={() => setProjectEditorOpen(value => !value)}>更換專案</Button>}
            </div>
            {projectEditorOpen ? <>
              <p className="text-sm text-muted-foreground">先選擇這份 BOM 所屬的專案，系統才知道要使用哪一份廠商順序。不同專案各自保存。</p>
              {onAssignProject ? <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 basis-60 space-y-1 text-sm"><span>這份 BOM 屬於哪個專案</span>
                  <Select value={projectChoice} onValueChange={setProjectChoice} disabled={!canEdit || assigning || saving} aria-label="選擇 BOM 所屬專案">
                    <SelectTrigger aria-label="選擇 BOM 所屬專案"><SelectValue placeholder="請選擇專案" /></SelectTrigger>
                    <SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <Button type="button" data-testid="rlc-assign-project" disabled={!canEdit || !projectChoice || assigning || saving || hasDrafts} onClick={() => void assignProject()}>{assigning ? "儲存專案中…" : "套用專案"}</Button>
              </div> : <p className="text-sm text-warning">請先選擇 BOM 所屬專案；具有物料編輯權限的同事可設定專案。</p>}
              {onAssignProject && projects.length === 0 && <p className="text-sm text-warning">目前沒有可選的專案；請先建立專案，再重新開啟此視窗。</p>}
              {projectError && <p role="alert" className="text-sm text-destructive">{projectError}</p>}
            </> : null}
          </section>
          {!canEdit && <p role="status" className="text-sm text-muted-foreground">目前只能查詢，請由具有物料編輯權限的同事維護專案與廠商設定。</p>}
          {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><span>{error}</span>{onReload && <Button type="button" variant="outline" disabled={loading || saving} onClick={() => void Promise.resolve(onReload()).catch(() => {})}>重新載入規則</Button>}</div>}

          {selected ? <section aria-label="設定廠商順序" className="space-y-4">
            <Button type="button" variant="outline" data-testid="rlc-back-to-specs" disabled={saving || assigning} onClick={() => setSelectedKey(null)}><ArrowLeft className="mr-2 h-4 w-4" />返回規格清單</Button>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">3 設定可用廠商與優先順序</h3>
              <p className="break-words font-semibold text-primary">{selected.kind} · {selected.spec}</p>
              <p className="text-sm text-muted-foreground">這種規格有 {selected.candidates.length} 個廠商料號可選。點各家「設定／修改」，確認可用條件並填入順位。</p>
              <p className="text-sm">1＝優先使用，2＝第一替代，3＝第二替代。儲存後才會更新推薦；最佳順位並列時請先調整。</p>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-primary">客戶承認、AVL、工程確認是什麼？</summary>
              <dl className="mt-2 space-y-1 text-muted-foreground">
              <div><dt className="inline font-semibold text-foreground">客戶承認：</dt><dd className="inline">客戶已同意這顆料用在本專案。</dd></div>
              <div><dt className="inline font-semibold text-foreground">AVL（合格供應商清單）：</dt><dd className="inline">廠商與料號在本專案的合格清單內。</dd></div>
              <div><dt className="inline font-semibold text-foreground">工程確認：</dt><dd className="inline">已完成本專案要求的工程驗證。</dd></div>
              </dl>
              <p className="mt-2 text-muted-foreground">三項都「已通過」或確定「不適用／免承認」，且沒有來源禁用／不建議限制，才列入推薦。不清楚就保留「待確認」；BOM 的 Approved 不會代替這些確認。</p>
            </details>
            <p role="status" className={cn("rounded-lg border p-3 text-sm font-semibold", selected.recommendation.status === "recommended" ? "border-primary/30 bg-primary/10 text-primary" : "border-warning/30 bg-warning/10 text-foreground")}>{recommendationText(selected)}</p>
            {!projectId && <p className="text-sm text-warning">先選擇上方專案，才能儲存這些廠商的可用條件與順位。</p>}
            {loading && <p role="status" className="text-sm text-muted-foreground">正在載入專案設定…</p>}
            <div className="divide-y divide-border">
              {selected.candidates.map(candidate => {
                const draftKey = JSON.stringify([projectId, selected.key, candidate.key]);
                return <CandidateEditor key={draftKey} candidate={candidate} draft={drafts[draftKey] ?? candidate.rule} onDraftChange={rule => setDrafts(current => { const next = { ...current }; if (rule && JSON.stringify(rule) !== JSON.stringify(candidate.rule)) next[draftKey] = rule; else delete next[draftKey]; return next; })} editable={editable} saving={saving} onSaveRule={onSaveRule} />;
              })}
            </div>
            <details data-testid="rlc-spec-refs" className="border-t border-border pt-3 text-sm">
              <summary className="cursor-pointer text-primary">檢視此規格使用的全部位號</summary>
              <p className="mt-2 text-muted-foreground">位號是料件在電路板上的位置。這個規格出現在 {selected.sourceGroupKeys.length} 組位號，以上設定會用於這些位置的選料建議。</p>
              <p className="mt-2 max-h-32 overflow-y-auto break-all font-mono text-xs leading-5">{selected.refs.join('、') || '目前 BOM 未包含'}</p>
            </details>
          </section> : <section aria-label="RLC 規格清單" className="space-y-3">
            <h3 className="text-lg font-semibold">2 選擇要統一用料的規格</h3>
            <p className="text-sm text-muted-foreground">每列是一種相同規格，共 {specs.length} 種，其中 {specs.filter(spec => spec.manufacturerCount > 1).length} 種有多家廠商。點「設定廠商順序」查看料號、設定可用條件與順位。</p>
            {hasDrafts && <div className="flex flex-wrap items-center gap-2 text-sm text-warning"><span>有 {Object.keys(drafts).length} 筆廠商設定尚未儲存；請先儲存或還原，再更換專案。</span><Button type="button" variant="outline" size="sm" data-testid="rlc-resume-draft" onClick={() => setSelectedKey(Object.values(drafts)[0].specKey)}>繼續編輯未儲存設定</Button></div>}
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 space-y-1 text-sm"><span>搜尋</span><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input aria-label="搜尋 RLC 完整規格、位號、廠商或 MPN" placeholder="輸入規格、位號、廠商或 MPN" value={query} onChange={event => { setQuery(event.target.value); resetPage(); }} className="min-w-[220px] rounded-lg pl-9" /></div></label>
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
                <thead className="bg-secondary/70 text-muted-foreground"><tr><th className="px-3 py-3">料件規格</th><th className="px-3 py-3">使用位置（位號）</th><th className="px-3 py-3">可選廠商／料號</th><th className="px-3 py-3">目前優先順序</th><th className="hidden px-3 py-3 md:table-cell">操作</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {loading ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">正在載入專案規則…</td></tr> : pageRows.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">目前篩選條件沒有符合的 RLC 規格</td></tr> : pageRows.map(spec => <tr key={spec.key}>
                    <td className="min-w-[15rem] max-w-[26rem] break-words px-3 py-3 font-medium">{spec.kind} · {spec.spec}<Button type="button" variant="outline" size="sm" data-testid="rlc-open-spec-mobile" aria-label={"設定 " + spec.spec + " 的廠商順序"} className="mt-2 min-h-11 border-primary/40 text-primary md:hidden" onClick={() => setSelectedKey(spec.key)}>設定廠商順序<ChevronRight className="ml-1 h-4 w-4" /></Button></td>
                    <td className="max-w-[12rem] px-3 py-3"><span className="line-clamp-2 break-all font-mono">{spec.refs.join('、').split(/[,;、\s]+/).filter(Boolean).slice(0, 3).join('、') || '目前 BOM 未包含'}</span><span className="text-xs text-muted-foreground">{spec.sourceGroupKeys.length} 組位號</span></td>
                    <td className="px-3 py-3">{spec.manufacturerCount} 家／{spec.candidates.length} 個料號</td>
                    <td className={cn("max-w-[18rem] break-words px-3 py-3", spec.recommendation.status === "recommended" ? "text-primary" : "text-warning")}>{recommendationText(spec)}</td>
                    <td className="hidden px-3 py-3 md:table-cell"><Button type="button" variant="outline" size="sm" data-testid="rlc-open-spec" aria-label={"設定 " + spec.spec + " 的廠商順序"} className="min-h-10 border-primary/40 text-primary" onClick={() => setSelectedKey(spec.key)}>設定廠商順序<ChevronRight className="ml-1 h-4 w-4" /></Button></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{visible.length} 種規格 · 第 {currentPage}／{pages} 頁</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" aria-label="上一頁 RLC 規格" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="mr-1 h-4 w-4" />上一頁</Button><Button type="button" variant="outline" size="sm" aria-label="下一頁 RLC 規格" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一頁<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
          </section>}
        </div>
        <DialogFooter className="items-center gap-3 sm:justify-between"><p className="hidden text-sm text-muted-foreground sm:block">儲存的是本專案的選料建議；BOM 內的實體料號與虛擬料號維持原值。</p><Button type="button" variant="outline" className="w-full sm:w-auto" disabled={saving || assigning} onClick={() => onOpenChange(false)}>關閉</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
