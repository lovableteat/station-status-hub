import type { DiagramEdge, DiagramPoint } from "./diagramModel.ts";
import type { DiagramEdgeRoute } from "./diagramGeometry.ts";

/** A dense graph keeps its original routes and reports why bridges were paused. */
export type DiagramEdgeRoutes = ReadonlyMap<string, DiagramEdgeRoute> & { readonly notice?: string };

type Sample = { point: DiagramPoint; distance: number; t: number };
type Wire = { edge: DiagramEdge; route: DiagramEdgeRoute; samples: Sample[]; length: number; curve?: DiagramPoint[]; crossings: number[] };
type Segment = { id: number; wire: number; a: Sample; b: Sample };
type Interval = { start: number; end: number };
const EPSILON = 1e-7;
const NOTICE = "連線過於密集，已暫停跨線拱橋；請減少線段或拆成較小的圖表。";
// Hard budgets bound pathological imported drawings; sparse 6,000-wire drawings stay supported.
const MAX_SEGMENTS = 180_000;
const MAX_CELLS = 500_000;
const MAX_CANDIDATES = 3_000_000;
const MAX_CHECKS = 1_000_000;
const MAX_CROSSINGS = 80_000;
const number = (value: number) => String(Number(value.toFixed(3)));
const pointText = (point: DiagramPoint) => `${number(point.x)} ${number(point.y)}`;
const lerp = (a: DiagramPoint, b: DiagramPoint, t: number): DiagramPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: DiagramPoint, b: DiagramPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const cross = (a: DiagramPoint, b: DiagramPoint) => a.x * b.y - a.y * b.x;
const minus = (a: DiagramPoint, b: DiagramPoint): DiagramPoint => ({ x: a.x - b.x, y: a.y - b.y });

function splitCurve(points: DiagramPoint[], t: number): [DiagramPoint[], DiagramPoint[]] {
  const a = lerp(points[0], points[1], t), b = lerp(points[1], points[2], t), c = lerp(points[2], points[3], t);
  const d = lerp(a, b, t), e = lerp(b, c, t), middle = lerp(d, e, t);
  return [[points[0], a, d, middle], [middle, e, c, points[3]]];
}

function cubicPoint(points: DiagramPoint[], t: number): DiagramPoint {
  const u = 1 - t;
  return { x: u ** 3 * points[0].x + 3 * u ** 2 * t * points[1].x + 3 * u * t ** 2 * points[2].x + t ** 3 * points[3].x, y: u ** 3 * points[0].y + 3 * u ** 2 * t * points[1].y + 3 * u * t ** 2 * points[2].y + t ** 3 * points[3].y };
}

function flattenCurve(points: DiagramPoint[]): { point: DiagramPoint; t: number }[] {
  const result = [{ point: points[0], t: 0 }];
  const visit = (part: DiagramPoint[], from: number, to: number, depth: number) => {
    const chord = minus(part[3], part[0]), length = Math.hypot(chord.x, chord.y);
    const flatness = length ? Math.max(Math.abs(cross(minus(part[1], part[0]), chord)), Math.abs(cross(minus(part[2], part[0]), chord))) / length : Math.max(distance(part[0], part[1]), distance(part[0], part[2]));
    const excess = distance(part[0], part[1]) + distance(part[1], part[2]) + distance(part[2], part[3]) - length;
    // The subpixel tolerance detects real curved intersections without replacing the rendered cubic.
    if (flatness <= 0.15 && excess <= 0.15 || depth >= 8) { result.push({ point: part[3], t: to }); return; }
    const [left, right] = splitCurve(part, 0.5), middle = (from + to) / 2;
    visit(left, from, middle, depth + 1); visit(right, middle, to, depth + 1);
  };
  visit(points, 0, 1, 0);
  return result;
}

function makeWire(edge: DiagramEdge, route: DiagramEdgeRoute): Wire {
  const curve = /\sC/.test(route.path) && route.points.length === 4 ? route.points : undefined;
  const input = curve ? flattenCurve(curve) : route.points.map((point, t) => ({ point, t }));
  let length = 0;
  const samples: Sample[] = [];
  for (const sample of input) {
    const previous = samples.at(-1);
    const step = previous ? distance(previous.point, sample.point) : 0;
    if (previous && step < EPSILON) continue;
    length += step; samples.push({ ...sample, distance: length });
  }
  return { edge, route, samples, length, curve, crossings: [] };
}

function sampleAt(wire: Wire, value: number): Sample {
  const samples = wire.samples;
  if (value <= 0) return samples[0];
  if (value >= wire.length) return samples[samples.length - 1];
  let low = 1, high = samples.length - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (samples[middle].distance < value) low = middle + 1; else high = middle; }
  const a = samples[low - 1], b = samples[low], ratio = (value - a.distance) / (b.distance - a.distance), t = a.t + (b.t - a.t) * ratio;
  return { point: wire.curve ? cubicPoint(wire.curve, t) : lerp(a.point, b.point, ratio), distance: value, t };
}

function intersection(a: Segment, b: Segment): { first: number; second: number } | undefined {
  const first = minus(a.b.point, a.a.point), second = minus(b.b.point, b.a.point);
  const determinant = cross(first, second), scale = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
  // Collinear overlaps and tangent contacts are not crossings.
  if (!scale || Math.abs(determinant) / scale < 1e-7) return;
  const between = minus(b.a.point, a.a.point), t = cross(between, second) / determinant, u = cross(between, first) / determinant;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return;
  return { first: a.a.distance + (a.b.distance - a.a.distance) * t, second: b.a.distance + (b.b.distance - b.a.distance) * u };
}

/** Refine sampled cubic hits against their exact points, including shallow crossing angles. */
function refineIntersection(a: Wire, b: Wire, hit: { first: number; second: number }): typeof hit | undefined {
  if (!a.curve && !b.curve) return hit;
  let first = hit.first, second = hit.second;
  const derivative = (wire: Wire, value: number) => {
    const before = Math.max(0, value - 0.01), after = Math.min(wire.length, value + 0.01);
    const delta = minus(sampleAt(wire, after).point, sampleAt(wire, before).point);
    return { x: delta.x / (after - before), y: delta.y / (after - before) };
  };
  for (let iteration = 0; iteration < 8; iteration++) {
    const difference = minus(sampleAt(a, first).point, sampleAt(b, second).point);
    if (Math.hypot(difference.x, difference.y) < 0.001) return { first, second };
    const aDirection = derivative(a, first), bDirection = derivative(b, second), determinant = cross(aDirection, bDirection);
    if (Math.abs(determinant) < 1e-8) return;
    first -= cross(difference, bDirection) / determinant;
    second -= cross(difference, aDirection) / determinant;
    if (first <= 0 || first >= a.length || second <= 0 || second >= b.length) return;
  }
}

/** Reject an elbow or curve that merely touches the other line and turns back. */
function crossesThrough(a: Wire, aDistance: number, b: Wire, bDistance: number): boolean {
  const span = Math.min(1, aDistance / 2, (a.length - aDistance) / 2, bDistance / 2, (b.length - bDistance) / 2);
  if (span < 0.05) return false;
  const aBefore = sampleAt(a, aDistance - span).point, aAfter = sampleAt(a, aDistance + span).point;
  const bBefore = sampleAt(b, bDistance - span).point, bAfter = sampleAt(b, bDistance + span).point;
  const aAxis = minus(aAfter, aBefore), bAxis = minus(bAfter, bBefore);
  return cross(minus(aBefore, bBefore), bAxis) * cross(minus(aAfter, bBefore), bAxis) < -EPSILON
    && cross(minus(bBefore, aBefore), aAxis) * cross(minus(bAfter, aBefore), aAxis) < -EPSILON;
}

function intervals(wire: Wire): Interval[] {
  const radius = Math.max(7, (wire.edge.width ?? 2) * 1.5 + 3);
  const result: Interval[] = [];
  for (const value of wire.crossings.sort((a, b) => a - b)) {
    const size = Math.min(radius, value - 1, wire.length - value - 1);
    if (size < 2.5) continue;
    const next = { start: value - size, end: value + size }, previous = result.at(-1);
    if (previous && next.start <= previous.end + 1) previous.end = Math.max(previous.end, next.end);
    else result.push(next);
  }
  return result;
}

function bridgedRoute(wire: Wire): DiagramEdgeRoute {
  const jumps = intervals(wire);
  if (!jumps.length) return wire.route;
  const path = [`M${pointText(wire.samples[0].point)}`], bridges: string[] = [], points = wire.route.points.slice(0, -1);
  const append = (from: number, to: number) => {
    if (to - from < EPSILON) return;
    const end = sampleAt(wire, to);
    if (wire.curve) {
      const start = sampleAt(wire, from), right = splitCurve(wire.curve, start.t)[1];
      const part = splitCurve(right, (end.t - start.t) / (1 - start.t))[0];
      path.push(`C${pointText(part[1])} ${pointText(part[2])} ${pointText(part[3])}`);
    } else {
      for (const sample of wire.samples) if (sample.distance > from + EPSILON && sample.distance < to - EPSILON) path.push(`L${pointText(sample.point)}`);
      path.push(`L${pointText(end.point)}`);
    }
  };
  let cursor = 0;
  for (const jump of jumps) {
    append(cursor, jump.start);
    const start = sampleAt(wire, jump.start).point, end = sampleAt(wire, jump.end).point;
    const chord = minus(end, start), length = Math.hypot(chord.x, chord.y);
    if (length < EPSILON) { append(jump.start, jump.end); cursor = jump.end; continue; }
    const direction = chord.x < -EPSILON ? -1 : 1;
    const height = Math.min((jump.end - jump.start) / 2, Math.max(7, (wire.edge.width ?? 2) * 1.5 + 3));
    const control = { x: (start.x + end.x) / 2 + chord.y / length * height * 2 * direction, y: (start.y + end.y) / 2 - chord.x / length * height * 2 * direction };
    path.push(`Q${pointText(control)} ${pointText(end)}`);
    bridges.push(`M${pointText(start)} Q${pointText(control)} ${pointText(end)}`);
    // Control points conservatively include the entire bridge in portable export bounds.
    points.push(start, control, end);
    cursor = jump.end;
  }
  append(cursor, wire.length);
  points.push(wire.route.points[wire.route.points.length - 1]);
  return { path: path.join(" "), points, label: wire.route.label, bridgePath: bridges.join(" ") };
}

/** Compute each crossing once. A bridge belongs to the enabled wire, or the later wire if both opt in. */
export function addDiagramCrossings(edges: readonly DiagramEdge[], raw: ReadonlyMap<string, DiagramEdgeRoute>): DiagramEdgeRoutes {
  if (!edges.some(edge => edge.jump === "arc")) return raw;
  const fallback = () => Object.assign(new Map(raw), { notice: NOTICE });
  const wires: Wire[] = [];
  let sampleCount = 0;
  for (const edge of edges) {
    const wire = makeWire(edge, raw.get(edge.id)!);
    sampleCount += Math.max(0, wire.samples.length - 1);
    if (sampleCount > MAX_SEGMENTS) return fallback();
    wires.push(wire);
  }
  const segments: Segment[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let wire = 0; wire < wires.length; wire++) for (let index = 1; index < wires[wire].samples.length; index++) {
    if (segments.length >= MAX_SEGMENTS) return fallback();
    const a = wires[wire].samples[index - 1], b = wires[wire].samples[index];
    segments.push({ id: segments.length, wire, a, b });
    minX = Math.min(minX, a.point.x, b.point.x); minY = Math.min(minY, a.point.y, b.point.y);
    maxX = Math.max(maxX, a.point.x, b.point.x); maxY = Math.max(maxY, a.point.y, b.point.y);
  }
  if (!segments.length) return raw;
  const size = Math.max(24, Math.max(maxX - minX, maxY - minY) / Math.max(1, Math.sqrt(segments.length)));
  const cells = new Map<string, { all: number[]; enabled: number[] }>();
  let entries = 0, candidates = 0, checks = 0, crossings = 0;
  for (const segment of segments) {
    const a = segment.a.point, b = segment.b.point, dx = b.x - a.x, dy = b.y - a.y;
    let x = Math.floor((a.x - minX) / size), y = Math.floor((a.y - minY) / size);
    const endX = Math.floor((b.x - minX) / size), endY = Math.floor((b.y - minY) / size);
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const deltaX = dx ? size / Math.abs(dx) : Infinity, deltaY = dy ? size / Math.abs(dy) : Infinity;
    let nextX = dx ? (minX + (x + (stepX > 0 ? 1 : 0)) * size - a.x) / dx : Infinity;
    let nextY = dy ? (minY + (y + (stepY > 0 ? 1 : 0)) * size - a.y) / dy : Infinity;
    const visitedCells = new Set<string>(), seen = new Set<number>();
    const visit = (column: number, row: number) => {
      const key = `${column},${row}`;
      if (visitedCells.has(key)) return true;
      visitedCells.add(key);
      if (++entries > MAX_CELLS) return false;
      const cell = cells.get(key) ?? { all: [], enabled: [] };
      // Plain/plain pairs cannot create bridges and never enter the candidate scan.
      const bucket = wires[segment.wire].edge.jump === "arc" ? cell.all : cell.enabled;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const other = segments[id];
        if (other.wire === segment.wire || wires[other.wire].edge.jump !== "arc" && wires[segment.wire].edge.jump !== "arc") continue;
        if (++candidates > MAX_CANDIDATES) return false;
        if (Math.max(other.a.point.x, other.b.point.x) < Math.min(a.x, b.x) - EPSILON || Math.min(other.a.point.x, other.b.point.x) > Math.max(a.x, b.x) + EPSILON
          || Math.max(other.a.point.y, other.b.point.y) < Math.min(a.y, b.y) - EPSILON || Math.min(other.a.point.y, other.b.point.y) > Math.max(a.y, b.y) + EPSILON) continue;
        if (++checks > MAX_CHECKS) return false;
        const approximate = intersection(other, segment);
        const hit = approximate && refineIntersection(wires[other.wire], wires[segment.wire], approximate);
        if (!hit || !crossesThrough(wires[other.wire], hit.first, wires[segment.wire], hit.second)) continue;
        if (++crossings > MAX_CROSSINGS) return false;
        const owner = wires[segment.wire].edge.jump === "arc" ? segment.wire : other.wire;
        wires[owner].crossings.push(owner === segment.wire ? hit.second : hit.first);
      }
      cell.all.push(segment.id);
      if (wires[segment.wire].edge.jump === "arc") cell.enabled.push(segment.id);
      cells.set(key, cell);
      return true;
    };
    // Neighboring cells make grid boundaries conservative, including exact corner intersections.
    const visitAround = () => { for (let xx = x - 1; xx <= x + 1; xx++) for (let yy = y - 1; yy <= y + 1; yy++) if (!visit(xx, yy)) return false; return true; };
    if (!visitAround()) return fallback();
    while (x !== endX || y !== endY) {
      if (y === endY || x !== endX && nextX < nextY) { x += stepX; nextX += deltaX; }
      else if (x === endX || nextY < nextX) { y += stepY; nextY += deltaY; }
      else { x += stepX; y += stepY; nextX += deltaX; nextY += deltaY; }
      if (!visitAround()) return fallback();
    }
  }
  return new Map(wires.map(wire => [wire.edge.id, wire.crossings.length ? bridgedRoute(wire) : wire.route]));
}
