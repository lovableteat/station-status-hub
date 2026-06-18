import { useMemo, type ComponentType } from "react";
import { BarChart3, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TroubleshootingRecord {
  id: string;
  issue_type?: string;
  issue_category?: string;
  severity?: string;
  priority?: string;
  category?: string;
  station_name?: string;
  status: string;
  occurred_at?: string;
  created_at?: string;
  time_to_resolve_hours?: number | null;
}

interface Props {
  records: TroubleshootingRecord[];
}

interface RankedItem {
  label: string;
  count: number;
  percent: number;
  badgeClass: string;
  barClass: string;
}

interface BreakdownItem {
  label: string;
  count: number;
  percent: number;
  hint: string;
  dotClass: string;
  barClass: string;
}

const RANK_TONES = [
  {
    badgeClass: "border-sky-300/35 bg-sky-300/[0.16] text-sky-100",
    barClass: "bg-sky-300/90",
  },
  {
    badgeClass: "border-indigo-300/35 bg-indigo-300/[0.16] text-indigo-100",
    barClass: "bg-indigo-300/90",
  },
  {
    badgeClass: "border-violet-300/35 bg-violet-300/[0.16] text-violet-100",
    barClass: "bg-violet-300/90",
  },
  {
    badgeClass: "border-cyan-300/35 bg-cyan-300/[0.16] text-cyan-100",
    barClass: "bg-cyan-300/90",
  },
  {
    badgeClass: "border-amber-300/35 bg-amber-300/[0.16] text-amber-100",
    barClass: "bg-amber-300/90",
  },
  {
    badgeClass: "border-emerald-300/35 bg-emerald-300/[0.16] text-emerald-100",
    barClass: "bg-emerald-300/90",
  },
];

const toPercent = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

const buildRankedItems = (
  labels: Array<string | undefined>,
  fallback: string,
  total: number
): RankedItem[] => {
  const counts = labels.reduce<Record<string, number>>((acc, label) => {
    const key = label?.trim() || fallback;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count], index) => ({
      label,
      count,
      percent: toPercent(count, total),
      badgeClass: RANK_TONES[index % RANK_TONES.length].badgeClass,
      barClass: RANK_TONES[index % RANK_TONES.length].barClass,
    }));
};

function RankedBarCard({
  title,
  description,
  icon: Icon,
  items,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  items: RankedItem[];
}) {
  return (
    <Card className="border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.96),hsl(var(--secondary)/0.34))]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-background/30 px-4 py-3 text-xs text-muted-foreground">
          長條越長代表件數越多，右側數字同時顯示件數與占比。
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${title}-${item.label}`} className="rounded-2xl border border-border/60 bg-background/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("shrink-0 text-xs", item.badgeClass)}>
                      #{index + 1}
                    </Badge>
                    <p className="truncate text-sm font-medium text-foreground" title={item.label}>
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.count} 件，占全部 {item.percent}%
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold text-foreground">{item.count}</p>
                  <p className="text-xs text-muted-foreground">{item.percent}%</p>
                </div>
              </div>

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary/70">
                <div
                  className={cn("h-full rounded-full", item.barClass)}
                  style={{
                    width: `${item.percent}%`,
                    minWidth: item.count > 0 ? "14px" : "0px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: BreakdownItem[];
}) {
  return (
    <Card className="border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.96),hsl(var(--secondary)/0.24))]">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="rounded-2xl border border-border/60 bg-background/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", item.dotClass)} />
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold text-foreground">{item.count} 件</p>
                <p className="text-xs text-muted-foreground">{item.percent}%</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{item.hint}</span>
              <span>占全部 {item.percent}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary/70">
              <div
                className={cn("h-full rounded-full", item.barClass)}
                style={{
                  width: `${item.percent}%`,
                  minWidth: item.count > 0 ? "14px" : "0px",
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TroubleshootingCharts({ records }: Props) {
  const total = records.length;

  const typeData = useMemo(
    () => buildRankedItems(records.map((r) => r.issue_type || r.category), "未分類", total),
    [records, total]
  );

  const stationData = useMemo(
    () => buildRankedItems(records.map((r) => r.station_name), "未指定站點", total),
    [records, total]
  );

  const statusData = useMemo<BreakdownItem[]>(() => {
    const pending = records.filter((r) => r.status === "open").length;
    const processing = records.filter((r) => r.status === "investigating" || r.status === "in_progress").length;
    const resolved = records.filter((r) => r.status === "resolved" || r.status === "closed").length;

    return [
      {
        label: "待處理",
        count: pending,
        percent: toPercent(pending, total),
        hint: "尚未安排或尚未開始處理",
        dotClass: "bg-rose-300",
        barClass: "bg-rose-300/90",
      },
      {
        label: "處理中",
        count: processing,
        percent: toPercent(processing, total),
        hint: "工程師正在追查、驗證或改善",
        dotClass: "bg-amber-300",
        barClass: "bg-amber-300/90",
      },
      {
        label: "已結案",
        count: resolved,
        percent: toPercent(resolved, total),
        hint: "已解決或已完成關閉",
        dotClass: "bg-emerald-300",
        barClass: "bg-emerald-300/90",
      },
    ];
  }, [records, total]);

  const priorityData = useMemo<BreakdownItem[]>(() => {
    const priorityOrder = [
      {
        key: "critical",
        label: "緊急",
        hint: "需優先處理、立即追蹤",
        dotClass: "bg-fuchsia-300",
        barClass: "bg-fuchsia-300/90",
      },
      {
        key: "high",
        label: "高",
        hint: "影響明顯，應優先排程",
        dotClass: "bg-sky-300",
        barClass: "bg-sky-300/90",
      },
      {
        key: "medium",
        label: "中",
        hint: "可安排在正常改善節奏",
        dotClass: "bg-indigo-300",
        barClass: "bg-indigo-300/90",
      },
      {
        key: "low",
        label: "低",
        hint: "影響較小，可併案處理",
        dotClass: "bg-teal-300",
        barClass: "bg-teal-300/90",
      },
    ];

    return priorityOrder.map((item) => {
      const count = records.filter((record) => (record.priority || record.severity || "medium") === item.key).length;
      return {
        label: item.label,
        count,
        percent: toPercent(count, total),
        hint: item.hint,
        dotClass: item.dotClass,
        barClass: item.barClass,
      };
    });
  }, [records, total]);

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          尚無問題記錄，請先新增第一筆問題
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-[linear-gradient(135deg,hsl(var(--card)/0.96),hsl(var(--primary)/0.08)_60%,hsl(var(--card)/0.94))]">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary">統計讀法</p>
            <h3 className="text-xl font-semibold text-foreground">先看高頻問題，再看集中站點，最後看處理進度</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              這份統計已經改成報表式呈現，每張卡都會直接顯示件數與占比，不需要再自己猜圖表代表什麼。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/20 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">最多問題類型</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{typeData[0]?.label || "未分類"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{typeData[0]?.count || 0} 件</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">最常發生站點</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{stationData[0]?.label || "未指定站點"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stationData[0]?.count || 0} 件</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-background/40 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">待追蹤案件</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{statusData[0].count + statusData[1].count} 件</p>
              <p className="mt-1 text-sm text-muted-foreground">
                占全部 {toPercent(statusData[0].count + statusData[1].count, total)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <RankedBarCard
          title="問題類型排行"
          description="直接看哪一類問題最常重複發生"
          icon={BarChart3}
          items={typeData}
        />
        <RankedBarCard
          title="問題站點排行"
          description="直接看問題最集中出現在哪些站別"
          icon={MapPin}
          items={stationData}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownCard
          title="處理狀態一覽"
          description="看目前還有多少案件待追蹤、多少已經結案"
          items={statusData}
        />
        <BreakdownCard
          title="優先級一覽"
          description="看工廠現在最需要先處理哪一層級的問題"
          items={priorityData}
        />
      </div>
    </div>
  );
}
