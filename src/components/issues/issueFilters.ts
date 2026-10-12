export interface IssueFilters {
  query: string;
  station: string;
  status: "all" | "pending" | "open" | "in_progress" | "resolved" | "closed";
  priority: "all" | "critical" | "high" | "medium" | "low";
  owner: string;
  followUp: "all" | "stale";
}

export const issueFilterKeys = { query: "issueSearch", station: "issueStation", status: "issueStatus", priority: "issuePriority", owner: "issueOwner", followUp: "issueFollowUp" } as const;

export function readIssueFilters(search: string): IssueFilters {
  const params = new URLSearchParams(search);
  const status = params.get("issueStatus") || "all";
  const priority = params.get("issuePriority") || "all";
  return {
    query: params.get("issueSearch") ?? params.get("system") ?? "",
    station: params.get("issueStation") || "all",
    status: ["all", "pending", "open", "in_progress", "resolved", "closed"].includes(status) ? status as IssueFilters["status"] : "all",
    priority: ["all", "critical", "high", "medium", "low"].includes(priority) ? priority as IssueFilters["priority"] : "all",
    owner: params.get("issueOwner") || "all",
    followUp: params.get("issueFollowUp") === "stale" ? "stale" : "all",
  };
}

export function writeIssueFilters(url: URL, filters: IssueFilters) {
  url.searchParams.delete("system");
  Object.entries(issueFilterKeys).forEach(([field, key]) => {
    const value = filters[field as keyof IssueFilters];
    if (value && value !== "all") url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
}
import { getIssueIdleDays, isPendingIssue, type DashboardIssue } from "../dashboard/issueDashboardMetrics";


export function matchesIssueConditions(issue: DashboardIssue & { station_id?: string }, filters: IssueFilters, now = new Date()) {
  if (filters.station !== "all" && issue.station_id !== filters.station) return false;
  if (filters.status === "pending" && !isPendingIssue(issue)) return false;
  if (!["all", "pending"].includes(filters.status) && (issue.status || "open") !== filters.status) return false;
  if (filters.priority !== "all" && issue.priority !== filters.priority) return false;
  const owner = issue.assigned_to?.trim() || "";
  if (filters.owner === "unassigned" && owner) return false;
  if (!["all", "unassigned"].includes(filters.owner) && owner !== filters.owner) return false;
  if (filters.followUp === "stale" && (!isPendingIssue(issue) || (getIssueIdleDays(issue, now) ?? -1) < 7)) return false;
  return true;
}
