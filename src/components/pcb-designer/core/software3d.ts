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
    const [near, below] = highest > surface ? splitAtY(points, surface) : [NO_POINTS, whole];
    const [within, beyond] = splitAtY(below, -surface);
    return { near, within, beyond };
  }
  if (highest <= -surface) return { near: whole, within: NO_POINTS, beyond: NO_POINTS };
  if (lowest >= -surface && highest <= surface) return { near: NO_POINTS, within: whole, beyond: NO_POINTS };
  if (lowest >= surface) return { near: NO_POINTS, within: NO_POINTS, beyond: whole };
  const [above, near] = lowest < -surface ? splitAtY(points, -surface) : [whole, NO_POINTS];
  const [beyond, within] = splitAtY(above, surface);
  return { near, within, beyond };
}

/** Shared empty piece (never written to). */
const NO_POINTS: SoftwarePoint3[] = [];

/**
 * One Sutherland-Hodgman pass for both sides of the plane y = planeY: [the part with y >= planeY, the part with
 * y <= planeY]. Crossing points lie exactly on the plane and are made once, shared by both sides (never written
 * to). A side with less than a triangle left is the shared empty piece.
 */
function splitAtY(points: readonly SoftwarePoint3[], planeY: number): [SoftwarePoint3[], SoftwarePoint3[]] {
  if (!points.length) return [NO_POINTS, NO_POINTS];
  const above: SoftwarePoint3[] = [];
  const below: SoftwarePoint3[] = [];
  let previous = points[points.length - 1];
  let previousSide = previous.y - planeY;
  for (const current of points) {
    const side = current.y - planeY;
    if ((previousSide > 0 && side < 0) || (previousSide < 0 && side > 0)) {
      const t = previousSide / (previousSide - side);
      const crossing = { x: previous.x + (current.x - previous.x) * t, y: planeY, z: previous.z + (current.z - previous.z) * t };
      above.push(crossing);
      below.push(crossing);
    }
    if (side >= 0) above.push(current);
    if (side <= 0) below.push(current);
    previous = current;
    previousSide = side;
  }
  return [above.length >= 3 ? above : NO_POINTS, below.length >= 3 ? below : NO_POINTS];
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
): SoftwareBoardClassifier {
  const edges = ringsToEdges(boundaryRings);
  if (!edges.length) return Object.assign((points: readonly SoftwarePoint3[]) => classifyAgainstEdges(points, isInsideMaterial, []), { grid: null });
  layoutKeeper ??= buildBoardClassifier(ringsToEdges([[{ x: 0.5, z: 0.25 }, { x: 1.75, z: 2.5 }]]), () => false);
  return buildBoardClassifier(edges, isInsideMaterial);
}

function buildBoardClassifier(edges: readonly PlanEdge[], isInsideMaterial: (x: number, z: number) => boolean): SoftwareBoardClassifier {
  const grid = new SoftwareBoardGrid(edges, isInsideMaterial);
  return Object.assign((points: readonly SoftwarePoint3[]) => grid.classify(points), { grid });
}

/**
 * A tiny classifier kept for the life of the page, made before the first real one. While one exists the engine
 * keeps the object layout of grids and classifiers, so code optimised for one board still fits the next board's.
 * Without it, once the last board's grid was collected (3D closed, board switched) that code was thrown away and
 * the next first frame started unoptimised. Its corners are decimals so its number fields match real boards'.
 */
let layoutKeeper: SoftwareBoardClassifier | null = null;

/** A board-shape classifier (see createSoftwareBoardClassifier). */
export type SoftwareBoardClassifier = ((points: readonly SoftwarePoint3[]) => "inside" | "outside" | "crossing") & {
  /** The edge grid behind it (null for a board without edges); its box() answers from plan bounds alone. */
  readonly grid: SoftwareBoardGrid | null;
};

/**
 * The grid of one board shape. Hot callers use its methods directly (box() needs no point list), and the hot
 * loops read only numbers and packed typed arrays (edge corners, edges per cell), not the outline's point objects.
 */
export class SoftwareBoardGrid {
  private readonly cells: number;
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minZ: number;
  private readonly maxZ: number;
  private readonly cellWidth: number;
  private readonly cellDepth: number;
  /** Edges per cell, packed: the edges of cell c are bucketEdges[bucketStart[c] .. bucketStart[c + 1]). */
  private readonly bucketStart: Int32Array;
  private readonly bucketEdges: Int32Array;
  /** Edge k runs from (edgeCoords[4k], edgeCoords[4k + 1]) to (edgeCoords[4k + 2], edgeCoords[4k + 3]) in plan x / z. */
  private readonly edgeCoords: Float64Array;
  /** Per cell: 0 unknown, 1 inside material, 2 outside. */
  private readonly cellInside: Int8Array;
  private readonly seen: Uint32Array;
  private readonly rayStamp: Uint32Array;
  private stamp = 0;
  private rayRun = 0;
  private readonly materialTest: (x: number, z: number) => boolean;
  private readonly edges: readonly PlanEdge[];
  private readonly isInsideMaterial: (x: number, z: number) => boolean;

  constructor(edges: readonly PlanEdge[], isInsideMaterial: (x: number, z: number) => boolean) {
    this.edges = edges;
    this.isInsideMaterial = isInsideMaterial;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [a, b] of edges) {
      minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x);
      minZ = Math.min(minZ, a.z, b.z); maxZ = Math.max(maxZ, a.z, b.z);
    }
    const cells = Math.max(8, Math.min(128, Math.ceil(Math.sqrt(edges.length) * 2)));
    this.cells = cells;
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
    this.cellWidth = (maxX - minX) / cells || 1;
    this.cellDepth = (maxZ - minZ) / cells || 1;
    const lists: number[][] = Array.from({ length: cells * cells }, () => []);
    // An edge goes only into the cells it passes through: it is walked in pieces no longer than half a cell,
    // and each piece's (at most 2 x 2) cells are marked. A long diagonal fills a line of cells, not its box.
    const step = Math.min(this.cellWidth, this.cellDepth) / 2;
    const edgeCoords = new Float64Array(edges.length * 4);
    edges.forEach(([a, b], index) => {
      edgeCoords[index * 4] = a.x; edgeCoords[index * 4 + 1] = a.z; edgeCoords[index * 4 + 2] = b.x; edgeCoords[index * 4 + 3] = b.z;
      const pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
      for (let piece = 0; piece < pieces; piece += 1) {
        const fromX = a.x + (b.x - a.x) * piece / pieces, toX = a.x + (b.x - a.x) * (piece + 1) / pieces;
        const fromZ = a.z + (b.z - a.z) * piece / pieces, toZ = a.z + (b.z - a.z) * (piece + 1) / pieces;
        for (let i = this.column(Math.min(fromX, toX)); i <= this.column(Math.max(fromX, toX)); i += 1) {
          for (let j = this.row(Math.min(fromZ, toZ)); j <= this.row(Math.max(fromZ, toZ)); j += 1) {
            const list = lists[j * cells + i];
            // Edges are added one at a time, so "already here" means it is the last one in the list.
            if (list[list.length - 1] !== index) list.push(index);
          }
        }
      }
    });
    const bucketStart = new Int32Array(cells * cells + 1);
    let total = 0;
    lists.forEach((list, cell) => { bucketStart[cell] = total; total += list.length; });
    bucketStart[cells * cells] = total;
    const bucketEdges = new Int32Array(total);
    lists.forEach((list, cell) => bucketEdges.set(list, bucketStart[cell]));
    this.bucketStart = bucketStart;
    this.bucketEdges = bucketEdges;
    this.edgeCoords = edgeCoords;
    this.cellInside = new Int8Array(cells * cells);
    this.seen = new Uint32Array(edges.length);
    this.rayStamp = new Uint32Array(edges.length);
    this.materialTest = (x, z) => this.insideMaterialFast(x, z);
  }

  private column(x: number): number {
    return Math.max(0, Math.min(this.cells - 1, Math.floor((x - this.minX) / this.cellWidth)));
  }

  private row(z: number): number {
    return Math.max(0, Math.min(this.cells - 1, Math.floor((z - this.minZ) / this.cellDepth)));
  }

  /**
   * Material test through the grid: a ray towards +x crosses only edges registered in this row of cells, so
   * the parity over those edges (outline and cut-outs alike) says inside material or not. A point on an edge
   * goes to the caller's exact test, which decides boundary points.
   */
  insideMaterialFast(x: number, z: number): boolean {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    const { cells, bucketStart, bucketEdges, edgeCoords, rayStamp } = this;
    const j = this.row(z);
    const i0 = this.column(x);
    this.rayRun += 1;
    if (this.rayRun === 0xffffffff) { rayStamp.fill(0); this.rayRun = 1; }
    const run = this.rayRun;
    let inside = false;
    for (let i = i0; i < cells; i += 1) {
      const cell = j * cells + i;
      for (let k = bucketStart[cell], end = bucketStart[cell + 1]; k < end; k += 1) {
        const index = bucketEdges[k];
        if (rayStamp[index] === run) continue;
        rayStamp[index] = run;
        const o = index * 4;
        const ax = edgeCoords[o], az = edgeCoords[o + 1], bx = edgeCoords[o + 2], bz = edgeCoords[o + 3];
        const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
        if (cross === 0 && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(az, bz) <= z && z <= Math.max(az, bz)) {
          return this.isInsideMaterial(x, z);
        }
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
      }
    }
    return inside;
  }

  /** The grid answer for plan bounds: "outside" out of range, the cell's answer when no edge is near, else null. */
  box(pMinX: number, pMaxX: number, pMinZ: number, pMaxZ: number): "inside" | "outside" | null {
    if (pMaxX < this.minX || pMinX > this.maxX || pMaxZ < this.minZ || pMinZ > this.maxZ) return "outside";
    const { cells, bucketStart, cellInside } = this;
    const i0 = this.column(pMinX), i1 = this.column(pMaxX), j0 = this.row(pMinZ), j1 = this.row(pMaxZ);
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) if (bucketStart[j * cells + i + 1] > bucketStart[j * cells + i]) return null;
    const cell = j0 * cells + i0;
    if (!cellInside[cell]) cellInside[cell] = this.insideMaterialFast(this.minX + (i0 + 0.5) * this.cellWidth, this.minZ + (j0 + 0.5) * this.cellDepth) ? 1 : 2;
    return cellInside[cell] === 1 ? "inside" : "outside";
  }

  classify(points: readonly SoftwarePoint3[]): "inside" | "outside" | "crossing" {
    if (!points.length) return "outside";
    let pMinX = Infinity, pMaxX = -Infinity, pMinZ = Infinity, pMaxZ = -Infinity;
    for (const point of points) {
      pMinX = Math.min(pMinX, point.x); pMaxX = Math.max(pMaxX, point.x);
      pMinZ = Math.min(pMinZ, point.z); pMaxZ = Math.max(pMaxZ, point.z);
    }
    const quick = this.box(pMinX, pMaxX, pMinZ, pMaxZ);
    if (quick) return quick;
    const { cells, bucketStart, bucketEdges, edges, seen } = this;
    const i0 = this.column(pMinX), i1 = this.column(pMaxX), j0 = this.row(pMinZ), j1 = this.row(pMaxZ);
    this.stamp += 1;
    if (this.stamp === 0xffffffff) { seen.fill(0); this.stamp = 1; }
    const stamp = this.stamp;
    const nearby: PlanEdge[] = [];
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) {
      const cell = j * cells + i;
      for (let k = bucketStart[cell], end = bucketStart[cell + 1]; k < end; k += 1) {
        const index = bucketEdges[k];
        if (seen[index] === stamp) continue;
        seen[index] = stamp;
        nearby.push(edges[index]);
      }
    }
    return classifyAgainstEdges(points, this.materialTest, nearby);
  }
}

/** The classifier's answer for one piece, through its grid's shared methods when it has one. */
function classifyWith(
  classify: SoftwareBoardClassifier | ((points: readonly SoftwarePoint3[]) => "inside" | "outside" | "crossing"),
  points: readonly SoftwarePoint3[],
): "inside" | "outside" | "crossing" {
  const grid = "grid" in classify ? classify.grid : null;
  return grid ? grid.classify(points) : classify(points);
}

/** How a part's mounted points are placed on the board: turned about the vertical, then moved (plan only). */
export interface SoftwarePlanPlacement {
  originX: number;
  originZ: number;
  cos: number;
  sin: number;
}

/** A mounted point placed on the board (the same sums the compat 3D uses for every part). */
export function placeSoftwarePoint(point: SoftwarePoint3, placement: SoftwarePlanPlacement): SoftwarePoint3 {
  const { originX, originZ, cos, sin } = placement;
  return { x: originX + point.x * cos + point.z * sin, y: point.y, z: originZ - point.x * sin + point.z * cos };
}

/**
 * The classifier's answer for a piece in mounted part space once placed on the board. The grid usually decides
 * from the placed bounds, so no placed copy is built; next to an edge the placed piece gets the full test.
 */
export function classifySoftwarePlacedPiece(
  points: readonly SoftwarePoint3[],
  placement: SoftwarePlanPlacement,
  classify: SoftwareBoardClassifier,
): "inside" | "outside" | "crossing" {
  if (!points.length) return "outside";
  const { originX, originZ, cos, sin } = placement;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    const x = originX + point.x * cos + point.z * sin, z = originZ - point.x * sin + point.z * cos;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const grid = classify.grid;
  return (grid ? grid.box(minX, maxX, minZ, maxZ) : null) ?? classifyWith(classify, points.map((point) => placeSoftwarePoint(point, placement)));
}

/**
 * isSoftwarePieceBehindBoard for a piece in mounted part space placed on the board (or already placed when
 * placement is null). The projected bounds go to the grid first; only next to an edge are the projected points
 * built for the full test. The answer is the same as projecting the placed piece.
 */
export function isSoftwarePlacedPieceBehindBoard(
  points: readonly SoftwarePoint3[],
  placement: SoftwarePlanPlacement | null,
  eye: SoftwarePoint3,
  boardThickness: number,
  classify: SoftwareBoardClassifier,
): boolean {
  const surface = boardThickness / 2;
  if (Math.abs(eye.y) <= surface || !points.length) return false;
  const plane = eye.y > 0 ? surface : -surface;
  const { originX, originZ, cos, sin } = placement ?? { originX: 0, originZ: 0, cos: 1, sin: 0 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of points) {
    const rise = point.y - eye.y;
    if (rise === 0) return false;
    const t = (plane - eye.y) / rise;
    if (!(t > 0 && t < 1)) return false;
    const x = placement ? originX + point.x * cos + point.z * sin : point.x;
    const z = placement ? originZ - point.x * sin + point.z * cos : point.z;
    const projectedX = eye.x + (x - eye.x) * t, projectedZ = eye.z + (z - eye.z) * t;
    minX = Math.min(minX, projectedX); maxX = Math.max(maxX, projectedX);
    minZ = Math.min(minZ, projectedZ); maxZ = Math.max(maxZ, projectedZ);
  }
  const grid = classify.grid;
  const quick = grid ? grid.box(minX, maxX, minZ, maxZ) : null;
  if (quick) return quick === "inside";
  return isSoftwarePieceBehindBoard(placement ? points.map((point) => placeSoftwarePoint(point, placement)) : points, eye, boardThickness, classify);
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
  classify: SoftwareBoardClassifier | ((points: readonly SoftwarePoint3[]) => "inside" | "outside" | "crossing"),
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
  return classifyWith(classify, projected) === "inside";
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
  // The same sums as subtract + dot, without building the relative vector (called for every drawn corner).
  const { eye, forward, right, up } = camera;
  const x = point.x - eye.x, y = point.y - eye.y, z = point.z - eye.z;
  const depth = x * forward.x + y * forward.y + z * forward.z;
  if (depth <= camera.near) {
    return { x: camera.centerX, y: camera.centerY, depth, visible: false };
  }
  const scale = camera.focalLength / depth;
  return {
    x: camera.centerX + (x * right.x + y * right.y + z * right.z) * scale,
    y: camera.centerY - (x * up.x + y * up.y + z * up.z) * scale,
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
  return getSoftwareLightLevelOf(normal.x, normal.y, normal.z);
}

/** getSoftwareLightLevel for a unit normal given as numbers. */
export function getSoftwareLightLevelOf(x: number, y: number, z: number): number {
  return 0.46 + Math.abs(x * SOFTWARE_LIGHT.x + y * SOFTWARE_LIGHT.y + z * SOFTWARE_LIGHT.z) * 0.54;
}
