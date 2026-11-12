import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Check, ChevronDown, ImagePlus, ChevronLeft, ChevronRight, Crop, Eraser, FileUp, Hand, Link2, Minus, MoveHorizontal, Pencil, PenLine, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Undo2, Unlink, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  circuitPdfCaption, circuitPdfImageName, circuitPdfPageState, circuitPdfProgress, circuitPdfVersionLabel, normalizeCropRect,
  type CircuitCropRect, type CircuitPdfDocument, type CircuitPdfPageState, type CircuitPdfRegistry,
} from "./circuitPdf";
import { circuitPdfPageSize, cropCircuitPdfPage, renderCircuitPdfPage } from "./pdfRender";
import { CIRCUIT_IMAGE_SIDE_LABELS, type CircuitImageSide, type CircuitImageSource } from "./types";
import type { CircuitPdfModel } from "./useCircuitPdfs";
import type { CircuitPdfInkModel } from "./useCircuitPdfInk";
import type { CircuitPdfInkStroke } from "./circuitPdfInk";
import { CircuitPdfInkLayer, type CircuitPdfTool } from "./CircuitPdfInkLayer";
import { useLinkedPdfViews } from "./useLinkedPdfViews";
import { CircuitBusyIcon, CircuitProgress, CircuitSpinner } from "./CircuitFeedback";
import "./circuitPdf.css";

export interface CircuitPdfCapture { side: CircuitImageSide; file: File; source: CircuitImageSource; caption: string; page: number }
export interface CircuitPdfCrop { id: string; side: CircuitImageSide; documentId: string; page: number; rect: CircuitCropRect }
type Pane = "active" | "compare";
interface Selection { pane: Pane; rect: CircuitCropRect }
const SHORT_SIDE: Record<CircuitImageSide, string> = { before: "前", after: "後", reference: "補" };
const STATE_LABEL: Record<CircuitPdfPageState, string> = { here: "在這版看過", older: "在較早的版本看過", none: "還沒看" };
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const isPdf = (file: File) => /\.pdf$/i.test(file.name) || /pdf/i.test(file.type);
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
const finePointer = () => window.matchMedia?.("(pointer: fine)").matches ?? true;
// Narrow layouts keep both independently scrollable sheets visible, one above the other.
const SIDE_BY_SIDE_MIN = 900;

/**
 * The schematic PDF of the board, one page at a time. Dragging on the page frames an area that is added to the change on the
 * right as a sharp picture rendered from the PDF; with an older version beside it, the same area is taken from both dates.
 */
export function CircuitPdfPanel({ onUploaded, mode = "review", captureSide = "before", pageReview = mode === "review", onAiReview, onSetupOfficial, pdfs, ink, canEdit, captureBlocked, targetLabel, pageChanges, crops, onCapture, onSelectChange, versionsOpen, onVersionsOpenChange: setVersionsOpen, versionsOpener, phone = false, phoneContext, onCaptureNew }: {
  /** 線路 Review reads one drawing page by page; AI 比對 shows the two selected versions. */
  mode?: "review" | "ai"; onAiReview?: () => void; onSetupOfficial?: () => void;
  pdfs: CircuitPdfModel; ink?: CircuitPdfInkModel; canEdit: boolean; captureBlocked: string; targetLabel: string;
  pageChanges: Map<number, Array<{ id: string; number: number }>>; crops: CircuitPdfCrop[];
  onCapture: (captures: CircuitPdfCapture[]) => Promise<void>; onSelectChange: (id: string) => void;
  /** Where a framed area goes: 問題截圖 in 線路 Review, 改好後截圖 in 改善追蹤. */
  captureSide?: "before" | "after";
  /** 線路 Review walks the pages (看完，下一頁); elsewhere the page row only turns pages. */
  pageReview?: boolean;
  versionsOpen: boolean; onVersionsOpenChange: (open: boolean) => void; versionsOpener: MutableRefObject<HTMLButtonElement | null>;
  /** Phone layout: tools with words in one bottom row, the way back lives in the window's top bar. */
  phone?: boolean;
  /** Phone: opened from the list (a frame becomes a new problem) or from one problem (a frame is added to it). */
  phoneContext?: "list" | "item";
  onCaptureNew?: (captures: CircuitPdfCapture[], title: string) => Promise<void>;
  /** Called after uploads from this pane: how many went in, and the name when it was one file. */
  onUploaded?: (count: number, name: string) => void;
}) {
  const { active, compare, official, documents, registry, page } = pdfs;
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const [tool, setTool] = useState<CircuitPdfTool>(() => finePointer() ? "crop" : "pan");
  const [inkPane, setInkPane] = useState<Pane>("active");
  const cropMode = tool === "crop" && mode !== "ai";
  // AI 比對 has nothing to frame into, so the crop tool falls back to moving the drawing there.
  useEffect(() => { if (mode === "ai" && tool === "crop") setTool("pan"); }, [mode, tool]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState("");
  const [flash, setFlash] = useState<{ id: number; documentId: string; page: number; rect: CircuitCropRect } | null>(null);
  const [justDone, setJustDone] = useState(0);
  useEffect(() => { if (!flash) return; const timer = setTimeout(() => setFlash(null), 700); return () => clearTimeout(timer); }, [flash]);
  const [newTitle, setNewTitle] = useState("");
  const [titleMissing, setTitleMissing] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const toolRef = useRef(tool); toolRef.current = tool;
  const [failure, setFailure] = useState("");
  const [removing, setRemoving] = useState("");
  const [deleting, setDeleting] = useState("");
  const [officialCandidate, setOfficialCandidate] = useState("");
  const [settingOfficial, setSettingOfficial] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [restoring, setRestoring] = useState("");
  const [restoredName, setRestoredName] = useState("");
  const [pageInput, setPageInput] = useState(String(page));
  const [dropping, setDropping] = useState(false);
  const [stacked, setStacked] = useState(true);
  const sizing = useRef({ stacked, fitScale });
  sizing.current = { stacked, fitScale };
  const fileInput = useRef<HTMLInputElement>(null);
  const localInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const activeViewport = useRef<HTMLDivElement>(null);
  const compareViewport = useRef<HTMLDivElement>(null);
  const linkedViews = useLinkedPdfViews({ activeViewport, compareViewport, resetKey: `${active?.id}:${page}:${compare?.id}:${pdfs.comparePage}` });
  const versions = useRef<HTMLDivElement>(null);
  const versionClose = useRef<HTMLButtonElement>(null);
  const scale = zoom === "fit" ? fitScale : zoom;
  const progress = useMemo(() => active ? circuitPdfProgress(registry, active.id, active.pages) : null, [registry, active]);
  const pageState = active ? circuitPdfPageState(registry, active.id, page) : "none";
  const changesHere = pageChanges.get(page) || [];
  const archived = registry.documents.filter(row => row.removedAt && row.id !== official?.id);
  const workingVersions = documents.filter(row => row.id !== official?.id);
  const compareReady = Boolean(compare && pdfs.comparePdf && pdfs.comparePage > 0);
  const inkRow = inkPane === "compare" && compareReady ? compare : active;
  const inkPage = inkPane === "compare" && compareReady ? pdfs.comparePage : page;
  const targetInk = inkRow ? ink?.pages[`${inkRow.id}:${inkPage}`] || [] : [];
  // Strokes on the page on screen (either side); the eraser only shows when there is something to erase.
  const pageInk = (active ? ink?.pages[`${active.id}:${page}`]?.length || 0 : 0) + (compare && compareReady ? ink?.pages[`${compare.id}:${pdfs.comparePage}`]?.length || 0 : 0);
  const loadInk = ink?.load;
  const activeInkId = active?.id, compareInkId = compare?.id;
  useEffect(() => {
    if (!loadInk) return;
    if (activeInkId) void loadInk(activeInkId, page).catch(() => {});
    if (compareInkId && pdfs.comparePage > 0) void loadInk(compareInkId, pdfs.comparePage).catch(() => {});
  }, [loadInk, activeInkId, page, compareInkId, pdfs.comparePage]);
  useEffect(() => { setInkPane("active"); }, [active?.id, page, compare?.id, pdfs.comparePage]);
  function chooseTool(value: CircuitPdfTool) { setTool(value); setSelection(null); }
  useEffect(() => { setPageInput(String(page)); setSelection(null); stage.current?.scrollTo({ top: 0 }); }, [page, active?.id]);
  useEffect(() => { setSelection(null); }, [compare?.id, pdfs.comparePage]);
  useEffect(() => { if (!captured) return; const timer = setTimeout(() => setCaptured(""), 4000); return () => clearTimeout(timer); }, [captured]);
  // Escape drops the framed area or version menu; closing the workspace stays an explicit action.
  useEffect(() => {
    if (!selection && !versionsOpen && !deleting) return;
    const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.stopPropagation(); event.preventDefault(); setSelection(null); if (versionsOpen) closeVersions(); setDeleting(""); setRemoving(""); };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [selection, versionsOpen, deleting]);
  useEffect(() => {
    if (!versionsOpen) return;
    setRestoredName("");
    versionClose.current?.focus();
    const outside = (event: PointerEvent) => { if (!versions.current?.contains(event.target as Node) && !(event.target as Element | null)?.closest?.(".circuit-phone-back")) setVersionsOpen(false); };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [versionsOpen]);

  function closeVersions() { setVersionsOpen(false); versionsOpener.current?.focus(); }

  // "Fit width" follows the space the page has, which changes with the dialog and with the comparison pane.
  useLayoutEffect(() => {
    const element = stage.current, pdf = pdfs.activePdf;
    if (!element || !pdf || !active) return;
    let current = true, width = 0;
    const measure = async () => {
      const size = await circuitPdfPageSize(pdf, Math.min(page, pdf.numPages)).catch(() => null);
      if (!current || !size) return;
      const sideBySide = Boolean(compare) && element.clientWidth >= SIDE_BY_SIDE_MIN;
      const panes = sideBySide ? 2 : 1, available = (element.clientWidth - 24 - (panes - 1) * 12) / panes;
      const nextScale = Math.max(0.1, Math.min(4, available / size.width));
      if (sizing.current.stacked !== !sideBySide || sizing.current.fitScale !== nextScale) {
        linkedViews.beforeResize();
        setStacked(!sideBySide);
        setFitScale(nextScale);
      }
    };
    const observer = new ResizeObserver(entries => { const next = Math.round(entries[0].contentRect.width); if (next !== width) { width = next; void measure(); } });
    observer.observe(element);
    return () => { current = false; observer.disconnect(); };
  }, [pdfs.activePdf, active?.id, compare?.id, page]);
  const layoutKey = `${stacked}:${fitScale}`;
  const previousLayout = useRef(layoutKey);
  useLayoutEffect(() => {
    const changed = previousLayout.current !== layoutKey;
    previousLayout.current = layoutKey;
    // At a fixed zoom, resizing the panes does not redraw the PDF or change its canvas size.
    if (changed && zoom !== "fit") {
      linkedViews.afterResize("active");
      linkedViews.afterResize("compare");
    }
  }, [layoutKey, zoom, linkedViews.afterResize]);
  // Ctrl + wheel zooms the page instead of the browser.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(step(scale, event.deltaY < 0 ? 1 : -1));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [fitScale, zoom]);

  // Two fingers on the drawing zoom it (a phone has no Ctrl + wheel). The page is stretched as a picture while the fingers
  // move and drawn sharp once at the new size when they lift.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let start = 0, ratio = 1, pages: HTMLElement | null = null;
    const spread = (event: TouchEvent) => Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
    const begin = (event: TouchEvent) => {
      if (event.touches.length !== 2 || toolRef.current === "pen" || toolRef.current === "erase") return;
      start = spread(event); ratio = 1; pages = element.querySelector<HTMLElement>(".circuit-pdf-pages");
      if (pages) { const box = pages.getBoundingClientRect(); pages.style.transformOrigin = `${(event.touches[0].clientX + event.touches[1].clientX) / 2 - box.left}px ${(event.touches[0].clientY + event.touches[1].clientY) / 2 - box.top}px`; }
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      ratio = Math.max(0.1 / scale, Math.min(4 / scale, spread(event) / start));
      if (pages) pages.style.transform = `scale(${ratio})`;
    };
    const end = () => {
      if (!start) return;
      start = 0;
      if (pages) { pages.style.transform = ""; pages.style.transformOrigin = ""; }
      if (Math.abs(ratio - 1) > 0.05) changeZoom(Math.round(scale * ratio * 100) / 100);
    };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end); element.addEventListener("touchcancel", end);
    return () => { element.removeEventListener("touchstart", begin); element.removeEventListener("touchmove", move); element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", end); };
  }, [scale, fitScale, zoom, active?.id]);

  function changeZoom(value: number | "fit") {
    const nextScale = value === "fit" ? fitScale : value;
    if (nextScale !== scale) linkedViews.beforeResize();
    setZoom(value);
  }

  function step(value: number, direction: 1 | -1) {
    const index = ZOOM_STEPS.findIndex(entry => entry >= value - 0.001);
    const at = index < 0 ? ZOOM_STEPS.length - 1 : index;
    return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, direction > 0 ? (ZOOM_STEPS[at] > value + 0.001 ? at : at + 1) : at - 1))];
  }
  function chooseFiles(files: File[]) {
    const pdfFiles = files.filter(isPdf);
    if (!pdfFiles.length) { setFailure("請選擇 PDF 檔案。"); return; }
    setFailure("");
    // On a phone the upload button is inside the PDF list, which covers the drawing: close it to show the new PDF.
    if (phone) setVersionsOpen(false);
    void (async () => {
      let done = 0;
      for (const file of pdfFiles) { try { await pdfs.upload(file); done += 1; } catch { /* the message row says why */ } }
      onUploaded?.(done, pdfFiles.length === 1 ? pdfFiles[0].name : "");
    })();
  }
  function drop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault(); event.stopPropagation(); setDropping(false);
    if (canEdit) chooseFiles(Array.from(event.dataTransfer.files));
  }
  function finishPage() {
    if (!active) return;
    if (canEdit) { pdfs.setChecked(page, true); setJustDone(page); }
    if (page < active.pages) pdfs.goTo(page + 1);
  }
  function removePdf(id: string) {
    setRemoving(""); setDeleting("");
    void pdfs.removeDocument(id).catch(error => setFailure(error instanceof Error ? error.message : "刪除失敗，請重試。"));
  }
  async function pinOfficial(id: string) {
    setSettingOfficial(true); setFailure("");
    try { await pdfs.setOfficial(id); setOfficialCandidate(""); }
    catch (error) { setFailure(error instanceof Error ? error.message : "官方版本尚未儲存，請重試。"); }
    finally { setSettingOfficial(false); }
  }
  async function restorePdf(row: CircuitPdfDocument) {
    setRestoring(row.id); setRestoredName(""); setFailure("");
    try { await pdfs.restoreDocument(row.id); setRestoredName(row.name); }
    catch (error) { setFailure(error instanceof Error ? error.message : "還原失敗，請重試。"); }
    finally { setRestoring(""); }
  }
  async function capture(sides: Array<{ pane: Pane; side: CircuitImageSide }>, asNew = false) {
    if (!selection || capturing || (!asNew && captureBlocked)) return;
    if (asNew && !newTitle.trim()) { setTitleMissing(true); titleInput.current?.focus(); return; }
    if (ink?.loading) { setFailure("畫筆標註載入中，請稍後再截圖。"); return; }
    if (sides.some(side => side.pane === "compare") && !compareReady) { setFailure("請先指定有效的基準對應頁，再加入修改前截圖。"); return; }
    setCapturing(true); setFailure("");
    try {
      const captures: CircuitPdfCapture[] = [];
      for (const { pane, side } of sides) {
        const row = pane === "compare" ? compare : active, pdf = pane === "compare" ? pdfs.comparePdf : pdfs.activePdf;
        const pageNumber = pane === "compare" ? pdfs.comparePage : page;
        if (!row || !pdf) continue;
        const output = await cropCircuitPdfPage(pdf, pageNumber, selection.rect, 2400, ink?.pages[`${row.id}:${pageNumber}`] || []);
        const name = circuitPdfImageName(row, pageNumber, CIRCUIT_IMAGE_SIDE_LABELS[side]);
        captures.push({ side, page: pageNumber, caption: circuitPdfCaption(row, pageNumber), file: new File([output.blob], name, { type: "image/png", lastModified: Date.now() }),
          source: { kind: "pdf", documentId: row.id, name: row.name, date: row.date, label: row.label, page: pageNumber, rect: selection.rect } });
      }
      if (asNew && onCaptureNew) { await onCaptureNew(captures, newTitle); setCaptured(`已記下新問題「${newTitle.trim()}」（第 ${page} 頁）`); setNewTitle(""); }
      else {
        await onCapture(captures);
        setCaptured(`已加到 ${targetLabel} 的${captures.map(item => CIRCUIT_IMAGE_SIDE_LABELS[item.side]).join("與")}（第 ${captures.map(item => item.page).filter((value, index, all) => all.indexOf(value) === index).join("、")} 頁）`);
      }
      if (captures[0]) setFlash({ id: Date.now(), documentId: captures[0].source.documentId, page: captures[0].page, rect: captures[0].source.rect });
      setSelection(null); setTitleMissing(false);
      if (phone) setTool("pan");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "截圖加入失敗，請重試。");
    } finally { setCapturing(false); }
  }

  const hiddenInputs = <>
    <input ref={fileInput} type="file" accept=".pdf,application/pdf" multiple className="sr-only" aria-label="選擇原理圖 PDF" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; chooseFiles(files); }} />
    <input ref={localInput} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="選擇本機 PDF 原檔" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pdfs.openLocal(file).catch(error => setFailure(error instanceof Error ? error.message : "PDF 無法開啟。")); }} />
  </>;
  const message = failure || pdfs.error;
  const aiReady = Boolean(compare && pdfs.comparePdf && active && pdfs.activePdf && !pdfs.opening);
  const comparePageLabel = compare?.id === official?.id ? "官方對應頁" : "基準對應頁";
  const aiFileLabel = (row: CircuitPdfDocument) => `${row.id === official?.id ? "官方 · " : ""}${circuitPdfVersionLabel(row)} · ${row.name}${row.localOnly ? " · 本機" : ""}`;
  const aiRun = <Button data-circuit-tone="ai" data-fill="solid" type="button" className="circuit-pdf-ai-run" disabled={!aiReady || !onAiReview} title={aiReady ? "查看這兩份 PDF 的比對選項" : "選好兩份 PDF，等圖面開啟即可比對"} onClick={onAiReview}><Sparkles aria-hidden="true" />AI 比對新舊版</Button>;
  const aiBar = mode === "ai" ? <div className="circuit-pdf-ai-bar circuit-pdf-ai-pair" role="group" aria-label="選擇 AI 比對版本" data-testid="circuit-pdf-ai-bar">
    <label data-side="old"><strong>{phone ? "基準版（上）" : "基準版（左）"}</strong><select aria-label="選擇基準版 PDF" title={compare ? aiFileLabel(compare) : undefined} value={compare?.id || ""} disabled={documents.length < 2}
      onChange={event => { setFailure(""); pdfs.setCompare(event.target.value); }}>
      <option value="" disabled>選擇基準版</option>
      {documents.map(row => <option key={row.id} value={row.id} disabled={row.id === active?.id}>{aiFileLabel(row)}</option>)}
    </select></label>
    <Button type="button" variant="outline" className="circuit-pdf-swap" aria-label="交換左右版本" title="交換左右版本及對應頁" disabled={!active || !compare} onClick={() => { setFailure(""); pdfs.swapComparison(); }}><MoveHorizontal aria-hidden="true" /><span className="circuit-phone-word">交換</span></Button>
    <label data-side="new"><strong>{phone ? "比對版（下）" : "比對版（右）"}</strong><select aria-label="選擇比對版 PDF" title={active ? aiFileLabel(active) : undefined} value={active?.id || ""} disabled={!documents.length}
      onChange={event => { setFailure(""); pdfs.select(event.target.value); }}>
      <option value="" disabled>選擇比對版</option>
      {documents.map(row => <option key={row.id} value={row.id} disabled={row.id === compare?.id}>{aiFileLabel(row)}</option>)}
    </select></label>
    {!(phone && documents.length >= 2) && <div className="circuit-pdf-ai-pair-actions">
      {canEdit && <Button data-circuit-tone="add" type="button" variant="outline" title="上傳原理圖 PDF，也可把檔案拖到圖面區" disabled={Boolean(pdfs.uploading)} aria-busy={Boolean(pdfs.uploading) || undefined} onClick={() => fileInput.current?.click()}><CircuitBusyIcon busy={Boolean(pdfs.uploading)}><Upload /></CircuitBusyIcon>{pdfs.uploading ? "上傳中…" : "上傳 PDF"}</Button>}
      {!phone && aiRun}
    </div>}
  </div> : null;
  const sideWord = captureSide === "after" ? "改好後截圖" : "問題截圖";

  if (!documents.length && !archived.length && !versionsOpen && mode !== "ai") {
    return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping}
      onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}>
      {hiddenInputs}
      {message && <p className="circuit-pdf-message" role="alert">{message}</p>}
      {pdfs.loading ? <p className="circuit-pdf-empty-note">正在讀取 PDF 清單…</p>
        : pdfs.uploading ? <p className="circuit-pdf-empty-note" role="status"><span className="circuit-wait-line"><CircuitSpinner />正在上傳「{pdfs.uploading}」…</span><CircuitProgress /></p>
        : canEdit ? <button title="選擇原理圖 PDF 上傳（也可以拖進來）" type="button" className="circuit-pdf-empty" onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden="true" />
          <strong>上傳 PDF</strong>
          <span>{phone ? "每次上傳記為一個日期版本。逐頁看，看到問題就截圖記下來。" : "每次上傳記為一個日期版本。逐頁看，看到問題就在頁面上截圖，加到右邊的問題截圖。"}</span>
          <small>{phone ? "每份 50 MB 內存到雲端，更大的只在這台裝置開啟，不需壓縮。" : "也可以把 PDF 拖到這裡；每份 50 MB 內存到雲端，更大的只在這台電腦開啟，不需壓縮。"}</small>
        </button>
        : <p className="circuit-pdf-empty-note">這塊板子還沒有上傳原理圖 PDF；有編輯權限的同仁上傳後，這裡會顯示每一頁。</p>}
    </section>;
  }

  const finish = (className: string) => canEdit && active && pageReview ? <div className={className}>
    {pageState === "here"
      ? <><Button data-circuit-tone="done" type="button" variant="outline" className="circuit-pdf-seen" aria-pressed="true" title="這一頁已標記看過；按一下取消" data-just={justDone === page || undefined} onClick={() => { setJustDone(0); pdfs.setChecked(page, false); }}><Check aria-hidden="true" />已看過</Button>
        {page < active.pages && <Button data-circuit-tone="view" data-fill="solid" type="button" title="翻到下一頁（→）" onClick={() => pdfs.goTo(page + 1)}>下一頁<ChevronRight aria-hidden="true" /></Button>}</>
      : <Button data-circuit-tone="view" data-fill="solid" type="button" onClick={finishPage} title={pageState === "older" ? "這頁在較早的版本看過；標記這一版也看過並翻到下一頁" : "標記本頁看過並翻到下一頁"}><Check aria-hidden="true" />{page < active.pages ? "看完，下一頁" : "看完本頁"}</Button>}
  </div> : null;
  // Phone: the one bottom row. It holds what the hand is doing now, every button with its word.
  const quickNew = phone && phoneContext === "list" && Boolean(onCaptureNew);
  const phoneCrop = mode !== "ai" && canEdit && (quickNew || phoneContext === "item");
  const penOn = tool === "pen" || tool === "erase";
  const phoneNext = !active ? null : pageReview && canEdit && pageState !== "here"
    ? <Button data-circuit-tone="view" data-fill="solid" type="button" className="circuit-pdf-phone-next" onClick={finishPage} title={pageState === "older" ? "這頁在較早的版本看過；標記這一版也看過並翻到下一頁" : "標記本頁看過並翻到下一頁"}><Check aria-hidden="true" /><span>{page < active.pages ? "看完，下一頁" : "看完本頁"}</span></Button>
    : <Button data-circuit-tone="view" type="button" variant="outline" className="circuit-pdf-phone-next" aria-label="下一頁" title="翻到下一頁" disabled={page >= active.pages} onClick={() => pdfs.goTo(page + 1)}><span>下一頁</span><ChevronRight aria-hidden="true" /></Button>;
  const barState = selection ? (quickNew ? "new" : "capture") : cropMode ? "crop" : penOn ? "pen" : "page";
  const phoneBar = phone && active ? <div className="circuit-pdf-phone-bar" data-state={barState} role={selection ? "group" : undefined} aria-label={selection ? "加入截圖" : undefined}>
    {pdfs.uploading && <p className="circuit-pdf-phone-note" role="status" data-waiting><CircuitSpinner /><span>正在上傳「{pdfs.uploading}」…</span><CircuitProgress /></p>}
    {captured && !selection && <p className="circuit-pdf-phone-note" role="status"><Check aria-hidden="true" /><span>{captured}</span></p>}
    <div key={barState} className="circuit-pdf-phone-mode">
    {selection ? (quickNew
      ? <form className="circuit-pdf-phone-new" aria-label="記成新問題" onSubmit={event => { event.preventDefault(); void capture([{ pane: selection.pane, side: "before" }], true); }}>
        <label><span>這是什麼問題？<em>必填</em></span><input ref={titleInput} aria-label="新問題的標題" value={newTitle} maxLength={200} enterKeyHint="done" autoComplete="off" placeholder="例如：R2301 阻值錯誤" onChange={event => { setNewTitle(event.target.value); setTitleMissing(false); }} /></label>
        {titleMissing && <p role="alert">先寫標題，之後才認得這張截圖是什麼問題。</p>}
        <div className="circuit-pdf-phone-row"><Button title="不截這一塊" type="button" variant="outline" disabled={capturing} onClick={() => setSelection(null)}>取消截圖</Button><Button data-circuit-tone="add" data-fill="solid" title="用這張截圖和標題記成一個新問題，之後在問題清單補其他欄位" type="submit" disabled={capturing} aria-busy={capturing || undefined}><CircuitBusyIcon busy={capturing}><Check /></CircuitBusyIcon>{capturing ? "正在記下…" : "記下問題"}</Button></div>
      </form>
      : <><p className="circuit-pdf-phone-hint">{captureBlocked || <>截圖加到 <strong>{targetLabel}</strong></>}</p>
        <div className="circuit-pdf-phone-row"><Button title="不截這一塊" type="button" variant="outline" disabled={capturing} onClick={() => setSelection(null)}>取消截圖</Button><Button data-circuit-tone="add" data-fill="solid" title={`把框出的範圍加到這個問題的${sideWord}`} type="button" disabled={capturing || Boolean(captureBlocked)} aria-busy={capturing || undefined} onClick={() => void capture([{ pane: selection.pane, side: captureSide }])}><CircuitBusyIcon busy={capturing}><ImagePlus /></CircuitBusyIcon>{capturing ? "正在加入…" : `加到${sideWord}`}</Button></div></>)
    : cropMode ? <><p className="circuit-pdf-phone-hint">用手指在圖上拖出要截的範圍</p>
      <div className="circuit-pdf-phone-row"><Button title="不截圖，回到移動圖面" type="button" variant="outline" onClick={() => chooseTool("pan")}>取消截圖</Button></div></>
    : penOn ? <><p className="circuit-pdf-phone-hint">{tool === "erase" ? "點一下筆跡就擦掉" : "用手指在圖上畫，放開就自動儲存"}</p>
      <div className="circuit-pdf-phone-row">
        {pageInk > 0 && <Button type="button" variant="outline" aria-label="橡皮擦" title="點選筆跡即可擦除；不會更動 PDF 原圖" aria-pressed={tool === "erase"} onClick={() => chooseTool(tool === "erase" ? "pen" : "erase")}><Eraser aria-hidden="true" /><span>橡皮擦</span></Button>}
        {targetInk.length > 0 && <Button type="button" variant="outline" aria-label="撤回最後一筆畫筆" title="撤回最後一筆" onClick={() => { if (inkRow) ink?.undo(inkRow.id, inkPage); }}><Undo2 aria-hidden="true" /><span>撤回</span></Button>}
        <Button data-circuit-tone="done" data-fill="solid" title="收起畫筆，回到移動圖面" type="button" onClick={() => chooseTool("pan")}><Check aria-hidden="true" /><span>畫完了</span></Button>
      </div></>
    : <div className="circuit-pdf-phone-row" role="toolbar" aria-label="圖面可以做的事">
      <Button type="button" variant="outline" className="circuit-pdf-phone-tool" aria-label="上一頁" title="翻到上一頁" disabled={page <= 1} onClick={() => pdfs.goTo(page - 1)}><ChevronLeft aria-hidden="true" /><span>上一頁</span></Button>
      {mode === "ai" ? aiRun : <>
        {phoneCrop && <Button data-circuit-tone="add" type="button" variant="outline" className="circuit-pdf-phone-tool" aria-label="截圖" title={quickNew ? "在圖上拖出有問題的地方，當場記成一個新問題" : `在圖上拖出一塊，加到${sideWord}`} onClick={() => chooseTool("crop")}><Crop aria-hidden="true" /><span>截圖</span></Button>}
        {canEdit && ink && <Button type="button" variant="outline" className="circuit-pdf-phone-tool" aria-label="畫筆" title="直接在圖面畫線，放開後自動儲存" disabled={ink.loading || !pdfs.activePdf || pdfs.opening} onClick={() => chooseTool("pen")}><PenLine aria-hidden="true" /><span>畫筆</span></Button>}
      </>}
      {phoneNext}
    </div>}
    </div>
  </div> : null;
  if (mode === "ai" && documents.length < 2) {
    return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping}
      onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}>
      {hiddenInputs}
      {aiBar}
      {message && <p className="circuit-pdf-message" role="alert"><span>{message}</span><Button type="button" variant="ghost" aria-label="關閉訊息" title="關閉這則訊息" onClick={() => { setFailure(""); pdfs.clearError(); }}><X aria-hidden="true" /></Button></p>}
      <div className="circuit-pdf-ai-guide" role="region" aria-label="AI 比對怎麼用">
        <h3>AI 比對要兩份 PDF</h3>
        <p>{pdfs.loading ? "正在讀取 PDF 清單…" : canEdit ? (phone ? "按上面的「上傳 PDF」加入兩份原理圖 PDF，再分別選擇基準版和比對版。" : "上傳或拖入原理圖 PDF，再分別選擇左側基準版和右側比對版。") : "請有編輯權限的同仁上傳兩份原理圖 PDF。"}</p>
      </div>
    </section>;
  }
  return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping} data-compare={Boolean(compare)}
    onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}
    onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,.circuit-pdf-version-list")) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); pdfs.goTo(page - 1); }
      else if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); pdfs.goTo(page + 1); }
    }}>
    {hiddenInputs}
    {aiBar}
    <div className="circuit-pdf-toolbar">
      <div className="circuit-pdf-row" role="toolbar" aria-label="PDF 工具列">
        <div className="circuit-pdf-tool-group" data-group="version" hidden={mode === "ai"}>
        <div className="circuit-pdf-versions" ref={versions} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && !(event.relatedTarget as Element).closest?.(".circuit-phone-back")) setVersionsOpen(false); }}>
          <Button type="button" variant="outline" className="circuit-pdf-version-button" aria-label="選擇 PDF" aria-expanded={versionsOpen} title={active ? `${active.name} · ${active.pages} 頁；點這裡打開 PDF 清單` : "打開 PDF 清單"} onClick={event => { versionsOpener.current = event.currentTarget; setVersionsOpen(!versionsOpen); }}>
            <span>{active ? active.id === official?.id ? "官方版本" : circuitPdfVersionLabel(active) : "PDF"}</span><small>{active ? active.id === official?.id ? `${circuitPdfVersionLabel(active)} · ${active.name}` : active.name : "管理與還原"}</small><ChevronDown aria-hidden="true" />
          </Button>
          {versionsOpen && <div id="circuit-pdf-version-manager" className="circuit-pdf-version-list" role="group" aria-label="PDF 清單（依圖面日期）">
            <header><div><strong>PDF 清單</strong><span>選要看的 PDF；刪除的可以在最下面還原。</span></div><Button title="關閉 PDF 清單" ref={versionClose} type="button" variant="ghost" aria-label="關閉 PDF 清單" onClick={closeVersions}><X aria-hidden="true" /></Button></header>
            <div className="circuit-pdf-version-body">
              {phone && canEdit && <Button data-circuit-tone="add" data-fill="solid" type="button" className="circuit-pdf-phone-upload" title="上傳一份新的 PDF；舊的 PDF 與官方版本都保留" disabled={Boolean(pdfs.uploading)} aria-busy={Boolean(pdfs.uploading) || undefined} onClick={() => fileInput.current?.click()}><CircuitBusyIcon busy={Boolean(pdfs.uploading)}><Upload /></CircuitBusyIcon>{pdfs.uploading ? "上傳中…" : "上傳 PDF"}</Button>}
              {message && <p className="circuit-pdf-version-feedback" role="alert">{message}</p>}
              {restoredName && <p className="circuit-pdf-version-feedback" role="status"><Check aria-hidden="true" /><span>已還原「{restoredName}」，在「其他 PDF」可以開啟。</span></p>}
              <section className="circuit-pdf-baseline-section" aria-label="官方版本版本">
                <h3><ShieldCheck aria-hidden="true" />官方版本<span>AI 比對預設基準</span></h3>
                {official ? <><ul><VersionRow row={official} active={official.id === active?.id} official canEdit={false} removing={false} confirmingOfficial={false} settingOfficial={false}
                  onOpen={() => { pdfs.select(official.id); closeVersions(); }} onUpdate={() => {}} onAskRemove={() => {}} onRemove={() => {}} onAskOfficial={() => {}} onSetOfficial={() => {}} /></ul><p>要更換官方版本，到上方的「官方版本」分頁。</p></>
                  : <p>尚未指定。{onSetupOfficial && <Button data-circuit-tone="official" type="button" variant="outline" title="到「官方版本」分頁設定此系列的官方圖面" onClick={() => { closeVersions(); onSetupOfficial(); }}><ShieldCheck aria-hidden="true" />到官方版本設定</Button>}</p>}
              </section>
              <section className="circuit-pdf-working-section" aria-label="其他 PDF">
                <header><h3>其他 PDF<span>{workingVersions.length}</span></h3></header>
                {workingVersions.length ? <ul>{workingVersions.map(row => <VersionRow key={row.id} row={row} active={row.id === active?.id} canEdit={canEdit} removing={removing === row.id}
                  onOpen={() => { pdfs.select(row.id); closeVersions(); }} onUpdate={patch => pdfs.updateDocument(row.id, patch)} onAskRemove={value => setRemoving(value ? row.id : "")}
                  official={false} confirmingOfficial={officialCandidate === row.id} settingOfficial={settingOfficial} onAskOfficial={value => setOfficialCandidate(value ? row.id : "")} onSetOfficial={() => void pinOfficial(row.id)}
                  onRemove={() => removePdf(row.id)} />)}</ul>
                  : <div className="circuit-pdf-working-empty"><FileUp aria-hidden="true" /><strong>沒有其他 PDF</strong><p>{phone ? "按上面的「上傳 PDF」加入畫好的新版，或還原下方已刪除的 PDF。" : "用工具列的「上傳 PDF」加入畫好的新版，或還原下方已刪除的 PDF。"}</p></div>}
              </section>
              {archived.length > 0 && <section className="circuit-pdf-archived-section"><button type="button" title="顯示或收起可以還原的已刪除 PDF" className="circuit-pdf-archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(value => !value)}><span>已刪除的 PDF<span>{archived.length}</span></span><ChevronDown aria-hidden="true" /></button>{showArchived && <><p>還原後回到上面的「其他 PDF」，不會切換目前開啟的圖面。</p><ul>{archived.map(row => <li key={row.id}><div><strong title={row.name}>{row.name}</strong><small>{circuitPdfVersionLabel(row)} · {row.pages} 頁</small></div>{canEdit && <Button data-circuit-tone="done" type="button" title="把這份 PDF 放回「其他 PDF」" variant="outline" disabled={Boolean(restoring)} aria-label={`還原 PDF：${row.name}`} onClick={() => void restorePdf(row)}><RotateCcw aria-hidden="true" />{restoring === row.id ? "還原中…" : "還原"}</Button>}</li>)}</ul></>}</section>}
            </div>
          </div>}
        </div>
        </div>
        {canEdit && mode !== "ai" && !phone && <div className="circuit-pdf-tool-group" data-group="files">
        <Button data-circuit-tone="add" type="button" variant="outline" aria-label="上傳 PDF" title={pdfs.uploading ? `正在上傳 ${pdfs.uploading}` : "上傳一份新的 PDF；舊的 PDF 與官方版本都保留"} disabled={Boolean(pdfs.uploading)} aria-busy={Boolean(pdfs.uploading) || undefined} onClick={() => fileInput.current?.click()}><CircuitBusyIcon busy={Boolean(pdfs.uploading)}><Upload /></CircuitBusyIcon><span className="circuit-pdf-tool-text">上傳 PDF</span></Button>
        </div>}
        {active && <>{!phone && <div className="circuit-pdf-tool-group" data-group="draw" role="group" aria-label="標註工具">
          <Button type="button" variant="ghost" aria-label="移動" title="移動圖面；也可按住空白鍵拖曳" aria-pressed={tool === "pan"} onClick={() => chooseTool("pan")}><Hand aria-hidden="true" /><span className="circuit-pdf-tool-text">移動</span></Button>
          {mode !== "ai" && <Button type="button" variant="ghost" className="circuit-pdf-crop-toggle" aria-label="截圖" title={`截圖：在圖面上拖曳框出一塊，加到${sideWord}`} aria-pressed={cropMode} onClick={() => chooseTool("crop")}><Crop aria-hidden="true" /><span className="circuit-pdf-tool-text">截圖</span></Button>}
          {canEdit && ink && <Button type="button" variant="ghost" aria-label="畫筆" title="畫筆：直接在圖面畫線，放開後自動儲存" aria-pressed={tool === "pen"} disabled={!canEdit || !ink || ink.loading || !pdfs.activePdf || pdfs.opening} onClick={() => chooseTool("pen")}><PenLine aria-hidden="true" /><span className="circuit-pdf-tool-text">畫筆</span></Button>}
          {canEdit && ink && pageInk > 0 && <Button type="button" variant="ghost" aria-label="橡皮擦" title="點選筆跡即可擦除；不會更動 PDF 原圖" aria-pressed={tool === "erase"} disabled={!canEdit || !ink || ink.loading || !pdfs.activePdf || pdfs.opening} onClick={() => chooseTool("erase")}><Eraser aria-hidden="true" /></Button>}
          {canEdit && ink && targetInk.length > 0 && <Button type="button" variant="ghost" aria-label="撤回最後一筆畫筆" title="撤回最後操作圖面上的最後一筆畫筆" disabled={!canEdit || !ink || !targetInk.length} onClick={() => { if (inkRow) ink?.undo(inkRow.id, inkPage); }}><Undo2 aria-hidden="true" /></Button>}
        </div>}
        <div className="circuit-pdf-tool-group" data-group="zoom"><div className="circuit-pdf-zoom" role="group" aria-label="縮放">
          <Button title="縮小（也可以按住 Ctrl 滾滑鼠滾輪）" type="button" variant="ghost" aria-label="縮小" onClick={() => changeZoom(step(scale, -1))}><Minus aria-hidden="true" /></Button>
          {phone ? <Button type="button" variant={zoom === "fit" ? "secondary" : "ghost"} className="circuit-pdf-zoom-fit" aria-label="符合寬度" title="點一下縮放到剛好符合螢幕寬度；也可以用兩指縮放" aria-pressed={zoom === "fit"} onClick={() => changeZoom("fit")}>{Math.round(scale * 100)}%</Button> : <span aria-live="polite">{Math.round(scale * 100)}%</span>}
          <Button title="放大（也可以按住 Ctrl 滾滑鼠滾輪）" type="button" variant="ghost" aria-label="放大" onClick={() => changeZoom(step(scale, 1))}><Plus aria-hidden="true" /></Button>
          {!phone && <Button type="button" variant={zoom === "fit" ? "secondary" : "ghost"} aria-label="符合寬度" title="縮放到剛好符合面板寬度" aria-pressed={zoom === "fit"} onClick={() => changeZoom("fit")}><MoveHorizontal aria-hidden="true" /></Button>}
        </div></div></>}
        {compare && <div className="circuit-pdf-tool-group" data-group="link"><Button data-circuit-tone="view" type="button" variant="outline" className="circuit-pdf-link-toggle" aria-label="連動檢視" aria-pressed={linkedViews.linked} disabled={!compareReady}
        title={linkedViews.linked ? "移動任一圖面，另一邊跟隨。需要重新對齊時，先關閉連動。" : "各自移到對應位置，再開啟連動，即可保留目前對齊位置。"} onClick={linkedViews.toggleLinked}>
        {linkedViews.linked ? <Link2 aria-hidden="true" /> : <Unlink aria-hidden="true" />}<span>{linkedViews.linked ? "連動中" : "各自移動"}</span>
      </Button></div>}
        {!phone && ink && active && (targetInk.length > 0 || ink.error || ink.loading || ink.saving) && <span className="circuit-pdf-ink-status" role="status" title="筆跡依版本與頁碼自動儲存，截圖時會一併加入">
          {ink.error ? "標註未儲存" : ink.loading ? "載入標註…" : ink.saving ? "儲存標註…" : `${targetInk.length} 筆標註`}
        </span>}
      </div>
    </div>
    {ink?.error && !versionsOpen && <p className="circuit-pdf-message" role="alert"><span>{ink.error}</span><Button type="button" variant="ghost" aria-label="重試儲存畫筆標註" title="重新連線並儲存本機保留的筆跡" onClick={() => void ink.retry().catch(() => {})}><RotateCcw aria-hidden="true" /></Button></p>}
    {active && <div className="circuit-pdf-overview">
      <div className="circuit-pdf-pager" role="group" aria-label="翻頁">
        {mode === "ai" && <span className="circuit-pdf-pager-name">比對版</span>}
        {!phone && <Button type="button" variant="ghost" aria-label="上一頁" title="上一頁（←）" disabled={page <= 1} onClick={() => pdfs.goTo(page - 1)}><ChevronLeft aria-hidden="true" /></Button>}
        <label><span className="sr-only">頁碼</span><input aria-label="目前頁碼" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => { pdfs.goTo(Number(pageInput) || page); setPageInput(String(page)); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); pdfs.goTo(Number(pageInput) || page); } }} /></label>
        <span>/ {active.pages}{phone ? " 頁" : ""}</span>
        {!phone && !(pageReview && canEdit) && <Button type="button" variant="ghost" aria-label="下一頁" title="下一頁（→）" disabled={page >= active.pages} onClick={() => pdfs.goTo(page + 1)}><ChevronRight aria-hidden="true" /></Button>}
      </div>
      {mode === "ai" && compare && <div className="circuit-pdf-offset" role="group" aria-label={`調整${comparePageLabel}`} title="兩份 PDF 頁數不同時，調整左邊要對到第幾頁">
        <label>{comparePageLabel}<input type="number" aria-label={comparePageLabel} placeholder="頁碼" min={1} max={compare.pages} value={pdfs.comparePage || ""} onChange={event => { const target = Number(event.target.value); if (Number.isInteger(target) && target >= 1 && target <= compare.pages) pdfs.setCompareOffset(target - page); }} /></label>
        <Button title="讓左邊對照的頁碼往前一頁" type="button" variant="ghost" aria-label={`${comparePageLabel}往前一頁`} disabled={pdfs.comparePage <= 1} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset - 1)}><Minus aria-hidden="true" /></Button>
        <Button title="讓左邊對照的頁碼往後一頁" type="button" variant="ghost" aria-label={`${comparePageLabel}往後一頁`} disabled={!pdfs.comparePage || pdfs.comparePage >= compare.pages} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset + 1)}><Plus aria-hidden="true" /></Button>
      </div>}
      {mode === "ai" && compare && !pdfs.comparePage && <small className="circuit-pdf-page-warning" role="status">請輸入{comparePageLabel}</small>}
      {pageReview && progress && !phone && <span className="circuit-pdf-progress" title={`這版看過 ${progress.here} 頁；較早版本看過 ${progress.older} 頁`}>
        已看 {progress.checked} / {progress.total} 頁
      </span>}
      {phone && pageReview && canEdit && pageState === "here" && <Button data-circuit-tone="done" type="button" variant="outline" className="circuit-pdf-seen" aria-pressed="true" title="這一頁已標記看過；按一下取消" data-just={justDone === page || undefined} onClick={() => { setJustDone(0); pdfs.setChecked(page, false); }}><Check aria-hidden="true" />已看過</Button>}
      <PageStrip registry={registry} documentId={active.id} pages={active.pages} current={page} justDone={justDone} pageChanges={pageChanges} onPage={pdfs.goTo} />
      {mode !== "ai" && changesHere.length > 0 && phoneContext !== "item" && <div className="circuit-pdf-page-changes" role="group" aria-label="本頁的問題">
        <span>本頁問題</span>{changesHere.map(change => <button title={`打開這一頁的問題 #${String(change.number).padStart(3, "0")}`} type="button" key={change.id} onClick={() => onSelectChange(change.id)}>#{String(change.number).padStart(3, "0")}</button>)}
      </div>}
      {!phone && finish("circuit-pdf-finish circuit-pdf-finish-toolbar")}
    </div>}
    {message && !versionsOpen && <p className="circuit-pdf-message" role="alert"><span>{message}</span><Button title="關閉這則訊息" type="button" variant="ghost" aria-label="關閉訊息" onClick={() => { setFailure(""); pdfs.clearError(); }}><X aria-hidden="true" /></Button></p>}
    <div ref={stage} className="circuit-pdf-stage" tabIndex={0} aria-label={active ? `${circuitPdfVersionLabel(active)} 第 ${page} 頁` : "PDF 頁面"} data-crop={cropMode} data-compare={Boolean(compare)}>
      {pdfs.openError ? <div className="circuit-pdf-open-error" role="alert"><p>{pdfs.openError}</p>
        {pdfs.needsLocalFile ? <Button title="從這台電腦選同一個 PDF 檔開啟" type="button" onClick={() => localInput.current?.click()}>選擇檔案開啟</Button> : <Button title="重新讀取 PDF" type="button" variant="outline" onClick={() => void pdfs.reload()}>重試</Button>}
      </div>
        : !pdfs.activePdf || !active ? pdfs.opening ? <div className="circuit-pdf-skeleton" role="status"><span className="circuit-pdf-skeleton-page" aria-hidden="true"><i style={{ top: "18%" }} /><i style={{ top: "38%" }} /><i style={{ top: "58%" }} /><i style={{ top: "78%" }} /><span className="circuit-pdf-skeleton-label"><CircuitSpinner />正在開啟 PDF…</span></span></div> : <p className="circuit-pdf-loading">選一份 PDF</p>
        : <div className="circuit-pdf-pages" data-compare={Boolean(compare)} data-stacked={Boolean(compare) && stacked}>
          {compare && (pdfs.comparePage ? <PdfPage key={`compare:${compare.id}`} pane="compare" pdf={pdfs.comparePdf} row={compare} page={pdfs.comparePage} scale={scale} heading={`基準版${compare.id === official?.id ? "（官方）" : ""} · ${circuitPdfVersionLabel(compare)} 第 ${pdfs.comparePage} 頁`}
            tool={canEdit && ink && !ink.loading ? tool : cropMode ? "crop" : "pan"} strokes={ink?.pages[`${compare.id}:${pdfs.comparePage}`] || []}
            onAddInk={points => ink?.add(compare.id, pdfs.comparePage, points)} onRemoveInk={id => ink?.remove(compare.id, pdfs.comparePage, id)} onInkTarget={() => setInkPane("compare")}
            crops={crops.filter(crop => crop.documentId === compare.id && crop.page === pdfs.comparePage)} flash={flash && flash.documentId === compare.id && flash.page === pdfs.comparePage ? flash : null} selection={selection} cropMode={cropMode} onSelection={setSelection}
            stage={compareViewport} viewportRef={compareViewport} onScroll={linkedViews.onCompareScroll} onResize={() => linkedViews.afterResize("compare")} /> : <figure className="circuit-pdf-page circuit-pdf-unmatched" data-pane="compare"><figcaption>基準版 · 尚未對應頁面</figcaption><div role="status"><strong>基準版沒有對應的第 {page + pdfs.compareOffset} 頁</strong><span>請在「{comparePageLabel}」輸入 1–{compare.pages}，再比對或加入修改前截圖。</span></div></figure>)}
          <PdfPage key={`active:${active!.id}`} pane="active" pdf={pdfs.activePdf} row={active!} page={page} scale={scale} heading={compare ? `比對版${active.id === official?.id ? "（官方）" : ""} · ${circuitPdfVersionLabel(active)} 第 ${page} 頁` : ""}
            tool={canEdit && ink && !ink.loading ? tool : cropMode ? "crop" : "pan"} strokes={ink?.pages[`${active.id}:${page}`] || []}
            onAddInk={points => ink?.add(active.id, page, points)} onRemoveInk={id => ink?.remove(active.id, page, id)} onInkTarget={() => setInkPane("active")}
            crops={crops.filter(crop => crop.documentId === active!.id && crop.page === page)} flash={flash && flash.documentId === active!.id && flash.page === page ? flash : null} selection={selection} cropMode={cropMode} onSelection={setSelection}
            stage={compare ? activeViewport : stage} viewportRef={activeViewport} onScroll={linkedViews.onActiveScroll} onResize={() => linkedViews.afterResize("active")} />
        </div>}
    </div>
    {phoneBar}
    {!phone && (selection || captured) && <div className="circuit-pdf-actions" role={selection ? "group" : "status"} aria-label={selection ? "加入截圖" : undefined}>
      {selection ? <>
        <span className="circuit-pdf-actions-target">{captureBlocked || <>截圖 → <strong>{targetLabel}</strong></>}</span>
        <Button data-circuit-tone="add" data-fill="solid" title={`把框出的範圍加到這個問題的${sideWord}`} type="button" disabled={capturing || Boolean(captureBlocked)} aria-busy={capturing || undefined} onClick={() => void capture([{ pane: selection.pane, side: captureSide }])}><CircuitBusyIcon busy={capturing}><ImagePlus /></CircuitBusyIcon>加到{sideWord}</Button>
        <Button data-circuit-tone="add" title="把框出的範圍加到這個問題的補充圖（規格書、量測波形等參考）" type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "reference" }])}>加到補充圖</Button>
        <Button type="button" variant="ghost" aria-label="取消截圖" title="取消（Esc）" onClick={() => setSelection(null)}><X aria-hidden="true" /></Button>
        {capturing && <span className="circuit-pdf-actions-busy">正在加入…</span>}
      </> : <span><Check aria-hidden="true" />{captured}</span>}
    </div>}
  </section>;
}

/** One version in the list. Its fields keep what is being typed; the date is saved once a whole date is chosen, the note when leaving it. */
function VersionRow({ row, active, canEdit, removing, official, confirmingOfficial, settingOfficial, onOpen, onUpdate, onAskRemove, onRemove, onAskOfficial, onSetOfficial }: {
  row: CircuitPdfDocument; active: boolean; canEdit: boolean; removing: boolean;
  official: boolean; confirmingOfficial: boolean; settingOfficial: boolean;
  onOpen: () => void; onUpdate: (patch: { date?: string; label?: string }) => void; onAskRemove: (value: boolean) => void; onRemove: () => void;
  onAskOfficial: (value: boolean) => void; onSetOfficial: () => void;
}) {
  const [date, setDate] = useState(row.date);
  const [label, setLabel] = useState(row.label);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setDate(row.date); }, [row.date]);
  useEffect(() => { setLabel(row.label); }, [row.label]);
  return <li data-active={active}>
    <button title={`開啟這份 PDF：${row.name}`} type="button" className="circuit-pdf-version-open" aria-label={`開啟 ${circuitPdfVersionLabel(row)} ${row.name}`} onClick={onOpen}>
      <span><strong title={row.name}>{row.name}</strong><small>{circuitPdfVersionLabel(row)} · {row.pages} 頁 · {row.uploadedByName || "同仁"}{row.localOnly ? " · 只在上傳者電腦" : ""}</small></span>
      <span className="circuit-pdf-open-label">{active ? "目前顯示" : official ? "開啟原圖" : "開啟"}<ChevronRight aria-hidden="true" /></span>
    </button>
    {canEdit && !official && <div className="circuit-pdf-version-actions">
      <Button data-circuit-tone="edit" data-fill="ghost" title="修改這份 PDF 的圖面日期與備註" type="button" variant="ghost" aria-label={`改日期與備註：${row.name}`} aria-expanded={editing} onClick={() => setEditing(value => !value)}><Pencil aria-hidden="true" />{editing ? "收起" : "改日期與備註"}</Button>
      {editing && <div className="circuit-pdf-version-edit">
      <label><span>圖面日期</span><input type="date" aria-label={`${row.name} 的圖面日期`} value={date} required disabled={official}
        onChange={event => { setDate(event.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onUpdate({ date: event.target.value }); }} /></label>
      <label><span>備註</span><input aria-label={`${row.name} 的備註`} value={label} maxLength={60} placeholder="例如 V2、第 3 天" disabled={official}
        onChange={event => setLabel(event.target.value)} onBlur={() => onUpdate({ label })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onUpdate({ label }); } }} /></label>
      <small>日期選定、備註離開欄位後自動儲存。</small>
      <Button data-circuit-tone="done" type="button" variant="outline" title="收起；內容已自動儲存" onClick={() => { onUpdate({ label }); setEditing(false); }}>完成</Button></div>}
      <Button data-circuit-tone="delete" data-fill="ghost" title="刪除這份 PDF；已加入的截圖保留，可在下方「已刪除的 PDF」還原" type="button" variant="ghost" className="circuit-pdf-version-delete" aria-label={`刪除 PDF：${row.name}`} aria-expanded={removing} onClick={() => onAskRemove(!removing)}><Trash2 aria-hidden="true" />刪除</Button>
      {removing && <div className="circuit-pdf-confirm" role="group" aria-label="確認刪除 PDF">
        <span>刪除「{row.name}」？已加入的截圖保留，可在下方「已刪除的 PDF」還原。</span>
        <Button title="不刪除" type="button" variant="outline" onClick={() => onAskRemove(false)}>取消</Button>
        <Button data-circuit-tone="delete" data-fill="solid" title="刪除這份 PDF；可在下方「已刪除的 PDF」還原" type="button" variant="destructive" aria-label={`確認刪除 ${row.name}`} onClick={onRemove}><Trash2 aria-hidden="true" />刪除</Button>
      </div>}
    </div>}
  </li>;
}

const PageStrip = memo(function PageStrip({ registry, documentId, pages, current, justDone = 0, pageChanges, onPage }: {
  registry: CircuitPdfRegistry; documentId: string; pages: number; current: number; justDone?: number;
  pageChanges: Map<number, Array<{ id: string; number: number }>>; onPage: (page: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const cells = useMemo(() => Array.from({ length: pages }, (_, index) => {
    const page = index + 1, state = circuitPdfPageState(registry, documentId, page), changes = pageChanges.get(page) || [];
    return { page, state, changes };
  }), [registry, documentId, pages, pageChanges]);
  // The page under the pointer, read from the cells themselves so the marker, the label and the result always agree.
  const pageAt = (x: number) => {
    const nodes = strip.current?.querySelectorAll<HTMLElement>("[data-strip-page]");
    if (!nodes?.length) return current;
    for (const node of nodes) if (x < node.getBoundingClientRect().right) return Number(node.dataset.stripPage);
    return pages;
  };
  const shown = scrub ?? current, labelled = scrub ?? hover;
  const move = (target: number) => { const page = Math.min(pages, Math.max(1, target)); if (page !== current) onPage(page); };
  // While dragging, the page on screen follows the marker live: at most one change per frame, the latest page wins.
  const sent = useRef(current), frame = useRef(0), pending = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const follow = (page: number) => {
    pending.current = page;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current !== sent.current) { sent.current = pending.current; onPage(pending.current); } });
  };
  return <div ref={strip} className="circuit-pdf-strip" role="slider" tabIndex={0} aria-label="頁面總覽" aria-orientation="horizontal"
    aria-valuemin={1} aria-valuemax={pages} aria-valuenow={current} aria-valuetext={`第 ${current} 頁，共 ${pages} 頁`}
    title="拖曳白色標記，圖面會即時跟著換頁；點一格直接跳頁，也可以按方向鍵換頁" data-dense={pages > 120} data-dragging={scrub !== null}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; sent.current = current; setHover(null); const page = pageAt(event.clientX); setScrub(page); follow(page); }}
    onPointerMove={event => { const page = pageAt(event.clientX); if (dragging.current) { setScrub(page); follow(page); } else if (event.pointerType === "mouse") setHover(page); }}
    onPointerUp={event => { if (!dragging.current) return; dragging.current = false; cancelAnimationFrame(frame.current); frame.current = 0; const page = pageAt(event.clientX); setScrub(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (page !== sent.current) { sent.current = page; onPage(page); } }}
    onPointerCancel={() => { dragging.current = false; cancelAnimationFrame(frame.current); frame.current = 0; setScrub(null); }}
    onPointerLeave={() => { if (!dragging.current) setHover(null); }}
    onKeyDown={event => {
      const target = event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 1
        : event.key === "PageDown" ? current + 10 : event.key === "PageUp" ? current - 10 : event.key === "Home" ? 1 : event.key === "End" ? pages : 0;
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); move(target);
    }}>
    {cells.map(cell => <span key={cell.page} data-strip-page={cell.page} data-state={cell.state} data-changes={cell.changes.length > 0} data-current={cell.page === shown || undefined} data-just={cell.page === justDone && cell.state === "here" || undefined}>
      {cell.page === labelled && <span className="circuit-pdf-strip-label" aria-hidden="true">第 {cell.page} 頁 · {STATE_LABEL[cell.state]}{cell.changes.length ? ` · 問題 ${cell.changes.map(change => `#${String(change.number).padStart(3, "0")}`).join("、")}` : ""}</span>}
    </span>)}
  </div>;
});

function PdfPage({ pane, pdf, row, page, scale, heading, crops, flash, selection, cropMode, tool, strokes, onAddInk, onRemoveInk, onInkTarget, onSelection, stage, viewportRef, onScroll, onResize }: {
  pane: Pane; pdf: PDFDocumentProxy | null; row: CircuitPdfDocument; page: number; scale: number; heading: string; crops: CircuitPdfCrop[];
  flash: { id: number; rect: CircuitCropRect } | null;
  tool: CircuitPdfTool; strokes: CircuitPdfInkStroke[]; onAddInk: (points: CircuitPdfInkStroke["points"]) => void; onRemoveInk: (id: string) => void; onInkTarget: () => void;
  selection: Selection | null; cropMode: boolean; onSelection: (value: Selection | null) => void; stage: RefObject<HTMLDivElement>;
  viewportRef: RefObject<HTMLDivElement>; onScroll: () => void; onResize: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const drag = useRef<{ start: { x: number; y: number }; pan?: { left: number; top: number; x: number; y: number } } | null>(null);
  const space = useRef(false);
  const resizeCallback = useRef(onResize);
  resizeCallback.current = onResize;
  useLayoutEffect(() => { resizeCallback.current(); }, [size]);
  useLayoutEffect(() => { viewportRef.current?.scrollTo({ left: 0, top: 0 }); }, [pdf, page, viewportRef]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space" && !(event.target as HTMLElement).closest("input,textarea,select,button")) space.current = true; };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") space.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    const controller = new AbortController();
    setRendering(true); setError("");
    renderCircuitPdfPage(pdf, page, canvas.current, scale, controller.signal)
      .then(result => { if (result && !controller.signal.aborted) setSize(result); })
      .catch(failure => { if (!controller.signal.aborted && (failure as { name?: string })?.name !== "RenderingCancelledException") setError("這一頁無法顯示，請重試或換一個版本。"); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => controller.abort();
  }, [pdf, page, scale]);
  const point = (event: ReactPointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  // In a comparison the framed area is shown on both pages, since the same area is taken from each.
  const shown = selection;
  return <figure className="circuit-pdf-page" data-pane={pane}>
    {heading && <figcaption>{heading}</figcaption>}
    <div ref={viewportRef} className="circuit-pdf-viewport" role="region" aria-label={pane === "compare" ? "對照版本圖面" : "工作版本圖面"} tabIndex={0} onScroll={onScroll}>
    <div ref={surface} className="circuit-pdf-surface" data-rendering={rendering} style={size ? { width: size.width, height: size.height } : undefined}
      onPointerDown={event => {
        if (event.button === 1 || space.current || !cropMode) {
          if (event.pointerType !== "mouse" && !cropMode) return;
          const host = stage.current; if (!host) return;
          drag.current = { start: { x: 0, y: 0 }, pan: { left: host.scrollLeft, top: host.scrollTop, x: event.clientX, y: event.clientY } };
          event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return;
        }
        if (event.button !== 0) return;
        drag.current = { start: point(event) };
        event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
        onSelection(null);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current) return;
        if (current.pan) { const host = stage.current; if (host) { host.scrollLeft = current.pan.left - (event.clientX - current.pan.x); host.scrollTop = current.pan.top - (event.clientY - current.pan.y); } return; }
        const rect = normalizeCropRect(current.start, point(event));
        if (rect) onSelection({ pane, rect });
      }}
      onPointerUp={event => {
        const current = drag.current; drag.current = null;
        if (!current || current.pan) return;
        const rect = normalizeCropRect(current.start, point(event));
        onSelection(rect ? { pane, rect } : null);
      }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <canvas ref={canvas} aria-label={`${row.name} 第 ${page} 頁`} role="img" />
      {size && !rendering && !error && <CircuitPdfInkLayer key={`${row.id}:${page}:${tool}`} strokes={strokes} width={size.width} height={size.height} tool={tool} space={space}
        label={`${row.name} 第 ${page} 頁`} onAdd={onAddInk} onRemove={onRemoveInk} onTarget={onInkTarget} />}
      {crops.map(crop => <span key={crop.id} className="circuit-pdf-crop" data-side={crop.side} style={box(crop.rect)}><span>{SHORT_SIDE[crop.side]}</span></span>)}
      {shown && <span className="circuit-pdf-selection" data-mirror={shown.pane !== pane} style={box(shown.rect)} />}
      {flash && <span key={flash.id} className="circuit-pdf-flash" style={box(flash.rect)} aria-hidden="true" />}
      {rendering && !error && <span className="circuit-pdf-rendering" role="status"><CircuitSpinner />正在繪製第 {page} 頁</span>}
      {error && <p className="circuit-pdf-page-error" role="alert">{error}</p>}
    </div>
    </div>
  </figure>;
}
const box = (rect: CircuitCropRect) => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
