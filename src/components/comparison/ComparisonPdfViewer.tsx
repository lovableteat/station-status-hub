import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Crosshair, List } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { Artifact, TrackRow } from "./types";
import type { PdfLocation } from "./reviewTools";

/** Render locally, including the original engine's annotation appearances, without a PDF browser plug-in. */
export function ComparisonPdfViewer({ artifact, row, location, zoom, height, width, label, externalUrl }: {
  artifact: Artifact; row: TrackRow; location?: PdfLocation; zoom: number; height: number; width: number; label: string; externalUrl: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [message, setMessage] = useState("載入線路圖…");
  const [error, setError] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [rendered, setRendered] = useState(false);
  const [links, setLinks] = useState<Array<{ dest: string | unknown[]; rect: number[] }>>([]);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const targetCentre = useRef<[number, number] | null>(null);
  const destination = useRef<{ page: number; centre: [number, number] | null } | null>(null);
  const navigation = useRef(0);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [targetRevision, setTargetRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let destroy: (() => Promise<void>) | undefined;
    setDocument(null); setPageNumber(1); setError(""); setMessage("載入線路圖…"); setRendered(false);
    void (async () => {
      const [pdfjs, resources] = await Promise.all([import("pdfjs-dist"), import("./pdfResources")]);
      const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      // PDF.js transfers its buffer to a worker; never detach the persisted/exportable artifact.
      const task = pdfjs.getDocument({ data: new Uint8Array(artifact.bytes.slice(0)), isEvalSupported: false, useSystemFonts: false, useWorkerFetch: false, CMapReaderFactory: resources.LocalCMapReaderFactory, StandardFontDataFactory: resources.LocalStandardFontDataFactory, WasmFactory: resources.LocalWasmFactory });
      destroy = () => task.destroy();
      const pdf = await task.promise;
      if (active) setDocument(pdf);
    })().catch(reason => { if (active) { setError(`無法顯示 PDF：${reason instanceof Error ? reason.message : String(reason)}`); setMessage(""); } });
    return () => { active = false; navigation.current++; renderTask.current?.cancel(); void destroy?.().catch(() => {}); };
  }, [artifact]);

  useEffect(() => {
    if (!document) return;
    const request = ++navigation.current;
    destination.current = null;
    setLocationNote("");
    void (async () => {
      // The archive stores physical pages per side, including the inserted index pages.
      // An explicit null means the part was not found on this side; keep the user's current page.
      const known = location?.page && location.page <= document.numPages
        ? { page: location.page, centre: location.centre }
        : location?.page === null || !row.dest ? null : await resolveDestination(document, row.dest);
      if (request !== navigation.current) return;
      if (!known) {
        setLocationNote("本筆未定位，保留目前圖面");
        return;
      }
      destination.current = known;
      targetCentre.current = known.centre;
      setPageNumber(known.page); setPageInput(String(known.page)); setTargetRevision(value => value + 1);
      if (!known.centre) setLocationNote("已定位到頁面，這筆沒有框選");
    })().catch(() => { if (request === navigation.current) setLocationNote("本筆未定位，保留目前圖面"); });
    return () => { navigation.current++; };
  }, [document, row.key, row.dest, location]);

  useEffect(() => {
    if (!document || pageNumber > document.numPages || !canvas.current || !scroll.current || width <= 0) return;
    let active = true;
    const previous = renderTask.current;
    previous?.cancel();
    setError(""); setRendered(false); setLinks([]); setMessage("繪製線路圖…");
    void (async () => {
      // A cancelled render still owns the canvas until its promise settles.
      await previous?.promise.catch(() => {});
      if (!active) return;
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = zoom && targetCentre.current ? zoom / 100 * 4 / 3 : Math.max(.1, (width - 16) / base.width);
      const viewport = page.getViewport({ scale });
      const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16000000 / (viewport.width * viewport.height)));
      if (!active || !canvas.current || !scroll.current) return;
      const surface = canvas.current;
      surface.width = Math.max(1, Math.floor(viewport.width * density));
      surface.height = Math.max(1, Math.floor(viewport.height * density));
      surface.style.width = `${viewport.width}px`; surface.style.height = `${viewport.height}px`;
      const task = page.render({ canvas: surface, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
      renderTask.current = task;
      await task.promise;
      if (!active) return;
      const annotations = await page.getAnnotations({ intent: "display" });
      if (!active) return;
      setLinks(annotations.filter(item => item.subtype === "Link" && (typeof item.dest === "string" || Array.isArray(item.dest))).map(item => ({ dest: item.dest, rect: viewport.convertToViewportRectangle(item.rect) })));
      const centre = targetCentre.current;
      scroll.current.scrollLeft = centre ? Math.max(0, centre[0] * scale - scroll.current.clientWidth / 2) : 0;
      scroll.current.scrollTop = centre ? Math.max(0, centre[1] * scale - scroll.current.clientHeight / 2) : 0;
      setRendered(true); setMessage("");
    })().catch(reason => { if (active) { setMessage(""); setError(`PDF 繪製失敗：${reason instanceof Error ? reason.message : String(reason)}`); } });
    return () => { active = false; renderTask.current?.cancel(); };
  }, [document, pageNumber, targetRevision, zoom, width, height]);

  const manualPage = (page: number) => {
    if (!document || !Number.isInteger(page)) { setPageInput(String(pageNumber)); return; }
    const next = Math.min(document.numPages, Math.max(1, page));
    navigation.current++;
    targetCentre.current = null;
    setPageNumber(next); setPageInput(String(next)); setTargetRevision(value => value + 1);
  };
  const recenter = () => {
    if (!destination.current) return;
    navigation.current++;
    const { page, centre } = destination.current;
    targetCentre.current = centre;
    setPageNumber(page); setPageInput(String(page)); setTargetRevision(value => value + 1);
  };
  const follow = async (destination: string | unknown[]) => {
    if (!document) return;
    const request = ++navigation.current;
    try {
      const target = await resolveDestination(document, destination);
      if (request !== navigation.current || !target) return;
      targetCentre.current = target.centre;
      setPageNumber(target.page); setPageInput(String(target.page)); setTargetRevision(value => value + 1);
    } catch { if (request === navigation.current) setLocationNote("此連結無法定位，可用頁碼查看"); }
  };
  return <div className="comparison-pdf-viewer">
    <div className="comparison-pdf-controls">
      <button title="上一頁" disabled={!document || pageNumber <= 1} onClick={() => manualPage(pageNumber - 1)} aria-label={`${label} 上一頁`}><ChevronLeft /></button>
      <label><input aria-label={`${label} PDF 頁碼`} inputMode="numeric" disabled={!document} value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => { if (pageInput !== String(pageNumber)) manualPage(pageInput.trim() ? Number(pageInput) : NaN); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span>／{document?.numPages ?? "—"}</span></label>
      <button title="下一頁" disabled={!document || pageNumber >= document.numPages} onClick={() => manualPage(pageNumber + 1)} aria-label={`${label} 下一頁`}><ChevronRight /></button>
      <button title="回到第 1 頁的標註索引" disabled={!document} onClick={() => manualPage(1)}><List />索引</button>
      <button title="回到本筆差異的位置" aria-label={`${label} 回到定位`} disabled={!destination.current} onClick={recenter}><Crosshair />定位</button>
    </div>
    <div className="comparison-pdf-stage" style={{ "--comparison-pdf-height": height ? `${height}px` : undefined } as CSSProperties}>
    <div ref={scroll} className="comparison-pdf-scroll" tabIndex={0} role="region" aria-label={`${label} 線路圖，可捲動`} aria-busy={Boolean(message)}
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || event.target !== canvas.current) return;
        const surface = event.currentTarget;
        pan.current = { x: event.clientX, y: event.clientY, left: surface.scrollLeft, top: surface.scrollTop };
        surface.setPointerCapture(event.pointerId);
        surface.classList.add("is-panning");
      }}
      onPointerMove={event => {
        if (!pan.current) return;
        event.currentTarget.scrollLeft = pan.current.left + pan.current.x - event.clientX;
        event.currentTarget.scrollTop = pan.current.top + pan.current.y - event.clientY;
      }}
      onLostPointerCapture={event => { pan.current = null; event.currentTarget.classList.remove("is-panning"); }}>
      <div className="comparison-pdf-page"><canvas ref={canvas} role="img" aria-label={`${label} PDF 第 ${pageNumber} 頁${rendered ? "（已顯示）" : "（載入中）"}`} />
        {links.map((link, index) => <button key={index} className="comparison-pdf-link" aria-label={`${label} PDF 內部連結 ${index + 1}`} style={{ left: Math.min(link.rect[0], link.rect[2]), top: Math.min(link.rect[1], link.rect[3]), width: Math.abs(link.rect[2] - link.rect[0]), height: Math.abs(link.rect[3] - link.rect[1]) }} onClick={() => void follow(link.dest)} />)}
      </div>
    </div>
    {error ? <p role="alert" className="comparison-pdf-overlay">這頁暫時無法顯示。<a href={externalUrl} target="_blank" rel="noopener noreferrer">另開 PDF</a></p> : message && <p role="status" className="comparison-pdf-overlay">{message}</p>}
    </div>
    <p className="comparison-pdf-caption" role="status">{locationNote || "拖曳圖面可移動位置"}</p>
  </div>;
}

async function resolveDestination(document: PDFDocumentProxy, destination: string | unknown[]) {
  const dest = typeof destination === "string" ? await document.getDestination(destination) : destination;
  if (!dest?.length || dest[0] == null) return null;
  const page = typeof dest[0] === "number" ? dest[0] + 1 : await document.getPageIndex(dest[0] as { num: number; gen: number }) + 1;
  if (!Number.isInteger(page) || page < 1 || page > document.numPages) return null;
  let centre: [number, number] | null = null;
  if ((dest[1] as { name?: string })?.name === "FitR") {
    const physical = await document.getPage(page);
    const [left, top, right, bottom] = physical.getViewport({ scale: 1 }).convertToViewportRectangle(dest.slice(2, 6) as number[]);
    centre = [(left + right) / 2, (top + bottom) / 2];
  }
  return { page, centre };
}
