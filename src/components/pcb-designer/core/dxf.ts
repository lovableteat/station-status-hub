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

export function parseDxfOutline(text: string): DxfOutline {
  const entities = splitEntities(readPairs(text));
  const paths: DxfPoint[][] = [];
  const skipped = new Set<string>();
  let pendingPolyline: DxfPoint[] | null = null;

  for (const entity of entities) {
    const { type, pairs } = entity;
    if (type === "LINE") {
      paths.push([
        { x: num(first(pairs, 10) ?? "0"), y: num(first(pairs, 20) ?? "0") },
        { x: num(first(pairs, 11) ?? "0"), y: num(first(pairs, 21) ?? "0") },
      ]);
    } else if (type === "LWPOLYLINE") {
      const xs = pairs.filter((pair) => pair.code === 10).map((p) => num(p.value));
      const ys = pairs.filter((pair) => pair.code === 20).map((p) => num(p.value));
      const points = xs.map((x, index) => ({ x, y: ys[index] ?? 0 }));
      const closed = (Number(first(pairs, 70) ?? "0") & 1) === 1;
      if (points.length > 1) {
        paths.push(closed ? [...points, points[0]] : points);
      }
    } else if (type === "POLYLINE") {
      pendingPolyline = [];
    } else if (type === "VERTEX") {
      pendingPolyline?.push({
        x: num(first(pairs, 10) ?? "0"),
        y: num(first(pairs, 20) ?? "0"),
      });
    } else if (type === "SEQEND") {
      if (pendingPolyline && pendingPolyline.length > 1) paths.push(pendingPolyline);
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

  const all = paths.flat();
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
  const normalised = paths.map((path) =>
    path.map((point) => ({
      x: round(point.x - minX),
      y: round(height - (point.y - minY)),
    })),
  );

  return {
    paths: normalised,
    width: round(maxX - minX),
    height: round(height),
    skipped: [...skipped],
  };
}
