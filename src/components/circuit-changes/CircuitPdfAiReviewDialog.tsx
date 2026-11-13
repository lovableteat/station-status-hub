import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Clock3, Files, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadSpecFillModels, type SpecFillModel } from "../material-requests/materialSpecFillService";
import { CIRCUIT_AI_CATEGORY_LABELS, circuitPdfAiReviewKey, runCircuitPdfAiReview, type CircuitPdfAiFinding, type CircuitPdfAiReviewReport, type CircuitPdfReviewPage } from "./circuitPdfAiReview";
import { buildCircuitPdfAiBatchPages, CIRCUIT_PDF_AI_BATCH_CONCURRENCY, parseCircuitPdfAiPageSelection, runCircuitPdfAiBatchReview, type CircuitPdfAiBatchPage } from "./circuitPdfAiBatchReview";
import { CircuitPdfAiAnnotations } from "./CircuitPdfAiAnnotations";
import "./circuitPdfAiReview.css";

export interface CircuitPdfAiReviewProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  official: CircuitPdfReviewPage | null; working: CircuitPdfReviewPage | null;
  userName: string; disabled?: boolean; savedReport?: CircuitPdfAiReviewReport | null;
  previousReports?: CircuitPdfAiReviewReport[];
  onSave: (report: CircuitPdfAiReviewReport) => Promise<void>;
  /** A finding chosen on the drawing: it opens unfolded once this page's result is shown. */
  focusFinding?: string;
  allPages?: {
    officialOffset: number;
    /** The baseline page for each working page as matched on the drawing (0: none); replaces the single offset. */
    officialPageFor?: (workingPage: number) => number;
    /** Changes when any page's match changes. */
    mappingKey?: string;
    onLoadPage: (workingPage: number) => Promise<void>;
    onSave: (report: CircuitPdfAiReviewReport) => Promise<void>;
  };
}
const decisionLabels = { pending: "未判讀", confirmed: "已確認", dismissed: "不採用" };
const decisionHints = { pending: "還沒判斷這一項", confirmed: "確認這是新舊版真的不同的地方", dismissed: "AI 看錯了，這一項不採用" };
const checkLabels = { "possible-issue": "有待核對項目", "no-visible-issue": "未見明顯差異", unverifiable: "證據不足" };
const priorityLabels = { high: "優先核對", medium: "需要注意", low: "一般提醒" };
const batchLabels = { pending: "待比對", analysing: "比對中", saving: "儲存中", complete: "已儲存", failed: "比對失敗", unsaved: "尚未儲存", unmatched: "無對應頁" };

function ReviewCountdown({ deadline, retryAt, batch = false }: { deadline: number | null; retryAt: number | null; batch?: boolean }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (deadline === null && retryAt === null) return;
    setNow(performance.now());
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline, retryAt]);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const retrySeconds = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const label = retrySeconds ? "AI 服務暫停重送" : batch ? "整批預估剩餘時間" : "AI 回應剩餘時間";
  const format = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
  };
  return <div className="circuit-pdf-ai-countdown" role="timer" aria-label={label}>
    <Clock3 aria-hidden="true" /><span>{batch ? label : "AI 等候上限"}</span>
    <strong>{retrySeconds ? `${retrySeconds} 秒後繼續` : remaining === null ? (batch ? "完成首組頁面後估算" : "準備 PDF 頁面中") :
      remaining === 0 ? (batch ? "仍在比對，重新估算中" : "等待回應結束") : format(remaining)}</strong>
  </div>;
}

export function CircuitPdfAiReview({ open, onOpenChange, official: sourceOfficial, working: sourceWorking, userName, disabled = false, savedReport, previousReports = [], onSave, allPages, focusFinding }: CircuitPdfAiReviewProps) {
  const [reviewPage, setReviewPage] = useState(sourceWorking?.page ?? 1);
  const sourceKey = sourceOfficial && sourceWorking ? circuitPdfAiReviewKey({ officialVersionId: sourceOfficial.id, workingVersionId: sourceWorking.id, officialPage: sourceOfficial.page, workingPage: sourceWorking.page }) : "";
  const officialOffset = allPages?.officialOffset ?? ((sourceOfficial?.page ?? 1) - (sourceWorking?.page ?? 1));
  const working = sourceWorking ? { ...sourceWorking, page: reviewPage } : null;
  const matchedPageFor = allPages?.officialPageFor;
  const officialPageFor = useCallback((page: number) => matchedPageFor ? matchedPageFor(page) : page + officialOffset, [matchedPageFor, officialOffset]);
  const mappingKey = allPages?.mappingKey ?? String(officialOffset);
  const officialPage = officialPageFor(reviewPage);
  const official = sourceOfficial && officialPage >= 1 && officialPage <= sourceOfficial.pdf.numPages ? { ...sourceOfficial, page: officialPage } : null;
  const key = official && working ? circuitPdfAiReviewKey({ officialVersionId: official.id, workingVersionId: working.id, officialPage: official.page, workingPage: working.page }) : "";
  const current = useRef(key); current.current = key;
  const [models, setModels] = useState<SpecFillModel[]>([]), [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false), [analysing, setAnalysing] = useState(false), [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CircuitPdfAiReviewReport | null>(null), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [batch, setBatch] = useState<CircuitPdfAiBatchPage[]>([]), [batchRunning, setBatchRunning] = useState(false), [batchStopped, setBatchStopped] = useState(false);
  const [batchScope, setBatchScope] = useState<"all" | "selected">("all");
  const [pageInput, setPageInput] = useState("");
  const selectionId = useId();
  const batchRef = useRef(batch);
  const [loadingPage, setLoadingPage] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null), changed = useRef(dirty); changed.current = dirty;
  const active = useRef(open); active.current = open;
  const model = models.find(item => item.id === modelId), busy = analysing || saving || batchRunning || loadingPage;
  const validPair = Boolean(official && working && official.id !== working.id);
  const validSources = Boolean(sourceOfficial && sourceWorking && sourceOfficial.id !== sourceWorking.id);
  const workingCount = sourceWorking?.pdf.numPages ?? 0;
  const officialCount = sourceOfficial?.pdf.numPages ?? 0;
  const pageSelection = useMemo(() => parseCircuitPdfAiPageSelection(pageInput, workingCount), [pageInput, workingCount]);
  const selectedPlan = useMemo(() => pageSelection.pages ? buildCircuitPdfAiBatchPages(officialCount, workingCount, officialPageFor, pageSelection.pages) : [], [pageSelection, officialCount, workingCount, officialPageFor]);
  const selectedUnmatched = selectedPlan.filter(page => page.officialPage === null).length;
  const batchLabel = batchScope === "selected" ? "指定頁面" : "全部頁面";
  const stopBatchLabel = batchScope === "selected" ? "停止指定比對" : "停止全部比對";
  const savedCurrent = key === sourceKey ? savedReport : previousReports.find(item => item.key === key);
  const latestSaved = useRef(savedCurrent); latestSaved.current = savedCurrent;
  const completeCount = batch.filter(item => item.status === "complete").length;
  const unmatchedCount = batch.filter(item => item.status === "unmatched").length;
  const unsavedCount = batch.filter(item => item.status === "unsaved").length;
  const failedCount = batch.filter(item => item.status === "failed").length;
  const analysingPages = batch.filter(item => item.status === "analysing").map(item => item.workingPage);
  const savingPages = batch.filter(item => item.status === "saving").map(item => item.workingPage);
  const savingReview = saving || savingPages.length > 0;
  const unfinished = batch.some(item => !["complete", "unmatched"].includes(item.status));
  const canResumeDirty = dirty && result === batch.find(item => item.status === "unsaved" && item.report?.key === key)?.report;
  const cannotStartBatch = !validSources || !allPages || !model || loadingModels || disabled || busy || dirty || unsavedCount > 0 || Boolean(historyId);

  useEffect(() => {
    setReviewPage(sourceWorking?.page ?? 1); setBatch([]); batchRef.current = []; setBatchRunning(false); setBatchStopped(false); setLoadingPage(false); setDeadline(null); setRetryAt(null);
    setPageInput(""); setBatchScope("all");
    return () => { request.current?.abort(); };
  }, [sourceKey, mappingKey, open]);

  useEffect(() => {
    request.current?.abort(); request.current = null; setAnalysing(false); setDirty(false); setError(""); setHistoryId("");
    const unsaved = batchRef.current.find(item => item.report?.key === key && item.status === "unsaved");
    setResult(unsaved?.report ?? (savedCurrent?.key === key ? savedCurrent : null)); setDirty(Boolean(unsaved));
  }, [key, open]); // The report belongs to the exact immutable version pair and page mapping.
  useEffect(() => {
    const unsaved = batchRef.current.some(item => item.status === "unsaved" && item.report?.key === key);
    if (!changed.current && !request.current && !historyId && !unsaved) setResult(savedCurrent?.key === key ? savedCurrent : null);
  }, [savedCurrent, key, historyId]);
  useEffect(() => {
    if (!open || disabled) { request.current?.abort(); return; }
    let present = true; setLoadingModels(true);
    void loadSpecFillModels({ imagesOnly: true }).then(items => { if (present) { setModels(items); setModelId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? ""); } })
      .catch(failure => { if (present) setError(failure instanceof Error ? failure.message : "無法讀取 AI 服務。"); }).finally(() => { if (present) setLoadingModels(false); });
    return () => { present = false; request.current?.abort(); };
  }, [open, disabled]);

  const focused = useRef("");
  useEffect(() => { if (!open) focused.current = ""; }, [open]);
  useEffect(() => {
    if (!open || !focusFinding || !result || focused.current === `${result.id}:${focusFinding}`) return;
    const finding = document.getElementById(`${selectionId}-${focusFinding}`);
    if (!(finding instanceof HTMLDetailsElement)) return;
    focused.current = `${result.id}:${focusFinding}`;
    finding.open = true;
    finding.scrollIntoView({ block: "start" });
    finding.querySelector("summary")?.focus({ preventScroll: true });
  }, [open, focusFinding, result, selectionId]);

  function updateBatch(page: CircuitPdfAiBatchPage) {
    const next = batchRef.current.map(item => item.workingPage === page.workingPage ? page : item);
    batchRef.current = next; setBatch(next);
  }

  async function persist(report: CircuitPdfAiReviewReport) {
    const captured = key; setSaving(true); setError("");
    try {
      await (report.key === sourceKey ? onSave(report) : allPages!.onSave(report));
      if (active.current && current.current === captured) {
        setDirty(false);
        const page = batchRef.current.find(item => item.workingPage === report.workingPage && item.officialPage === report.officialPage);
        if (page) updateBatch({ ...page, report, status: "complete", error: undefined });
      }
    }
    catch (failure) { if (active.current && current.current === captured) setError(`初審結果尚未儲存：${failure instanceof Error ? failure.message : "請重試"}`); }
    finally { if (active.current && current.current === captured) setSaving(false); }
  }
  async function analyseBatch(scope: "all" | "selected" | "resume") {
    const resume = scope === "resume";
    if (!sourceOfficial || !sourceWorking || !validSources || !allPages || !model || loadingModels || disabled || busy || request.current || (dirty && !(resume && canResumeDirty)) || (!resume && unsavedCount > 0) || historyId) return;
    const controller = new AbortController(), captured = key;
    const pages = resume ? batchRef.current : scope === "selected" ? selectedPlan : buildCircuitPdfAiBatchPages(officialCount, workingCount, officialPageFor);
    if (scope === "selected" && (!pages.length || selectedUnmatched === pages.length)) return;
    if (!resume) setBatchScope(scope);
    batchRef.current = pages; setBatch(pages); setBatchRunning(true); setBatchStopped(false); setError(""); setDeadline(null); setRetryAt(null); request.current = controller;
    let remainingPages = pages.filter(page => page.status !== "complete" && page.officialPage !== null).length;
    const startedAt = new Map<number, number>();
    const recentPageTimes: number[] = [];
    try {
      await runCircuitPdfAiBatchReview({ pages, signal: controller.signal,
        analyse: (page, attemptNumber) => runCircuitPdfAiReview({ official: { ...sourceOfficial, page: page.officialPage! }, working: { ...sourceWorking, page: page.workingPage }, model, userName, signal: controller.signal, attemptNumber }),
        save: report => allPages.onSave(report),
        onCooldown: retryTime => {
          if (request.current === controller && active.current && current.current === captured) setRetryAt(performance.now() + Math.max(0, retryTime - Date.now()));
        },
        onUpdate: page => {
          if (request.current !== controller || !active.current || current.current !== captured) return;
          updateBatch(page);
          const now = performance.now();
          if (page.status === "analysing" && !startedAt.has(page.workingPage)) startedAt.set(page.workingPage, now);
          if (page.status === "complete" || page.status === "unsaved" || page.status === "failed") {
            remainingPages--;
            const start = startedAt.get(page.workingPage);
            startedAt.delete(page.workingPage);
            if (start !== undefined && page.status !== "failed") {
              recentPageTimes.push(now - start);
              if (recentPageTimes.length > 5) recentPageTimes.shift();
            }
            if (recentPageTimes.length && remainingPages > 0) {
              const average = recentPageTimes.reduce((sum, ms) => sum + ms, 0) / recentPageTimes.length;
              setDeadline(now + average * Math.ceil(remainingPages / CIRCUIT_PDF_AI_BATCH_CONCURRENCY));
            }
          }
          if (page.report?.key === captured && (page.status === "complete" || page.status === "unsaved")) { setResult(page.report); setDirty(page.status === "unsaved"); }
        },
      });
    } catch (failure) {
      if (active.current && current.current === captured && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "批次比對暫停，已完成頁面仍保留。");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (active.current && current.current === captured) { setBatchRunning(false); setBatchStopped(controller.signal.aborted); setDeadline(null); setRetryAt(null); }
      }
    }
  }
  async function selectPage(page: CircuitPdfAiBatchPage) {
    if (busy || page.officialPage === null) return;
    if (dirty) { setError("請先儲存或恢復本頁人工判讀，再查看其他頁。"); return; }
    const captured = key; setLoadingPage(true); setError("");
    try { await allPages?.onLoadPage(page.workingPage); if (active.current && current.current === captured) setReviewPage(page.workingPage); }
    catch (failure) { if (active.current && current.current === captured) setError(failure instanceof Error ? failure.message : "這一頁的初審紀錄尚未載入，請重試。"); }
    finally { if (active.current) setLoadingPage(false); }
  }
  function discardUnsaved() {
    const next = batchRef.current.map(item => item.status === "unsaved" ? { ...item, status: "failed" as const, report: undefined, error: "已捨棄未儲存結果" } : item);
    batchRef.current = next; setBatch(next); setResult(latestSaved.current?.key === key ? latestSaved.current : null); setDirty(false); setError("");
  }
  async function analyse() {
    if (!official || !working || !model || disabled || busy || dirty || !validPair || historyId) return;
    const controller = new AbortController(), captured = key; request.current = controller; setAnalysing(true); setError(""); setDeadline(null);
    try {
      const report = await runCircuitPdfAiReview({ official, working, model, userName, signal: controller.signal,
        onRequestStart: timeoutMs => {
          if (request.current === controller && !controller.signal.aborted) setDeadline(performance.now() + timeoutMs);
        },
      });
      if (!active.current || current.current !== captured || controller.signal.aborted) return;
      setResult(report); setDirty(true); setAnalysing(false); request.current = null;
      await persist(report);
    } catch (failure) {
      if (active.current && current.current === captured && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "AI 初審失敗，原有結果未變更。");
    } finally { if (request.current === controller) { request.current = null; if (active.current && current.current === captured) setAnalysing(false); } }
  }
  function editFinding(id: string, patch: Partial<CircuitPdfAiFinding>) {
    if (!result || disabled || busy || historyId) return;
    const stamp = new Date().toISOString();
    setResult({ ...result, updatedAt: stamp, findings: result.findings.map(item => item.id === id ? { ...item, ...patch, reviewedBy: userName, reviewedAt: stamp } : item) }); setDirty(true);
  }
  function close(next: boolean) {
    if (next) return;
    if (savingReview || batchRef.current.some(page => page.status === "saving")) return;
    if (dirty) { setError("這頁有尚未儲存的人工判讀，請先儲存，或恢復已儲存結果後再關閉。"); return; }
    if (unsavedCount) { setError(`有 ${unsavedCount} 頁初審尚未儲存，請重試未完成頁面，或捨棄未儲存結果後再關閉。`); return; }
    request.current?.abort(); onOpenChange(false);
  }

  return <Dialog open={open} onOpenChange={close}><DialogContent hideCloseButton className="circuit-pdf-ai-dialog" data-testid="circuit-pdf-ai-review" onInteractOutside={event => event.preventDefault()}>
    <header className="circuit-pdf-ai-heading"><div><DialogTitle><Sparkles aria-hidden="true" />AI 比對新舊版</DialogTitle><DialogDescription>可比對目前頁面、指定頁面或全部頁面。完成後可逐項核對差異並儲存判讀。</DialogDescription></div><Button title="關閉 AI 比對；還沒儲存的判讀要先儲存" type="button" variant="ghost" aria-label="關閉 AI 比對" disabled={savingReview} onClick={() => close(false)}><X aria-hidden="true" /></Button></header>
    <section className="circuit-pdf-ai-targets" aria-label="本次比對來源"><p><strong>基準版</strong><span title={sourceOfficial?.name}>{sourceOfficial?.name ?? "尚未設定"}</span><b>{official ? `第 ${official.page} 頁` : "無對應頁"}</b></p><p><strong>比對版</strong><span title={working?.name}>{working?.name ?? "尚未選擇"}</span><b>第 {working?.page ?? "—"} 頁</b></p></section>
    <div className="circuit-pdf-ai-toolbar">
      <label>AI 服務<select title="選擇要用哪一個 AI 服務比對" aria-label="AI 初審服務" value={modelId} disabled={disabled || busy || loadingModels} onChange={event => setModelId(event.target.value)}><option value="">{loadingModels ? "讀取 AI 服務中…" : "選擇 AI 服務"}</option>{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <Button title="只比對目前這一頁" type="button" variant="outline" disabled={!validPair || !model || disabled || busy || dirty || Boolean(historyId)} onClick={() => void analyse()}><Sparkles aria-hidden="true" />{result ? "重新比對這一頁" : "只比對這一頁"}</Button>
      <Button title="逐頁比對所選的兩份 PDF，每頁結果會自動儲存" type="button" variant="outline" disabled={cannotStartBatch} onClick={() => void analyseBatch("all")}><Files aria-hidden="true" />全部頁面比對</Button>
      {(analysing || batchRunning) && <Button title="停止比對；已完成的頁面會保留" type="button" variant="outline" onClick={() => request.current?.abort()}>{batchRunning ? stopBatchLabel : "取消初審"}</Button>}
      {previousReports.some(item => item.key === key && item.id !== savedCurrent?.id) && <label className="circuit-pdf-ai-history">歷次 AI 初審<select title="查看這一頁以前跑過的 AI 比對結果" aria-label="歷次 AI 初審" value={historyId} disabled={busy} onChange={event => { if (dirty) { setError("請先儲存人工判讀，再切換初審紀錄。"); return; } const id = event.target.value; setHistoryId(id); setError(""); if (id) setResult(previousReports.find(item => item.id === id && item.key === key) ?? null); }}><option value="">目前結果</option>{previousReports.filter(item => item.key === key && item.id !== savedCurrent?.id).map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString("zh-TW")} · {item.generatedBy} · {item.modelLabel}</option>)}</select></label>}
    </div>
    <main className="circuit-pdf-ai-body">
      {allPages && validSources && <form className="circuit-pdf-ai-selection" onSubmit={event => { event.preventDefault(); void analyseBatch("selected"); }}>
        <label htmlFor={selectionId}>指定比對頁碼</label>
        <Input id={selectionId} value={pageInput} placeholder="例如 2, 5–8, 11" autoComplete="off" spellCheck={false}
          aria-describedby={`${selectionId}-hint`} aria-invalid={Boolean(pageSelection.error)} disabled={disabled || busy || Boolean(historyId)}
          onChange={event => setPageInput(event.target.value)} />
        <Button data-circuit-tone="ai" data-fill="solid" type="submit" disabled={cannotStartBatch || selectedPlan.length === selectedUnmatched}><Sparkles aria-hidden="true" />比對指定頁面</Button>
        <p id={`${selectionId}-hint`} aria-live="polite" data-invalid={Boolean(pageSelection.error)}>
          {pageSelection.error ?? (selectedPlan.length ? `已選 ${selectedPlan.length} 頁，可比對 ${selectedPlan.length - selectedUnmatched} 頁${selectedUnmatched ? `；${selectedUnmatched} 頁無基準版對應，會略過` : ""}。` : `輸入比對版頁碼（1–${workingCount}），用逗號分隔，可混合單頁與範圍。`)}
        </p>
      </form>}
      {(analysing || batchRunning) && <ReviewCountdown deadline={deadline} retryAt={retryAt} batch={batchRunning} />}
      {allPages && <div className="circuit-pdf-ai-batch-hint"><p>{matchedPageFor ? "指定與全部比對沿用圖面上每一頁的基準版對應頁（依內容自動對齊，可在圖面的基準版頁碼修改）。" : `指定與全部比對沿用目前基準版的對應頁${officialOffset ? `（偏移 ${officialOffset > 0 ? "+" : ""}${officialOffset} 頁）` : ""}。`}最多同時比對 {CIRCUIT_PDF_AI_BATCH_CONCURRENCY} 頁，每頁完成後個別儲存。</p><label>查看頁面<select title="切換要查看哪一頁的比對結果" aria-label="查看初審頁面" value={reviewPage} disabled={busy} onChange={event => {
        const page = Number(event.target.value), mapped = officialPageFor(page);
        void selectPage({ workingPage: page, officialPage: mapped, status: "pending" });
      }}>{Array.from({ length: sourceWorking?.pdf.numPages ?? 0 }, (_, index) => {
        const page = index + 1, mapped = officialPageFor(page), matched = mapped > 0 && mapped <= (sourceOfficial?.pdf.numPages ?? 0);
        return <option key={page} value={page} disabled={!matched}>比對版 {page} · {matched ? `基準版 ${mapped}` : "無對應頁"}</option>;
      })}</select></label></div>}
      {batch.length > 0 && <section className="circuit-pdf-ai-batch" aria-label={`${batchLabel}比對進度`}>
        <header><div><h3>{batchRunning ? `${batchLabel}比對中` : batchStopped ? `已${stopBatchLabel}` : unfinished ? "部分頁面尚未完成" : `${batchLabel}比對已結束`}</h3><p role="status">已儲存 {completeCount}／{batch.length - unmatchedCount} 頁{failedCount > 0 && ` · 失敗 ${failedCount} 頁`}{unsavedCount > 0 && ` · 尚未儲存 ${unsavedCount} 頁`}{unmatchedCount > 0 && ` · 無對應 ${unmatchedCount} 頁`}{analysingPages.length > 0 && ` · 正在比對第 ${analysingPages.join("、")} 頁`}{savingPages.length > 0 && ` · 正在儲存第 ${savingPages.join("、")} 頁`}</p></div>
          {!batchRunning && unfinished && <Button title="接著比對還沒完成的頁面" type="button" variant="outline" disabled={disabled || busy || !model || dirty && !canResumeDirty || Boolean(historyId)} onClick={() => void analyseBatch("resume")}>繼續未完成頁面</Button>}
          {!batchRunning && unsavedCount > 0 && <Button title="放棄還沒儲存的頁面結果" type="button" variant="ghost" disabled={busy} onClick={discardUnsaved}>捨棄未儲存結果</Button>}
        </header>
        <progress aria-label="已儲存頁面進度" value={completeCount} max={Math.max(1, batch.length - unmatchedCount)} />
        <div className="circuit-pdf-ai-batch-pages" role="group" aria-label="各頁比對結果">{batch.map(item => <button key={item.workingPage} type="button" aria-label={`查看比對版第 ${item.workingPage} 頁初審`} aria-pressed={reviewPage === item.workingPage} disabled={busy || item.officialPage === null} data-status={item.status} title={item.error || item.report?.summary} onClick={() => void selectPage(item)}><span>比對版 {item.workingPage}<small>{item.officialPage === null ? "無基準版對應頁" : `基準版 ${item.officialPage}`}</small></span><strong>{batchLabels[item.status]}{item.status === "complete" && item.report && ` · ${item.report.findings.length} 項`}</strong></button>)}</div>
        {unmatchedCount > 0 && <p className="circuit-pdf-ai-batch-note">無對應頁未送出 AI。若這些是移位的頁面，請回圖面調整基準版對應頁後再比對。</p>}
        {batch.find(item => item.workingPage === reviewPage)?.error && <p className="circuit-pdf-ai-error" role="alert">比對版第 {reviewPage} 頁：{batch.find(item => item.workingPage === reviewPage)?.error}</p>}
      </section>}
      <p className="circuit-pdf-ai-limits">比對可見的接線、Net 名稱與元件／接腳。有疑點或證據不足就標註，正式判讀由你確認。</p>
      {!validPair && <p role="status" className="circuit-pdf-ai-message">{validSources ? "目前這一頁沒有基準版對應頁。仍可指定其他頁面或比對全部，沒有對應的頁面會另外列出。" : "請先在圖面區選擇兩份不同的 PDF 和對應頁碼。"}</p>}
      {disabled && <p className="circuit-pdf-ai-message">目前只能查看已儲存初審；執行 AI 與儲存人工判讀需要料號申請編輯權限。</p>}
      {historyId && <p className="circuit-pdf-ai-message">正在查看歷史初審，內容唯讀。請在「歷次 AI 初審」選回「目前結果」，再執行初審或記錄人工判讀。</p>}
      {error && <p role="alert" className="circuit-pdf-ai-error">{error}</p>}
      {analysing && <p role="status" className="circuit-pdf-ai-progress"><LoaderCircle aria-hidden="true" />正在讀取兩份原始 PDF 頁面並進行 AI 初審…</p>}
      {!result && !batch.length && !analysing && !batchRunning && validPair && <div className="circuit-pdf-ai-empty"><Sparkles aria-hidden="true" /><h3>還沒有比對結果</h3><p>選擇目前頁面、指定頁面或全部頁面開始比對。每頁都會保存比對結果、模型、時間與操作者。</p></div>}
      {result && <section className="circuit-pdf-ai-results" aria-label="本頁 AI 初審結果"><header><h3>比對版第 {result.workingPage} 頁 · 基準版第 {result.officialPage} 頁初審摘要</h3><p>{result.summary}</p><small>{result.generatedBy} · {new Date(result.createdAt).toLocaleString("zh-TW")} · {result.modelLabel}</small></header>
        <dl className="circuit-pdf-ai-checks">{result.checks.map(item => <div key={item.category} data-state={item.state}><dt>{CIRCUIT_AI_CATEGORY_LABELS[item.category]}<strong>{checkLabels[item.state]}</strong></dt><dd>{item.note}</dd></div>)}</dl>
        {result.key === key && official && working && <CircuitPdfAiAnnotations report={result} official={official} working={working} onFinding={id => {
          const finding = document.getElementById(`${selectionId}-${id}`);
          if (!(finding instanceof HTMLDetailsElement)) return;
          finding.open = true;
          finding.querySelector("summary")?.focus({ preventScroll: true });
          finding.scrollIntoView({ block: "nearest" });
        }} />}
        <h3>待核對項目 <span>{result.findings.filter(item => item.decision === "pending").length} 項未判讀／共 {result.findings.length} 項</span></h3>
        {!result.findings.length && <p className="circuit-pdf-ai-message">AI 未列出具體可見疑點，仍需你核對圖面與初審限制後，另行完成正式 Review。</p>}
        {result.findings.map(item => <details key={item.id} id={`${selectionId}-${item.id}`} className="circuit-pdf-ai-finding"><summary><span data-priority={item.priority}>{priorityLabels[item.priority]}</span><b>{item.id} · {item.title}</b>{item.certainty === "unclear" && <small className="circuit-pdf-ai-unclear">證據不足</small>}<small>{decisionLabels[item.decision]}</small></summary><div className="circuit-pdf-ai-finding-content"><p><strong>{CIRCUIT_AI_CATEGORY_LABELS[item.category]} · 位置</strong>{item.location}</p><div className="circuit-pdf-ai-evidence"><p><strong>基準版證據</strong>{item.officialEvidence}</p><p><strong>比對版證據</strong>{item.workingEvidence}</p></div><p><strong>核對建議</strong>{item.suggestion}</p>{item.category === "connectivity" && <p className="circuit-pdf-ai-message">PDF 僅供核對圖面上看得到的接線。</p>}<div className="circuit-pdf-ai-decisions" role="group" aria-label={`${item.id} 人工判讀`}>{(["pending", "confirmed", "dismissed"] as const).map(decision => <button key={decision} type="button" title={decisionHints[decision]} disabled={disabled || busy || Boolean(historyId)} aria-pressed={item.decision === decision} onClick={() => editFinding(item.id, { decision })}>{decisionLabels[decision]}</button>)}</div><label className="circuit-pdf-ai-note">人工核對備註<Textarea aria-label={`${item.id} 人工核對備註`} value={item.reviewNote} maxLength={2000} disabled={disabled || busy || Boolean(historyId)} onChange={event => editFinding(item.id, { reviewNote: event.target.value })} placeholder="例如：圖面交叉處沒有接點，兩條線未連接。" /></label>{item.reviewedAt && <small>{item.reviewedBy} · {new Date(item.reviewedAt).toLocaleString("zh-TW")}</small>}</div></details>)}
      </section>}
    </main>
    <footer className="circuit-pdf-ai-footer"><span role="status">{saving ? "正在儲存初審結果…" : batchRunning ? "可停止比對，已儲存頁面會保留" : dirty ? "尚有未儲存的初審／人工判讀" : result ? "已儲存；正式 Review 仍由你確認" : "請選擇比對範圍"}</span><div>{dirty && <Button type="button" variant="ghost" title="放棄這頁還沒儲存的判讀，回到上次儲存的結果" disabled={busy} onClick={() => { const page = batchRef.current.find(item => item.report?.key === key && item.status === "unsaved"); if (page) updateBatch({ ...page, status: "failed", report: undefined, error: "已捨棄未儲存結果" }); setResult(savedCurrent?.key === key ? savedCurrent : null); setDirty(false); setError(""); }}><RotateCcw aria-hidden="true" />恢復已儲存</Button>}{result && <Button data-circuit-tone="add" data-fill="solid" type="button" title="儲存你對這一頁的判讀，留下時間與操作者" disabled={!dirty || disabled || busy} onClick={() => void persist(result)}><Check aria-hidden="true" />儲存人工判讀</Button>}<Button data-circuit-tone="view" title="關閉 AI 比對，回到圖面" type="button" variant="outline" disabled={savingReview} onClick={() => close(false)}>返回圖面</Button></div></footer>
  </DialogContent></Dialog>;
}
