import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { circuitPdfRenderRatio, CIRCUIT_PDF_RENDER_BUDGET, renderCircuitPdfRegion } from "./pdfRender";

/**
 * Deep zoom that stays sharp (2026-11-23 「為何不能進一步放大，我要更清楚」). A whole page zoomed far in would need hundreds of
 * millions of pixels, so it is drawn coarser (see CIRCUIT_PDF_RENDER_BUDGET); this draws again, at the screen's full sharpness,
 * just the part of the page that is on screen (plus a margin), a moment after scrolling or zooming stops. Nothing happens while
 * the whole page is already sharp.
 *
 * `surface` is the element the size of the zoomed page; `clip` the element(s) whose box is the visible window onto it (all of
 * them are intersected, so a pane inside a scrolling stage works whichever one scrolls).
 * Put the returned canvas inside `surface`, absolutely positioned (it places itself).
 */
export function useSharpPdfRegion({ pdf, page, scale, size, surface, clip, budget = CIRCUIT_PDF_RENDER_BUDGET }: {
  pdf: PDFDocumentProxy | null | undefined; page: number; scale: number;
  size: { width: number; height: number } | null;
  surface: RefObject<HTMLElement | null>; clip: RefObject<HTMLElement | null> | ReadonlyArray<RefObject<HTMLElement | null>>; budget?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const output = canvas.current;
    if (!pdf || !size || !scale || !output) return;
    if (circuitPdfRenderRatio(size.width, size.height, budget) >= (window.devicePixelRatio || 1) - 0.01) return;
    let controller: AbortController | null = null, timer = 0;
    const draw = () => {
      const sheet = surface.current;
      const windows = (Array.isArray(clip) ? clip : [clip]).map(item => (item as RefObject<HTMLElement | null>).current).filter((item): item is HTMLElement => Boolean(item));
      if (!sheet || !windows.length) return;
      const box = sheet.getBoundingClientRect();
      const view = windows.map(item => item.getBoundingClientRect()).reduce((acc, rect) => ({ left: Math.max(acc.left, rect.left), top: Math.max(acc.top, rect.top), right: Math.min(acc.right, rect.right), bottom: Math.min(acc.bottom, rect.bottom) }), { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity });
      if (!box.width || !box.height) return;
      const toPage = size.width / box.width;
      const margin = 160;
      const left = Math.max(0, (Math.max(view.left, box.left) - box.left) * toPage - margin);
      const top = Math.max(0, (Math.max(view.top, box.top) - box.top) * toPage - margin);
      const right = Math.min(size.width, (Math.min(view.right, box.right) - box.left) * toPage + margin);
      const bottom = Math.min(size.height, (Math.min(view.bottom, box.bottom) - box.top) * toPage + margin);
      if (right - left < 8 || bottom - top < 8) return;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      void renderCircuitPdfRegion(pdf, page, output, scale, { x: left, y: top, width: right - left, height: bottom - top }, signal)
        .then(done => { if (done && !signal.aborted) setShown(true); })
        .catch(() => { /* the coarser whole page stays on screen */ });
    };
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(draw, 140); };
    schedule();
    // Any scrolling ancestor moves the page under the window, so listen in the capture phase.
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => { window.clearTimeout(timer); controller?.abort(); document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); };
  // clip is a stable ref or a list of stable refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, page, scale, size?.width, size?.height, budget, surface]);
  return { canvas, shown };
}
