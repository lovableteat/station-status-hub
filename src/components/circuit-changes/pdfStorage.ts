import { supabase } from "@/integrations/supabase/client";
import { normalizeCircuitPdfRegistry, type CircuitPdfRegistry } from "./circuitPdf";

/**
 * Schematic PDFs reuse two stores that already serve 料號申請, so no new table, bucket or policy is needed:
 * - the PDF files go to the material SPEC bucket (料號申請 view to read, edit to upload or remove; PDF allowed, 50 MB per file);
 * - the per-board version list and page progress is one shared row of ui_table_preferences, like 頁數進度.
 */
// The preference table predates the generated schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export const CIRCUIT_PDF_BUCKET = "material-spec-documents";
const PREFERENCE_TABLE = "ui_table_preferences";
const registryKey = (seriesId: string) => `circuit-change-pdfs:${seriesId}`;

async function withDeadline<T>(work: (signal: AbortSignal) => PromiseLike<T>, failure: string, milliseconds = 20_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try { return await work(controller.signal); }
  catch (error) { if (controller.signal.aborted) throw new Error(`${failure}：連線逾時，請重試。`); throw error; }
  finally { clearTimeout(timer); }
}

type Row = { column_order?: unknown; updated_at?: string } | null;
async function readRow(seriesId: string) {
  const { data, error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).select("column_order, updated_at").eq("table_key", registryKey(seriesId)).abortSignal(signal).maybeSingle(), "無法讀取 PDF 清單") as { data: Row; error: { message?: string } | null };
  if (error) throw new Error(error.message || "無法讀取 PDF 清單，請重試。");
  return { registry: normalizeCircuitPdfRegistry(data?.column_order), updatedAt: data?.updated_at || "" };
}

export async function loadCircuitPdfRegistry(seriesId: string): Promise<CircuitPdfRegistry> {
  return (await readRow(seriesId)).registry;
}

/**
 * Writes `change(latest)` only if nobody saved since it was read; otherwise reads again and merges again. Two colleagues
 * marking pages at the same moment therefore both keep their marks, instead of the later write replacing the earlier one.
 */
export async function saveCircuitPdfRegistry(seriesId: string, change: (latest: CircuitPdfRegistry) => CircuitPdfRegistry): Promise<CircuitPdfRegistry> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { registry, updatedAt } = await readRow(seriesId);
    const next = change(registry);
    if (!updatedAt) {
      const { error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).insert({ table_key: registryKey(seriesId), column_order: next }).abortSignal(signal), "PDF 清單尚未儲存") as { error: { code?: string; message?: string } | null };
      if (!error) return next;
      if (error.code === "23505") continue;
      throw new Error(error.message || "PDF 清單尚未儲存，請重試。");
    }
    const { data, error } = await withDeadline(signal => db.from(PREFERENCE_TABLE).update({ column_order: next, updated_at: new Date().toISOString() })
      .eq("table_key", registryKey(seriesId)).eq("updated_at", updatedAt).select("table_key").abortSignal(signal), "PDF 清單尚未儲存") as { data: unknown[] | null; error: { message?: string } | null };
    if (error) throw new Error(error.message || "PDF 清單尚未儲存，請重試。");
    if (Array.isArray(data) && data.length) return next;
  }
  throw new Error("PDF 清單同時有多人更新，請稍後重試；你的標記仍保留在畫面上。");
}

async function folderFor(seriesId: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seriesId)));
  return Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Stores the PDF under circuit-pdf/<board>/<id>.pdf; the bucket accepts three-part paths ending in .pdf. */
export async function uploadCircuitPdf(seriesId: string, documentId: string, file: File): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("PDF 識別碼無效。");
  const path = `circuit-pdf/${await folderFor(seriesId)}/${documentId}.pdf`;
  const { error } = await withDeadline(() => supabase.storage.from(CIRCUIT_PDF_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false }), "PDF 上傳失敗", 10 * 60_000);
  if (error) throw new Error(error.message || "PDF 上傳失敗，請重試。");
  return path;
}

export async function downloadCircuitPdf(path: string): Promise<ArrayBuffer> {
  const { data, error } = await withDeadline(() => supabase.storage.from(CIRCUIT_PDF_BUCKET).download(path), "PDF 下載失敗", 5 * 60_000);
  if (error || !data) throw new Error(error?.message || "PDF 下載失敗，請重試。");
  return data.arrayBuffer();
}

export async function removeCircuitPdfFile(path: string): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(CIRCUIT_PDF_BUCKET).remove([path]);
  if (error) throw new Error(error.message || "PDF 檔案移除失敗。");
}
