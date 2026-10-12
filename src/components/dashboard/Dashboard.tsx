import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListChecks, RefreshCw, UserRound } from "lucide-react";

import { MaintenanceLoading } from "@/components/maintenance/MaintenanceLoading";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAllPages } from "@/hooks/fetchAllPages";
import { supabase } from "@/integrations/supabase/client";
import { getEffectivePriority } from "@/lib/issuePriority";
import { cn } from "@/lib/utils";

import { calculateIssueDashboardMetrics, type DashboardIssue, getIssueIdleDays } from "./issueDashboardMetrics";

interface DashboardProps {
  onNavigate?: (module: string, params?: Record<string, string>) => void;
}

const priorityLabels = { critical: "緊急", high: "高", medium: "中", low: "低" };
const priorityTones = {
  critical: "border-destructive/40 bg-destructive/10 text-red-200",
  high: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  medium: "border-border bg-muted/40 text-foreground",
  low: "border-border bg-muted/20 text-muted-foreground",
};

export function Dashboard({ onNavigate }: DashboardProps) {
  const { activeProject, activeProjectId } = useTestProject();
  const [snapshot, setSnapshot] = useState<{ projectId: string | null; issues: DashboardIssue[] }>({ projectId: null, issues: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let request = 0;
    setLoading(true);
    setLoadError("");
    if (!activeProjectId) {
      setSnapshot({ projectId: null, issues: [] });
      setLoading(false);
      return;
    }
    const loadIssues = async () => {
      const currentRequest = ++request;
      try {
        const { data, error } = await fetchAllPages((from, to) => supabase
          .from("issues")
          .select("id, title, priority, priority_manual, status, assigned_to, created_at, updated_at, test_systems!issues_system_id_fkey(system_name), test_flow_stations!issues_station_id_fkey(station_name)")
          .eq("project_id", activeProjectId)
          .order("id")
          .range(from, to));
        if (cancelled || currentRequest !== request) return;
        if (error) throw error;
        setSnapshot({ projectId: activeProjectId, issues: data.map(issue => ({
          ...issue,
          priority: getEffectivePriority(issue.priority, issue.priority_manual, issue.created_at),
          status: issue.status || "open",
          system_name: issue.test_systems?.system_name,
          station_name: issue.test_flow_stations?.station_name,
        })) });
        setLoadError("");
      } catch (error) {
        if (!cancelled && currentRequest === request) setLoadError(error instanceof Error ? error.message : (error as { message?: string })?.message || "請稍後重試");
      } finally {
        if (!cancelled && currentRequest === request) setLoading(false);
      }
    };
    void loadIssues();
    const channel = supabase.channel(`dashboard-issues:${activeProjectId}`).on("postgres_changes", {
      event: "*", filter: `project_id=eq.${activeProjectId}`, schema: "workspace", table: "issues",
    }, () => void loadIssues()).subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [activeProjectId, reload]);

  const issues = useMemo(() => snapshot.projectId === activeProjectId ? snapshot.issues : [], [snapshot, activeProjectId]);
  const { counts, pendingIssues, priorityCounts, ownerRows } = useMemo(() => calculateIssueDashboardMetrics(issues), [issues]);
  const openIssues = (params: Record<string, string> = {}) => onNavigate?.("issues", params);

  if (loading || snapshot.projectId !== activeProjectId && !loadError) return <MaintenanceLoading label="正在載入問題儀表板" />;

  return (
    <div className="maintenance-page space-y-4" data-dashboard-content data-testid="issue-dashboard">
      <MaintenancePageHeader
        icon={ListChecks}
        title="問題儀表板"
        description={activeProject?.name || "目前專案"}
        actions={<Button size="sm" className="h-11 sm:h-9" onClick={() => openIssues()}>查看全部問題<ArrowRight className="ml-2 h-4 w-4" /></Button>}
      />

      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div><p className="text-sm font-medium text-red-200">問題載入失敗</p><p className="mt-1 break-words text-sm text-muted-foreground">{loadError}</p></div>
          <Button variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />重新載入</Button>
        </div>
      ) : (
        <>
          <div data-mobile-dashboard-kpis="true" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              { label: "未結問題", value: counts.pending, icon: ListChecks, detail: `${counts.open} 件待處理 · ${counts.inProgress} 件處理中`, params: { issueStatus: "pending" }, tone: "text-primary" },
              { label: "緊急未結問題", value: counts.critical, icon: AlertTriangle, detail: "依問題列表相同嚴重度規則", params: { issueStatus: "pending", issuePriority: "critical" }, tone: counts.critical ? "text-red-200" : "text-muted-foreground" },
              { label: "尚未指派", value: counts.unassigned, icon: UserRound, detail: "未結問題尚無負責人", params: { issueStatus: "pending", issueOwner: "unassigned" }, tone: counts.unassigned ? "text-amber-200" : "text-muted-foreground" },
              { label: "七日未更新", value: counts.stale, icon: Clock3, detail: "距最近更新已滿七天", params: { issueStatus: "pending", issueFollowUp: "stale" }, tone: counts.stale ? "text-amber-200" : "text-muted-foreground" },
            ].map(metric => <button
              key={metric.label}
              type="button"
              onClick={() => openIssues(metric.params)}
              className="min-w-0 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
              aria-label={`${metric.label} ${metric.value} 件，查看問題`}
            >
              <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{metric.label}<metric.icon className={cn("h-4 w-4 shrink-0", metric.tone)} aria-hidden="true" /></span>
              <span className="font-data mt-2 block text-2xl font-semibold tabular-nums text-foreground">{metric.value}<span className="ml-1.5 text-xs font-normal text-muted-foreground">件</span></span>
              <span className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">{metric.detail}</span>
            </button>)}
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="issue-follow-up-heading">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div><h2 id="issue-follow-up-heading" className="text-base font-semibold">優先追蹤問題</h2><p className="mt-1 text-xs text-muted-foreground">依嚴重度與未更新天數排序，顯示前 8 件未結問題</p></div>
              <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => openIssues({ issueStatus: "pending" })}>全部未結問題<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>問題／機台</TableHead><TableHead>嚴重度</TableHead><TableHead>狀態</TableHead><TableHead>負責人</TableHead><TableHead className="text-right">未更新</TableHead></TableRow></TableHeader>
              <TableBody>
                {pendingIssues.slice(0, 8).map(issue => {
                  const priority = issue.priority as keyof typeof priorityLabels;
                  const days = getIssueIdleDays(issue);
                  return <TableRow key={issue.id}>
                    <TableCell className="min-w-[180px] max-w-[440px]"><button type="button" onClick={() => openIssues({ openIssue: issue.id })} className="min-h-11 w-full text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block line-clamp-2 break-words">{issue.title || "未命名問題"}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{[issue.system_name, issue.station_name].filter(Boolean).join(" · ") || "未關聯機台"}</span></button></TableCell>
                    <TableCell><Badge variant="outline" className={cn("whitespace-nowrap rounded-md", priorityTones[priority])}>{priorityLabels[priority]}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{issue.status === "in_progress" ? "處理中" : "待處理"}</TableCell>
                    <TableCell className="max-w-[150px] break-words text-sm">{issue.assigned_to?.trim() || "未指派"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right text-sm tabular-nums", days !== null && days >= 7 ? "text-amber-200" : "text-muted-foreground")}>{days === null ? "時間未提供" : `${days} 天`}</TableCell>
                  </TableRow>;
                })}
                {!pendingIssues.length && <TableRow><TableCell colSpan={5} className="py-12 text-center"><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-primary" /><p className="text-sm font-medium">目前沒有未結問題</p><p className="mt-1 text-xs text-muted-foreground">{issues.length ? `${counts.resolved} 件問題已解決或關閉` : "此專案尚未建立問題"}</p></TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="issue-priority-heading">
              <h2 id="issue-priority-heading" className="text-sm font-semibold">未結問題嚴重度</h2>
              <div className="mt-3 divide-y divide-border">{Object.entries(priorityCounts).map(([priority, count]) => <button key={priority} type="button" onClick={() => openIssues({ issueStatus: "pending", issuePriority: priority })} className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="w-12 text-sm">{priorityLabels[priority as keyof typeof priorityLabels]}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className={cn("block h-full", priority === "critical" ? "bg-destructive" : priority === "high" ? "bg-amber-400" : "bg-primary/65")} style={{ width: `${counts.pending ? count / counts.pending * 100 : 0}%` }} /></span><span className="w-10 text-right text-sm tabular-nums">{count} 件</span></button>)}</div>
            </section>
            <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="issue-owner-heading">
              <h2 id="issue-owner-heading" className="text-sm font-semibold">負責人待辦</h2>
              <div className="mt-3 divide-y divide-border">{ownerRows.slice(0, 5).map(row => <button key={row.owner} type="button" onClick={() => openIssues({ issueStatus: "pending", issueOwner: row.owner || "unassigned" })} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="min-w-0 truncate text-sm">{row.owner || "未指派"}</span><span className="shrink-0 text-sm tabular-nums">{row.critical > 0 && <span className="mr-3 text-xs text-red-200">{row.critical} 緊急</span>}{row.count} 件</span></button>)}{!ownerRows.length && <p className="py-4 text-sm text-muted-foreground">目前沒有待辦問題</p>}</div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
