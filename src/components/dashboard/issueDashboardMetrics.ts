export interface DashboardIssue {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  system_name?: string | null;
  station_name?: string | null;
}

export function isPendingIssue(issue: DashboardIssue) {
  return ["open", "in_progress"].includes(issue.status || "open");
}

export function getIssueIdleDays(issue: DashboardIssue, now = new Date()) {
  const updated = Date.parse(issue.updated_at || "");
  const created = Date.parse(issue.created_at || "");
  const timestamp = Number.isFinite(updated) ? updated : created;
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000)) : null;
}

export function calculateIssueDashboardMetrics<T extends DashboardIssue>(issues: T[], now = new Date()) {
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const pendingIssues = issues.filter(isPendingIssue).sort((left, right) =>
    (priorityOrder[left.priority || "medium"] ?? 2) - (priorityOrder[right.priority || "medium"] ?? 2)
    || (getIssueIdleDays(right, now) ?? -1) - (getIssueIdleDays(left, now) ?? -1)
    || left.id.localeCompare(right.id));
  const counts = {
    pending: pendingIssues.length,
    open: pendingIssues.filter(issue => (issue.status || "open") === "open").length,
    inProgress: pendingIssues.filter(issue => issue.status === "in_progress").length,
    resolved: issues.filter(issue => ["resolved", "closed"].includes(issue.status || "open")).length,
    critical: pendingIssues.filter(issue => issue.priority === "critical").length,
    unassigned: pendingIssues.filter(issue => !issue.assigned_to?.trim()).length,
    stale: pendingIssues.filter(issue => (getIssueIdleDays(issue, now) ?? -1) >= 7).length,
  };
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const owners = new Map<string, { owner: string; count: number; critical: number }>();
  pendingIssues.forEach(issue => {
    const priority = issue.priority && Object.keys(priorityCounts).includes(issue.priority) ? issue.priority as keyof typeof priorityCounts : "medium";
    priorityCounts[priority] += 1;
    const owner = issue.assigned_to?.trim() || "";
    const row = owners.get(owner) ?? { owner, count: 0, critical: 0 };
    row.count += 1;
    row.critical += Number(priority === "critical");
    owners.set(owner, row);
  });
  const ownerRows = [...owners.values()].sort((left, right) => right.count - left.count || right.critical - left.critical || left.owner.localeCompare(right.owner, "zh-Hant"));
  return { counts, pendingIssues, priorityCounts, ownerRows };
}
