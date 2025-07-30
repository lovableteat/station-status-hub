
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Clock, Calendar } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays } from "date-fns";
import { zh } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function StationAverageTimeChart() {
  const { stationStatuses, systems, progress, testItems, stations } = useUnifiedData();
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 篩選出不被排除的系統
  const includedSystems = systems.filter(system => !system.exclude_from_dashboard);

  const getStationAverageTime = () => {
    const targetStations = stations.filter(station => 
      station.name.includes('Station 0') || station.name.includes('組裝') ||
      station.name.includes('Station 1') || station.name.includes('開機') ||
      station.name.includes('Station 2') || station.name.includes('FW') ||
      station.name.includes('Station 3') || station.name.includes('EE')
    );

    return targetStations.map(station => {
      // 只計算不被排除的系統
      const relevantProgress = progress.filter(p => {
        const system = includedSystems.find(s => s.id === p.system_id);
        const isInDateRange = dateRange.from && dateRange.to ? (
          p.completed_at && 
          new Date(p.completed_at) >= dateRange.from && 
          new Date(p.completed_at) <= dateRange.to
        ) : true;
        
        return system && 
               p.station_id === station.id && 
               p.status === 'Done' && 
               p.started_at && 
               p.completed_at &&
               isInDateRange;
      });

      if (relevantProgress.length === 0) {
        return {
          station: station.name.replace('Station ', 'S'),
          avgTime: 0,
          systemCount: 0
        };
      }

      const totalHours = relevantProgress.reduce((sum, p) => {
        const startTime = new Date(p.started_at!);
        const endTime = new Date(p.completed_at!);
        const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);

      return {
        station: station.name.replace('Station ', 'S'),
        avgTime: parseFloat((totalHours / relevantProgress.length).toFixed(1)),
        systemCount: new Set(relevantProgress.map(p => p.system_id)).size
      };
    });
  };

  const chartData = getStationAverageTime();
  const hasData = chartData.some(d => d.avgTime > 0);

  const handleDateRangeSelect = (range: { from: Date | undefined; to: Date | undefined }) => {
    setDateRange(range);
    if (range.from && range.to) {
      setShowDatePicker(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>各站平均處理時間分析</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  {dateRange.from && dateRange.to ? (
                    `${format(dateRange.from, 'MM/dd', { locale: zh })} - ${format(dateRange.to, 'MM/dd', { locale: zh })}`
                  ) : (
                    '選擇時間範圍'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{
                    from: dateRange.from,
                    to: dateRange.to
                  }}
                  onSelect={(range) => handleDateRangeSelect({
                    from: range?.from,
                    to: range?.to
                  })}
                  numberOfMonths={2}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
            >
              重設
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          分析各測試站點的平均處理時間（已排除標記為不計算的系統）
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>所選時間範圍內沒有完成的測試記錄</p>
            <p className="text-xs mt-2">請選擇不同的時間範圍或等待測試完成</p>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="station" 
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  label={{ value: '小時', angle: -90, position: 'insideLeft' }}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  formatter={(value: any, name: string) => [
                    `${value} 小時`, 
                    name === 'avgTime' ? '平均時間' : name
                  ]}
                  labelFormatter={(label) => `站點: ${label}`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="avgTime" 
                  name="平均處理時間"
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        
        {hasData && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {chartData.map((data, index) => (
              <div key={index} className="text-center p-2 bg-muted/50 rounded">
                <div className="font-medium">{data.station}</div>
                <div className="text-primary font-bold">{data.avgTime}h</div>
                <div className="text-muted-foreground text-xs">{data.systemCount} 系統</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
