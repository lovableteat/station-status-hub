import { Check } from "lucide-react";
import type { ReactNode } from "react";
import "./circuitMotion.css";

/*
 * Feedback pieces of 線路修改 (2026-11-12). The user: 「按鈕，轉場，LOADING。SUCCES，都要設計一下啊，細節決定一切」.
 * Rules (vectorlab motion / loaders / reduced-motion): durations 100 / 150 / 200 / 300 ms, enter eases out and exit eases in,
 * only transform and opacity move, nothing bounces; a wait under 100 ms shows nothing, a wait on a button turns its icon into a
 * spinner after 100 ms, content that takes longer gets a skeleton of its own shape; with reduced motion everything is instant
 * or a short fade, and every state also has words (aria-busy, role="status").
 */

/** A button's icon. While the button's work runs the icon turns into a spinner, only after 100 ms so quick work shows nothing. */
export function CircuitBusyIcon({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <span className="circuit-busy-icon" data-busy={busy || undefined} aria-hidden="true">{children}{busy && <span className="circuit-spinner" />}</span>;
}

/** A small spinner beside a waiting line. */
export function CircuitSpinner() {
  return <span className="circuit-spinner" aria-hidden="true" />;
}

/** A bar under a waiting line: filled to `value` (0–1), or a moving bar when the length of the wait is unknown. */
export function CircuitProgress({ value }: { value?: number }) {
  const known = typeof value === "number" && Number.isFinite(value);
  return <span className="circuit-progress" data-indeterminate={known ? undefined : true} aria-hidden="true">
    <span style={known ? { transform: `scaleX(${Math.max(0, Math.min(1, value as number))})` } : undefined} />
  </span>;
}

/** Placeholder rows shaped like the problem list (number, title and one line under it, state). */
export function CircuitSkeletonRows({ rows = 5, label }: { rows?: number; label: string }) {
  return <div className="circuit-skeleton" role="status">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="circuit-skeleton-row" aria-hidden="true">
      <span className="circuit-skel" data-shape="number" />
      <span className="circuit-skeleton-text"><span className="circuit-skel" style={{ width: `${[72, 58, 80, 64, 50][index % 5]}%` }} /><span className="circuit-skel" data-shape="meta" style={{ width: `${[40, 34, 46, 30, 38][index % 5]}%` }} /></span>
      <span className="circuit-skel" data-shape="status" />
    </div>)}
  </div>;
}

export interface CircuitToastMessage { id: number; text: string; detail?: string; leaving?: boolean }

/** The "done" note of the window: a short line with a check, under the title bar, gone after a moment. It never takes taps. */
export function CircuitToast({ message }: { message: CircuitToastMessage | null }) {
  return <div className="circuit-toast-region" role="status" aria-live="polite">
    {message && <p key={message.id} className="circuit-toast" data-leaving={message.leaving || undefined}>
      <span className="circuit-toast-check"><Check aria-hidden="true" /></span>
      <span className="circuit-toast-text"><strong>{message.text}</strong>{message.detail && <small>{message.detail}</small>}</span>
    </p>}
  </div>;
}
