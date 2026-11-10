import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArchiveRestore, ArrowLeft, Check, Pencil, ChevronLeft, ChevronRight, Download, FileText, Filter, HelpCircle, ListChecks, MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, ScanSearch, Search, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { CircuitOfficialVersions } from "./CircuitOfficialVersions";
import { CIRCUIT_EVENT_LABELS, circuitSetLabel, groupCircuitChangeEvents, latestCircuitReturn } from "./presentation";
import { CIRCUIT_CHANGE_FIELD_LIMITS, CIRCUIT_CHANGE_STATUS_LABELS, CIRCUIT_IMAGE_SIDE_LABELS, CIRCUIT_TASKS, circuitChangeMissingForReview, type CircuitTask, defaultCircuitChangeSet, isUnsavedCircuitChange, type CircuitChangeContext, type CircuitChangeContent, type CircuitChangeItem, type CircuitChangeStatus, type CircuitChangeTextField, type CircuitChangesModel, type CircuitImage, type CircuitImageSide } from "./types";
import "./circuitChanges.css";

const sides = Object.keys(CIRCUIT_IMAGE_SIDE_LABELS) as CircuitImageSide[];
const statusKeys = Object.keys(CIRCUIT_CHANGE_STATUS_LABELS) as CircuitChangeStatus[];
const FILTER_KEYS = [["circuitQuery", "query", ""], ["circuitStatus", "status", "all"], ["circuitOwner", "owner", "all"]] as const;
const guideSteps = [
  { title: "線路 Review：看圖、標記問題（檢查線路的人）", text: "上傳原理圖 PDF 逐頁看。看到問題就在圖上框選，按「加到問題截圖」；寫標題（必填）、問題說明並指定負責人，輸入後自動儲存。按「看完，下一頁」記下看到哪裡，明天上傳新的 PDF 會接續同一頁。" },
  { title: "AI 比對：確認新舊版差在哪裡", text: "左邊是官方版本，右邊是新版，兩邊同步捲動。按「AI 比對新舊版」逐頁找出差異，每一項選「已確認」或「不採用」並保存，結果留有時間與操作者。這一頁只看兩份圖面，不填問題。" },
  { title: "改善追蹤：回報改善、確認結案（畫線路的人、主管）", text: "畫線路的人選「待改善」的問題，在「改善結果」寫改善說明、加改好後截圖（可按「從圖面框選改好後截圖」），按「回報改善」。主管看「待確認」的問題，按「確認結案」或寫意見後「退回重改」。每一步都記在「追蹤紀錄」。" },
  { title: "官方版本：換了就記下來", text: "官方版本更換時，在「官方版本」選新的 PDF 並確認。每次更換都記下 PDF、設定人與時間；舊的 PDF 與紀錄都保留。" },
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

export function CircuitChangesDialog({ open, onOpenChange, context, canEdit, model, pdfs, pdfInk, onAiReview, task = "review", onTaskChange = () => {} }: {
  open: boolean; onOpenChange: (value: boolean) => void; context: CircuitChangeContext; canEdit: boolean; model: CircuitChangesModel; pdfs: CircuitPdfModel; pdfInk?: CircuitPdfInkModel; onAiReview?: () => void;
  /** Which of the four jobs is on screen: 線路 Review, AI 比對, 改善追蹤 or 官方版本. */
  task?: CircuitTask; onTaskChange?: (task: CircuitTask) => void;
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
  const [historyOpen, setHistoryOpen] = useState(task === "track");
  const taskRef = useRef(task); taskRef.current = task;
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
  // 改善追蹤 opens the drawing only when someone wants to frame the 改好後截圖 from it.
  const [trackPdf, setTrackPdf] = useState(false);
  const [problemEditId, setProblemEditId] = useState("");
  const pdfOpen = task === "official" ? false : wide ? task === "review" || task === "ai" || (task === "track" && trackPdf) : mobilePdf;
  const listCollapsed = wide && pdfOpen && (layout.list === "collapsed" || (layout.list === "auto" && !roomy));
  const detailCollapsed = wide && pdfOpen && task !== "track" && !layout.detail;
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
  const setName = selectedSet ? circuitSetLabel(selectedSet) : model.loading ? "" : naming.title;
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
    // In 改善追蹤 the tracking record is part of the job, so it is open with every problem.
    setSnapshot(null); setViewerId(""); setReviewNote(""); setHistoryOpen(taskRef.current === "track"); setExpandedGroups([]); setNotice(""); setRemoved(null); setUnlockedId("");
  }, [model.selectedItemId, context.seriesId]);
  // Unlocking covers one review state only: once the change is sent or approved again it is locked again.
  useEffect(() => { setUnlockedId(""); }, [model.selectedItem?.status]);
  // Screenshots usually arrive as "before" first; once a change has its before picture, the next paste belongs to "after".
  // On a phone the side is the tab on screen, and reading a change starts with its before picture.
  // A pasted screenshot goes to the picture the task is about: 問題截圖 in 線路 Review, 改好後截圖 in 改善追蹤.
  useEffect(() => { setSide(task === "track" ? "after" : "before"); }, [model.selectedItem?.id, task]);
  useEffect(() => { if (open) setMobilePdf(taskRef.current === "ai"); }, [open]);
  useEffect(() => { if (!open) { setMobileDetail(false); setMobilePdf(false); setNewSetOpen(false); setRemovedOpen(false); setRemoveTarget(null); setGuideOpen(false); setViewerId(""); openedDetail.current = false; } }, [open]);
  // On a phone the list comes first, but with nothing recorded yet the list is empty and the form is what the user needs.
  useEffect(() => {
    if (!open || openedDetail.current || model.loading || !model.selectedItem) return;
    openedDetail.current = true;
    if (isUnsavedCircuitChange(model.selectedItem) && !model.items.length) setMobileDetail(true);
  }, [open, model.loading, model.selectedItem, model.items.length]);
  useEffect(() => { if (historyOpen && taskRef.current !== "track") historySection.current?.scrollIntoView({ block: "start" }); }, [historyOpen]);
  useEffect(() => { setHistoryOpen(task === "track"); }, [task]);
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
  /** Brings the drawing on screen: from 改善追蹤 or 官方版本 that means going to 線路 Review. */
  // A picture's page button opens the drawing where the person is: inside 改善追蹤 for its pictures, otherwise in 線路 Review.
  function showPdf() { if (task === "track") { if (wide) setTrackPdf(true); else setMobilePdf(true); return; } if (task !== "review") onTaskChange("review"); if (!wide) setMobilePdf(true); }
  function chooseTask(next: CircuitTask) {
    setVersionsOpen(false); setTrackPdf(false);
    if (next !== "ai" && pdfs.compare) pdfs.setCompare("");
    if (next === task) { if (!wide) { setMobilePdf(next === "review" || next === "ai"); if (next === "track") setMobileDetail(false); } return; }
    // On a phone a task opens on its working screen: the form for 線路 Review and 改善追蹤, the comparison for AI 比對.
    // 線路 Review shows the drawing alone; AI 比對 puts the official version on the left of the newest working version.
    if (next === "ai" && pdfs.official) {
      const working = pdfs.active && pdfs.active.id !== pdfs.official.id ? pdfs.active : pdfs.documents.find(row => row.id !== pdfs.official?.id);
      if (working && working.id !== pdfs.active?.id) pdfs.select(working.id);
      else if (working) pdfs.compareOfficial();
    }
    if (!wide) setMobilePdf(next === "ai");
    onTaskChange(next);
  }
  function taskKey(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = CIRCUIT_TASKS[(index + step + CIRCUIT_TASKS.length) % CIRCUIT_TASKS.length];
    chooseTask(next.key);
    requestAnimationFrame(() => document.getElementById(`circuit-task-${next.key}`)?.focus());
  }
  function uploadPdfs(files: File[]) {
    if (!canEdit) { setNotice("目前為檢視權限，無法上傳 PDF。"); return; }
    showPdf();
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
      const shown = captures.some(capture => capture.side === "after") ? "after" : captures[0].side;
      requestAnimationFrame(() => detailScroll.current?.querySelector(`.circuit-image-column[data-side="${shown}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    } finally { setWorking(false); }
  }
  function showSource(image: CircuitImage) {
    if (!image.source) return;
    if (!pdfs.show(image.source.documentId, image.source.page)) { setNotice(`這張圖來自的 PDF（${image.source.date}「${image.source.name}」）已從清單移除。`); return; }
    showPdf();
    setViewerId("");
  }
  function addFiles(files: File[], targetSide = side) {
    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length) { uploadPdfs(pdfFiles); files = files.filter(file => !isPdfFile(file)); if (!files.length) return; }
    if (locked) { setNotice("這項的內容已鎖定，先按「修改內容」再加入圖片。"); return; }
    if (readOnly) { setNotice("目前為唯讀檢視，請返回目前修訂後加入圖片。"); return; }
    if (!files.length) return;
    setSide(targetSide);
    void run(async () => {
      await model.addImages(files, targetSide); changeLayout({ detail: true }); setMobileDetail(true);
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
      if ((action === "request_changes" || action === "comment") && !reviewNote.trim()) throw new Error(action === "request_changes" ? "請先寫退回原因，畫線路的人才知道還要改哪裡。" : "請填寫留言內容。");
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
  const targetLabel = unsaved || !item ? "新問題" : `${number(item.number)}${content?.title ? ` ${content.title.slice(0, 24)}` : ""}`;
  const saveLabel = model.saving ? "儲存中…" : model.saveError ? (model.dirty ? "儲存失敗" : "操作未完成") : model.dirty ? "尚有未儲存修改" : unsaved ? "輸入後自動儲存" : "已儲存";
  const problemDone = Boolean(content?.title.trim());
  const fixDone = Boolean(content && (content.description.trim() || content.images.some(image => image.side === "after")));
  // Step 2 opens once the problem exists (a title or a first picture saved it); a brand-new form shows step 1 only.
  const fixOpen = problemDone || fixDone || !unsaved;
  const nextStep = snapshot ? "" : !canEdit ? "檢視權限：可查看與匯出"
    : task === "review" ? (!problemDone ? "寫標題就會自動存" : item?.status === "approved" ? "這個問題已結案" : "已記錄；改好後到「改善追蹤」回報")
    : reviewing ? "改善沒問題就按「確認結案」；還要改的話先寫意見再退回重改。"
    : item?.status === "approved" && !model.dirty ? "這個問題已結案。" : !problemDone ? "先在「問題」寫標題"
    : !fixDone ? "寫改善說明或加改好後截圖" : "可以回報改善了";
  const viewportStyle = viewport ? { "--circuit-viewport-height": `${viewport.height}px`, "--circuit-viewport-top": `${viewport.top}px` } as CSSProperties : undefined;
  const field = (key: CircuitChangeTextField, label: string, multiline = false, placeholder = "", mark = "") => <label className={`circuit-field circuit-field-${key}`} key={key}><span>{label}{mark && !readOnly && <em className="circuit-field-mark">{mark}</em>}</span>{multiline
    ? <Textarea aria-label={label} value={content?.[key] || ""} disabled={readOnly} maxLength={CIRCUIT_CHANGE_FIELD_LIMITS[key]} placeholder={readOnly ? "" : placeholder} onChange={event => update({ [key]: event.target.value })} />
    : <Input aria-label={label} value={content?.[key] || ""} disabled={readOnly} maxLength={CIRCUIT_CHANGE_FIELD_LIMITS[key]} placeholder={readOnly ? "" : placeholder} onChange={event => update({ [key]: event.target.value })} />}</label>;
  const imageKey = `${item?.id || "new"}:${snapshot ? snapshot.revision : "live"}`;
  // The problem as the reviewer marked it: edited in 線路 Review, read (with 修改問題 to edit) in 改善追蹤.
  const problemOpen = !problemDone || problemEditId === item?.id;
  const problemMeta = content ? [content.refs && `Ref ${content.refs}`, content.net && `Net ${content.net}`, content.page && `第 ${content.page} 頁`, content.owner && `負責人 ${content.owner}`].filter(Boolean).join(" · ") : "";
  function toggleTrackPdf() { setSide("after"); if (wide) setTrackPdf(value => !value); else setMobilePdf(true); }
  const imageProps = {
    images, urls, side, dragSide, readOnly, busy, uploading: model.uploading, progress: model.uploadProgress,
    warnings: snapshot ? [] : model.uploadWarnings, failures: snapshot ? [] : model.uploadFailures,
    removed: removed && removed.itemId === item?.id ? removed.image : null,
    onSide: setSide, onDragSide: setDragSide, onPick: openPicker, onFiles: addFiles, onOpen: (image: CircuitImage) => setViewerId(image.id), onRemove: removeImage, onRestore: restoreImage,
    onDownload: (image: CircuitImage) => void run(() => downloadCircuitImage(image)), onRetry: () => void run(() => model.retryUploads()), onDismiss: model.dismissUploadFailures, onShowSource: showSource,
  };
  const problemFields = <div className="circuit-content-fields">
    {field("title", "標題", false, "例如：R2301 阻值錯誤", "必填")}
    <CircuitChangeImages key={`${imageKey}:before`} view="before" heading="問題截圖" hint={wide && pdfOpen ? "在左邊圖面框選，或貼上（Ctrl+V）、拖入、點這裡" : "貼上（Ctrl+V）、拖入或點這裡選檔"} {...imageProps} />
    {field("reason", "問題說明", true, "哪裡有問題、為什麼要改？")}
    <div className="circuit-location-fields">{field("refs", "Ref", false, "R2301、U2…")}{field("net", "Net", false, "電源或訊號名稱")}{field("page", "頁碼", false, "原理圖頁碼")}{field("owner", "負責人", false, "畫線路的人")}</div>
  </div>;
  const noteBox = <label className="circuit-note-box">
    <span>{reviewing ? "主管意見（退回時必填）" : "留言"}</span>
    <Textarea aria-label="主管意見或退回原因" value={reviewNote} disabled={!canEdit || remotelyRemoved} maxLength={10000} placeholder={reviewing ? "退回時寫清楚還要改什麼；確認結案可以留空。" : "補充說明或討論，會記在追蹤紀錄。"} onChange={event => setReviewNote(event.target.value)} />
  </label>;
  const commentButton = <Button title="把意見記到追蹤紀錄，不改變狀態" type="button" variant="outline" disabled={busy || !canEdit || remotelyRemoved || !reviewNote.trim()} onClick={() => act("comment")}><MessageSquare aria-hidden="true" />新增留言</Button>;

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
            <DialogDescription title={[context.projectName, context.workspaceName, setName].filter(Boolean).join(" / ")}>{context.projectName && `${context.projectName} / `}{context.workspaceName}{(setName) && ` · ${setName}`}</DialogDescription>
          </div>
          <div className="circuit-header-actions">
            <Button type="button" className="circuit-action-export" variant="outline" aria-label="匯出 Change List" disabled={!selectedSet || !filtered.length || busy || model.dirty} title={model.dirty ? "尚有未儲存修改，儲存後可匯出" : `匯出目前篩選的全部 ${filtered.length} 個問題與追蹤紀錄`} onClick={() => void run(() => exportCircuitChangeList(selectedSet!, filtered))}><Download aria-hidden="true" /><span>匯出</span></Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild><Button title="使用說明、新增改版清單" type="button" variant="outline" className="circuit-action-more" aria-label="更多"><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="circuit-more-menu">
                <DropdownMenuItem title="打開線路修改的操作說明" onSelect={() => setGuideOpen(true)}><HelpCircle aria-hidden="true" />使用說明</DropdownMenuItem>
                {canEdit && <DropdownMenuItem title="換到下一次改版（例如 V2 → V3）時，另開一份問題清單" disabled={busy || model.loading} onSelect={openNewSet}><Plus aria-hidden="true" />新增改版清單</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button title="關閉線路修改；還沒存的內容會先儲存" type="button" variant="ghost" aria-label="關閉線路修改" className="circuit-close" onClick={() => close(false)}><X aria-hidden="true" /></Button>
          </div>
        </header>
        <nav className="circuit-tasks" role="tablist" aria-label="線路修改工作">
          {CIRCUIT_TASKS.map((entry, index) => {
            const Icon = entry.key === "review" ? ScanSearch : entry.key === "ai" ? Sparkles : entry.key === "track" ? ListChecks : ShieldCheck;
            const count = entry.key === "track" ? model.items.filter(row => row.status !== "approved").length : 0;
            return <button key={entry.key} id={`circuit-task-${entry.key}`} type="button" role="tab" className="circuit-task" data-task={entry.key} aria-selected={task === entry.key} aria-controls="circuit-task-panel" tabIndex={task === entry.key ? 0 : -1}
              title={entry.hint} onClick={() => chooseTask(entry.key)} onKeyDown={event => taskKey(event, index)}>
              <b className="circuit-task-number" aria-hidden="true">{index + 1}</b><Icon aria-hidden="true" /><span className="circuit-task-text"><span className="circuit-task-label">{entry.label}</span><em className="circuit-task-short" aria-hidden="true">{entry.short}</em></span>{count > 0 && <small aria-label={`${count} 個未結案`}>{count}</small>}
            </button>;
          })}
        </nav>
        {(notice || model.error || model.saveError) && <div className="circuit-message" role="alert"><span>{notice || model.saveError || model.error}</span><div>{closeBlocked && <Button type="button" variant="ghost" title={unsaved ? "這項新修改還沒有建立，關閉後不會保留" : "未儲存的草稿會留在這台電腦，下次開啟這一項時帶回"} onClick={leave}>不儲存，直接關閉</Button>}<Button title="重新讀取最新資料" type="button" variant="ghost" onClick={() => void run(() => model.reload())}>重新載入</Button></div></div>}
        {task === "official" ? <div id="circuit-task-panel" role="tabpanel" aria-labelledby="circuit-task-official" className="circuit-task-panel">
          <CircuitOfficialVersions seriesId={context.seriesId} pdfs={pdfs} canEdit={canEdit} onOpen={documentId => { pdfs.select(documentId); chooseTask("review"); }} />
        </div> : <div id="circuit-task-panel" role="tabpanel" aria-labelledby={`circuit-task-${task}`} className="circuit-workspace" data-task={task} data-pdf-open={pdfOpen} data-list-collapsed={listCollapsed} data-detail-collapsed={detailCollapsed}>
          {task !== "ai" && <aside id="circuit-change-list" className="circuit-list-panel" aria-label="修改項目">
            {listCollapsed ? <div className="circuit-list-rail">
              <Button type="button" variant="outline" className="circuit-panel-toggle" aria-label="展開修改清單" title="展開問題清單" aria-expanded={false} aria-controls="circuit-change-list" onClick={() => changeLayout({ list: "open" })}><PanelLeftOpen aria-hidden="true" /><span>展開清單</span></Button>
              {canEdit && task === "review" && <Button type="button" variant="outline" className="circuit-panel-toggle circuit-rail-new" aria-label="新增問題" title="記錄一個新問題" onClick={newItem} disabled={busy || model.loading}><Plus aria-hidden="true" /><span>新增問題</span></Button>}
              <span title={`共 ${model.items.length} 個問題`}>{model.items.length}<small>項</small></span>
            </div> : <>
            {model.sets.length > 1 && <label className="circuit-set-picker" title="每次改版各有一份問題清單"><span>改版清單</span>
              <select aria-label="選擇改版紀錄" value={model.selectedSetId} disabled={busy || model.loading} onChange={event => void run(() => model.selectSet(event.target.value))}>
                {model.sets.map(set => <option key={set.id} value={set.id}>{circuitSetLabel(set)}</option>)}
              </select>
            </label>}
            {((canEdit && task === "review") || (!wide && task === "review") || (wide && pdfOpen)) && <div className="circuit-new-item-row">{canEdit && task === "review" && <Button type="button" variant="outline" className="circuit-new-item" title="每個問題記成一項" onClick={newItem} disabled={busy || model.loading}><Plus aria-hidden="true" />新增問題</Button>}
              {!wide && task === "review" && <Button type="button" variant="outline" className="circuit-list-collapse circuit-mobile-pdf-list" aria-label="看圖面" title="打開 PDF 圖面，逐頁看、框選問題" onClick={() => setMobilePdf(true)}><FileText aria-hidden="true" /></Button>}
              {wide && pdfOpen && <Button type="button" variant="outline" className="circuit-list-collapse circuit-panel-toggle" aria-label="收合修改清單" title="收合清單，讓 PDF 更寬" aria-expanded={true} aria-controls="circuit-change-list" onClick={() => changeLayout({ list: "collapsed" })}><PanelLeftClose aria-hidden="true" /><span>收合清單</span></Button>}</div>}
            <div className="circuit-filter-bar" role="group" aria-label="線路修改篩選">
              <label className="circuit-search"><Search aria-hidden="true" /><Input aria-label="搜尋線路修改" placeholder="搜尋編號、標題、Ref、Net" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} /></label>
              <label className="circuit-filter-select" data-status={filters.status}><Filter aria-hidden="true" /><span className="sr-only">狀態</span><select title="只看某個狀態的問題" aria-label="篩選修改狀態" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}>
                <option value="all">全部狀態</option>{statusKeys.map(key => <option key={key} value={key}>{CIRCUIT_CHANGE_STATUS_LABELS[key]}（{statusCounts[key]}）</option>)}
              </select></label>
              <label className="circuit-filter-select circuit-filter-owner" data-active={filters.owner !== "all"}><UserRound aria-hidden="true" /><span className="sr-only">負責人</span><select title="只看某位負責人的問題" aria-label="篩選修改負責人" value={filters.owner} onChange={event => setFilters(current => ({ ...current, owner: event.target.value }))}>
                <option value="all">全部負責人</option>{filters.owner !== "all" && !owners.includes(filters.owner) && <option value={filters.owner}>{filters.owner}</option>}{owners.map(owner => <option key={owner} value={owner}>{owner}</option>)}
              </select></label>
            </div>
            {activeChips.length > 0 && <div className="circuit-active-filters" data-testid="circuit-active-filters">
              {activeChips.map(chip => <button type="button" key={chip.key} aria-label={`移除篩選：${chip.label}`} onClick={() => setFilters(current => ({ ...current, [chip.key]: chip.reset }))}>{chip.label}<X aria-hidden="true" /></button>)}
              <Button type="button" variant="ghost" onClick={() => setFilters({ query: "", status: "all", owner: "all" })}>全部清除</Button>
            </div>}
            <div className="circuit-item-list" aria-label="問題清單" aria-busy={model.loading}>
              <div className="circuit-list-heading"><span>編號</span><span className="circuit-list-heading-title">問題<span className="circuit-result-count">{filtered.length === model.items.length ? `${model.items.length} 項` : `${filtered.length} / ${model.items.length} 項`}</span></span><span>狀態</span></div>
              {filtered.map(row => <button title={`打開 ${number(row.number)} ${row.content.title || "未命名問題"}`} type="button" key={row.id} data-testid="circuit-change-item" className="circuit-item" aria-pressed={row.id === model.selectedItemId} disabled={busy} onClick={() => selectItem(row.id)}>
                <span className="circuit-item-number">{number(row.number)}</span>
                <span className="circuit-item-title"><strong>{row.content.title || "未命名問題"}</strong><small>{[row.content.refs || row.content.net, row.content.owner].filter(Boolean).join(" · ") || "尚未補充位置"}{row.imageCount ? ` · ${row.imageCount} 張圖` : ""}</small></span>
                <span className="circuit-list-status" data-status={row.status}>{CIRCUIT_CHANGE_STATUS_LABELS[row.status]}</span>
              </button>)}
              {model.loading && !model.items.length ? <p className="circuit-empty">正在載入問題…</p>
                : model.items.length > 0 && !filtered.length ? <p className="circuit-empty">目前篩選條件沒有符合的問題</p>
                : !model.items.length ? <p className="circuit-empty">{unsaved && canEdit ? "還沒有問題；在右邊填寫就會建立第一項" : "這次改版還沒有記錄任何問題"}</p> : null}
            </div>
            {canEdit && (model.removedItems?.length ?? 0) > 0 && <Button type="button" variant="outline" className="circuit-removed-trigger" aria-label={`已移除的問題（${model.removedItems.length}）`} title="打開已移除的問題，可以放回清單" onClick={() => { setNotice(""); setRemovedOpen(true); }}><ArchiveRestore aria-hidden="true" /><span>已移除 {model.removedItems.length} 個問題</span><b>還原</b></Button>}
            </>}
          </aside>}
          {pdfOpen && <CircuitPdfPanel mode={task === "ai" ? "ai" : "review"} captureSide={task === "track" ? "after" : "before"} pageReview={task === "review"} onAiReview={onAiReview} onSetupOfficial={() => chooseTask("official")} pdfs={pdfs} ink={pdfInk} canEdit={canEdit} captureBlocked={captureBlocked} targetLabel={targetLabel} pageChanges={pageChanges} crops={pdfCrops} versionsOpen={versionsOpen} onVersionsOpenChange={setVersionsOpen} versionsOpener={versionsOpener}
            onCapture={addCaptures} onSelectChange={selectItem} onBack={task === "ai" ? undefined : () => { setVersionsOpen(false); setMobilePdf(false); setTrackPdf(false); }} />}
          {task !== "ai" && <section ref={detailPanel} id="circuit-change-detail" className="circuit-detail" hidden={detailCollapsed} aria-label="問題內容" data-testid="circuit-change-detail" aria-busy={model.switching}>
            {content && item && !(task === "track" && unsaved) ? <>
              <header className="circuit-detail-heading">
                <Button type="button" variant="ghost" className="circuit-mobile-back" aria-label="返回問題清單" onClick={() => setMobileDetail(false)}><ArrowLeft aria-hidden="true" /></Button>
                <div>
                  <strong>{unsaved ? "新問題" : number(item.number)}{!unsaved && <span className="circuit-list-status" data-status={item.status}>{CIRCUIT_CHANGE_STATUS_LABELS[item.status]}</span>}</strong>
                  {!unsaved && <span data-revision title={`修訂 ${item.revision}${latestActor ? ` · ${latestActor}` : ""} · ${dateTime(item.updatedAt)}`}>{`修訂 ${item.revision}${latestActor ? ` · ${latestActor}` : ""}`}</span>}
                </div>
                <div className="circuit-item-navigation">
                  {!wide && task === "review" && <Button type="button" variant="ghost" className="circuit-mobile-pdf" aria-label="看圖面" title="打開 PDF 圖面，逐頁看、框選問題" onClick={() => setMobilePdf(true)}><FileText aria-hidden="true" /></Button>}
                  {filtered.length > 1 && <>
                  <Button type="button" variant="ghost" aria-label="上一個問題" title="上一個問題" disabled={!canPrevious || busy} onClick={() => selectItem(filtered[selectedIndex - 1].id)}><ChevronLeft aria-hidden="true" /></Button>
                  <Button type="button" variant="ghost" aria-label="下一個問題" title="下一個問題" disabled={!canNext || busy} onClick={() => selectItem(filtered[selectedIndex < 0 ? 0 : selectedIndex + 1].id)}><ChevronRight aria-hidden="true" /></Button></>}
                  {!unsaved && task === "track" && <Button title="顯示或收起這個問題的追蹤紀錄：每次儲存、回報改善、確認結案與退回" type="button" variant={historyOpen ? "secondary" : "ghost"} aria-pressed={historyOpen} aria-label={`追蹤紀錄 ${model.events.length}`} onClick={() => setHistoryOpen(value => !value)}><span className="circuit-history-word">追蹤</span>紀錄 {model.events.length}</Button>}
                  {canEdit && !snapshot && !unsaved && <Button type="button" variant="ghost" className="circuit-remove-item" aria-label="移除問題" title="移出清單，保留追蹤紀錄與原圖，之後可還原" disabled={busy || remotelyRemoved} onClick={() => { setNotice(""); setRemoveTarget(item); }}><Trash2 aria-hidden="true" /><span>移除問題</span></Button>}
                  {wide && pdfOpen && task !== "track" && <Button type="button" variant="outline" className="circuit-detail-collapse circuit-panel-toggle" aria-label="收合修改內容" title="收合問題內容，讓 PDF 更寬" aria-expanded={true} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightClose aria-hidden="true" /><span>收合</span></Button>}
                </div>
              </header>
              <div ref={detailScroll} className="circuit-detail-scroll">
                {snapshot && <div className="circuit-snapshot-banner" role="status"><span>正在查看修訂 {snapshot.revision}，此版本內容唯讀</span><Button title="回到這個問題的最新內容" type="button" variant="outline" onClick={() => { setSnapshot(null); setViewerId(""); }}>返回目前修訂</Button></div>}
                {model.conflict && !snapshot && <div className="circuit-conflict" role="alert"><p>{remotelyRemoved ? "這個問題已由其他人移除。你的草稿仍保留；請先還原後再儲存。" : "另一位使用者已更新這個項目。你的草稿仍保留，請選擇要採用的內容。"}</p><div><Button title="放棄你的草稿，改用別人剛儲存的版本" type="button" variant="outline" onClick={() => { setNotice(""); model.adoptRemote(); }}>採用最新版本</Button><Button title="用你的草稿存成新的修訂；別人的版本仍留在紀錄中" type="button" disabled={busy || !canEdit || remotelyRemoved} onClick={() => void run(() => model.saveMyRevision())}>儲存我的修訂</Button></div></div>}
                {returned && <div className="circuit-returned" role="status"><strong>退回原因</strong><p>{returned.note || "未填寫原因"}</p><span>{returned.actorName} · {dateTime(returned.createdAt)}</span></div>}
                {locked && <div className="circuit-locked" role="status"><span>{item.status === "in_review" ? "已回報改善，等主管確認；內容已鎖定以免誤改。" : "這個問題已結案，內容已鎖定。"}</span><Button title="解除鎖定來修改內容；修改後要重新回報改善" type="button" variant="outline" disabled={busy} onClick={() => setUnlockedId(item.id)}>修改內容</Button></div>}
                {!readOnly && item.status === "in_review" && <p className="circuit-revision-note">修改任何內容（包含圖片標記）會撤回回報，需要重新回報改善。</p>}
                {!readOnly && item.status === "approved" && <p className="circuit-revision-note">更新已結案的內容會保留原紀錄，並需要重新確認。</p>}
                <CircuitChangeImages view="status" {...imageProps} />
                {task === "track" ? <div className="circuit-form-steps" data-task="track">
                  <section className="circuit-form-step circuit-problem-summary" data-state={problemOpen ? "current" : "done"} aria-label="問題">
                    <h3 className="circuit-form-step-title" title="檢查線路的人在「線路 Review」標記的問題"><span>問題</span>
                      {!readOnly && problemDone && <Button type="button" variant="ghost" className="circuit-problem-edit" aria-expanded={problemOpen} title={problemOpen ? "收起問題的欄位" : "打開問題的欄位來修改"} onClick={() => setProblemEditId(problemOpen ? "" : item.id)}>{problemOpen ? "收起" : <><Pencil aria-hidden="true" />修改問題</>}</Button>}
                    </h3>
                    {problemOpen ? problemFields : <div className="circuit-problem-read">
                      <strong>{content.title}</strong>
                      {problemMeta && <span>{problemMeta}</span>}
                      {content.reason.trim() && <p>{content.reason}</p>}
                      {images.some(image => image.side === "before") && <CircuitChangeImages key={`${imageKey}:before-read`} view="before" heading="問題截圖" {...imageProps} readOnly />}
                    </div>}
                  </section>
                  <section className="circuit-form-step" data-state={fixDone ? "done" : "current"} aria-label="改善結果">
                    <h3 className="circuit-form-step-title" title="畫線路的人改好後填：改了什麼、附上改好後的截圖，再按下方「回報改善」交給主管確認"><span>改善結果</span></h3>
                    <div className="circuit-content-fields">
                      {field("description", "改善說明", true, "改了什麼：元件、數值、接法。")}
                      <CircuitChangeImages key={`${imageKey}:after`} view="after" heading="改好後截圖" hint={wide && pdfOpen ? "在左邊圖面框選，或貼上（Ctrl+V）、拖入、點這裡" : "貼上（Ctrl+V）、拖入或點這裡選檔"} {...imageProps} />
                      {!readOnly && <Button type="button" variant="outline" className="circuit-track-pdf" aria-pressed={pdfOpen} title={pdfOpen ? "關閉左邊的 PDF 圖面" : "打開 PDF 圖面，框選改好後的地方，直接加到改好後截圖"} onClick={toggleTrackPdf}><FileText aria-hidden="true" />{pdfOpen ? "關閉圖面" : "從圖面框選改好後截圖"}</Button>}
                    </div>
                  </section>
                </div> : <section className="circuit-form-step circuit-problem-form" aria-label="標記問題">
                  <h3 className="circuit-form-step-title" title="檢查線路的人填：哪裡有問題、附上截圖；寫好標題就會自動存起來"><span>標記問題</span></h3>
                  {problemFields}
                </section>}
                <CircuitChangeImages key={`${imageKey}:reference`} view="reference" heading="補充圖（選填）" hint="規格書、量測波形等：貼上、拖入或點這裡選檔" {...imageProps} />
                {historyOpen && task === "track" && <section ref={historySection} className="circuit-history" aria-label="追蹤紀錄">
                  <h3>追蹤紀錄</h3>
                  <p className="circuit-history-help">每次儲存、回報改善、確認結案與退回都留在這裡；查看修訂可回看當時內容。</p>
                  {!snapshot && canEdit && !reviewing && <div className="circuit-comment">{noteBox}{commentButton}</div>}
                  {history.length ? history.map(group => {
                    const expanded = expandedGroups.includes(group.latest.id);
                    const openRevision = (id: string) => void run(async () => { const full = await model.loadEvent(id); if (!full.snapshot) throw new Error("此修訂內容尚未載入，請重試。"); setSnapshot(full.snapshot); setViewerId(""); });
                    return <article key={group.latest.id}>
                      <div><strong>修訂 {group.latest.revision} · {CIRCUIT_EVENT_LABELS[group.latest.type] || group.latest.type}{group.events.length > 1 ? `（連續 ${group.events.length} 次）` : ""}</strong><span>{group.latest.actorName} · {dateTime(group.latest.createdAt)}</span></div>
                      {group.latest.note && <p>{group.latest.note}</p>}
                      <Button title="回看這次修訂當時的內容（唯讀）" type="button" variant="outline" disabled={busy} onClick={() => openRevision(group.latest.id)}>查看此修訂</Button>
                      {group.events.length > 1 && <div className="circuit-history-earlier">
                        <Button title="顯示或收起這段連續儲存的其他修訂" type="button" variant="ghost" aria-expanded={expanded} onClick={() => setExpandedGroups(current => expanded ? current.filter(id => id !== group.latest.id) : [...current, group.latest.id])}>{expanded ? "收合" : `顯示這段的其餘 ${group.events.length - 1} 次修訂`}</Button>
                        {expanded && <ul>{group.events.slice(1).map(event => <li key={event.id}><span>修訂 {event.revision} · {dateTime(event.createdAt)}</span><Button title="回看這次修訂當時的內容（唯讀）" type="button" variant="ghost" disabled={busy} onClick={() => openRevision(event.id)}>查看</Button></li>)}</ul>}
                      </div>}
                    </article>;
                  }) : <p>尚無歷史紀錄</p>}
                </section>}
              </div>
              <footer className="circuit-detail-footer">
                {reviewing && task === "track" && <div className="circuit-review-bar">{noteBox}<div>{commentButton}<Button title="寫好意見後退回給畫線路的人重改" type="button" variant="outline" disabled={busy} onClick={() => act("request_changes")}>退回重改</Button><Button title="改善沒問題，結案" type="button" disabled={busy} onClick={() => act("approve")}><Check aria-hidden="true" />確認結案</Button></div></div>}
                <div className="circuit-footer-row">
                  <span role="status" className={!snapshot && canEdit && !reviewing ? "sr-only" : undefined}>{snapshot ? `修訂 ${snapshot.revision} 唯讀` : saveLabel}</span>
                  {nextStep && <span className="circuit-next-step" title={nextStep}>{nextStep}</span>}
                  {!snapshot && canEdit && !reviewing && <div>
                    <Button type="button" variant="outline" className="circuit-save-button" aria-label="儲存修改" title={model.dirty ? "立即儲存目前的修改" : `${saveLabel}；停止輸入後會自動儲存`} data-state={model.saving ? "saving" : model.dirty ? "dirty" : model.saveError ? "failed" : "saved"} disabled={busy || !model.dirty || remotelyRemoved} onClick={() => void run(() => model.saveDraft())}>{model.saving ? "儲存中…" : model.dirty ? (model.saveError ? "重新儲存" : "儲存修改") : <><Check aria-hidden="true" />{unsaved ? "自動儲存" : "已儲存"}</>}</Button>
                    {canSubmit && !unsaved && task === "track" && <Button type="button" className="circuit-submit" disabled={busy || model.conflict || missing.length > 0} title={missing.length ? `回報改善前還缺：${missing.join("、")}` : "交給主管確認"} onClick={() => act("submit")}>回報改善</Button>}
                  </div>}
                </div>
              </footer>
            </> : <div className="circuit-detail-empty">
              {wide && pdfOpen && <Button title="收合問題內容，讓 PDF 更寬" type="button" variant="outline" className="circuit-panel-toggle" aria-label="收合修改內容" aria-expanded={true} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightClose aria-hidden="true" /><span>收合內容</span></Button>}
              <h3>{model.loading ? "正在載入線路修改…" : model.items.length ? (task === "track" ? "從左側選一個要改善的問題" : "從左側選一個問題") : "這塊板子還沒有問題紀錄"}</h3>
              {!model.loading && !model.items.length && <p>{canEdit ? (task === "review" ? "按「新增問題」開始記錄。" : "到「線路 Review」標記問題後，這裡會列出來。") : "你目前是檢視權限；有編輯權限的同仁記錄後，這裡會列出每個問題的前後圖與改善狀態。"}</p>}
              {!model.loading && canEdit && task === "track" && !model.items.length && <Button title="到「線路 Review」看圖、標記問題" type="button" variant="outline" onClick={() => chooseTask("review")}><ScanSearch aria-hidden="true" />到線路 Review 標記問題</Button>}
              {!model.loading && canEdit && task === "review" && <Button title="記錄一個新問題" type="button" disabled={busy} onClick={newItem}><Plus aria-hidden="true" />新增問題</Button>}
            </div>}
          </section>}
          {task !== "ai" && detailCollapsed && <aside className="circuit-list-rail circuit-detail-rail" aria-label="問題內容已收合"><Button type="button" variant="outline" className="circuit-panel-toggle" aria-label="展開修改內容" title="展開問題內容" aria-expanded={false} aria-controls="circuit-change-detail" onClick={toggleDetail}><PanelRightOpen aria-hidden="true" /><span>展開內容</span></Button></aside>}
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(removeTarget)} onOpenChange={value => { if (!value && !working) setRemoveTarget(null); }}>
      <DialogContent className="circuit-remove-dialog" style={viewportStyle}>
        <DialogTitle>移除這個問題？</DialogTitle>
        <DialogDescription>「{removeTarget && `${number(removeTarget.number)} ${removeTarget.content.title || "未命名問題"}`}」會移出問題清單。已儲存的追蹤紀錄與原圖保留，之後可從「已移除的問題」還原；未儲存的草稿會捨棄。</DialogDescription>
        <div className="circuit-new-set-actions"><Button title="不移除，回到問題" type="button" variant="outline" disabled={busy} onClick={() => setRemoveTarget(null)}>取消</Button><Button title="移出清單；追蹤紀錄與原圖保留，之後可還原" type="button" variant="destructive" disabled={busy || !canEdit || !removeTarget} onClick={() => void run(async () => { await model.deleteItem(removeTarget!.id); setRemoveTarget(null); setMobileDetail(false); })}>確認移除</Button></div>
        {notice && <p role="alert">{notice}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={removedOpen} onOpenChange={setRemovedOpen}>
      <DialogContent className="circuit-removed-dialog" style={viewportStyle}>
        <DialogTitle>已移除的問題</DialogTitle>
        <DialogDescription>追蹤紀錄與原圖仍保留。還原後回到問題清單繼續查看。</DialogDescription>
        <ul className="circuit-removed-list">{(model.removedItems ?? []).map(row => <li key={row.id}><div><strong>{number(row.number)} {row.content.title || "未命名問題"}</strong><span>{row.content.owner || "未指定負責人"}</span></div><Button title="放回問題清單" type="button" variant="outline" disabled={busy || !canEdit} aria-label={`還原問題 ${number(row.number)}`} onClick={() => void run(() => model.restoreItem(row.id))}><ArchiveRestore aria-hidden="true" />還原</Button></li>)}{!model.removedItems?.length && <li className="circuit-removed-empty">沒有已移除的問題</li>}</ul>
        {notice && <p role="alert">{notice}</p>}
        <div className="circuit-new-set-actions"><Button title="關閉這個清單" type="button" variant="outline" onClick={() => setRemovedOpen(false)} disabled={busy}>關閉</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={newSetOpen} onOpenChange={setNewSetOpen}>
      <DialogContent className="circuit-new-set-dialog" style={viewportStyle}>
        <DialogTitle>新增改版清單</DialogTitle>
        <DialogDescription>每次改版（例如 V2 → V3）各用一份問題清單。同一次改版的問題都記在目前這份，不必再新增。</DialogDescription>
        <form onSubmit={submitNewSet}>
          <label>清單名稱<Input aria-label="改版紀錄名稱" autoComplete="off" value={newTitle} maxLength={160} placeholder="例如：E1.S Rev B 線路修正" onChange={event => setNewTitle(event.target.value)} /></label>
          <div className="circuit-new-set-versions">
            <label>修改前版次<Input aria-label="修改前版次" value={fromLabel} maxLength={80} onChange={event => setFromLabel(event.target.value)} /></label>
            <label>修改後版次<Input aria-label="修改後版次" value={toLabel} maxLength={80} placeholder="例如：V2 / Rev B" onChange={event => setToLabel(event.target.value)} /></label>
          </div>
          <p className="circuit-new-set-hint">只整理問題紀錄，不會改動 BOM 或 PDF。建立後名稱與版次目前不能修改，請先確認。</p>
          <div className="circuit-new-set-actions"><Button title="不建立，回到線路修改" type="button" variant="outline" onClick={() => setNewSetOpen(false)} disabled={working}>取消</Button><Button title="建立這份改版清單並切換過去" type="submit" disabled={working || !newTitle.trim()}>建立清單</Button></div>
          {notice && <p role="alert">{notice}</p>}
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent hideCloseButton className="circuit-guide-dialog" style={viewportStyle} data-testid="circuit-usage-guide">
        <header className="circuit-guide-header"><div><DialogTitle>線路修改怎麼用</DialogTitle><DialogDescription>上方四個分頁就是四件事：線路 Review → AI 比對 → 改善追蹤 → 官方版本</DialogDescription></div><Button title="關閉說明，回到線路修改" type="button" variant="ghost" aria-label="關閉使用說明" onClick={() => setGuideOpen(false)}><X aria-hidden="true" /></Button></header>
        <div className="circuit-guide-scroll">
          <ol className="circuit-start-steps">{guideSteps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.text}</p></div></li>)}</ol>
          <section><h3>一個問題怎麼走完？</h3><p>在「線路 Review」標記問題（待改善）→ 畫線路的人在「改善追蹤」寫改善說明、加改好後截圖，按「回報改善」（待確認）→ 主管「確認結案」（已結案），或寫意見「退回重改」（退回重改）。有標題，再加上改善說明或改好後截圖，才能回報改善。</p></section>
          <section><h3>PDF 怎麼用？</h3><p>上傳原理圖 PDF（可拖入，每份 50 MB 內存到雲端，更大的只在這台電腦開啟，不需壓縮）。日期先取檔名裡的日期，沒有就用檔案日期，可在版本清單修改。在頁面上拖曳框選一塊區域，按「加到問題截圖」（改善追蹤裡是「加到改好後截圖」），圖會從 PDF 重新繪製並記下來源版本與頁碼；這個問題的頁碼欄若是空的會自動填入。「畫筆」可直接畫線並自動儲存，「橡皮擦」點掉筆跡；PDF 原圖不變。上傳錯了，打開版本清單按那一份的「刪除」，可在下方「已刪除的 PDF」還原。</p></section>
          <section><h3>貼圖與標記</h3><p>截圖後按 Ctrl+V，圖會加到標示「貼上會加到這裡」的那一格；也可以把檔案拖到想放的那一格。每個問題最多 200 張、每張 50 MB，不需壓縮。點圖片放大，用「位置標記」或「框選」標出位置並寫說明。</p></section>
          <section><h3>AI 比對的限制</h3><p>AI 只看得到兩頁 PDF 的圖像與文字，會列出可見的連接、Net 與名稱差異；每一項由你確認或不採用，結果與人工確認分開保存。PDF 比對不能取代原始 Netlist／ERC 的電氣連通驗證。頁數不同時，在圖面上方調整「官方頁」對應。</p></section>
          <section><h3>匯出與改版清單</h3><p>按右上的「匯出」下載 Excel，包含目前篩選的問題、標註圖片與追蹤紀錄；要匯出全部，先清除篩選。換到下一次改版（例如 V2 → V3）時，從「⋯ 更多」新增改版清單；有兩份以上時，清單上方可以切換。</p></section>
        </div>
        <footer className="circuit-guide-footer"><Button title="關閉說明，回到線路修改" type="button" onClick={() => setGuideOpen(false)}>知道了</Button></footer>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(viewer)} onOpenChange={value => { if (!value) setViewerId(""); }}>
      <DialogContent hideCloseButton className="circuit-image-viewer-dialog" style={viewportStyle}>
        <div className="circuit-image-dialog-heading">
          <DialogTitle title={viewer?.name}>{viewer ? `${CIRCUIT_IMAGE_SIDE_LABELS[viewer.side]} · ${viewer.name}` : "線路圖片"}</DialogTitle>
          <Button title="關閉放大圖，回到問題" type="button" variant="ghost" aria-label="關閉圖片" onClick={() => setViewerId("")}><X aria-hidden="true" /></Button>
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
