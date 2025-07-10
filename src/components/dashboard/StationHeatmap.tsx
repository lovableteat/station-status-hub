
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface StationProgress {
  stationName: string;
  stationOrder: number;
  systemCounts: {
    [key: string]: number;
  };
  totalSystems: number;
}

export function StationHeatmap() {
  const [stationProgress, setStationProgress] = useState<StationProgress[]>([]);
  const [systems, setSystems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // 載入站點、系統和進度數據
      const [stationsRes, systemsRes, progressRes, itemsRes] = await Promise.all([
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_systems').select('*'),
        supabase.from('test_progress').select('*'),
        supabase.from('test_flow_items').select('*')
      ]);

      if (stationsRes.error || systemsRes.error || progressRes.error || itemsRes.error) {
        console.error('Error loading data:', { stationsRes, systemsRes, progressRes, itemsRes });
        return;
      }

      const stations = stationsRes.data || [];
      const systemsData = systemsRes.data || [];
      const progress = progressRes.data || [];
      const items = itemsRes.data || [];

      setSystems(systemsData);

      // 為每個站點計算系統狀態統計
      const stationProgressData = stations.map(station => {
        const stationItems = items.filter(item => item.station_id === station.id);
        const systemCounts = {
          'Not Start': 0,
          'On-going': 0,
          'Done': 0
        };

        systemsData.forEach(system => {
          if (stationItems.length === 0) {
            systemCounts['Not Start']++;
            return;
          }

          const systemProgress = progress.filter(p => 
            p.system_id === system.id && p.station_id === station.id
          );

          const completedItems = systemProgress.filter(p => p.status === 'Done').length;
          const ongoingItems = systemProgress.filter(p => 
            p.status === 'On-going' || p.status === 'In Progress'
          ).length;

          if (completedItems === stationItems.length) {
            systemCounts['Done']++;
          } else if (completedItems > 0 || ongoingItems > 0) {
            systemCounts['On-going']++;
          } else {
            systemCounts['Not Start']++;
          }
        });

        return {
          stationName: station.station_name,
          stationOrder: station.station_order,
          systemCounts,
          totalSystems: systemsData.length
        };
      });

      setStationProgress(stationProgressData);
    } catch (error) {
      console.error('Error loading station heatmap data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getIntensityColor = (count: number, total: number, status: string) => {
    if (total === 0) return 'bg-gray-100';
    
    const ratio = count / total;
    
    switch (status) {
      case 'Done':
        if (ratio >= 0.8) return 'bg-green-500';
        if (ratio >= 0.6) return 'bg-green-400';
        if (ratio >= 0.4) return 'bg-green-300';
        if (ratio >= 0.2) return 'bg-green-200';
        return 'bg-green-100';
      case 'On-going':
        if (ratio >= 0.8) return 'bg-yellow-500';
        if (ratio >= 0.6) return 'bg-yellow-400';
        if (ratio >= 0.4) return 'bg-yellow-300';
        if (ratio >= 0.2) return 'bg-yellow-200';
        return 'bg-yellow-100';
      case 'Not Start':
        if (ratio >= 0.8) return 'bg-red-500';
        if (ratio >= 0.6) return 'bg-red-400';
        if (ratio >= 0.4) return 'bg-red-300';
        if (ratio >= 0.2) return 'bg-red-200';
        return 'bg-red-100';
      default:
        return 'bg-gray-100';
    }
  };

  const getTextColor = (count: number, total: number) => {
    if (total === 0) return 'text-gray-600';
    const ratio = count / total;
    return ratio >= 0.6 ? 'text-white' : 'text-gray-800';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            測試站點進度熱區圖
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">載入中...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          測試站點進度熱區圖
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 熱區圖 */}
          <div className="space-y-4">
            {['Done', 'On-going', 'Not Start'].map(status => (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={status === 'Done' ? 'default' : status === 'On-going' ? 'secondary' : 'destructive'}>
                    {status === 'Done' ? '完成' : status === 'On-going' ? '進行中' : '未開始'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ({systems.length} 個系統)
                  </span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stationProgress.length}, 1fr)` }}>
                  {stationProgress.map((station) => (
                    <div
                      key={`${station.stationName}-${status}`}
                      className={`
                        p-3 rounded-lg text-center font-medium text-sm transition-all duration-200 hover:scale-105 cursor-pointer
                        ${getIntensityColor(station.systemCounts[status], station.totalSystems, status)}
                        ${getTextColor(station.systemCounts[status], station.totalSystems)}
                      `}
                      title={`${station.stationName} - ${status}: ${station.systemCounts[status]}/${station.totalSystems}`}
                    >
                      <div className="font-semibold text-xs mb-1">{station.stationName}</div>
                      <div className="text-lg font-bold">{station.systemCounts[status]}</div>
                      <div className="text-xs opacity-90">
                        {station.totalSystems > 0 
                          ? Math.round((station.systemCounts[status] / station.totalSystems) * 100)
                          : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 圖例 */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">圖例說明</h4>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="space-y-2">
                <div className="font-medium text-green-700">完成狀態</div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span>80-100%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-300 rounded"></div>
                  <span>40-79%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 rounded"></div>
                  <span>0-39%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-yellow-700">進行中狀態</div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>80-100%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-300 rounded"></div>
                  <span>40-79%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-100 rounded"></div>
                  <span>0-39%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-red-700">未開始狀態</div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span>80-100%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-300 rounded"></div>
                  <span>40-79%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 rounded"></div>
                  <span>0-39%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
