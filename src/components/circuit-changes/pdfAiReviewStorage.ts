import type { AdditiveClient, AdditiveQuery } from "./storage";
import { supabase } from "@/integrations/supabase/client";
import { circuitPdfAiReviewKey, normalizeCircuitPdfAiReviewReport, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";
import { AiRequestFailure } from "../api-management/aiRequestRecovery";

export interface SavedCircuitPdfAiReview { report: CircuitPdfAiReviewReport; revision: number }
type ReviewRow = { report: unknown; revision: number };
const db = supabase as unknown as AdditiveClient<{ circuit_pdf_ai_reviews: ReviewRow }, { circuit_pdf_save_ai_review: ReviewRow }>;
/** Somebody (or an earlier attempt of ours whose reply was lost) already stored another revision of this record. */
export class CircuitAiReviewConflict extends Error { constructor(message: string) { super(message); this.name = "CircuitAiReviewConflict"; } }
/** The request never reached the database (offline, a dropped connection, no answer in time): worth waiting for, not a rejected result. */
const UNREACHABLE = /failed to fetch|networkerror|network request failed|load failed|timed? ?out|timeout|aborted|err_internet|err_network/i;
async function request<Row, Result>(query: AdditiveQuery<Row, Result>) {
  let answer;
  try { answer = await query.abortSignal(AbortSignal.timeout(20_000)); }
  catch { throw new AiRequestFailure("無法連到系統，結果還留在這個視窗，連線恢復後會自動再存。", "network"); }
  const { data, error, status } = answer;
  if (error && (status === 0 || UNREACHABLE.test(error.message ?? ""))) throw new AiRequestFailure("無法連到系統，結果還留在這個視窗，連線恢復後會自動再存。", "network");
  if (error && (status === 409 || error.code === "PT409")) throw new CircuitAiReviewConflict("初審紀錄已變更，請關閉後重新開啟核對；你的判讀尚未覆蓋其他人。");
  if (error) throw new Error(error.message || "AI 初審紀錄尚未儲存，請重試。");
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
/** Every saved review of one baseline / working pair (all pages, newest first), read in pages of 100. */
export async function loadCircuitPdfAiPairReviews(seriesId: string, officialVersionId: string, workingVersionId: string): Promise<SavedCircuitPdfAiReview[]> {
  const prefix = circuitPdfAiReviewKey({ officialVersionId, workingVersionId, officialPage: 1, workingPage: 1 }).replace(/1:1$/, "");
  const pattern = prefix.replace(/[\\%_]/g, character => `\\${character}`) + "%";
  const rows: SavedCircuitPdfAiReview[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request(db.from("circuit_pdf_ai_reviews").select("report,revision").eq("series_id", seriesId).like("target_key", pattern).order("created_at", { ascending: false }).order("id").range(offset, offset + 99));
    if (!Array.isArray(page)) throw new Error("AI 初審清單回應不完整。");
    rows.push(...page.map(saved).filter(row => row.report.key.startsWith(prefix)));
    if (page.length < 100) return rows;
  }
}
export async function saveCircuitPdfAiReview(seriesId: string, report: CircuitPdfAiReviewReport, expectedRevision: number): Promise<SavedCircuitPdfAiReview> {
  if (!normalizeCircuitPdfAiReviewReport(report)) throw new Error("AI 初審結果不完整，未寫入紀錄。");
  return saved(await request(db.rpc("circuit_pdf_save_ai_review", { p_series_id: seriesId, p_report: report, p_expected_revision: expectedRevision })));
}
