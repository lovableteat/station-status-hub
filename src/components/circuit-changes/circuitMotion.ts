/** Motion helpers of 線路修改: one place for the durations and curves, and for honouring reduced motion. */
export const CIRCUIT_EASE_OUT = "cubic-bezier(.16, 1, .3, 1)";
export const CIRCUIT_EASE_IN = "cubic-bezier(.7, 0, .84, 0)";
export const prefersReducedMotion = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

export type CircuitEnter = "push" | "pop" | "fade" | "rise";
/**
 * Plays the enter of a pane that has just been shown. "push": a deeper screen comes in from the right; "pop": going back, the
 * screen comes in from the left; "fade": a sibling (another tab, another problem); "rise": something new below. Moves are 8 px
 * at most; with reduced motion only the opacity changes. Nothing stays applied afterwards, so the pane keeps no transform.
 */
export function playCircuitEnter(element: Element | null | undefined, kind: CircuitEnter) {
  const node = element as HTMLElement | null | undefined;
  if (!node || typeof node.animate !== "function") return;
  const reduce = prefersReducedMotion();
  const offset = reduce ? "none" : kind === "push" ? "translateX(8px)" : kind === "pop" ? "translateX(-8px)" : kind === "rise" ? "translateY(6px)" : "none";
  const frames: Keyframe[] = [{ opacity: kind === "fade" || reduce ? 0.4 : 0, transform: offset }, { opacity: 1, transform: "none" }];
  try { node.animate(frames, { duration: reduce ? 100 : kind === "push" ? 200 : 150, easing: CIRCUIT_EASE_OUT }); } catch { /* motion is optional */ }
}
