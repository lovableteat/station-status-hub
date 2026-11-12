import type { AdditiveClient, AdditiveQuery } from "./storage";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCircuitPdfAiReviewReport, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";

export interface SavedCircuitPdfAiReview { report: CircuitPdfAiReviewReport; revision: number }
type ReviewRow = { report: unknown; revision: number };
const db = supabase as unknown as AdditiveClient<{ circuit_pdf_ai_reviews: ReviewRow }, { circuit_pdf_save_ai_review: ReviewRow }>;
async function request<Row, Result>(query: AdditiveQuery<Row, Result>) {
  const { data, error, status } = await query.abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error(status === 409 || error.code === "PT409" ? "初審紀錄已變更，請關閉後重新開啟核對；你的判讀尚未覆蓋其他人。" : error.message || "AI 初審紀錄尚未儲存，請重試。");
  return data;
}
function saved(row: ReviewRow): SavedCircuitPdfAiReview {
  const report = normalizeCircuitPdfAiReviewReport(row?.report);
  if (!report || !Number.isInteger(row.revision) || row.revision < 1) throw new Error("AI 初審紀錄格式不完整，請重新載入。");
  return { report, revision: row.revision };
}
export async function loadCircuitPdfAiReviews(seriesId: string, targetKey: string): Promise<SavedCircuitPdfAiReview[]> {
  const rows: SavedCircuitPdfAiReview[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request(db.from("circuit_pdf_ai_reviews").select("report,revision").eq("series_id", seriesId).eq("target_key", targetKey).order("created_at", { ascending: false }).order("id").range(offset, offset + 99));
    if (!Array.isArray(page)) throw new Error("AI 初審清單回應不完整。");
    rows.push(...page.map(saved));
    if (page.length < 100) return rows;
  }
}
export async function saveCircuitPdfAiReview(seriesId: string, report: CircuitPdfAiReviewReport, expectedRevision: number): Promise<SavedCircuitPdfAiReview> {
  if (!normalizeCircuitPdfAiReviewReport(report)) throw new Error("AI 初審結果不完整，未寫入紀錄。");
  return saved(await request(db.rpc("circuit_pdf_save_ai_review", { p_series_id: seriesId, p_report: report, p_expected_revision: expectedRevision })));
}
