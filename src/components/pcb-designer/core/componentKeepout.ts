import type { PcbComponentKeepout, PcbKeepout, PcbPlacedComponent, PcbPoint, PcbProject, PcbVisibleLayer } from "../types.ts";

export const KEEPOUT_SIDES = ["top", "right", "bottom", "left"] as const;
export const KEEPOUT_SIDE_LABELS = { top: "上側", right: "右側", bottom: "下側", left: "左側" } as const;
export const DEFAULT_COMPONENT_KEEPOUT: PcbComponentKeepout = { top: 1, right: 1, bottom: 1, left: 1 };
export const COMPONENT_KEEPOUT_COLOR = "#ef8354";

export function isValidComponentKeepout(value: unknown): value is PcbComponentKeepout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return KEEPOUT_SIDES.every((side) => {
    const margin = (value as Record<string, unknown>)[side];
    return typeof margin === "number" && Number.isFinite(margin) && margin >= 0;
  });
}

export function getComponentKeepoutBounds(component: PcbPlacedComponent) {
  const margins = component.keepout;
  if (!isValidComponentKeepout(margins)) return null;
  return {
    x: -component.width / 2 - margins.left,
    y: -component.height / 2 - margins.top,
    width: component.width + margins.left + margins.right,
    height: component.height + margins.top + margins.bottom,
  };
}

/** Derived geometry: no second stored object can become detached or move twice. */
export function getComponentKeepout(component: PcbPlacedComponent): PcbKeepout | null {
  const bounds = getComponentKeepoutBounds(component);
  if (!bounds) return null;
  const angle = component.rotation * Math.PI / 180;
  const localX = bounds.x + bounds.width / 2;
  const localY = bounds.y + bounds.height / 2;
  return {
    id: `component-keepout:${component.instanceId}`,
    name: `${component.reference} 禁制區`,
    x: component.x + localX * Math.cos(angle) - localY * Math.sin(angle) - bounds.width / 2,
    y: component.y + localX * Math.sin(angle) + localY * Math.cos(angle) - bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
    rotation: component.rotation,
    color: COMPONENT_KEEPOUT_COLOR,
  };
}

export function getRenderedKeepouts(project: PcbProject, visibleLayer: PcbVisibleLayer): (PcbKeepout & { componentId?: string; layer?: "top" | "bottom" })[] {
  return [...project.keepouts, ...project.components.flatMap((component) => {
    if (visibleLayer !== "all" && component.layer !== visibleLayer) return [];
    const keepout = getComponentKeepout(component);
    return keepout ? [{ ...keepout, componentId: component.instanceId, layer: component.layer }] : [];
  })];
}

/** Project a board-space pointer onto just one local side, including rotated parts. */
export function resizeComponentKeepoutSide(
  component: PcbPlacedComponent,
  side: keyof PcbComponentKeepout,
  point: PcbPoint,
  gridSize = 0,
): PcbComponentKeepout {
  const angle = component.rotation * Math.PI / 180;
  const dx = point.x - component.x;
  const dy = point.y - component.y;
  const x = dx * Math.cos(angle) + dy * Math.sin(angle);
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const distance = side === "left" ? -x - component.width / 2
    : side === "right" ? x - component.width / 2
      : side === "top" ? -y - component.height / 2 : y - component.height / 2;
  const margin = Math.max(0, gridSize > 0 ? Math.round(distance / gridSize) * gridSize : distance);
  return { ...(component.keepout ?? DEFAULT_COMPONENT_KEEPOUT), [side]: Math.round(margin * 10000) / 10000 };
}
