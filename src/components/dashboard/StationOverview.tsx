import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StationTimeData {
  id: string;
  name: string;
  estimatedHours: number;
  actualHours: number;
  order: number;
}

export function StationOverview() {
  const { stations, testItems, progress, systems } = useUnifiedData();
  const [stationTimeData, setStationTimeData] = useState<StationTimeData[]>([]);
  const [totalEstimatedHours, setTotalEstimatedHours] = useState(0);
  const [estimatedDays, setEstimatedDays] = useState({ min: 0, max: 0 });

  useEffect(() => {
    // Calculate time data for stations 0-3
    const timeData = stations
      .filter(station => station.station_order >= 0 && station.station_order <= 3)
      .map(station => {
        // Get test items for this station and sum their estimated minutes
        const stationItems = testItems.filter(item => item.station_id === station.id);
        const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 30), 0);
        const estimatedHours = Number((totalMinutes / 60).toFixed(1));
        
        // Calculate actual hours from test progress records
        const stationProgress = progress.filter(p => p.station_id === station.id);
        const totalActualHours = stationProgress.reduce((sum, p) => sum + (p.actual_hours || 0), 0);
        const actualHours = Number(totalActualHours.toFixed(1));

        return {
          id: station.id,
          name: station.station_name,
          estimatedHours,
          actualHours: actualHours > 0 ? actualHours : estimatedHours,
          order: station.station_order
        };
      })
      .sort((a, b) => a.order - b.order);

    setStationTimeData(timeData);

    // Calculate total estimated hours for single machine
    const totalHours = timeData.reduce((sum, station) => sum + station.estimatedHours, 0);
    setTotalEstimatedHours(Number(totalHours.toFixed(1)));

    // Calculate estimated completion days (assuming 8 hours per day, with some variation)
    const totalSystems = systems.length;
    if (totalSystems > 0 && totalHours > 0) {
      const totalWorkHours = totalSystems * totalHours;
      const assumedWorkingHoursPerDay = 8;
      const assumedParallelStations = 4; // Can process 4 systems in parallel
      
      const minDays = Math.ceil(totalWorkHours / (assumedWorkingHoursPerDay * assumedParallelStations));
      const maxDays = Math.ceil(minDays * 1.2); // Add 20% buffer
      
      setEstimatedDays({ min: minDays, max: maxDays });
    }
  }, [stations, testItems, progress, systems]);

  const getStationIcon = (order: number) => {
    switch(order) {
      case 0: return '⚙️';
      case 1: return '💻';
      case 2: return '⚡';
      case 3: return '🔧';
      default: return '📋';
    }
  };

  const getStationColor = (order: number) => {
    switch(order) {
      case 0: return 'bg-blue-500';
      case 1: return 'bg-green-500';
      case 2: return 'bg-orange-500';
      case 3: return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-6">測試流程總覽</h3>
        
        {/* Station Time Overview */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stationTimeData.map((station) => (
            <div key={station.id} className="flex flex-col items-center">
              <div className={`w-16 h-16 rounded-full ${getStationColor(station.order)} flex items-center justify-center text-white text-2xl mb-2`}>
                {getStationIcon(station.order)}
              </div>
              <div className="text-center">
                <div className="font-medium text-sm mb-1">
                  Station {station.order} - {station.name}
                </div>
                <Badge variant="outline" className="text-xs">
                  {station.estimatedHours}h
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-6 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground mb-1">
              {systems.length}
            </div>
            <div className="text-sm text-muted-foreground">
              測試系統總數
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground mb-1">
              {totalEstimatedHours}h
            </div>
            <div className="text-sm text-muted-foreground">
              單機測試時間
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground mb-1">
              {estimatedDays.min}-{estimatedDays.max}
            </div>
            <div className="text-sm text-muted-foreground">
              預計完成天數
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}