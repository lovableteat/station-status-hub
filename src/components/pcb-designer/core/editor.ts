import { createId } from "../defaults.ts";
import type {
  PcbKeepout,
  PcbLibraryComponent,
  PcbMeasurement,
  PcbComponentArrangement,
  PcbPlacedComponent,
  PcbPoint,
  PcbProject,
  PcbSelection,
} from "../types.ts";
import {
  canPlaceComponent,
  getRotatedRectangleCorners,
  MAX_PLACEMENT_CHECKS,
  searchPlacement,
  snapValue,
  type PlacementSearchOptions,
} from "./geometry.ts";

export const MAX_PLACEMENT_COLLISION_TESTS = 250_000;

export interface PcbPlacementOptions extends PlacementSearchOptions {
  layer?: PcbPlacedComponent["layer"];
  exact?: boolean;
  bypassSnap?: boolean;
  rotation?: number;
}

export type PlacementResult =
  | { ok: true; project: PcbProject; component: PcbPlacedComponent }
  | { ok: false; reason: string; code?: "search-limit" };

export type MoveResult =
  | { ok: true; project: PcbProject; component: PcbPlacedComponent; changed: boolean }
  | { ok: false; reason: string };

export type KeepoutMoveResult =
  | { ok: true; project: PcbProject; keepout: PcbKeepout; changed: boolean }
  | { ok: false; reason: string };

export type GroupMoveResult =
  | { ok: true; project: PcbProject; components: PcbPlacedComponent[]; changed: boolean }
  | { ok: false; reason: string };

interface ComponentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export type KeepoutDuplicateResult =
  | { ok: true; project: PcbProject; keepout: PcbKeepout }
  | { ok: false; reason: string };

export type SelectionEdit =
  | { type: "delete" }
  | { type: "rotate" }
  | { type: "toggle-lock" }
  | { type: "nudge"; dx: number; dy: number };

const clone = <T>(value: T): T => structuredClone(value);

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function referencePrefix(component: PcbLibraryComponent): string {
  const normalized = `${component.type} ${component.name}`.toLocaleLowerCase();
  if (normalized.includes("resistor")) return "R";
  if (normalized.includes("capacitor")) return "C";
  if (normalized.includes("inductor")) return "L";
  if (normalized.includes("connector") || normalized.includes("header")) return "J";
  if (normalized.includes("led") || normalized.includes("diode")) return "D";
  if (normalized.includes("transistor")) return "Q";
  if (normalized.includes("processor") || normalized.includes("memory") || normalized.includes("ic")) return "U";
  return component.name.match(/[A-Za-z]/)?.[0]?.toUpperCase() ?? "X";
}

function nextReference(project: PcbProject, prefix: string): string {
  const used = new Set(project.components.map((component) => component.reference.toLocaleUpperCase()));
  let number = 1;
  while (used.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

export function placeLibraryComponent(
  project: PcbProject,
  libraryComponent: PcbLibraryComponent,
  preferred?: PcbPoint,
  reference?: string,
  placementOptions?: PcbPlacementOptions,
): PlacementResult {
  const base = clone(project);
  const candidate: PcbPlacedComponent = {
    ...clone(libraryComponent),
    instanceId: createId("instance"),
    reference: (() => {
      const requested = reference?.trim();
      const used = new Set(project.components.map((component) => component.reference.toLocaleUpperCase()));
      return requested && !used.has(requested.toLocaleUpperCase())
        ? requested
        : nextReference(project, referencePrefix(libraryComponent));
    })(),
    x: 0,
    y: 0,
    rotation: normalizeRotation(placementOptions?.rotation ?? 0),
    layer: placementOptions?.layer ?? "top",
    locked: false,
  };
  if (preferred && placementOptions?.exact) {
    const point = project.board.snapToGrid && !placementOptions.bypassSnap
      ? {
        x: snapValue(preferred.x, project.board.gridSize),
        y: snapValue(preferred.y, project.board.gridSize),
      }
      : preferred;
    const exactCandidate = { ...candidate, ...point };
    if (!canPlaceComponent(base, exactCandidate)) {
      return { ok: false, reason: "此位置超出板框，或與現有元件及禁制區重疊。" };
    }
    base.components.push(exactCandidate);
    return { ok: true, project: base, component: exactCandidate };
  }
  const exactPreferred = preferred && !project.board.snapToGrid
    ? { ...candidate, ...preferred }
    : null;
  const exactCenter = !project.board.snapToGrid
    ? {
      ...candidate,
      x: project.board.width / 2,
      y: project.board.height / 2,
    }
    : null;
  let position: PcbPoint | undefined;
  if (exactPreferred && canPlaceComponent(base, exactPreferred)) {
    position = preferred;
  } else if (exactCenter && canPlaceComponent(base, exactCenter)) {
    position = { x: exactCenter.x, y: exactCenter.y };
  } else {
    const obstacleCount = Math.max(
      1,
      base.components.length + base.keepouts.length,
    );
    const safePlacementOptions = placementOptions ?? {
      maxChecks: Math.max(
        1,
        Math.min(
          MAX_PLACEMENT_CHECKS,
          Math.floor(MAX_PLACEMENT_COLLISION_TESTS / obstacleCount),
        ),
      ),
    };
    const search = searchPlacement(
      base,
      candidate,
      preferred,
      safePlacementOptions,
    );
    if (search.status === "limit-reached") {
      return {
        ok: false,
        code: "search-limit",
        reason: "自動放置已達安全搜尋上限；項目仍保留，請縮小網格、調整禁制區或手動放置。",
      };
    }
    if (search.status === "placed") position = search.point;
  }
  if (!position) {
    return { ok: false, reason: "找不到可合法放置此元件的位置。" };
  }
  const component = { ...candidate, ...position };
  base.components.push(component);
  return { ok: true, project: base, component };
}

export function moveComponent(
  project: PcbProject,
  instanceId: string,
  point: PcbPoint,
  bypassSnap: boolean,
): MoveResult {
  const source = project.components.find((component) => component.instanceId === instanceId);
  if (!source) return { ok: false, reason: "找不到選取的元件。" };
  if (source.locked) return { ok: false, reason: "元件已鎖定，無法移動。" };
  const candidate = {
    ...source,
    x: project.board.snapToGrid && !bypassSnap
      ? snapValue(point.x, project.board.gridSize)
      : point.x,
    y: project.board.snapToGrid && !bypassSnap
      ? snapValue(point.y, project.board.gridSize)
      : point.y,
  };
  if (candidate.x === source.x && candidate.y === source.y) {
    return { ok: true, project, component: source, changed: false };
  }
  const next = clone(project);
  next.components = next.components.map((component) =>
    component.instanceId === instanceId ? candidate : component);
  return { ok: true, project: next, component: candidate, changed: true };
}

export function moveComponents(
  project: PcbProject,
  instanceIds: readonly string[],
  delta: PcbPoint,
  bypassSnap: boolean,
): GroupMoveResult {
  const uniqueIds = [...new Set(instanceIds)];
  if (!uniqueIds.length) return { ok: false, reason: "請先選取元件。" };
  if (![delta.x, delta.y].every(Number.isFinite)) {
    return { ok: false, reason: "群組移動位移必須為有效數值。" };
  }
  const sources = uniqueIds.map((instanceId) =>
    project.components.find((component) => component.instanceId === instanceId));
  if (sources.some((component) => !component)) {
    return { ok: false, reason: "找不到要移動的元件。" };
  }
  if ((sources as PcbPlacedComponent[]).every((component) => component.locked)) {
    return { ok: false, reason: "已鎖定元件不可群組移動。" };
  }
  const movableSources = (sources as PcbPlacedComponent[]).filter((component) => !component.locked);
  const appliedDelta = project.board.snapToGrid && !bypassSnap
    ? {
      x: snapValue(delta.x, project.board.gridSize),
      y: snapValue(delta.y, project.board.gridSize),
    }
    : { ...delta };
  if (appliedDelta.x === 0 && appliedDelta.y === 0) {
    return { ok: true, project, components: movableSources, changed: false };
  }

  const movedIds = new Set(movableSources.map((component) => component.instanceId));
  const candidates = new Map<string, PcbPlacedComponent>();
  for (const source of movableSources) {
    candidates.set(source.instanceId, {
      ...source,
      x: source.x + appliedDelta.x,
      y: source.y + appliedDelta.y,
    });
  }

  const next = clone(project);
  next.components = next.components.map((component) =>
    movedIds.has(component.instanceId)
      ? candidates.get(component.instanceId) ?? component
      : component);
  for (const candidate of candidates.values()) {
    if (!canPlaceComponent(next, candidate)) {
      return { ok: false, reason: "群組移動後超出板框或與既有物件衝突。" };
    }
  }
  return {
    ok: true,
    project: next,
    components: next.components.filter((component) => movedIds.has(component.instanceId)),
    changed: true,
  };
}

function visualComponentBounds(component: PcbPlacedComponent): ComponentBounds {
  const corners = getRotatedRectangleCorners(component);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

/**
 * Aligns selected components using their rotated visual bounds. Distribution
 * keeps the two outer components fixed and gives every gap the same size.
 */
export function arrangeComponents(
  project: PcbProject,
  instanceIds: readonly string[],
  arrangement: PcbComponentArrangement,
): GroupMoveResult {
  const uniqueIds = [...new Set(instanceIds)];
  const minimumCount = arrangement.startsWith("distribute-") ? 3 : 2;
  if (uniqueIds.length < minimumCount) {
    return {
      ok: false,
      reason: minimumCount === 3
        ? "均分至少需要選取 3 個元件。"
        : "對齊至少需要選取 2 個元件。",
    };
  }

  const components = uniqueIds.map((instanceId) =>
    project.components.find((component) => component.instanceId === instanceId));
  if (components.some((component) => !component)) {
    return { ok: false, reason: "找不到要對齊的元件。" };
  }
  const selected = components as PcbPlacedComponent[];
  if (selected.some((component) => component.locked)) {
    return { ok: false, reason: "選取範圍包含鎖定元件，請先解除元件鎖定。" };
  }

  const boundsById = new Map(selected.map((component) => [
    component.instanceId,
    visualComponentBounds(component),
  ]));
  const nextPositions = new Map(selected.map((component) => [
    component.instanceId,
    { x: component.x, y: component.y },
  ]));
  const allBounds = [...boundsById.values()];
  const groupLeft = Math.min(...allBounds.map((bounds) => bounds.left));
  const groupRight = Math.max(...allBounds.map((bounds) => bounds.right));
  const groupTop = Math.min(...allBounds.map((bounds) => bounds.top));
  const groupBottom = Math.max(...allBounds.map((bounds) => bounds.bottom));
  const groupCenterX = (groupLeft + groupRight) / 2;
  const groupCenterY = (groupTop + groupBottom) / 2;

  if (arrangement === "distribute-horizontal") {
    const sorted = [...selected].sort((first, second) => {
      const firstBounds = boundsById.get(first.instanceId)!;
      const secondBounds = boundsById.get(second.instanceId)!;
      return firstBounds.left - secondBounds.left
        || firstBounds.right - secondBounds.right
        || first.instanceId.localeCompare(second.instanceId);
    });
    const firstBounds = boundsById.get(sorted[0].instanceId)!;
    const lastBounds = boundsById.get(sorted.at(-1)!.instanceId)!;
    const totalWidth = sorted.reduce(
      (sum, component) => sum + boundsById.get(component.instanceId)!.width,
      0,
    );
    const gap = (lastBounds.right - firstBounds.left - totalWidth) / (sorted.length - 1);
    let cursor = firstBounds.left;
    for (const component of sorted) {
      const bounds = boundsById.get(component.instanceId)!;
      nextPositions.set(component.instanceId, {
        x: component.x + cursor - bounds.left,
        y: component.y,
      });
      cursor += bounds.width + gap;
    }
  } else if (arrangement === "distribute-vertical") {
    const sorted = [...selected].sort((first, second) => {
      const firstBounds = boundsById.get(first.instanceId)!;
      const secondBounds = boundsById.get(second.instanceId)!;
      return firstBounds.top - secondBounds.top
        || firstBounds.bottom - secondBounds.bottom
        || first.instanceId.localeCompare(second.instanceId);
    });
    const firstBounds = boundsById.get(sorted[0].instanceId)!;
    const lastBounds = boundsById.get(sorted.at(-1)!.instanceId)!;
    const totalHeight = sorted.reduce(
      (sum, component) => sum + boundsById.get(component.instanceId)!.height,
      0,
    );
    const gap = (lastBounds.bottom - firstBounds.top - totalHeight) / (sorted.length - 1);
    let cursor = firstBounds.top;
    for (const component of sorted) {
      const bounds = boundsById.get(component.instanceId)!;
      nextPositions.set(component.instanceId, {
        x: component.x,
        y: component.y + cursor - bounds.top,
      });
      cursor += bounds.height + gap;
    }
  } else {
    for (const component of selected) {
      const bounds = boundsById.get(component.instanceId)!;
      const position = nextPositions.get(component.instanceId)!;
      if (arrangement === "align-left") position.x += groupLeft - bounds.left;
      if (arrangement === "align-horizontal-center") position.x += groupCenterX - bounds.centerX;
      if (arrangement === "align-right") position.x += groupRight - bounds.right;
      if (arrangement === "align-top") position.y += groupTop - bounds.top;
      if (arrangement === "align-vertical-center") position.y += groupCenterY - bounds.centerY;
      if (arrangement === "align-bottom") position.y += groupBottom - bounds.bottom;
    }
  }

  const changed = selected.some((component) => {
    const position = nextPositions.get(component.instanceId)!;
    return Math.abs(position.x - component.x) > 1e-9
      || Math.abs(position.y - component.y) > 1e-9;
  });
  if (!changed) return { ok: true, project, components: selected, changed: false };

  const selectedIds = new Set(uniqueIds);
  const next = clone(project);
  next.components = next.components.map((component) => {
    if (!selectedIds.has(component.instanceId)) return component;
    return { ...component, ...nextPositions.get(component.instanceId)! };
  });
  return {
    ok: true,
    project: next,
    components: next.components.filter((component) => selectedIds.has(component.instanceId)),
    changed: true,
  };
}

export function moveKeepout(
  project: PcbProject,
  id: string,
  point: PcbPoint,
  bypassSnap: boolean,
): KeepoutMoveResult {
  const source = project.keepouts.find((keepout) => keepout.id === id);
  if (!source) return { ok: false, reason: "找不到選取的禁制區。" };
  if (![point.x, point.y].every(Number.isFinite)) {
    return { ok: false, reason: "禁制區座標無效。" };
  }
  const snappedX = project.board.snapToGrid && !bypassSnap
    ? snapValue(point.x, project.board.gridSize)
    : point.x;
  const snappedY = project.board.snapToGrid && !bypassSnap
    ? snapValue(point.y, project.board.gridSize)
    : point.y;
  const keepout = {
    ...source,
    x: clamp(snappedX, 0, Math.max(0, project.board.width - source.width)),
    y: clamp(snappedY, 0, Math.max(0, project.board.height - source.height)),
  };
  if (keepout.x === source.x && keepout.y === source.y) {
    return { ok: true, project, keepout: source, changed: false };
  }
  const next = clone(project);
  next.keepouts = next.keepouts.map((item) => item.id === id ? keepout : item);
  return { ok: true, project: next, keepout, changed: true };
}

export function duplicateKeepout(
  project: PcbProject,
  id: string,
  offset: PcbPoint,
): KeepoutDuplicateResult {
  const source = project.keepouts.find((keepout) => keepout.id === id);
  if (!source) return { ok: false, reason: "找不到要複製的禁佈區。" };
  if (![offset.x, offset.y].every(Number.isFinite)) {
    return { ok: false, reason: "禁佈區複製位移必須為有效數值。" };
  }
  const snappedOffset = project.board.snapToGrid
    ? {
      x: snapValue(offset.x, project.board.gridSize),
      y: snapValue(offset.y, project.board.gridSize),
    }
    : { ...offset };
  const minimumX = 0;
  const minimumY = 0;
  const maximumX = Math.max(0, project.board.width - source.width);
  const maximumY = Math.max(0, project.board.height - source.height);
  const unclampedX = source.x + snappedOffset.x;
  const unclampedY = source.y + snappedOffset.y;
  const x = clamp(unclampedX, minimumX, maximumX);
  const y = clamp(unclampedY, minimumY, maximumY);
  if ((snappedOffset.x !== 0 || snappedOffset.y !== 0) && x === source.x && y === source.y) {
    return { ok: false, reason: "找不到合法的禁佈區複製位置。" };
  }
  const keepout: PcbKeepout = {
    ...clone(source),
    id: createId("keepout"),
    name: `${source.name} 副本`,
    x,
    y,
  };
  const next = clone(project);
  next.keepouts.push(keepout);
  return { ok: true, project: next, keepout };
}

export function editSelectedObject(
  project: PcbProject,
  selection: PcbSelection | null,
  action: SelectionEdit,
): PcbProject {
  if (!selection) return project;
  const next = clone(project);
  if (selection.kind === "component") {
    const component = next.components.find((item) => item.instanceId === selection.id);
    if (!component) return project;
    if (component.locked && action.type !== "toggle-lock") return project;
    if (action.type === "delete") {
      next.components = next.components.filter((item) => item.instanceId !== selection.id);
    } else if (action.type === "rotate") {
      component.rotation = (component.rotation + 90) % 360;
    } else if (action.type === "toggle-lock") {
      component.locked = !component.locked;
    } else if (action.type === "nudge" && !component.locked) {
      const moved = moveComponent(next, component.instanceId, {
        x: component.x + action.dx,
        y: component.y + action.dy,
      }, true);
      return moved.ok ? moved.project : project;
    }
  } else if (selection.kind === "keepout") {
    if (action.type === "delete") {
      next.keepouts = next.keepouts.filter((item) => item.id !== selection.id);
    } else if (action.type === "nudge") {
      const keepout = next.keepouts.find((item) => item.id === selection.id);
      if (keepout) {
        const moved = moveKeepout(next, keepout.id, {
          x: keepout.x + action.dx,
          y: keepout.y + action.dy,
        }, true);
        return moved.ok ? moved.project : project;
      }
    } else if (action.type === "rotate") {
      const keepout = next.keepouts.find((item) => item.id === selection.id);
      if (keepout) keepout.rotation = normalizeRotation((keepout.rotation ?? 0) + 90);
    }
  } else if (action.type === "delete") {
    next.measurements = next.measurements.filter((item) => item.id !== selection.id);
  } else if (action.type === "nudge") {
    const measurement = next.measurements.find((item) => item.id === selection.id);
    if (measurement) {
      measurement.x1 += action.dx;
      measurement.y1 += action.dy;
      measurement.x2 += action.dx;
      measurement.y2 += action.dy;
    }
  }
  return next;
}

export function createKeepout(
  project: PcbProject,
  start: PcbPoint,
  end: PcbPoint,
): { project: PcbProject; keepout: PcbKeepout } | null {
  const x = Math.max(0, Math.min(start.x, end.x));
  const y = Math.max(0, Math.min(start.y, end.y));
  const width = Math.min(project.board.width, Math.max(start.x, end.x)) - x;
  const height = Math.min(project.board.height, Math.max(start.y, end.y)) - y;
  if (width <= 0 || height <= 0) return null;
  const keepout: PcbKeepout = {
    id: createId("keepout"),
    name: `禁制區 ${project.keepouts.length + 1}`,
    x,
    y,
    width,
    height,
    color: "#fb7185",
    rotation: 0,
  };
  const next = clone(project);
  next.keepouts.push(keepout);
  return { project: next, keepout };
}

export function createMeasurement(
  project: PcbProject,
  start: PcbPoint,
  end: PcbPoint,
): { project: PcbProject; measurement: PcbMeasurement } | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) return null;
  const measurement: PcbMeasurement = {
    id: createId("measurement"),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    color: "#facc15",
  };
  const next = clone(project);
  next.measurements.push(measurement);
  return { project: next, measurement };
}

export function selectionCenter(
  project: PcbProject,
  selection: PcbSelection | null,
): PcbPoint | null {
  if (!selection) return null;
  if (selection.kind === "component") {
    const component = project.components.find((item) => item.instanceId === selection.id);
    return component ? { x: component.x, y: component.y } : null;
  }
  if (selection.kind === "keepout") {
    const keepout = project.keepouts.find((item) => item.id === selection.id);
    return keepout
      ? { x: keepout.x + keepout.width / 2, y: keepout.y + keepout.height / 2 }
      : null;
  }
  const measurement = project.measurements.find((item) => item.id === selection.id);
  return measurement
    ? { x: (measurement.x1 + measurement.x2) / 2, y: (measurement.y1 + measurement.y2) / 2 }
    : null;
}
