import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface DailyStationData {
  date: string;
  [key: string]: string | number; // 動態站點完成數量
}

export function DailyStationCompletionChart() {
  const { stations } = useUnifiedData();
  const { toast } = useToast();
  const [chartData, setChartData] = useState<DailyStationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState<number>(7);

  // 站點顏色映射
  const stationColors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7300', 
    '#8dd1e1', '#d084d0', '#82d982', '#ffb347'
  ];

  const loadDailyStationData = async () => {
    try {
      setIsLoading(true);
      
      // 獲取指定天數的數據
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (days - 1));
      
      // 查詢每日每站完成的系統數量 - 以站點完成為基準
      // 只查詢7/21之後的有效資料
      const validStartDate = new Date('2025-07-21');
      const actualStartDate = startDate < validStartDate ? validStartDate : startDate;
      
      const { data, error } = await supabase
        .from('station_time_records')
        .select(`
          system_id,
          station_id,
          station_name,
          end_time
        `)
        .not('end_time', 'is', null)
        .gte('end_time', actualStartDate.toISOString())
        .lte('end_time', endDate.toISOString());

      if (error) throw error;

      // 處理數據：按日期和站點統計完成數量
      const processedData: { [date: string]: { [station: string]: Set<string> } } = {};
      
      data?.forEach(record => {
        if (!record.end_time) return;
        
        const date = new Date(record.end_time).toISOString().split('T')[0];
        const stationName = record.station_name;
        
        if (!processedData[date]) {
          processedData[date] = {};
        }
        
        if (!processedData[date][stationName]) {
          processedData[date][stationName] = new Set();
        }
        
        // 用Set確保每個系統每站只計算一次
        processedData[date][stationName].add(record.system_id);
      });

      // 生成指定天數的圖表數據
      const chartData: DailyStationData[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const displayDate = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
        
        const dayData: DailyStationData = { date: displayDate };
        
        // 為每個站點添加該日完成數量
        stations.forEach(station => {
          const stationData = processedData[dateStr]?.[station.station_name];
          dayData[station.station_name] = stationData ? stationData.size : 0;
        });
        
        chartData.push(dayData);
      }
      
      setChartData(chartData);
    } catch (error) {
      console.error('載入每日站點完成數據失敗:', error);
      toast({
        title: "載入失敗",
        description: "無法載入每日站點完成數據",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDailyStationData();
  }, [stations, days]);

  // 自訂 Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-popover-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.dataKey}: {entry.value} 台完成
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          每站每日完成數量趨勢
          <div className="ml-auto flex items-center gap-2">
            <Select value={days.toString()} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7天</SelectItem>
                <SelectItem value="14">14天</SelectItem>
                <SelectItem value="30">30天</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadDailyStationData}
              disabled={isLoading}
            >
              <Calendar className="h-4 w-4 mr-1" />
              {isLoading ? "載入中..." : "重新整理"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ value: '完成台數', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {stations
                  .sort((a, b) => a.station_order - b.station_order)
                  .map((station, index) => (
                    <Bar 
                      key={station.id}
                      dataKey={station.station_name} 
                      fill={stationColors[index % stationColors.length]}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>目前沒有可用的完成數據</p>
                <p className="text-sm">請確認有已完成的測試記錄</p>
              </div>
            </div>
          )}
        </div>
        
        {/* 統計摘要 */}
        {chartData.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stations
              .sort((a, b) => a.station_order - b.station_order)
              .map((station, index) => {
                const todayData = chartData[chartData.length - 1];
                const todayCount = (todayData[station.station_name] as number) || 0;
                const weekTotal = chartData.reduce((sum, day) => 
                  sum + ((day[station.station_name] as number) || 0), 0
                );
                
                return (
                  <div 
                    key={station.id} 
                    className="text-center p-3 bg-muted/30 rounded-lg border"
                  >
                    <div 
                      className="w-4 h-4 rounded mx-auto mb-1" 
                      style={{ backgroundColor: stationColors[index % stationColors.length] }}
                    ></div>
                    <p className="font-medium text-sm">{station.station_name}</p>
                    <p className="text-lg font-bold text-primary">{todayCount}</p>
                    <p className="text-xs text-muted-foreground">今日完成</p>
                    <p className="text-xs text-muted-foreground">{days}天總計: {weekTotal}</p>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}