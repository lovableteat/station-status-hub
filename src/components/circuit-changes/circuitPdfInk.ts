import { CIRCUIT_PDF_MAX_PAGES } from "./circuitPdf";

export const CIRCUIT_PDF_INK_MAX_POINTS = 4096;
export const CIRCUIT_PDF_INK_MAX_STROKES = 1000;
export const CIRCUIT_PDF_INK_COLOR = "#ef4444";
export const CIRCUIT_PDF_INK_WIDTH = .002;

export interface CircuitPdfInkStroke {
  id: string; documentId: string; page: number;
  points: { x: number; y: number }[]; color: string; width: number;
  at: string; by: string; byName: string;
  removedAt?: string; removedBy?: string; removedByName?: string;
}

const stamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const unit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const pageValid = (page: number) => Number.isInteger(page) && page >= 1 && page <= CIRCUIT_PDF_MAX_PAGES;

function stroke(value: unknown, documentId: string, page: number): CircuitPdfInkStroke | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim() || row.documentId !== documentId || row.page !== page ||
      !Array.isArray(row.points) || !row.points.length || row.points.length > CIRCUIT_PDF_INK_MAX_POINTS ||
      typeof row.color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(row.color) ||
      typeof row.width !== "number" || !Number.isFinite(row.width) || row.width < .0001 || row.width > .03 ||
      !stamp(row.at) || typeof row.by !== "string" || typeof row.byName !== "string") return null;
  const points: CircuitPdfInkStroke["points"] = [];
  for (const point of row.points) {
    if (!point || typeof point !== "object" || !unit(point.x) || !unit(point.y)) return null;
    points.push({ x: point.x, y: point.y });
  }
  if (row.removedAt !== undefined && !stamp(row.removedAt)) return null;
  if (row.removedBy !== undefined && typeof row.removedBy !== "string") return null;
  if (row.removedByName !== undefined && typeof row.removedByName !== "string") return null;
  return { id: row.id, documentId, page, points, color: row.color, width: row.width, at: row.at, by: row.by, byName: row.byName,
    ...(row.removedAt ? { removedAt: row.removedAt as string } : {}),
    ...(typeof row.removedBy === "string" ? { removedBy: row.removedBy } : {}),
    ...(typeof row.removedByName === "string" ? { removedByName: row.removedByName } : {}) };
}

/** Invalid rows are ignored individually; existing history is never cut to the limit for new strokes. */
export function normalizeCircuitPdfInk(value: unknown, documentId: string, page: number): CircuitPdfInkStroke[] {
  if (typeof documentId !== "string" || !documentId.trim() || !pageValid(page)) return [];
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? (value as Record<string, unknown>).strokes : null;
  if (!Array.isArray(rows)) return [];
  const valid: CircuitPdfInkStroke[] = [];
  for (const entry of rows) {
    const row = stroke(entry, documentId, page);
    if (row) valid.push(row);
  }
  return mergeCircuitPdfInk([], valid);
}

const tieKey = (row: CircuitPdfInkStroke) => JSON.stringify([row.documentId, row.page, row.id, row.at, row.by, row.byName, row.color, row.width,
  row.points.map(point => [point.x, point.y]), row.removedAt || "", row.removedBy || "", row.removedByName || ""]);

/** Tombstones always win, so an older open browser cannot restore a stroke somebody removed. */
export function mergeCircuitPdfInk(base: CircuitPdfInkStroke[], incoming: CircuitPdfInkStroke[]): CircuitPdfInkStroke[] {
  const rows = new Map<string, CircuitPdfInkStroke>();
  for (const row of [...base, ...incoming]) {
    const key = JSON.stringify([row.documentId, row.page, row.id]), known = rows.get(key);
    if (!known) { rows.set(key, row); continue; }
    const removed = Boolean(row.removedAt), knownRemoved = Boolean(known.removedAt);
    const time = Date.parse(row.removedAt || row.at) - Date.parse(known.removedAt || known.at);
    if ((removed && !knownRemoved) || (removed === knownRemoved && (time > 0 || (time === 0 && tieKey(row) > tieKey(known))))) rows.set(key, row);
  }
  return [...rows.values()];
}
