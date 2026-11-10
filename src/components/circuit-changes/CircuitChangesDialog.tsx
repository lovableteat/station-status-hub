import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type FormEvent } from "react";
import { ArchiveRestore, ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, Filter, HelpCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CIRCUIT_IMAGE_URL_REUSE_MS, circuitImageOrigins, createCircuitImageUrls, downloadCircuitImage } from "./files";
import { parseCircuitPageNumbers } from "./circuitPdf";
import { CircuitPdfPanel, type CircuitPdfCapture, type CircuitPdfCrop } from "./CircuitPdfPanel";
import type { CircuitPdfModel } from "./useCircuitPdfs";
import type { CircuitPdfInkModel } from "./useCircuitPdfInk";
import { exportCircuitChangeList } from "./export";
import { CircuitChangeImages, type CircuitImageUrls } from "./CircuitChangeImages";
import { CircuitChangeImageViewer } from "./CircuitChangeImageViewer";
import { CIRCUIT_EVENT_LABELS, circuitSetLabel, groupCircuitChangeEvents, latestCircuitReturn } from "./presentation";
import { CIRCUIT_CHANGE_FIELD_LIMITS, CIRCUIT_CHANGE_STATUS_LABELS, CIRCUIT_IMAGE_SIDE_LABELS, circuitChangeMissingForReview, defaultCircuitChangeSet, isUnsavedCircuitChange, type CircuitChangeContext, type CircuitChangeContent, type CircuitChangeItem, type CircuitChangeStatus, type CircuitChangeTextField, type CircuitChangesModel, type CircuitImage, type CircuitImageSide } from "./types";
import "./circuitChanges.css";

const sides = Object.keys(CIRCUIT_IMAGE_SIDE_LABELS) as CircuitImageSide[];
const statusKeys = Object.keys(CIRCUIT_CHANGE_STATUS_LABELS) as CircuitChangeStatus[];
const FILTER_KEYS = [["circuitQuery", "query", ""], ["circuitStatus", "status", "all"], ["circuitOwner", "owner", "all"]] as const;
const guideSteps = [
  { title: "上傳 PDF、逐頁看", text: "在「PDF 圖面」上傳原理圖 PDF，每次上傳記為一個日期版本。看到修改就在頁面上框選，直接加到修改前或修改後；也可以只寫文字。按「看完，下一頁」記下進度，明天上傳新的 PDF 會接續同一頁。" },
  { title: "直接記錄", text: "右邊就是可以填的表單：寫標題與位置，也可以貼上其他截圖。輸入後自動儲存。" },
  { title: "標出改了哪裡", text: "點圖片放大，用「位置標記」或「框選」標出改動，並寫上說明。" },
  { title: "送出 Review、匯出清單", text: "逐項確認或退回補充，最後匯出含圖片與歷史的 Change List。" },
];
const dateTime = (value: string) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const number = (value: number) => `#${String(value).padStart(3, "0")}`;
const readFilters = () => {
  const query = new URLSearchParams(window.location.search);
  return { query: query.get("circuitQuery") || "", status: statusKeys.includes(query.get("circuitStatus") as CircuitChangeStatus) ? query.get("circuitStatus")! : "all", owner: query.get("circuitOwner") || "all" };
};
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
// Side by side panes exist from 1024px. Below that one pane shows at a time and the selected side is also the visible tab.
const sideBySide = () => window.matchMedia?.("(min-width: 1024px)").matches ?? true;
const isPdfFile = (file: File) => /\.pdf$/i.test(file.name) || /pdf/i.test(file.type);
// The PDF beside the form is the default on a wide screen; the choice is kept per browser.
const LAYOUT_KEY = "circuit-changes-layout:v1";
function readLayout(): { pdf: boolean; detail: boolean; list: "auto" | "open" | "collapsed" } {
  try { const value = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || "{}"); return { pdf: value.pdf !== false, detail: value.detail !== false, list: value.list === "open" || value.list === "collapsed" ? value.list : "auto" }; }
  catch { return { pdf: true, detail: true, list: "auto" }; }
}
function writeLayout(value: ReturnType<typeof readLayout>) { try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(value)); } catch { /* layout only */ } }

export function CircuitChangesDialog({ open, onOpenChange, context, canEdit, model, pdfs, pdfInk, onAiReview }: {
  open: boolean; onOpenChange: (value: boolean) => void; context: CircuitChangeContext; canEdit: boolean; model: CircuitChangesModel; pdfs: CircuitPdfModel; pdfInk?: CircuitPdfInkModel; onAiReview?: () => void;
}) {
  const naming = useMemo(() => defaultCircuitChangeSet(context.versionLabel), [context.versionLabel]);
  const [filters, setFilters] = useState(readFilters);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CircuitChangeItem | null>(null);
  const [removedOpen, setRemovedOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(naming.title);
  const [fromLabel, setFromLabel] = useState(naming.fromLabel);
  const [toLabel, setToLabel] = useState(naming.toLabel);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [side, setSide] = useState<CircuitImageSide>("before");
  const [dragSide, setDragSide] = useState<CircuitImageSide | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<CircuitChangeItem | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [removed, setRemoved] = useState<{ image: CircuitImage; index: number; itemId: string } | null>(null);
  const [unlockedId, setUnlockedId] = useState("");
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [urls, setUrls] = useState<CircuitImageUrls>({});
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  const [layout, setLayout] = useState(readLayout);
  const [wide, setWide] = useState(sideBySide);
  const [roomy, setRoomy] = useState(() => window.matchMedia?.("(min-width: 1600px)").matches ?? true);
  // On a phone the PDF is a pane of its own, opened from the header; on a wide screen it sits between the list and the form.
  const [mobilePdf, setMobilePdf] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const versionsOpener = useRef<HTMLButtonElement | null>(null);
  const pdfOpen = wide ? layout.pdf : mobilePdf;
  const listCollapsed = wide && pdfOpen && (layout.list === "collapsed" || (layout.list === "auto" && !roomy));
  const detailCollapsed = wide && pdfOpen && !layout.detail;
  const fileInput = useRef<HTMLInputElement>(null);
  const pickerSide = useRef<CircuitImageSide>("before");
  const detailScroll = useRef<HTMLDivElement>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const detailScrollTop = useRef(0);
  const historySection = useRef<HTMLElement>(null);
  const openedDetail = useRef(false);
  const officialPdf = pdfs.official;
  const activePdf = pdfs.active;
  const selectedSet = model.sets.find(set => set.id === model.selectedSetId);
  const item = snapshot || model.selectedItem;
  const content = snapshot?.content || model.draft;
  const unsaved = !snapshot && isUnsavedCircuitChange(model.selectedItem);
  const remotelyRemoved = !snapshot && Boolean(model.selectedItem?.removedAt);
  // A change that waits for review or is approved cannot be edited by accident: any content change withdraws that state,
  // and with auto-save a stray keystroke from the reviewer would do it. Editing takes one deliberate click.
  const locked = canEdit && !snapshot && !model.dirty && (item?.status === "in_review" || item?.status === "approved") && unlockedId !== item.id;
  const readOnly = !canEdit || Boolean(snapshot) || locked || remotelyRemoved;
  const busy = working || model.saving || model.uploading || model.switching;
  const missing = circuitChangeMissingForReview(content);
  const reviewing = !snapshot && !remotelyRemoved && canEdit && item?.status === "in_review" && !model.dirty;
  const canSubmit = !reviewing && !remotelyRemoved && (unsaved || item?.status === "draft" || item?.status === "needs_changes" || model.dirty);
  const latestActor = model.events.find(event => event.revision === item?.revision)?.actorName;
  const returned = !snapshot && item?.status === "needs_changes" ? latestCircuitReturn(model.events, item.revision) : null;
  const history = useMemo(() => groupCircuitChangeEvents(model.events), [model.events]);
  const images = useMemo(() => content?.images || [], [content]);
  const latestImages = useRef(images); latestImages.current = images;
  const imageSources = images.map(image => `${image.id}:${image.path}:${image.thumbnailPath || ""}`).join("|");
  const viewerOrder = useMemo(() => sides.flatMap(key => images.filter(image => image.side === key)), [images]);
  const viewerIndex = viewerOrder.findIndex(image => image.id === viewerId);
  const viewer = viewerIndex < 0 ? null : viewerOrder[viewerIndex];
  const owners = useMemo(() => [...new Set(model.items.map(row => row.content.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-TW")), [model.items]);
  const statusCounts = useMemo(() => Object.fromEntries(statusKeys.map(key => [key, model.items.filter(row => row.status === key).length])) as Record<CircuitChangeStatus, number>, [model.items]);
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
    for (const [key, field, empty] of FILTER_KEYS) {
      if (filters[field] === empty) url.searchParams.delete(key); else url.searchParams.set(key, filters[field]);
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
    const query = window.matchMedia?.("(min-width: 1024px)"), large = window.matchMedia?.("(min-width: 1600px)");
    const read = () => { setWide(query?.matches ?? true); setRoomy(large?.matches ?? true); };
    read(); query?.addEventListener("change", read); large?.addEventListener("change", read);
    return () => { query?.removeEventListener("change", read); large?.removeEventListener("change", read); };
  }, [open]);
  useEffect(() => { setVersionsOpen(false); }, [open, context.seriesId]);
  useEffect(() => {
    if (!open) return;
    const visual = window.visualViewport;
    const resize = () => { const height = visual?.height || window.innerHeight; if (height) setViewport({ height: Math.min(height, window.innerHeight || height), top: visual?.offsetTop || 0 }); };
    resize(); window.addEventListener("resize", resize); visual?.addEventListener("resize", resize); visual?.addEventListener("scroll", resize);
    return () => { window.removeEventListener("resize", resize); visual?.removeEventListener("resize", resize); visual?.removeEventListener("scroll", resize); };
  }, [open]);
  // A file dropped beside the dialog would otherwise make the browser open it and leave the page, losing what is on screen.
  useEffect(() => {
    if (!open) return;
    const guard = (event: Event) => { if (Array.from((event as unknown as DragEvent).dataTransfer?.types ?? []).includes("Files")) event.preventDefault(); };
    window.addEventListener("dragover", guard); window.addEventListener("drop", guard);
    return () => { window.removeEventListener("dragover", guard); window.removeEventListener("drop", guard); };
  }, [open]);
  useEffect(() => {
    setSnapshot(null); setViewerId(""); setReviewNote(""); setHistoryOpen(false); setExpandedGroups([]); setNotice(""); setRemoved(null); setUnlockedId("");
  }, [model.selectedItemId, context.seriesId]);
  // Unlocking covers one review state only: once the change is sent or approved again it is locked again.
  useEffect(() => { setUnlockedId(""); }, [model.selectedItem?.status]);
  // Screenshots usually arrive as "before" first; once a change has its before picture, the next paste belongs to "after".
  // On a phone the side is the tab on screen, and reading a change starts with its before picture.
  const hasBefore = useRef(false); hasBefore.current = Boolean(model.selectedItem?.content.images.some(image => image.side === "before"));
  useEffect(() => { setSide(sideBySide() && hasBefore.current ? "after" : "before"); }, [model.selectedItem?.id]);
  useEffect(() => { if (!open) { setMobileDetail(false); setMobilePdf(false); setNewSetOpen(false); setRemovedOpen(false); setRemoveTarget(null); setGuideOpen(false); setViewerId(""); openedDetail.current = false; } }, [open]);
  // On a phone the list comes first, but with nothing recorded yet the list is empty and the form is what the user needs.
  useEffect(() => {
    if (!open || openedDetail.current || model.loading || !model.selectedItem) return;
    openedDetail.current = true;
    if (isUnsavedCircuitChange(model.selectedItem) && !model.items.length) setMobileDetail(true);
  }, [open, model.loading, model.selectedItem, model.items.length]);
  useEffect(() => { if (historyOpen) historySection.current?.scrollIntoView({ block: "start" }); }, [historyOpen]);
  useEffect(() => { detailScroll.current?.scrollTo({ top: 0 }); }, [snapshot, model.selectedItemId]);
  useEffect(() => {
    let current = true;
    if (!imageSources) { setUrls({}); return; }
    const sign = () => createCircuitImageUrls(latestImages.current).then(value => { if (current) setUrls(value); }).catch(error => { if (current) setNotice(error instanceof Error ? error.message : "圖片載入失敗，請重試。"); });
    void sign();
    // Signed links expire after an hour; renew them while the dialog stays open so enlarging a picture keeps working.
    const renew = setInterval(sign, CIRCUIT_IMAGE_URL_REUSE_MS - 5 * 60 * 1000);
    return () => { current = false; clearInterval(renew); };
  }, [imageSources]);

  async function run(action: () => Promise<void>) {
    setNotice(""); setCloseBlocked(false); setWorking(true);
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "操作失敗，請重試。"); }
    finally { setWorking(false); }
  }
  function close(value: boolean) {
    if (value) { onOpenChange(true); return; }
    void run(async () => {
      if (model.uploading) throw new Error("圖片仍在上傳，請等上傳完成後再關閉。");
      // Closing saves first. When that fails the draft stays, and the user is offered a way out instead of being held here.
      if (canEdit && (model.dirty || model.saving)) { try { await model.saveDraft(); } catch (error) { setCloseBlocked(true); throw error; } }
      leave();
    });
  }
  function leave() {
    // The filters belong to this dialog; left in the address bar they would silently narrow the next board's list.
    const url = new URL(window.location.href);
    for (const [key] of FILTER_KEYS) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    onOpenChange(false);
  }
  function selectItem(id: string) { void run(async () => { await model.selectItem(id); changeLayout({ detail: true }); setMobileDetail(true); }); }
  function newItem() {
    void run(async () => {
      await model.createItem();
      // A new change is a draft; a status or search filter would hide the row it gets once it is saved.
      setFilters({ query: "", status: "all", owner: "all" }); changeLayout({ detail: true }); setMobileDetail(true);
      if (sideBySide()) requestAnimationFrame(() => detailScroll.current?.querySelector<HTMLInputElement>(".circuit-field-title input")?.focus());
    });
  }
  function openNewSet() { setNewTitle(naming.title); setFromLabel(naming.fromLabel); setToLabel(naming.toLabel); setNotice(""); setNewSetOpen(true); }
  function submitNewSet(event: FormEvent) {
    event.preventDefault();
    if (working || !newTitle.trim()) return;
    void run(async () => { await model.createSet(newTitle.trim(), fromLabel.trim(), toLabel.trim()); setNewSetOpen(false); });
  }
  function changeLayout(patch: Partial<ReturnType<typeof readLayout>>) { setLayout(current => { const next = { ...current, ...patch }; writeLayout(next); return next; }); }
  function toggleDetail() {
    if (!detailCollapsed) detailScrollTop.current = detailScroll.current?.scrollTop || 0;
    changeLayout({ detail: detailCollapsed });
    requestAnimationFrame(() => {
      if (detailCollapsed) detailScroll.current?.scrollTo({ top: detailScrollTop.current });
      detailPanel.current?.parentElement?.querySelector<HTMLButtonElement>(detailCollapsed ? '.circuit-detail [aria-label="收合修改內容"]' : '.circuit-detail-rail button')?.focus({ preventScroll: true });
    });
  }
  function togglePdf() { setVersionsOpen(false); if (wide) changeLayout({ pdf: !layout.pdf }); else setMobilePdf(value => !value); }
  function openVersions() { if (wide) changeLayout({ pdf: true }); else setMobilePdf(true); setVersionsOpen(true); }
  function uploadPdfs(files: File[]) {
    if (!canEdit) { setNotice("目前為檢視權限，無法上傳 PDF。"); return; }
    if (wide) changeLayout({ pdf: true }); else setMobilePdf(true);
    void (async () => { for (const file of files) await pdfs.upload(file).catch(() => {}); })();
  }
  const captureBlocked = remotelyRemoved ? "這項修改已被移除，先還原後才能加入截圖。" : snapshot ? "正在查看舊修訂，返回目前修訂後才能加入截圖。" : !canEdit ? "目前為檢視權限，無法加入截圖。"
    : locked ? "這項的內容已鎖定，先按「修改內容」再加入截圖。" : model.switching ? "正在載入修改項目…" : "";
  async function addCaptures(captures: CircuitPdfCapture[]) {
    if (captureBlocked) throw new Error(captureBlocked);
    if (!captures.length) return;
    for (const capture of captures) circuitImageOrigins.set(capture.file, { source: capture.source, caption: capture.caption });
    // A change framed from a PDF page gets that page in its 頁碼 field, unless something is written there already.
    const pageNumber = captures.find(capture => capture.side === "after")?.page ?? captures[0].page;
    if (content && !content.page.trim()) update({ page: String(pageNumber) });
    setNotice(""); setWorking(true);
    try {
      for (const target of ["before", "after", "reference"] as const) {
        const files = captures.filter(capture => capture.side === target).map(capture => capture.file);
        if (files.length) await model.addImages(files, target);
      }
      // Show where the pictures went; the PDF stays where it was. On a phone, going back from the PDF shows this change.
      changeLayout({ detail: true }); setMobileDetail(true);
      detailScroll.current?.querySelector(".circuit-image-section")?.scrollIntoView({ block: "start", behavior: "smooth" });
    } finally { setWorking(false); }
  }
  function showSource(image: CircuitImage) {
    if (!image.source) return;
    if (!pdfs.show(image.source.documentId, image.source.page)) { setNotice(`這張圖來自的 PDF（${image.source.date}「${image.source.name}」）已從清單移除。`); return; }
    if (wide) changeLayout({ pdf: true }); else setMobilePdf(true);
    setViewerId("");
  }
  function addFiles(files: File[], targetSide = side) {
    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length) { uploadPdfs(pdfFiles); files = files.filter(file => !isPdfFile(file)); if (!files.length) return; }
    if (locked) { setNotice("這項的內容已鎖定，先按「修改內容」再加入圖片。"); return; }
    if (readOnly) { setNotice("目前為唯讀檢視，請返回目前修訂後加入圖片。"); return; }
    if (!files.length) return;
    setSide(targetSide);
    const count = (target: CircuitImageSide) => latestImages.current.filter(image => image.side === target).length;
    const before = count("before");
    void run(async () => {
      await model.addImages(files, targetSide); changeLayout({ detail: true }); setMobileDetail(true);
      // Screenshots usually come as one "before" then one "after": once the before picture is in, the next paste belongs to after.
      if (targetSide === "before" && count("before") > before && !count("after") && sideBySide()) setSide("after");
    });
  }
  function openPicker(targetSide: CircuitImageSide) { pickerSide.current = targetSide; setSide(targetSide); fileInput.current?.click(); }
  function paste(event: ClipboardEvent) {
    const pastedPdfs = Array.from(event.clipboardData.files).filter(isPdfFile);
    if (pastedPdfs.length) { event.preventDefault(); uploadPdfs(pastedPdfs); return; }
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
    if (!files.length) return;
    // Excel and Word put a picture of the copied cells next to their text. In a text field the text is what was meant.
    const field = (event.target as HTMLElement | null)?.closest?.("input,textarea");
    if (field && typeof event.clipboardData.getData === "function" && event.clipboardData.getData("text/plain").trim()) return;
    event.preventDefault(); addFiles(files);
  }
  function drop(event: DragEvent) { if (!carriesFiles(event)) return; event.preventDefault(); setDragSide(null); addFiles(Array.from(event.dataTransfer.files)); }
  function update(patch: Partial<CircuitChangeContent>) { if (!readOnly) model.updateDraft(patch); }
  function updateImage(next: CircuitImage) { update({ images: images.map(image => image.id === next.id ? next : image) }); }
  function removeImage(image: CircuitImage) {
    if (!item) return;
    setRemoved({ image, index: images.findIndex(value => value.id === image.id), itemId: item.id });
    update({ images: images.filter(value => value.id !== image.id) });
  }
  function restoreImage() {
    if (!removed || removed.itemId !== item?.id || images.some(image => image.id === removed.image.id)) { setRemoved(null); return; }
    const next = [...images]; next.splice(Math.min(removed.index, next.length), 0, removed.image);
    update({ images: next }); setRemoved(null);
  }
  function act(action: "submit" | "approve" | "request_changes" | "comment") {
    void run(async () => {
      if ((action === "request_changes" || action === "comment") && !reviewNote.trim()) throw new Error(action === "request_changes" ? "請先填寫退回原因，工程師才知道需要補充哪裡。" : "請填寫留言內容。");
      if (action === "submit" && missing.length) throw new Error(`送出前還缺：${missing.join("、")}。`);
      await model.review(action, reviewNote.trim()); setReviewNote("");
    });
  }
  const pdfCrops = useMemo<CircuitPdfCrop[]>(() => images.flatMap(image => image.source ? [{ id: image.id, side: image.side, documentId: image.source.documentId, page: image.source.page, rect: image.source.rect }] : []), [images]);
  const pageChanges = useMemo(() => {
    const pages = new Map<number, Array<{ id: string; number: number }>>();
    const add = (page: number, id: string, value: number) => { const list = pages.get(page) || []; if (!list.some(entry => entry.id === id)) pages.set(page, [...list, { id, number: value }]); };
    for (const row of model.items) {
      const text = row.id === model.selectedItemId && model.draft ? model.draft.page : row.content.page;
      for (const page of parseCircuitPageNumbers(text)) add(page, row.id, row.number);
    }
    for (const image of images) if (image.source && model.selectedItem && !unsaved) add(image.source.page, model.selectedItem.id, model.selectedItem.number);
    return pages;
  }, [model.items, model.selectedItemId, model.draft, model.selectedItem, images, unsaved]);
  const targetLabel = unsaved || !item ? "這項新修改" : `${number(item.number)}${content?.title ? ` ${content.title.slice(0, 24)}` : ""}`;
  const saveLabel = model.saving ? "儲存中…" : model.saveError ? (model.dirty ? "儲存失敗" : "操作未完成") : model.dirty ? "尚有未儲存修改" : unsaved ? "輸入後自動儲存" : "已儲存";
  const nextStep = snapshot ? "" : !canEdit ? "檢視權限：可查看與匯出" : reviewing ? "確認內容無誤就按「確認」；需要補充時先寫意見再退回。"
    : item?.status === "approved" && !model.dirty ? "這項已確認。" : missing.length ? `還缺：${missing.join("、")}` : "內容齊全，可以送出 Review";
  const viewportStyle = viewport ? { "--circuit-viewport-height": `${viewport.height}px`, "--circuit-viewport-top": `${viewport.top}px` } as CSSProperties : undefined;
  const field = (key: CircuitChangeTextField, label: string, multiline = false, placeholder = "") => <label className={`circuit-field circuit-field-${key}`} key={key}><span>{label}</span>{multiline
    ? <Textarea aria-label={label} value={content?.[key] || ""} disabled={readOnly} maxLength={CIRCUIT_CHANGE_FIELD_LIMITS[key]} placeholder={readOnly ? "" : placeholder} onChange={event => update({ [key]: event.target.value })} />
    : <Input aria-label={label} value={content?.[key] || ""} disabled={readOnly} maxLength={CIRCUIT_CHANGE_FIELD_LIMITS[key]} placeholder={readOnly ? "" : placeholder} onChange={event => update({ [key]: event.target.value })} />}</label>;
  const noteBox = <label className="circuit-note-box">
    <span>{reviewing ? "Review 意見（退回時必填）" : "留言"}</span>
    <Textarea aria-label="Review 意見或退回原因" value={reviewNote} disabled={!canEdit || remotelyRemoved} maxLength={10000} placeholder={reviewing ? "退回時請寫清楚要補充什麼；確認可以留空。" : "補充說明或討論，會記在歷史中。"} onChange={event => setReviewNote(event.target.value)} />
  </label>;
  const commentButton = <Button type="button" variant="outline" disabled={busy || !canEdit || remotelyRemoved || !reviewNote.trim()} onClick={() => act("comment")}><MessageSquare aria-hidden="true" />新增留言</Button>;

  return <>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent hideCloseButton className="circuit-changes-dialog" style={viewportStyle} data-testid="circuit-changes-dialog" data-mobile-detail={mobileDetail} data-mobile-pdf={!wide && mobilePdf} onPaste={paste}
        onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}
        onDragOver={event => { if (carriesFiles(event)) { event.preventDefault(); if (!readOnly && content) setDragSide(side); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragSide(null); }} onDrop={drop}>
        <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" aria-label="選取線路修改圖片" className="sr-only" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; addFiles(files, pickerSide.current); }} />
        <header className="circuit-header">
          <div className="circuit-title">
            <DialogTitle>線路修改</DialogTitle>
            <DialogDescription title={context.workspaceName}>{context.projectName && `${context.projectName} / `}{context.workspaceName}{context.versionLabel && ` · ${context.versionLabel}`}</DialogDescription>
          </div>
          <div className="circuit-set">
            {model.sets.length > 0
              ? <label className="circuit-set-picker" title="把同一次改版的修改放在一起，方便回查與匯出"><span>本次改版</span>
                <select aria-label="選擇改版紀錄" value={model.selectedSetId} disabled={busy || model.loading} onChange={event => void run(() => model.selectSet(event.target.value))}>
                  {model.sets.map(set => <option key={set.id} value={set.id}>{circuitSetLabel(set)}</option>)}
                </select>
              </label>
              : <p className="circuit-set-pending"><span>本次改版</span>{model.loading ? "載入中…" : canEdit ? <><strong>{naming.title}</strong><small>記錄第一項時自動建立</small></> : "尚未建立"}</p>}
            {canEdit && <Button type="button" variant="outline" className="circuit-new-set" onClick={openNewSet} disabled={busy || model.loading} title="為另一次改版建立獨立的修改清單"><Plus aria-hidden="true" />開始另一次改版</Button>}
          </div>
          <div className="circuit-header-actions">
            <Button type="button" className="circuit-action-pdf" variant={pdfOpen ? "secondary" : "outline"} aria-label="PDF 圖面" aria-pressed={pdfOpen} title={pdfOpen ? "收起 PDF，只看清單與表單" : "上傳或打開原理圖 PDF，逐頁框選修改"} onClick={togglePdf}><FileText aria-hidden="true" /><span>PDF<span className="circuit-pdf-word"> 圖面</span></span></Button>
            <Button type="button" className="circuit-action-baseline" variant="outline" aria-label="官方基準" aria-expanded={versionsOpen} aria-controls="circuit-pdf-version-manager" data-testid="circuit-pdf-official" data-configured={Boolean(officialPdf)} title={officialPdf ? `官方基準：${officialPdf.name}；管理 PDF 版本` : "尚未指定官方基準；管理 PDF 版本"} onClick={event => { versionsOpener.current = event.currentTarget; openVersions(); }}><ShieldCheck aria-hidden="true" /><span>官方基準</span></Button>
            {onAiReview && <Button type="button" className="circuit-action-ai" variant="outline" aria-label="AI 逐頁初審" disabled={!officialPdf || !pdfs.officialPdf || !activePdf || activePdf.id === officialPdf.id || !pdfs.activePdf || pdfs.opening} onClick={onAiReview} title={!officialPdf ? "先指定官方基準" : activePdf?.id === officialPdf.id ? "請選擇另一份工作 PDF 與官方基準比對" : !pdfs.officialPage ? "可比對全部頁面；本頁需先指定有效的官方對應頁" : "比對官方基準與工作版本，可選本頁或全部頁面"}><Sparkles aria-hidden="true" /><span>AI 初審</span></Button>}
            <Button type="button" className="circuit-action-export" variant="outline" aria-label="匯出 Change List" disabled={!selectedSet || !filtered.length || busy || model.dirty} title={model.dirty ? "尚有未儲存修改，儲存後可匯出" : `匯出目前篩選的全部 ${filtered.length} 項修改`} onClick={() => void run(() => exportCircuitChangeList(selectedSet!, filtered))}><Download aria-hidden="true" /><span>匯出 Change List</span></Button>
            <Button type="button" className="circuit-action-guide" variant="outline" aria-label="使用說明" onClick={() => setGuideOpen(true)}><HelpCircle aria-hidden="true" /><span>使用說明</span></Button>
            <Button type="button" variant="ghost" aria-label="關閉線路修改" className="circuit-close" onClick={() => close(false)}><X aria-hidden="true" /></Button>
          </div>
        </header>
        {(notice || model.error || model.saveError) && <div className="circuit-message" role="alert"><span>{notice || model.saveError || model.error}</span><div>{closeBlocked && <Button type="button" variant="ghost" title={unsaved ? "這項新修改還沒有建立，關閉後不會保留" : "未儲存的草稿會留在這台電腦，下次開啟這一項時帶回"} onClick={leave}>不儲存，直接關閉</Button>}<Button type="button" variant="ghost" onClick={() => void run(() => model.reload())}>重新載入</Button></div></div>}
        <div className="circuit-workspace" data-pdf-open={pdfOpen} data-list-collapsed={listCollapsed} data-detail-collapsed={detailCollapsed}>
          <aside className="circuit-list-panel" aria-label="修改項目">
            {listCollapsed ? <div className="circuit-list-rail">
              <Button type="button" variant="ghost" aria-label="展開修改清單" title="展開修改清單" onClick={() => changeLayout({ list: "open" })}><PanelLeftOpen aria-hidden="true" /></Button>
              {canEdit && <Button type="button" aria-label="新增修改" title="新增修改" onClick={newItem} disabled={busy || model.loading}><Plus aria-hidden="true" /></Button>}
              <span title={`共 ${model.items.length} 項修改`}>{model.items.length}<small>項</small></span>
            </div> : <>
            {canEdit && <div className="circuit-new-item-row"><Button type="button" className="circuit-new-item" title="每一處修改記成一項" onClick={newItem} disabled={busy || model.loading}><Plus aria-hidden="true" />新增修改</Button>
              {(model.removedItems?.length ?? 0) > 0 && <Button type="button" variant="outline" className="circuit-removed-trigger" aria-label={`已移除的修改（${model.removedItems.length}）`} title={`已移除的修改 ${model.removedItems.length} 項，可還原`} onClick={() => { setNotice(""); setRemovedOpen(true); }}><ArchiveRestore aria-hidden="true" /><span>{model.removedItems.length}</span></Button>}
              {wide && pdfOpen && <Button type="button" variant="outline" className="circuit-list-collapse" aria-label="收合修改清單" title="收合清單，讓 PDF 更寬" onClick={() => changeLayout({ list: "collapsed" })}><PanelLeftClose aria-hidden="true" /></Button>}</div>}
            <div className="circuit-filter-bar" role="group" aria-label="線路修改篩選">
              <label className="circuit-search"><Search aria-hidden="true" /><Input aria-label="搜尋線路修改" placeholder="搜尋編號、標題、Ref 或 Net" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} /></label>
              <label className="circuit-filter-select" data-status={filters.status}><Filter aria-hidden="true" /><span className="sr-only">狀態</span><select aria-label="篩選修改狀態" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
                <option value="all">全部狀態</option>{statusKeys.map(key => <option key={key} value={key}>{CIRCUIT_CHANGE_STATUS_LABELS[key]}（{statusCounts[key]}）</option>)}
              </select></label>
              <label className="circuit-filter-select circuit-filter-owner" data-active={filters.owner !== "all"}><UserRound aria-hidden="true" /><span className="sr-only">負責人</span><select aria-label="篩選修改負責人" value={filters.owner} onChange={event => setFilters(current => ({ ...current, owner: event.target.value }))}>
                <option value="all">全部負責人</option>{filters.owner !== "all" && !owners.includes(filters.owner) && <option value={filters.owner}>{filters.owner}</option>}{owners.map(owner => <option key={owner} value={owner}>{owner}</option>)}
              </select></label>
            </div>
            {activeChips.length > 0 && <div className="circuit-active-filters" data-testid="circuit-active-filters">
              {activeChips.map(chip => <button type="button" key={chip.key} aria-label={`移除篩選：${chip.label}`} onClick={() => setFilters(current => ({ ...current, [chip.key]: chip.reset }))}>{chip.label}<X aria-hidden="true" /></button>)}
              <Button type="button" variant="ghost" onClick={() => setFilters({ query: "", status: "all", owner: "all" })}>全部清除</Button>
            </div>}
            <div className="circuit-item-list" aria-label="修改項目清單" aria-busy={model.loading}>
              <div className="circuit-list-heading"><span>編號</span><span className="circuit-list-heading-title">修改項目<span className="circuit-result-count">{filtered.length === model.items.length ? `${model.items.length} 項` : `${filtered.length} / ${model.items.length} 項`}</span></span><span>狀態</span></div>
              {filtered.map(row => <button type="button" key={row.id} data-testid="circuit-change-item" className="circuit-item" aria-pressed={row.id === model.selectedItemId} disabled={busy} onClick={() => selectItem(row.id)}>
                <span className="circuit-item-number">{number(row.number)}</span>
                <span className="circuit-item-title"><strong>{row.content.title || "未命名修改"}</strong><small>{[row.content.refs || row.content.net, row.content.owner].filter(Boolean).join(" · ") || "尚未補充位置"}{row.imageCount ? ` · ${row.imageCount} 張圖` : ""}</small></span>
                <span className="circuit-list-status" data-status={row.status}>{CIRCUIT_CHANGE_STATUS_LABELS[row.status]}</span>
              </button>)}
              {model.loading && !model.items.length ? <p className="circuit-empty">正在載入修改項目…</p>
                : model.items.length > 0 && !filtered.length ? <p className="circuit-empty">目前篩選條件沒有符合的修改項目</p>
                : !model.items.length ? <p className="circuit-empty">{unsaved && canEdit ? "還沒有修改；在右邊填寫就會建立第一項" : "這次改版還沒有記錄任何修改"}</p> : null}
            </div>
            </>}
          </aside>
          {pdfOpen && <CircuitPdfPanel pdfs={pdfs} ink={pdfInk} canEdit={canEdit} captureBlocked={captureBlocked} targetLabel={targetLabel} pageChanges={pageChanges} crops={pdfCrops} versionsOpen={versionsOpen} onVersionsOpenChange={setVersionsOpen} versionsOpener={versionsOpener}
            onCapture={addCaptures} onSelectChange={selectItem} onBack={() => { setVersionsOpen(false); setMobilePdf(false); }} />}
          <section ref={detailPanel} id="circuit-change-detail" className="circuit-detail" hidden={detailCollapsed} aria-label="線路修改內容" data-testid="circuit-change-detail" aria-busy={model.switching}>
            {content && item ? <>
              <header className="circuit-detail-heading">
                {wide && pdfOpen && <Button type="button" variant="ghost" className="circuit-detail-collapse" aria-label="收合修改內容" title="收合修改內容，讓 PDF 更寬" aria-expanded={true} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightClose aria-hidden="true" /></Button>}
                <Button type="button" variant="ghost" className="circuit-mobile-back" aria-label="返回修改清單" onClick={() => setMobileDetail(false)}><ArrowLeft aria-hidden="true" /></Button>
                <div>
                  <strong>{unsaved ? "新修改" : number(item.number)}<span className="circuit-list-status" data-status={item.status}>{unsaved ? "尚未儲存" : CIRCUIT_CHANGE_STATUS_LABELS[item.status]}</span></strong>
                  <span title={unsaved ? undefined : `修訂 ${item.revision}${latestActor ? ` · ${latestActor}` : ""} · ${dateTime(item.updatedAt)}`}>{unsaved ? "填寫後自動建立" : `修訂 ${item.revision}${latestActor ? ` · ${latestActor}` : ""}`}</span>
                </div>
                <div className="circuit-item-navigation">
                  <Button type="button" variant="ghost" aria-label="上一項修改" title="上一項" disabled={!canPrevious || busy} onClick={() => selectItem(filtered[selectedIndex - 1].id)}><ChevronLeft aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" aria-label="下一項修改" title="下一項" disabled={!canNext || busy} onClick={() => selectItem(filtered[selectedIndex < 0 ? 0 : selectedIndex + 1].id)}><ChevronRight aria-hidden="true" /></Button>
                  {!unsaved && <Button type="button" variant={historyOpen ? "secondary" : "ghost"} aria-pressed={historyOpen} onClick={() => setHistoryOpen(value => !value)}>歷史 {model.events.length}</Button>}
                  {canEdit && !snapshot && !unsaved && <Button type="button" variant="ghost" className="circuit-remove-item" aria-label="移除修改" title="移出清單，保留歷史與原圖，之後可還原" disabled={busy || remotelyRemoved} onClick={() => { setNotice(""); setRemoveTarget(item); }}><Trash2 aria-hidden="true" /></Button>}
                </div>
              </header>
              <div ref={detailScroll} className="circuit-detail-scroll">
                {snapshot && <div className="circuit-snapshot-banner" role="status"><span>正在查看修訂 {snapshot.revision}，此版本內容唯讀</span><Button type="button" variant="outline" onClick={() => { setSnapshot(null); setViewerId(""); }}>返回目前修訂</Button></div>}
                {model.conflict && !snapshot && <div className="circuit-conflict" role="alert"><p>{remotelyRemoved ? "這項修改已由其他人移除。你的草稿仍保留；請先還原項目後再儲存。" : "另一位使用者已更新這個項目。你的草稿仍保留，請選擇要採用的內容。"}</p><div><Button type="button" variant="outline" onClick={() => { setNotice(""); model.adoptRemote(); }}>採用最新版本</Button><Button type="button" disabled={busy || !canEdit || remotelyRemoved} onClick={() => void run(() => model.saveMyRevision())}>儲存我的修訂</Button></div></div>}
                {returned && <div className="circuit-returned" role="status"><strong>退回原因</strong><p>{returned.note || "未填寫原因"}</p><span>{returned.actorName} · {dateTime(returned.createdAt)}</span></div>}
                {locked && <div className="circuit-locked" role="status"><span>{item.status === "in_review" ? "這項正在等待 Review，內容已鎖定以免誤改。" : "這項已確認，內容已鎖定。"}</span><Button type="button" variant="outline" disabled={busy} onClick={() => setUnlockedId(item.id)}>修改內容</Button></div>}
                {!readOnly && item.status === "in_review" && <p className="circuit-revision-note">修改任何內容（包含圖片標記）會撤回送審，需要重新送出 Review。</p>}
                {!readOnly && item.status === "approved" && <p className="circuit-revision-note">更新已確認的內容會保留原紀錄，並建立需要重新 Review 的修訂。</p>}
                <div className="circuit-content-fields">
                  {field("title", "修改標題", false, "例如：調整 R2301 阻值與接法")}
                  <div className="circuit-location-fields">{field("refs", "Ref", false, "R2301、U2…")}{field("net", "Net", false, "電源或訊號名稱")}{field("page", "頁碼", false, "原理圖頁碼")}{field("owner", "負責人", false, "工程師名稱")}</div>
                </div>
                <div className="circuit-description-fields">{field("reason", "修改原因", true, "為什麼需要這次修改？")}{field("description", "修改說明", true, "實際改了什麼：元件、數值、接法。")}</div>
                <CircuitChangeImages key={`${item.id}:${snapshot ? snapshot.revision : "live"}`} images={images} urls={urls} side={side} dragSide={dragSide} readOnly={readOnly} busy={busy}
                  uploading={model.uploading} progress={model.uploadProgress} warnings={snapshot ? [] : model.uploadWarnings} failures={snapshot ? [] : model.uploadFailures}
                  removed={removed && removed.itemId === item.id ? removed.image : null}
                  onSide={setSide} onDragSide={setDragSide} onPick={openPicker} onFiles={addFiles} onOpen={image => setViewerId(image.id)} onRemove={removeImage} onRestore={restoreImage}
                  onDownload={image => void run(() => downloadCircuitImage(image))} onRetry={() => void run(() => model.retryUploads())} onDismiss={model.dismissUploadFailures} onShowSource={showSource} />
                {historyOpen && <section ref={historySection} className="circuit-history" aria-label="修改與 Review 歷史">
                  <h3>修改與確認紀錄</h3>
                  <p className="circuit-history-help">每次儲存、送審、確認與退回都會留在這裡；查看修訂可回看當時內容。</p>
                  {!snapshot && canEdit && !reviewing && <div className="circuit-comment">{noteBox}{commentButton}</div>}
                  {history.length ? history.map(group => {
                    const expanded = expandedGroups.includes(group.latest.id);
                    const openRevision = (id: string) => void run(async () => { const full = await model.loadEvent(id); if (!full.snapshot) throw new Error("此修訂內容尚未載入，請重試。"); setSnapshot(full.snapshot); setViewerId(""); });
                    return <article key={group.latest.id}>
                      <div><strong>修訂 {group.latest.revision} · {CIRCUIT_EVENT_LABELS[group.latest.type] || group.latest.type}{group.events.length > 1 ? `（連續 ${group.events.length} 次）` : ""}</strong><span>{group.latest.actorName} · {dateTime(group.latest.createdAt)}</span></div>
                      {group.latest.note && <p>{group.latest.note}</p>}
                      <Button type="button" variant="outline" disabled={busy} onClick={() => openRevision(group.latest.id)}>查看此修訂</Button>
                      {group.events.length > 1 && <div className="circuit-history-earlier">
                        <Button type="button" variant="ghost" aria-expanded={expanded} onClick={() => setExpandedGroups(current => expanded ? current.filter(id => id !== group.latest.id) : [...current, group.latest.id])}>{expanded ? "收合" : `顯示這段的其餘 ${group.events.length - 1} 次修訂`}</Button>
                        {expanded && <ul>{group.events.slice(1).map(event => <li key={event.id}><span>修訂 {event.revision} · {dateTime(event.createdAt)}</span><Button type="button" variant="ghost" disabled={busy} onClick={() => openRevision(event.id)}>查看</Button></li>)}</ul>}
                      </div>}
                    </article>;
                  }) : <p>尚無歷史紀錄</p>}
                </section>}
              </div>
              <footer className="circuit-detail-footer">
                {reviewing && <div className="circuit-review-bar">{noteBox}<div>{commentButton}<Button type="button" variant="outline" disabled={busy} onClick={() => act("request_changes")}>退回補充</Button><Button type="button" disabled={busy} onClick={() => act("approve")}><Check aria-hidden="true" />確認</Button></div></div>}
                <div className="circuit-footer-row">
                  <span role="status" className={!snapshot && canEdit && !reviewing ? "sr-only" : undefined}>{snapshot ? `修訂 ${snapshot.revision} 唯讀` : saveLabel}</span>
                  {nextStep && <span className="circuit-next-step" title={nextStep}>{nextStep}</span>}
                  {!snapshot && canEdit && !reviewing && <div>
                    <Button type="button" variant="outline" className="circuit-save-button" aria-label="儲存修改" title={saveLabel} data-state={model.saving ? "saving" : model.dirty ? "dirty" : model.saveError ? "failed" : "saved"} disabled={busy || !model.dirty || remotelyRemoved} onClick={() => void run(() => model.saveDraft())}>{model.saving ? "儲存中…" : model.dirty ? (model.saveError ? "重新儲存" : "儲存修改") : <><Check aria-hidden="true" />{unsaved ? "自動儲存" : "已儲存"}</>}</Button>
                    {canSubmit && <Button type="button" disabled={busy || model.conflict || missing.length > 0} title={missing.length ? `還缺：${missing.join("、")}` : undefined} onClick={() => act("submit")}>送出 Review</Button>}
                  </div>}
                </div>
              </footer>
            </> : <div className="circuit-detail-empty">
              {wide && pdfOpen && <Button type="button" variant="ghost" aria-label="收合修改內容" aria-expanded={true} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightClose aria-hidden="true" />收合修改內容</Button>}
              <h3>{model.loading ? "正在載入線路修改…" : model.items.length ? "從左側選一項修改" : "這塊板子還沒有線路修改紀錄"}</h3>
              {!model.loading && !model.items.length && <p>{canEdit ? "按「新增修改」開始記錄。" : "你目前是檢視權限；有編輯權限的同仁記錄後，這裡會列出每一項修改的前後圖與 Review 狀態。"}</p>}
              {!model.loading && canEdit && <Button type="button" disabled={busy} onClick={newItem}><Plus aria-hidden="true" />新增修改</Button>}
            </div>}
          </section>
          {detailCollapsed && <aside className="circuit-list-rail circuit-detail-rail" aria-label="修改內容已收合"><Button type="button" variant="ghost" aria-label="展開修改內容" title="展開修改內容" aria-expanded={false} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightOpen aria-hidden="true" /></Button><span aria-hidden="true">修改內容</span></aside>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(removeTarget)} onOpenChange={value => { if (!value && !working) setRemoveTarget(null); }}>
      <DialogContent className="circuit-remove-dialog" style={viewportStyle}>
        <DialogTitle>移除這項修改？</DialogTitle>
        <DialogDescription>「{removeTarget && `${number(removeTarget.number)} ${removeTarget.content.title || "未命名修改"}`}」會移出修改清單。已儲存的歷史與原圖保留，之後可從「已移除的修改」還原；未儲存的草稿會捨棄。</DialogDescription>
        <div className="circuit-new-set-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>取消</Button><Button type="button" variant="destructive" disabled={busy || !canEdit || !removeTarget} onClick={() => void run(async () => { await model.deleteItem(removeTarget!.id); setRemoveTarget(null); setMobileDetail(false); })}>確認移除</Button></div>
        {notice && <p role="alert">{notice}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={removedOpen} onOpenChange={setRemovedOpen}>
      <DialogContent className="circuit-removed-dialog" style={viewportStyle}>
        <DialogTitle>已移除的修改</DialogTitle>
        <DialogDescription>歷史與原圖仍保留。還原後可回到修改清單繼續查看。</DialogDescription>
        <ul className="circuit-removed-list">{(model.removedItems ?? []).map(row => <li key={row.id}><div><strong>{number(row.number)} {row.content.title || "未命名修改"}</strong><span>{row.content.owner || "未指定負責人"}</span></div><Button type="button" variant="outline" disabled={busy || !canEdit} aria-label={`還原修改 ${number(row.number)}`} onClick={() => void run(() => model.restoreItem(row.id))}><ArchiveRestore aria-hidden="true" />還原</Button></li>)}{!model.removedItems?.length && <li className="circuit-removed-empty">沒有已移除的修改</li>}</ul>
        {notice && <p role="alert">{notice}</p>}
        <div className="circuit-new-set-actions"><Button type="button" variant="outline" onClick={() => setRemovedOpen(false)} disabled={busy}>關閉</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={newSetOpen} onOpenChange={setNewSetOpen}>
      <DialogContent className="circuit-new-set-dialog" style={viewportStyle}>
        <DialogTitle>建立改版紀錄</DialogTitle>
        <DialogDescription>把同一次改版的修改集中在一份清單。例如這次修改 Rev A → Rev B，就建立一份紀錄；日常補圖或更新同一項修改，不必再建立。</DialogDescription>
        <form onSubmit={submitNewSet}>
          <label>這次改版的名稱<Input aria-label="改版紀錄名稱" autoComplete="off" value={newTitle} maxLength={160} placeholder="例如：E1.S Rev B 線路修正" onChange={event => setNewTitle(event.target.value)} /></label>
          <div className="circuit-new-set-versions">
            <label>修改前版次<Input aria-label="修改前版次" value={fromLabel} maxLength={80} onChange={event => setFromLabel(event.target.value)} /></label>
            <label>修改後版次<Input aria-label="修改後版次" value={toLabel} maxLength={80} placeholder="例如：V2 / Rev B" onChange={event => setToLabel(event.target.value)} /></label>
          </div>
          <p className="circuit-new-set-hint">這裡只整理修改紀錄，不會改動原始 BOM 或覆蓋 PDF。建立後名稱與版次目前無法修改，請先確認。</p>
          <div className="circuit-new-set-actions"><Button type="button" variant="outline" onClick={() => setNewSetOpen(false)} disabled={working}>取消</Button><Button type="submit" disabled={working || !newTitle.trim()}>建立改版紀錄</Button></div>
          {notice && <p role="alert">{notice}</p>}
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent hideCloseButton className="circuit-guide-dialog" style={viewportStyle} data-testid="circuit-usage-guide">
        <header className="circuit-guide-header"><div><DialogTitle>線路修改怎麼用</DialogTitle><DialogDescription>記錄修改與貼圖 → 標出位置 → 逐項 Review → 匯出</DialogDescription></div><Button type="button" variant="ghost" aria-label="關閉使用說明" onClick={() => setGuideOpen(false)}><X aria-hidden="true" /></Button></header>
        <div className="circuit-guide-scroll">
          <section><h3>先分清楚官方基準、工作 PDF 與改版紀錄</h3><p>官方基準是你明確指定的參考原檔；「新增 PDF」會保留全部舊版，也不會換掉官方基準。改版紀錄只把同一次改動的項目集中管理，不會切換 BOM 或自動更換 PDF。</p></section>
          <section><h3>逐頁怎麼比對與初審？</h3><p>先在 PDF 區指定官方基準，再選工作 PDF，按「與官方比對」並核對兩邊頁碼。頁面新增或刪除時，請調整「官方對應頁」。按「AI 逐頁初審」會用這兩頁的圖像與文字核對可見的連接性、Net 與名稱差異；每項保留位置、前後依據與建議，你可逐項判讀並保存。AI 結果與人工 Review 分開，PDF 初審不能取代原始 Netlist／ERC 的電氣連通驗證。</p></section>
          <ol className="circuit-start-steps">{guideSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol>
          <section><h3>PDF 怎麼用？</h3><p>按右上的「PDF 圖面」上傳原理圖 PDF（可拖入，每份 50 MB 內存到雲端，更大的只在這台電腦開啟，不需壓縮）。日期先取檔名裡的日期，沒有就用檔案日期，可在版本清單修改。上傳錯了就按版本選擇旁的垃圾桶刪除（已加入的截圖保留，可從版本清單的「已刪除的 PDF」還原）。在頁面上拖曳框選一塊區域，按「加到修改前／修改後」，圖會從 PDF 重新繪製，放大也清楚，並記下來源版本與頁碼；這項的頁碼欄若是空的會自動填入。工具列的「畫筆」可直接畫線，放開後依版本與頁碼自動儲存；用「橡皮擦」點掉筆跡，或撤回最後一筆。縮放不會改變標註位置，加入截圖時會帶上筆跡；PDF 原圖不變。選「對照」可以並排一份較早日期的 PDF，同一個框選區域一次加到修改前與修改後。按「看完，下一頁」記下進度；上方的頁面總覽會分別標出這版看過、較早版本看過與有修改的頁面，明天上傳新的 PDF 會從你看到的那一頁接續。按圖片旁的「P12」可回到該頁。</p></section>
          <section><h3>1. 怎麼新增？</h3><p>打開「線路修改」就能直接填寫；之後按左上的「新增修改」再記下一項。每一處修改各一項，填入標題、Ref／Net、頁碼、負責人及修改原因。還沒輸入任何內容的新修改不會留下紀錄。</p></section>
          <section><h3>2. 怎麼貼圖、標記？</h3><p>截圖後按 Ctrl+V，圖會加到標示「貼上會加到這裡」的那一格；點另一格即可切換，也可以把檔案拖到想放的那一格。每次加入都是追加，每項最多 200 張、每張 50 MB，不需壓縮。點圖片放大，使用「位置標記」或「框選」標出改動並填寫說明；放錯格可在放大視窗改「圖片用途」。</p></section>
          <section><h3>3. 怎麼儲存與交給主管 Review？</h3><p>停止輸入後會自動儲存，下方顯示「已儲存」。標題加上修改說明（或修改後圖片）齊全後，按「送出 Review」。有料號申請編輯權限的人可逐項「確認」，或填寫意見後「退回補充」；退回原因會顯示在該項目最上方。按「歷史」可查看操作者、時間、意見及舊修訂。</p></section>
          <section><h3>4. 怎麼產生 Change List？</h3><p>選好本次改版，按「匯出 Change List」下載 Excel，包含目前篩選的修改項目、標註圖片及 Review 歷史。要匯出全部修改，先將搜尋、狀態與負責人篩選全部清除。</p></section>
        </div>
        <footer className="circuit-guide-footer"><Button type="button" onClick={() => setGuideOpen(false)}>知道了</Button></footer>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(viewer)} onOpenChange={value => { if (!value) setViewerId(""); }}>
      <DialogContent hideCloseButton className="circuit-image-viewer-dialog" style={viewportStyle}>
        <div className="circuit-image-dialog-heading">
          <DialogTitle title={viewer?.name}>{viewer ? `${CIRCUIT_IMAGE_SIDE_LABELS[viewer.side]} · ${viewer.name}` : "線路圖片"}</DialogTitle>
          <Button type="button" variant="ghost" aria-label="關閉圖片" onClick={() => setViewerId("")}><X aria-hidden="true" /></Button>
        </div>
        <DialogDescription className="sr-only">{readOnly ? "原圖與此修訂的標記" : "放大查看、框選或加入位置說明，原圖會保留。"}</DialogDescription>
        {viewer && urls[viewer.id] && <CircuitChangeImageViewer image={viewer} src={urls[viewer.id].original} onChange={readOnly ? undefined : updateImage} readOnly={readOnly}
          position={{ index: viewerIndex, total: viewerOrder.length }}
          onPrevious={viewerIndex > 0 ? () => setViewerId(viewerOrder[viewerIndex - 1].id) : undefined}
          onNext={viewerIndex + 1 < viewerOrder.length ? () => setViewerId(viewerOrder[viewerIndex + 1].id) : undefined} />}
      </DialogContent>
    </Dialog>
  </>;
}
