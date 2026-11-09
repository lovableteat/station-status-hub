import { supabase } from "@/integrations/supabase/client";
import { normalizeCircuitPdfRegistry, type CircuitPdfDocument } from "./circuitPdf";

export interface CircuitPdfOfficial { documentId: string; at: string; by: string; byName: string; revision: number; document: CircuitPdfDocument }
// These additive tables are deployed before refreshing generated database types.
const db = supabase as any;

async function request(query: any) {
  const { data, error, status } = await query.abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(status === 409 || error.code === "PT409" ? "官方基準已由其他人更新，請重新載入後核對。" : error.message || "官方基準尚未儲存，請重試。");
  return data;
}
function official(row: any): CircuitPdfOfficial | null {
  if (!row) return null;
  const document = normalizeCircuitPdfRegistry({ version: 1, documents: [row.document], pages: {}, positions: {} }).documents[0];
  if (!document || document.id !== row.document_id || document.localOnly) throw new Error("官方基準原檔資訊不完整，請重新載入。");
  return { documentId: row.document_id, at: row.updated_at, by: row.updated_by, byName: row.updated_by_name, revision: row.revision, document };
}

export async function loadCircuitPdfOfficial(seriesId: string): Promise<CircuitPdfOfficial | null> {
  return official(await request(db.from("circuit_pdf_official").select("document_id,document,updated_at,updated_by,updated_by_name,revision").eq("series_id", seriesId).maybeSingle()));
}

export async function saveCircuitPdfOfficial(seriesId: string, documentId: string): Promise<CircuitPdfOfficial> {
  const current = await loadCircuitPdfOfficial(seriesId);
  const saved = official(await request(db.rpc("circuit_pdf_set_official", { p_series_id: seriesId, p_document_id: documentId, p_expected_revision: current?.revision ?? 0 })));
  if (!saved) throw new Error("官方基準回應不完整，請重新載入確認。");
  return saved;
}
