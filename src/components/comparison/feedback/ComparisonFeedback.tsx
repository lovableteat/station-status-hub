import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { Camera, Download, ImagePlus, MessageSquarePlus, RefreshCw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspaceMutationScope } from "@/hooks/useWorkspaceMutationScope";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { downloadLocal } from "../downloads";
import { captureFeedbackScreenshot } from "./capture";
import { assertReviewInput, feedbackDate, filterFeedbackReports, MAX_FEEDBACK_IMAGES, prepareFeedbackImages } from "./core";
import { createFeedbackRepository } from "./repository";
import { createSupabaseFeedbackAdapter } from "./supabaseAdapter";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, FEEDBACK_TABS } from "./types";
import type { FeedbackAttachment, FeedbackCategory, FeedbackImage, FeedbackReport, FeedbackStatus, FeedbackTab } from "./types";
import { useFeedbackFilters } from "./useFeedbackFilters";
import "./feedback.css";

type Preview = { url: string; name: string };
function LocalImage({ attachment, disabled, remove }: { attachment: FeedbackAttachment; disabled: boolean; remove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(attachment.file); setUrl(next); return () => URL.revokeObjectURL(next); }, [attachment.file]);
  return <figure className="feedback-image-card"><img src={url || undefined} alt={attachment.file.name} /><figcaption>{attachment.file.name}</figcaption><Button type="button" size="icon" variant="secondary" aria-label={`移除 ${attachment.file.name}`} disabled={disabled} onClick={remove}><X data-icon="inline-start" /></Button></figure>;
}

function RemoteImage({ image, download, preview }: { image: FeedbackImage; download: (path: string) => Promise<Blob>; preview: (value: Preview) => void }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false; let next = ""; setUrl(""); setError("");
    void download(image.path).then(blob => {
      if (cancelled) return;
      if (blob.size !== image.size) throw new Error("截圖下載不完整，請重試。");
      next = URL.createObjectURL(blob); setUrl(next);
    }).catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : "截圖載入失敗"); });
    return () => { cancelled = true; if (next) URL.revokeObjectURL(next); };
  }, [download, image.path, image.size, retry]);
  return <div className="feedback-remote-image">{url ? <button type="button" onClick={() => preview({ url, name: image.name })} aria-label={`檢視截圖 ${image.name}`}><img src={url} alt={image.name} /><span>{image.name}</span></button> : error ? <div role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>重試截圖</Button></div> : <p role="status">截圖載入中…</p>}</div>;
}

function ReportDetails({ report, isAdmin, busy, download, preview, review, dirty }: {
  report: FeedbackReport; isAdmin: boolean; busy: boolean; download: (path: string) => Promise<Blob>; preview: (value: Preview) => void;
  review: (report: FeedbackReport, status: FeedbackStatus, note: string) => Promise<FeedbackReport>;
  dirty: (value: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(report); const [status, setStatus] = useState(report.status); const [note, setNote] = useState(report.adminNote);
  const conflict = report.updatedAt !== baseline.updatedAt;
  const hasEdits = status !== baseline.status || note !== baseline.adminNote;
  useEffect(() => { dirty(hasEdits); return () => dirty(false); }, [dirty, hasEdits]);
  const loadLatest = () => { setBaseline(report); setStatus(report.status); setNote(report.adminNote); };
  const save = async () => { try { const updated = await review(baseline, status, note); setBaseline(updated); setStatus(updated.status); setNote(updated.adminNote); } catch { /* Parent keeps the error and unsaved fields visible. */ } };
  return <section className="feedback-detail" aria-label="回報詳情">
    <div className="feedback-section-heading"><div><h3>{report.title}</h3><p>{report.reporterName} · {FEEDBACK_TABS[report.tab]} · {feedbackDate(report.submittedAt ?? report.createdAt)}</p></div><Badge variant="secondary">{FEEDBACK_STATUSES[report.status]}</Badge></div>
    <p className="feedback-description">{report.description}</p>
    {!!report.projectName && <p className="feedback-context-line">比對名稱：{report.projectName}</p>}
    <div className="feedback-image-grid">{report.screenshots.map(image => <RemoteImage key={image.id} image={image} download={download} preview={preview} />)}</div>
    <details className="feedback-environment"><summary>頁面資訊</summary><p>{report.context.browser}</p><p>畫面尺寸：{report.context.width} × {report.context.height} · 版本：{report.context.revisionA || "—"} → {report.context.revisionB || "—"}</p><p>回報編號：{report.id}</p></details>
    {isAdmin ? <FieldGroup><Field><FieldLabel htmlFor="feedback-review-status">處理狀態</FieldLabel><Select value={status} disabled={busy} onValueChange={value => setStatus(value as FeedbackStatus)}><SelectTrigger id="feedback-review-status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="feedback-admin-note">處理備註</FieldLabel><Textarea id="feedback-admin-note" value={note} maxLength={2000} rows={3} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="記錄修正方式或後續安排" /></Field>
      {conflict && <Alert><AlertDescription>這份回報已有新版本。你的備註仍保留，請先載入最新內容再儲存。<Button variant="outline" size="sm" disabled={busy} onClick={loadLatest}>載入最新內容</Button></AlertDescription></Alert>}
      <div><Button disabled={busy || conflict || (status === baseline.status && note === baseline.adminNote)} onClick={() => void save()}>儲存處理結果</Button></div>
    </FieldGroup> : report.adminNote ? <div className="feedback-admin-note"><strong>處理備註</strong><p>{report.adminNote}</p></div> : null}
  </section>;
}

interface Props { tab: FeedbackTab; projectName: string; revisionA: string; revisionB: string }
export function ComparisonFeedback({ tab: currentTab, projectName, revisionA, revisionB }: Props) {
  const { user, sessionMode } = useUser(); const { canViewModule } = usePermissions();
  const accountId = user?.userId ?? "";
  const canSubmit = sessionMode === "authenticated" && Boolean(accountId) && canViewModule("ai-chat");
  const isAdmin = canSubmit && (user?.role === "admin" || user?.role === "super_admin");
  const guardId = accountId ? accountId + (isAdmin ? ':admin' : ':member') : null;
  const { capture: captureScope, isCurrent, assertCurrent } = useWorkspaceMutationScope(guardId, canSubmit);
  const repository = useMemo(() => createFeedbackRepository(createSupabaseFeedbackAdapter()), []);
  const [open, setOpen] = useState(false); const [panel, setPanel] = useState("new");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID()); const [attachments, setAttachments] = useState<FeedbackAttachment[]>([]);
  const attachmentRef = useRef(attachments); attachmentRef.current = attachments;
  const [reports, setReports] = useState<FeedbackReport[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [preview, setPreview] = useState<Preview | null>(null);
  const busyRef = useRef(false); const addingRef = useRef(false); const loadEpoch = useRef(0); const captureController = useRef<AbortController | null>(null);
  const reviewDirty = useRef(false); const setReviewDirty = useCallback((value: boolean) => { reviewDirty.current = value; }, []);
  const chooser = useRef<HTMLInputElement>(null); const { filters, setFilter, clear } = useFeedbackFilters();
  const resetDraft = useCallback(() => { setTitle(""); setDescription(""); setCategory("bug"); setDraftId(crypto.randomUUID()); attachmentRef.current = []; setAttachments([]); }, []);
  useEffect(() => {
    ++loadEpoch.current; captureController.current?.abort(); busyRef.current = false; addingRef.current = false; reviewDirty.current = false;
    setOpen(false); setReports([]); setSelectedId(null); setPreview(null); setError(""); setBusy(false); setAdding(false); setCapturing(false); setLoading(false); setMessage(""); resetDraft();
    return () => { captureController.current?.abort(); };
  }, [accountId, canSubmit, isAdmin, resetDraft]);

  const refresh = useCallback(async () => {
    const token = captureScope(); const epoch = ++loadEpoch.current; setLoading(true); setError("");
    try {
      const pendingKey = `comparison-feedback-pending:${accountId}`;
      const pendingId = window.sessionStorage.getItem(pendingKey);
      if (pendingId) {
        await repository.cleanupDraft(pendingId, () => assertCurrent(token));
        if (window.sessionStorage.getItem(pendingKey) === pendingId) window.sessionStorage.removeItem(pendingKey);
      }
      const next = await repository.listReports(isAdmin); if (epoch === loadEpoch.current && isCurrent(token)) setReports(next);
    }
    catch (caught) { if (epoch === loadEpoch.current && isCurrent(token)) setError(caught instanceof Error ? caught.message : "回報載入失敗。"); }
    finally { if (epoch === loadEpoch.current && isCurrent(token)) setLoading(false); }
  }, [accountId, isAdmin, repository, captureScope, isCurrent, assertCurrent]);
  useEffect(() => { if (open && canSubmit) void refresh(); }, [open, canSubmit, refresh]);
  const visible = useMemo(() => filterFeedbackReports(reports, filters), [reports, filters]);
  const owners = useMemo(() => [...new Map(reports.map(report => [report.reporterId ?? `deleted:${report.reporterUsername}`, report.reporterName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-Hant")), [reports]);
  const selected = reports.find(report => report.id === selectedId);

  const addImages = async (files: readonly File[]) => {
    if (!files.length || busyRef.current || addingRef.current) return;
    const token = captureScope(); addingRef.current = true; setAdding(true); setError("");
    try {
      const incoming = files.map(file => ({ id: crypto.randomUUID(), file })); const next = [...attachmentRef.current, ...incoming];
      await prepareFeedbackImages(draftId, accountId, next); assertCurrent(token);
      attachmentRef.current = next; setAttachments(next);
    } catch (caught) { if (isCurrent(token)) setError(caught instanceof Error ? caught.message : "截圖加入失敗。"); }
    finally { if (isCurrent(token)) { addingRef.current = false; setAdding(false); } }
  };
  const paste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => file !== null);
    if (files.length) { event.preventDefault(); void addImages(files); }
  };
  const capture = async () => {
    if (busyRef.current || addingRef.current || attachments.length >= MAX_FEEDBACK_IMAGES) return;
    const token = captureScope(); const controller = new AbortController(); captureController.current = controller;
    setCapturing(true); setError("");
    try { const file = await captureFeedbackScreenshot(controller.signal); assertCurrent(token); await addImages([file]); }
    catch (caught) { if (isCurrent(token)) setError(caught instanceof Error ? caught.message : "擷取畫面失敗。"); }
    finally { if (isCurrent(token)) setCapturing(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busyRef.current || addingRef.current || capturing) return;
    const token = captureScope(); busyRef.current = true; setBusy(true); setError("");
    try {
      window.sessionStorage.setItem(`comparison-feedback-pending:${accountId}`, draftId);
      const report = await repository.submit({ id: draftId, reporterId: accountId, title, description, category, tab: currentTab, projectName: projectName.slice(0, 120),
        context: { browser: navigator.userAgent.slice(0, 400), width: window.innerWidth, height: window.innerHeight, revisionA: revisionA.slice(0, 80), revisionB: revisionB.slice(0, 80) } },
      attachmentRef.current, () => assertCurrent(token), setMessage);
      assertCurrent(token); window.sessionStorage.removeItem(`comparison-feedback-pending:${accountId}`); ++loadEpoch.current; setLoading(false); setReports(current => [report, ...current.filter(item => item.id !== report.id)]); resetDraft(); setPanel("reports"); setSelectedId(report.id); toast.success("回報已送出，管理員可以查看你的問題與截圖。");
    } catch (caught) { if (isCurrent(token)) setError(caught instanceof Error ? caught.message : "回報送出失敗。"); }
    finally { if (isCurrent(token)) { busyRef.current = false; setBusy(false); setMessage(""); } }
  };
  const download = useCallback(async (path: string) => { const token = captureScope(); const blob = await repository.downloadImage(path); assertCurrent(token); return blob; }, [repository, captureScope, assertCurrent]);
  const review = async (report: FeedbackReport, status: FeedbackStatus, note: string) => {
    if (!isAdmin || busyRef.current) throw new Error("目前無法更新回報。");
    assertReviewInput(status, note); const token = captureScope(); busyRef.current = true; setBusy(true); setError("");
    try { const updated = await repository.reviewReport(report, accountId, status, note); assertCurrent(token); ++loadEpoch.current; setLoading(false); setReports(current => current.map(item => item.id === updated.id ? updated : item)); toast.success("處理結果已儲存"); return updated; }
    catch (caught) { if (isCurrent(token)) setError(caught instanceof Error ? caught.message : "處理結果未儲存。"); throw caught; }
    finally { if (isCurrent(token)) { busyRef.current = false; setBusy(false); } }
  };
  const exportReports = async (filtered: boolean) => {
    if (!isAdmin || busyRef.current) return;
    const token = captureScope(); const exportFilters = { ...filters }; busyRef.current = true; setBusy(true); setError(""); setMessage("正在讀取最新回報…");
    try {
      const latest = await repository.listReports(isAdmin); assertCurrent(token); ++loadEpoch.current; setLoading(false); setReports(latest);
      const snapshot = filtered ? filterFeedbackReports(latest, exportFilters) : latest;
      const { exportFeedbackZip } = await import("./export"); assertCurrent(token);
      const result = await exportFeedbackZip(snapshot, repository.downloadImage, () => assertCurrent(token), setMessage);
      assertCurrent(token); downloadLocal(result.bytes, result.name, "application/zip"); toast.success(`已匯出 ${result.reportCount} 份回報與 ${result.imageCount} 張截圖`);
    } catch (caught) { if (isCurrent(token)) setError(caught instanceof Error ? caught.message : "匯出失敗。"); }
    finally { if (isCurrent(token)) { busyRef.current = false; setBusy(false); setMessage(""); } }
  };
  const close = (next: boolean) => {
    if (next) { setOpen(true); return; }
    if (busyRef.current || addingRef.current || capturing) return;
    if ((title.trim() || description.trim() || attachments.length || reviewDirty.current) && !window.confirm("還有未送出的回報或未儲存的處理備註。要放棄並關閉嗎？")) return;
    setOpen(false); setPreview(null); resetDraft();
  };
  const hasFilters = Boolean(filters.query.trim() || filters.status !== "all" || filters.owner || filters.category !== "all");
  const changePanel = (value: string) => {
    if (busy || adding) return;
    if (reviewDirty.current && !window.confirm("處理備註尚未儲存。要放棄並切換嗎？")) return;
    setPanel(value);
  };
  const selectReport = (id: string) => {
    if (id === selectedId) return;
    if (reviewDirty.current && !window.confirm("處理備註尚未儲存。要放棄並切換回報嗎？")) return;
    reviewDirty.current = false; setPreview(null); setSelectedId(id);
  };
  return <>
    <Button variant="outline" disabled={!canSubmit || capturing} title={!canSubmit ? "需要安全登入才能送出回報" : "附上截圖與問題說明"} onClick={() => { setPanel(isAdmin ? "reports" : "new"); setError(""); setOpen(true); }}><MessageSquarePlus data-icon="inline-start" />意見收集</Button>
    <Dialog open={open && !capturing} onOpenChange={close}><DialogContent className="comparison-feedback-dialog" hideCloseButton={busy || adding} onInteractOutside={event => { if (busy || adding) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy || adding) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>AutoCheck 意見收集</DialogTitle><DialogDescription>附上截圖與問題說明，管理員可集中查看並匯出整理。</DialogDescription></DialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <Tabs className="feedback-tabs" value={panel} onValueChange={changePanel}><TabsList><TabsTrigger value="new" disabled={busy || adding}>新增回報</TabsTrigger><TabsTrigger value="reports" disabled={busy || adding}>{isAdmin ? "回報管理" : "我的回報"}</TabsTrigger></TabsList>
        <TabsContent value="new" className="feedback-tab-panel"><form className="feedback-form" onSubmit={event => void submit(event)} onPaste={paste}>
          <p className="feedback-context-line">目前頁面：{FEEDBACK_TABS[currentTab]}{projectName ? ` · ${projectName}` : ""}</p>
          <FieldGroup><Field><FieldLabel htmlFor="feedback-title">問題標題</FieldLabel><Input id="feedback-title" required value={title} maxLength={120} disabled={busy || adding} placeholder="例如：BOM 差異沒有顯示" onChange={event => setTitle(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="feedback-category">分類</FieldLabel><Select value={category} disabled={busy || adding} onValueChange={value => setCategory(value as FeedbackCategory)}><SelectTrigger id="feedback-category"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(FEEDBACK_CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="feedback-description">問題說明</FieldLabel><Textarea id="feedback-description" required value={description} maxLength={4000} rows={5} disabled={busy || adding} placeholder="發生什麼問題？如何重現？你預期看到什麼結果？" onChange={event => setDescription(event.target.value)} /><FieldDescription>會附上目前頁籤、比對名稱、瀏覽器與畫面尺寸，方便追查。</FieldDescription></Field>
            <Field><FieldLabel>截圖（選填）</FieldLabel><div className="feedback-attachment-actions"><Button type="button" variant="outline" disabled={busy || adding || attachments.length >= 5} onClick={() => void capture()}><Camera data-icon="inline-start" />擷取畫面</Button><Button type="button" variant="outline" disabled={busy || adding || attachments.length >= 5} onClick={() => chooser.current?.click()}><ImagePlus data-icon="inline-start" />選取圖片</Button><span>{attachments.length}／5 張</span></div><FieldDescription>也可在這個視窗貼上截圖（Ctrl＋V）。最多 5 張，每張 10 MB，支援 PNG、JPG、WebP。</FieldDescription>
              <input ref={chooser} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="選取回報截圖" disabled={busy || adding} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addImages(files); }} />
              <div className="feedback-image-grid">{attachments.map(attachment => <LocalImage key={attachment.id} attachment={attachment} disabled={busy || adding} remove={() => { const next = attachmentRef.current.filter(image => image.id !== attachment.id); attachmentRef.current = next; setAttachments(next); }} />)}</div>
            </Field></FieldGroup>
          <div className="feedback-form-footer"><Button type="button" variant="outline" disabled={busy || adding} onClick={() => close(false)}>取消</Button><Button type="submit" disabled={busy || adding || !title.trim() || !description.trim()}><Send data-icon="inline-start" />{busy ? "送出中…" : adding ? "正在加入截圖…" : "送出回報"}</Button></div>
        </form></TabsContent>
        <TabsContent value="reports" className="feedback-tab-panel">
          <div className="feedback-report-actions"><div><strong>{isAdmin ? "所有使用者的回報" : "我的送出紀錄"}</strong><p>{reports.length} 份回報 · 點選一列查看說明與截圖</p></div><div><Button variant="outline" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw data-icon="inline-start" />重新整理</Button>{isAdmin && <><Button disabled={busy || loading || !reports.length} onClick={() => void exportReports(false)}><Download data-icon="inline-start" />匯出全部 ZIP</Button>{hasFilters && <Button variant="outline" disabled={busy || loading || !visible.length} onClick={() => void exportReports(true)}>匯出目前篩選</Button>}</>}</div></div>
          <div className="feedback-filterbar"><Input aria-label="搜尋回報" placeholder="搜尋標題、說明或回報者" value={filters.query} onChange={event => setFilter("query", event.target.value)} /><Select value={filters.status} onValueChange={value => setFilter("status", value as typeof filters.status)}><SelectTrigger aria-label="回報狀態"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部狀態</SelectItem>{Object.entries(FEEDBACK_STATUSES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            {isAdmin && <Select value={filters.owner || "all"} onValueChange={value => setFilter("owner", value === "all" ? "" : value)}><SelectTrigger aria-label="回報者"><SelectValue placeholder="全部回報者" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部回報者</SelectItem>{owners.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectGroup></SelectContent></Select>}
            <Select value={filters.category} onValueChange={value => setFilter("category", value as typeof filters.category)}><SelectTrigger aria-label="回報分類"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">全部分類</SelectItem>{Object.entries(FEEDBACK_CATEGORIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </div>
          {hasFilters && <div className="feedback-filter-chips" aria-label="目前回報篩選條件">{filters.query.trim() && <Button variant="secondary" size="sm" aria-label="清除回報搜尋" onClick={() => setFilter("query", "")}>搜尋：{filters.query}<X /></Button>}{filters.status !== "all" && <Button variant="secondary" size="sm" aria-label="清除回報狀態" onClick={() => setFilter("status", "all")}>狀態：{FEEDBACK_STATUSES[filters.status]}<X /></Button>}{filters.owner && <Button variant="secondary" size="sm" aria-label="清除回報者" onClick={() => setFilter("owner", "")}>回報者：{owners.find(([id]) => id === filters.owner)?.[1] ?? "已移除的帳號"}<X /></Button>}{filters.category !== "all" && <Button variant="secondary" size="sm" aria-label="清除回報分類" onClick={() => setFilter("category", "all")}>分類：{FEEDBACK_CATEGORIES[filters.category]}<X /></Button>}<Button variant="ghost" size="sm" onClick={clear}>全部清除</Button></div>}
          <div className="feedback-table-wrap"><table className="feedback-table"><thead><tr><th>問題</th><th>狀態</th><th>分類</th><th>回報者</th><th>頁籤</th><th>截圖</th><th>回報時間</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} role="status">正在載入回報…</td></tr> : visible.length ? visible.map(report => <tr key={report.id} aria-selected={selectedId === report.id}><td><button type="button" onClick={() => selectReport(report.id)}><strong>{report.title}</strong><small>{report.projectName || report.id.slice(0, 8)}</small></button></td><td><Badge variant="secondary">{FEEDBACK_STATUSES[report.status]}</Badge></td><td>{FEEDBACK_CATEGORIES[report.category]}</td><td>{report.reporterName}</td><td>{FEEDBACK_TABS[report.tab]}</td><td>{report.screenshots.length} 張</td><td>{feedbackDate(report.submittedAt ?? report.createdAt)}</td></tr>) : <tr><td colSpan={7}>{hasFilters ? "目前篩選條件沒有符合的回報" : isAdmin ? "尚未收到回報" : "尚未送出回報"}</td></tr>}</tbody></table></div>
          {selected && <ReportDetails key={selected.id} report={selected} isAdmin={isAdmin} busy={busy} download={download} preview={setPreview} review={review} dirty={setReviewDirty} />}
        </TabsContent>
      </Tabs>
    </DialogContent></Dialog>
    <Dialog open={Boolean(preview)} onOpenChange={next => !next && setPreview(null)}><DialogContent className="feedback-preview-dialog"><DialogHeader><DialogTitle>{preview?.name ?? "回報截圖"}</DialogTitle><DialogDescription>回報者提供的截圖</DialogDescription></DialogHeader>{preview && <img src={preview.url} alt={preview.name} />}</DialogContent></Dialog>
  </>;
}
