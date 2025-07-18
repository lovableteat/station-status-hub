
import React from "react";
import { cn } from "@/lib/utils";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const getStatusColor = (status: string) => {
  switch (status) {
    case 'idle': return 'bg-station-idle border-station-idle text-foreground';
    case 'working': return 'bg-station-working border-station-working text-primary-foreground';
    case 'warning': return 'bg-station-warning border-station-warning text-warning-foreground';
    case 'error': return 'bg-station-error border-station-error text-danger-foreground';
    case 'complete': return 'bg-station-complete border-station-complete text-success-foreground';
    default: return 'bg-muted border-border text-muted-foreground';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'idle': return '待機中';
    case 'working': return '作業中';
    case 'warning': return '延遲';
    case 'error': return '異常';
    case 'complete': return '完成';
    default: return '未知';
  }
};

interface StationHeatmapProps {
  onStationClick?: (stationId: string) => void;
}

export function StationHeatmap({ onStationClick }: StationHeatmapProps) {
  const { systems, stations, testItems, progress } = useUnifiedData();
  
  // 獲取站點時間記錄數據
  const [stationTimeRecords, setStationTimeRecords] = React.useState<any[]>([]);
  
  React.useEffect(() => {
    const fetchStationTimeRecords = async () => {
      const { data } = await supabase
        .from('station_time_records')
        .select('*');
      if (data) setStationTimeRecords(data);
    };
    fetchStationTimeRecords();
  }, []);

  // 只包含Station 0-3的站點
  const targetStations = stations
    .filter(station => 
      station.station_name.includes('Station 0') || station.station_name.includes('工廠組裝') ||
      station.station_name.includes('Station 1') || station.station_name.includes('開機') ||
      station.station_name.includes('Station 2') || station.station_name.includes('FW') ||
      station.station_name.includes('Station 3') || station.station_name.includes('EE')
    )
    .sort((a, b) => a.station_order - b.station_order);

  // 計算每個站點的狀態（基於時間記錄和估計時間）
  const calculateStationStatus = (station: any) => {
    const stationItems = testItems.filter(item => item.station_id === station.id);
    
    if (stationItems.length === 0) {
      return {
        status: 'idle' as const,
        efficiency: 0,
        completed_systems: 0,
        ongoing_systems: 0,
        total_systems: systems.length,
        current_systems: []
      };
    }

    // 計算每個系統在此站點的進度和時間狀態
    const systemProgressData = systems.map(system => {
      const systemProgressRecords = stationItems.map(item => {
        return progress.find(p => 
          p.system_id === system.id && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
      }).filter(Boolean);

      const completedCount = systemProgressRecords.filter(p => p?.status === 'Done').length;
      const totalCount = stationItems.length;
      const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      const isCompleted = completedCount === totalCount && totalCount > 0;
      const hasProgress = systemProgressRecords.some(p => p?.status !== 'Not Start');

      // 獲取該系統在該站點的時間記錄
      const timeRecord = stationTimeRecords.find(tr => 
        tr.system_id === system.id && tr.station_id === station.id
      );
      
      // 獲取該站點的估計時間
      const estimatedHours = station.estimated_hours || 0;
      
      // 計算實際使用時間
      let actualHours = 0;
      if (timeRecord) {
        if (timeRecord.total_hours !== null) {
          actualHours = parseFloat(timeRecord.total_hours);
        } else if (timeRecord.start_time && timeRecord.end_time) {
          const startTime = new Date(timeRecord.start_time);
          const endTime = new Date(timeRecord.end_time);
          actualHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        } else if (timeRecord.start_time && !timeRecord.end_time) {
          // 正在進行中，計算從開始到現在的時間
          const startTime = new Date(timeRecord.start_time);
          const now = new Date();
          actualHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        }
      }

      // 計算時間效率（是否落後）
      const timeEfficiency = estimatedHours > 0 ? (estimatedHours / Math.max(actualHours, estimatedHours)) * 100 : 100;

      return {
        system,
        progress: progressPercent,
        isCompleted,
        isActive: hasProgress && !isCompleted,
        completedCount,
        totalCount,
        timeEfficiency,
        actualHours,
        estimatedHours
      };
    });

    const completedSystemsCount = systemProgressData.filter(s => s.isCompleted).length;
    const activeSystemsCount = systemProgressData.filter(s => s.isActive).length;
    const totalProgress = systemProgressData.reduce((sum, s) => sum + s.progress, 0);
    const averageProgress = systems.length > 0 ? totalProgress / systems.length : 0;
    
    // 計算平均時間效率
    const activeTimeData = systemProgressData.filter(s => s.isActive || s.isCompleted);
    const averageTimeEfficiency = activeTimeData.length > 0 
      ? activeTimeData.reduce((sum, s) => sum + s.timeEfficiency, 0) / activeTimeData.length 
      : 100;
    
    const activeSystems = systemProgressData
      .filter(s => s.isActive || s.isCompleted)
      .map(s => s.system);

    // 根據進度和時間效率確定狀態
    let status: 'idle' | 'working' | 'warning' | 'error' | 'complete' = 'idle';
    
    if (averageProgress === 100) {
      status = 'complete';
    } else if (averageProgress > 0) {
      // 根據時間效率判斷狀態
      if (averageTimeEfficiency >= 80) {
        status = 'working';  // 時間效率良好
      } else if (averageTimeEfficiency >= 60) {
        status = 'warning';  // 時間效率較差，可能落後
      } else {
        status = 'error';    // 嚴重落後
      }
    } else {
      status = 'idle';
    }

    return {
      status,
      efficiency: Math.round(averageProgress),
      completed_systems: completedSystemsCount,
      ongoing_systems: activeSystemsCount,
      total_systems: systems.length,
      current_systems: activeSystems
    };
  };

  const stationStatuses = targetStations.map(station => ({
    ...station,
    ...calculateStationStatus(station)
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">測試站點進度總覽 (Station 0-3)</h3>
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-complete"></div>
            <span>完成</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-working"></div>
            <span>進行中</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-warning"></div>
            <span>延遲</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-error"></div>
            <span>異常</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-idle"></div>
            <span>待機</span>
          </div>
        </div>
      </div>
      
      {/* 簡化的狀態說明 */}
      <div className="bg-muted/20 rounded-lg p-4">
        <h4 className="font-medium text-sm mb-2">進度說明</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-complete"></div>
            <span>所有測試項目完成</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-working"></div>
            <span>測試進行順利 (≥70%)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-warning"></div>
            <span>進度較慢 (30-69%)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-error"></div>
            <span>進度嚴重落後 (&lt;30%)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-idle"></div>
            <span>尚未開始測試</span>
          </div>
        </div>
      </div>
      
      {/* 重新設計的站點卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stationStatuses.map((station) => (
          <div
            key={station.id}
            onClick={() => onStationClick?.(station.id)}
            className={cn(
              "relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105",
              getStatusColor(station.status)
            )}
          >
            {/* 站點名稱和狀態 */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm">{station.station_name}</h4>
              <Badge variant="outline" className="text-xs bg-white/20 border-white/30">
                {getStatusText(station.status)}
              </Badge>
            </div>
            
            {/* 進度條 */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs opacity-90">整體進度</span>
                <span className="text-xs font-semibold">{station.efficiency}%</span>
              </div>
              <div className="w-full bg-black/20 rounded-full h-2">
                <div
                  className="bg-white/80 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${station.efficiency}%` }}
                ></div>
              </div>
            </div>
            
            {/* 系統狀態統計 */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="opacity-90">已完成系統:</span>
                <span className="font-medium">{station.completed_systems}台</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-90">進行中系統:</span>
                <span className="font-medium">{station.ongoing_systems}台</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-90">總系統數:</span>
                <span className="font-medium">{station.total_systems}台</span>
              </div>
            </div>
            
            {/* 活躍系統列表 */}
            {station.current_systems.length > 0 && (
              <div className="mt-3 pt-2 border-t border-white/20">
                <div className="text-xs font-medium mb-1 opacity-90">目前測試系統:</div>
                <div className="space-y-1">
                  {station.current_systems.slice(0, 2).map(system => (
                    <div key={system.id} className="text-xs opacity-80 truncate bg-white/10 rounded px-2 py-1">
                      {system.system_name}
                    </div>
                  ))}
                  {station.current_systems.length > 2 && (
                    <div className="text-xs opacity-60 text-center">
                      還有 {station.current_systems.length - 2} 個系統...
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 狀態指示器 */}
            {station.status === 'working' && (
              <div className="absolute top-2 right-2">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
