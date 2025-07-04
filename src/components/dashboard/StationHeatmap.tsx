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
  const { stationStatuses } = useUnifiedData();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">測試站點進度熱區圖</h3>
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <div className="flex items-center space-x-2" title="測試完成：所有測試項目已完成">
            <div className="w-3 h-3 rounded bg-station-complete"></div>
            <span>完成 (100%)</span>
          </div>
          <div className="flex items-center space-x-2" title="進行中：測試正在執行，進度50%以上">
            <div className="w-3 h-3 rounded bg-station-working"></div>
            <span>作業中 (50-99%)</span>
          </div>
          <div className="flex items-center space-x-2" title="警告：測試進度低於50%或有延遲">
            <div className="w-3 h-3 rounded bg-station-warning"></div>
            <span>延遲 (&lt;50%)</span>
          </div>
          <div className="flex items-center space-x-2" title="異常：測試過程中發生錯誤">
            <div className="w-3 h-3 rounded bg-station-error"></div>
            <span>異常 (錯誤)</span>
          </div>
          <div className="flex items-center space-x-2" title="待機：目前沒有系統在此站點測試">
            <div className="w-3 h-3 rounded bg-station-idle"></div>
            <span>待機 (閒置)</span>
          </div>
        </div>
      </div>
      
      {/* Detailed Status Legend */}
      <div className="bg-muted/20 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-sm">狀態詳細說明</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-complete mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-success">完成</div>
              <div className="text-muted-foreground">所有測試項目已通過，系統可以進入下一站點</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-working mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-primary">作業中</div>
              <div className="text-muted-foreground">測試正在進行，進度正常（≥50%）</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-warning mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-warning">延遲警告</div>
              <div className="text-muted-foreground">進度低於預期（&lt;50%），需要關注</div>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 rounded bg-station-error mt-0.5 flex-shrink-0"></div>
            <div>
              <div className="font-medium text-danger">異常錯誤</div>
              <div className="text-muted-foreground">測試過程中發生錯誤，需要立即處理</div>
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
            <div className="text-sm font-medium mb-2">{station.name}</div>
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
                <span>效率:</span>
                <span>{station.efficiency}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}