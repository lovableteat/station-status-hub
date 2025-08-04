import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Calendar, TrendingUp, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DailyCompletionData {
  date: string;
  station0: number;
  station1: number;
  station2: number;
  station3: number;
  totalMachines: number;
}

type DateRange = '7' | '30' | '60' | '90' | 'custom';
type ViewMode = 'all' | 'single' | 'total';

export function DailyStationCompletionChart() {
  const [data, setData] = useState<DailyCompletionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedStation, setSelectedStation] = useState<string>('station0');
  const { toast } = useToast();

  useEffect(() => {
    loadDailyCompletionData();
  }, [dateRange, viewMode, selectedStation]);

  const loadDailyCompletionData = async () => {
    try {
      setIsLoading(true);
      
      // 計算日期範圍
      const endDate = new Date();
      const startDate = new Date();
      const days = parseInt(dateRange);
      startDate.setDate(startDate.getDate() - (days - 1));
      
      // 取得測試進度資料，專注於 Station 0-3
      const { data: progressData, error: progressError } = await supabase
        .from('test_progress')
        .select(`
          system_id,
          station_id,
          completed_at,
          status,
          test_flow_stations (
            station_name,
            station_order
          )
        `)
        .eq('status', 'Done')
        .not('completed_at', 'is', null)
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString());

      if (progressError) {
        console.error('Error loading progress data:', progressError);
        toast({
          title: "載入失敗",
          description: "無法載入進度資料",
          variant: "destructive"
        });
        return;
      }

      // 過濾只包含 Station 0-3 的資料
      const stationProgresses = progressData?.filter(progress => {
        const stationOrder = progress.test_flow_stations?.station_order;
        return stationOrder !== undefined && stationOrder >= 0 && stationOrder <= 3;
      }) || [];

      // 生成日期範圍陣列
      const dateRangeArray: string[] = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dateRangeArray.push(d.toISOString().split('T')[0]);
      }

      // 計算每天各站別的完成數量
      const dailyData: DailyCompletionData[] = dateRangeArray.map(date => {
        const dayProgresses = stationProgresses.filter(progress => {
          const completedDate = new Date(progress.completed_at!).toISOString().split('T')[0];
          return completedDate === date;
        });

        // 按站別分組計算
        const station0 = dayProgresses.filter(p => p.test_flow_stations?.station_order === 0).length;
        const station1 = dayProgresses.filter(p => p.test_flow_stations?.station_order === 1).length;
        const station2 = dayProgresses.filter(p => p.test_flow_stations?.station_order === 2).length;
        const station3 = dayProgresses.filter(p => p.test_flow_stations?.station_order === 3).length;

        // 計算當天完成的機台數（取最小值，因為機台只有全部站別都完成才算完成）
        const totalMachines = Math.min(station0, station1, station2, station3);

        return {
          date,
          station0,
          station1,
          station2,
          station3,
          totalMachines
        };
      });

      setData(dailyData);
      
    } catch (error) {
      console.error('Error loading daily completion data:', error);
      toast({
        title: "載入失敗",
        description: "無法載入每日完成資料",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 自訂 Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-popover-foreground">
            {new Date(data.date).toLocaleDateString('zh-TW')}
          </p>
          {viewMode === 'all' && (
            <>
              <div className="space-y-1 mt-2">
                <p className="text-blue-500 text-sm">Station 0: {data.station0} 個</p>
                <p className="text-green-500 text-sm">Station 1: {data.station1} 個</p>
                <p className="text-orange-500 text-sm">Station 2: {data.station2} 個</p>
                <p className="text-purple-500 text-sm">Station 3: {data.station3} 個</p>
              </div>
              <p className="text-primary font-medium mt-2">完成機台數: {data.totalMachines} 台</p>
            </>
          )}
          {viewMode === 'single' && (
            <p className="text-primary">
              {selectedStation === 'station0' && `Station 0: ${data.station0} 個`}
              {selectedStation === 'station1' && `Station 1: ${data.station1} 個`}
              {selectedStation === 'station2' && `Station 2: ${data.station2} 個`}
              {selectedStation === 'station3' && `Station 3: ${data.station3} 個`}
            </p>
          )}
          {viewMode === 'total' && (
            <p className="text-primary">完成機台數: {data.totalMachines} 台</p>
          )}
        </div>
      );
    }
    return null;
  };

  // 根據檢視模式渲染對應的線條
  const renderLines = () => {
    if (viewMode === 'all') {
      return (
        <>
          <Line 
            type="monotone" 
            dataKey="station0" 
            stroke="hsl(217, 91%, 60%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Station 0"
          />
          <Line 
            type="monotone" 
            dataKey="station1" 
            stroke="hsl(142, 76%, 36%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Station 1"
          />
          <Line 
            type="monotone" 
            dataKey="station2" 
            stroke="hsl(25, 95%, 53%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Station 2"
          />
          <Line 
            type="monotone" 
            dataKey="station3" 
            stroke="hsl(271, 81%, 56%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="Station 3"
          />
        </>
      );
    } else if (viewMode === 'single') {
      const colors = {
        station0: "hsl(217, 91%, 60%)",
        station1: "hsl(142, 76%, 36%)",
        station2: "hsl(25, 95%, 53%)",
        station3: "hsl(271, 81%, 56%)"
      };
      return (
        <Line 
          type="monotone" 
          dataKey={selectedStation} 
          stroke={colors[selectedStation as keyof typeof colors]}
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      );
    } else {
      return (
        <Line 
          type="monotone" 
          dataKey="totalMachines" 
          stroke="hsl(var(--primary))"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          每日站別完成動態分析
          <Badge variant="outline" className="ml-2">
            最近 {dateRange} 天
          </Badge>
        </CardTitle>
        
        {/* 控制項 */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">日期範圍:</span>
            <Select value={dateRange} onValueChange={(value: DateRange) => setDateRange(value)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7天</SelectItem>
                <SelectItem value="30">30天</SelectItem>
                <SelectItem value="60">60天</SelectItem>
                <SelectItem value="90">90天</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">檢視模式:</span>
            <Select value={viewMode} onValueChange={(value: ViewMode) => setViewMode(value)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有站別</SelectItem>
                <SelectItem value="single">單一站別</SelectItem>
                <SelectItem value="total">完成機台數</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {viewMode === 'single' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">選擇站別:</span>
              <Select value={selectedStation} onValueChange={setSelectedStation}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="station0">Station 0</SelectItem>
                  <SelectItem value="station1">Station 1</SelectItem>
                  <SelectItem value="station2">Station 2</SelectItem>
                  <SelectItem value="station3">Station 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart 
                data={data} 
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ 
                    value: viewMode === 'total' ? '完成機台數量' : '完成站別數量', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' }
                  }}
                  className="text-muted-foreground"
                />
                <Tooltip content={<CustomTooltip />} />
                {renderLines()}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>目前沒有可用的每日完成資料</p>
                <p className="text-sm">請確認有已完成的測試記錄</p>
              </div>
            </div>
          )}
        </div>

        {/* 統計摘要 */}
        {data.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-primary">
                  {viewMode === 'total' || viewMode === 'all' ? 
                    data.reduce((sum, d) => sum + d.totalMachines, 0) :
                    data.reduce((sum, d) => {
                      const value = d[selectedStation as keyof DailyCompletionData];
                      return sum + (typeof value === 'number' ? value : 0);
                    }, 0)
                  }
                </p>
                <p className="text-sm text-muted-foreground">
                  {viewMode === 'total' ? '總完成機台數' : 
                   viewMode === 'single' ? `${selectedStation.toUpperCase()} 總完成數` : 
                   '總完成機台數'}
                </p>
              </div>
              
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-blue-500">
                  {data.reduce((sum, d) => sum + d.station0, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Station 0 總完成</p>
              </div>
              
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-green-500">
                  {data.reduce((sum, d) => sum + d.station1, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Station 1 總完成</p>
              </div>
              
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-orange-500">
                  {data.reduce((sum, d) => sum + d.station2, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Station 2 總完成</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-purple-500">
                  {data.reduce((sum, d) => sum + d.station3, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Station 3 總完成</p>
              </div>
              
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-yellow-500">
                  {Math.round(data.reduce((sum, d) => sum + d.totalMachines, 0) / data.length)}
                </p>
                <p className="text-sm text-muted-foreground">日均完成機台</p>
              </div>
              
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-red-500">
                  {Math.max(...data.map(d => d.totalMachines))}
                </p>
                <p className="text-sm text-muted-foreground">單日最高完成</p>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <strong>說明:</strong> 
              {viewMode === 'all' && ' 圖表顯示各站別每日完成數量的多線圖。各站別以不同顏色區分。'}
              {viewMode === 'single' && ` 圖表僅顯示 ${selectedStation.toUpperCase()} 站別的每日完成數量。`}
              {viewMode === 'total' && ' 圖表顯示每日完成的機台總數（所有 Station 0-3 都完成才算一台機台完成）。'}
              <br />
              統計範圍為最近 {dateRange} 天的測試進度完成記錄。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}