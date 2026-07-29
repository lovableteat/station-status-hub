import { createId } from "../defaults.ts";
import type {
  PcbKeepout,
  PcbLibraryComponent,
  PcbMeasurement,
  PcbPlacedComponent,
  PcbPoint,
  PcbProject,
  PcbSelection,
} from "../types.ts";
import {
  canPlaceComponent,
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

export type SelectionEdit =
  | { type: "delete" }
  | { type: "rotate" }
  | { type: "toggle-lock" }
  | { type: "nudge"; dx: number; dy: number };

const clone = <T>(value: T): T => structuredClone(value);

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

export function moveKeepout(
  project: PcbProject,
  id: string,
  point: PcbPoint,
  bypassSnap: boolean,
): KeepoutMoveResult {
  const source = project.keepouts.find((keepout) => keepout.id === id);
  if (!source) return { ok: false, reason: "找不到選取的禁制區。" };
  const keepout = {
    ...source,
    x: project.board.snapToGrid && !bypassSnap
      ? snapValue(point.x, project.board.gridSize)
      : point.x,
    y: project.board.snapToGrid && !bypassSnap
      ? snapValue(point.y, project.board.gridSize)
      : point.y,
  };
  if (keepout.x === source.x && keepout.y === source.y) {
    return { ok: true, project, keepout: source, changed: false };
  }
  const next = clone(project);
  next.keepouts = next.keepouts.map((item) => item.id === id ? keepout : item);
  return { ok: true, project: next, keepout, changed: true };
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
        keepout.x += action.dx;
        keepout.y += action.dy;
      }
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
