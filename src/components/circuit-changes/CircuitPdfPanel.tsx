import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Crop, FileUp, Minus, MoveHorizontal, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  circuitPdfCaption, circuitPdfImageName, circuitPdfPageState, circuitPdfProgress, circuitPdfVersionLabel, normalizeCropRect,
  type CircuitCropRect, type CircuitPdfDocument, type CircuitPdfPageState, type CircuitPdfRegistry,
} from "./circuitPdf";
import { circuitPdfPageSize, cropCircuitPdfPage, renderCircuitPdfPage } from "./pdfRender";
import { CIRCUIT_IMAGE_SIDE_LABELS, type CircuitImageSide, type CircuitImageSource } from "./types";
import type { CircuitPdfModel } from "./useCircuitPdfs";
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
// Two sheets side by side only when each still gets a readable width; otherwise 修改前 sits above 修改後 at full width,
// so scrolling sideways shows the same area of both dates.
const SIDE_BY_SIDE_MIN = 1100;

/**
 * The schematic PDF of the board, one page at a time. Dragging on the page frames an area that is added to the change on the
 * right as a sharp picture rendered from the PDF; with an older version beside it, the same area is taken from both dates.
 */
export function CircuitPdfPanel({ pdfs, canEdit, captureBlocked, targetLabel, pageChanges, crops, onCapture, onSelectChange, onBack }: {
  pdfs: CircuitPdfModel; canEdit: boolean; captureBlocked: string; targetLabel: string;
  pageChanges: Map<number, Array<{ id: string; number: number }>>; crops: CircuitPdfCrop[];
  onCapture: (captures: CircuitPdfCapture[]) => Promise<void>; onSelectChange: (id: string) => void; onBack: () => void;
}) {
  const { active, compare, documents, registry, page } = pdfs;
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const [cropMode, setCropMode] = useState(finePointer);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState("");
  const [failure, setFailure] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [removing, setRemoving] = useState("");
  const [pageInput, setPageInput] = useState(String(page));
  const [dropping, setDropping] = useState(false);
  const [stacked, setStacked] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const localInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const versions = useRef<HTMLDivElement>(null);
  const scale = zoom === "fit" ? fitScale : zoom;
  const progress = useMemo(() => active ? circuitPdfProgress(registry, active.id, active.pages) : null, [registry, active]);
  const pageState = active ? circuitPdfPageState(registry, active.id, page) : "none";
  const changesHere = pageChanges.get(page) || [];
  useEffect(() => { setPageInput(String(page)); setSelection(null); stage.current?.scrollTo({ top: 0 }); }, [page, active?.id]);
  useEffect(() => { setSelection(null); }, [compare?.id, pdfs.comparePage]);
  useEffect(() => { if (!captured) return; const timer = setTimeout(() => setCaptured(""), 4000); return () => clearTimeout(timer); }, [captured]);
  // Escape first drops the framed area; the dialog only closes on a second Escape.
  useEffect(() => {
    if (!selection && !versionsOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.stopPropagation(); event.preventDefault(); setSelection(null); setVersionsOpen(false); };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [selection, versionsOpen]);
  useEffect(() => {
    if (!versionsOpen) return;
    const outside = (event: PointerEvent) => { if (!versions.current?.contains(event.target as Node)) setVersionsOpen(false); };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [versionsOpen]);

  // "Fit width" follows the space the page has, which changes with the dialog and with the comparison pane.
  useLayoutEffect(() => {
    const element = stage.current, pdf = pdfs.activePdf;
    if (!element || !pdf || !active) return;
    let current = true, width = 0;
    const measure = async () => {
      const size = await circuitPdfPageSize(pdf, Math.min(page, pdf.numPages)).catch(() => null);
      if (!current || !size) return;
      const sideBySide = Boolean(compare) && element.clientWidth >= SIDE_BY_SIDE_MIN;
      setStacked(!sideBySide);
      const panes = sideBySide ? 2 : 1, available = (element.clientWidth - 24 - (panes - 1) * 12) / panes;
      setFitScale(Math.max(0.1, Math.min(4, available / size.width)));
    };
    const observer = new ResizeObserver(entries => { const next = Math.round(entries[0].contentRect.width); if (next !== width) { width = next; void measure(); } });
    observer.observe(element);
    return () => { current = false; observer.disconnect(); };
  }, [pdfs.activePdf, active, compare, page]);
  // Ctrl + wheel zooms the page instead of the browser.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(current => step(current === "fit" ? fitScale : current, event.deltaY < 0 ? 1 : -1));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [fitScale]);

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
  async function capture(sides: Array<{ pane: Pane; side: CircuitImageSide }>) {
    if (!selection || capturing || captureBlocked) return;
    setCapturing(true); setFailure("");
    try {
      const captures: CircuitPdfCapture[] = [];
      for (const { pane, side } of sides) {
        const row = pane === "compare" ? compare : active, pdf = pane === "compare" ? pdfs.comparePdf : pdfs.activePdf;
        const pageNumber = pane === "compare" ? pdfs.comparePage : page;
        if (!row || !pdf) continue;
        const output = await cropCircuitPdfPage(pdf, pageNumber, selection.rect);
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
  const back = <Button type="button" variant="ghost" className="circuit-pdf-back" aria-label="返回修改內容" onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>;

  if (!documents.length) {
    return <section className="circuit-pdf-panel" aria-label="PDF 圖面" data-testid="circuit-pdf-panel" data-dropping={dropping}
      onDragOver={event => { if (carriesFiles(event) && canEdit) { event.preventDefault(); event.stopPropagation(); setDropping(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false); }} onDrop={drop}>
      {hiddenInputs}
      <div className="circuit-pdf-empty-heading">{back}<strong>PDF 圖面</strong></div>
      {message && <p className="circuit-pdf-message" role="alert">{message}</p>}
      {pdfs.loading ? <p className="circuit-pdf-empty-note">正在讀取 PDF 清單…</p>
        : pdfs.uploading ? <p className="circuit-pdf-empty-note" role="status">正在上傳「{pdfs.uploading}」…</p>
        : canEdit ? <button type="button" className="circuit-pdf-empty" onClick={() => fileInput.current?.click()}>
          <FileUp aria-hidden="true" />
          <strong>上傳原理圖 PDF</strong>
          <span>每次上傳記為一個日期版本。逐頁看，看到修改就在頁面上框選，直接加到右邊的修改前或修改後。</span>
          <small>也可以把 PDF 拖到這裡；每份 50 MB 內存到雲端，更大的只在這台電腦開啟，不需壓縮。</small>
        </button>
        : <p className="circuit-pdf-empty-note">這塊板子還沒有上傳原理圖 PDF；有編輯權限的同仁上傳後，這裡會顯示每一頁。</p>}
    </section>;
  }

  const compareChoices = documents.filter(row => row.id !== active?.id);
  const finish = (className: string) => canEdit && active ? <div className={className}>
    <label className="circuit-pdf-checked"><input type="checkbox" aria-label="本頁看過" checked={pageState !== "none"} onChange={event => pdfs.setChecked(page, event.target.checked)} /><span>{pageState === "older" ? "舊版看過" : "本頁看過"}</span></label>
    <Button type="button" onClick={finishPage} title="標記本頁看過並翻到下一頁"><Check aria-hidden="true" />{page < active.pages ? "看完，下一頁" : "看完本頁"}</Button>
  </div> : null;
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
    <div className="circuit-pdf-toolbar">
      <div className="circuit-pdf-row">
        {back}
        <div className="circuit-pdf-versions" ref={versions}>
          <Button type="button" variant="outline" className="circuit-pdf-version-button" aria-label="選擇 PDF 版本" aria-expanded={versionsOpen} title={active ? `${active.name} · ${active.pages} 頁` : undefined} onClick={() => setVersionsOpen(value => !value)}>
            <span>{active ? circuitPdfVersionLabel(active) : "選擇版本"}</span><small>{active?.name}</small><ChevronDown aria-hidden="true" />
          </Button>
          {versionsOpen && <div className="circuit-pdf-version-list" role="group" aria-label="PDF 版本（依圖面日期）">
            <header><strong>PDF 版本</strong><span>依圖面日期排列，新的在上面</span></header>
            <ul>{documents.map(row => <VersionRow key={row.id} row={row} active={row.id === active?.id} canEdit={canEdit} removing={removing === row.id}
              onOpen={() => { pdfs.select(row.id); setVersionsOpen(false); }} onUpdate={patch => pdfs.updateDocument(row.id, patch)} onAskRemove={value => setRemoving(value ? row.id : "")}
              onRemove={() => { setRemoving(""); void pdfs.removeDocument(row.id).catch(error => setFailure(error instanceof Error ? error.message : "移除失敗。")); }} />)}</ul>
          </div>}
        </div>
        {canEdit && <Button type="button" variant="outline" aria-label="上傳新 PDF" title="上傳另一天的 PDF；會記為新的日期版本" disabled={Boolean(pdfs.uploading)} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" /><span>{pdfs.uploading ? "上傳中…" : "上傳新 PDF"}</span></Button>}
        {compareChoices.length > 0 && <label className="circuit-pdf-compare"><span>對照</span>
          <select aria-label="對照較早的 PDF 版本" value={compare?.id || ""} onChange={event => pdfs.setCompare(event.target.value)}>
            <option value="">不對照</option>
            {compareChoices.map(row => <option key={row.id} value={row.id}>{circuitPdfVersionLabel(row)} · {row.name}</option>)}
          </select>
        </label>}
        {compare && <div className="circuit-pdf-offset" role="group" aria-label="對照頁差" title="兩個版本頁數不同時，調整對照的頁碼">
          <span>第 {pdfs.comparePage} 頁</span>
          <Button type="button" variant="ghost" aria-label="對照頁往前一頁" disabled={pdfs.comparePage <= 1} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset - 1)}><Minus aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" aria-label="對照頁往後一頁" disabled={pdfs.comparePage >= compare.pages} onClick={() => pdfs.setCompareOffset(pdfs.compareOffset + 1)}><Plus aria-hidden="true" /></Button>
        </div>}
      </div>
      {active && <div className="circuit-pdf-row">
        <div className="circuit-pdf-pager" role="group" aria-label="翻頁">
          <Button type="button" variant="ghost" aria-label="上一頁" title="上一頁（←）" disabled={page <= 1} onClick={() => pdfs.goTo(page - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <label><span className="sr-only">頁碼</span><input aria-label="目前頁碼" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => { pdfs.goTo(Number(pageInput) || page); setPageInput(String(page)); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); pdfs.goTo(Number(pageInput) || page); } }} /></label>
          <span>/ {active.pages}</span>
          <Button type="button" variant="ghost" aria-label="下一頁" title="下一頁（→）" disabled={page >= active.pages} onClick={() => pdfs.goTo(page + 1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
        <div className="circuit-pdf-zoom" role="group" aria-label="縮放">
          <Button type="button" variant="ghost" aria-label="縮小" onClick={() => setZoom(step(scale, -1))}><Minus aria-hidden="true" /></Button>
          <span aria-live="polite">{Math.round(scale * 100)}%</span>
          <Button type="button" variant="ghost" aria-label="放大" onClick={() => setZoom(step(scale, 1))}><Plus aria-hidden="true" /></Button>
          <Button type="button" variant={zoom === "fit" ? "secondary" : "ghost"} aria-label="符合寬度" title="符合寬度" aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}><MoveHorizontal aria-hidden="true" /></Button>
        </div>
        <Button type="button" variant={cropMode ? "secondary" : "ghost"} className="circuit-pdf-crop-toggle" aria-label="框選" aria-pressed={cropMode} title={cropMode ? "在頁面上拖曳即可框選；按住空白鍵拖曳可移動畫面" : "開啟後在頁面上拖曳框選"} onClick={() => setCropMode(value => !value)}><Crop aria-hidden="true" /><span>框選</span></Button>
        {finish("circuit-pdf-finish circuit-pdf-finish-toolbar")}
      </div>}
    </div>
    {active && <div className="circuit-pdf-overview">
      {progress && <span className="circuit-pdf-progress" title={`這版看過 ${progress.here} 頁；較早版本看過 ${progress.older} 頁`}>
        <span className="circuit-pdf-progress-bar" aria-hidden="true"><span style={{ width: `${progress.total ? progress.checked / progress.total * 100 : 0}%` }} /></span>
        已看 {progress.checked} / {progress.total} 頁
      </span>}
      <PageStrip registry={registry} documentId={active.id} pages={active.pages} current={page} pageChanges={pageChanges} onPage={pdfs.goTo} />
      {changesHere.length > 0 && <div className="circuit-pdf-page-changes" role="group" aria-label="本頁的修改項目">
        <span>本頁修改</span>{changesHere.map(change => <button type="button" key={change.id} onClick={() => onSelectChange(change.id)}>#{String(change.number).padStart(3, "0")}</button>)}
      </div>}
    </div>}
    {message && <p className="circuit-pdf-message" role="alert"><span>{message}</span><Button type="button" variant="ghost" aria-label="關閉訊息" onClick={() => { setFailure(""); pdfs.clearError(); }}><X aria-hidden="true" /></Button></p>}
    <div ref={stage} className="circuit-pdf-stage" tabIndex={0} aria-label={active ? `${circuitPdfVersionLabel(active)} 第 ${page} 頁` : "PDF 頁面"} data-crop={cropMode}>
      {pdfs.openError ? <div className="circuit-pdf-open-error" role="alert"><p>{pdfs.openError}</p>
        {pdfs.needsLocalFile ? <Button type="button" onClick={() => localInput.current?.click()}>選擇檔案開啟</Button> : <Button type="button" variant="outline" onClick={() => void pdfs.reload()}>重試</Button>}
      </div>
        : !pdfs.activePdf ? <p className="circuit-pdf-loading">{pdfs.opening ? "正在開啟 PDF…" : "選擇一個版本"}</p>
        : <div className="circuit-pdf-pages" data-stacked={Boolean(compare) && stacked}>
          {compare && <PdfPage key={`compare:${compare.id}`} pane="compare" pdf={pdfs.comparePdf} row={compare} page={pdfs.comparePage} scale={scale} heading={`修改前 · ${circuitPdfVersionLabel(compare)} 第 ${pdfs.comparePage} 頁`}
            crops={crops.filter(crop => crop.documentId === compare.id && crop.page === pdfs.comparePage)} selection={selection} cropMode={cropMode} onSelection={setSelection} stage={stage} />}
          <PdfPage key={`active:${active!.id}`} pane="active" pdf={pdfs.activePdf} row={active!} page={page} scale={scale} heading={compare ? `修改後 · ${circuitPdfVersionLabel(active!)} 第 ${page} 頁` : ""}
            crops={crops.filter(crop => crop.documentId === active!.id && crop.page === page)} selection={selection} cropMode={cropMode} onSelection={setSelection} stage={stage} />
        </div>}
    </div>
    {active && !selection && !captured && finish("circuit-pdf-finish circuit-pdf-finish-bar")}
    {(selection || captured) && <div className="circuit-pdf-actions" role={selection ? "group" : "status"} aria-label={selection ? "加入框選區域" : undefined}>
      {selection ? <>
        <span className="circuit-pdf-actions-target">{captureBlocked || <>框選區域 → <strong>{targetLabel}</strong></>}</span>
        {compare ? <>
          <Button type="button" disabled={capturing || Boolean(captureBlocked) || !pdfs.comparePdf} onClick={() => void capture([{ pane: "compare", side: "before" }, { pane: "active", side: "after" }])}>前後同區域加入</Button>
          <Button type="button" variant="outline" disabled={capturing || Boolean(captureBlocked) || !pdfs.comparePdf} onClick={() => void capture([{ pane: "compare", side: "before" }])}>只加修改前</Button>
          <Button type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: "active", side: "after" }])}>只加修改後</Button>
        </> : <>
          <Button type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "before" }])}>加到修改前</Button>
          <Button type="button" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "after" }])}>加到修改後</Button>
          <Button type="button" variant="outline" disabled={capturing || Boolean(captureBlocked)} onClick={() => void capture([{ pane: selection.pane, side: "reference" }])}>加到補充圖</Button>
        </>}
        <Button type="button" variant="ghost" aria-label="取消框選" title="取消（Esc）" onClick={() => setSelection(null)}><X aria-hidden="true" /></Button>
        {capturing && <span className="circuit-pdf-actions-busy">正在加入…</span>}
      </> : <span>{captured}</span>}
    </div>}
  </section>;
}

/** One version in the list. Its fields keep what is being typed; the date is saved once a whole date is chosen, the note when leaving it. */
function VersionRow({ row, active, canEdit, removing, onOpen, onUpdate, onAskRemove, onRemove }: {
  row: CircuitPdfDocument; active: boolean; canEdit: boolean; removing: boolean;
  onOpen: () => void; onUpdate: (patch: { date?: string; label?: string }) => void; onAskRemove: (value: boolean) => void; onRemove: () => void;
}) {
  const [date, setDate] = useState(row.date);
  const [label, setLabel] = useState(row.label);
  useEffect(() => { setDate(row.date); }, [row.date]);
  useEffect(() => { setLabel(row.label); }, [row.label]);
  return <li data-active={active}>
    <button type="button" className="circuit-pdf-version-open" aria-label={`開啟 ${circuitPdfVersionLabel(row)} ${row.name}`} onClick={onOpen}>
      <strong>{circuitPdfVersionLabel(row)}</strong><span>{row.name}</span>
      <small>{row.pages} 頁 · {row.uploadedByName || "同仁"}{row.localOnly ? " · 只在上傳者電腦" : ""}</small>
    </button>
    {canEdit && <div className="circuit-pdf-version-edit">
      <label><span>圖面日期</span><input type="date" aria-label={`${row.name} 的圖面日期`} value={date} required
        onChange={event => { setDate(event.target.value); if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onUpdate({ date: event.target.value }); }} /></label>
      <label><span>備註</span><input aria-label={`${row.name} 的版本備註`} value={label} maxLength={60} placeholder="例如 V2、第 3 天"
        onChange={event => setLabel(event.target.value)} onBlur={() => onUpdate({ label })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onUpdate({ label }); } }} /></label>
      {removing
        ? <span className="circuit-pdf-remove-confirm">移除後清單不再顯示，已加入的截圖不受影響<Button type="button" variant="outline" onClick={() => onAskRemove(false)}>取消</Button><Button type="button" variant="destructive" onClick={onRemove}>移除 {circuitPdfVersionLabel(row)}</Button></span>
        : <Button type="button" variant="ghost" aria-label={`移除 ${circuitPdfVersionLabel(row)} ${row.name}`} title="移除這個版本" onClick={() => onAskRemove(true)}><Trash2 aria-hidden="true" /></Button>}
    </div>}
  </li>;
}

const PageStrip = memo(function PageStrip({ registry, documentId, pages, current, pageChanges, onPage }: {
  registry: CircuitPdfRegistry; documentId: string; pages: number; current: number;
  pageChanges: Map<number, Array<{ id: string; number: number }>>; onPage: (page: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { strip.current?.querySelector<HTMLElement>(`[data-strip-page="${current}"]`)?.scrollIntoView({ block: "nearest", inline: "center" }); }, [current]);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { element.scrollLeft += event.deltaY; event.preventDefault(); } };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const cells = useMemo(() => Array.from({ length: pages }, (_, index) => {
    const page = index + 1, state = circuitPdfPageState(registry, documentId, page), changes = pageChanges.get(page) || [];
    return { page, state, changes };
  }), [registry, documentId, pages, pageChanges]);
  return <div className="circuit-pdf-strip" ref={strip} role="group" aria-label="頁面總覽：點一格跳到該頁">
    {cells.map(cell => <button type="button" key={cell.page} data-strip-page={cell.page} data-state={cell.state} data-changes={cell.changes.length > 0} aria-current={cell.page === current ? "page" : undefined}
      aria-label={`第 ${cell.page} 頁，${STATE_LABEL[cell.state]}${cell.changes.length ? `，修改 ${cell.changes.map(change => `#${change.number}`).join("、")}` : ""}`}
      title={`第 ${cell.page} 頁 · ${STATE_LABEL[cell.state]}${cell.changes.length ? ` · 修改 ${cell.changes.map(change => `#${change.number}`).join("、")}` : ""}`}
      onClick={() => onPage(cell.page)}>{cell.page % 10 === 0 ? <span>{cell.page}</span> : null}</button>)}
  </div>;
});

function PdfPage({ pane, pdf, row, page, scale, heading, crops, selection, cropMode, onSelection, stage }: {
  pane: Pane; pdf: PDFDocumentProxy | null; row: CircuitPdfDocument; page: number; scale: number; heading: string; crops: CircuitPdfCrop[];
  selection: Selection | null; cropMode: boolean; onSelection: (value: Selection | null) => void; stage: RefObject<HTMLDivElement>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const drag = useRef<{ start: { x: number; y: number }; pan?: { left: number; top: number; x: number; y: number } } | null>(null);
  const space = useRef(false);
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
      onPointerCancel={() => { drag.current = null; }}>
      <canvas ref={canvas} aria-label={`${row.name} 第 ${page} 頁`} role="img" />
      {crops.map(crop => <span key={crop.id} className="circuit-pdf-crop" data-side={crop.side} style={box(crop.rect)}><span>{SHORT_SIDE[crop.side]}</span></span>)}
      {shown && <span className="circuit-pdf-selection" data-mirror={shown.pane !== pane} style={box(shown.rect)} />}
      {error && <p className="circuit-pdf-page-error" role="alert">{error}</p>}
    </div>
  </figure>;
}
const box = (rect: CircuitCropRect) => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
