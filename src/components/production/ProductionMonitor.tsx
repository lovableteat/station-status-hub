
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Clock, CheckCircle, AlertTriangle, Zap, Target } from "lucide-react";

export function ProductionMonitor() {
  const { systems, stations, testItems, progress } = useUnifiedData();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter stations 0-4 for production monitoring
  const productionStations = stations.filter(s => s.station_order >= 0 && s.station_order <= 4)
    .sort((a, b) => a.station_order - b.station_order);

  // Calculate production metrics from test progress data
  const totalSystems = systems.length;
  const completedSystems = systems.filter(s => s.status === 'Done').length;
  const ongoingSystems = systems.filter(s => s.status === 'On-going').length;
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;

  // Calculate station efficiency from test progress
  const getStationEfficiency = (stationId: string) => {
    const stationItems = testItems.filter(item => item.station_id === stationId);
    if (stationItems.length === 0) return 0;

    let totalProgress = 0;
    let systemsWithProgress = 0;

    systems.forEach(system => {
      const systemProgress = stationItems.map(item => {
        const progressRecord = progress.find(p => 
          p.system_id === system.id && 
          p.station_id === stationId && 
          p.item_id === item.id
        );
        return progressRecord?.status === 'Done' ? 100 : (progressRecord?.progress_percent ?? 0);
      });

      if (systemProgress.length > 0) {
        const avgProgress = systemProgress.reduce((sum, p) => sum + p, 0) / systemProgress.length;
        totalProgress += avgProgress;
        systemsWithProgress++;
      }
    });

    return systemsWithProgress > 0 ? Math.round(totalProgress / systemsWithProgress) : 0;
  };

  // Calculate daily production target achievement
  const todayCompletedSystems = systems.filter(s => {
    if (s.status !== 'Done' || !s.actual_completed_at) return false;
    const completedDate = new Date(s.actual_completed_at);
    const today = new Date();
    return completedDate.toDateString() === today.toDateString();
  }).length;

  const dailyTarget = 10; // This could come from production_targets table
  const targetAchievement = Math.round((todayCompletedSystems / dailyTarget) * 100);

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">GB300 L10 生產監控牆</h1>
        <p className="text-xl text-gray-600">即時生產狀態 - {currentTime.toLocaleString('zh-TW')}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-r from-green-400 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">完成系統</p>
                <p className="text-3xl font-bold">{completedSystems}</p>
                <p className="text-green-100 text-xs">總計 {totalSystems} 台</p>
              </div>
              <CheckCircle className="h-12 w-12 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-100 text-sm font-medium">進行中</p>
                <p className="text-3xl font-bold">{ongoingSystems}</p>
                <p className="text-yellow-100 text-xs">執行率 {completionRate}%</p>
              </div>
              <Zap className="h-12 w-12 text-yellow-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-blue-400 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">今日完成</p>
                <p className="text-3xl font-bold">{todayCompletedSystems}</p>
                <p className="text-blue-100 text-xs">目標 {dailyTarget} 台</p>
              </div>
              <Target className="h-12 w-12 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-400 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">目標達成率</p>
                <p className="text-3xl font-bold">{targetAchievement}%</p>
                <p className="text-purple-100 text-xs">今日進度</p>
              </div>
              <AlertTriangle className="h-12 w-12 text-purple-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Station Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {productionStations.map((station) => {
          const efficiency = getStationEfficiency(station.id);
          const systemsAtStation = systems.filter(s => 
            s.current_station === station.station_name || 
            s.current_station?.includes(station.station_name)
          );

          return (
            <Card key={station.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-center">
                  {station.station_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Station Efficiency */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>站點效率</span>
                    <span className="font-semibold">{efficiency}%</span>
                  </div>
                  <Progress value={efficiency} className="h-3" />
                </div>

                {/* Systems at Station */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">
                    當前系統 ({systemsAtStation.length})
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {systemsAtStation.slice(0, 3).map((system) => (
                      <Badge 
                        key={system.id}
                        variant="secondary" 
                        className="w-full justify-start text-xs py-1"
                      >
                        {system.system_name}
                      </Badge>
                    ))}
                    {systemsAtStation.length > 3 && (
                      <p className="text-xs text-gray-500 text-center">
                        +{systemsAtStation.length - 3} 更多...
                      </p>
                    )}
                    {systemsAtStation.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">
                        目前無系統
                      </p>
                    )}
                  </div>
                </div>

                {/* Station Status Indicator */}
                <div className="flex justify-center">
                  <div className={`w-4 h-4 rounded-full ${
                    efficiency >= 80 ? 'bg-green-500' :
                    efficiency >= 60 ? 'bg-yellow-500' :
                    efficiency >= 30 ? 'bg-orange-500' : 'bg-red-500'
                  }`} title={`效率: ${efficiency}%`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Completions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            最近完成系統
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {systems
              .filter(s => s.status === 'Done' && s.actual_completed_at)
              .sort((a, b) => new Date(b.actual_completed_at!).getTime() - new Date(a.actual_completed_at!).getTime())
              .slice(0, 5)
              .map((system) => (
                <div key={system.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">{system.system_name}</p>
                      <p className="text-sm text-gray-500">
                        工程師: {system.assigned_engineer || '未指派'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {new Date(system.actual_completed_at!).toLocaleString('zh-TW')}
                    </p>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      已完成
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
