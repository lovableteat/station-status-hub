import DOMPurify from "dompurify";
import { Activity, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { hasMeaningfulIssueContent } from "./issueInlineImages";

interface IssueProcessHistoryProps {
  processNotes?: string | null;
  status: string;
  updatedAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已關閉",
};

function formatIssueTime(value?: string | null) {
  if (!value) return "尚無更新時間";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚無更新時間";
  return date.toLocaleString("zh-TW");
}

export function IssueProcessHistory({
  processNotes,
  status,
  updatedAt,
}: IssueProcessHistoryProps) {
  const hasNotes = hasMeaningfulIssueContent(processNotes || "");
  const statusLabel = STATUS_LABELS[status] || status;

  return (
    <section data-ui="issue-process-history" aria-label="處理過程">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_22px_rgba(103,232,249,0.12)]">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#f3f8fc]">處理過程</h3>
            <p className="mt-0.5 text-xs text-[#8faabd]">檢查步驟、判斷結果與後續動作</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "rounded-md px-2.5 py-1 text-xs",
            hasNotes
              ? "border-lime-300/45 bg-lime-300/12 text-lime-100"
              : "border-amber-300/45 bg-amber-300/12 text-amber-100",
          )}
        >
          {hasNotes ? statusLabel : "待補紀錄"}
        </Badge>
      </div>

      <div
        className={cn(
          "relative mt-3 overflow-hidden rounded-xl border p-4 pl-11",
          hasNotes
            ? "border-cyan-300/30 bg-cyan-300/[0.07]"
            : "border-amber-300/25 bg-amber-300/[0.06]",
        )}
      >
        <span
          className={cn(
            "absolute left-5 top-5 h-3 w-3 rounded-full border-2 border-[#071522] ring-2",
            hasNotes ? "bg-cyan-200 ring-cyan-300/35" : "bg-amber-200 ring-amber-300/35",
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "absolute bottom-0 left-[25px] top-8 w-px",
            hasNotes ? "bg-cyan-300/25" : "bg-amber-300/20",
          )}
          aria-hidden="true"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9fc2d4]">
            {hasNotes ? "最新處理紀錄" : "尚待更新"}
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#91aabd]">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            最後更新 {formatIssueTime(updatedAt)}
          </span>
        </div>

        {hasNotes ? (
          <div
            className="prose prose-invert mt-3 max-w-none text-sm leading-6 text-[#e6f4f8] prose-a:text-cyan-200 prose-strong:text-white"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processNotes || "") }}
          />
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-amber-200/25 bg-[#0b1b2d]/70 px-4 py-3">
            <p className="text-sm font-medium text-amber-50">目前尚未填寫處理紀錄</p>
            <p className="mt-1 text-xs leading-5 text-[#a9c0d1]">
              編輯問題後補上已檢查項目、判斷結果與下一步，內容會立即顯示在這裡。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
