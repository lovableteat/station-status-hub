import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Crop, Eraser, FileUp, Hand, Link2, Minus, MoveHorizontal, Pencil, PenLine, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Undo2, Unlink, Upload, X } from "lucide-react";
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
export function CircuitPdfPanel({ mode = "review", onAiReview, onSetupOfficial, pdfs, ink, canEdit, captureBlocked, targetLabel, pageChanges, crops, onCapture, onSelectChange, onBack, versionsOpen, onVersionsOpenChange: setVersionsOpen, versionsOpener }: {
  /** 線路 Review reads one drawing page by page; AI 比對 shows the official version beside the new one with the AI button. */
  mode?: "review" | "ai"; onAiReview?: () => void; onSetupOfficial?: () => void;
  pdfs: CircuitPdfModel; ink?: CircuitPdfInkModel; canEdit: boolean; captureBlocked: string; targetLabel: string;
  pageChanges: Map<number, Array<{ id: string; number: number }>>; crops: CircuitPdfCrop[];
  onCapture: (captures: CircuitPdfCapture[]) => Promise<void>; onSelectChange: (id: string) => void; onBack: () => void;
  versionsOpen: boolean; onVersionsOpenChange: (open: boolean) => void; versionsOpener: MutableRefObject<HTMLButtonElement | null>;
}) {
  const { active, compare, official, documents, registry, page } = pdfs;
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const [tool, setTool] = useState<CircuitPdfTool>(() => finePointer() ? "crop" : "pan");
  const [inkPane, setInkPane] = useState<Pane>("active");
  const cropMode = tool === "crop";
  const [selection, setSelection] = useState<Selection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState("");
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
    const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.stopPropagation(); event.preventDefault(); setSelection(null); if (versionsOpen) closeVersions(); setDeleting(""); };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [selection, versionsOpen, deleting]);
  useEffect(() => {
    if (!versionsOpen) return;
    setRestoredName("");
    versionClose.current?.focus();
    const outside = (event: PointerEvent) => { if (!versions.current?.contains(event.target as Node)) setVersionsOpen(false); };
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
    void (async () => { for (const file of pdfFiles) await pdfs.upload(file).catch(() => {}); })();
  }
  function drop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault(); event.stopPropagation(); setDropping(false);
    if (canEdit) chooseFiles(Array.from(event.dataTransfer.files));
  }
  function finishPage() {
    if (!active) return;
    if (canEdit) pdfs.setChecked(page, true);
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
  async function capture(sides: Array<{ pane: Pane; side: CircuitImageSide }>) {
    if (!selection || capturing || captureBlocked) return;
    if (ink?.loading) { setFailure("畫筆標註載入中，請稍後再截圖。"); return; }
    if (sides.some(side => side.pane === "compare") && !compareReady) { setFailure("請先指定有效的官方對應頁，再加入修改前截圖。"); return; }
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
      await onCapture(captures);
      setCaptured(`已加到 ${targetLabel} 的${captures.map(item => CIRCUIT_IMAGE_SIDE_LABELS[item.side]).join("與")}（第 ${captures.map(item => item.page).filter((value, index, all) => all.indexOf(value) === index).join("、")} 頁）`);
      setSelection(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "截圖加入失敗，請重試。");
    } finally { setCapturing(false); }
  }

  const hiddenInputs = <>
    <input ref={fileInput} type="file" accept=".pdf,application/pdf" multiple className="sr-only" aria-label="選擇原理圖 PDF" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; chooseFiles(files); }} />
    <input ref={localInput} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="選擇本機 PDF 原檔" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pdfs.openLocal(file).catch(error => setFailure(error instanceof Error ? error.message : "PDF 無法開啟。")); }} />
  </>;
  const message = failure || pdfs.error;
  const aiReady = Boolean(official && pdfs.officialPdf && active && active.id !== official.id && pdfs.activePdf && !pdfs.opening);
  // 1 官方版本 → 2 新版 → 3 AI 比對 → 4 逐項確認. The step that is missing decides the one action on screen.
  const aiStep = !official ? 1 : !workingVersions.length ? 2 : 3;
  const aiState = (step: number) => step < aiStep ? "done" : step === aiStep ? "current" : "waiting";
  const aiAction = !official
    ? <Button type="button" title="到「官方版本」選一份 PDF 當比對的舊版" onClick={onSetupOfficial}><ShieldCheck aria-hidden="true" />設定官方版本</Button>
    : !workingVersions.length ? (canEdit ? <Button type="button" title="上傳要跟官方版本比對的新版 PDF（也可以把 PDF 拖進來）" disabled={Boolean(pdfs.uploading)} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" />{pdfs.uploading ? "上傳中…" : "上傳新版 PDF"}</Button> : null)
    : <Button type="button" className="circuit-pdf-ai-run" disabled={!aiReady || !onAiReview} title={aiReady ? "逐頁比對官方版本與新版，列出差異讓你確認" : "PDF 開啟後即可比對"} onClick={onAiReview}><Sparkles aria-hidden="true" />AI 比對新舊版</Button>;
  const aiBar = mode === "ai" ? <div className="circuit-pdf-ai-bar" role="group" aria-label="AI 比對步驟" data-testid="circuit-pdf-ai-bar" data-step={aiStep}>
    <ol className="circuit-pdf-ai-steps">
      <li data-state={aiState(1)} data-side="old"><b aria-hidden="true">{aiStep > 1 ? <Check /> : 1}</b><span><small>舊版</small>{official
        ? <strong title={official.name}>官方版本 · {circuitPdfVersionLabel(official)}</strong> : <strong>設定官方版本</strong>}</span></li>
      <li data-state={aiState(2)} data-side="new"><b aria-hidden="true">{aiStep > 2 ? <Check /> : 2}</b><span><small>新版</small>{workingVersions.length
        ? <select title="選要跟官方版本比對的新版 PDF" aria-label="選擇新版 PDF" value={active && active.id !== official?.id ? active.id : ""} onChange={event => { if (event.target.value) pdfs.select(event.target.value); }}>
          <option value="" disabled>選擇新版</option>
          {workingVersions.map(row => <option key={row.id} value={row.id}>{circuitPdfVersionLabel(row)} · {row.name}</option>)}
        </select> : <strong>上傳新版 PDF</strong>}</span></li>
      <li data-state={aiState(3)}><b aria-hidden="true">3</b>{aiStep === 3 ? aiAction : <span><small>比對</small><strong>AI 比對新舊版</strong></span>}</li>
      <li data-state="waiting"><b aria-hidden="true">4</b><span><small>確認</small><strong>逐項確認差異</strong></span></li>
    </ol>
  </div> : null;
  const back = <Button title="回到問題內容" type="button" variant="ghost" className="circuit-pdf-back" aria-label="返回修改內容" onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>;

  if (!documents.length && !archived.length && !versionsOpen && mode !== "ai") {
    return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping}
      onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}>
      {hiddenInputs}
      <div className="circuit-pdf-empty-heading">{back}<strong>PDF 圖面</strong></div>
      {message && <p className="circuit-pdf-message" role="alert">{message}</p>}
      {pdfs.loading ? <p className="circuit-pdf-empty-note">正在讀取 PDF 清單…</p>
        : pdfs.uploading ? <p className="circuit-pdf-empty-note" role="status">正在上傳「{pdfs.uploading}」…</p>
        : canEdit ? <button title="選擇原理圖 PDF 上傳（也可以拖進來）" type="button" className="circuit-pdf-empty" onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden="true" />
          <strong>上傳原理圖 PDF</strong>
          <span>每次上傳記為一個日期版本。逐頁看，看到修改就在頁面上框選，直接加到右邊的修改前或修改後。</span>
          <small>也可以把 PDF 拖到這裡；每份 50 MB 內存到雲端，更大的只在這台電腦開啟，不需壓縮。</small>
        </button>
        : <p className="circuit-pdf-empty-note">這塊板子還沒有上傳原理圖 PDF；有編輯權限的同仁上傳後，這裡會顯示每一頁。</p>}
    </section>;
  }

  const compareChoices = documents.filter(row => row.id !== active?.id);
  const deletingRow = documents.find(row => row.id === deleting && row.id !== official?.id) || null;
  const finish = (className: string) => canEdit && active && mode !== "ai" ? <div className={className}>
    {pageState === "here"
      ? <><Button type="button" variant="outline" className="circuit-pdf-seen" aria-pressed="true" title="這一頁已標記看過；按一下取消" onClick={() => pdfs.setChecked(page, false)}><Check aria-hidden="true" />已看過</Button>
        {page < active.pages && <Button type="button" title="翻到下一頁（→）" onClick={() => pdfs.goTo(page + 1)}>下一頁<ChevronRight aria-hidden="true" /></Button>}</>
      : <Button type="button" onClick={finishPage} title={pageState === "older" ? "這頁在較早的版本看過；標記這一版也看過並翻到下一頁" : "標記本頁看過並翻到下一頁"}><Check aria-hidden="true" />{page < active.pages ? "看完，下一頁" : "看完本頁"}</Button>}
  </div> : null;
  if (mode === "ai" && aiStep < 3) {
    return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping}
      onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}>
      {hiddenInputs}
      {aiBar}
      {message && <p className="circuit-pdf-message" role="alert"><span>{message}</span><Button type="button" variant="ghost" aria-label="關閉訊息" title="關閉這則訊息" onClick={() => { setFailure(""); pdfs.clearError(); }}><X aria-hidden="true" /></Button></p>}
      <div className="circuit-pdf-ai-guide" role="region" aria-label="AI 比對怎麼用">
        <h3>AI 比對要兩份 PDF</h3>
        <p>左邊放官方版本（舊版），右邊放現在畫好的新版。AI 會逐頁找出兩份不一樣的地方，你再一項一項確認，結果會存下來可以回查。</p>
        <ol>
          <li data-state={aiState(1)}><b aria-hidden="true">{aiStep > 1 ? <Check /> : 1}</b><div><strong>官方版本</strong><span>{official ? `已設定：${official.name}（${circuitPdfVersionLabel(official)}）` : "還沒有。到「官方版本」選一份原廠或已發行的 PDF。"}</span></div></li>
          <li data-state={aiState(2)}><b aria-hidden="true">2</b><div><strong>新版 PDF</strong><span>還沒有。上傳現在畫好的線路圖 PDF，也可以直接把檔案拖進這裡。</span></div></li>
          <li data-state="waiting"><b aria-hidden="true">3</b><div><strong>按「AI 比對新舊版」</strong><span>兩份會並排、同步捲動，AI 逐頁列出差異。</span></div></li>
          <li data-state="waiting"><b aria-hidden="true">4</b><div><strong>逐項確認</strong><span>每一項選「已確認」或「不採用」並儲存；要改的地方框選加到問題。</span></div></li>
        </ol>
        {aiAction ? <div className="circuit-pdf-ai-guide-action">{aiAction}</div> : <p className="circuit-pdf-ai-guide-note">目前是檢視權限，請有編輯權限的同仁上傳新版 PDF。</p>}
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
        {back}
        <div className="circuit-pdf-tool-group" data-group="version" hidden={mode === "ai"}>
        <div className="circuit-pdf-versions" ref={versions} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setVersionsOpen(false); }}>
          <Button type="button" variant="outline" className="circuit-pdf-version-button" aria-label="選擇 PDF 版本" aria-expanded={versionsOpen} title={active ? `${active.name} · ${active.pages} 頁；點此管理 PDF 版本` : "管理 PDF 版本"} onClick={event => { versionsOpener.current = event.currentTarget; setVersionsOpen(!versionsOpen); }}>
            <span>{active ? active.id === official?.id ? "官方原圖" : "工作版本" : "PDF 版本"}</span><small>{active ? `${circuitPdfVersionLabel(active)} · ${active.name}` : "管理與還原"}</small><ChevronDown aria-hidden="true" />
          </Button>
          {versionsOpen && <div id="circuit-pdf-version-manager" className="circuit-pdf-version-list" role="group" aria-label="PDF 版本（依圖面日期）">
            <header><div><strong>PDF 版本管理</strong><span>先選工作版本，再與固定的官方原圖對照。</span></div><Button title="關閉版本清單" ref={versionClose} type="button" variant="ghost" aria-label="關閉 PDF 版本管理" onClick={closeVersions}><X aria-hidden="true" /></Button></header>
            <div className="circuit-pdf-version-body">
              {message && <p className="circuit-pdf-version-feedback" role="alert">{message}</p>}
              {restoredName && <p className="circuit-pdf-version-feedback" role="status"><Check aria-hidden="true" /><span>已還原「{restoredName}」，可從工作版本開啟。</span></p>}
              <section className="circuit-pdf-baseline-section" aria-label="官方版本版本">
                <h3><ShieldCheck aria-hidden="true" />官方版本<span>固定比對原圖</span></h3>
                {official ? <><ul><VersionRow row={official} active={official.id === active?.id} official canEdit={false} removing={false} confirmingOfficial={false} settingOfficial={false}
                  onOpen={() => { pdfs.select(official.id); closeVersions(); }} onUpdate={() => {}} onAskRemove={() => {}} onRemove={() => {}} onAskOfficial={() => {}} onSetOfficial={() => {}} /></ul><p>要更換官方版本，到上方的「官方版本」分頁。</p></>
                  : <p>尚未指定。{onSetupOfficial && <Button type="button" variant="outline" title="到「官方版本」分頁選一份 PDF 當比對的舊版" onClick={() => { closeVersions(); onSetupOfficial(); }}><ShieldCheck aria-hidden="true" />到官方版本設定</Button>}</p>}
              </section>
              <section className="circuit-pdf-working-section" aria-label="工作版本">
                <header><h3>工作版本<span>{workingVersions.length}</span></h3></header>
                {workingVersions.length ? <ul>{workingVersions.map(row => <VersionRow key={row.id} row={row} active={row.id === active?.id} canEdit={canEdit} removing={removing === row.id}
                  onOpen={() => { pdfs.select(row.id); closeVersions(); }} onUpdate={patch => pdfs.updateDocument(row.id, patch)} onAskRemove={value => setRemoving(value ? row.id : "")}
                  official={false} confirmingOfficial={officialCandidate === row.id} settingOfficial={settingOfficial} onAskOfficial={value => setOfficialCandidate(value ? row.id : "")} onSetOfficial={() => void pinOfficial(row.id)}
                  onRemove={() => removePdf(row.id)} />)}</ul>
                  : <div className="circuit-pdf-working-empty"><FileUp aria-hidden="true" /><strong>目前沒有工作版本</strong><p>用工具列的「上傳新 PDF」加入畫好的新版，或還原下方已刪除的版本。</p></div>}
              </section>
              {archived.length > 0 && <section className="circuit-pdf-archived-section"><button type="button" title="顯示或收起可以還原的已刪除 PDF" className="circuit-pdf-archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(value => !value)}><span>已刪除的 PDF<span>{archived.length}</span></span><ChevronDown aria-hidden="true" /></button>{showArchived && <><p>還原後會回到工作版本，不會切換目前開啟的圖面。</p><ul>{archived.map(row => <li key={row.id}><div><strong title={row.name}>{row.name}</strong><small>{circuitPdfVersionLabel(row)} · {row.pages} 頁</small></div>{canEdit && <Button type="button" title="把這份 PDF 放回工作版本" variant="outline" disabled={Boolean(restoring)} aria-label={`還原 PDF：${row.name}`} onClick={() => void restorePdf(row)}><RotateCcw aria-hidden="true" />{restoring === row.id ? "還原中…" : "還原到工作版本"}</Button>}</li>)}</ul></>}</section>}
            </div>
          </div>}
        </div>
        </div>
        {canEdit && <div className="circuit-pdf-tool-group" data-group="files">
        {active && <Button type="button" variant="outline" className="circuit-pdf-delete" aria-label="刪除這份 PDF" aria-expanded={deleting === active.id} disabled={active.id === official?.id}
          title={active.id === official?.id ? "官方版本不能刪除；先把另一份 PDF 設為官方版本" : "刪除目前這份 PDF；已加入的截圖保留，可從版本清單的「已刪除的 PDF」還原"} onClick={() => setDeleting(value => value === active.id ? "" : active.id)}><Trash2 aria-hidden="true" /></Button>}
        <Button type="button" variant="outline" aria-label="上傳新 PDF" title={pdfs.uploading ? `正在上傳 ${pdfs.uploading}` : "新增工作版本，保留全部舊 PDF 與官方版本"} disabled={Boolean(pdfs.uploading)} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" /></Button>
        </div>}
        {active && <><div className="circuit-pdf-tool-group" data-group="draw" role="group" aria-label="標註工具">
          <Button type="button" variant="ghost" aria-label="移動" title="移動圖面；也可按住空白鍵拖曳" aria-pressed={tool === "pan"} onClick={() => chooseTool("pan")}><Hand aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" className="circuit-pdf-crop-toggle" aria-label="框選" title="框選區域，加入修改前後截圖" aria-pressed={cropMode} onClick={() => chooseTool("crop")}><Crop aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" aria-label="畫筆" title="畫筆：直接在圖面畫線，放開後自動儲存" aria-pressed={tool === "pen"} disabled={!canEdit || !ink || ink.loading || !pdfs.activePdf || pdfs.opening} onClick={() => chooseTool("pen")}><PenLine aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" aria-label="橡皮擦" title="點選筆跡即可擦除；不會更動 PDF 原圖" aria-pressed={tool === "erase"} disabled={!canEdit || !ink || ink.loading || !pdfs.activePdf || pdfs.opening} onClick={() => chooseTool("erase")}><Eraser aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" aria-label="撤回最後一筆畫筆" title="撤回最後操作圖面上的最後一筆畫筆" disabled={!canEdit || !ink || !targetInk.length} onClick={() => { if (inkRow) ink?.undo(inkRow.id, inkPage); }}><Undo2 aria-hidden="true" /></Button>
        </div>
        <div className="circuit-pdf-tool-group" data-group="navigation"><div className="circuit-pdf-pager" role="group" aria-label="翻頁">
          <Button type="button" variant="ghost" aria-label="上一頁" title="上一頁（←）" disabled={page <= 1} onClick={() => pdfs.goTo(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <label><span className="sr-only">頁碼</span><input aria-label="目前頁碼" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => { pdfs.goTo(Number(pageInput) || page); setPageInput(String(page)); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); pdfs.goTo(Number(pageInput) || page); } }} /></label>
          <span>/ {active.pages}</span>
          <Button type="button" variant="ghost" aria-label="下一頁" title="下一頁（→）" disabled={page >= active.pages} onClick={() => pdfs.goTo(page + 1)}><ChevronRight aria-hidden="true" /></Button>
        </div></div>
        <div className="circuit-pdf-tool-group" data-group="zoom"><div className="circuit-pdf-zoom" role="group" aria-label="縮放">
          <Button title="縮小（也可以按住 Ctrl 滾滑鼠滾輪）" type="button" variant="ghost" aria-label="縮小" onClick={() => changeZoom(step(scale, -1))}><Minus aria-hidden="true" /></Button>
          <span aria-live="polite">{Math.round(scale * 100)}%</span>
          <Button title="放大（也可以按住 Ctrl 滾滑鼠滾輪）" type="button" variant="ghost" aria-label="放大" onClick={() => changeZoom(step(scale, 1))}><Plus aria-hidden="true" /></Button>
          <Button type="button" variant={zoom === "fit" ? "secondary" : "ghost"} aria-label="符合寬度" title="縮放到剛好符合面板寬度" aria-pressed={zoom === "fit"} onClick={() => changeZoom("fit")}><MoveHorizontal aria-hidden="true" /></Button>
        </div></div></>}
        {compareChoices.length > 0 && <div className="circuit-pdf-tool-group" data-group="compare">
          {mode !== "ai" && <label className="circuit-pdf-compare"><span>對照</span><select title="選一份較早的 PDF 並排比對" aria-label="對照較早的 PDF 版本" value={compare?.id || ""} onChange={event => pdfs.setCompare(event.target.value)}>
            <option value="">不對照</option>{compareChoices.map(row => <option key={row.id} value={row.id}>{row.id === official?.id ? "官方版本 · " : ""}{circuitPdfVersionLabel(row)} · {row.name}</option>)}
          </select></label>}
          {compare && <div className="circuit-pdf-offset" role="group" aria-label="對照頁差" title="兩個版本頁數不同時，調整對照的頁碼">
            {compare.id === official?.id ? <label>官方頁<input type="number" aria-label="官方對應頁" placeholder="頁碼" min={1} max={compare.pages} value={pdfs.comparePage || ""} onChange={event => { const target = Number(event.target.value); if (target >= 1 && target <= compare.pages) pdfs.setCompareOffset(target - page); }} /></label> : <span>第 {pdfs.comparePage} 頁</span>}
            <Button title="兩版頁數不同時，讓左邊對照的頁碼往前一頁" type="button" variant="ghost" aria-label="對照頁往前一頁" disabled={pdfs.comparePage <= 1} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset - 1)}><Minus aria-hidden="true" /></Button>
            <Button title="兩版頁數不同時，讓左邊對照的頁碼往後一頁" type="button" variant="ghost" aria-label="對照頁往後一頁" disabled={!pdfs.comparePage || pdfs.comparePage >= compare.pages} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset + 1)}><Plus aria-hidden="true" /></Button>
          </div>}
          {official && !pdfs.officialPage && <small className="circuit-pdf-page-warning" role="status">請輸入官方對應頁</small>}
        </div>}
        {ink && active && <span className="circuit-pdf-ink-status" role="status" title="筆跡依版本與頁碼自動儲存，截圖時會一併加入">
          {ink.error ? "標註未儲存" : ink.loading ? "載入標註…" : ink.saving ? "儲存標註…" : `${targetInk.length} 筆標註`}
        </span>}
      </div>
    </div>
    {ink?.error && !versionsOpen && <p className="circuit-pdf-message" role="alert"><span>{ink.error}</span><Button type="button" variant="ghost" aria-label="重試儲存畫筆標註" title="重新連線並儲存本機保留的筆跡" onClick={() => void ink.retry().catch(() => {})}><RotateCcw aria-hidden="true" /></Button></p>}
    {deletingRow && <div className="circuit-pdf-confirm" role="group" aria-label="確認刪除 PDF">
      <span>刪除 {circuitPdfVersionLabel(deletingRow)}「{deletingRow.name}」？已加入的截圖保留，可從版本清單的「已刪除的 PDF」還原。</span>
      <Button title="不刪除" type="button" variant="outline" onClick={() => setDeleting("")}>取消</Button>
      <Button title="刪除這份 PDF；可從版本清單的「已刪除的 PDF」還原" type="button" variant="destructive" aria-label={`確認刪除 ${deletingRow.name}`} onClick={() => removePdf(deletingRow.id)}><Trash2 aria-hidden="true" />刪除</Button>
    </div>}
    {active && <div className="circuit-pdf-overview">
      {progress && <span className="circuit-pdf-progress" title={`這版看過 ${progress.here} 頁；較早版本看過 ${progress.older} 頁`}>
        已看 {progress.checked} / {progress.total} 頁
      </span>}
      <PageStrip registry={registry} documentId={active.id} pages={active.pages} current={page} pageChanges={pageChanges} onPage={pdfs.goTo} />
      {changesHere.length > 0 && <div className="circuit-pdf-page-changes" role="group" aria-label="本頁的修改項目">
        <span>本頁修改</span>{changesHere.map(change => <button title={`打開這一頁的問題 #${String(change.number).padStart(3, "0")}`} type="button" key={change.id} onClick={() => onSelectChange(change.id)}>#{String(change.number).padStart(3, "0")}</button>)}
      </div>}
      {finish("circuit-pdf-finish circuit-pdf-finish-toolbar")}
    </div>}
    {message && !versionsOpen && <p className="circuit-pdf-message" role="alert"><span>{message}</span><Button title="關閉這則訊息" type="button" variant="ghost" aria-label="關閉訊息" onClick={() => { setFailure(""); pdfs.clearError(); }}><X aria-hidden="true" /></Button></p>}
    {compare && <div className="circuit-pdf-link-bar">
      <Button type="button" variant="outline" className="circuit-pdf-link-toggle" aria-label="連動檢視" aria-pressed={linkedViews.linked} disabled={!compareReady}
        title={linkedViews.linked ? "移動任一圖面，另一邊跟隨。需要重新對齊時，先關閉連動。" : "各自移到對應位置，再開啟連動，即可保留目前對齊位置。"} onClick={linkedViews.toggleLinked}>
        {linkedViews.linked ? <Link2 aria-hidden="true" /> : <Unlink aria-hidden="true" />}<span>{linkedViews.linked ? "連動中" : "各自移動"}</span>
      </Button>
      <span>{linkedViews.linked ? "捲動同步，按住空白鍵拖曳可移動圖面" : "各自對齊後，再開啟連動"}</span>
    </div>}
    <div ref={stage} className="circuit-pdf-stage" tabIndex={0} aria-label={active ? `${circuitPdfVersionLabel(active)} 第 ${page} 頁` : "PDF 頁面"} data-crop={cropMode} data-compare={Boolean(compare)}>
      {pdfs.openError ? <div className="circuit-pdf-open-error" role="alert"><p>{pdfs.openError}</p>
        {pdfs.needsLocalFile ? <Button title="從這台電腦選同一個 PDF 檔開啟" type="button" onClick={() => localInput.current?.click()}>選擇檔案開啟</Button> : <Button title="重新讀取 PDF" type="button" variant="outline" onClick={() => void pdfs.reload()}>重試</Button>}
      </div>
        : !pdfs.activePdf || !active ? <p className="circuit-pdf-loading">{pdfs.opening ? "正在開啟 PDF…" : "選擇一個版本"}</p>
        : <div className="circuit-pdf-pages" data-compare={Boolean(compare)} data-stacked={Boolean(compare) && stacked}>
          {compare && (pdfs.comparePage ? <PdfPage key={`compare:${compare.id}`} pane="compare" pdf={pdfs.comparePdf} row={compare} page={pdfs.comparePage} scale={scale} heading={`${compare.id === official?.id ? "官方版本" : "自選對照"} · ${circuitPdfVersionLabel(compare)} 第 ${pdfs.comparePage} 頁`}
            tool={canEdit && ink && !ink.loading ? tool : cropMode ? "crop" : "pan"} strokes={ink?.pages[`${compare.id}:${pdfs.comparePage}`] || []}
            onAddInk={points => ink?.add(compare.id, pdfs.comparePage, points)} onRemoveInk={id => ink?.remove(compare.id, pdfs.comparePage, id)} onInkTarget={() => setInkPane("compare")}
            crops={crops.filter(crop => crop.documentId === compare.id && crop.page === pdfs.comparePage)} selection={selection} cropMode={cropMode} onSelection={setSelection}
            stage={compareViewport} viewportRef={compareViewport} onScroll={linkedViews.onCompareScroll} onResize={() => linkedViews.afterResize("compare")} /> : <figure className="circuit-pdf-page circuit-pdf-unmatched" data-pane="compare"><figcaption>官方版本 · 尚未對應頁面</figcaption><div role="status"><strong>官方版本沒有對應的第 {page + pdfs.compareOffset} 頁</strong><span>請在「官方對應頁」輸入 1–{compare.pages}，再比對或加入修改前截圖。</span></div></figure>)}
          <PdfPage key={`active:${active!.id}`} pane="active" pdf={pdfs.activePdf} row={active!} page={page} scale={scale} heading={compare ? `工作版本 · ${circuitPdfVersionLabel(active!)} 第 ${page} 頁` : ""}
            tool={canEdit && ink && !ink.loading ? tool : cropMode ? "crop" : "pan"} strokes={ink?.pages[`${active.id}:${page}`] || []}
            onAddInk={points => ink?.add(active.id, page, points)} onRemoveInk={id => ink?.remove(active.id, page, id)} onInkTarget={() => setInkPane("active")}
            crops={crops.filter(crop => crop.documentId === active!.id && crop.page === page)} selection={selection} cropMode={cropMode} onSelection={setSelection}
            stage={compare ? activeViewport : stage} viewportRef={activeViewport} onScroll={linkedViews.onActiveScroll} onResize={() => linkedViews.afterResize("active")} />
        </div>}
    </div>
    {active && !selection && !captured && finish("circuit-pdf-finish circuit-pdf-finish-bar")}
    {(selection || captured) && <div className="circuit-pdf-actions" role={selection ? "group" : "status"} aria-label={selection ? "加入框選區域" : undefined}>
      {selection ? <>
        <span className="circuit-pdf-actions-target">{captureBlocked || <>框選區域 → <strong>{targetLabel}</strong></>}</span>
        {compare ? <>
          <Button title="同一個框選範圍：左邊加到修改前、右邊加到修改後" type="button" disabled={capturing || Boolean(captureBlocked) || !compareReady} onClick={() => void capture([{ pane: "compare", side: "before" }, { pane: "active", side: "after" }])}>前後同區域加入</Button>
          <Button title="只把左邊這塊加到修改前" type="button" variant="outline" disabled={capturing || Boolean(captureBlocked) || !compareReady} onClick={() => void capture([{ pane: "compare", side: "before" }])}>只加修改前</Button>
          <Button title="只把右邊這塊加到修改後" type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: "active", side: "after" }])}>只加修改後</Button>
        </> : <>
          <Button title="把框選的範圍加到這個問題的修改前" type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "before" }])}>加到修改前</Button>
          <Button title="把框選的範圍加到這個問題的修改後" type="button" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "after" }])}>加到修改後</Button>
          <Button title="把框選的範圍加到這個問題的補充圖" type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "reference" }])}>加到補充圖</Button>
        </>}
        <Button type="button" variant="ghost" aria-label="取消框選" title="取消（Esc）" onClick={() => setSelection(null)}><X aria-hidden="true" /></Button>
        {capturing && <span className="circuit-pdf-actions-busy">正在加入…</span>}
      </> : <span>{captured}</span>}
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
      <Button title="修改這份 PDF 的圖面日期與備註" type="button" variant="ghost" aria-label={`編輯版本資訊：${row.name}`} aria-expanded={editing} onClick={() => setEditing(value => !value)}><Pencil aria-hidden="true" />{editing ? "收合資訊" : "編輯資訊"}</Button>
      {editing && <div className="circuit-pdf-version-edit">
      <label><span>圖面日期</span><input type="date" aria-label={`${row.name} 的圖面日期`} value={date} required disabled={official}
        onChange={event => { setDate(event.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onUpdate({ date: event.target.value }); }} /></label>
      <label><span>備註</span><input aria-label={`${row.name} 的版本備註`} value={label} maxLength={60} placeholder="例如 V2、第 3 天" disabled={official}
        onChange={event => setLabel(event.target.value)} onBlur={() => onUpdate({ label })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onUpdate({ label }); } }} /></label>
      <small>日期選定、備註離開欄位後自動儲存。</small>
      <Button type="button" variant="outline" title="收起版本資訊；內容已自動儲存" onClick={() => { onUpdate({ label }); setEditing(false); }}>完成</Button></div>}
    </div>}
  </li>;
}

const PageStrip = memo(function PageStrip({ registry, documentId, pages, current, pageChanges, onPage }: {
  registry: CircuitPdfRegistry; documentId: string; pages: number; current: number;
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
    {cells.map(cell => <span key={cell.page} data-strip-page={cell.page} data-state={cell.state} data-changes={cell.changes.length > 0} data-current={cell.page === shown || undefined}>
      {cell.page === labelled && <span className="circuit-pdf-strip-label" aria-hidden="true">第 {cell.page} 頁 · {STATE_LABEL[cell.state]}{cell.changes.length ? ` · 問題 ${cell.changes.map(change => `#${String(change.number).padStart(3, "0")}`).join("、")}` : ""}</span>}
    </span>)}
  </div>;
});

function PdfPage({ pane, pdf, row, page, scale, heading, crops, selection, cropMode, tool, strokes, onAddInk, onRemoveInk, onInkTarget, onSelection, stage, viewportRef, onScroll, onResize }: {
  pane: Pane; pdf: PDFDocumentProxy | null; row: CircuitPdfDocument; page: number; scale: number; heading: string; crops: CircuitPdfCrop[];
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
      {error && <p className="circuit-pdf-page-error" role="alert">{error}</p>}
    </div>
    </div>
  </figure>;
}
const box = (rect: CircuitCropRect) => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
