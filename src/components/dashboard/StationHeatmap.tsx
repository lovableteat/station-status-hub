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
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-complete"></div>
            <span>完成</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-working"></div>
            <span>作業中</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-warning"></div>
            <span>延遲</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-station-error"></div>
            <span>異常</span>
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