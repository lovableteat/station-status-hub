import type { PcbBoard, PcbPoint, PcbOutlineNode } from "../types.ts";

export function sampleBoardNodes(nodes: readonly PcbOutlineNode[]): PcbPoint[] {
  const points: PcbPoint[] = [];
  nodes.forEach((a, i) => {
    const b = nodes[(i + 1) % nodes.length], c = a.out ?? a, d = b.in ?? b;
    const steps = a.out || b.in ? 32 : 1;
    for (let j = 0; j < steps; j++) {
      const t = j / steps, s = 1 - t;
      points.push({ x: s ** 3 * a.x + 3 * s * s * t * c.x + 3 * s * t * t * d.x + t ** 3 * b.x,
        y: s ** 3 * a.y + 3 * s * s * t * c.y + 3 * s * t * t * d.y + t ** 3 * b.y });
    }
  });
  return points;
}

export function boardNodesPath(nodes: readonly PcbOutlineNode[], closed: boolean): string {
  if (!nodes.length) return "";
  let path = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length + Number(closed); i++) {
    const a = nodes[i - 1], b = nodes[i % nodes.length], c = a.out ?? a, d = b.in ?? b;
    path += ` C ${c.x} ${c.y} ${d.x} ${d.y} ${b.x} ${b.y}`;
  }
  return path + (closed ? " Z" : "");
}

const cross = (a: PcbPoint, b: PcbPoint, c: PcbPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a: PcbPoint, b: PcbPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const onSegment = (p: PcbPoint, a: PcbPoint, b: PcbPoint) => Math.abs(cross(a, b, p)) < 1e-6
  && p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6
  && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;

export function outlineError(points: readonly PcbPoint[], board: Pick<PcbBoard, "width" | "height">): string {
  if (points.length < 3) return "至少需要 3 個頂點。";
  if (points.length > 3999) return "板框過於複雜，請減少節點。";
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
    || p.x < 0 || p.y < 0 || p.x > board.width || p.y > board.height)) return "頂點必須在板框尺寸範圍內。";
  // ponytail: bounded O(n²) intersection check (100 nodes); use a sweep line if larger outlines are needed.
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (same(a, b)) return "相鄰頂點不能重複。";
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
        || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)) return "板框線段不能交叉或重疊。";
    }
  }
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].y - p.y * points[(i + 1) % points.length].x, 0);
  return Math.abs(area) < 0.01 ? "板框必須有面積，不能只有一條線。" : "";
}

export function getBoardPolygon(board: PcbBoard): PcbPoint[] {
  // DXF can contain unrelated open drafting paths. Only a hand-drawn closed board replaces the substrate.
  const path = board.outlineSource === "手繪板框" ? board.outline?.[0] : undefined;
  if (path && path.length >= 4 && same(path[0], path[path.length - 1])) return path.slice(0, -1);
  return [{ x: 0, y: 0 }, { x: board.width, y: 0 }, { x: board.width, y: board.height }, { x: 0, y: board.height }];
}

export const getBoardHoles = (board: PcbBoard) => (board.holes ?? []).map(sampleBoardNodes);
export const boardSurfacePath = (board: PcbBoard) => [getBoardPolygon(board), ...getBoardHoles(board)]
  .map(points => `M ${points.map(p => `${p.x},${p.y}`).join(" L ")} Z`).join(" ");

export function polygonsOverlap(a: readonly PcbPoint[], b: readonly PcbPoint[]): boolean {
  return a.some(p => pointInBoardPolygon(p, b)) || b.some(p => pointInBoardPolygon(p, a)) || polygonEdgesCross(a, b);
}

function polygonEdgesCross(a: readonly PcbPoint[], b: readonly PcbPoint[]): boolean {
  return a.some((p, i) => b.some((r, j) => {
    const q = a[(i + 1) % a.length], s = b[(j + 1) % b.length];
    return cross(p,q,r) * cross(p,q,s) < 0 && cross(r,s,p) * cross(r,s,q) < 0
      || onSegment(r,p,q) || onSegment(s,p,q) || onSegment(p,r,s) || onSegment(q,r,s);
  }));
}

export function boardHolesError(board: PcbBoard): string {
  const outer = getBoardPolygon(board), holes = getBoardHoles(board);
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    const error = outlineError(hole, board);
    if (error) return `孔 ${i + 1}：${error}`;
    if (!hole.every(p => pointInBoardPolygon(p, outer)) || polygonEdgesCross(hole, outer)) return `孔 ${i + 1} 必須完整位於板內，不能碰到板邊。`;
    if (holes.slice(0, i).some(other => polygonsOverlap(hole, other))) return "孔洞不能重疊或相互包含。";
  }
  return "";
}

export function pointInBoardPolygon(point: PcbPoint, polygon: readonly PcbPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(point, a, b)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonContainsRectangle(corners: readonly PcbPoint[], polygon: readonly PcbPoint[]): boolean {
  if (!corners.every(p => pointInBoardPolygon(p, polygon))) return false;
  // Check every edge interval, including a notch whose corners lie exactly on the rectangle edge.
  return corners.every((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const parameters = [0, 1];
    polygon.forEach((c, j) => {
      const d = polygon[(j + 1) % polygon.length];
      const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(denominator) < 1e-9) return;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) parameters.push(t);
    });
    parameters.sort((x, y) => x - y);
    return parameters.slice(1).every((t, j) => {
      const mid = (t + parameters[j]) / 2;
      return pointInBoardPolygon({ x: a.x + mid * (b.x - a.x), y: a.y + mid * (b.y - a.y) }, polygon);
    });
  });
}
