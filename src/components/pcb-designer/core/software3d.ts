import type { PcbBoard, PcbPlacedComponent } from "../types.ts";
import { getPcb3DComponentTransform } from "./viewSync.ts";

export interface SoftwarePoint3 {
  x: number;
  y: number;
  z: number;
}

export interface SoftwareViewState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface SoftwareViewport {
  width: number;
  height: number;
}

export interface SoftwareCanvasResolution extends SoftwareViewport {
  pixelWidth: number;
  pixelHeight: number;
  scale: number;
}

export interface SoftwareCamera {
  eye: SoftwarePoint3;
  forward: SoftwarePoint3;
  right: SoftwarePoint3;
  up: SoftwarePoint3;
  focalLength: number;
  centerX: number;
  centerY: number;
  near: number;
}

export interface SoftwareProjectedPoint {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}

export const DEFAULT_SOFTWARE_VIEW: SoftwareViewState = {
  // Start with a three-quarter product view so the component body, leads and
  // height are immediately readable, matching the WebGL renderer.
  yaw: 2.35,
  pitch: 0.72,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const MAX_SOFTWARE_MODEL_TRIANGLES = 8_000;

// The compatibility renderer is vector based, so drawing above the CSS pixel
// resolution and letting the browser downsample removes the stair-step edges
// that are especially visible on large boards and diagonal package outlines.
export const MAX_SOFTWARE_CANVAS_PIXELS = 12_000_000;

export function getSoftwareCanvasResolution(
  width: number,
  height: number,
  devicePixelRatio = 1,
): SoftwareCanvasResolution {
  const logicalWidth = Math.max(1, Math.round(width));
  const logicalHeight = Math.max(1, Math.round(height));
  const nativeScale = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const requestedScale = Math.min(3, Math.max(2, nativeScale * 1.25));
  const pixelBudgetScale = Math.sqrt(MAX_SOFTWARE_CANVAS_PIXELS / (logicalWidth * logicalHeight));
  const scale = Math.max(1, Math.min(requestedScale, pixelBudgetScale));

  return {
    width: logicalWidth,
    height: logicalHeight,
    pixelWidth: Math.max(1, Math.round(logicalWidth * scale)),
    pixelHeight: Math.max(1, Math.round(logicalHeight * scale)),
    scale,
  };
}

export const SOFTWARE_RENDER_ORDER = {
  farObject: 0,
  farSurface: 1,
  board: 2,
  nearSurface: 3,
  nearObject: 4,
} as const;

export function getSoftwareLayerRenderOrder(
  layer: PcbPlacedComponent["layer"],
  cameraY: number,
  kind: "object" | "surface" = "object",
): number {
  const nearLayer = cameraY >= 0 ? "top" : "bottom";
  const isNearSide = layer === nearLayer;

  if (kind === "surface") {
    return isNearSide ? SOFTWARE_RENDER_ORDER.nearSurface : SOFTWARE_RENDER_ORDER.farSurface;
  }
  return isNearSide ? SOFTWARE_RENDER_ORDER.nearObject : SOFTWARE_RENDER_ORDER.farObject;
}

/**
 * The compat 3D paints faces in order and has no depth buffer, so each component face is cut into three
 * bands by the two board surfaces: near (the camera's side, drawn after the board), within (inside the
 * board thickness) and beyond (the far side, drawn before the board, which hides it where it covers it on
 * screen). The caller drops a "within" piece that is inside the board material (it can never be seen) and
 * draws the rest with the board walls, so a piece in a cut-out or past the board edge stays visible.
 */
export function splitSoftwarePolygonAtBoardSurface(
  points: readonly SoftwarePoint3[],
  eyeY: number,
  boardThickness: number,
): { near: SoftwarePoint3[]; within: SoftwarePoint3[]; beyond: SoftwarePoint3[] } {
  const surface = boardThickness / 2;
  let lowest = Infinity;
  let highest = -Infinity;
  for (const point of points) { if (point.y < lowest) lowest = point.y; if (point.y > highest) highest = point.y; }
  const whole = points as SoftwarePoint3[];
  // A face lying on the surface facing the camera stays near; one lying on the far surface counts as inside the
  // board thickness (the same tie rules as cutting the camera's surface first).
  if (eyeY >= 0) {
    if (lowest >= surface) return { near: whole, within: NO_POINTS, beyond: NO_POINTS };
    if (lowest >= -surface && highest <= surface) return { near: NO_POINTS, within: whole, beyond: NO_POINTS };
    if (highest <= -surface) return { near: NO_POINTS, within: NO_POINTS, beyond: whole };
    const below = highest > surface ? clipToY(points, surface, false) : whole;
    return {
      near: highest > surface ? clipToY(points, surface, true) : NO_POINTS,
      within: clipToY(below, -surface, true),
      beyond: clipToY(below, -surface, false),
    };
  }
  if (highest <= -surface) return { near: whole, within: NO_POINTS, beyond: NO_POINTS };
  if (lowest >= -surface && highest <= surface) return { near: NO_POINTS, within: whole, beyond: NO_POINTS };
  if (lowest >= surface) return { near: NO_POINTS, within: NO_POINTS, beyond: whole };
  const above = lowest < -surface ? clipToY(points, -surface, true) : whole;
  return {
    near: lowest < -surface ? clipToY(points, -surface, false) : NO_POINTS,
    within: clipToY(above, surface, false),
    beyond: clipToY(above, surface, true),
  };
}

/** Shared empty piece (never written to). */
const NO_POINTS: SoftwarePoint3[] = [];

/**
 * One Sutherland-Hodgman pass: the part of a polygon with y >= planeY (keepAbove) or y <= planeY. Crossing
 * points are placed exactly on the plane. Returns the shared empty piece when less than a triangle is left.
 */
function clipToY(points: readonly SoftwarePoint3[], planeY: number, keepAbove: boolean): SoftwarePoint3[] {
  const kept: SoftwarePoint3[] = [];
  let previous = points[points.length - 1];
  let previousSide = keepAbove ? previous.y - planeY : planeY - previous.y;
  for (const current of points) {
    const side = keepAbove ? current.y - planeY : planeY - current.y;
    if ((previousSide > 0 && side < 0) || (previousSide < 0 && side > 0)) {
      const t = previousSide / (previousSide - side);
      kept.push({ x: previous.x + (current.x - previous.x) * t, y: planeY, z: previous.z + (current.z - previous.z) * t });
    }
    if (side >= 0) kept.push(current);
    previous = current;
    previousSide = side;
  }
  return kept.length >= 3 ? kept : NO_POINTS;
}

type PlanPoint = { x: number; z: number };

const planCross = (o: PlanPoint, a: PlanPoint, b: PlanPoint) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** Whether two plan segments cross or touch. */
function planSegmentsMeet(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  const d1 = planCross(c, d, a), d2 = planCross(c, d, b), d3 = planCross(a, b, c), d4 = planCross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSegment = (p: PlanPoint, q: PlanPoint, r: PlanPoint) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.z, q.z) <= r.z && r.z <= Math.max(p.z, q.z);
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
}

/**
 * Where a piece inside the board thickness sits against the board in plan:
 * - "inside": wholly in the board material (every point on material, no outline or cut-out corner inside it,
 *   no outline or cut-out edge crossing it). It can never be seen.
 * - "outside": wholly in a cut-out or past the board edge (no point on material, nothing crossing).
 * - "crossing": across an outline or cut-out edge. Part of it is visible; the caller draws it like the
 *   original renderer did (after the board) so that part never disappears.
 * Edges outside the piece's bounding box are skipped. The answer does not depend on the camera.
 */
export function classifySoftwarePieceAgainstBoard(
  points: readonly SoftwarePoint3[],
  isInsideMaterial: (x: number, z: number) => boolean,
  boundaryRings: readonly (readonly PlanPoint[])[] = [],
): "inside" | "outside" | "crossing" {
  return classifyAgainstEdges(points, isInsideMaterial, ringsToEdges(boundaryRings));
}

type PlanEdge = readonly [PlanPoint, PlanPoint];

function ringsToEdges(rings: readonly (readonly PlanPoint[])[]): PlanEdge[] {
  const edges: PlanEdge[] = [];
  for (const ring of rings) for (let k = 0; k < ring.length; k += 1) edges.push([ring[k], ring[(k + 1) % ring.length]]);
  return edges;
}

function classifyAgainstEdges(
  points: readonly SoftwarePoint3[],
  isInsideMaterial: (x: number, z: number) => boolean,
  edges: Iterable<PlanEdge>,
): "inside" | "outside" | "crossing" {
  if (!points.length) return "outside";
  let onMaterial = 0;
  for (const point of points) if (isInsideMaterial(point.x, point.z)) onMaterial += 1;
  if (onMaterial !== 0 && onMaterial !== points.length) return "crossing";
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  for (const [a, b] of edges) {
    if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX || Math.max(a.z, b.z) < minZ || Math.min(a.z, b.z) > maxZ) continue;
    if (a.x > minX && a.x < maxX && a.z > minZ && a.z < maxZ) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const p = points[j], q = points[i];
        if ((p.z > a.z) !== (q.z > a.z) && a.x < (q.x - p.x) * (a.z - p.z) / (q.z - p.z) + p.x) inside = !inside;
      }
      if (inside) return "crossing";
    }
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (planSegmentsMeet(points[j], points[i], a, b)) return "crossing";
    }
  }
  return onMaterial ? "inside" : "outside";
}

/**
 * A reusable classifier for one board shape. Outline and cut-out edges go into a grid; a piece whose cells
 * hold no edge lies in one region with no boundary through it, so it is wholly inside or wholly outside
 * (one cached test per cell). Only pieces at an edge get the exact test, against the edges near them. No
 * rounding and no cache keyed by coordinates, so two different pieces never share an answer.
 */
export function createSoftwareBoardClassifier(
  boundaryRings: readonly (readonly PlanPoint[])[],
  isInsideMaterial: (x: number, z: number) => boolean,
): (points: readonly SoftwarePoint3[]) => "inside" | "outside" | "crossing" {
  const edges = ringsToEdges(boundaryRings);
  if (!edges.length) return (points) => classifyAgainstEdges(points, isInsideMaterial, []);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [a, b] of edges) {
    minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x);
    minZ = Math.min(minZ, a.z, b.z); maxZ = Math.max(maxZ, a.z, b.z);
  }
  const cells = Math.max(8, Math.min(128, Math.ceil(Math.sqrt(edges.length) * 2)));
  const cellWidth = (maxX - minX) / cells || 1;
  const cellDepth = (maxZ - minZ) / cells || 1;
  const column = (x: number) => Math.max(0, Math.min(cells - 1, Math.floor((x - minX) / cellWidth)));
  const row = (z: number) => Math.max(0, Math.min(cells - 1, Math.floor((z - minZ) / cellDepth)));
  const buckets: number[][] = Array.from({ length: cells * cells }, () => []);
  // An edge goes only into the cells it passes through: it is walked in pieces no longer than half a cell,
  // and each piece's (at most 2 x 2) cells are marked. A long diagonal fills a line of cells, not its box.
  const step = Math.min(cellWidth, cellDepth) / 2;
  edges.forEach(([a, b], index) => {
    const pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let piece = 0; piece < pieces; piece += 1) {
      const fromX = a.x + (b.x - a.x) * piece / pieces, toX = a.x + (b.x - a.x) * (piece + 1) / pieces;
      const fromZ = a.z + (b.z - a.z) * piece / pieces, toZ = a.z + (b.z - a.z) * (piece + 1) / pieces;
      for (let i = column(Math.min(fromX, toX)); i <= column(Math.max(fromX, toX)); i += 1) {
        for (let j = row(Math.min(fromZ, toZ)); j <= row(Math.max(fromZ, toZ)); j += 1) {
          const bucket = buckets[j * cells + i];
          // Edges are added one at a time, so "already here" means it is the last one in the bucket.
          if (bucket[bucket.length - 1] !== index) bucket.push(index);
        }
      }
    }
  });
  const cellInside = new Int8Array(cells * cells); // 0 unknown, 1 inside material, 2 outside
  const seen = new Uint32Array(edges.length);
  let stamp = 0;
  const rayStamp = new Uint32Array(edges.length);
  let rayRun = 0;
  /**
   * Material test through the grid: a ray towards +x crosses only edges registered in this row of cells, so
   * the parity over those edges (outline and cut-outs alike) says inside material or not. A point on an edge
   * goes to the caller's exact test, which decides boundary points.
   */
  const insideMaterialFast = (x: number, z: number): boolean => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    const j = row(z);
    const i0 = column(x);
    rayRun += 1;
    if (rayRun === 0xffffffff) { rayStamp.fill(0); rayRun = 1; }
    let inside = false;
    for (let i = i0; i < cells; i += 1) {
      for (const index of buckets[j * cells + i]) {
        if (rayStamp[index] === rayRun) continue;
        rayStamp[index] = rayRun;
        const [a, b] = edges[index];
        const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
        if (cross === 0 && Math.min(a.x, b.x) <= x && x <= Math.max(a.x, b.x) && Math.min(a.z, b.z) <= z && z <= Math.max(a.z, b.z)) {
          return isInsideMaterial(x, z);
        }
        if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
      }
    }
    return inside;
  };
  return (points) => {
    if (!points.length) return "outside";
    let pMinX = Infinity, pMaxX = -Infinity, pMinZ = Infinity, pMaxZ = -Infinity;
    for (const point of points) {
      pMinX = Math.min(pMinX, point.x); pMaxX = Math.max(pMaxX, point.x);
      pMinZ = Math.min(pMinZ, point.z); pMaxZ = Math.max(pMaxZ, point.z);
    }
    if (pMaxX < minX || pMinX > maxX || pMaxZ < minZ || pMinZ > maxZ) return "outside";
    const i0 = column(pMinX), i1 = column(pMaxX), j0 = row(pMinZ), j1 = row(pMaxZ);
    let anyEdge = false;
    for (let j = j0; j <= j1 && !anyEdge; j += 1) for (let i = i0; i <= i1; i += 1) if (buckets[j * cells + i].length) { anyEdge = true; break; }
    if (!anyEdge) {
      const cell = j0 * cells + i0;
      if (!cellInside[cell]) cellInside[cell] = insideMaterialFast(minX + (i0 + 0.5) * cellWidth, minZ + (j0 + 0.5) * cellDepth) ? 1 : 2;
      return cellInside[cell] === 1 ? "inside" : "outside";
    }
    stamp += 1;
    if (stamp === 0xffffffff) { seen.fill(0); stamp = 1; }
    const nearby: PlanEdge[] = [];
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      for (const index of buckets[j * cells + i]) {
        if (seen[index] === stamp) continue;
        seen[index] = stamp;
        nearby.push(edges[index]);
      }
    }
    return classifyAgainstEdges(points, insideMaterialFast, nearby);
  };
}

/**
 * Whether the board hides a piece on its far side: seen from the camera, the piece's outline projected onto
 * the board surface facing the camera lies wholly on board material, so every line of sight to it passes
 * through the board. Such a piece need not be projected, sorted or drawn. Past the board edge or over a
 * cut-out the projection leaves the material and the piece is drawn. Only used with the camera outside the
 * board thickness.
 */
export function isSoftwarePieceBehindBoard(
  points: readonly SoftwarePoint3[],
  eye: SoftwarePoint3,
  boardThickness: number,
  classify: (points: readonly SoftwarePoint3[]) => "inside" | "outside" | "crossing",
): boolean {
  const surface = boardThickness / 2;
  if (Math.abs(eye.y) <= surface || !points.length) return false;
  const plane = eye.y > 0 ? surface : -surface;
  const projected: SoftwarePoint3[] = [];
  for (const point of points) {
    const rise = point.y - eye.y;
    if (rise === 0) return false;
    const t = (plane - eye.y) / rise;
    if (!(t > 0 && t < 1)) return false;
    projected.push({ x: eye.x + (point.x - eye.x) * t, y: plane, z: eye.z + (point.z - eye.z) * t });
  }
  return classify(projected) === "inside";
}

/** Whether a piece inside the board thickness is wholly in the board material (and so never visible). */
export function isSoftwarePieceInsideBoardMaterial(
  points: readonly SoftwarePoint3[],
  isInsideMaterial: (x: number, z: number) => boolean,
  boundaryRings: readonly (readonly PlanPoint[])[] = [],
): boolean {
  return classifySoftwarePieceAgainstBoard(points, isInsideMaterial, boundaryRings) === "inside";
}

/** Screen bounds of one or more drawn pieces, used as a click area. */
export interface SoftwarePieceBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  depth: number;
  count: number;
}

const piecesTouch = (a: SoftwarePieceBounds, b: SoftwarePieceBounds, gap = 3) =>
  a.left <= b.right + gap && b.left <= a.right + gap && a.top <= b.bottom + gap && b.top <= a.bottom + gap;

export function joinSoftwarePieceBounds(a: SoftwarePieceBounds, b: SoftwarePieceBounds): SoftwarePieceBounds {
  return {
    left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
    depth: (a.depth * a.count + b.depth * b.count) / (a.count + b.count), count: a.count + b.count,
  };
}

/**
 * Adds one drawn piece to the click-area groups of a part: pieces that touch (within 3 px) share a group, so
 * two leads far apart get two areas and do not cover what lies between them. Bounds are accumulated point
 * by point, so a big STEP mesh never builds one huge array.
 */
export function addSoftwarePieceBounds(groups: SoftwarePieceBounds[], points: Iterable<SoftwareProjectedPoint>): void {
  let piece: SoftwarePieceBounds | null = null;
  let depthSum = 0;
  for (const point of points) {
    if (!point.visible) continue;
    depthSum += point.depth;
    piece = piece
      ? { ...piece, left: Math.min(piece.left, point.x), top: Math.min(piece.top, point.y), right: Math.max(piece.right, point.x), bottom: Math.max(piece.bottom, point.y), count: piece.count + 1 }
      : { left: point.x, top: point.y, right: point.x, bottom: point.y, depth: 0, count: 1 };
  }
  if (!piece) return;
  let grown: SoftwarePieceBounds = { ...piece, depth: depthSum / piece.count, count: 1 };
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (piecesTouch(groups[index], grown)) grown = joinSoftwarePieceBounds(groups.splice(index, 1)[0], grown);
  }
  groups.push(grown);
  if (groups.length > MAX_SOFTWARE_PIECE_GROUPS) groups.splice(0, groups.length, groups.reduce(joinSoftwarePieceBounds));
}

/** More separate click groups than this for one part collapse into one area (keeps the merge cheap). */
export const MAX_SOFTWARE_PIECE_GROUPS = 512;

/** Final pass: groups that grew into each other are joined. */
export function mergeSoftwarePieceBounds(groups: readonly SoftwarePieceBounds[]): SoftwarePieceBounds[] {
  const merged = [...groups];
  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a < merged.length && !changed; a += 1) for (let b = a + 1; b < merged.length && !changed; b += 1) {
      if (piecesTouch(merged[a], merged[b])) {
        merged[a] = joinSoftwarePieceBounds(merged[a], merged[b]);
        merged.splice(b, 1);
        changed = true;
      }
    }
  }
  return merged;
}

export function compareSoftwareRenderDepth(
  left: { depth: number; renderOrder: number },
  right: { depth: number; renderOrder: number },
): number {
  return left.renderOrder - right.renderOrder || right.depth - left.depth;
}

export function getSoftwareProjectedHull(
  points: readonly SoftwareProjectedPoint[],
): SoftwareProjectedPoint[] {
  const visible = [...new Map(points.filter((point) => point.visible).map((point) => [
    `${point.x.toFixed(3)}:${point.y.toFixed(3)}`,
    point,
  ])).values()].sort((left, right) => left.x - right.x || left.y - right.y);
  if (visible.length <= 2) return visible;
  const turn = (origin: SoftwareProjectedPoint, left: SoftwareProjectedPoint, right: SoftwareProjectedPoint) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower: SoftwareProjectedPoint[] = [];
  visible.forEach((point) => {
    while (lower.length >= 2 && turn(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: SoftwareProjectedPoint[] = [];
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const point = visible[index];
    while (upper.length >= 2 && turn(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function subtract(a: SoftwarePoint3, b: SoftwarePoint3): SoftwarePoint3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: SoftwarePoint3, b: SoftwarePoint3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: SoftwarePoint3, b: SoftwarePoint3): SoftwarePoint3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(point: SoftwarePoint3): SoftwarePoint3 {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

export function createSoftwareCamera(
  board: Pick<PcbBoard, "width" | "height">,
  viewport: SoftwareViewport,
  view: SoftwareViewState,
): SoftwareCamera {
  const sceneSize = Math.max(board.width, board.height, 40);
  const distance = sceneSize * 1.9;
  if (view.pitch >= 1.22) {
    const focalLength = (Math.min(viewport.width, viewport.height) / 2) / Math.tan((40 * Math.PI / 180) / 2);
    return {
      eye: { x: 0, y: distance, z: 0 },
      forward: { x: 0, y: -1, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      focalLength: focalLength * view.zoom,
      centerX: viewport.width / 2 + view.panX,
      centerY: viewport.height / 2 + view.panY,
      near: 0.1,
    };
  }
  const horizontalDistance = Math.cos(view.pitch) * distance;
  const eye = {
    x: Math.sin(view.yaw) * horizontalDistance,
    y: Math.sin(view.pitch) * distance,
    z: Math.cos(view.yaw) * horizontalDistance,
  };
  const target = { x: 0, y: 0, z: 0 };
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = normalize(cross(right, forward));
  const fieldOfView = (40 * Math.PI) / 180;
  const focalLength = (Math.min(viewport.width, viewport.height) / 2) / Math.tan(fieldOfView / 2);

  return {
    eye,
    forward,
    right,
    up,
    focalLength: focalLength * view.zoom,
    centerX: viewport.width / 2 + view.panX,
    centerY: viewport.height / 2 + view.panY,
    near: 0.1,
  };
}

export function projectSoftwarePoint(
  point: SoftwarePoint3,
  camera: SoftwareCamera,
): SoftwareProjectedPoint {
  const relative = subtract(point, camera.eye);
  const depth = dot(relative, camera.forward);
  if (depth <= camera.near) {
    return { x: camera.centerX, y: camera.centerY, depth, visible: false };
  }
  const scale = camera.focalLength / depth;
  return {
    x: camera.centerX + dot(relative, camera.right) * scale,
    y: camera.centerY - dot(relative, camera.up) * scale,
    depth,
    visible: true,
  };
}

export function createSoftwareBoxVertices(
  width: number,
  height: number,
  depth: number,
): SoftwarePoint3[] {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  return [
    { x: -x, y: -y, z: -z },
    { x, y: -y, z: -z },
    { x, y: -y, z },
    { x: -x, y: -y, z },
    { x: -x, y, z: -z },
    { x, y, z: -z },
    { x, y, z },
    { x: -x, y, z },
  ];
}

export function getPcbMountY(component: Pick<PcbPlacedComponent, "maxHeight" | "layer" | "insertionDepth">, boardThickness = 1.6): number {
  return (component.layer === "top" ? 1 : -1) * (boardThickness / 2 + component.maxHeight / 2 - (component.insertionDepth ?? 0));
}

/** World Y range of a mounted part, from its local Y range (Top faces up, Bottom is mirrored under the board). */
export function getPcbComponentWorldYRange(
  component: Pick<PcbPlacedComponent, "maxHeight" | "layer" | "insertionDepth">,
  localRange: readonly [number, number],
  boardThickness = 1.6,
): [number, number] {
  const mount = getPcbMountY(component, boardThickness);
  return component.layer === "top"
    ? [mount + localRange[0], mount + localRange[1]]
    : [mount - localRange[1], mount - localRange[0]];
}

/**
 * Height of the 3D floor (grid and contact shadow). It sits just under the board, or under the lowest
 * mounted point when a Bottom part or a lead through the board reaches lower, so it never covers them.
 */
export function getPcb3DFloorY(worldRanges: Iterable<readonly [number, number]>, boardThickness = 1.6): number {
  let lowest = Infinity;
  for (const [low] of worldRanges) lowest = Math.min(lowest, low);
  const underBoard = -boardThickness / 2 - 0.65;
  return Number.isFinite(lowest) ? Math.min(underBoard, lowest - 0.6) : underBoard;
}

export function transformPcbComponentPoint(
  localPoint: SoftwarePoint3,
  component: Pick<PcbPlacedComponent, "x" | "y" | "width" | "height" | "maxHeight" | "rotation" | "layer" | "insertionDepth">,
  board: Pick<PcbBoard, "width" | "height">,
  boardThickness = 1.6,
): SoftwarePoint3 {
  const transform = getPcb3DComponentTransform(component, board);
  const angle = transform.rotation[1];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const layerSign = component.layer === "top" ? 1 : -1;
  const raisedPoint = {
    x: localPoint.x,
    y: layerSign * localPoint.y + getPcbMountY(component, boardThickness),
    z: localPoint.z,
  };
  const rotated = {
    x: raisedPoint.x * cos + raisedPoint.z * sin,
    y: raisedPoint.y,
    z: -raisedPoint.x * sin + raisedPoint.z * cos,
  };
  return {
    x: transform.position[0] + rotated.x,
    y: rotated.y,
    z: transform.position[2] + rotated.z,
  };
}

export function sampleTriangleOffsets(indexCount: number, budget: number): number[] {
  const triangleCount = Math.floor(indexCount / 3);
  if (triangleCount <= 0 || budget <= 0) return [];
  const stride = Math.max(1, Math.ceil(triangleCount / budget));
  const offsets: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    offsets.push(triangle * 3);
  }
  return offsets;
}

export function getSoftwareFaceNormal(
  a: SoftwarePoint3,
  b: SoftwarePoint3,
  c: SoftwarePoint3,
): SoftwarePoint3 {
  return normalize(cross(subtract(b, a), subtract(c, a)));
}

/** Fixed light direction of the compat 3D (normalised once). */
const SOFTWARE_LIGHT = normalize({ x: -0.35, y: 0.85, z: 0.4 });

export function getSoftwareLightLevel(normal: SoftwarePoint3): number {
  return 0.46 + Math.abs(dot(normal, SOFTWARE_LIGHT)) * 0.54;
}
