import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { calculateIssueDashboardMetrics, getIssueIdleDays, type DashboardIssue } from "@/components/dashboard/issueDashboardMetrics";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { fetchAllPages } from "@/hooks/fetchAllPages";
import { supabase } from "@/integrations/supabase/client";
import { getEffectivePriority } from "@/lib/issuePriority";

const PRIORITY_LABELS: Record<string, string> = { critical: "緊急", high: "高", medium: "中", low: "低" };
const VISIBLE_ISSUES = 3;

interface MobileHomeTasksProps {
  onOpenIssue: (issueId: string) => void;
  onOpenAll: () => void;
}

/** Phone home: the project's most urgent unresolved issues. Mounted on phones only, so desktop never pays for this read. */
export function MobileHomeTasks({ onOpenIssue, onOpenAll }: MobileHomeTasksProps) {
  const { activeProjectId } = useTestProject();
  const [issues, setIssues] = useState<DashboardIssue[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIssues(null);
    setFailed(false);
    if (!activeProjectId) { setIssues([]); return; }
    void (async () => {
      try {
        const { data, error } = await fetchAllPages((from, to) => supabase
          .from("issues")
          .select("id, title, priority, priority_manual, status, assigned_to, created_at, updated_at")
          .eq("project_id", activeProjectId)
          .order("id")
          .range(from, to));
        if (cancelled) return;
        if (error) throw error;
        setIssues(data.map(issue => ({ ...issue, priority: getEffectivePriority(issue.priority, issue.priority_manual, issue.created_at), status: issue.status || "open" })));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId, reload]);

  const pending = useMemo(() => calculateIssueDashboardMetrics(issues ?? []).pendingIssues, [issues]);
  const retry = useCallback(() => setReload(current => current + 1), []);

  return (
    <section className="mobile-home-tasks" aria-label="待處理問題" data-testid="mobile-home-tasks">
      <div className="mobile-home-section">
        <h2>待處理問題{issues ? ` ${pending.length}` : ""}</h2>
        {pending.length > VISIBLE_ISSUES && <button type="button" onClick={onOpenAll}>查看全部</button>}
      </div>
      {failed ? (
        <div className="mobile-home-note" role="alert"><span>問題清單暫時載入失敗</span><button type="button" onClick={retry}>重試</button></div>
      ) : !issues ? (
        <p className="mobile-home-note" role="status">正在載入問題…</p>
      ) : pending.length === 0 ? (
        <p className="mobile-home-note">目前沒有待處理問題</p>
      ) : pending.slice(0, VISIBLE_ISSUES).map(issue => {
        const idle = getIssueIdleDays(issue);
        return (
          <button key={issue.id} type="button" className="mobile-home-issue" data-priority={issue.priority ?? "medium"} onClick={() => onOpenIssue(issue.id)}>
            <span className="mobile-home-issue__tag">{PRIORITY_LABELS[issue.priority ?? "medium"] ?? "中"}</span>
            <span className="mobile-home-issue__text">
              <strong>{issue.title}</strong>
              <small>{issue.assigned_to?.trim() || "未指派"}{idle !== null ? ` · ${idle} 天未更新` : ""}</small>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}
