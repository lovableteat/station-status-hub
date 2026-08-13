import { createId } from "../defaults.ts";
import type {
  PcbKeepout,
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

export interface DuplicatePcbSelectionResult {
  project: PcbProject;
  objectIds: string[];
  idMap: Map<string, string>;
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

  const copiedIds = objectIds
    .map((objectId) => idMap.get(objectId))
    .filter((objectId): objectId is string => Boolean(objectId));
  return copiedIds.length ? { project: next, objectIds: copiedIds, idMap } : null;
}

export function duplicatePcbSelection(
  project: PcbProject,
  objectIds: readonly string[],
): DuplicatePcbSelectionResult | null {
  const validIds = [...new Set(objectIds)].filter((objectId) => (
    project.components.some((component) => component.instanceId === objectId)
    || project.keepouts.some((keepout) => keepout.id === objectId)
  ));
  for (const offset of candidateOffsets(project, validIds)) {
    const result = duplicateAtOffset(project, validIds, offset);
    if (result) return result;
  }
  return null;
}
