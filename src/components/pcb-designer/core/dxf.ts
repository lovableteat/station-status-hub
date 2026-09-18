import { stitchDxfLoops } from "./dxfTopology.ts";
export { stitchDxfLoops } from "./dxfTopology.ts";
import { outlineError, pointInBoardPolygon } from "./boardOutline.ts";
/**
 * Minimal DXF reader for board outlines coming from ME.
 *
 * DXF is a tagged pair format: an integer group code on one line, its value on
 * the next. We only need the geometry entities a mechanical outline is drawn
 * with, flattened to polylines in millimetres:
 *   LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE
 * Anything else (text, dimensions, hatches, blocks) is skipped rather than
 * failing the import, because ME drawings routinely carry annotation layers.
 */

export interface DxfPoint {
  x: number;
  y: number;
}

export interface DxfOutline {
  /** Closed or open polylines, already flattened from arcs. */
  paths: DxfPoint[][];
  width: number;
  height: number;
  /** Entity types that were present but not understood. */
  skipped: string[];
  holes?: DxfPoint[][];
}

interface Pair {
  code: number;
  value: string;
}

const readPairs = (text: string): Pair[] => {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1] ?? "" });
  }
  return pairs;
};

const num = (value: string) => {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Points along an arc, dense enough that the flattening is not visible. */
const arcPoints = (
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): DxfPoint[] => {
  if (!(radius > 0)) return [];
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  const steps = Math.max(2, Math.ceil(sweep / 6));
  const points: DxfPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = ((startDeg + (sweep * i) / steps) * Math.PI) / 180;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return points;
};

/** Group the ENTITIES section into one bag of pairs per entity. */
const splitEntities = (pairs: Pair[]): { type: string; pairs: Pair[] }[] => {
  const start = pairs.findIndex(
    (pair) => pair.code === 2 && pair.value.trim() === "ENTITIES",
  );
  if (start < 0) return [];
  const entities: { type: string; pairs: Pair[] }[] = [];
  let current: { type: string; pairs: Pair[] } | null = null;
  for (let i = start + 1; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code === 0) {
      const type = pair.value.trim();
      if (type === "ENDSEC") break;
      current = { type, pairs: [] };
      entities.push(current);
      continue;
    }
    current?.pairs.push(pair);
  }
  return entities;
};

const first = (pairs: Pair[], code: number) =>
  pairs.find((pair) => pair.code === code)?.value;

export function parseDxfOutline(text: string, boardOnly = false): DxfOutline {
  const pairsAll = readPairs(text);
  const unitsAt = pairsAll.findIndex(pair => pair.code === 9 && pair.value.trim() === "$INSUNITS");
  const unit = unitsAt >= 0 ? Number(pairsAll[unitsAt + 1]?.value) : 0;
  const unitScale: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 9: 0.0254, 13: 0.001 };
  if (!(unit in unitScale)) throw new Error("不支援此 DXF 單位，請先匯出為毫米。");
  const entities = splitEntities(pairsAll);
  const paths: DxfPoint[][] = [];
  const skipped = new Set<string>();
  let pendingPolyline: DxfPoint[] | null = null;
  let pendingClosed = false;

  for (const entity of entities) {
    const { type, pairs } = entity;
    if (type === "LINE") {
      paths.push([
        { x: num(first(pairs, 10) ?? "0"), y: num(first(pairs, 20) ?? "0") },
        { x: num(first(pairs, 11) ?? "0"), y: num(first(pairs, 21) ?? "0") },
      ]);
    } else if (type === "LWPOLYLINE") {
      const vertices: Array<DxfPoint & { bulge: number }> = [];
      for (const pair of pairs) {
        if (pair.code === 10) vertices.push({ x: num(pair.value), y: 0, bulge: 0 });
        else if (vertices.length && pair.code === 20) vertices[vertices.length - 1].y = num(pair.value);
        else if (vertices.length && pair.code === 42) vertices[vertices.length - 1].bulge = num(pair.value);
      }
      const closed = (Number(first(pairs, 70) ?? "0") & 1) === 1;
      const points: DxfPoint[] = [];
      vertices.forEach((a, index) => {
        points.push({ x: a.x, y: a.y });
        if (!closed && index === vertices.length - 1) return;
        const b = vertices[(index + 1) % vertices.length];
        if (Math.abs(a.bulge) < 1e-9) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const cx = (a.x + b.x) / 2 - dy * (1 - a.bulge ** 2) / (4 * a.bulge);
        const cy = (a.y + b.y) / 2 + dx * (1 - a.bulge ** 2) / (4 * a.bulge);
        const angle = Math.atan2(a.y - cy, a.x - cx), sweep = 4 * Math.atan(a.bulge);
        const radius = Math.hypot(a.x - cx, a.y - cy), steps = Math.ceil(Math.abs(sweep) / (Math.PI / 30));
        for (let j = 1; j < steps; j++) points.push({ x: cx + radius * Math.cos(angle + sweep * j / steps), y: cy + radius * Math.sin(angle + sweep * j / steps) });
      });
      if (points.length > 1) {
        paths.push(closed ? [...points, points[0]] : points);
      }
    } else if (type === "POLYLINE") {
      pendingPolyline = [];
      pendingClosed = (Number(first(pairs, 70) ?? "0") & 1) === 1;
    } else if (type === "VERTEX") {
      pendingPolyline?.push({
        x: num(first(pairs, 10) ?? "0"),
        y: num(first(pairs, 20) ?? "0"),
      });
    } else if (type === "SEQEND") {
      if (pendingPolyline && pendingPolyline.length > 1) paths.push(pendingClosed ? [...pendingPolyline, pendingPolyline[0]] : pendingPolyline);
      pendingPolyline = null;
    } else if (type === "ARC") {
      const points = arcPoints(
        num(first(pairs, 10) ?? "0"),
        num(first(pairs, 20) ?? "0"),
        num(first(pairs, 40) ?? "0"),
        num(first(pairs, 50) ?? "0"),
        num(first(pairs, 51) ?? "0"),
      );
      if (points.length > 1) paths.push(points);
    } else if (type === "CIRCLE") {
      const points = arcPoints(
        num(first(pairs, 10) ?? "0"),
        num(first(pairs, 20) ?? "0"),
        num(first(pairs, 40) ?? "0"),
        0,
        360,
      );
      if (points.length > 1) paths.push(points);
    } else if (type !== "ENDSEC") {
      skipped.add(type);
    }
  }

  const scaled = paths.map(path => path.map(p => ({ x: p.x * unitScale[unit], y: p.y * unitScale[unit] })));
  const loops = stitchDxfLoops(scaled);
  if (boardOnly && !loops.length) throw new Error("DXF 沒有封閉板框；請將板邊線段接合後再匯入，避免以矩形代替。");
  const area = (points: DxfPoint[]) => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0));
  loops.sort((a,b) => area(b) - area(a));
  const outer = loops[0];
  const holes = loops.slice(1).filter(loop => loop.every(p => pointInBoardPolygon(p, outer))).filter((loop, index, inner) => !inner.slice(0,index).some(parent => loop.every(p => pointInBoardPolygon(p,parent))));
  const selected = boardOnly ? [outer, ...holes] : scaled;
  const all = boardOnly ? outer : scaled.flat();
  if (boardOnly && loops.length > selected.length) skipped.add("板框以外或重複的封閉輪廓");
  if (!all.length) {
    return { paths: [], width: 0, height: 0, skipped: [...skipped] };
  }
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxX = Math.max(...all.map((p) => p.x));
  const maxY = Math.max(...all.map((p) => p.y));

  const round = (value: number) => Math.round(value * 1000) / 1000;
  // Normalise so the outline starts at the origin, matching board coordinates,
  // and flip Y: DXF measures upward, the board canvas downward.
  const height = maxY - minY;
  const normalised = selected.map((path) =>
    path.map((point) => ({
      x: round(point.x - minX),
      y: round(height - (point.y - minY)),
    })),
  );

  const size = { width: round(maxX - minX), height: round(height) };
  for (const loop of boardOnly ? normalised : []) {
    const error = outlineError(loop.slice(0, -1), size);
    if (error) throw new Error(`DXF 輪廓無效：${error}`);
  }
  return {
    paths: boardOnly ? [normalised[0]] : normalised,
    ...(boardOnly ? { holes: normalised.slice(1).map(loop => loop.slice(0, -1)) } : {}),
    width: round(maxX - minX),
    height: round(height),
    skipped: [...skipped],
  };
}


export const parseDxfBoardOutline = (text: string) => parseDxfOutline(text, true);
