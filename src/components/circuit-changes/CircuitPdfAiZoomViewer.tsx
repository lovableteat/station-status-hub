import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Maximize2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CircuitCropRect } from "./circuitPdf";
import type { CircuitPdfAiFinding, CircuitPdfAiReviewReport, CircuitPdfReviewPage } from "./circuitPdfAiReview";
import { circuitPdfPageSize, CIRCUIT_PDF_RENDER_BUDGET, renderCircuitPdfPage } from "./pdfRender";
import { useSharpPdfRegion } from "./useSharpPdfRegion";
import { circuitMarkTagStyle, placeCircuitMarkTags } from "./circuitPdfMarkTags";

type Side = "official" | "working";
type Mode = "both" | Side;
const SIDE_LABEL: Record<Side, string> = { official: "基準版", working: "比對版" };
// Up to 16× (2026-11-23 「為何不能進一步放大」, it stopped at 8× and went soft there): past 4× the whole page is drawn coarser and
// useSharpPdfRegion draws the part on screen again at full sharpness.
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const DEEP_ZOOM_BUDGET = 8_000_000;
const boxOf = (finding: CircuitPdfAiFinding, side: Side) => (side === "official" ? finding.officialBox : finding.workingBox) ?? null;

/** One drawing at the chosen zoom, sharpened again from the PDF every time the zoom changes, with the differences boxed. */
function ZoomPane({ source, side, findings, zoom, selected, onSelect, centre, register, onScrolled }: {
  source: CircuitPdfReviewPage; side: Side; findings: CircuitPdfAiFinding[]; zoom: number; selected: string;
  onSelect: (id: string) => void;
  /** Where the middle of the pane should be after the next drawing, as fractions of the page. */
  centre: { x: number; y: number; token: number };
  register: (side: Side, node: HTMLDivElement | null) => void;
  onScrolled: (side: Side, middle: { x: number; y: number }) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null), canvas = useRef<HTMLCanvasElement>(null), sheet = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState<{ width: number; height: number } | null>(null);
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null);
  // Tags of neighbouring marks step aside instead of piling up (2026-11-24).
  const tagOffsets = useMemo(() => drawn ? placeCircuitMarkTags(findings.flatMap(finding => { const rect = boxOf(finding, side); return rect ? [{ id: finding.id, rect }] : []; }), drawn.width, drawn.height) : null, [drawn, findings, side]);
  const [failed, setFailed] = useState(false);
  const middle = useRef({ x: 0.5, y: 0.5 });
  // While a new zoom or place is being drawn, scroll events come from the drawing itself (and from the other pane
  // following); they must not replace the place the user asked for.
  const settling = useRef(false);
  const place = useRef(false);
  const label = SIDE_LABEL[side];

  useEffect(() => {
    let current = true;
    setPage(null); setDrawn(null); setFailed(false);
    void circuitPdfPageSize(source.pdf, source.page).then(size => { if (current) setPage(size); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [source.pdf, source.page]);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setFrame({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { middle.current = { x: centre.x, y: centre.y }; settling.current = true; }, [centre]);

  const fit = page && frame.width > 40 && frame.height > 40 ? Math.min((frame.width - 16) / page.width, (frame.height - 16) / page.height) : 0;
  const scale = fit * zoom;
  const budget = zoom > 4 ? DEEP_ZOOM_BUDGET : CIRCUIT_PDF_RENDER_BUDGET;
  const sharp = useSharpPdfRegion({ pdf: source.pdf, page: source.page, scale, size: drawn, surface: sheet, clip: scroller, budget });
  useEffect(() => {
    const output = canvas.current, node = scroller.current;
    if (!output || !node || !scale) return;
    const controller = new AbortController();
    settling.current = true;
    // A short wait so stepping through several zoom levels draws only the last one.
    const timer = window.setTimeout(() => {
      void renderCircuitPdfPage(source.pdf, source.page, output, scale, controller.signal, budget).then(size => {
        if (!size || controller.signal.aborted) return;
        place.current = true;
        setDrawn({ ...size });
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, 90);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [source.pdf, source.page, scale, centre.token, budget]);
  // The place is set once the sheet really has its new size on screen: set any earlier, the browser clamps it to the
  // old size (the pane was not scrollable yet) and the chosen difference ends up off to one side.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !drawn || !place.current) return;
    place.current = false;
    let frame = 0, tries = 0;
    const laidOut = () => (drawn.width <= node.clientWidth || node.scrollWidth >= drawn.width - 2) && (drawn.height <= node.clientHeight || node.scrollHeight >= drawn.height - 2);
    const apply = () => {
      if (!laidOut() && tries++ < 30) { frame = requestAnimationFrame(apply); return; }
      node.scrollLeft = middle.current.x * drawn.width - node.clientWidth / 2;
      node.scrollTop = middle.current.y * drawn.height - node.clientHeight / 2;
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { settling.current = false; }); });
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [drawn]);

  const remember = () => {
    const node = scroller.current;
    if (!node || !drawn || settling.current) return;
    middle.current = { x: (node.scrollLeft + node.clientWidth / 2) / drawn.width, y: (node.scrollTop + node.clientHeight / 2) / drawn.height };
    onScrolled(side, middle.current);
  };
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  return <figure className="circuit-pdf-ai-zoom-pane" data-side={side}>
    <figcaption><strong>{label}</strong><span title={source.name}>{source.name}</span><b>第 {source.page} 頁</b></figcaption>
    <div ref={node => { scroller.current = node; register(side, node); }} className="circuit-pdf-ai-zoom-scroll" tabIndex={0} aria-label={`${label}放大圖，可拖曳或捲動`} onScroll={remember}
      onPointerDown={event => { if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return; const node = scroller.current!; drag.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }; node.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current, node = scroller.current; if (!start || !node) return; node.scrollLeft = start.left - (event.clientX - start.x); node.scrollTop = start.top - (event.clientY - start.y); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div ref={sheet} className="circuit-pdf-ai-zoom-sheet" style={drawn ? { width: drawn.width, height: drawn.height } : undefined}>
        <canvas ref={canvas} role="img" aria-label={`${label}第 ${source.page} 頁放大圖`} hidden={!drawn} />
        <canvas ref={sharp.canvas} className="circuit-pdf-ai-zoom-detail-canvas" aria-hidden="true" hidden={!drawn || !sharp.shown} />
        {drawn && findings.map(finding => {
          const rect = boxOf(finding, side) as CircuitCropRect | null;
          if (!rect) return null;
          return <button key={finding.id} type="button" className="circuit-pdf-ai-annotation-box" data-certainty={finding.certainty ?? "suspected"} data-selected={selected === finding.id}
            aria-label={`放大圖 ${label} ${finding.id}：${finding.title}`} aria-pressed={selected === finding.id} title={`${finding.id} · ${finding.title}`}
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, minHeight: 0, ...circuitMarkTagStyle(tagOffsets?.get(finding.id)) }}
            onClick={() => onSelect(finding.id)}><span aria-hidden="true">{finding.id}</span></button>;
        })}
      </div>
      {!drawn && <p role="status">{failed ? "圖面無法顯示，請關閉後重試。" : "正在畫出圖面…"}</p>}
    </div>
  </figure>;
}

/**
 * 放大檢視 (2026-11-19, 「為何不能放大看」): both versions of one page, large, side by side or one at a time, zoomed
 * and moved together, with every difference boxed. Choosing a difference zooms to it on both drawings.
 */
export function CircuitPdfAiZoomViewer({ open, onOpenChange, report, official, working, startFinding, onOpenFinding }: {
  open: boolean; onOpenChange: (open: boolean) => void; report: CircuitPdfAiReviewReport;
  official: CircuitPdfReviewPage; working: CircuitPdfReviewPage;
  /** The difference to zoom to when the viewer opens. */
  startFinding?: string;
  /** Leaves the viewer and unfolds that difference in the list. */
  onOpenFinding: (id: string) => void;
}) {
  const findings = useMemo(() => report.findings.filter(item => item.decision !== "dismissed"), [report]);
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;
  const [mode, setMode] = useState<Mode>(narrow ? "working" : "both");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState("");
  // 隱藏標註: the bare drawing, to read what a box sits on (H).
  const [marksHidden, setMarksHidden] = useState(false);
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5, token: 0 });
  const panes = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const leading = useRef<Side | null>(null);
  /** The part of the sheet in the middle of the view, so switching the version shown stays on the same place. */
  const place = useRef({ x: 0.5, y: 0.5 });
  const show = (next: Mode) => { setMode(next); setCentre(value => ({ ...place.current, token: value.token + 1 })); };
  const register = useCallback((side: Side, node: HTMLDivElement | null) => { panes.current[side] = node; }, []);

  const focus = useCallback((id: string) => {
    const finding = findings.find(item => item.id === id);
    setSelected(id);
    const rect = finding ? boxOf(finding, "working") ?? boxOf(finding, "official") : null;
    if (!rect) return;
    setZoom(value => Math.max(value, 3));
    place.current = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    setCentre(value => ({ ...place.current, token: value.token + 1 }));
  }, [findings]);
  useEffect(() => {
    if (!open) return;
    setZoom(1); setSelected(""); place.current = { x: 0.5, y: 0.5 }; setCentre(value => ({ x: 0.5, y: 0.5, token: value.token + 1 }));
    if (startFinding) focus(startFinding);
  // Only when the viewer opens: later changes to the report keep the place the user is looking at.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The two drawings move together: the one being scrolled leads, the other follows by the same share of its size.
  const follow = useCallback((side: Side, middle: { x: number; y: number }) => {
    place.current = middle;
    const from = panes.current[side], to = panes.current[side === "official" ? "working" : "official"];
    if (!from || !to || (leading.current && leading.current !== side)) return;
    leading.current = side;
    const share = (value: number, size: number, view: number) => size > view ? value / (size - view) : 0;
    to.scrollLeft = share(from.scrollLeft, from.scrollWidth, from.clientWidth) * Math.max(0, to.scrollWidth - to.clientWidth);
    to.scrollTop = share(from.scrollTop, from.scrollHeight, from.clientHeight) * Math.max(0, to.scrollHeight - to.clientHeight);
    window.setTimeout(() => { if (leading.current === side) leading.current = null; }, 80);
  }, []);

  const step = useCallback((direction: 1 | -1) => setZoom(value => {
    const index = ZOOMS.findIndex(item => item >= value - 1e-6);
    return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (index < 0 ? ZOOMS.length - 1 : index) + direction))];
  }), []);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = surface.current;
    if (!node || !open) return;
    // Ctrl + wheel zooms the drawings instead of the whole browser page.
    const wheel = (event: WheelEvent) => { if (!event.ctrlKey) return; event.preventDefault(); step(event.deltaY < 0 ? 1 : -1); };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [open, step]);

  const current = findings.find(item => item.id === selected);
  const sides: Side[] = mode === "both" ? ["official", "working"] : [mode];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent hideCloseButton className="circuit-pdf-ai-zoom" data-testid="circuit-pdf-ai-zoom"
    data-marks={marksHidden ? "hidden" : "shown"}
    onKeyDown={event => { if ((event.target as HTMLElement).closest("input, textarea, select")) return; if (event.key === "h" || event.key === "H") { event.preventDefault(); setMarksHidden(value => !value); } if (event.key === "+" || event.key === "=") { event.preventDefault(); step(1); } if (event.key === "-") { event.preventDefault(); step(-1); } if (event.key === "0") { event.preventDefault(); setZoom(1); } }}>
    <header className="circuit-pdf-ai-zoom-bar">
      <div><DialogTitle><Maximize2 aria-hidden="true" />放大檢視</DialogTitle><DialogDescription>兩版一起縮放與移動，最大 1600%。拖曳圖面移動（框裡也可以拖），按 Ctrl 加滾輪或右邊的按鈕縮放，按 H 暫時隱藏標註。</DialogDescription></div>
      <div className="circuit-pdf-ai-zoom-modes" role="group" aria-label="顯示哪一版">
        {(["both", "official", "working"] as const).map(item => <button key={item} type="button" aria-pressed={mode === item} title={item === "both" ? "基準版與比對版並排，一起移動" : `只看${SIDE_LABEL[item]}；來回切換可以看出哪裡不一樣`} onClick={() => show(item)}>{item === "both" ? "兩版並排" : SIDE_LABEL[item]}</button>)}
      </div>
      <div className="circuit-pdf-ai-zoom-steps" role="group" aria-label="縮放">
        <Button type="button" variant="outline" aria-label="縮小" title="縮小（鍵盤 -）" disabled={zoom <= ZOOMS[0]} onClick={() => step(-1)}><Minus aria-hidden="true" /></Button>
        <output aria-live="polite" aria-label="目前縮放">{Math.round(zoom * 100)}%</output>
        <Button type="button" variant="outline" aria-label="放大" title="放大（鍵盤 +）" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}><Plus aria-hidden="true" /></Button>
        <Button type="button" variant="outline" title="縮回整頁（鍵盤 0）" disabled={zoom === 1} onClick={() => { setZoom(1); place.current = { x: 0.5, y: 0.5 }; setCentre(value => ({ x: 0.5, y: 0.5, token: value.token + 1 })); }}>整頁</Button>
      </div>
      {findings.length > 0 && <Button type="button" variant="outline" className="circuit-pdf-ai-zoom-marks" aria-pressed={marksHidden} title={marksHidden ? "把 AI 找到的地方再框出來（鍵盤 H）" : "暫時拿掉框，看清楚框裡原本的線路（鍵盤 H）"} onClick={() => setMarksHidden(value => !value)}>{marksHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{marksHidden ? "顯示標註" : "隱藏標註"}</Button>}
      <Button type="button" variant="ghost" aria-label="關閉放大檢視" title="關閉放大檢視，回到比對結果" onClick={() => onOpenChange(false)}><X aria-hidden="true" /></Button>
    </header>
    {findings.length > 0 && <nav className="circuit-pdf-ai-zoom-findings" aria-label="跳到差異">
      <span>跳到差異</span>
      {findings.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} data-certainty={item.certainty ?? "suspected"} disabled={!boxOf(item, "working") && !boxOf(item, "official")}
        title={!boxOf(item, "working") && !boxOf(item, "official") ? `${item.title}（沒有標出位置）` : `放大到 ${item.id}：${item.title}`} onClick={() => focus(item.id)}><b>{item.id}</b>{item.title}</button>)}
    </nav>}
    {current && <section className="circuit-pdf-ai-zoom-detail" aria-label={`${current.id} 的兩版證據`}>
      <strong>{current.id} · {current.title}</strong>
      <p><b>基準版</b>{current.officialEvidence}</p><p><b>比對版</b>{current.workingEvidence}</p>
      <Button type="button" variant="outline" title="關閉放大檢視，打開這一項的判讀與備註" onClick={() => { onOpenChange(false); onOpenFinding(current.id); }}>判讀這一項</Button>
    </section>}
    <div ref={surface} className="circuit-pdf-ai-zoom-stage" data-mode={mode}>
      {sides.map(side => <ZoomPane key={`${side}:${(side === "official" ? official : working).id}:${(side === "official" ? official : working).page}`} source={side === "official" ? official : working} side={side}
        findings={findings} zoom={zoom} selected={selected} onSelect={focus} centre={centre} register={register} onScrolled={follow} />)}
    </div>
  </DialogContent></Dialog>;
}
