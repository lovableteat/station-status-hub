
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, Users, CheckCircle, AlertTriangle } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";

export function StationOverview() {
  const { stations, systems, progress, testItems, stationStatuses } = useUnifiedData();

  // Calculate metrics based on actual station data from test_flow_stations
  const totalStations = stations.length; // Use actual stations count
  const activeStations = stationStatuses.filter(s => s.status === 'working').length;
  const completedStations = stationStatuses.filter(s => s.status === 'complete').length;
  const idleStations = stationStatuses.filter(s => s.status === 'idle').length;

  // Calculate estimated completion days based on test items and systems
  const totalTestItems = testItems.length;
  const averageItemsPerStation = totalStations > 0 ? totalTestItems / totalStations : 0;
  const estimatedHoursPerStation = stations.reduce((sum, station) => 
    sum + (station.estimated_hours || 0), 0) / (totalStations || 1);
  const estimatedDaysToComplete = Math.ceil(estimatedHoursPerStation / 8); // Assuming 8 hours per day

  // Calculate efficiency
  const efficiency = totalStations > 0 ? Math.round((activeStations / totalStations) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          測試站點總覽
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Stations */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CheckCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStations}</p>
                <p className="text-sm text-muted-foreground">總測試站點</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              來自測試流程站點管理
            </div>
          </div>

          {/* Active Stations */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-success/10 rounded-lg">
                <Users className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{activeStations}</p>
                <p className="text-sm text-muted-foreground">運行中站點</p>
              </div>
            </div>
            <Progress value={efficiency} className="h-2" />
            <div className="text-xs text-muted-foreground">
              效率: {efficiency}%
            </div>
          </div>

          {/* Completed Stations */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{completedStations}</p>
                <p className="text-sm text-muted-foreground">已完成站點</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-xs">
                空閒: {idleStations}
              </Badge>
            </div>
          </div>

          {/* Estimated Completion */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">{estimatedDaysToComplete}</p>
                <p className="text-sm text-muted-foreground">預計完成天數</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              基於 {Math.round(estimatedHoursPerStation)}h/站點
            </div>
          </div>
        </div>

        {/* Station Status Details */}
        <div className="mt-6 pt-6 border-t">
          <h4 className="font-semibold mb-4">站點狀態詳情</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stationStatuses.slice(0, 6).map(station => (
              <div key={station.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{station.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {station.current_systems.length} 系統運行中
                  </p>
                </div>
                <Badge 
                  variant={
                    station.status === 'working' ? 'default' :
                    station.status === 'complete' ? 'secondary' :
                    station.status === 'warning' ? 'destructive' : 'outline'
                  }
                  className="text-xs"
                >
                  {station.status === 'working' ? '運行中' :
                   station.status === 'complete' ? '完成' :
                   station.status === 'warning' ? '警告' :
                   station.status === 'error' ? '錯誤' : '空閒'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
