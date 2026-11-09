/**
 * Schematic PDFs of a board, kept as dated versions, and how far the board has been gone through page by page.
 * One shared document per board holds the version list, the page marks and each person's reading position. It is
 * written whole, so every save merges into the latest stored copy entry by entry (the newest entry wins).
 */
export const CIRCUIT_PDF_MAX_BYTES = 50 * 1024 * 1024;
export const CIRCUIT_PDF_MAX_PAGES = 3000;
export const CIRCUIT_PDF_NAME_LIMIT = 200;
export const CIRCUIT_PDF_LABEL_LIMIT = 60;

export interface CircuitPdfDocument {
  id: string; name: string;
  /** The drawing date this PDF shows, YYYY-MM-DD (Taipei). Several PDFs of one board differ by this date. */
  date: string; label: string;
  /** Storage path; empty for a PDF that was too large for the server and is only opened on its uploader's computer. */
  path: string; localOnly: boolean;
  size: number; pages: number; uploadedAt: string; uploadedBy: string; uploadedByName: string;
  updatedAt: string; removedAt?: string;
}
export interface CircuitPdfPageMark { checked: boolean; at: string; by: string; byName: string; documentId: string }
export interface CircuitPdfPosition { documentId: string; page: number; at: string }
export interface CircuitPdfRegistry {
  version: 1; documents: CircuitPdfDocument[];
  /** Board-level page progress, keyed by page number: a page checked on an older PDF still counts as gone through. */
  pages: Record<string, CircuitPdfPageMark>;
  /** Where each person stopped reading, keyed by user id. */
  positions: Record<string, CircuitPdfPosition>;
}
export interface CircuitCropRect { x: number; y: number; width: number; height: number }

export const emptyCircuitPdfRegistry = (): CircuitPdfRegistry => ({ version: 1, documents: [], pages: {}, positions: {} });

const text = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : "";
const stamp = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : "";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const later = (left: string, right: string) => Date.parse(left || "1970-01-01T00:00:00Z") > Date.parse(right || "1970-01-01T00:00:00Z");

function document(value: unknown): CircuitPdfDocument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 100), name = text(row.name, CIRCUIT_PDF_NAME_LIMIT), date = text(row.date, 10);
  const pages = Number(row.pages), size = Number(row.size);
  if (!id || !name || !DATE.test(date) || !Number.isInteger(pages) || pages < 1 || pages > CIRCUIT_PDF_MAX_PAGES || !Number.isFinite(size) || size < 0) return null;
  const localOnly = row.localOnly === true, path = localOnly ? "" : text(row.path, 500);
  if (!localOnly && !path) return null;
  const uploadedAt = stamp(row.uploadedAt), updatedAt = stamp(row.updatedAt) || uploadedAt, removedAt = stamp(row.removedAt);
  return { id, name, date, label: text(row.label, CIRCUIT_PDF_LABEL_LIMIT), path, localOnly, size, pages, uploadedAt,
    uploadedBy: text(row.uploadedBy, 100), uploadedByName: text(row.uploadedByName, 200), updatedAt, ...(removedAt ? { removedAt } : {}) };
}

/** Reads a stored document, dropping anything malformed instead of refusing the whole list. */
export function normalizeCircuitPdfRegistry(value: unknown): CircuitPdfRegistry {
  const result = emptyCircuitPdfRegistry();
  if (!value || typeof value !== "object") return result;
  const source = value as Record<string, unknown>;
  if (Array.isArray(source.documents)) {
    const seen = new Set<string>();
    for (const entry of source.documents) {
      const row = document(entry);
      if (row && !seen.has(row.id)) { seen.add(row.id); result.documents.push(row); }
    }
  }
  if (source.pages && typeof source.pages === "object") {
    for (const [key, entry] of Object.entries(source.pages as Record<string, unknown>)) {
      const page = Number(key);
      if (!Number.isInteger(page) || page < 1 || page > CIRCUIT_PDF_MAX_PAGES || !entry || typeof entry !== "object") continue;
      const mark = entry as Record<string, unknown>, at = stamp(mark.at);
      if (!at) continue;
      result.pages[String(page)] = { checked: mark.checked === true, at, by: text(mark.by, 100), byName: text(mark.byName, 200), documentId: text(mark.documentId, 100) };
    }
  }
  if (source.positions && typeof source.positions === "object") {
    for (const [user, entry] of Object.entries(source.positions as Record<string, unknown>)) {
      if (!user || !entry || typeof entry !== "object") continue;
      const position = entry as Record<string, unknown>, page = Number(position.page), at = stamp(position.at);
      if (!Number.isInteger(page) || page < 1 || page > CIRCUIT_PDF_MAX_PAGES || !at) continue;
      result.positions[user.slice(0, 100)] = { documentId: text(position.documentId, 100), page, at };
    }
  }
  return result;
}

/** Entry-by-entry merge: the newer document, page mark and position wins, so two people saving at once keep both changes. */
export function mergeCircuitPdfRegistry(base: CircuitPdfRegistry, incoming: CircuitPdfRegistry): CircuitPdfRegistry {
  const documents = new Map(base.documents.map(row => [row.id, row]));
  for (const row of incoming.documents) {
    const known = documents.get(row.id);
    if (!known || later(row.updatedAt, known.updatedAt) || (row.updatedAt === known.updatedAt && Boolean(row.removedAt) && !known.removedAt)) documents.set(row.id, row);
  }
  const pages = { ...base.pages };
  for (const [page, mark] of Object.entries(incoming.pages)) if (!pages[page] || later(mark.at, pages[page].at)) pages[page] = mark;
  const positions = { ...base.positions };
  for (const [user, position] of Object.entries(incoming.positions)) if (!positions[user] || later(position.at, positions[user].at)) positions[user] = position;
  return { version: 1, documents: [...documents.values()], pages, positions };
}

/** Newest drawing date first; on the same date the later upload first. Removed versions are not offered. */
export function visibleCircuitPdfDocuments(registry: CircuitPdfRegistry) {
  return registry.documents.filter(row => !row.removedAt)
    .sort((left, right) => right.date.localeCompare(left.date) || right.uploadedAt.localeCompare(left.uploadedAt) || left.id.localeCompare(right.id));
}

const taipeiDate = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
export const circuitPdfToday = (now = Date.now()) => taipeiDate(now);

/** The date written in the file name (20261109, 2026-11-09, 2026_11_09, 2026.11.09), otherwise the day the file was saved. */
export function circuitPdfDateFromFile(file: { name: string; lastModified?: number }, now = Date.now()) {
  const match = /(?:^|[^0-9])(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?![0-9])/.exec(file.name);
  if (match) {
    const value = `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  return taipeiDate(file.lastModified && Number.isFinite(file.lastModified) && file.lastModified > 0 ? file.lastModified : now);
}

export type CircuitPdfPageState = "here" | "older" | "none";
/** "here": checked while this PDF was open; "older": checked on another (earlier) PDF of the board; "none": not gone through. */
export function circuitPdfPageState(registry: CircuitPdfRegistry, documentId: string, page: number): CircuitPdfPageState {
  const mark = registry.pages[String(page)];
  if (!mark?.checked) return "none";
  return mark.documentId === documentId ? "here" : "older";
}

export function circuitPdfProgress(registry: CircuitPdfRegistry, documentId: string, totalPages: number) {
  let checked = 0, here = 0, firstOpen = 0;
  for (let page = 1; page <= totalPages; page++) {
    const state = circuitPdfPageState(registry, documentId, page);
    if (state !== "none") checked++;
    if (state === "here") here++;
    if (state === "none" && !firstOpen) firstOpen = page;
  }
  return { checked, here, older: checked - here, total: totalPages, firstOpen };
}

/**
 * Where to open a PDF for this person: where they stopped in this PDF, otherwise where they stopped in the board's
 * previous PDF (a new day's PDF continues from yesterday's page), otherwise the first page nobody has gone through.
 */
export function circuitPdfResumePage(registry: CircuitPdfRegistry, userId: string, documentId: string, totalPages: number) {
  const clamp = (page: number) => Math.min(Math.max(1, page), Math.max(1, totalPages));
  const position = registry.positions[userId];
  if (position) return clamp(position.page);
  return clamp(circuitPdfProgress(registry, documentId, totalPages).firstOpen || 1);
}

/** Page numbers written in a change's 頁碼 field: "12", "P12", "12, 14-16", "第 20 頁". Ranges are capped to keep a typo harmless. */
export function parseCircuitPageNumbers(value: string, maxPage = CIRCUIT_PDF_MAX_PAGES) {
  const pages = new Set<number>();
  for (const match of value.matchAll(/(\d{1,4})(?:\s*[-~～–]\s*(\d{1,4}))?/g)) {
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
    if (end < start || end - start > 200) { if (start >= 1 && start <= maxPage) pages.add(start); continue; }
    for (let page = start; page <= end; page++) if (page >= 1 && page <= maxPage) pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

const unit = (value: number) => Math.min(1, Math.max(0, value));
/** A crop between two pointer positions given as fractions of the page; null when it is too small to be meant. */
export function normalizeCropRect(start: { x: number; y: number }, end: { x: number; y: number }, minimum = 0.004): CircuitCropRect | null {
  const x = unit(Math.min(start.x, end.x)), y = unit(Math.min(start.y, end.y));
  const width = unit(Math.max(start.x, end.x)) - x, height = unit(Math.max(start.y, end.y)) - y;
  return width < minimum || height < minimum ? null : { x, y, width, height };
}

/** Pixel size of a crop rendered so its long edge is `longEdge` px, never enlarging past `maxScale` times the PDF's own size. */
export function circuitCropOutputSize(pageWidth: number, pageHeight: number, rect: CircuitCropRect, longEdge = 2400, maxScale = 8, maxPixels = 16_000_000) {
  const width = pageWidth * rect.width, height = pageHeight * rect.height;
  let scale = Math.min(maxScale, longEdge / Math.max(width, height));
  if (width * height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (width * height));
  return { scale, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const circuitPdfVersionLabel = (row: Pick<CircuitPdfDocument, "date" | "label">) => `${row.date.slice(5).replace("-", "/")} 版${row.label ? ` ${row.label}` : ""}`;
const safeName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
export const circuitPdfImageName = (row: Pick<CircuitPdfDocument, "date" | "label">, page: number, sideLabel: string) =>
  safeName(`第${page}頁-${sideLabel}-${row.date}${row.label ? `-${row.label}` : ""}.png`).slice(0, 200);
export const circuitPdfCaption = (row: Pick<CircuitPdfDocument, "name" | "date" | "label">, page: number) =>
  `${row.date}${row.label ? ` ${row.label}` : ""} 版 PDF「${row.name}」第 ${page} 頁`.slice(0, 4000);
