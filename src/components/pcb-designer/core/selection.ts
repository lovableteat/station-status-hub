import { createId } from "../defaults.ts";
import type {
  PcbKeepout,
  PcbMeasurement,
  PcbPoint,
  PcbProject,
  PcbVisibleLayer,
} from "../types.ts";
import { placeLibraryComponent } from "./editor.ts";
import { getRotatedRectangleCorners, overlapsKeepout } from "./geometry.ts";

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function deletePcbSelection(project: PcbProject, objectIds: readonly string[]):
  | { ok: true; project: PcbProject; count: number }
  | { ok: false; reason: string } {
  const ids = new Set(objectIds);
  const locked = project.components.filter((item) => ids.has(item.instanceId) && item.locked);
  if (locked.length) {
    return { ok: false, reason: `選取範圍包含 ${locked.length} 個鎖定元件，請先解除鎖定；尚未刪除任何項目。` };
  }
  const components = project.components.filter((item) => !ids.has(item.instanceId));
  const keepouts = project.keepouts.filter((item) => !ids.has(item.id));
  const measurements = project.measurements.filter((item) => !ids.has(item.id));
  const count = project.components.length - components.length
    + project.keepouts.length - keepouts.length
    + project.measurements.length - measurements.length;
  if (!count) return { ok: false, reason: "請先選取要刪除的元件或物件。" };
  return { ok: true, project: { ...project, components, keepouts, measurements }, count };
}

export interface DuplicatePcbSelectionResult {
  project: PcbProject;
  objectIds: string[];
  idMap: Map<string, string>;
  usedOverlapFallback: boolean;
}

function appendMeasurementCopies(
  source: PcbProject,
  target: PcbProject,
  objectIds: readonly string[],
  offset: PcbPoint,
  idMap: Map<string, string>,
): void {
  const ids = new Set(objectIds);
  for (const line of source.measurements) {
    if (!ids.has(line.id)) continue;
    const copy: PcbMeasurement = {
      ...line,
      id: createId("measurement"),
      x1: line.x1 + offset.x,
      y1: line.y1 + offset.y,
      x2: line.x2 + offset.x,
      y2: line.y2 + offset.y,
    };
    target.measurements.push(copy);
    idMap.set(line.id, copy.id);
  }
}

function measurementCopyOffset(project: PcbProject, objectIds: readonly string[]): PcbPoint {
  const lines = project.measurements.filter((line) => objectIds.includes(line.id));
  const first = lines[0];
  const step = Math.max(project.board.gridSize, 1) * 2;
  const vertical = Math.abs(first.y2 - first.y1) > Math.abs(first.x2 - first.x1);
  // Measurements may sit outside the board. Translate both endpoints together,
  // and keep repeated pastes apart without clipping or changing the dimension.
  for (let index = 1; ; index += 1) {
    const offset = { x: vertical ? step * index : 0, y: vertical ? 0 : step * index };
    const overlaps = lines.some((line) => project.measurements.some((existing) =>
      Math.abs(existing.x1 - line.x1 - offset.x) < 0.001
      && Math.abs(existing.y1 - line.y1 - offset.y) < 0.001
      && Math.abs(existing.x2 - line.x2 - offset.x) < 0.001
      && Math.abs(existing.y2 - line.y2 - offset.y) < 0.001));
    if (!overlaps) return offset;
  }
}

function normalizedBounds(start: PcbPoint, end: PcbPoint): Bounds {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

function intersects(first: Bounds, second: Bounds): boolean {
  return first.left <= second.right
    && first.right >= second.left
    && first.top <= second.bottom
    && first.bottom >= second.top;
}

function componentBounds(component: PcbProject["components"][number]): Bounds {
  const corners = getRotatedRectangleCorners(component);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function keepoutBounds(keepout: PcbKeepout): Bounds {
  return {
    left: keepout.x,
    top: keepout.y,
    right: keepout.x + keepout.width,
    bottom: keepout.y + keepout.height,
  };
}

export function getMarqueeSelectionIds(
  project: PcbProject,
  start: PcbPoint,
  end: PcbPoint,
  visibleLayer: PcbVisibleLayer,
): string[] {
  const marquee = normalizedBounds(start, end);
  const components = project.components
    .filter((component) => visibleLayer === "all" || component.layer === visibleLayer)
    .filter((component) => intersects(marquee, componentBounds(component)))
    .map((component) => component.instanceId);
  const keepouts = project.keepouts
    .filter((keepout) => intersects(marquee, keepoutBounds(keepout)))
    .map((keepout) => keepout.id);
  return [...components, ...keepouts];
}

function candidateOffsets(project: PcbProject, objectIds: readonly string[]): PcbPoint[] {
  const componentById = new Map(project.components.map((component) => [component.instanceId, component]));
  const keepoutById = new Map(project.keepouts.map((keepout) => [keepout.id, keepout]));
  const bounds = objectIds.flatMap((objectId) => {
    const component = componentById.get(objectId);
    if (component) return [componentBounds(component)];
    const keepout = keepoutById.get(objectId);
    return keepout ? [keepoutBounds(keepout)] : [];
  });
  if (!bounds.length) return [];

  const grid = project.board.gridSize > 0 ? project.board.gridSize : 1;
  const width = Math.max(...bounds.map((item) => item.right)) - Math.min(...bounds.map((item) => item.left));
  const height = Math.max(...bounds.map((item) => item.bottom)) - Math.min(...bounds.map((item) => item.top));
  const xStep = Math.max(grid, Math.ceil((width + grid) / grid) * grid);
  const yStep = Math.max(grid, Math.ceil((height + grid) / grid) * grid);
  const rings = Math.max(
    2,
    Math.min(100, Math.ceil(project.board.width / xStep) + Math.ceil(project.board.height / yStep) + 2),
  );
  const candidates: PcbPoint[] = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    candidates.push(
      { x: xStep * ring, y: yStep * ring },
      { x: xStep * ring, y: 0 },
      { x: 0, y: yStep * ring },
      { x: -xStep * ring, y: yStep * ring },
      { x: xStep * ring, y: -yStep * ring },
      { x: -xStep * ring, y: 0 },
      { x: 0, y: -yStep * ring },
      { x: -xStep * ring, y: -yStep * ring },
    );
  }
  return candidates;
}

function duplicateAtOffset(
  project: PcbProject,
  objectIds: readonly string[],
  offset: PcbPoint,
): DuplicatePcbSelectionResult | null {
  let next = structuredClone(project);
  const idMap = new Map<string, string>();
  const selectedComponents = objectIds.flatMap((objectId) => {
    const component = project.components.find((item) => item.instanceId === objectId);
    return component ? [component] : [];
  });
  const selectedKeepouts = objectIds.flatMap((objectId) => {
    const keepout = project.keepouts.find((item) => item.id === objectId);
    return keepout ? [keepout] : [];
  });

  const copiedKeepouts = selectedKeepouts.map((keepout) => ({
    ...structuredClone(keepout),
    id: createId("keepout"),
    name: `${keepout.name} 副本`,
    x: keepout.x + offset.x,
    y: keepout.y + offset.y,
  }));
  const keepoutsFit = copiedKeepouts.every((keepout) => (
    keepout.x >= 0
    && keepout.y >= 0
    && keepout.x + keepout.width <= project.board.width
    && keepout.y + keepout.height <= project.board.height
    && !project.components.some((component) => overlapsKeepout(component, keepout))
  ));
  if (!keepoutsFit) return null;
  copiedKeepouts.forEach((keepout, index) => {
    idMap.set(selectedKeepouts[index].id, keepout.id);
    next.keepouts.push(keepout);
  });

  for (const component of selectedComponents) {
    const result = placeLibraryComponent(
      next,
      component,
      { x: component.x + offset.x, y: component.y + offset.y },
      undefined,
      {
        exact: true,
        bypassSnap: true,
        layer: component.layer,
        rotation: component.rotation,
      },
    );
    if (!result.ok) return null;
    next = result.project;
    idMap.set(component.instanceId, result.component.instanceId);
  }

  appendMeasurementCopies(project, next, objectIds, offset, idMap);
  const copiedIds = objectIds
    .map((objectId) => idMap.get(objectId))
    .filter((objectId): objectId is string => Boolean(objectId));
  return copiedIds.length
    ? { project: next, objectIds: copiedIds, idMap, usedOverlapFallback: false }
    : null;
}

function nextCopyReference(project: PcbProject, reference: string): string {
  const normalized = reference.trim() || "X1";
  const match = normalized.match(/^(.*?)(\d+)$/);
  const prefix = match?.[1] || normalized.replace(/\d+$/, "") || "X";
  const used = new Set(project.components.map((component) => component.reference.toLocaleUpperCase()));
  let number = match ? Number(match[2]) + 1 : 1;
  while (used.has(`${prefix}${number}`.toLocaleUpperCase())) number += 1;
  return `${prefix}${number}`;
}

function fallbackOffset(project: PcbProject, objectIds: readonly string[]): PcbPoint {
  const bounds = objectIds.flatMap((objectId) => {
    const component = project.components.find((item) => item.instanceId === objectId);
    if (component) return [componentBounds(component)];
    const keepout = project.keepouts.find((item) => item.id === objectId);
    return keepout ? [keepoutBounds(keepout)] : [];
  });
  if (!bounds.length) return { x: 0, y: 0 };
  const selection = {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
  const grid = project.board.gridSize > 0 ? project.board.gridSize : 1;
  const desired = Math.max(grid, 1) * 2;
  return {
    x: Math.max(-selection.left, Math.min(desired, project.board.width - selection.right)),
    y: Math.max(-selection.top, Math.min(desired, project.board.height - selection.bottom)),
  };
}

function duplicateWithOverlapFallback(
  project: PcbProject,
  objectIds: readonly string[],
): DuplicatePcbSelectionResult | null {
  const offset = fallbackOffset(project, objectIds);
  const next = structuredClone(project);
  const idMap = new Map<string, string>();

  objectIds.forEach((objectId) => {
    const component = project.components.find((item) => item.instanceId === objectId);
    if (component) {
      const copy = {
        ...structuredClone(component),
        instanceId: createId("instance"),
        reference: nextCopyReference(next, component.reference),
        x: component.x + offset.x,
        y: component.y + offset.y,
        locked: false,
      };
      next.components.push(copy);
      idMap.set(component.instanceId, copy.instanceId);
      return;
    }
    const keepout = project.keepouts.find((item) => item.id === objectId);
    if (!keepout) return;
    const copy = {
      ...structuredClone(keepout),
      id: createId("keepout"),
      name: `${keepout.name} 副本`,
      x: keepout.x + offset.x,
      y: keepout.y + offset.y,
    };
    next.keepouts.push(copy);
    idMap.set(keepout.id, copy.id);
  });

  appendMeasurementCopies(project, next, objectIds, offset, idMap);
  const copiedIds = objectIds
    .map((objectId) => idMap.get(objectId))
    .filter((objectId): objectId is string => Boolean(objectId));
  return copiedIds.length
    ? { project: next, objectIds: copiedIds, idMap, usedOverlapFallback: true }
    : null;
}

export function duplicatePcbSelection(
  project: PcbProject,
  objectIds: readonly string[],
): DuplicatePcbSelectionResult | null {
  const validIds = [...new Set(objectIds)].filter((objectId) => (
    project.components.some((component) => component.instanceId === objectId)
    || project.keepouts.some((keepout) => keepout.id === objectId)
    || project.measurements.some((measurement) => measurement.id === objectId)
  ));
  if (!validIds.length) return null;
  if (validIds.every((id) => project.measurements.some((line) => line.id === id))) {
    return duplicateAtOffset(project, validIds, measurementCopyOffset(project, validIds));
  }
  for (const offset of candidateOffsets(project, validIds)) {
    const result = duplicateAtOffset(project, validIds, offset);
    if (result) return result;
  }
  return duplicateWithOverlapFallback(project, validIds);
}
