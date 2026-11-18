import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Clock3, Download, Files, LoaderCircle, RotateCcw, Sparkles, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadSpecFillModels, type SpecFillModel } from "../material-requests/materialSpecFillService";
import { buildCircuitLocalReport, CIRCUIT_AI_CATEGORY_LABELS, circuitPdfAiReviewKey, isCircuitReportIdentical, runCircuitPdfAiReview, type CircuitPdfAiFinding, type CircuitPdfAiReviewReport, type CircuitPdfReviewPage } from "./circuitPdfAiReview";
import { buildCircuitPdfAiBatchPages, CIRCUIT_PDF_AI_BATCH_CONCURRENCY, CircuitPdfAiBatchStop, parseCircuitPdfAiPageSelection, runCircuitPdfAiBatchReview, type CircuitPdfAiBatchPage, type CircuitPdfAiBatchPolicy, type CircuitPdfAiBatchWait } from "./circuitPdfAiBatchReview";
import { findCircuitCommonChanges, summarizeCircuitLocalDiff, type CircuitCommonChanges, type CircuitLocalPageDiff } from "./circuitPdfLocalDiff";
import { compareCircuitPdfPages } from "./circuitPdfLocalDiffReader";
import { describeCircuitAiPage, type CircuitAiReportPage } from "./circuitPdfAiReport";
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
  /** Retry waits and the stop-loss limit of a batch; the defaults are for real use, tests shorten the waits. */
  batchPolicy?: CircuitPdfAiBatchPolicy;
  allPages?: {
    officialOffset: number;
    /** The baseline page for each working page as matched on the drawing (0: none); replaces the single offset. */
    officialPageFor?: (workingPage: number) => number;
    /** Changes when any page's match changes. */
    mappingKey?: string;
    onLoadPage: (workingPage: number) => Promise<void>;
    onSave: (report: CircuitPdfAiReviewReport) => Promise<void>;
    /** Every saved result of this pair: pages already compared are not compared again, and the report covers them all. */
    onLoadAll?: () => Promise<CircuitPdfAiReviewReport[]>;
  };
}
const decisionLabels = { pending: "未判讀", confirmed: "已確認", dismissed: "不採用" };
const decisionHints = { pending: "還沒判斷這一項", confirmed: "確認這是新舊版真的不同的地方", dismissed: "AI 看錯了，這一項不採用" };
const checkLabels = { "possible-issue": "有待核對項目", "no-visible-issue": "未見明顯差異", unverifiable: "證據不足" };
const priorityLabels = { high: "優先核對", medium: "需要注意", low: "一般提醒" };
const batchLabels = { pending: "待比對", checking: "本機比對中", analysing: "AI 判讀中", saving: "儲存中", complete: "已儲存", failed: "比對失敗", unsaved: "尚未儲存", unmatched: "無對應頁" };

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

/** What the batch is waiting for and for how long, so a pause is never silent. */
function WaitNote({ wait }: { wait: CircuitPdfAiBatchWait }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [wait]);
  const seconds = Math.max(0, Math.ceil((wait.until - now) / 1000));
  return <p className="circuit-pdf-ai-wait" role="status" data-kind={wait.kind}>
    {wait.kind === "network" ? <WifiOff aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
    <span>{wait.kind === "network" ? `網路或系統連線中斷，${seconds} 秒後自動再試。已完成的頁面都已儲存，沒有頁面被算成失敗。`
      : wait.kind === "provider" ? `AI 服務忙碌，${seconds} 秒後自動繼續。`
        : `第 ${wait.page} 頁這次沒有成功，${seconds} 秒後自動重試。`}</span>
  </p>;
}

export function CircuitPdfAiReview({ open, onOpenChange, official: sourceOfficial, working: sourceWorking, userName, disabled = false, savedReport, previousReports = [], onSave, allPages, focusFinding, batchPolicy }: CircuitPdfAiReviewProps) {
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
  const [notice, setNotice] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [batch, setBatch] = useState<CircuitPdfAiBatchPage[]>([]), [batchRunning, setBatchRunning] = useState(false), [batchStopped, setBatchStopped] = useState(false);
  const [batchScope, setBatchScope] = useState<"all" | "selected">("all");
  const [phase, setPhase] = useState<"loading" | "local" | "ai" | null>(null);
  const [localProgress, setLocalProgress] = useState({ done: 0, total: 0 });
  const [wait, setWait] = useState<CircuitPdfAiBatchWait | null>(null);
  /** Why the batch stopped by itself (止損, or a connection that did not come back). */
  const [stop, setStop] = useState<{ reason: CircuitPdfAiBatchStop["reason"]; message: string } | null>(null);
  const [tokens, setTokens] = useState({ input: 0, output: 0 });
  /** 有差異的頁再用 AI 說明: off compares in the browser only and spends nothing. */
  const [useAi, setUseAi] = useState(true);
  /** Compare again pages that already have a saved result. */
  const [redo, setRedo] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [pageInput, setPageInput] = useState("");
  const selectionId = useId();
  const batchRef = useRef(batch);
  /** 本機比對 of each working page for the pair and page matching on screen, kept so a resumed run does not read a page twice. */
  const localRef = useRef(new Map<number, CircuitLocalPageDiff>());
  /** The stored results were looked up for the batch on screen (false after a failed or stopped look-up). */
  const savedChecked = useRef(false);
  const exportRequest = useRef<AbortController | null>(null);
  const commonRef = useRef<CircuitCommonChanges | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null), changed = useRef(dirty); changed.current = dirty;
  const active = useRef(open); active.current = open;
  const model = models.find(item => item.id === modelId), busy = analysing || saving || batchRunning || loadingPage || Boolean(exporting);
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
  const identicalCount = batch.filter(item => item.status === "complete" && item.report && isCircuitReportIdentical(item.report)).length;
  const commonCount = batch.filter(item => item.status === "complete" && item.report && describeCircuitAiPage(item).outcome === "common").length;
  const differentCount = batch.filter(item => item.status === "complete" && item.report && describeCircuitAiPage(item).outcome === "different").length;
  const analysingPages = batch.filter(item => item.status === "analysing").map(item => item.workingPage);
  const savingPages = batch.filter(item => item.status === "saving").map(item => item.workingPage);
  const savingReview = saving || savingPages.length > 0;
  const unfinished = batch.some(item => !["complete", "unmatched"].includes(item.status));
  const canResumeDirty = dirty && result === batch.find(item => item.status === "unsaved" && item.report?.key === key)?.report;
  // Without an AI service the pages are still compared in the browser; a model is only needed to explain the differences.
  const cannotStartBatch = !validSources || !allPages || loadingModels || disabled || busy || dirty || unsavedCount > 0 || Boolean(historyId);

  useEffect(() => {
    setReviewPage(sourceWorking?.page ?? 1); setBatch([]); batchRef.current = []; setBatchRunning(false); setBatchStopped(false); setLoadingPage(false); setDeadline(null); setRetryAt(null);
    setPageInput(""); setBatchScope("all"); setPhase(null); setWait(null); setStop(null); setNotice(""); setTokens({ input: 0, output: 0 });
    localRef.current = new Map(); commonRef.current = null; savedChecked.current = false;
    return () => { request.current?.abort(); exportRequest.current?.abort(); };
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
  const openFinding = useCallback((id: string, block: ScrollLogicalPosition = "nearest") => {
    const finding = document.getElementById(`${selectionId}-${id}`);
    if (!(finding instanceof HTMLDetailsElement)) return false;
    finding.open = true;
    finding.scrollIntoView({ block });
    finding.querySelector("summary")?.focus({ preventScroll: true });
    return true;
  }, [selectionId]);
  useEffect(() => {
    if (!open || !focusFinding || !result || focused.current === `${result.id}:${focusFinding}`) return;
    if (openFinding(focusFinding, "start")) focused.current = `${result.id}:${focusFinding}`;
  }, [open, focusFinding, result, openFinding]);

  function updateBatch(page: CircuitPdfAiBatchPage) {
    const next = batchRef.current.map(item => item.workingPage === page.workingPage ? page : item);
    batchRef.current = next; setBatch(next);
  }
  const count = (report: CircuitPdfAiReviewReport) => { if (report.usage) setTokens(value => ({ input: value.input + report.usage!.input, output: value.output + report.usage!.output })); };
  const pageSource = (page: number, mapped: number) => ({ official: { ...sourceOfficial!, page: mapped }, working: { ...sourceWorking!, page } });

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
    if (!sourceOfficial || !sourceWorking || !validSources || !allPages || loadingModels || disabled || busy || request.current || (dirty && !(resume && canResumeDirty)) || (!resume && unsavedCount > 0) || historyId) return;
    if (scope === "selected" && (!selectedPlan.length || selectedUnmatched === selectedPlan.length)) return;
    const controller = new AbortController(), captured = key, signal = controller.signal;
    const live = () => request.current === controller && active.current && current.current === captured;
    const targetKey = (page: CircuitPdfAiBatchPage) => circuitPdfAiReviewKey({ officialVersionId: sourceOfficial.id, workingVersionId: sourceWorking.id, officialPage: page.officialPage!, workingPage: page.workingPage });
    request.current = controller;
    if (!resume) setBatchScope(scope);
    setBatchRunning(true); setBatchStopped(false); setError(""); setNotice(""); setStop(null); setDeadline(null); setRetryAt(null); setWait(null);
    let pages: CircuitPdfAiBatchPage[] = resume
      ? batchRef.current.map(page => page.status === "checking" || page.status === "analysing" ? { ...page, status: "pending" as const } : page)
      : scope === "selected" ? selectedPlan : buildCircuitPdfAiBatchPages(officialCount, workingCount, officialPageFor);
    batchRef.current = pages; setBatch(pages);
    if (!resume) savedChecked.current = false;
    const aiModel = useAi ? model : undefined;
    try {
      // Pages compared before keep their result: an interrupted run only does what is left, and nothing is paid for twice.
      // A run resumed after this look-up failed or was stopped does it now.
      if (!redo && !savedChecked.current && allPages.onLoadAll) {
        setPhase("loading");
        const latest = new Map<string, CircuitPdfAiReviewReport>();
        for (const report of await allPages.onLoadAll()) { const known = latest.get(report.key); if (!known || report.createdAt > known.createdAt) latest.set(report.key, report); }
        if (!live() || signal.aborted) return;
        // A page with an answer in hand (stored or waiting to be stored) keeps it.
        pages = pages.map(page => { const report = page.officialPage === null || page.report ? undefined : latest.get(targetKey(page)); return report ? { ...page, status: "complete" as const, report, error: undefined } : page; });
        batchRef.current = pages; setBatch(pages);
        savedChecked.current = true;
      }
      // 本機比對: every page left is read in the browser first. No AI, no tokens, works without a connection.
      const todo = pages.filter(page => page.status === "pending" || page.status === "failed");
      const unreadable = new Map<number, string>();
      setPhase("local"); setLocalProgress({ done: 0, total: todo.length });
      let done = 0;
      for (const page of todo) {
        if (signal.aborted || !live()) break;
        if (!localRef.current.has(page.workingPage)) {
          updateBatch({ ...page, status: "checking", error: undefined, report: undefined });
          try { localRef.current.set(page.workingPage, await compareCircuitPdfPages({ pdf: sourceOfficial.pdf, page: page.officialPage! }, { pdf: sourceWorking.pdf, page: page.workingPage }, signal)); }
          catch (failure) { if (!signal.aborted) unreadable.set(page.workingPage, failure instanceof Error ? failure.message : "這一頁無法在本機比對。"); }
          if (!live()) return;
          updateBatch({ ...page, status: "pending", error: undefined, report: undefined });
        }
        setLocalProgress({ done: ++done, total: todo.length });
        // Let the window repaint between pages.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (signal.aborted || !live()) return;
      const diffs = [...localRef.current.values()];
      const common = diffs.length >= 4 ? findCircuitCommonChanges(diffs.map(diff => diff.textChanges)) : null;
      commonRef.current = common;
      pages = batchRef.current.map(page => {
        if (page.status !== "pending" && page.status !== "failed") return page;
        const diff = localRef.current.get(page.workingPage);
        if (!diff) return aiModel ? { ...page, status: "pending" as const, error: undefined } : { ...page, status: "failed" as const, error: unreadable.get(page.workingPage) ?? "這一頁無法在本機比對，請選擇 AI 服務後再試。" };
        const summary = summarizeCircuitLocalDiff(diff, common);
        // Settled here: the drawings were laid over each other and the page has no difference of its own (changes that
        // many sheets share, like the title block date, are listed but need no AI).
        const settled = summary.own === 0 && summary.omitted === 0 && diff.graphicsComparable;
        // Only pages that really differ are worth an AI explanation; the rest are finished here.
        if (aiModel && !settled) return { ...page, status: "pending" as const, error: undefined };
        return { ...page, status: "unsaved" as const, error: undefined, report: buildCircuitLocalReport({ ...pageSource(page.workingPage, page.officialPage!), userName, diff, common }) };
      });
      batchRef.current = pages; setBatch(pages);
      setPhase("ai");
      let remainingPages = pages.filter(page => page.status === "pending").length;
      const startedAt = new Map<number, number>();
      const recentPageTimes: number[] = [];
      await runCircuitPdfAiBatchReview({ pages: pages.filter(page => page.status !== "failed"), signal, ...(batchPolicy ? { policy: batchPolicy } : {}),
        analyse: async (page, attemptNumber) => {
          const diff = localRef.current.get(page.workingPage);
          const report = await runCircuitPdfAiReview({ ...pageSource(page.workingPage, page.officialPage!), model: aiModel!, userName, signal, attemptNumber, local: diff ? { diff, common: commonRef.current } : undefined });
          if (live()) count(report);
          return report;
        },
        save: report => allPages.onSave(report),
        onCooldown: retryTime => { if (live()) setRetryAt(performance.now() + Math.max(0, retryTime - Date.now())); },
        onWait: value => { if (live()) setWait(value); },
        onUpdate: page => {
          if (!live()) return;
          updateBatch(page);
          const now = performance.now();
          if (page.status === "analysing" && !startedAt.has(page.workingPage)) startedAt.set(page.workingPage, now);
          const start = startedAt.get(page.workingPage);
          if (start !== undefined && (page.status === "complete" || page.status === "unsaved" || page.status === "failed")) {
            remainingPages--;
            startedAt.delete(page.workingPage);
            if (page.status !== "failed") {
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
      if (active.current && current.current === captured && !signal.aborted) {
        if (failure instanceof CircuitPdfAiBatchStop) setStop({ reason: failure.reason, message: failure.message });
        setError(failure instanceof Error ? failure.message : "批次比對暫停，已完成頁面仍保留。");
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (active.current && current.current === captured) {
          // A page settled in the browser but not stored yet costs nothing to do again, so it never blocks closing.
          let shown = false;
          const next = batchRef.current.map(page => {
            if (page.status === "checking") return { ...page, status: "pending" as const };
            if (page.status !== "unsaved" || page.report?.source !== "local") return page;
            if (page.report.key === captured) shown = true;
            return { ...page, status: "pending" as const, report: undefined, error: undefined };
          });
          batchRef.current = next; setBatch(next);
          if (shown) { setResult(latestSaved.current?.key === captured ? latestSaved.current : null); setDirty(false); }
          setBatchRunning(false); setBatchStopped(signal.aborted); setDeadline(null); setRetryAt(null); setWait(null); setPhase(null);
        }
      }
    }
  }
  const resumeRef = useRef<() => void>(() => {}); resumeRef.current = () => void analyseBatch("resume");
  // A batch paused because the connection was gone goes on by itself when the browser is back online.
  useEffect(() => {
    if (stop?.reason !== "network" || batchRunning) return;
    const resume = () => resumeRef.current();
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, [stop, batchRunning]);

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
    if (!official || !working || disabled || busy || dirty || !validPair || historyId) return;
    const controller = new AbortController(), captured = key; request.current = controller; setAnalysing(true); setError(""); setNotice(""); setDeadline(null);
    try {
      // The same order as a batch: read both pages in the browser, and ask the AI only when they really differ.
      let diff: CircuitLocalPageDiff | undefined;
      try { diff = await compareCircuitPdfPages({ pdf: official.pdf, page: official.page }, { pdf: working.pdf, page: working.page }, controller.signal); }
      catch (failure) { if (controller.signal.aborted) return; if (!model || !useAi) throw failure instanceof Error ? failure : new Error("這一頁無法在本機比對。"); }
      if (!active.current || current.current !== captured || controller.signal.aborted) return;
      const summary = diff ? summarizeCircuitLocalDiff(diff, commonRef.current) : null;
      const settled = Boolean(diff && summary && summary.own === 0 && summary.omitted === 0 && diff.graphicsComparable);
      const report = diff && (settled || !model || !useAi)
        ? buildCircuitLocalReport({ official, working, userName, diff, common: commonRef.current })
        : await runCircuitPdfAiReview({ official, working, model: model!, userName, signal: controller.signal, local: diff ? { diff, common: commonRef.current } : undefined,
          onRequestStart: timeoutMs => { if (request.current === controller && !controller.signal.aborted) setDeadline(performance.now() + timeoutMs); } });
      if (!active.current || current.current !== captured || controller.signal.aborted) return;
      count(report);
      setResult(report); setDirty(true); setAnalysing(false); request.current = null;
      await persist(report);
    } catch (failure) {
      if (active.current && current.current === captured && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "AI 初審失敗，原有結果未變更。");
    } finally { if (request.current === controller) { request.current = null; if (active.current && current.current === captured) setAnalysing(false); } }
  }

  /** 下載報告: every page of the pair as it stands now, compared in this window or earlier. */
  async function exportReport() {
    if (!sourceOfficial || !sourceWorking || !validSources || busy) return;
    const captured = key, controller = new AbortController(); exportRequest.current = controller; setExporting({ done: 0, total: 0 }); setError(""); setNotice("");
    try {
      const latest = new Map<string, CircuitPdfAiReviewReport>();
      const keep = (report: CircuitPdfAiReviewReport | undefined) => { if (!report) return; const known = latest.get(report.key); if (!known || report.createdAt > known.createdAt) latest.set(report.key, report); };
      // Without a connection the report is made from what this window already holds, and says so.
      let offline = false;
      try { for (const report of allPages?.onLoadAll ? await allPages.onLoadAll() : previousReports) keep(report); }
      catch { offline = true; for (const report of previousReports) keep(report); }
      if (controller.signal.aborted) return;
      for (const page of batchRef.current) keep(page.report);
      const pages: CircuitAiReportPage[] = Array.from({ length: workingCount }, (_, index) => {
        const workingPage = index + 1, mapped = officialPageFor(workingPage), matched = Number.isInteger(mapped) && mapped >= 1 && mapped <= officialCount;
        const row = batchRef.current.find(item => item.workingPage === workingPage);
        return { workingPage, officialPage: matched ? mapped : null, error: row?.status === "failed" ? row.error : undefined,
          report: matched ? latest.get(circuitPdfAiReviewKey({ officialVersionId: sourceOfficial.id, workingVersionId: sourceWorking.id, officialPage: mapped, workingPage })) : undefined };
      });
      const { exportCircuitPdfAiReport } = await import("./circuitPdfAiReportExport");
      const done = await exportCircuitPdfAiReport({ official: sourceOfficial, working: sourceWorking, pages, userName, signal: controller.signal,
        note: [stop?.message, offline && "讀不到雲端紀錄，這份報告只包含這次視窗裡看得到的結果。"].filter(Boolean).join(" ") || undefined,
        onProgress: (drawn, total) => { if (active.current && !controller.signal.aborted) setExporting({ done: drawn, total }); } });
      if (active.current && current.current === captured) setNotice(`報告已下載：${done.fileName}${done.markedPages > done.drawnPages ? `（圖面放了前 ${done.drawnPages} 頁，其餘在差異清單）` : ""}${offline ? "（讀不到雲端紀錄，只包含這次視窗裡的結果）" : ""}`);
    } catch (failure) {
      if (active.current && current.current === captured && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "報告沒有產生，請重試。");
    } finally { if (exportRequest.current === controller) exportRequest.current = null; if (active.current) setExporting(null); }
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
    request.current?.abort(); exportRequest.current?.abort(); onOpenChange(false);
  }

  const batchTitle = batchRunning
    ? phase === "loading" ? "正在讀取已經比對過的頁面…" : phase === "local" ? `本機比對中 ${localProgress.done}／${localProgress.total} 頁（不使用 AI）` : `${batchLabel}比對中`
    : stop ? "比對已自動停止" : batchStopped ? `已${stopBatchLabel}` : unfinished ? "部分頁面尚未完成" : `${batchLabel}比對已結束`;
  const chipLabel = (item: CircuitPdfAiBatchPage) => item.status === "complete" && item.report ? describeCircuitAiPage(item).label : batchLabels[item.status];
  const pageError = batch.find(item => item.workingPage === reviewPage)?.error;

  return <Dialog open={open} onOpenChange={close}><DialogContent hideCloseButton className="circuit-pdf-ai-dialog" data-testid="circuit-pdf-ai-review" onInteractOutside={event => event.preventDefault()}>
    <header className="circuit-pdf-ai-heading"><div><DialogTitle><Sparkles aria-hidden="true" />AI 比對新舊版</DialogTitle><DialogDescription>先在這台電腦逐頁比對（不用 AI、不耗 token），只有真的不一樣的頁才請 AI 說明。每頁結果自動儲存，完成後可下載報告。</DialogDescription></div><Button title="關閉 AI 比對；還沒儲存的判讀要先儲存" type="button" variant="ghost" aria-label="關閉 AI 比對" disabled={savingReview} onClick={() => close(false)}><X aria-hidden="true" /></Button></header>
    <section className="circuit-pdf-ai-targets" aria-label="本次比對來源"><p><strong>基準版</strong><span title={sourceOfficial?.name}>{sourceOfficial?.name ?? "尚未設定"}</span><b>{official ? `第 ${official.page} 頁` : "無對應頁"}</b></p><p><strong>比對版</strong><span title={working?.name}>{working?.name ?? "尚未選擇"}</span><b>第 {working?.page ?? "—"} 頁</b></p></section>
    <div className="circuit-pdf-ai-toolbar">
      <label>AI 服務<select title="選擇要用哪一個 AI 服務說明有差異的頁；沒有 AI 服務也能做本機比對" aria-label="AI 初審服務" value={modelId} disabled={disabled || busy || loadingModels} onChange={event => setModelId(event.target.value)}><option value="">{loadingModels ? "讀取 AI 服務中…" : models.length ? "選擇 AI 服務" : "沒有 AI 服務（只做本機比對）"}</option>{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <Button title="只比對目前這一頁：先本機比對，有差異才送 AI" type="button" variant="outline" disabled={!validPair || disabled || busy || dirty || Boolean(historyId)} onClick={() => void analyse()}><Sparkles aria-hidden="true" />{result ? "重新比對這一頁" : "只比對這一頁"}</Button>
      <Button title="逐頁比對所選的兩份 PDF：相同的頁直接完成，有差異的頁才送 AI；比對過的頁不會重做" type="button" variant="outline" disabled={cannotStartBatch} onClick={() => void analyseBatch("all")}><Files aria-hidden="true" />全部頁面比對</Button>
      <Button title="把目前所有頁的比對結果做成 Excel 報告：摘要、各頁結果、差異清單與標了框的圖面" type="button" variant="outline" data-circuit-tone="done" disabled={!validSources || busy} aria-busy={Boolean(exporting)} onClick={() => void exportReport()}>{exporting ? <LoaderCircle className="circuit-pdf-ai-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{exporting ? (exporting.total ? `製作報告 ${exporting.done}／${exporting.total}` : "製作報告…") : "下載報告"}</Button>
      {(analysing || batchRunning) && <Button title="停止比對；已完成的頁面會保留" type="button" variant="outline" onClick={() => request.current?.abort()}>{batchRunning ? stopBatchLabel : "取消初審"}</Button>}
      {previousReports.some(item => item.key === key && item.id !== savedCurrent?.id) && <label className="circuit-pdf-ai-history">歷次 AI 初審<select title="查看這一頁以前跑過的 AI 比對結果" aria-label="歷次 AI 初審" value={historyId} disabled={busy} onChange={event => { if (dirty) { setError("請先儲存人工判讀，再切換初審紀錄。"); return; } const id = event.target.value; setHistoryId(id); setError(""); if (id) setResult(previousReports.find(item => item.id === id && item.key === key) ?? null); }}><option value="">目前結果</option>{previousReports.filter(item => item.key === key && item.id !== savedCurrent?.id).map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString("zh-TW")} · {item.generatedBy} · {item.modelLabel}</option>)}</select></label>}
    </div>
    <main className="circuit-pdf-ai-body">
      {allPages && validSources && <div className="circuit-pdf-ai-options" role="group" aria-label="比對方式">
        <label title="打勾：有差異的頁會送給上面選的 AI 服務說明差異的意義，相同的頁不送。取消：只做本機比對，完全不花 token"><input type="checkbox" checked={useAi} disabled={disabled || busy} onChange={event => setUseAi(event.target.checked)} /><span>有差異的頁再用 AI 說明<small>{model ? "只送有差異的頁，相同的頁不花 token" : "目前沒有可用的 AI 服務，只做本機比對"}</small></span></label>
        <label title="預設不打勾：比對過、已經有結果的頁會沿用，中斷後再按一次只做還沒比對的頁。打勾：全部重新比對"><input type="checkbox" checked={redo} disabled={disabled || busy} onChange={event => setRedo(event.target.checked)} /><span>比對過的頁也重新比對<small>不打勾時只做還沒有結果的頁</small></span></label>
      </div>}
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
      {(analysing || (batchRunning && phase === "ai" && analysingPages.length > 0)) && <ReviewCountdown deadline={deadline} retryAt={retryAt} batch={batchRunning} />}
      {allPages && <div className="circuit-pdf-ai-batch-hint"><p>{matchedPageFor ? "指定與全部比對沿用圖面上每一頁的基準版對應頁（依內容自動對齊，可在圖面的基準版頁碼修改）。" : `指定與全部比對沿用目前基準版的對應頁${officialOffset ? `（偏移 ${officialOffset > 0 ? "+" : ""}${officialOffset} 頁）` : ""}。`}最多同時送 {CIRCUIT_PDF_AI_BATCH_CONCURRENCY} 頁給 AI，每頁完成後個別儲存；失敗會自動重試，網路中斷會等待恢復。</p><label>查看頁面<select title="切換要查看哪一頁的比對結果" aria-label="查看初審頁面" value={reviewPage} disabled={busy} onChange={event => {
        const page = Number(event.target.value), mapped = officialPageFor(page);
        void selectPage({ workingPage: page, officialPage: mapped, status: "pending" });
      }}>{Array.from({ length: sourceWorking?.pdf.numPages ?? 0 }, (_, index) => {
        const page = index + 1, mapped = officialPageFor(page), matched = mapped > 0 && mapped <= (sourceOfficial?.pdf.numPages ?? 0);
        return <option key={page} value={page} disabled={!matched}>比對版 {page} · {matched ? `基準版 ${mapped}` : "無對應頁"}</option>;
      })}</select></label></div>}
      {batch.length > 0 && <section className="circuit-pdf-ai-batch" aria-label={`${batchLabel}比對進度`} data-stopped={Boolean(stop)}>
        <header><div><h3>{batchTitle}</h3><p role="status">已儲存 {completeCount}／{batch.length - unmatchedCount} 頁{identicalCount > 0 && ` · 相同 ${identicalCount} 頁`}{commonCount > 0 && ` · 只有共通變更 ${commonCount} 頁`}{differentCount > 0 && ` · 有差異 ${differentCount} 頁`}{failedCount > 0 && ` · 失敗 ${failedCount} 頁`}{unsavedCount > 0 && ` · 尚未儲存 ${unsavedCount} 頁`}{unmatchedCount > 0 && ` · 無對應 ${unmatchedCount} 頁`}{analysingPages.length > 0 && ` · 正在比對第 ${analysingPages.join("、")} 頁`}{savingPages.length > 0 && savingPages.length <= 6 && ` · 正在儲存第 ${savingPages.join("、")} 頁`}{tokens.input + tokens.output > 0 && ` · 本次 AI 用量約 ${(tokens.input + tokens.output).toLocaleString()} tokens`}</p></div>
          {!batchRunning && unfinished && <Button title="接著比對還沒完成的頁面；已完成的不會重做" type="button" variant="outline" disabled={disabled || busy || dirty && !canResumeDirty || Boolean(historyId)} onClick={() => void analyseBatch("resume")}>繼續未完成頁面</Button>}
          {!batchRunning && unsavedCount > 0 && <Button title="放棄還沒儲存的頁面結果" type="button" variant="ghost" disabled={busy} onClick={discardUnsaved}>捨棄未儲存結果</Button>}
        </header>
        <progress aria-label="已儲存頁面進度" value={completeCount} max={Math.max(1, batch.length - unmatchedCount)} />
        {wait && batchRunning && <WaitNote wait={wait} />}
        {stop && !batchRunning && <p className="circuit-pdf-ai-stop" role="alert">{stop.message}{stop.reason === "network" && " 瀏覽器偵測到網路恢復時會自動繼續。"}</p>}
        <div className="circuit-pdf-ai-batch-pages" role="group" aria-label="各頁比對結果">{batch.map(item => <button key={item.workingPage} type="button" aria-label={`查看比對版第 ${item.workingPage} 頁初審`} aria-pressed={reviewPage === item.workingPage} disabled={busy || item.officialPage === null} data-status={item.status} data-outcome={item.status === "complete" && item.report ? describeCircuitAiPage(item).outcome : undefined} title={item.error || item.report?.summary} onClick={() => void selectPage(item)}><span>比對版 {item.workingPage}<small>{item.officialPage === null ? "無基準版對應頁" : `基準版 ${item.officialPage}`}</small></span><strong>{chipLabel(item)}</strong></button>)}</div>
        {unmatchedCount > 0 && <p className="circuit-pdf-ai-batch-note">無對應頁未送出 AI。若這些是移位的頁面，請回圖面調整基準版對應頁後再比對。</p>}
        {pageError && <p className="circuit-pdf-ai-error" role="alert">比對版第 {reviewPage} 頁：{pageError}</p>}
      </section>}
      <p className="circuit-pdf-ai-limits">比對可見的接線、Net 名稱與元件／接腳。有疑點或證據不足就標註，正式判讀由你確認。</p>
      {!validPair && <p role="status" className="circuit-pdf-ai-message">{validSources ? "目前這一頁沒有基準版對應頁。仍可指定其他頁面或比對全部，沒有對應的頁面會另外列出。" : "請先在圖面區選擇兩份不同的 PDF 和對應頁碼。"}</p>}
      {disabled && <p className="circuit-pdf-ai-message">目前只能查看已儲存初審；執行 AI 與儲存人工判讀需要料號申請編輯權限。</p>}
      {historyId && <p className="circuit-pdf-ai-message">正在查看歷史初審，內容唯讀。請在「歷次 AI 初審」選回「目前結果」，再執行初審或記錄人工判讀。</p>}
      {error && error !== stop?.message && <p role="alert" className="circuit-pdf-ai-error">{error}</p>}
      {notice && <p role="status" className="circuit-pdf-ai-notice"><Check aria-hidden="true" />{notice}</p>}
      {analysing && <p role="status" className="circuit-pdf-ai-progress"><LoaderCircle aria-hidden="true" />正在比對這一頁：先在本機逐字、逐點比對，有差異才送 AI…</p>}
      {!result && !batch.length && !analysing && !batchRunning && validPair && <div className="circuit-pdf-ai-empty"><Sparkles aria-hidden="true" /><h3>還沒有比對結果</h3><p>按「全部頁面比對」：相同的頁直接完成，有差異的頁才送 AI。每頁結果自動儲存，中斷後再按一次只會接著做還沒比對的頁；完成後按「下載報告」。</p></div>}
      {result && <section className="circuit-pdf-ai-results" aria-label="本頁 AI 初審結果"><header><h3>比對版第 {result.workingPage} 頁 · 基準版第 {result.officialPage} 頁初審摘要</h3><p>{result.summary}</p><small>{result.generatedBy} · {new Date(result.createdAt).toLocaleString("zh-TW")} · {result.modelLabel}{result.usage ? ` · ${(result.usage.input + result.usage.output).toLocaleString()} tokens` : ""}</small></header>
        <dl className="circuit-pdf-ai-checks">{result.checks.map(item => <div key={item.category} data-state={item.state}><dt>{CIRCUIT_AI_CATEGORY_LABELS[item.category]}<strong>{checkLabels[item.state]}</strong></dt><dd>{item.note}</dd></div>)}</dl>
        {result.key === key && official && working && <CircuitPdfAiAnnotations report={result} official={official} working={working} onFinding={id => { openFinding(id); }} />}
        <h3>待核對項目 <span>{result.findings.filter(item => item.decision === "pending").length} 項未判讀／共 {result.findings.length} 項</span></h3>
        {!result.findings.length && <p className="circuit-pdf-ai-message">{isCircuitReportIdentical(result) ? "兩版這一頁相同，沒有需要核對的項目。" : "沒有列出具體可見疑點，仍需你核對圖面與初審限制後，另行完成正式 Review。"}</p>}
        {result.findings.map(item => <details key={item.id} id={`${selectionId}-${item.id}`} className="circuit-pdf-ai-finding"><summary><span data-priority={item.priority}>{priorityLabels[item.priority]}</span><b>{item.id} · {item.title}</b>{item.certainty === "unclear" && <small className="circuit-pdf-ai-unclear">證據不足</small>}<small>{decisionLabels[item.decision]}</small></summary><div className="circuit-pdf-ai-finding-content"><p><strong>{CIRCUIT_AI_CATEGORY_LABELS[item.category]} · 位置</strong>{item.location}</p><div className="circuit-pdf-ai-evidence"><p><strong>基準版證據</strong>{item.officialEvidence}</p><p><strong>比對版證據</strong>{item.workingEvidence}</p></div><p><strong>核對建議</strong>{item.suggestion}</p>{item.category === "connectivity" && <p className="circuit-pdf-ai-message">PDF 僅供核對圖面上看得到的接線。</p>}<div className="circuit-pdf-ai-decisions" role="group" aria-label={`${item.id} 人工判讀`}>{(["pending", "confirmed", "dismissed"] as const).map(decision => <button key={decision} type="button" title={decisionHints[decision]} disabled={disabled || busy || Boolean(historyId)} aria-pressed={item.decision === decision} onClick={() => editFinding(item.id, { decision })}>{decisionLabels[decision]}</button>)}</div><label className="circuit-pdf-ai-note">人工核對備註<Textarea aria-label={`${item.id} 人工核對備註`} value={item.reviewNote} maxLength={2000} disabled={disabled || busy || Boolean(historyId)} onChange={event => editFinding(item.id, { reviewNote: event.target.value })} placeholder="例如：圖面交叉處沒有接點，兩條線未連接。" /></label>{item.reviewedAt && <small>{item.reviewedBy} · {new Date(item.reviewedAt).toLocaleString("zh-TW")}</small>}</div></details>)}
      </section>}
    </main>
    <footer className="circuit-pdf-ai-footer"><span role="status">{saving ? "正在儲存初審結果…" : batchRunning ? "可停止比對，已儲存頁面會保留" : dirty ? "尚有未儲存的初審／人工判讀" : result ? "已儲存；正式 Review 仍由你確認" : "請選擇比對範圍"}</span><div>{dirty && <Button type="button" variant="ghost" title="放棄這頁還沒儲存的判讀，回到上次儲存的結果" disabled={busy} onClick={() => { const page = batchRef.current.find(item => item.report?.key === key && item.status === "unsaved"); if (page) updateBatch({ ...page, status: "failed", report: undefined, error: "已捨棄未儲存結果" }); setResult(savedCurrent?.key === key ? savedCurrent : null); setDirty(false); setError(""); }}><RotateCcw aria-hidden="true" />恢復已儲存</Button>}{result && <Button data-circuit-tone="add" data-fill="solid" type="button" title="儲存你對這一頁的判讀，留下時間與操作者" disabled={!dirty || disabled || busy} onClick={() => void persist(result)}><Check aria-hidden="true" />儲存人工判讀</Button>}<Button data-circuit-tone="view" title="關閉 AI 比對，回到圖面" type="button" variant="outline" disabled={savingReview} onClick={() => close(false)}>返回圖面</Button></div></footer>
  </DialogContent></Dialog>;
}
