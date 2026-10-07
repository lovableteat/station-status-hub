import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import type { Tables } from "@/integrations/supabase/types";

export const WORK_REPORT_STATUSES = { "on-track": "進行中", blocked: "待協助", completed: "已完成" } as const;
export type WorkReportDraft = Pick<Tables<"data_center_work_reports">, "report_date" | "site_id" | "summary" | "next_steps" | "blockers" | "status">;
export type DailyWorkReport = Tables<"data_center_work_reports"> & { author: { display_name: string } | null };
const REPORT_COLUMNS = "*,author:system_users!data_center_work_reports_author_id_fkey(display_name)";

export function taipeiReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function validateWorkReport(draft: WorkReportDraft): WorkReportDraft {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.report_date) || Number.isNaN(Date.parse(draft.report_date))
    || new Date(draft.report_date).toISOString().slice(0, 10) !== draft.report_date
    || draft.report_date < "2000-01-01" || draft.report_date > taipeiReportDate()) throw new Error("請選擇有效的回報日期，不可晚於今天。");
  if (!draft.site_id.trim()) throw new Error("請選擇回報站點。");
  if (!Object.prototype.hasOwnProperty.call(WORK_REPORT_STATUSES, draft.status)) throw new Error("請選擇有效的工作狀態。");
  if (!draft.summary.trim() || draft.summary.length > 6000) throw new Error("今日完成內容必填，最多 6000 字。");
  if (draft.next_steps.length > 3000 || draft.blockers.length > 3000) throw new Error("下一步與阻礙各最多 3000 字。");
  return { ...draft, summary: draft.summary.trim(), next_steps: draft.next_steps.trim(), blockers: draft.blockers.trim() };
}

export async function loadDailyWorkReports(projectId: string) {
  // ponytail: latest 500 rows keep the project log bounded; add server pagination when a project reaches this ceiling.
  const { data, error } = await withReadDeadline(signal => supabase.from("data_center_work_reports")
    .select(REPORT_COLUMNS).eq("project_id", projectId).order("report_date", { ascending: false })
    .order("updated_at", { ascending: false }).limit(500).abortSignal(signal));
  if (error) throw error;
  return data as DailyWorkReport[];
}

export async function saveDailyWorkReport(projectId: string, authorId: string, draft: WorkReportDraft, previous?: { id: string; updated_at: string }) {
  if (!projectId || !authorId) throw new Error("請先登入並選擇共用專案。");
  const valid = validateWorkReport(draft);
  const signal = AbortSignal.timeout(20_000);
  const query = previous
    ? supabase.from("data_center_work_reports").update({ summary: valid.summary, next_steps: valid.next_steps, blockers: valid.blockers, status: valid.status })
      .eq("id", previous.id).eq("project_id", projectId).eq("author_id", authorId).eq("updated_at", previous.updated_at).select(REPORT_COLUMNS).abortSignal(signal).maybeSingle()
    : supabase.from("data_center_work_reports").insert({ ...valid, project_id: projectId, author_id: authorId }).select(REPORT_COLUMNS).abortSignal(signal).single();
  const { data, error } = await query;
  if (error?.code === "23505") throw new Error("這個站點今天已有你的回報，請從紀錄選擇「修改我的回報」，文字仍保留在草稿。");
  if (error) throw error;
  if (!data) throw new Error("回報版本已變更或權限已撤銷，未覆寫資料。請重新整理紀錄後再修改，草稿已保留。");
  return data as DailyWorkReport;
}
