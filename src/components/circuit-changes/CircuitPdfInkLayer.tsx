import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { CIRCUIT_PDF_INK_COLOR, CIRCUIT_PDF_INK_MAX_POINTS, CIRCUIT_PDF_INK_WIDTH, type CircuitPdfInkStroke } from "./circuitPdfInk";
import "./circuitPdfInk.css";

type Point = { x: number; y: number };
export type CircuitPdfTool = "pan" | "crop" | "pen" | "erase";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const path = (points: Point[], width: number, height: number) => (points.length === 1 ? [points[0], points[0]] : points).map((point, index) => `${index ? "L" : "M"}${point.x * width},${point.y * height}`).join(" ");

/** Normalized strokes remain attached to their own PDF page while the rendered canvas changes size. */
export function CircuitPdfInkLayer({ strokes, width, height, tool, space, label, onAdd, onRemove, onTarget }: {
  strokes: CircuitPdfInkStroke[]; width: number; height: number; tool: CircuitPdfTool; space: RefObject<boolean>; label: string;
  onAdd: (points: Point[]) => void; onRemove: (id: string) => void; onTarget: () => void;
}) {
  const drawing = useRef<{ pointer: number; points: Point[] } | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape" && drawing.current) { event.preventDefault(); event.stopPropagation(); drawing.current = null; setDraft([]); } };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, []);
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  };
  const append = (value: Point) => {
    const current = drawing.current;
    if (!current) return;
    const last = current.points.at(-1)!;
    if (Math.hypot(last.x - value.x, last.y - value.y) < .0004) return;
    // Keep the whole gesture when a long stroke exceeds the point budget, at lower sampling density.
    if (current.points.length >= CIRCUIT_PDF_INK_MAX_POINTS) current.points = current.points.filter((_, index) => index % 2 === 0);
    current.points.push(value);
  };
  const saved = useMemo(() => strokes.map(stroke => <g key={stroke.id} data-ink-id={stroke.id}>
    <title>{stroke.byName || "同仁"} · {new Date(stroke.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</title>
    <path className="circuit-pdf-ink-stroke" d={path(stroke.points, width, height)} stroke={stroke.color} strokeWidth={stroke.width * width} />
    {tool === "erase" && <path className="circuit-pdf-ink-hit" d={path(stroke.points, width, height)} strokeWidth={Math.max(16, stroke.width * width + 12)}
      onPointerDown={event => { if (event.button !== 0 || space.current) return; event.preventDefault(); event.stopPropagation(); onTarget(); onRemove(stroke.id); }} />}
  </g>), [strokes, width, height, tool, space, onRemove, onTarget]);
  return <svg className="circuit-pdf-ink-layer" data-tool={tool} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label}，${strokes.length} 筆畫筆標註`}
    onPointerDown={event => {
      if (tool !== "pen" || event.button !== 0 || space.current) return;
      event.preventDefault(); event.stopPropagation(); onTarget();
      drawing.current = { pointer: event.pointerId, points: [point(event)] };
      event.currentTarget.setPointerCapture(event.pointerId); setDraft([...drawing.current.points]);
    }}
    onPointerMove={event => {
      if (!drawing.current || drawing.current.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); append(point(event)); setDraft([...drawing.current.points]);
    }}
    onPointerUp={event => {
      const current = drawing.current;
      if (!current || current.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); append(point(event));
      const points = current.points.length === 1 ? [current.points[0], current.points[0]] : current.points;
      drawing.current = null; setDraft([]); onAdd(points);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drawing.current = null; setDraft([]); }} onLostPointerCapture={() => { drawing.current = null; setDraft([]); }}>
    {saved}
    {draft.length > 0 && <path className="circuit-pdf-ink-stroke" data-ink-draft="true" d={path(draft, width, height)} stroke={CIRCUIT_PDF_INK_COLOR} strokeWidth={CIRCUIT_PDF_INK_WIDTH * width} />}
  </svg>;
}
