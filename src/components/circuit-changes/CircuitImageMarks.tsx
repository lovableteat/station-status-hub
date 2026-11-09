import type { CircuitImageMark } from "./types";
import "./circuitImageViewer.css";

/** Numbered pins and boxes drawn over an image. The parent must be positioned and exactly as large as the picture. */
export function CircuitImageMarks({ marks, draft }: {
  marks: CircuitImageMark[]; draft?: { x: number; y: number; width: number; height: number } | null;
}) {
  if (!marks.length && !draft) return null;
  return <>
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" className="circuit-image-marks">
      {marks.filter(mark => mark.kind === "box").map(mark => <rect key={mark.id} x={mark.x * 1000} y={mark.y * 1000} width={(mark.width ?? 0) * 1000} height={(mark.height ?? 0) * 1000} vectorEffect="non-scaling-stroke" />)}
      {draft && <rect className="circuit-image-mark-draft" x={draft.x * 1000} y={draft.y * 1000} width={draft.width * 1000} height={draft.height * 1000} vectorEffect="non-scaling-stroke" />}
    </svg>
    {marks.map((mark, index) => <span key={mark.id} aria-hidden="true" className="circuit-image-pin" style={{ left: `clamp(12px, ${mark.x * 100}%, calc(100% - 12px))`, top: `clamp(12px, ${mark.y * 100}%, calc(100% - 12px))` }}>{index + 1}</span>)}
  </>;
}
