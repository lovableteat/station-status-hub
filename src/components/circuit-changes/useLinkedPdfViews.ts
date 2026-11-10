import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type LinkedPdfPane = "active" | "compare";
export interface LinkedPdfPoint { x: number; y: number }
export interface LinkedPdfViewOptions {
  activeViewport: RefObject<HTMLDivElement>;
  compareViewport: RefObject<HTMLDivElement>;
  resetKey: string;
}
export interface LinkedPdfViews {
  linked: boolean;
  toggleLinked: () => void;
  onActiveScroll: () => void;
  onCompareScroll: () => void;
  /** Call before changing zoom or pane layout, while the old page geometry is still visible. */
  beforeResize: () => void;
  /** Call after this pane's rendered page dimensions have been committed. */
  afterResize: (pane: LinkedPdfPane) => void;
}

interface PdfGeometry {
  viewport: HTMLDivElement;
  width: number;
  height: number;
  left: number;
  top: number;
}

function geometry(viewport: HTMLDivElement | null): PdfGeometry | null {
  const surface = viewport?.querySelector<HTMLElement>(".circuit-pdf-surface");
  if (!viewport || !surface || !viewport.clientWidth || !viewport.clientHeight) return null;
  const page = surface.getBoundingClientRect(), host = viewport.getBoundingClientRect();
  if (!page.width || !page.height) return null;
  return {
    viewport, width: page.width, height: page.height,
    left: page.left - host.left - viewport.clientLeft + viewport.scrollLeft,
    top: page.top - host.top - viewport.clientTop + viewport.scrollTop,
  };
}

const unit = (value: number) => Math.max(0, Math.min(1, value));
function centre(page: PdfGeometry): LinkedPdfPoint {
  return {
    x: unit((page.viewport.scrollLeft + page.viewport.clientWidth / 2 - page.left) / page.width),
    y: unit((page.viewport.scrollTop + page.viewport.clientHeight / 2 - page.top) / page.height),
  };
}

/** Keep paired drawing coordinates together, independently of captions, viewport sizes, and scroll ranges. */
export function useLinkedPdfViews({ activeViewport, compareViewport, resetKey }: LinkedPdfViewOptions): LinkedPdfViews {
  const [linked, setLinked] = useState(true);
  const linkedRef = useRef(true);
  const refs = useRef({ active: activeViewport, compare: compareViewport });
  refs.current = { active: activeViewport, compare: compareViewport };
  const offset = useRef<LinkedPdfPoint>({ x: 0, y: 0 });
  const expected = useRef<Partial<Record<LinkedPdfPane, LinkedPdfPoint>>>({});
  const savedCentres = useRef<Partial<Record<LinkedPdfPane, LinkedPdfPoint>>>({});
  const frame = useRef<number | null>(null);
  const resizeFrames = useRef<Partial<Record<LinkedPdfPane, number>>>({});
  const pendingPane = useRef<LinkedPdfPane | null>(null);
  const lastPane = useRef<LinkedPdfPane>("active");

  const place = useCallback((page: PdfGeometry, point: LinkedPdfPoint, pane: LinkedPdfPane) => {
    const host = page.viewport;
    const left = Math.max(0, Math.min(host.scrollWidth - host.clientWidth, point.x * page.width + page.left - host.clientWidth / 2));
    const top = Math.max(0, Math.min(host.scrollHeight - host.clientHeight, point.y * page.height + page.top - host.clientHeight / 2));
    // Keep the expected clamped position until the user actually moves this pane. A feedback event
    // from a smaller sheet must never pull the original pane back from its requested position.
    expected.current[pane] = { x: left, y: top };
    host.scrollLeft = left;
    host.scrollTop = top;
    expected.current[pane] = { x: host.scrollLeft, y: host.scrollTop };
  }, []);

  const schedule = useCallback((pane: LinkedPdfPane) => {
    pendingPane.current = pane;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const sourcePane = pendingPane.current;
      pendingPane.current = null;
      if (!linkedRef.current || !sourcePane || savedCentres.current.active || savedCentres.current.compare) return;
      const targetPane = sourcePane === "active" ? "compare" : "active";
      const source = geometry(refs.current[sourcePane].current), target = geometry(refs.current[targetPane].current);
      if (!source || !target) return;
      const point = centre(source), direction = sourcePane === "active" ? 1 : -1;
      place(target, { x: point.x + offset.current.x * direction, y: point.y + offset.current.y * direction }, targetPane);
    });
  }, [place]);

  const scroll = useCallback((pane: LinkedPdfPane) => {
    const host = refs.current[pane].current, position = expected.current[pane];
    if (!host) return;
    if (position && Math.abs(host.scrollLeft - position.x) < 1 && Math.abs(host.scrollTop - position.y) < 1) return;
    // A canvas resize may trigger browser scroll anchoring before the other canvas is ready.
    // Those intermediate coordinates must not become the source of a new linked movement.
    if (savedCentres.current.active || savedCentres.current.compare) return;
    delete expected.current[pane];
    lastPane.current = pane;
    if (linkedRef.current) schedule(pane);
  }, [schedule]);

  const toggleLinked = useCallback(() => {
    const next = !linkedRef.current;
    if (next) {
      const active = geometry(refs.current.active.current), compare = geometry(refs.current.compare.current);
      if (active && compare) {
        const a = centre(active), b = centre(compare);
        offset.current = { x: b.x - a.x, y: b.y - a.y };
      }
    }
    linkedRef.current = next;
    setLinked(next);
  }, []);

  const beforeResize = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pendingPane.current = null;
    for (const pane of ["active", "compare"] as const) {
      if (resizeFrames.current[pane] !== undefined) cancelAnimationFrame(resizeFrames.current[pane]!);
      delete resizeFrames.current[pane];
      const page = geometry(refs.current[pane].current);
      // Both sheets render asynchronously. A second resize notification can arrive after one
      // canvas has grown, so retain its original focal point until its own layout commits.
      if (page && !savedCentres.current[pane]) savedCentres.current[pane] = centre(page);
    }
  }, []);

  const afterResize = useCallback((pane: LinkedPdfPane) => {
    if (resizeFrames.current[pane] !== undefined) cancelAnimationFrame(resizeFrames.current[pane]!);
    // A layout callback can still report the preceding canvas bounds while React has already
    // committed the new CSS size. Read the geometry in the next frame, immediately before paint.
    resizeFrames.current[pane] = requestAnimationFrame(() => {
      delete resizeFrames.current[pane];
      const page = geometry(refs.current[pane].current), saved = savedCentres.current[pane];
      if (!page) {
        if (!refs.current[pane].current?.querySelector(".circuit-pdf-surface")) delete savedCentres.current[pane];
        return;
      }
      if (saved) {
        place(page, saved, pane);
        delete savedCentres.current[pane];
      }
      if (linkedRef.current && !savedCentres.current.active && !savedCentres.current.compare) schedule(lastPane.current);
    });
  }, [place, schedule]);

  useLayoutEffect(() => {
    offset.current = { x: 0, y: 0 };
    expected.current = {};
    savedCentres.current = {};
    lastPane.current = "active";
    pendingPane.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const id of Object.values(resizeFrames.current)) cancelAnimationFrame(id);
    resizeFrames.current = {};
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pendingPane.current = null;
      for (const id of Object.values(resizeFrames.current)) cancelAnimationFrame(id);
      resizeFrames.current = {};
    };
  }, [resetKey]);

  const onActiveScroll = useCallback(() => scroll("active"), [scroll]);
  const onCompareScroll = useCallback(() => scroll("compare"), [scroll]);
  return { linked, toggleLinked, onActiveScroll, onCompareScroll, beforeResize, afterResize };
}
