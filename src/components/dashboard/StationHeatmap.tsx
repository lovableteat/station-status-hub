
import { cn } from "@/lib/utils";
import { useUnifiedData } from "@/hooks/useUnifiedData";

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
    case 'warning': return '注意';
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

  // 基於GB300 L10測試追蹤資料計算站點狀態 - 動態包含所有站點
  const calculateStationStatus = (station: any) => {
    // 取得該站點的所有測試項目
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

    // 計算每個系統在此站點的進度
    const systemProgressData = systems.map(system => {
      const systemProgressRecords = stationItems.map(item => {
        return progress.find(p => 
          p.system_id === system.id && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
      }).filter(Boolean);

      // 計算該系統在此站點的完成項目數
      const completedCount = systemProgressRecords.filter(p => p?.status === 'Done').length;
      const totalCount = stationItems.length;
      const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      const isCompleted = completedCount === totalCount && totalCount > 0;
      const hasProgress = systemProgressRecords.some(p => p?.status !== 'Not Start');

      return {
        system,
        progress: progressPercent,
        isCompleted,
        isActive: hasProgress && !isCompleted,
        completedCount,
        totalCount
      };
    });

    // 統計
    const completedSystemsCount = systemProgressData.filter(s => s.isCompleted).length;
    const activeSystemsCount = systemProgressData.filter(s => s.isActive).length;
    const totalProgress = systemProgressData.reduce((sum, s) => sum + s.progress, 0);
    const averageProgress = systems.length > 0 ? totalProgress / systems.length : 0;
    
    // 找出在此站點活躍的系統
    const activeSystems = systemProgressData
      .filter(s => s.isActive || s.isCompleted)
      .map(s => s.system);

    // 確定狀態 - 基於GB300 L10測試追蹤的實際數據
    let status: 'idle' | 'working' | 'warning' | 'error' | 'complete' = 'idle';
    
    if (averageProgress === 100) {
      status = 'complete';
    } else if (averageProgress >= 70) {
      status = 'working';
    } else if (averageProgress >= 30) {
      status = 'warning';
    } else if (averageProgress > 0) {
      status = 'error';
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

  // 動態顯示所有站點狀態（包含Station 4）
  const stationStatuses = stations
    .sort((a, b) => a.station_order - b.station_order)
    .map(station => ({
      ...station,
      ...calculateStationStatus(station)
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">測試站點進度熱區圖 (包含Station 4)</h3>
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <div className="flex items-center space-x-2" title="測試完成：所有測試項目已完成">
            <div className="w-3 h-3 rounded bg-station-complete"></div>
            <span>完成 (100%)</span>
          </div>
          <div className="flex items-center space-x-2" title="進行中：測試正在執行，進度70%以上">
            <div className="w-3 h-3 rounded bg-station-working"></div>
            <span>作業中 (70-99%)</span>
          </div>
          <div className="flex items-center space-x-2" title="警告：測試進度30-69%">
            <div className="w-3 h-3 rounded bg-station-warning"></div>
            <span>延遲 (30-69%)</span>
          </div>
          <div className="flex items-center space-x-2" title="異常：測試進度低於30%">
            <div className="w-3 h-3 rounded bg-station-error"></div>
            <span>異常 (&lt;30%)</span>
          </div>
          <div className="flex items-center space-x-2" title="待機：目前沒有系統在此站點測試">
            <div className="w-3 h-3 rounded bg-station-idle"></div>
            <span>待機 (閒置)</span>
          </div>
        </div>
      </div>
      
      {/* Detailed Status Legend */}
      <div className="bg-muted/20 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">狀態詳細說明（基於GB300 L10測試追蹤資料 - 包含Station 4）</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-complete mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-success">完成</div>
              <div className="text-muted-foreground">該站點所有系統測試項目均已100%完成</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-working mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-primary">作業中</div>
              <div className="text-muted-foreground">測試進度良好（70-99%），按計劃進行</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-warning mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-warning">延遲警告</div>
              <div className="text-muted-foreground">進度較慢（30-69%），需要關注</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-error mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-danger">異常錯誤</div>
              <div className="text-muted-foreground">進度嚴重落後（&lt;30%），需要立即處理</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-idle mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-muted-foreground">待機狀態</div>
              <div className="text-muted-foreground">目前沒有系統在此站點進行測試</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stationStatuses.map((station) => (
          <div
            key={station.id}
            onClick={() => onStationClick?.(station.id)}
            className={cn(
              "p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-station hover:scale-105",
              getStatusColor(station.status)
            )}
          >
            <div className="text-sm font-medium mb-2">{station.station_name}</div>
            <div className="text-xs opacity-90 mb-3">{getStatusText(station.status)}</div>
            
            {/* Progress Bar */}
            <div className="w-full bg-black/20 rounded-full h-2 mb-3">
              <div
                className="bg-white/80 h-2 rounded-full transition-all duration-300"
                style={{ width: `${station.efficiency}%` }}
              ></div>
            </div>
            
            <div className="space-y-1 text-xs opacity-90">
              <div className="flex justify-between">
                <span>完成系統:</span>
                <span>{station.completed_systems}</span>
              </div>
              <div className="flex justify-between">
                <span>進行中:</span>
                <span>{station.ongoing_systems}</span>
              </div>
              <div className="flex justify-between">
                <span>總計:</span>
                <span>{station.total_systems}</span>
              </div>
              <div className="flex justify-between">
                <span>效率:</span>
                <span>{station.efficiency}%</span>
              </div>
              {station.current_systems.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/20">
                  <div className="text-xs font-medium mb-1">活躍系統:</div>
                  {station.current_systems.slice(0, 2).map(system => (
                    <div key={system.id} className="text-xs opacity-80 truncate">
                      {system.system_name}
                    </div>
                  ))}
                  {station.current_systems.length > 2 && (
                    <div className="text-xs opacity-60">
                      +{station.current_systems.length - 2} 更多...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
