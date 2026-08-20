import type { PcbKeepout, PcbPlacedComponent, PcbProject } from "../types.ts";

type Rectangle = Pick<PcbPlacedComponent, "x" | "y" | "width" | "height" | "rotation">;

interface Point {
  x: number;
  y: number;
}

interface ViewportRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ViewBoxRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EPSILON = 1e-9;
export const MAX_PLACEMENT_CHECKS = 10_000;

export interface PlacementSearchOptions {
  maxChecks?: number;
}

export type PlacementSearchResult =
  | { status: "placed"; point: Point }
  | { status: "not-found" }
  | { status: "limit-reached" };

interface GridNode extends Point {
  gridX: number;
  gridY: number;
  distance: number;
}

function compareGridNodes(first: GridNode, second: GridNode): number {
  return first.distance - second.distance || first.y - second.y || first.x - second.x;
}

function pushHeap(heap: GridNode[], node: GridNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareGridNodes(heap[parent], heap[index]) <= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popHeap(heap: GridNode[]): GridNode | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  heap[0] = last;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && compareGridNodes(heap[left], heap[smallest]) < 0) smallest = left;
    if (right < heap.length && compareGridNodes(heap[right], heap[smallest]) < 0) smallest = right;
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
    index = smallest;
  }
  return first;
}

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, gridSize: number, bypass: boolean): Point {
  if (bypass) return { ...point };
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function clientPointToBoard(
  point: Point,
  viewport: ViewportRectangle,
  viewBox: ViewBoxRectangle,
): Point {
  if (viewport.width <= 0 || viewport.height <= 0) return { x: viewBox.x, y: viewBox.y };
  return {
    x: viewBox.x + ((point.x - viewport.left) / viewport.width) * viewBox.width,
    y: viewBox.y + ((point.y - viewport.top) / viewport.height) * viewBox.height,
  };
}

function stableCoordinate(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) < EPSILON ? integer : value;
}

export interface ComponentCanvasGeometry {
  center: Readonly<Point>;
  transform: string;
  localBounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  handles: readonly Readonly<Point>[];
}

export function getComponentCanvasTransform(
  rectangle: Rectangle,
  center: Point = rectangle,
): string {
  const stableCenter = {
    x: stableCoordinate(center.x),
    y: stableCoordinate(center.y),
  };
  return `translate(${stableCenter.x} ${stableCenter.y}) rotate(${stableCoordinate(rectangle.rotation)})`;
}

/**
 * Returns the single visual coordinate model used by both the component body
 * and its selection frame. Keeping the bounds local to the translated/rotated
 * group prevents the frame from lagging behind a drag preview.
 */
export function getComponentCanvasGeometry(
  rectangle: Rectangle,
  center: Point = rectangle,
): ComponentCanvasGeometry {
  const stableCenter = {
    x: stableCoordinate(center.x),
    y: stableCoordinate(center.y),
  };
  const halfWidth = rectangle.width / 2;
  const halfHeight = rectangle.height / 2;
  const localBounds = {
    x: -halfWidth,
    y: -halfHeight,
    width: rectangle.width,
    height: rectangle.height,
  };

  return {
    center: stableCenter,
    transform: getComponentCanvasTransform(rectangle, stableCenter),
    localBounds,
    handles: [
      { x: localBounds.x, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y },
      { x: localBounds.x, y: localBounds.y + localBounds.height },
      {
        x: localBounds.x + localBounds.width,
        y: localBounds.y + localBounds.height,
      },
    ],
  };
}

export function getRotatedRectangleCorners(rectangle: Rectangle): readonly Readonly<Point>[] {
  const angle = (rectangle.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const halfWidth = rectangle.width / 2;
  const halfHeight = rectangle.height / 2;

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ].map(({ x, y }) => ({
    x: stableCoordinate(rectangle.x + x * cosine - y * sine),
    y: stableCoordinate(rectangle.y + x * sine + y * cosine),
  }));
}

function axes(points: readonly Point[]): Point[] {
  return points.slice(0, 2).map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edgeX = next.x - point.x;
    const edgeY = next.y - point.y;
    const length = Math.hypot(edgeX, edgeY);
    return { x: -edgeY / length, y: edgeX / length };
  });
}

function projection(points: readonly Point[], axis: Point): [number, number] {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return [Math.min(...values), Math.max(...values)];
}

/** True when two rectangles intersect or touch, using the separating-axis theorem. */
export function rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
  const firstCorners = getRotatedRectangleCorners(first);
  const secondCorners = getRotatedRectangleCorners(second);

  return axes(firstCorners).concat(axes(secondCorners)).every((axis) => {
    const [firstMin, firstMax] = projection(firstCorners, axis);
    const [secondMin, secondMax] = projection(secondCorners, axis);
    return firstMax + EPSILON >= secondMin && secondMax + EPSILON >= firstMin;
  });
}

function keepoutRectangle(keepout: PcbKeepout): Rectangle {
  return {
    x: keepout.x + keepout.width / 2,
    y: keepout.y + keepout.height / 2,
    width: keepout.width,
    height: keepout.height,
    rotation: keepout.rotation ?? 0,
  };
}

export function isWithinBoard(component: Rectangle, board: PcbProject["board"]): boolean {
  return getRotatedRectangleCorners(component).every((point) => (
    point.x >= -EPSILON && point.x <= board.width + EPSILON
      && point.y >= -EPSILON && point.y <= board.height + EPSILON
  ));
}

export function overlapsKeepout(component: Rectangle, keepout: PcbKeepout): boolean {
  return rectanglesOverlap(component, keepoutRectangle(keepout));
}

export function canPlaceComponent(project: PcbProject, candidate: PcbPlacedComponent): boolean {
  if (!isWithinBoard(candidate, project.board)) return false;
  if (project.keepouts.some((keepout) => overlapsKeepout(candidate, keepout))) return false;

  return !project.components.some((existing) => (
    existing.instanceId !== candidate.instanceId
      && existing.layer === candidate.layer
      && rectanglesOverlap(existing, candidate)
  ));
}

/** Searches nearest-first while distinguishing an exhausted board from a safety limit. */
export function searchPlacement(
  project: PcbProject,
  candidate: PcbPlacedComponent,
  preferred = { x: project.board.width / 2, y: project.board.height / 2 },
  options: PlacementSearchOptions = {},
): PlacementSearchResult {
  const gridSize = project.board.gridSize;
  if (gridSize <= 0) return { status: "not-found" };
  const maxChecks = Math.max(
    0,
    Math.floor(options.maxChecks ?? MAX_PLACEMENT_CHECKS),
  );
  if (maxChecks === 0) return { status: "limit-reached" };

  const maxGridX = Math.floor((project.board.width + EPSILON) / gridSize);
  const maxGridY = Math.floor((project.board.height + EPSILON) / gridSize);
  if (maxGridX < 1 || maxGridY < 1) return { status: "not-found" };

  const heap: GridNode[] = [];
  const queued = new Set<string>();
  const enqueue = (gridX: number, gridY: number) => {
    if (gridX < 1 || gridX > maxGridX || gridY < 1 || gridY > maxGridY) return;
    const key = `${gridX}:${gridY}`;
    if (queued.has(key)) return;
    queued.add(key);
    const x = stableCoordinate(gridX * gridSize);
    const y = stableCoordinate(gridY * gridSize);
    pushHeap(heap, {
      gridX,
      gridY,
      x,
      y,
      distance: (x - preferred.x) ** 2 + (y - preferred.y) ** 2,
    });
  };

  const preferredGridX = preferred.x / gridSize;
  const preferredGridY = preferred.y / gridSize;
  const seedXs = [Math.floor(preferredGridX), Math.ceil(preferredGridX)];
  const seedYs = [Math.floor(preferredGridY), Math.ceil(preferredGridY)];
  seedYs.forEach((gridY) => seedXs.forEach((gridX) => enqueue(gridX, gridY)));
  if (heap.length === 0) {
    enqueue(
      Math.min(maxGridX, Math.max(1, Math.round(preferredGridX))),
      Math.min(maxGridY, Math.max(1, Math.round(preferredGridY))),
    );
  }

  let checks = 0;
  while (heap.length > 0 && checks < maxChecks) {
    const node = popHeap(heap);
    if (!node) break;
    checks += 1;
    if (canPlaceComponent(project, { ...candidate, x: node.x, y: node.y })) {
      return { status: "placed", point: { x: node.x, y: node.y } };
    }
    enqueue(node.gridX - 1, node.gridY);
    enqueue(node.gridX + 1, node.gridY);
    enqueue(node.gridX, node.gridY - 1);
    enqueue(node.gridX, node.gridY + 1);
  }

  return heap.length > 0
    ? { status: "limit-reached" }
    : { status: "not-found" };
}

/** Compatibility helper for callers that only need the located point. */
export function findPlacement(
  project: PcbProject,
  candidate: PcbPlacedComponent,
  preferred = { x: project.board.width / 2, y: project.board.height / 2 },
  options: PlacementSearchOptions = {},
): Point | null {
  const result = searchPlacement(project, candidate, preferred, options);
  return result.status === "placed" ? result.point : null;
}
