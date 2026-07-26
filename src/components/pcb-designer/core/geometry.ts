import type { PcbKeepout, PcbPlacedComponent, PcbProject } from "../types.ts";

type Rectangle = Pick<PcbPlacedComponent, "x" | "y" | "width" | "height" | "rotation">;

interface Point {
  x: number;
  y: number;
}

const EPSILON = 1e-9;

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.floor(value / gridSize) * gridSize;
}

function stableCoordinate(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) < EPSILON ? integer : value;
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
    rotation: 0,
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

/** Finds the legal grid position nearest the board center without changing inputs. */
export function findPlacement(project: PcbProject, candidate: PcbPlacedComponent): Point | null {
  const gridSize = project.board.gridSize;
  if (gridSize <= 0) return null;

  const placements: Point[] = [];

  for (let y = gridSize; y <= project.board.height; y += gridSize) {
    for (let x = gridSize; x <= project.board.width; x += gridSize) {
      const placement = { ...candidate, x, y };
      if (canPlaceComponent(project, placement)) placements.push({ x, y });
    }
  }

  const centerX = project.board.width / 2;
  const centerY = project.board.height / 2;
  placements.sort((first, second) => {
    const firstDistance = (first.x - centerX) ** 2 + (first.y - centerY) ** 2;
    const secondDistance = (second.x - centerX) ** 2 + (second.y - centerY) ** 2;
    return firstDistance - secondDistance || first.y - second.y || first.x - second.x;
  });

  return placements[0] ?? null;
}
