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

function corners(rectangle: Rectangle): Point[] {
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
    x: rectangle.x + x * cosine - y * sine,
    y: rectangle.y + x * sine + y * cosine,
  }));
}

function axes(points: Point[]): Point[] {
  return points.slice(0, 2).map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edgeX = next.x - point.x;
    const edgeY = next.y - point.y;
    const length = Math.hypot(edgeX, edgeY);
    return { x: -edgeY / length, y: edgeX / length };
  });
}

function projection(points: Point[], axis: Point): [number, number] {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return [Math.min(...values), Math.max(...values)];
}

/** True when two rectangles intersect or touch, using the separating-axis theorem. */
export function rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
  const firstCorners = corners(first);
  const secondCorners = corners(second);

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
  return corners(component).every((point) => (
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

/** Finds the first row-major grid position that can hold the component without changing inputs. */
export function findPlacement(project: PcbProject, candidate: PcbPlacedComponent): Point | null {
  const gridSize = project.board.gridSize;
  if (gridSize <= 0) return null;

  for (let y = gridSize; y <= project.board.height; y += gridSize) {
    for (let x = gridSize; x <= project.board.width; x += gridSize) {
      const placement = { ...candidate, x, y };
      if (canPlaceComponent(project, placement)) return { x, y };
    }
  }

  return null;
}
