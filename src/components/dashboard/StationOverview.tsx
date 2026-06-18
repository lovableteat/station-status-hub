
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
      cardClass: "border-primary/35 bg-primary/[0.06]"
    },
    {
      title: "單機總測試時間",
      value: `${singleMachineTestHours}小時`,
      icon: <Clock className="h-5 w-5" />,
      description: `涵蓋${testItems.length}個測試項目`,
      color: "text-amber-200",
      cardClass: "border-amber-300/30 bg-amber-400/[0.06]"
    },
    {
      title: "每日目標",
      value: `${dailyTarget}台`,
      icon: <Calendar className="h-5 w-5" />,
      description: `生產目標設定`,
      color: "text-violet-200",
      cardClass: "border-violet-300/30 bg-violet-400/[0.06]"
    },
    {
      title: "測試站點",
      value: stations.length,
      icon: <Users className="h-5 w-5" />,
      description: stationNames || "並行測試",
      color: "text-rose-200",
      cardClass: "border-rose-300/30 bg-rose-400/[0.06]"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <Card key={index} className={`${metric.cardClass} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium sm:text-sm">
              {metric.title}
            </CardTitle>
            <div className={metric.color}>
              {metric.icon}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metric.color}`}>
              {metric.value}
            </div>
            <p className="text-xs text-muted-foreground">
              {metric.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
