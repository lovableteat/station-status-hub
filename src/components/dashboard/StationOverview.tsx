
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Clock, Users, Calendar, Target } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function StationOverview() {
  const { systems, stations, testItems } = useUnifiedData();
  const [dailyTarget, setDailyTarget] = useState<number>(0);
  const visibleSystems = systems.filter(system => !system.exclude_from_dashboard);

  useEffect(() => {
    const loadDailyTarget = async () => {
      try {
        const { data, error } = await supabase
          .from('production_targets')
          .select('daily_target')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data && !error) {
          setDailyTarget(data.daily_target);
        }
      } catch (error) {
        console.error('Error loading daily target:', error);
      }
    };

    loadDailyTarget();
  }, []);

  // Calculate metrics based on actual data
  const totalSystems = visibleSystems.length;
  
  // 修正單機測試時間計算 - 改為計算所有測項的預估時間總和
  const totalEstimatedMinutes = testItems.reduce((sum, item) => {
    // 使用預設值30分鐘，如果沒有estimated_minutes的話
    const itemMinutes = item.estimated_minutes ?? 30;
    return sum + itemMinutes;
  }, 0);
  const singleMachineTestHours = Number((totalEstimatedMinutes / 60).toFixed(1));
  
  // Calculate actual completion status
  const completedSystems = visibleSystems.filter(s => s.status === 'Done').length;
  const ongoingSystems = visibleSystems.filter(s => s.status === 'On-going').length;
  
  // Generate station names description dynamically
  const stationNames = stations.map(s => s.station_name).join('、');
  
  const metrics = [
    {
      title: "系統總數",
      value: totalSystems,
      icon: <Target className="h-5 w-5" />,
      description: `${completedSystems}個已完成，${ongoingSystems}個進行中`,
      color: "text-primary",
      cardClass: "border-primary/30 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      iconWrap: "border-primary/25 bg-primary/12 text-primary",
      footerClass: "border-primary/15 bg-primary/8 text-primary/85"
    },
    {
      title: "單機總測試時間",
      value: `${singleMachineTestHours}小時`,
      icon: <Clock className="h-5 w-5" />,
      description: `涵蓋${testItems.length}個測試項目`,
      color: "text-amber-200",
      cardClass: "border-amber-300/25 bg-[radial-gradient(circle_at_top_right,hsl(43_96%_56%/0.14),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      iconWrap: "border-amber-300/20 bg-amber-400/10 text-amber-200",
      footerClass: "border-amber-300/12 bg-amber-400/[0.06] text-amber-100/90"
    },
    {
      title: "每日目標",
      value: `${dailyTarget}台`,
      icon: <Calendar className="h-5 w-5" />,
      description: `生產目標設定`,
      color: "text-violet-200",
      cardClass: "border-violet-300/25 bg-[radial-gradient(circle_at_top_right,hsl(245_58%_66%/0.16),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      iconWrap: "border-violet-300/20 bg-violet-400/10 text-violet-200",
      footerClass: "border-violet-300/12 bg-violet-400/[0.06] text-violet-100/90"
    },
    {
      title: "測試站點",
      value: stations.length,
      icon: <Users className="h-5 w-5" />,
      description: stationNames || "並行測試",
      color: "text-rose-200",
      cardClass: "border-rose-300/25 bg-[radial-gradient(circle_at_top_right,hsl(351_95%_71%/0.14),transparent_34%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))]",
      iconWrap: "border-rose-300/20 bg-rose-400/10 text-rose-200",
      footerClass: "border-rose-300/12 bg-rose-400/[0.06] text-rose-100/90"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <Card
          key={index}
          className={`${metric.cardClass} group relative overflow-hidden rounded-[28px] shadow-[0_20px_48px_-42px_hsl(var(--background)/0.95)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_62px_-44px_hsl(var(--primary)/0.55)]`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <CardHeader className="space-y-5 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/75">
                  即時指標
                </p>
                <CardTitle className="mt-3 text-base font-semibold sm:text-base">
                  {metric.title}
                </CardTitle>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)] ${metric.iconWrap}`}>
                {metric.icon}
              </div>
            </div>
            <div className={`text-4xl font-semibold tracking-tight ${metric.color}`}>
              {metric.value}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className={`rounded-2xl border px-4 py-3 ${metric.footerClass}`}>
              <p className="text-sm leading-6">
                {metric.description}
              </p>
            </div>
            <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-muted-foreground/65">
              儀表板指標
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
