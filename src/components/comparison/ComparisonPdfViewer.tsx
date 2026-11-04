import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { Artifact, TrackRow } from "./types";
import type { PdfLocation } from "./reviewTools";

/** Render locally, including the original engine's annotation appearances, without a PDF browser plug-in. */
export function ComparisonPdfViewer({ artifact, row, location, zoom, height, width, label }: {
  artifact: Artifact; row: TrackRow; location?: PdfLocation; zoom: number; height: number; width: number; label: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [message, setMessage] = useState("載入線路圖…");
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState(false);
  const [links, setLinks] = useState<Array<{ dest: string | unknown[]; rect: number[] }>>([]);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const targetCentre = useRef<[number, number] | null>(null);
  const [targetRevision, setTargetRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let destroy: (() => Promise<void>) | undefined;
    setDocument(null); setError(""); setMessage("載入線路圖…"); setRendered(false);
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
    return () => { active = false; renderTask.current?.cancel(); void destroy?.().catch(() => {}); };
  }, [artifact]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    void (async () => {
      let page = location?.page;
      targetCentre.current = location?.centre ?? null;
      if (!page && row.dest) {
        const dest = await document.getDestination(row.dest);
        if (dest) {
          page = typeof dest[0] === "number" ? dest[0] + 1 : await document.getPageIndex(dest[0]) + 1;
          if (dest[1]?.name === "FitR") {
            const physical = await document.getPage(page);
            const [left, top, right, bottom] = physical.getViewport({ scale: 1 }).convertToViewportRectangle(dest.slice(2, 6));
            targetCentre.current = [(left + right) / 2, (top + bottom) / 2];
          }
        }
      }
      if (!active) return;
      if (!page || page > document.numPages) { setError("此項目沒有可用的 PDF 定位；可用頁碼手動查看。"); return; }
      setError(""); setPageNumber(page); setTargetRevision(value => value + 1);
    })().catch(reason => { if (active) setError(`無法定位此項目：${reason instanceof Error ? reason.message : String(reason)}`); });
    return () => { active = false; };
  }, [document, row.key, row.dest, location]);

  useEffect(() => {
    if (!document || !canvas.current || !scroll.current) return;
    let active = true;
    const previous = renderTask.current;
    previous?.cancel();
    setRendered(false); setLinks([]); setMessage("繪製線路圖…");
    void (async () => {
      // A cancelled render still owns the canvas until its promise settles.
      await previous?.promise.catch(() => {});
      if (!active) return;
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = zoom ? zoom / 100 * 4 / 3 : Math.max(.1, (width - 24) / base.width);
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
    if (!document || !Number.isInteger(page) || page < 1 || page > document.numPages) return;
    targetCentre.current = null; setError(""); setPageNumber(page);
  };
  const follow = async (destination: string | unknown[]) => {
    if (!document) return;
    try {
      const dest = typeof destination === "string" ? await document.getDestination(destination) : destination;
      if (!dest) return;
      const number = typeof dest[0] === "number" ? dest[0] + 1 : await document.getPageIndex(dest[0] as { num: number; gen: number }) + 1;
      if (number < 1 || number > document.numPages) return;
      targetCentre.current = null;
      if ((dest[1] as { name?: string })?.name === "FitR") {
        const physical = await document.getPage(number);
        const rect = physical.getViewport({ scale: 1 }).convertToViewportRectangle(dest.slice(2, 6) as number[]);
        targetCentre.current = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
      }
      setError(""); setPageNumber(number); setTargetRevision(value => value + 1);
    } catch { setError("無法開啟這個 PDF 內部連結，請以頁碼查看。"); }
  };
  return <div className="comparison-pdf-viewer">
    <div className="comparison-pdf-controls">
      <button disabled={!document || pageNumber <= 1} onClick={() => manualPage(pageNumber - 1)} aria-label={`${label} 上一頁`}>上一頁</button>
      <label>頁碼<input aria-label={`${label} PDF 頁碼`} type="number" min={1} max={document?.numPages ?? 1} value={pageNumber} onChange={event => manualPage(Number(event.target.value))} /></label>
      <span>／{document?.numPages ?? "—"}</span>
      <button disabled={!document || pageNumber >= document.numPages} onClick={() => manualPage(pageNumber + 1)} aria-label={`${label} 下一頁`}>下一頁</button>
      <button disabled={!document} onClick={() => { setPageNumber(1); targetCentre.current = null; }}>標註索引</button>
    </div>
    {error && <p role="alert" className="comparison-pdf-message">{error}</p>}
    {message && <p role="status" className="comparison-pdf-message">{message}</p>}
    <div ref={scroll} className="comparison-pdf-scroll" style={{ height }} tabIndex={0} role="region" aria-label={`${label} 線路圖，可捲動`} aria-busy={!rendered}>
      <div className="comparison-pdf-page"><canvas ref={canvas} role="img" aria-label={`${label} PDF 第 ${pageNumber} 頁${rendered ? "（已顯示）" : "（載入中）"}`} />
        {links.map((link, index) => <button key={index} className="comparison-pdf-link" aria-label={`${label} PDF 內部連結 ${index + 1}`} style={{ left: Math.min(link.rect[0], link.rect[2]), top: Math.min(link.rect[1], link.rect[3]), width: Math.abs(link.rect[2] - link.rect[0]), height: Math.abs(link.rect[3] - link.rect[1]) }} onClick={() => void follow(link.dest)} />)}
      </div>
    </div>
  </div>;
}
