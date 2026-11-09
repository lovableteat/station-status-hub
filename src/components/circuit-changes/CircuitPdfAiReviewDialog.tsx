import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { loadSpecFillModels, type SpecFillModel } from "../material-requests/materialSpecFillService";
import { CIRCUIT_AI_CATEGORY_LABELS, circuitPdfAiReviewKey, runCircuitPdfAiReview, type CircuitPdfAiFinding, type CircuitPdfAiReviewReport, type CircuitPdfReviewPage } from "./circuitPdfAiReview";
import "./circuitPdfAiReview.css";

export interface CircuitPdfAiReviewProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  official: CircuitPdfReviewPage | null; working: CircuitPdfReviewPage | null;
  userName: string; disabled?: boolean; savedReport?: CircuitPdfAiReviewReport | null;
  previousReports?: CircuitPdfAiReviewReport[];
  onSave: (report: CircuitPdfAiReviewReport) => Promise<void>;
}
const decisionLabels = { pending: "待人工確認", confirmed: "已確認問題", dismissed: "不採用" };
const checkLabels = { "possible-issue": "有待核對項目", "no-visible-issue": "未見明顯差異", unverifiable: "證據不足" };
const priorityLabels = { high: "優先核對", medium: "需要注意", low: "一般提醒" };

export function CircuitPdfAiReview({ open, onOpenChange, official, working, userName, disabled = false, savedReport, previousReports = [], onSave }: CircuitPdfAiReviewProps) {
  const key = official && working ? circuitPdfAiReviewKey({ officialVersionId: official.id, workingVersionId: working.id, officialPage: official.page, workingPage: working.page }) : "";
  const current = useRef(key); current.current = key;
  const [models, setModels] = useState<SpecFillModel[]>([]), [modelId, setModelId] = useState("");
  const [loadingModels, setLoadingModels] = useState(false), [analysing, setAnalysing] = useState(false), [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CircuitPdfAiReviewReport | null>(null), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  const [historyId, setHistoryId] = useState("");
  const request = useRef<AbortController | null>(null), changed = useRef(dirty); changed.current = dirty;
  const active = useRef(open); active.current = open;
  const model = models.find(item => item.id === modelId), busy = analysing || saving;
  const validPair = Boolean(official && working && official.id !== working.id);

  useEffect(() => {
    request.current?.abort(); request.current = null; setAnalysing(false); setDirty(false); setError(""); setHistoryId("");
    setResult(savedReport?.key === key ? savedReport : null);
  }, [key, open]); // The report belongs to the exact immutable version pair and page mapping.
  useEffect(() => { if (!changed.current && !request.current && !historyId) setResult(savedReport?.key === key ? savedReport : null); }, [savedReport, key, historyId]);
  useEffect(() => {
    if (!open || disabled) { request.current?.abort(); return; }
    let present = true; setLoadingModels(true);
    void loadSpecFillModels().then(items => { if (present) { setModels(items); setModelId(previous => items.some(item => item.id === previous) ? previous : items[0]?.id ?? ""); } })
      .catch(failure => { if (present) setError(failure instanceof Error ? failure.message : "無法讀取 AI 服務。"); }).finally(() => { if (present) setLoadingModels(false); });
    return () => { present = false; request.current?.abort(); };
  }, [open, disabled]);

  async function persist(report: CircuitPdfAiReviewReport) {
    const captured = key; setSaving(true); setError("");
    try { await onSave(report); if (active.current && current.current === captured) setDirty(false); }
    catch (failure) { if (active.current && current.current === captured) setError(`初審結果尚未儲存：${failure instanceof Error ? failure.message : "請重試"}`); }
    finally { if (active.current && current.current === captured) setSaving(false); }
  }
  async function analyse() {
    if (!official || !working || !model || disabled || busy || dirty || !validPair || historyId) return;
    const controller = new AbortController(), captured = key; request.current = controller; setAnalysing(true); setError("");
    try {
      const report = await runCircuitPdfAiReview({ official, working, model, userName, signal: controller.signal });
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
    if (saving) return;
    if (dirty) { setError("這頁有尚未儲存的人工判讀，請先儲存，或恢復已儲存結果後再關閉。"); return; }
    request.current?.abort(); onOpenChange(false);
  }

  return <Dialog open={open} onOpenChange={close}><DialogContent hideCloseButton className="circuit-pdf-ai-dialog" data-testid="circuit-pdf-ai-review" onInteractOutside={event => event.preventDefault()}>
    <header className="circuit-pdf-ai-heading"><div><DialogTitle><Sparkles aria-hidden="true" />AI 逐頁初審</DialogTitle><DialogDescription>先由 AI 找出可見疑點，再由你逐項核對與完成正式 Review。</DialogDescription></div><Button type="button" variant="ghost" aria-label="關閉 AI 逐頁初審" disabled={saving} onClick={() => close(false)}><X aria-hidden="true" /></Button></header>
    <section className="circuit-pdf-ai-targets" aria-label="本次比對來源"><p><strong>官方基準</strong><span title={official?.name}>{official?.name ?? "尚未設定"}</span><b>第 {official?.page ?? "—"} 頁</b></p><p><strong>工作版本</strong><span title={working?.name}>{working?.name ?? "尚未選擇"}</span><b>第 {working?.page ?? "—"} 頁</b></p></section>
    <div className="circuit-pdf-ai-toolbar"><label>AI 服務<select aria-label="AI 初審服務" value={modelId} disabled={disabled || busy || loadingModels} onChange={event => setModelId(event.target.value)}><option value="">{loadingModels ? "讀取 AI 服務中…" : "選擇 AI 服務"}</option>{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><Button type="button" disabled={!validPair || !model || disabled || busy || dirty || Boolean(historyId)} onClick={() => void analyse()}><Sparkles aria-hidden="true" />{result ? "重新初審本頁" : "開始本頁 AI 初審"}</Button>{analysing && <Button type="button" variant="outline" onClick={() => request.current?.abort()}>取消初審</Button>}{previousReports.some(item => item.key === key && item.id !== savedReport?.id) && <label className="circuit-pdf-ai-history">歷次 AI 初審<select aria-label="歷次 AI 初審" value={historyId} disabled={busy} onChange={event => { if (dirty) { setError("請先儲存人工判讀，再切換初審紀錄。"); return; } const id = event.target.value; setHistoryId(id); setError(""); if (id) setResult(previousReports.find(item => item.id === id && item.key === key) ?? null); }}><option value="">目前結果</option>{previousReports.filter(item => item.key === key && item.id !== savedReport?.id).map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString("zh-TW")} · {item.generatedBy} · {item.modelLabel}</option>)}</select></label>}</div>
    <main className="circuit-pdf-ai-body">
      <p className="circuit-pdf-ai-limits">檢查本頁可見的線段、連接標籤、Net 與元件／接腳名稱。PDF 影像不能證明完整電氣連通；連接性疑點仍需原生 netlist／ERC 核對。AI 結果不會自動勾選「本頁看過」或確認修改項目。</p>
      {!validPair && <p role="status" className="circuit-pdf-ai-message">請先在 PDF 區設定官方基準，並選擇另一份工作版本及對應頁碼。</p>}
      {disabled && <p className="circuit-pdf-ai-message">目前只能查看已儲存初審；執行 AI 與儲存人工判讀需要料號申請編輯權限。</p>}
      {historyId && <p className="circuit-pdf-ai-message">正在查看歷史初審，內容唯讀。請在「歷次 AI 初審」選回「目前結果」，再執行初審或記錄人工判讀。</p>}
      {error && <p role="alert" className="circuit-pdf-ai-error">{error}</p>}
      {analysing && <p role="status" className="circuit-pdf-ai-progress"><LoaderCircle aria-hidden="true" />正在讀取兩份原始 PDF 頁面並進行 AI 初審…</p>}
      {!result && !analysing && validPair && <div className="circuit-pdf-ai-empty"><Sparkles aria-hidden="true" /><h3>這組版本與頁碼還沒有初審結果</h3><p>按「開始本頁 AI 初審」，只把上方兩頁交給選取的 AI 服務。會保留模型、時間、操作者與前後版本，重新初審不會冒用舊版本結果。</p></div>}
      {result && <section className="circuit-pdf-ai-results" aria-label="本頁 AI 初審結果"><header><h3>初審摘要</h3><p>{result.summary}</p><small>{result.generatedBy} · {new Date(result.createdAt).toLocaleString("zh-TW")} · {result.modelLabel}</small></header>
        <dl className="circuit-pdf-ai-checks">{result.checks.map(item => <div key={item.category} data-state={item.state}><dt>{CIRCUIT_AI_CATEGORY_LABELS[item.category]}<strong>{checkLabels[item.state]}</strong></dt><dd>{item.note}</dd></div>)}</dl>
        <h3>人工核對清單 <span>{result.findings.filter(item => item.decision === "pending").length} 項待確認／共 {result.findings.length} 項</span></h3>
        {!result.findings.length && <p className="circuit-pdf-ai-message">AI 未列出具體可見疑點，仍需你核對圖面與初審限制後，另行完成正式 Review。</p>}
        {result.findings.map(item => <details key={item.id} className="circuit-pdf-ai-finding"><summary><span data-priority={item.priority}>{priorityLabels[item.priority]}</span><b>{item.id} · {item.title}</b><small>{decisionLabels[item.decision]}</small></summary><div className="circuit-pdf-ai-finding-content"><p><strong>{CIRCUIT_AI_CATEGORY_LABELS[item.category]} · 位置</strong>{item.location}</p><div className="circuit-pdf-ai-evidence"><p><strong>官方基準證據</strong>{item.officialEvidence}</p><p><strong>工作版本證據</strong>{item.workingEvidence}</p></div><p><strong>核對建議</strong>{item.suggestion}</p>{item.category === "connectivity" && <p className="circuit-pdf-ai-message">連接性僅為影像疑點，請以 netlist／ERC 核對後再判斷。</p>}<div className="circuit-pdf-ai-decisions" role="group" aria-label={`${item.id} 人工判讀`}>{(["pending", "confirmed", "dismissed"] as const).map(decision => <button key={decision} type="button" disabled={disabled || busy || Boolean(historyId)} aria-pressed={item.decision === decision} onClick={() => editFinding(item.id, { decision })}>{decisionLabels[decision]}</button>)}</div><label className="circuit-pdf-ai-note">人工核對備註<Textarea aria-label={`${item.id} 人工核對備註`} value={item.reviewNote} maxLength={2000} disabled={disabled || busy || Boolean(historyId)} onChange={event => editFinding(item.id, { reviewNote: event.target.value })} placeholder="例如：已核對原生 netlist，兩個標籤屬同一個 Net。" /></label>{item.reviewedAt && <small>{item.reviewedBy} · {new Date(item.reviewedAt).toLocaleString("zh-TW")}</small>}</div></details>)}
      </section>}
    </main>
    <footer className="circuit-pdf-ai-footer"><span role="status">{saving ? "正在儲存初審結果…" : dirty ? "尚有未儲存的初審／人工判讀" : result ? "已儲存；正式 Review 仍由你確認" : "每次初審只檢查目前對應的兩頁"}</span><div>{dirty && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setResult(savedReport?.key === key ? savedReport : null); setDirty(false); setError(""); }}><RotateCcw aria-hidden="true" />恢復已儲存</Button>}{result && <Button type="button" disabled={!dirty || disabled || busy} onClick={() => void persist(result)}><Check aria-hidden="true" />儲存人工判讀</Button>}<Button type="button" variant="outline" disabled={saving} onClick={() => close(false)}>返回圖面</Button></div></footer>
  </DialogContent></Dialog>;
}
