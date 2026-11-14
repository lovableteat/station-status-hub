import { pointInBoardPolygon, polygonContainsRectangle, polygonsOverlap } from "./boardOutline.ts";
import { getRotatedRectangleCorners, rectanglesOverlap } from "./geometry.ts";

export interface ResearchPoint { x: number; y: number }
export interface ResearchComponent extends ResearchPoint {
  id: string; reference: string; width: number; height: number;
  rotation: number; side: "top" | "bottom"; locked: boolean;
}
export interface ResearchPad extends ResearchPoint {
  id: string; componentId?: string; net: string; width: number; height: number;
  layers: string[]; obstacleOnly?: boolean;
}
export interface ResearchKeepout extends ResearchPoint {
  id: string; width: number; height: number; kind: "placement" | "routing" | "both"; layers?: string[];
  points?: ResearchPoint[];
}
export interface ResearchTrack {
  id: string; net: string; layer: string; width: number; points: ResearchPoint[]; locked?: boolean;
}
export interface ResearchVia extends ResearchPoint {
  id: string; net: string; diameter: number; layers: string[]; locked?: boolean;
}
export interface ResearchBoard {
  width: number; height: number; outline?: ResearchPoint[]; holes?: ResearchPoint[][];
  layers: string[]; components: ResearchComponent[]; pads: ResearchPad[];
  keepouts: ResearchKeepout[]; tracks: ResearchTrack[]; vias: ResearchVia[];
  unresolvedNets?: string[];
}
export interface ResearchRouteOptions {
  width: number; clearance: number; layers?: string[]; viaDiameter?: number;
}

const EPS = 1e-7;
const MAX_COPPER = 1000;
const MAX_ROUTING_STEPS = 12000;
const finitePoint = ({ x, y }: ResearchPoint) => Number.isFinite(x) && Number.isFinite(y);
const positive = (value: number) => Number.isFinite(value) && value > 0;
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const distance = (a: ResearchPoint, b: ResearchPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const samePoint = (a: ResearchPoint, b: ResearchPoint) => distance(a, b) < EPS;
const clean = (value: number) => Math.round(value * 1e7) / 1e7;
const outer = (board: ResearchBoard) => board.outline ?? rectangle(0, 0, board.width, board.height);
const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const keepoutShape = (zone: ResearchKeepout) => zone.points ?? rectangle(zone.x, zone.y, zone.width, zone.height);

function legalPlacement(board: ResearchBoard, part: ResearchComponent): boolean {
  const corners = getRotatedRectangleCorners(part);
  return polygonContainsRectangle(corners, outer(board))
    && !(board.holes ?? []).some(hole => polygonsOverlap(corners, hole))
    && !board.keepouts.some(zone => zone.kind !== "routing"
      && (!zone.layers?.length || zone.layers.includes(part.side === "top" ? board.layers[0] : board.layers[board.layers.length - 1]))
      && polygonsOverlap(corners, keepoutShape(zone)))
    && !board.components.some(other => other.id !== part.id && other.side === part.side && rectanglesOverlap(other, part));
}

function movedPad(pad: ResearchPad, part: ResearchComponent, candidate: ResearchComponent): ResearchPad {
  const angle = (candidate.rotation - part.rotation) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const x = pad.x - part.x, y = pad.y - part.y;
  return { ...pad, x: clean(candidate.x + x * cosine - y * sine), y: clean(candidate.y + x * sine + y * cosine),
    width: clean(pad.width * Math.abs(cosine) + pad.height * Math.abs(sine)),
    height: clean(pad.width * Math.abs(sine) + pad.height * Math.abs(cosine)) };
}

export function moveResearchComponent(board: ResearchBoard, id: string, point: ResearchPoint, rotation?: number): {
  board: ResearchBoard; affectedNets: string[]; reason?: "missing" | "locked" | "blocked";
} {
  const part = board.components.find(component => component.id === id);
  if (!part) return { board, affectedNets: [], reason: "missing" };
  if (part.locked) return { board, affectedNets: [], reason: "locked" };
  const candidate = { ...part, x: point.x, y: point.y, rotation: rotation ?? part.rotation };
  if (!finitePoint(candidate) || !Number.isFinite(candidate.rotation) || !legalPlacement(board, candidate)) {
    return { board, affectedNets: [], reason: "blocked" };
  }
  if (samePoint(part, candidate) && part.rotation === candidate.rotation) return { board, affectedNets: [] };
  const affectedNets = new Set<string>();
  const pads = board.pads.map(pad => {
    if (pad.componentId !== id) return pad;
    if (pad.net) affectedNets.add(pad.net);
    return movedPad(pad, part, candidate);
  });
  const foreignTracks = board.tracks.map(track => ({ ...track, segments: segments(track.points) }));
  if (pads.some(pad => pad.componentId === id && padHitsCopper(pad, pads, foreignTracks, board.vias))) {
    return { board, affectedNets: [], reason: "blocked" };
  }
  return { board: { ...board, components: board.components.map(item => item.id === id ? candidate : item), pads },
    affectedNets: [...affectedNets].sort() };
}

export function suggestResearchPlacement(board: ResearchBoard, ids: readonly string[]) {
  const moved: string[] = [], skipped: string[] = [], affectedNets = new Set<string>();
  for (const id of [...new Set(ids)].slice(0, 40)) {
    const part = board.components.find(component => component.id === id);
    if (!part || part.locked) { skipped.push(id); continue; }
    const nets = new Set(board.pads.filter(pad => pad.componentId === id && pad.net && !pad.obstacleOnly).map(pad => pad.net));
    const peers = board.pads.filter(pad => pad.componentId !== id && nets.has(pad.net) && !pad.obstacleOnly);
    if (!peers.length) { skipped.push(id); continue; }
    const target = { x: peers.reduce((sum, pad) => sum + pad.x, 0) / peers.length,
      y: peers.reduce((sum, pad) => sum + pad.y, 0) / peers.length };
    const stride = Math.min(3, Math.max(.5, part.width / 2, part.height / 2));
    const originalCost = legalPlacement(board, part) ? distance(part, target) : Infinity;
    const candidates: { component: ResearchComponent; cost: number }[] = [];
    // shortcut: test a bounded neighborhood around the connected pads; use global placement for full-board optimization.
    for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
      const candidate = { ...part, x: clean(target.x + dx * stride), y: clean(target.y + dy * stride) };
      const cost = distance(candidate, target) + .15 * distance(candidate, part);
      if (cost < originalCost && legalPlacement(board, candidate)) candidates.push({ component: candidate, cost });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    for (const { component } of candidates.slice(0, 12)) {
      const result = moveResearchComponent(board, id, component);
      if (result.reason || result.board === board) continue;
      board = result.board;
      moved.push(id);
      result.affectedNets.forEach(net => affectedNets.add(net));
      break;
    }
    if (!moved.includes(id)) skipped.push(id);
  }
  skipped.push(...[...new Set(ids)].slice(40));
  return { board, moved, skipped, affectedNets: [...affectedNets].sort() };
}

type Segment = [ResearchPoint, ResearchPoint];
const segments = (points: readonly ResearchPoint[]): Segment[] => points.slice(1).map((point, i) => [points[i], point]);
const edges = (points: readonly ResearchPoint[]): Segment[] => points.map((point, i) => [point, points[(i + 1) % points.length]]);
const cross = (a: ResearchPoint, b: ResearchPoint, p: ResearchPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

function pointSegmentDistance(point: ResearchPoint, [a, b]: Segment): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length < EPS * EPS) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function segmentDistance(first: Segment, second: Segment): number {
  const [a, b] = first, [c, d] = second;
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, second), pointSegmentDistance(b, second),
    pointSegmentDistance(c, first), pointSegmentDistance(d, first));
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
const bounds = ([a, b]: Segment, inset = 0): Bounds => ({
  minX: Math.min(a.x, b.x) - inset, minY: Math.min(a.y, b.y) - inset,
  maxX: Math.max(a.x, b.x) + inset, maxY: Math.max(a.y, b.y) + inset,
});
const intersects = (a: Bounds, b: Bounds) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const polygonBounds = (points: ResearchPoint[]): Bounds => ({
  minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)),
  maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)),
});

function padHitsCopper(pad: ResearchPad, pads: ResearchPad[], tracks: (ResearchTrack & { segments: Segment[] })[], vias: ResearchVia[]): boolean {
  const shape = rectangle(pad.x - pad.width / 2, pad.y - pad.height / 2, pad.width, pad.height);
  const outline = edges(shape), padBounds = polygonBounds(shape);
  const overlaps = (segment: Segment, radius: number) => intersects(padBounds, bounds(segment, radius))
    && (segment.some(point => pointInBoardPolygon(point, shape)) || outline.some(edge => segmentDistance(segment, edge) < radius));
  const mayTouch = (net: string) => !!pad.net && !pad.obstacleOnly && pad.net === net;
  return pads.some(other => other.componentId !== pad.componentId && (other.obstacleOnly || !mayTouch(other.net))
    && pad.layers.some(layer => other.layers.includes(layer))
    && intersects(padBounds, bounds([other, other], 0.5 * Math.max(other.width, other.height)))
    && Math.abs(pad.x - other.x) <= (pad.width + other.width) / 2
    && Math.abs(pad.y - other.y) <= (pad.height + other.height) / 2)
    || tracks.some(track => !mayTouch(track.net) && pad.layers.includes(track.layer)
    && track.segments.some(segment => overlaps(segment, track.width / 2)))
    || vias.some(via => !mayTouch(via.net) && via.layers.some(layer => pad.layers.includes(layer)) && overlaps([via, via], via.diameter / 2));
}

function checkGeometry(board: ResearchBoard, net: string, clearance: number, window?: Bounds) {
  const outline = outer(board);
  const outlineEdges = edges(outline);
  const holes = (board.holes ?? []).map(shape => ({ shape, bounds: polygonBounds(shape), edges: edges(shape) }));
  const layerObstacles = new Map(board.layers.map(layer => {
    const shapes = [
      ...board.keepouts.filter(zone => zone.kind !== "placement" && (!zone.layers?.length || zone.layers.includes(layer)))
        .map(zone => ({ net: "", shape: keepoutShape(zone) })),
      ...board.pads.filter(pad => pad.layers.includes(layer))
        .map(pad => ({ net: pad.obstacleOnly ? "" : pad.net,
          shape: rectangle(pad.x - pad.width / 2, pad.y - pad.height / 2, pad.width, pad.height) })),
    ].map(obj => ({ ...obj, bounds: polygonBounds(obj.shape), edges: edges(obj.shape) }));
    const copper = [
      ...board.tracks.filter(track => track.layer === layer && track.net !== net).flatMap(track =>
        segments(track.points).map(segment => ({ segment, radius: track.width / 2, via: false, net: track.net }))),
      ...board.vias.filter(via => via.layers.includes(layer)).map(via =>
        ({ segment: [via, via] as Segment, radius: via.diameter / 2, via: true, net: via.net })),
    ].map(obj => ({ ...obj, bounds: bounds(obj.segment, obj.radius) }));
    return [layer, { shapes: shapes.filter(obj => !window || intersects(obj.bounds, window)),
      copper: copper.filter(obj => !window || intersects(obj.bounds, window)) }];
  }));
  return (segment: Segment, layer: string, radius: number, via = false): boolean => {
    const obstacles = layerObstacles.get(layer);
    if (!obstacles) return false;
    const margin = radius + clearance;
    const testBounds = bounds(segment, margin);
    if (testBounds.minX < -EPS || testBounds.minY < -EPS || testBounds.maxX > board.width + EPS || testBounds.maxY > board.height + EPS) return false;
    const hits = (shape: { shape: ResearchPoint[]; bounds: Bounds; edges: Segment[] }) => intersects(testBounds, shape.bounds)
      && (segment.some(point => pointInBoardPolygon(point, shape.shape)) || shape.edges.some(edge => segmentDistance(segment, edge) < margin - EPS));
    return segment.every(point => pointInBoardPolygon(point, outline))
      && !outlineEdges.some(edge => segmentDistance(segment, edge) < margin - EPS)
      && !holes.some(hits)
      && !obstacles.shapes.some(obj => (obj.net !== net || via) && hits(obj))
      && !obstacles.copper.some(obj => (obj.net !== net || (via && obj.via)) && intersects(testBounds, obj.bounds)
        && segmentDistance(segment, obj.segment) < margin + obj.radius - EPS);
  };
}

const knownNet = (board: ResearchBoard, net: string) => !!net && board.pads.some(pad => pad.net === net && !pad.obstacleOnly);
const idAvailable = (board: ResearchBoard, id: string) => !!id && !board.tracks.some(item => item.id === id) && !board.vias.some(item => item.id === id);

export function addResearchTrack(board: ResearchBoard, track: ResearchTrack, clearance: number): { board: ResearchBoard; reason?: string } {
  if (!idAvailable(board, track.id) || !knownNet(board, track.net) || !board.layers.includes(track.layer)
    || !positive(track.width) || !nonnegative(clearance) || track.points.length < 2 || track.points.length > 500
    || !track.points.every(finitePoint) || !segments(track.points).every(([a, b]) => !samePoint(a, b))) {
    return { board, reason: "缺少有效的網路、層、線寬或線段座標" };
  }
  const canDraw = checkGeometry(board, track.net, clearance);
  if (segments(track.points).some(segment => !canDraw(segment, track.layer, track.width / 2))) {
    return { board, reason: "線段碰到板邊、孔洞、禁走區或其他網路的銅箔" };
  }
  return { board: { ...board, tracks: [...board.tracks, { ...track, locked: false }] } };
}

export function addResearchVia(board: ResearchBoard, via: ResearchVia, clearance: number): { board: ResearchBoard; reason?: string } {
  if (!idAvailable(board, via.id) || !knownNet(board, via.net) || !finitePoint(via) || !positive(via.diameter) || !nonnegative(clearance)
    || board.layers.length < 2 || via.layers.length !== board.layers.length || !board.layers.every(layer => via.layers.includes(layer))) {
    return { board, reason: "請使用有效的網路、孔徑與通孔層設定" };
  }
  const canDraw = checkGeometry(board, via.net, clearance);
  if (board.layers.some(layer => !canDraw([via, via], layer, via.diameter / 2, true))) {
    return { board, reason: "Via 碰到焊盤、孔洞、板邊、禁走區或其他網路的銅箔" };
  }
  return { board: { ...board, vias: [...board.vias, { ...via, locked: false }] } };
}

interface NetCopper { id: string; layers: string[]; segments: Segment[]; pad?: ResearchPad }

function netCopper(board: ResearchBoard, net: string) {
  const pads = board.pads.filter(pad => !!net && pad.net === net && !pad.obstacleOnly);
  const copper: NetCopper[] = [
    ...pads.map(pad => ({ id: pad.id, layers: pad.layers, segments: [[pad, pad]] as Segment[], pad })),
    ...board.tracks.filter(track => track.net === net).map(track => ({ id: track.id, layers: [track.layer], segments: segments(track.points) })),
    ...board.vias.filter(via => via.net === net).map(via => ({ id: via.id, layers: via.layers, segments: [[via, via]] as Segment[] })),
  ];
  return { pads, copper };
}

function connectedPads(board: ResearchBoard, net: string): { pads: ResearchPad[]; roots: number[]; limited: boolean } {
  const { pads, copper } = netCopper(board, net);
  const parent = copper.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
    return index;
  };
  if (copper.reduce((count, item) => count + item.segments.length, 0) > MAX_COPPER) {
    return { pads, roots: parent.slice(0, pads.length), limited: true };
  }
  // shortcut: use centerline contacts to avoid declaring a connection from an approximate pad envelope; use extracted pad geometry for exact continuity.
  for (let i = 0; pads.length > 1 && i < copper.length; i++) for (let j = i + 1; j < copper.length; j++) {
    if (find(i) === find(j)) continue;
    const first = copper[i], second = copper[j];
    if (first.layers.some(layer => second.layers.includes(layer)) && first.segments.some(a => second.segments.some(b =>
      intersects(bounds(a, EPS), bounds(b)) && segmentDistance(a, b) < EPS))) parent[find(j)] = find(i);
  }
  return { pads, roots: pads.map((_, index) => find(index)), limited: false };
}

export function getResearchPendingPads(board: ResearchBoard, net: string): string[] {
  const { pads, roots, limited } = connectedPads(board, net);
  const pending = pads.filter((_, index) => limited || roots[index] !== roots[0]).map(pad => pad.id);
  const unsupported = board.pads.filter(pad => !!net && pad.net === net && pad.obstacleOnly).map(pad => pad.id);
  return pending.concat(unsupported, board.unresolvedNets?.includes(net) ? [`unresolved:${net}`] : []);
}

interface RouteNode extends ResearchPoint { layer: string; column: number; row: number; cost: number; score: number; previous?: RouteNode }

function pushNode(queue: RouteNode[], node: RouteNode) {
  let i = queue.push(node) - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (queue[parent].score <= node.score) break;
    queue[i] = queue[parent];
    i = parent;
  }
  queue[i] = node;
}

function popNode(queue: RouteNode[]): RouteNode {
  const first = queue[0], tail = queue.pop();
  if (!tail || !queue.length) return first;
  let i = 0;
  while (i * 2 + 1 < queue.length) {
    const left = i * 2 + 1, right = left + 1;
    const child = right < queue.length && queue[right].score < queue[left].score ? right : left;
    if (queue[child].score >= tail.score) break;
    queue[i] = queue[child];
    i = child;
  }
  queue[i] = tail;
  return first;
}

const directions = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
type LayerPoint = ResearchPoint & { layer: string };

function findPath(board: ResearchBoard, start: ResearchPad, goal: ResearchPad, layers: string[], options: ResearchRouteOptions,
  budget: { remaining: number }): LayerPoint[] | undefined {
  const startLayers = layers.filter(layer => start.layers.includes(layer));
  const goalLayers = layers.filter(layer => goal.layers.includes(layer));
  if (!startLayers.length || !goalLayers.length) return;
  const viaDiameter = options.viaDiameter ?? 0;
  const allowVia = positive(viaDiameter) && viaDiameter >= options.width && layers.length > 1;
  const radius = options.width / 2;
  const padding = Math.max(5, distance(start, goal) * .25);
  const area = bounds([start, goal], padding);
  const margin = radius + options.clearance;
  const window = { minX: Math.max(margin, area.minX), minY: Math.max(margin, area.minY),
    maxX: Math.min(board.width - margin, area.maxX), maxY: Math.min(board.height - margin, area.maxY) };
  if (window.minX > window.maxX || window.minY > window.maxY) return;
  const geometry = checkGeometry(board, start.net, options.clearance, bounds([{ x: window.minX, y: window.minY },
    { x: window.maxX, y: window.maxY }], options.clearance + Math.max(radius, viaDiameter / 2)));
  for (const layer of startLayers) {
    if (goalLayers.includes(layer) && geometry([start, goal], layer, radius)) return [{ ...start, layer }, { ...goal, layer }];
  }
  // shortcut: search a bounded local grid with through vias only; integrate a constraint-aware router for dense or HDI layouts.
  const step = Math.max(.15, radius, (window.maxX - window.minX) / 100, (window.maxY - window.minY) / 100);
  const columns = Math.floor((window.maxX - window.minX) / step) + 1;
  const rows = Math.floor((window.maxY - window.minY) / step) + 1;
  const queue: RouteNode[] = [], best = new Map<string, number>();
  const key = (column: number, row: number, layer: string) => `${column},${row},${layer}`;
  function visit(column: number, row: number, layer: string, previous?: RouteNode) {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return;
    const point = { x: clean(window.minX + column * step), y: clean(window.minY + row * step) };
    const changesLayer = previous && previous.layer !== layer;
    const cost = (previous?.cost ?? 0) + (changesLayer ? Math.max(3, step * 5) : distance(previous ?? start, point));
    const id = key(column, row, layer);
    if (cost >= (best.get(id) ?? Infinity)) return;
    if (changesLayer) {
      if (!board.layers.every(viaLayer => geometry([point, point], viaLayer, viaDiameter / 2, true))) return;
    } else if (!geometry([previous ?? start, point], layer, radius)) return;
    best.set(id, cost);
    pushNode(queue, { ...point, layer, column, row, cost, score: cost + distance(point, goal), previous });
  }
  const startColumn = Math.round((start.x - window.minX) / step), startRow = Math.round((start.y - window.minY) / step);
  for (const layer of startLayers) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    visit(startColumn + dx, startRow + dy, layer);
  }
  while (queue.length && budget.remaining-- > 0) {
    let node: RouteNode | undefined = popNode(queue);
    if (best.get(key(node.column, node.row, node.layer)) !== node.cost) continue;
    if (goalLayers.includes(node.layer) && distance(node, goal) <= step * 1.5 && geometry([node, goal], node.layer, radius)) {
      const path: LayerPoint[] = [{ ...goal, layer: node.layer }];
      while (node) {
        path.push({ x: node.x, y: node.y, layer: node.layer });
        node = node.previous;
      }
      path.push({ ...start, layer: path[path.length - 1].layer });
      return path.reverse();
    }
    for (const [dx, dy] of directions) visit(node.column + dx, node.row + dy, node.layer, node);
    if (allowVia) for (const layer of layers) if (layer !== node.layer) visit(node.column, node.row, layer, node);
  }
}

function simplify(points: ResearchPoint[]): ResearchPoint[] {
  const simple: ResearchPoint[] = [];
  for (const point of points) {
    const prev = simple[simple.length - 1], before = simple[simple.length - 2];
    if (prev && samePoint(prev, point)) continue;
    if (before && pointSegmentDistance(prev, [before, point]) < EPS) simple.pop();
    simple.push({ x: point.x, y: point.y });
  }
  return simple;
}

export function routeResearchNet(board: ResearchBoard, net: string, options: ResearchRouteOptions): {
  board: ResearchBoard; tracks: ResearchTrack[]; vias: ResearchVia[]; pending: string[]; reason?: "unsupported" | "unroutable";
} {
  const layers = [...new Set(options.layers ?? board.layers)];
  const selection = connectedPads(board, net);
  const tracks: ResearchTrack[] = [], vias: ResearchVia[] = [];
  const outstanding = () => getResearchPendingPads(board, net);
  if (!net || board.unresolvedNets?.includes(net) || board.pads.some(pad => pad.net === net && pad.obstacleOnly)
    || selection.pads.length < 2 || selection.pads.length > 20 || selection.limited || !layers.length || layers.length > 16
    || !layers.every(layer => board.layers.includes(layer)) || !positive(options.width) || !nonnegative(options.clearance)
    || (options.viaDiameter !== undefined && (!positive(options.viaDiameter) || options.viaDiameter < options.width))) {
    return { board, tracks, vias, pending: outstanding(), reason: "unsupported" };
  }
  let serial = 0;
  const usedIds = new Set([...board.tracks, ...board.vias].map(item => item.id));
  const nextId = () => {
    let id: string;
    do { id = `trial-${++serial}`; } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const attempts = new Set<string>();
  const budget = { remaining: MAX_ROUTING_STEPS };
  for (let cycle = 0; cycle < selection.pads.length; cycle++) {
    const { pads, roots, limited } = connectedPads(board, net);
    if (limited) break;
    const pairs: { start: ResearchPad; goal: ResearchPad; key: string }[] = [];
    for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
      const key = `${i},${j}`;
      if (roots[i] === roots[j] || attempts.has(key)) continue;
      pairs.push({ start: pads[i], goal: pads[j], key });
    }
    pairs.sort((a, b) => distance(a.start, a.goal) - distance(b.start, b.goal));
    const pair = pairs[0];
    if (!pair) break;
    attempts.add(pair.key);
    const path = findPath(board, pair.start, pair.goal, layers, options, budget);
    if (!path) continue;
    const newTracks: ResearchTrack[] = [], newVias: ResearchVia[] = [];
    let layer = path[0].layer, points: ResearchPoint[] = [];
    const appendTrack = () => {
      const trackPoints = simplify(points);
      if (trackPoints.length > 1) newTracks.push({ id: nextId(), net, layer, width: options.width, points: trackPoints });
    };
    for (const point of path) {
      if (point.layer !== layer) {
        appendTrack();
        newVias.push({ id: nextId(), net, x: point.x, y: point.y, diameter: options.viaDiameter ?? 0, layers: [...board.layers] });
        layer = point.layer;
        points = [];
      }
      points.push(point);
    }
    appendTrack();
    let candidate = board;
    for (const via of newVias) candidate = addResearchVia(candidate, via, options.clearance).board;
    for (const track of newTracks) candidate = addResearchTrack(candidate, track, options.clearance).board;
    if (candidate.vias.length !== board.vias.length + newVias.length || candidate.tracks.length !== board.tracks.length + newTracks.length) continue;
    board = candidate;
    tracks.push(...newTracks);
    vias.push(...newVias);
  }
  const pending = outstanding();
  return { board, tracks, vias, pending, reason: pending.length ? "unroutable" : undefined };
}
