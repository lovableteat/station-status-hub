import { supabase } from "@/integrations/supabase/client";
import { CIRCUIT_PDF_MAX_PAGES } from "./circuitPdf";
import { normalizeCircuitPdfInk, type CircuitPdfInkStroke } from "./circuitPdfInk";

// The shared preference table predates the generated schema types, as in pdfStorage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PREFERENCE_TABLE = "ui_table_preferences";
const pageKey = (seriesId: string, documentId: string, page: number) => `circuit-pdf-ink:${seriesId}:${documentId}:${page}`;
type Row = { column_order?: unknown; updated_at?: string } | null;
type DatabaseError = { code?: string; message?: string } | null;

function validatePage(seriesId: string, documentId: string, page: number) {
  if (typeof seriesId !== "string" || !seriesId.trim() || typeof documentId !== "string" || !documentId.trim()) throw new Error("PDF 識別碼無效。");
  if (!Number.isInteger(page) || page < 1 || page > CIRCUIT_PDF_MAX_PAGES) throw new Error("PDF 頁碼無效。");
}

async function withDeadline<T>(work: (signal: AbortSignal) => PromiseLike<T>, failure: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await work(controller.signal);
    if (controller.signal.aborted) throw new Error("aborted");
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${failure}：連線逾時，請重試。`);
    throw error;
  } finally { clearTimeout(timer); }
}

async function readRow(seriesId: string, documentId: string, page: number) {
  const { data, error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).select("column_order, updated_at")
    .eq("table_key", pageKey(seriesId, documentId, page)).abortSignal(signal).maybeSingle(), "無法讀取 PDF 畫筆") as { data: Row; error: DatabaseError };
  if (error) throw new Error(error.message || "無法讀取 PDF 畫筆，請重試。");
  return { strokes: normalizeCircuitPdfInk(data?.column_order, documentId, page), updatedAt: data?.updated_at || "" };
}

export async function loadCircuitPdfInk(seriesId: string, documentId: string, page: number): Promise<CircuitPdfInkStroke[]> {
  validatePage(seriesId, documentId, page);
  return (await readRow(seriesId, documentId, page)).strokes;
}

/** Re-evaluate the change against the latest page after every insert/CAS conflict. */
export async function saveCircuitPdfInk(seriesId: string, documentId: string, page: number, change: (latest: CircuitPdfInkStroke[]) => CircuitPdfInkStroke[]): Promise<CircuitPdfInkStroke[]> {
  validatePage(seriesId, documentId, page);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { strokes, updatedAt } = await readRow(seriesId, documentId, page);
    const changed = change(strokes), next = normalizeCircuitPdfInk(changed, documentId, page);
    if (!Array.isArray(changed) || next.length !== changed.length) throw new Error("PDF 畫筆資料無效，尚未儲存；請重試。");
    const column_order = { version: 1, strokes: next };
    if (!updatedAt) {
      const { error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).insert({ table_key: pageKey(seriesId, documentId, page), column_order }).abortSignal(signal), "PDF 畫筆尚未儲存") as { error: DatabaseError };
      if (!error) return next;
      if (error.code === "23505") continue;
      throw new Error(error.message || "PDF 畫筆尚未儲存，請重試。");
    }
    const updated_at = new Date(Math.max(Date.now(), (Date.parse(updatedAt) || 0) + 1)).toISOString();
    const { data, error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).update({ column_order, updated_at })
      .eq("table_key", pageKey(seriesId, documentId, page)).eq("updated_at", updatedAt).select("table_key").abortSignal(signal), "PDF 畫筆尚未儲存") as { data: unknown[] | null; error: DatabaseError };
    if (error) throw new Error(error.message || "PDF 畫筆尚未儲存，請重試。");
    if (Array.isArray(data) && data.length) return next;
  }
  throw new Error("PDF 畫筆同時有多人更新，請稍後重試；你的筆畫仍保留在畫面上。");
}
