import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { validateFeedbackImageRecord } from "./core";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, FEEDBACK_TABS } from "./types";
import type { FeedbackAdapter, FeedbackContext, FeedbackImage, FeedbackReport } from "./types";

export const FEEDBACK_STORAGE_BUCKET = "comparison-feedback";
type FeedbackRow = Tables<"comparison_feedback">;
function throwError(error: { message: string } | null) { if (error) throw new Error(error.message); }
function mapReport(value: FeedbackRow | Json): FeedbackReport {
  const row = value as FeedbackRow;
  if (!row || !Object.keys(FEEDBACK_STATUSES).includes(row.status) || !Object.keys(FEEDBACK_CATEGORIES).includes(row.category) || !Object.keys(FEEDBACK_TABS).includes(row.comparison_tab) || !Array.isArray(row.screenshots) || row.screenshots.length > 5) throw new Error("回報資料格式無效。");
  const screenshots = row.screenshots as unknown as FeedbackImage[];
  screenshots.forEach(image => validateFeedbackImageRecord(image, row.id, row.attachment_owner_id));
  return { id: row.id, reporterId: row.reporter_id, attachmentOwnerId: row.attachment_owner_id, reporterName: row.reporter_name, reporterUsername: row.reporter_username,
    title: row.title, description: row.description, category: row.category as FeedbackReport["category"], tab: row.comparison_tab as FeedbackReport["tab"], projectName: row.project_name,
    context: row.page_context as unknown as FeedbackContext, screenshots, isSubmitted: row.is_submitted, status: row.status as FeedbackReport["status"], adminNote: row.admin_note,
    createdAt: row.created_at, submittedAt: row.submitted_at, updatedAt: row.updated_at };
}

export function createSupabaseFeedbackAdapter(): FeedbackAdapter {
  return {
    async listReports(adminMode = false) {
      if (adminMode) {
        const { data, error } = await supabase.rpc("comparison_feedback_is_admin"); throwError(error);
        if (!data) throw new Error("管理員權限已變更，請重新登入後再查看或匯出全部回報。");
      }
      const rows: FeedbackReport[] = [];
      let cursor = "";
      for (;;) {
        let query = supabase.from("comparison_feedback").select("*").eq("is_submitted", true).order("id").limit(500);
        if (cursor) query = query.gt("id", cursor);
        const { data, error } = await query;
        throwError(error);
        rows.push(...(data ?? []).map(mapReport));
        if (!data || data.length < 500) break;
        cursor = data.at(-1)!.id;
      }
      return rows.sort((first, second) => (second.submittedAt ?? second.createdAt).localeCompare(first.submittedAt ?? first.createdAt));
    },
    async getReport(id) {
      const { data, error } = await supabase.from("comparison_feedback").select("*").eq("id", id).maybeSingle();
      throwError(error); return data ? mapReport(data) : null;
    },
    async createDraft(draft) {
      const { data, error } = await supabase.rpc("create_comparison_feedback_draft", { p_id: draft.id, p_reporter_id: draft.reporterId, p_title: draft.title, p_description: draft.description,
        p_category: draft.category, p_tab: draft.tab, p_project: draft.projectName, p_context: draft.context as unknown as Json, p_images: draft.screenshots as unknown as Json });
      throwError(error); return mapReport(data);
    },
    async submitDraft(id) {
      const { data, error } = await supabase.rpc("submit_comparison_feedback", { p_id: id });
      throwError(error); return mapReport(data);
    },
    async abandonDraft(id) {
      const { error } = await supabase.rpc("abandon_comparison_feedback_draft", { p_id: id }); throwError(error);
    },
    async uploadImage(image, file) {
      const { error } = await supabase.storage.from(FEEDBACK_STORAGE_BUCKET).upload(image.path, file, { contentType: image.mime, upsert: false, cacheControl: "3600" }); throwError(error);
    },
    async removeImages(paths) {
      if (!paths.length) return;
      const { error } = await supabase.storage.from(FEEDBACK_STORAGE_BUCKET).remove(paths); throwError(error);
    },
    async downloadImage(path) {
      const { data, error } = await supabase.storage.from(FEEDBACK_STORAGE_BUCKET).download(path); throwError(error);
      if (!data) throw new Error("截圖下載失敗。"); return data;
    },
    async reviewReport(report, reviewerId, status, note) {
      const { data, error } = await supabase.rpc("review_comparison_feedback", { p_id: report.id, p_reviewer_id: reviewerId, p_status: status, p_note: note, p_expected_updated_at: report.updatedAt });
      throwError(error); return mapReport(data);
    },
  };
}
