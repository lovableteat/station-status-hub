import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileText, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TroubleshootingCharts } from "@/components/troubleshooting/TroubleshootingCharts";

interface AnalyticsIssue {
  id: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  category?: string;
  station_name?: string;
  created_at: string;
}

interface IssueAnalyticsPanelProps {
  issues: AnalyticsIssue[];
}

export function IssueAnalyticsPanel({ issues }: IssueAnalyticsPanelProps) {
  const stats = useMemo(() => {
    const open = issues.filter(issue => issue.status === "open").length;
    const inProgress = issues.filter(issue => issue.status === "in_progress").length;
    const resolved = issues.filter(issue => issue.status === "resolved" || issue.status === "closed").length;
    const critical = issues.filter(issue => issue.priority === "critical").length;
    const resolutionRate = issues.length > 0 ? Math.round((resolved / issues.length) * 100) : 0;

    return { open, inProgress, resolved, critical, resolutionRate };
  }, [issues]);

  const insights = useMemo(() => {
    const summarize = (values: Array<string | undefined>, fallback: string) => {
      const counts = values.reduce<Record<string, number>>((acc, value) => {
        const key = value?.trim() || fallback;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const [topLabel = fallback, topCount = 0] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
      return {
        label: topLabel,
        count: topCount,
      };
    };

    const pendingCount = issues.filter(issue => issue.status === "open" || issue.status === "in_progress").length;
    const pendingRate = issues.length > 0 ? Math.round((pendingCount / issues.length) * 100) : 0;

    return {
      topCategory: summarize(issues.map(issue => issue.category), "未分類"),
      topStation: summarize(issues.map(issue => issue.station_name), "未指定站點"),
      pendingCount,
      pendingRate,
    };
  }, [issues]);

  const summaryCards = [
    {
      label: "問題總數",
      value: issues.length,
      detail: "目前累積記錄",
      icon: FileText,
      className: "border-primary/35 bg-primary/[0.06] text-primary"
    },
    {
      label: "待處理",
      value: stats.open,
      detail: "需要安排處理",
      icon: AlertTriangle,
      className: "border-rose-300/35 bg-rose-400/[0.06] text-rose-200"
    },
    {
      label: "處理中",
      value: stats.inProgress,
      detail: "正在調查改善",
      icon: Clock3,
      className: "border-amber-300/35 bg-amber-400/[0.06] text-amber-200"
    },
    {
      label: "緊急問題",
      value: stats.critical,
      detail: "需優先關注",
      icon: ShieldAlert,
      className: "border-violet-300/35 bg-violet-400/[0.06] text-violet-200"
    },
    {
      label: "解決率",
      value: `${stats.resolutionRate}%`,
      detail: `${stats.resolved} 件已結案`,
      icon: CheckCircle2,
      className: "border-blue-300/35 bg-blue-400/[0.06] text-blue-200"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map(card => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={card.className}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground/80">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/25 bg-current/10">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/70 bg-[linear-gradient(135deg,hsl(var(--card)/0.94),hsl(var(--primary)/0.08)_55%,hsl(var(--card)/0.92))]">
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">已整合 Troubleshooting 統計</p>
            <h3 className="text-xl font-semibold text-foreground">先看重點，再看排行，不用自己猜圖表</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              目前這頁會先把最重要的結論整理出來，下面的排行卡則會直接顯示件數與占比，方便你整理給工廠端。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/25 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">最多問題分類</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.topCategory.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{insights.topCategory.count} 件問題</p>
            </div>
            <div className="rounded-2xl border border-primary/25 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">最常發生站點</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.topStation.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{insights.topStation.count} 件問題</p>
            </div>
            <div className="rounded-2xl border border-primary/25 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">待追蹤比例</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{insights.pendingRate}%</p>
              <p className="mt-1 text-sm text-muted-foreground">{insights.pendingCount} 件仍在追蹤</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <TroubleshootingCharts records={issues} />
    </div>
  );
}
