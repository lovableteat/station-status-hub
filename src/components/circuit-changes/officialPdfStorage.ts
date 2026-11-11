import type { AdditiveClient, AdditiveQuery } from "./storage";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCircuitPdfRegistry, type CircuitPdfDocument } from "./circuitPdf";

export interface CircuitPdfOfficial { documentId: string; at: string; by: string; byName: string; revision: number; document: CircuitPdfDocument }
// These additive tables are deployed before refreshing generated database types.
type OfficialRow = { document_id: string; document: unknown; updated_at: string; updated_by: string; updated_by_name: string; revision: number };
type OfficialHistoryRow = { document_id: string; document: unknown; revision: number; created_at: string; actor_name: string | null };
const db = supabase as unknown as AdditiveClient<{ circuit_pdf_official: OfficialRow; circuit_pdf_official_history: OfficialHistoryRow }, { circuit_pdf_set_official: OfficialRow }>;

async function request<Row, Result>(query: AdditiveQuery<Row, Result>) {
  const { data, error, status } = await query.abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(status === 409 || error.code === "PT409" ? "官方版本已由其他人更新，請重新載入後核對。" : error.message || "官方版本尚未儲存，請重試。");
  return data;
}
function official(row: OfficialRow): CircuitPdfOfficial | null {
  if (!row) return null;
  const document = normalizeCircuitPdfRegistry({ version: 1, documents: [row.document], pages: {}, positions: {} }).documents[0];
  if (!document || document.id !== row.document_id || document.localOnly) throw new Error("官方版本原檔資訊不完整，請重新載入。");
  return { documentId: row.document_id, at: row.updated_at, by: row.updated_by, byName: row.updated_by_name, revision: row.revision, document };
}

export async function loadCircuitPdfOfficial(seriesId: string): Promise<CircuitPdfOfficial | null> {
  return official(await request(db.from("circuit_pdf_official").select("document_id,document,updated_at,updated_by,updated_by_name,revision").eq("series_id", seriesId).maybeSingle()));
}

export async function saveCircuitPdfOfficial(seriesId: string, documentId: string): Promise<CircuitPdfOfficial> {
  const current = await loadCircuitPdfOfficial(seriesId);
  const saved = official(await request(db.rpc("circuit_pdf_set_official", { p_series_id: seriesId, p_document_id: documentId, p_expected_revision: current?.revision ?? 0 })));
  if (!saved) throw new Error("官方版本回應不完整，請重新載入確認。");
  return saved;
}

/** One time the official version was set: which PDF, by whom and when. The database keeps a row for every change. */
export interface CircuitPdfOfficialChange { revision: number; documentId: string; document: CircuitPdfDocument; at: string; byName: string }

/** Every change of the official version, newest first. */
export async function loadCircuitPdfOfficialHistory(seriesId: string): Promise<CircuitPdfOfficialChange[]> {
  const rows = await request(db.from("circuit_pdf_official_history").select("document_id,document,revision,created_at,actor_name").eq("series_id", seriesId).order("revision", { ascending: false }).limit(200));
  type HistoryRow = { document_id: string; document: unknown; revision: number; created_at: string; actor_name: string | null };
  return (Array.isArray(rows) ? rows as HistoryRow[] : []).flatMap(row => {
    const document = normalizeCircuitPdfRegistry({ version: 1, documents: [row.document], pages: {}, positions: {} }).documents[0];
    return document && document.id === row.document_id ? [{ revision: Number(row.revision) || 0, documentId: row.document_id, document, at: row.created_at, byName: row.actor_name || "" }] : [];
  });
}
