import type { Artifact, ComparisonSession, ReviewReply, TrackRow } from "./types";

export const DISPOSITIONS = ["修改", "刻意設計", "誤報", "待討論", "N/A"];
export const EMPTY_REPLY: ReviewReply = { disp: "", owner: "", target_rev: "", note: "", filled: "" };
export type ReplyPatch = Partial<Pick<ReviewReply, "disp" | "owner" | "target_rev" | "note">>;
export type ReplyPatches = Record<string, ReplyPatch>;
export interface PdfLocation { page: number | null; centre: [number, number] | null; boxed: boolean | null; }

/** Use the engine's annotated-PDF sidecars, whose physical pages include the index. */
export function readPdfLocations(artifacts: Artifact[], side: "a" | "b"): Map<string, PdfLocation> {
  const output = new Map<string, PdfLocation>();
  const artifact = artifacts.find(item => item.key === (side === "a" ? "annotations_a" : "annotations"));
  if (!artifact || artifact.bytes.byteLength > 32 * 1024 * 1024) return output;
  try {
    const source = JSON.parse(new TextDecoder().decode(artifact.bytes));
    for (const [key, item] of Object.entries(source?.rows ?? {})) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const centre = row.centre_top;
      output.set(key, {
        page: Number.isSafeInteger(row.pdf_page) && Number(row.pdf_page) > 0 && Number(row.pdf_page) <= 100000 ? Number(row.pdf_page) : null,
        centre: Array.isArray(centre) && centre.length === 2 && centre.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0) ? centre as [number, number] : null,
        boxed: typeof row.boxed === "boolean" ? row.boxed : null,
      });
    }
  } catch { /* Old backups may not have a usable sidecar; leave locations explicitly unknown. */ }
  return output;
}

/** Same root-cause semantics as AutoCheck ui_viewer.with_parents/fold_children. */
export function rootCauseView(all: TrackRow[], matches: TrackRow[], fold: boolean, locations: Map<string, PdfLocation>, revealKey?: string): TrackRow[] {
  const keys = new Set(matches.map(row => row.key));
  for (const row of matches) if (row.parent) keys.add(row.parent);
  if (revealKey && all.some(row => row.key === revealKey)) keys.add(revealKey);
  return all.filter(row => keys.has(row.key) && (!fold || !row.parent || !keys.has(row.parent)
    || locations.get(row.key)?.boxed !== false || row.key === revealKey));
}

export function pdfTarget(url: string, row: TrackRow, location: PdfLocation | undefined, zoom: number, width: number, height: number): string {
  const base = url.split("#")[0];
  if (zoom && location?.page && location.centre) {
    const left = Math.max(0, location.centre[0] * 4 / 3 - width / (zoom / 100) / 2);
    const top = Math.max(0, location.centre[1] * 4 / 3 - Math.max(0, height - 56) / (zoom / 100) / 2);
    return `${base}#page=${location.page}&zoom=${zoom},${Math.round(left)},${Math.round(top)}`;
  }
  return location?.page ? `${base}#page=${location.page}` : `${base}#nameddest=${encodeURIComponent(row.dest)}`;
}

/** Apply only edited cells to the latest snapshot, once, so batch saves cannot erase other replies. */
export function applyReplyPatches(current: ComparisonSession, patches: ReplyPatches, now = new Date()): ComparisonSession {
  const replies = { ...current.replies };
  const history = [...current.history];
  const rowKeys = new Set(current.result.rows.map(row => row.key));
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  for (const [key, patch] of Object.entries(patches)) {
    if (!rowKeys.has(key)) throw new Error("找不到要回覆的追蹤項目，請重新選取。");
    const old = current.replies[key] ?? EMPTY_REPLY;
    const next = { ...old };
    let changed = false;
    for (const field of ["disp", "owner", "target_rev", "note"] as const) {
      if (patch[field] === undefined) continue;
      if (typeof patch[field] !== "string" || patch[field].length > (field === "note" ? 10000 : 120)) throw new Error("回覆欄位格式或長度無效。");
      const value = patch[field].trim();
      if (value === old[field]) continue;
      history.push({ key, field, old: old[field], value, at: now.toISOString() });
      next[field] = value; changed = true;
    }
    if (changed) replies[key] = { ...next, filled: date };
  }
  return history.length === current.history.length ? current : { ...current, replies, history, savedAt: now.toISOString() };
}
