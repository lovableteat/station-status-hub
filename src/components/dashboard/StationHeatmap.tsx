import { cn } from "@/lib/utils";

interface Station {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'warning' | 'error' | 'complete';
  progress: number;
  machineCount: number;
  avgTime: number;
}

const stations: Station[] = [
  { id: 'S0', name: 'Station 0', status: 'working', progress: 85, machineCount: 3, avgTime: 1.5 },
  { id: 'S1', name: 'Station 1', status: 'complete', progress: 100, machineCount: 2, avgTime: 1.3 },
  { id: 'S2', name: 'Station 2', status: 'warning', progress: 65, machineCount: 5, avgTime: 1.8 },
  { id: 'S3', name: 'Station 3', status: 'error', progress: 30, machineCount: 7, avgTime: 2.8 },
  { id: 'S4', name: 'Station 4', status: 'working', progress: 90, machineCount: 4, avgTime: 3.2 },
];

const getStatusColor = (status: Station['status']) => {
  switch (status) {
    case 'idle': return 'bg-station-idle border-station-idle';
    case 'working': return 'bg-station-working border-station-working animate-pulse-slow';
    case 'warning': return 'bg-station-warning border-station-warning';
    case 'error': return 'bg-station-error border-station-error animate-pulse';
    case 'complete': return 'bg-station-complete border-station-complete';
    default: return 'bg-muted border-border';
  }
};

const getStatusText = (status: Station['status']) => {
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
        {stations.map((station) => (
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
                style={{ width: `${station.progress}%` }}
              ></div>
            </div>
            
            <div className="space-y-1 text-xs opacity-90">
              <div className="flex justify-between">
                <span>機台數:</span>
                <span>{station.machineCount}</span>
              </div>
              <div className="flex justify-between">
                <span>平均工時:</span>
                <span>{station.avgTime}h</span>
              </div>
              <div className="flex justify-between">
                <span>進度:</span>
                <span>{station.progress}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}