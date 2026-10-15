import type { DiagramEdge, DiagramNode, DiagramPoint, DiagramPort } from "./diagramModel.ts";

type Nodes = readonly DiagramNode[] | ReadonlyMap<string, DiagramNode>;
export interface DiagramEdgeRoute { path: string; points: DiagramPoint[]; label: DiagramPoint }
export interface DiagramEdgeEndpoint { point: DiagramPoint; port?: DiagramPort; node?: DiagramNode }

const vectors: Record<DiagramPort, DiagramPoint> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
const n = (value: number) => String(Number(value.toFixed(3)));
const p = (point: DiagramPoint) => `${n(point.x)} ${n(point.y)}`;
const offset = (point: DiagramPoint, vector: DiagramPoint, distance: number): DiagramPoint => ({ x: point.x + vector.x * distance, y: point.y + vector.y * distance });

export function diagramNodeAnchor(node: DiagramNode, port: DiagramPort): DiagramPoint {
  return { x: node.x + node.width * (port === "left" ? 0 : port === "right" ? 1 : 0.5), y: node.y + node.height * (port === "top" ? 0 : port === "bottom" ? 1 : 0.5) };
}

/** Resolve persisted endpoints rather than transient canvas handles or virtual nodes. */
export function diagramEdgeEndpoint(edge: DiagramEdge, side: "source" | "target", nodes: Nodes): DiagramEdgeEndpoint {
  const id = edge[side];
  if (id) {
    const node = Array.isArray(nodes) ? nodes.find(node => node.id === id) : (nodes as ReadonlyMap<string, DiagramNode>).get(id);
    if (!node) throw new Error("連線的圖形不存在。");
    const port = (side === "source" ? edge.sourcePort : edge.targetPort) ?? (side === "source" ? "right" : "left");
    return { point: diagramNodeAnchor(node, port), port, node };
  }
  const point = side === "source" ? edge.sourcePoint : edge.targetPoint;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("連線缺少有效端點。");
  return { point: { ...point } };
}

function halfway(points: DiagramPoint[]): DiagramPoint {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] && lengths[index]) {
      const ratio = remaining / lengths[index];
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    remaining -= lengths[index];
  }
  return { ...points[0] };
}

function polyline(input: DiagramPoint[]): DiagramEdgeRoute {
  const points = input.filter((point, index) => !index || point.x !== input[index - 1].x || point.y !== input[index - 1].y);
  return { path: `M${p(points[0])} ${points.slice(1).map(point => `L${p(point)}`).join(" ")}`.trim(), points, label: halfway(points) };
}

function loop(source: DiagramEdgeEndpoint, target: DiagramEdgeEndpoint): DiagramEdgeRoute {
  const node = source.node!, sourcePort = source.port!, targetPort = target.port!;
  const gap = 40, left = node.x - gap, right = node.x + node.width + gap, top = node.y - gap, bottom = node.y + node.height + gap;
  const order: DiagramPort[] = ["top", "right", "bottom", "left"];
  const corners = [{ x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }];
  let index = order.indexOf(sourcePort);
  const delta = (order.indexOf(targetPort) - index + 4) % 4;
  const direction = delta > 2 ? -1 : 1, steps = delta === 0 ? 4 : Math.min(delta, 4 - delta);
  const points = [source.point, offset(source.point, vectors[sourcePort], gap)];
  for (let step = 0; step < steps; step++) {
    const next = (index + direction + 4) % 4;
    points.push(corners[direction === 1 ? index : next], offset(diagramNodeAnchor(node, order[next]), vectors[order[next]], gap));
    index = next;
  }
  return polyline([...points, target.point]);
}

function crossesNode(a: DiagramPoint, b: DiagramPoint, node: DiagramNode): boolean {
  if (a.x === b.x) return a.x > node.x && a.x < node.x + node.width && Math.max(Math.min(a.y, b.y), node.y) < Math.min(Math.max(a.y, b.y), node.y + node.height);
  return a.y > node.y && a.y < node.y + node.height && Math.max(Math.min(a.x, b.x), node.x) < Math.min(Math.max(a.x, b.x), node.x + node.width);
}

/** A small visibility grid handles ports facing away from the other endpoint. */
function avoidEndpointNodes(start: DiagramPoint, end: DiagramPoint, nodes: DiagramNode[], fallback: DiagramPoint[]): DiagramPoint[] {
  if (!nodes.some(node => fallback.slice(1).some((point, index) => crossesNode(fallback[index], point, node)))) return fallback;
  const xs = [...new Set([start.x, end.x, ...nodes.flatMap(node => [node.x - 40, node.x + node.width + 40])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...nodes.flatMap(node => [node.y - 40, node.y + node.height + 40])])].sort((a, b) => a - b);
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const source = points.findIndex(point => point.x === start.x && point.y === start.y), target = points.findIndex(point => point.x === end.x && point.y === end.y);
  const costs = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  costs[source] = 0;
  for (let count = 0; count < points.length; count++) {
    let next = -1;
    for (let index = 0; index < points.length; index++) if (!visited.has(index) && (next < 0 || costs[index] < costs[next])) next = index;
    if (next < 0 || !Number.isFinite(costs[next])) break;
    if (next === target) {
      const result: DiagramPoint[] = [];
      for (let cursor = target; cursor >= 0; cursor = previous[cursor]) result.push(points[cursor]);
      return result.reverse();
    }
    visited.add(next);
    const column = next % xs.length, row = Math.floor(next / xs.length);
    const neighbors = [column > 0 ? next - 1 : -1, column < xs.length - 1 ? next + 1 : -1, row > 0 ? next - xs.length : -1, row < ys.length - 1 ? next + xs.length : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited.has(neighbor) || nodes.some(node => crossesNode(points[next], points[neighbor], node))) continue;
      const cost = costs[next] + Math.abs(points[next].x - points[neighbor].x) + Math.abs(points[next].y - points[neighbor].y) + 0.01;
      if (cost < costs[neighbor]) { costs[neighbor] = cost; previous[neighbor] = next; }
    }
  }
  // Overlapping shapes may have no unobstructed route between their handles.
  return fallback;
}

/** Shared by the interactive edge, drawing preview, and portable SVG/PNG/PDF exports. */
export function diagramEdgeRoute(edge: DiagramEdge, nodes: Nodes): DiagramEdgeRoute {
  const source = diagramEdgeEndpoint(edge, "source", nodes), target = diagramEdgeEndpoint(edge, "target", nodes);
  const start = source.point, end = target.point, kind = edge.lineType ?? "elbow";
  if (source.node && source.node.id === target.node?.id && kind !== "straight") return loop(source, target);
  if (kind === "straight") return polyline([start, end]);
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const outward: DiagramPoint = horizontal ? { x: end.x >= start.x ? 1 : -1, y: 0 } : { x: 0, y: end.y >= start.y ? 1 : -1 };
  const sourceVector = source.port ? vectors[source.port] : outward;
  const targetVector = target.port ? vectors[target.port] : { x: -outward.x, y: -outward.y };
  if (kind === "curve") {
    const distance = Math.max(32, Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) / 2));
    const first = offset(start, sourceVector, distance), second = offset(end, targetVector, distance);
    return { path: `M${p(start)} C${p(first)} ${p(second)} ${p(end)}`, points: [start, first, second, end], label: { x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8, y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8 } };
  }
  const distance = Math.max(16, Math.min(40, Math.hypot(end.x - start.x, end.y - start.y) / 4));
  const first = source.port ? offset(start, sourceVector, distance) : start;
  const last = target.port ? offset(end, targetVector, distance) : end;
  const sourceHorizontal = source.port ? Boolean(sourceVector.x) : horizontal;
  const targetHorizontal = target.port ? Boolean(targetVector.x) : horizontal;
  let bends: DiagramPoint[];
  if (sourceHorizontal && targetHorizontal) {
    const x = (first.x + last.x) / 2;
    bends = [{ x, y: first.y }, { x, y: last.y }];
  } else if (!sourceHorizontal && !targetHorizontal) {
    const y = (first.y + last.y) / 2;
    bends = [{ x: first.x, y }, { x: last.x, y }];
  } else bends = sourceHorizontal ? [{ x: last.x, y: first.y }] : [{ x: first.x, y: last.y }];
  const endpointNodes = [source.node, target.node].filter((node): node is DiagramNode => Boolean(node));
  const middle = avoidEndpointNodes(first, last, endpointNodes, [first, ...bends, last]);
  return polyline([start, ...middle, end]);
}
