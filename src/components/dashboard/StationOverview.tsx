import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Clock, Users, Calendar, Target } from "lucide-react";

export function StationOverview() {
  const { systems, stations, testItems, progress } = useUnifiedData();

  // Calculate metrics based on actual data
  const totalSystems = systems.length;
  
  // Calculate single machine test time (sum of all station estimated times)
  const totalEstimatedMinutes = testItems.reduce((sum, item) => sum + (item.estimated_minutes || 30), 0);
  const singleMachineTestHours = Number((totalEstimatedMinutes / 60).toFixed(1));
  
  // Calculate estimated completion days (assuming parallel testing)
  const activeStations = stations.filter(s => s.station_order >= 0 && s.station_order <= 3).length;
  const estimatedDaysPerSystem = Math.ceil(singleMachineTestHours / (8 * activeStations)); // 8 hours per day
  const totalEstimatedDays = Math.ceil((totalSystems * estimatedDaysPerSystem) / activeStations);
  
  // Calculate actual completion status
  const completedSystems = systems.filter(s => s.status === 'Done').length;
  const ongoingSystems = systems.filter(s => s.status === 'On-going').length;
  
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
      title: "預計完成天數",
      value: `${totalEstimatedDays}天`,
      icon: <Calendar className="h-5 w-5" />,
      description: `基於${activeStations}個並行測試站點`,
      color: "text-success"
    },
    {
      title: "測試站點",
      value: activeStations,
      icon: <Users className="h-5 w-5" />,
      description: "Station 0-3 並行測試",
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