
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Clock, Users, Calendar, Target } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function StationOverview() {
  const { systems, stations, testItems, progress } = useUnifiedData();
  const [dailyTarget, setDailyTarget] = useState(5);

  // Load daily target from production_targets
  useEffect(() => {
    const loadDailyTarget = async () => {
      try {
        const { data } = await supabase
          .from('production_targets')
          .select('daily_target')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (data) {
          setDailyTarget(data.daily_target);
        }
      } catch (error) {
        console.error('Error loading daily target:', error);
      }
    };

    loadDailyTarget();
  }, []);

  // Calculate metrics based on actual data
  const totalSystems = systems.length;
  
  // Calculate single machine test time (sum of all station estimated times)
  const totalEstimatedMinutes = testItems.reduce((sum, item) => sum + (item.estimated_minutes || 30), 0);
  const singleMachineTestHours = Number((totalEstimatedMinutes / 60).toFixed(1));
  
  // Calculate actual completion status
  const completedSystems = systems.filter(s => s.status === 'Done').length;
  const ongoingSystems = systems.filter(s => s.status === 'On-going').length;
  
  // Generate station names description dynamically
  const stationNames = stations.map(s => s.station_name).join('、');
  
  const metrics = [
    {
      title: "系統總數",
      value: totalSystems,
      icon: <Target className="h-5 w-5" />,
      description: `${completedSystems}個已完成，${ongoingSystems}個進行中`,
      color: "text-primary"
    },
    {
      title: "單機總測試時間",
      value: `${singleMachineTestHours}小時`,
      icon: <Clock className="h-5 w-5" />,
      description: `涵蓋${testItems.length}個測試項目`,
      color: "text-warning"
    },
    {
      title: "每日目標",
      value: `${dailyTarget}台`,
      icon: <Calendar className="h-5 w-5" />,
      description: `今日完成${completedSystems}台系統`,
      color: "text-success"
    },
    {
      title: "測試站點",
      value: stations.length,
      icon: <Users className="h-5 w-5" />,
      description: stationNames || "並行測試",
      color: "text-info"
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
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
