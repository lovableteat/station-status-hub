import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, HelpCircle, ImagePlus, MessageSquare, Plus, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCircuitImageUrls, downloadCircuitImage } from "./files";
import { exportCircuitChangeList } from "./export";
import { CircuitChangeImageViewer } from "./CircuitChangeImageViewer";
import { CIRCUIT_CHANGE_STATUS_LABELS, CIRCUIT_IMAGE_SIDE_LABELS, type CircuitChangeContext, type CircuitChangeContent, type CircuitChangeItem, type CircuitChangeStatus, type CircuitChangesModel, type CircuitImage, type CircuitImageSide } from "./types";
import "./circuitChanges.css";

const sides = Object.keys(CIRCUIT_IMAGE_SIDE_LABELS) as CircuitImageSide[];
const statusKeys = Object.keys(CIRCUIT_CHANGE_STATUS_LABELS) as CircuitChangeStatus[];
const startSteps = [
  { title: "建立改版批次", text: "把同一次改版的修改放在一起，例如 V1 → V2。" },
  { title: "新增修改、貼上前後圖", text: "每一處修改獨立記錄，填標題、位置與原因，再加入圖片。" },
  { title: "送出 Review、匯出清單", text: "逐項確認或退回補充，最後匯出含圖片與歷史的 Change List。" },
];
const eventLabels: Record<string, string> = { created: "建立項目", edited: "更新內容", submitted: "送出 Review", approved: "確認", request_changes: "退回補充", changes_requested: "退回補充", comment: "留言", submit: "送出 Review", approve: "確認" };
const dateTime = (value: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const readFilters = () => {
  const query = new URLSearchParams(window.location.search);
  return { query: query.get("circuitQuery") || "", status: statusKeys.includes(query.get("circuitStatus") as CircuitChangeStatus) ? query.get("circuitStatus")! : "all", owner: query.get("circuitOwner") || "all" };
};

export function CircuitChangesDialog({ open, onOpenChange, context, canEdit, model }: {
  open: boolean; onOpenChange: (value: boolean) => void; context: CircuitChangeContext; canEdit: boolean; model: CircuitChangesModel;
}) {
  const [filters, setFilters] = useState(readFilters);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [fromLabel, setFromLabel] = useState(context.versionLabel);
  const [toLabel, setToLabel] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [side, setSide] = useState<CircuitImageSide>("after");
  const [reviewNote, setReviewNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CircuitChangeItem | null>(null);
  const [viewer, setViewer] = useState<CircuitImage | null>(null);
  const [urls, setUrls] = useState<Record<string, { original: string; thumbnail: string }>>({});
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const pickerSide = useRef<CircuitImageSide>("after");
  const detailScroll = useRef<HTMLDivElement>(null);
  const historySection = useRef<HTMLElement>(null);
  const selectedSet = model.sets.find(item => item.id === model.selectedSetId);
  const item = snapshot || model.selectedItem;
  const content = snapshot?.content || model.draft;
  const readOnly = !canEdit || Boolean(snapshot);
  const busy = working || model.saving || model.uploading;
  const canSubmit = item?.status === "draft" || item?.status === "needs_changes" || model.dirty;
  const latestActor = model.events.find(event => event.revision === item?.revision)?.actorName;
  const images = content?.images || [];
  const imageSources = images.map(image => `${image.id}:${image.path}:${image.thumbnailPath || ""}`).join("|");
  const owners = useMemo(() => [...new Set(model.items.map(row => row.content.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-TW")), [model.items]);
  const filtered = useMemo(() => {
    const needle = filters.query.trim().toLocaleLowerCase();
    return model.items.filter(row => (filters.status === "all" || row.status === filters.status)
      && (filters.owner === "all" || row.content.owner === filters.owner)
      && (!needle || [String(row.number), row.content.title, row.content.reason, row.content.description, row.content.refs, row.content.net, row.content.page, row.content.owner].join(" ").toLocaleLowerCase().includes(needle)));
  }, [model.items, filters]);
  const selectedIndex = filtered.findIndex(row => row.id === model.selectedItemId);
  const canPrevious = selectedIndex > 0;
  const canNext = selectedIndex >= 0 ? selectedIndex + 1 < filtered.length : filtered.length > 0;
  const activeChips = [
    ...(filters.query ? [{ key: "query" as const, label: `搜尋：${filters.query}`, reset: "" }] : []),
    ...(filters.status !== "all" ? [{ key: "status" as const, label: `狀態：${CIRCUIT_CHANGE_STATUS_LABELS[filters.status as CircuitChangeStatus]}`, reset: "all" }] : []),
    ...(filters.owner !== "all" ? [{ key: "owner" as const, label: `負責人：${filters.owner}`, reset: "all" }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    const url = new URL(window.location.href);
    for (const [key, value, empty] of [["circuitQuery", filters.query, ""], ["circuitStatus", filters.status, "all"], ["circuitOwner", filters.owner, "all"]]) {
      if (value === empty) url.searchParams.delete(key); else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", url);
  }, [filters, open]);
  useEffect(() => {
    const read = () => setFilters(readFilters());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const resize = () => { const height = visual?.height || window.innerHeight; if (height) setViewport({ height: Math.min(height, window.innerHeight || height), top: visual?.offsetTop || 0 }); };
    resize(); window.addEventListener("resize", resize); visual?.addEventListener("resize", resize); visual?.addEventListener("scroll", resize);
    return () => { window.removeEventListener("resize", resize); visual?.removeEventListener("resize", resize); visual?.removeEventListener("scroll", resize); };
  }, [open]);
  useEffect(() => {
    setSnapshot(null); setViewer(null); setReviewNote(""); setHistoryOpen(false); setNotice("");
  }, [model.selectedItemId, context.seriesId]);
  useEffect(() => { if (!open) { setMobileDetail(false); setNewSetOpen(false); setGuideOpen(false); setViewer(null); } }, [open]);
  useEffect(() => { if (historyOpen) historySection.current?.scrollIntoView({ block: "start" }); }, [historyOpen]);
  useEffect(() => { detailScroll.current?.scrollTo({ top: 0 }); }, [snapshot, model.selectedItemId]);
  useEffect(() => {
    let current = true;
    if (!images.length) { setUrls({}); return; }
    createCircuitImageUrls(images).then(value => { if (current) setUrls(value); }).catch(error => { if (current) setNotice(error instanceof Error ? error.message : "圖片載入失敗，請重試。"); });
    return () => { current = false; };
  }, [imageSources]);

  async function run(action: () => Promise<void>) {
    setNotice(""); setWorking(true);
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "操作失敗，請重試。"); }
    finally { setWorking(false); }
  }
  function close(value: boolean) {
    if (value) { onOpenChange(true); return; }
    void run(async () => {
      if (model.uploading) throw new Error("圖片仍在上傳，請等上傳完成後再關閉。");
      if (canEdit && (model.dirty || model.saving)) await model.saveDraft();
      onOpenChange(false);
    });
  }
  function selectItem(id: string) { void run(async () => { await model.selectItem(id); setMobileDetail(true); }); }
  function newItem() { void run(async () => { await model.createItem(); setMobileDetail(true); }); }
  function openNewSet() { setNewTitle(""); setFromLabel(context.versionLabel); setToLabel(""); setNewSetOpen(true); }
  function addFiles(files: File[], targetSide = side) {
    if (readOnly) { setNotice("目前為唯讀檢視，請返回目前修訂後加入圖片。"); return; }
    if (files.length) void run(async () => { await model.addImages(files, targetSide); setMobileDetail(true); });
  }
  function openPicker(targetSide: CircuitImageSide) { pickerSide.current = targetSide; setSide(targetSide); fileInput.current?.click(); }
  function paste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault(); addFiles(files);
  }
  function drop(event: DragEvent) { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }
  function update(patch: Partial<CircuitChangeContent>) { if (!readOnly) model.updateDraft(patch); }
  function updateImage(next: CircuitImage) {
    update({ images: images.map(image => image.id === next.id ? next : image) });
    setViewer(next);
  }
  function act(action: "submit" | "approve" | "request_changes" | "comment") {
    void run(async () => {
      if ((action === "request_changes" || action === "comment") && !reviewNote.trim()) throw new Error(action === "request_changes" ? "請先填寫退回原因，工程師才知道需要補充哪裡。" : "請填寫留言內容。");
      await model.review(action, reviewNote.trim()); setReviewNote("");
    });
  }
  const saveLabel = model.saving ? "儲存中…" : model.saveError ? "儲存失敗" : model.dirty ? "尚有未儲存修改" : "已儲存";
  const viewportStyle = viewport ? { "--circuit-viewport-height": `${viewport.height}px`, "--circuit-viewport-top": `${viewport.top}px` } as CSSProperties : undefined;
  const field = (key: Exclude<keyof CircuitChangeContent, "images">, label: string, multiline = false, placeholder = "") => <label className={`circuit-field circuit-field-${key}`} key={key}><span>{label}</span>{multiline
    ? <Textarea aria-label={label} value={content?.[key] || ""} disabled={readOnly} placeholder={placeholder} onChange={event => update({ [key]: event.target.value })} />
    : <Input aria-label={label} value={content?.[key] || ""} disabled={readOnly} placeholder={placeholder} onChange={event => update({ [key]: event.target.value })} />}</label>;
  const filePicker = <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="選取線路修改圖片" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; addFiles(files, pickerSide.current); }} />;

  return <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent hideCloseButton className="circuit-changes-dialog" style={viewportStyle} data-testid="circuit-changes-dialog" data-mobile-detail={mobileDetail} onPaste={paste} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={drop}>
        {filePicker}
        <header className="circuit-header"><div><DialogTitle>線路修改</DialogTitle><DialogDescription title={context.workspaceName}>{context.projectName && `${context.projectName} / `}{context.workspaceName}</DialogDescription></div><div className="circuit-header-actions"><Button type="button" variant="ghost" aria-label="使用說明" onClick={() => setGuideOpen(true)}><HelpCircle aria-hidden="true" /><span>使用說明</span></Button><Button type="button" variant="ghost" aria-label="關閉線路修改" onClick={() => close(false)}><X aria-hidden="true" /></Button></div></header>
        <div className="circuit-toolbar">
          <label className="circuit-set-picker"><span>改版批次</span><select aria-label="選擇改版批次" value={model.selectedSetId} disabled={busy || model.loading} onChange={event => void run(() => model.selectSet(event.target.value))}><option value="">{model.loading ? "載入中…" : "選擇改版批次"}</option>{model.sets.map(set => <option key={set.id} value={set.id}>{set.title} · {set.fromLabel} → {set.toLabel || "待指定"}</option>)}</select></label>
          {canEdit && <Button type="button" variant="outline" onClick={openNewSet} disabled={busy || model.loading}><Plus aria-hidden="true" />新增批次</Button>}
          <div className="circuit-toolbar-actions">{canEdit && <Button type="button" onClick={model.selectedSetId ? newItem : openNewSet} disabled={busy || model.loading}><Plus aria-hidden="true" />{model.selectedSetId ? "新增修改" : "開始新增修改"}</Button>}<Button type="button" variant="outline" disabled={!selectedSet || !filtered.length || busy || model.dirty} title={model.dirty ? "尚有未儲存修改，儲存後可匯出" : `匯出目前篩選的全部 ${filtered.length} 項修改`} onClick={() => void run(() => exportCircuitChangeList(selectedSet!, filtered))}><Download aria-hidden="true" /><span>匯出 Change List</span></Button></div>
        </div>
        <div className="circuit-filter-bar" role="group" aria-label="線路修改篩選"><label className="circuit-search"><Search aria-hidden="true" /><Input aria-label="搜尋線路修改" placeholder="搜尋編號、修改內容、Ref 或 Net" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} /></label><label><span className="sr-only">狀態</span><select aria-label="篩選修改狀態" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="all">全部狀態</option>{statusKeys.map(key => <option key={key} value={key}>{CIRCUIT_CHANGE_STATUS_LABELS[key]}</option>)}</select></label><label><span className="sr-only">負責人</span><select aria-label="篩選修改負責人" value={filters.owner} onChange={event => setFilters(current => ({ ...current, owner: event.target.value }))}><option value="all">全部負責人</option>{owners.map(owner => <option key={owner} value={owner}>{owner}</option>)}</select></label><span className="circuit-result-count">{filtered.length} / {model.items.length} 項</span></div>
        {activeChips.length > 0 && <div className="circuit-active-filters" data-testid="circuit-active-filters">{activeChips.map(chip => <button type="button" key={chip.key} aria-label={`移除篩選：${chip.label}`} onClick={() => setFilters(current => ({ ...current, [chip.key]: chip.reset }))}>{chip.label}<X aria-hidden="true" /></button>)}<Button type="button" variant="ghost" onClick={() => setFilters({ query: "", status: "all", owner: "all" })}>全部清除</Button></div>}
        {(notice || model.error || model.saveError) && <div className="circuit-message" role="alert"><span>{notice || model.saveError || model.error}</span><Button type="button" variant="ghost" onClick={() => void run(() => model.reload())}>重新載入</Button></div>}
        <div className="circuit-workspace">
          <aside className="circuit-item-list" aria-label="修改項目清單"><div className="circuit-list-heading"><span>編號／修改項目</span><span>狀態</span></div>{model.loading && !model.items.length ? <p className="circuit-empty">正在載入修改項目…</p> : filtered.length ? filtered.map(row => <button type="button" key={row.id} data-testid="circuit-change-item" className="circuit-item" aria-pressed={row.id === model.selectedItemId} disabled={busy} onClick={() => selectItem(row.id)}><span className="circuit-item-number">#{String(row.number).padStart(3, "0")}</span><span className="circuit-item-title"><strong>{row.content.title || "未命名修改"}</strong><small>{row.content.refs || row.content.net || row.content.owner || "尚未補充位置"}</small></span><span className="circuit-list-status" data-status={row.status}>{CIRCUIT_CHANGE_STATUS_LABELS[row.status]}</span></button>) : <div className="circuit-empty">{model.selectedSetId ? "目前篩選條件沒有符合的修改項目" : <><strong>先建立這次改版的批次</strong><span>一個批次收納同一次改版的修改。建立後，按「新增修改」記錄前後圖。</span>{canEdit && <Button type="button" className="circuit-empty-mobile-action" disabled={busy || model.loading} onClick={openNewSet}><Plus aria-hidden="true" />建立改版批次</Button>}</>}{canEdit && model.selectedSetId && !model.items.length && <><span>這個批次還沒有修改。新增一項後，就能填寫說明與貼圖。</span><Button type="button" disabled={busy} onClick={newItem}><Plus aria-hidden="true" />新增第一項修改</Button></>}</div>}</aside>
          <section className="circuit-detail" aria-label="線路修改內容" data-testid="circuit-change-detail">
            {content && item ? <>
              <header className="circuit-detail-heading"><Button type="button" variant="ghost" className="circuit-mobile-back" aria-label="返回修改清單" onClick={() => setMobileDetail(false)}><ArrowLeft aria-hidden="true" /></Button><div><strong>#{String(item.number).padStart(3, "0")}<span className="circuit-list-status" data-status={item.status}>{CIRCUIT_CHANGE_STATUS_LABELS[item.status]}</span></strong><span>修訂 {item.revision}{latestActor ? ` · ${latestActor}` : ""} · {dateTime(item.updatedAt)}</span></div><div className="circuit-item-navigation"><Button type="button" variant="ghost" aria-label="上一項修改" disabled={!canPrevious || busy} onClick={() => selectItem(filtered[selectedIndex - 1].id)}><ChevronLeft aria-hidden="true" /></Button><Button type="button" variant="ghost" aria-label="下一項修改" disabled={!canNext || busy} onClick={() => selectItem(filtered[selectedIndex < 0 ? 0 : selectedIndex + 1].id)}><ChevronRight aria-hidden="true" /></Button><Button type="button" variant={historyOpen ? "secondary" : "ghost"} aria-pressed={historyOpen} onClick={() => setHistoryOpen(value => !value)}>歷史 {model.events.length}</Button></div></header>
              <div ref={detailScroll} className="circuit-detail-scroll" data-dragging={dragging}>
                {snapshot && <div className="circuit-snapshot-banner" role="status"><span>正在查看修訂 {snapshot.revision}，此版本內容唯讀</span><Button type="button" variant="outline" onClick={() => { setSnapshot(null); setViewer(null); }}>返回目前修訂</Button></div>}
                {model.conflict && !snapshot && <div className="circuit-conflict" role="alert"><p>另一位使用者已更新這個項目。你的草稿仍保留，請選擇要採用的內容。</p><div><Button type="button" variant="outline" onClick={() => { setNotice(""); model.adoptRemote(); }}>採用最新版本</Button><Button type="button" disabled={busy || !canEdit} onClick={() => void run(() => model.saveMyRevision())}>儲存我的修訂</Button></div></div>}
                {!snapshot && item.status === "approved" && <p className="circuit-revision-note">更新已確認的內容會保留原紀錄，並建立需要重新 Review 的修訂。</p>}{!readOnly && <p className="circuit-entry-hint">先填修改標題，再選「修改前／修改後」加入圖片；準備好後按「送出 Review」。</p>}<div className="circuit-content-fields">{field("title", "修改標題", false, "例如：調整 R2301 阻值與接法")}<div className="circuit-location-fields">{field("refs", "Ref", false, "R2301、U2…")}{field("net", "Net", false, "電源或訊號名稱")}{field("page", "頁碼", false, "原理圖頁碼")}{field("owner", "負責人", false, "工程師名稱")}</div></div>
                <section className="circuit-image-section" aria-label="修改前後圖片"><header><h3>前後圖與修改位置</h3><span>{images.length} 張</span></header><div className="circuit-image-controls"><div role="group" aria-label="圖片用途">{sides.map(key => <button type="button" key={key} aria-pressed={side === key} onClick={() => setSide(key)}>{CIRCUIT_IMAGE_SIDE_LABELS[key]} <span>{images.filter(image => image.side === key).length}</span></button>)}</div>{!readOnly && <Button type="button" variant="outline" disabled={busy} onClick={() => openPicker(side)}><Upload aria-hidden="true" />加入圖片</Button>}</div><p className="circuit-upload-hint">{readOnly ? "點圖片放大檢視，或下載原檔。" : `可連續貼上、多選或拖入圖片，追加到「${CIRCUIT_IMAGE_SIDE_LABELS[side]}」；每項最多 200 張、每張上限 50 MB，不需先壓縮。`}</p>
                  {model.uploading && <p className="circuit-upload-progress" role="status">正在上傳 {model.uploadProgress.completed} / {model.uploadProgress.total} 張，已成功的圖片會保留</p>}
                  {model.uploadWarnings.length > 0 && <div className="circuit-upload-warning" role="status">{model.uploadWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
                  {model.uploadFailures.length > 0 && <div className="circuit-upload-failures" role="alert"><p>以下圖片尚未成功，已成功項目保留：</p><ul>{model.uploadFailures.map((failure, index) => <li key={index}>{failure.file.name}：{failure.error}</li>)}</ul><Button type="button" variant="outline" disabled={busy || readOnly} onClick={() => void run(() => model.retryUploads())}>重試失敗圖片</Button></div>}
                  <div className="circuit-image-columns" data-mobile-side={side}>{sides.map(key => <section key={key} className="circuit-image-column" data-side={key}><header><h4>{CIRCUIT_IMAGE_SIDE_LABELS[key]}</h4>{!readOnly && <Button type="button" variant="ghost" aria-label={`加入${CIRCUIT_IMAGE_SIDE_LABELS[key]}圖片`} disabled={busy} onClick={() => openPicker(key)}><Plus aria-hidden="true" /></Button>}</header><div className="circuit-image-grid">{images.filter(image => image.side === key).map(image => <figure key={image.id}><button type="button" className="circuit-image-preview" aria-label={`放大圖片 ${image.name}`} onClick={() => setViewer(image)}>{urls[image.id] ? <img src={urls[image.id].thumbnail} alt={image.caption || image.name} loading="lazy" /> : <span>載入圖片…</span>}{image.marks.length > 0 && <span className="circuit-mark-count">{image.marks.length} 個標記</span>}</button><figcaption title={image.caption || image.name}>{image.caption || image.name}</figcaption><div className="circuit-image-actions"><Button type="button" variant="ghost" aria-label={`下載原圖 ${image.name}`} onClick={() => void run(() => downloadCircuitImage(image))}><Download aria-hidden="true" /></Button>{!readOnly && <Button type="button" variant="ghost" aria-label={`移除圖片 ${image.name}`} disabled={busy} onClick={() => update({ images: images.filter(value => value.id !== image.id) })}><X aria-hidden="true" /></Button>}</div></figure>)}</div>{!images.some(image => image.side === key) && <button type="button" className="circuit-image-empty" disabled={readOnly || busy} onClick={() => openPicker(key)}><ImagePlus aria-hidden="true" /><span>{readOnly ? "未提供圖片" : "加入圖片或直接貼上"}</span></button>}</section>)}</div>
                </section>
                <div className="circuit-description-fields">{field("reason", "修改原因", true, "為什麼需要這次修改？")}{field("description", "修改說明", true, "實際改了什麼，或直接貼上修改前後圖。")}</div>{!snapshot && <section className="circuit-review-note"><label><span>Review 意見／留言</span><Textarea aria-label="Review 意見或退回原因" value={reviewNote} disabled={!canEdit} placeholder="退回時請說明需要補充的內容；一般討論可直接留言。" onChange={event => setReviewNote(event.target.value)} /></label><Button type="button" variant="outline" disabled={busy || !canEdit || !reviewNote.trim()} onClick={() => act("comment")}><MessageSquare aria-hidden="true" />新增留言</Button></section>}
                {historyOpen && <section ref={historySection} className="circuit-history" aria-label="修改與 Review 歷史"><h3>修改與 Review 歷史</h3>{model.events.length ? [...model.events].sort((a, b) => b.revision - a.revision).map(event => <article key={event.id}><div><strong>修訂 {event.revision} · {eventLabels[event.type] || event.type}</strong><span>{event.actorName} · {dateTime(event.createdAt)}</span></div>{event.note && <p>{event.note}</p>}<Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { const full = await model.loadEvent(event.id); if (!full.snapshot) throw new Error("此修訂內容尚未載入，請重試。"); setSnapshot(full.snapshot); setViewer(null); })}>查看此修訂</Button></article>) : <p>尚無歷史紀錄</p>}</section>}
              </div>
              <footer className="circuit-detail-footer"><span role="status">{snapshot ? `修訂 ${snapshot.revision} 唯讀` : saveLabel}</span>{!snapshot && canEdit && <div><Button type="button" variant="outline" disabled={busy || !model.dirty} onClick={() => void run(() => model.saveDraft())}>儲存修改</Button>{item.status === "in_review" && !model.dirty ? <><Button type="button" variant="outline" disabled={busy} onClick={() => act("request_changes")}>退回補充</Button><Button type="button" disabled={busy} onClick={() => act("approve")}><Check aria-hidden="true" />確認</Button></> : canSubmit && <Button type="button" disabled={busy || model.conflict} onClick={() => act("submit")}>送出 Review</Button>}</div>}</footer>
            </> : <div className="circuit-detail-empty"><h3>{model.selectedSetId ? "新增第一項修改，記錄這次改動" : "第一次記錄線路修改？從這裡開始"}</h3><p>{model.selectedSetId ? "每一處改動建立一項，前後圖、說明與 Review 紀錄都放在一起。" : "不必先整理 Excel。先建立改版批次，再逐項貼圖、說明與送審。"}</p><ol className="circuit-start-steps">{startSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol>{canEdit && <Button type="button" disabled={busy || model.loading} onClick={model.selectedSetId ? newItem : openNewSet}><Plus aria-hidden="true" />{model.selectedSetId ? "新增修改項目" : "建立改版批次"}</Button>}</div>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={newSetOpen} onOpenChange={setNewSetOpen}><DialogContent className="circuit-new-set-dialog" style={viewportStyle}><DialogTitle>新增改版批次</DialogTitle><DialogDescription>一個批次收納同一次改版的所有修改，例如「E1.S 電源調整 · V1 → V2」。建立後按「新增修改」，逐項貼圖與送審。</DialogDescription><label>批次名稱<Input aria-label="改版批次名稱" autoComplete="off" value={newTitle} maxLength={160} placeholder="例如：E1.S 第二次線路調整" onChange={event => setNewTitle(event.target.value)} /></label><div className="circuit-new-set-versions"><label>修改前版次<Input aria-label="修改前版次" value={fromLabel} maxLength={80} onChange={event => setFromLabel(event.target.value)} /></label><label>修改後版次<Input aria-label="修改後版次" value={toLabel} maxLength={80} placeholder="例如：V2 / Rev B" onChange={event => setToLabel(event.target.value)} /></label></div><p className="circuit-new-set-hint">版次用來說明這次修改，不會變更原始 BOM。修改後版次可稍後再決定。</p><div className="circuit-new-set-actions"><Button type="button" variant="outline" onClick={() => setNewSetOpen(false)} disabled={working}>取消</Button><Button type="button" disabled={working || !newTitle.trim()} onClick={() => void run(async () => { await model.createSet(newTitle.trim(), fromLabel.trim(), toLabel.trim()); setNewSetOpen(false); })}>建立批次</Button></div>{notice && <p role="alert">{notice}</p>}</DialogContent></Dialog>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}><DialogContent hideCloseButton className="circuit-guide-dialog" style={viewportStyle} data-testid="circuit-usage-guide"><header className="circuit-header"><div><DialogTitle>線路修改怎麼用</DialogTitle><DialogDescription>建立批次 → 記錄修改與貼圖 → 逐項 Review → 匯出</DialogDescription></div><Button type="button" variant="ghost" aria-label="關閉使用說明" onClick={() => setGuideOpen(false)}><X aria-hidden="true" /></Button></header><div className="circuit-guide-scroll"><ol className="circuit-start-steps">{startSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol><section><h3>1. 怎麼新增？</h3><p>按「開始新增修改」或「新增批次」，輸入批次名稱及前後版次。建立後，按「新增修改」；每一處修改各建一項，填入標題、Ref／Net、頁碼、負責人及修改原因。</p></section><section><h3>2. 怎麼大量貼圖、標記？</h3><p>先選「修改前」、「修改後」或「補充圖」，再連續貼上、多選上傳或拖入圖片。每次加入都會追加；每項最多 200 張、每張 50 MB，不需壓縮。點圖片放大，使用「位置標記」或「框選」標出改動，並填寫說明。</p></section><section><h3>3. 怎麼儲存與交給老闆 Review？</h3><p>停打後會自動儲存，也可按「儲存修改」；請確認下方顯示「已儲存」。準備好後按「送出 Review」。有料號申請編輯權限的人可逐項「確認」或填寫意見後「退回補充」；補完後再送出。按「歷史」可查看操作者、時間、意見及舊修訂。</p></section><section><h3>4. 怎麼產生 Change List？</h3><p>選好批次，按「匯出 Change List」下載 Excel，包含目前篩選的修改項目、標註圖片及 Review 歷史。要匯出整批，先將搜尋、狀態與負責人篩選全部清除。</p></section></div><footer className="circuit-guide-footer"><Button type="button" onClick={() => setGuideOpen(false)}>知道了</Button></footer></DialogContent></Dialog>
    <Dialog open={Boolean(viewer)} onOpenChange={value => { if (!value) setViewer(null); }}><DialogContent hideCloseButton className="circuit-image-viewer-dialog" style={viewportStyle}><div className="circuit-image-dialog-heading"><DialogTitle title={viewer?.name}>{viewer?.name || "線路圖片"}</DialogTitle><Button type="button" variant="ghost" aria-label="關閉圖片" onClick={() => setViewer(null)}><X aria-hidden="true" /></Button></div><DialogDescription>{readOnly ? "原圖與此修訂的標記" : "放大查看、框選或加入位置說明，原圖會保留。"}</DialogDescription>{viewer && urls[viewer.id] && <CircuitChangeImageViewer image={viewer} src={urls[viewer.id].original} onChange={readOnly ? undefined : updateImage} readOnly={readOnly} />}</DialogContent></Dialog>
  </>;
}
