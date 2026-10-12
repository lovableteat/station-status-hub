import type { ReviewReply, TrackRow } from "./types";

export const comparisonTabs = ["compare", "review", "power", "i2c", "library"] as const;
export type ComparisonTab = typeof comparisonTabs[number];
export interface ComparisonFilters {
  tab: ComparisonTab;
  query: string;
  status: string;
  owner: string;
  severity: string;
  category: string;
  page: string;
}
const statuses = ["all", "unfilled", "filled", "NEW", "EXISTING", "CHANGE"];
const severities = ["all", "ERROR", "WARN", "INFO"];
export const filterKeys = { query: "compareSearch", status: "compareStatus", owner: "compareOwner", severity: "compareSeverity", category: "compareCategory", page: "comparePage" } as const;

export function readComparisonFilters(search: string): ComparisonFilters {
  const params = new URLSearchParams(search);
  const tab = params.get("comparisonTab") ?? "compare";
  const status = params.get("compareStatus") ?? "all";
  const severity = params.get("compareSeverity") ?? "all";
  return {
    tab: comparisonTabs.includes(tab as ComparisonTab) ? tab as ComparisonTab : "compare",
    query: params.get("compareSearch") ?? "",
    status: statuses.includes(status) ? status : "all",
    owner: params.get("compareOwner") || "all",
    severity: severities.includes(severity) ? severity : "all",
    category: params.get("compareCategory") || "all",
    page: params.get("comparePage") || "all",
  };
}

export function filterTrackingRows(rows: TrackRow[], replies: Record<string, ReviewReply>, filters: ComparisonFilters): TrackRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter(row => {
    const reply = replies[row.key];
    const filled = Boolean(reply?.disp);
    if (filters.status === "filled" && !filled) return false;
    if (filters.status === "unfilled" && filled) return false;
    if (["NEW", "EXISTING", "CHANGE"].includes(filters.status) && row.status !== filters.status) return false;
    if (filters.owner === "unassigned" && reply?.owner) return false;
    if (!["all", "unassigned"].includes(filters.owner) && reply?.owner !== filters.owner) return false;
    if (filters.severity !== "all" && row.severity !== filters.severity) return false;
    if (filters.category !== "all" && row.category !== filters.category) return false;
    if (filters.page !== "all" && String(row.page ?? "unknown") !== filters.page) return false;
    return !query || [row.key, row.rule, row.title, row.detail, row.page_title, ...row.refdes, ...row.nets, ...row.pins, reply?.disp, reply?.owner, reply?.note].join(" ").toLocaleLowerCase().includes(query);
  });
}
