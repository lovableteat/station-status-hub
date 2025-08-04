import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Calendar, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DailyCompletionData {
  date: string;
  station0Count: number;
  station1Count: number;
  station2Count: number;
  station3Count: number;
  totalStations: number;
}

export function DailyStationCompletionChart() {
  const [data, setData] = useState<DailyCompletionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadDailyCompletionData();
  }, []);

  const loadDailyCompletionData = async () => {
    try {
      setIsLoading(true);
      
      // 獲取最近30天的資料
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 29); // 最近30天
      
      // 取得所有已完成的系統
      const { data: completedSystems, error: systemError } = await supabase
        .from('test_systems')
        .select(`
          id,
          system_name,
          actual_completed_at,
          exclude_from_dashboard
        `)
        .eq('exclude_from_dashboard', false)
        .eq('status', '已完成')
        .not('actual_completed_at', 'is', null)
        .gte('actual_completed_at', startDate.toISOString())
        .lte('actual_completed_at', endDate.toISOString());

      if (systemError) {
        console.error('Error loading systems:', systemError);
        toast({
          title: "載入失敗",
          description: "無法載入系統資料",
          variant: "destructive"
        });
        return;
      }

      // 取得站點資訊
      const { data: stations, error: stationError } = await supabase
        .from('test_flow_stations')
        .select('*')
        .order('station_order');

      if (stationError) {
        console.error('Error loading stations:', stationError);
        return;
      }

      // 過濾出 Station 0-3
      const targetStations = stations?.filter(station => 
        station.station_name.includes('Station 0') || station.station_name.includes('組裝') ||
        station.station_name.includes('Station 1') || station.station_name.includes('開機') ||
        station.station_name.includes('Station 2') || station.station_name.includes('FW') ||
        station.station_name.includes('Station 3') || station.station_name.includes('EE')
      ) || [];

      // 生成日期範圍
      const dateRange: string[] = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dateRange.push(d.toISOString().split('T')[0]);
      }

      // 計算每天完成的站別數
      const dailyData: DailyCompletionData[] = dateRange.map(date => {
        // 找出該日期完成的系統
        const dayCompletedSystems = completedSystems?.filter(system => {
          const completedDate = new Date(system.actual_completed_at!).toISOString().split('T')[0];
          return completedDate === date;
        }) || [];

        // 計算各站別完成數量（以系統完成為準，每個系統完成代表所有 Station 0-3 都完成）
        const station0Count = dayCompletedSystems.length;
        const station1Count = dayCompletedSystems.length;
        const station2Count = dayCompletedSystems.length;
        const station3Count = dayCompletedSystems.length;

        return {
          date,
          station0Count,
          station1Count,
          station2Count,
          station3Count,
          totalStations: station0Count + station1Count + station2Count + station3Count
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
          <p className="text-primary">完成機台數: {data.station0Count} 台</p>
          <p className="text-xs text-muted-foreground">
            總站別完成數: {data.totalStations} 個站別
          </p>
          <p className="text-xs text-muted-foreground">
            每台機台完成 Station 0-3 共4個站別
          </p>
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
          每日站別完成動態分析 (最近30天)
        </CardTitle>
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ value: '完成站別數量', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="totalStations" 
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
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
                  {data.reduce((sum, d) => sum + d.totalStations, 0)}
                </p>
                <p className="text-sm text-muted-foreground">總完成站別數</p>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-success">
                  {data.reduce((sum, d) => sum + d.station0Count, 0)}
                </p>
                <p className="text-sm text-muted-foreground">總完成機台數</p>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-warning">
                  {Math.round(data.reduce((sum, d) => sum + d.totalStations, 0) / data.length)}
                </p>
                <p className="text-sm text-muted-foreground">日均完成站別</p>
              </div>
              <div className="text-center p-4 bg-muted/30 rounded-lg border">
                <p className="text-2xl font-bold text-info">
                  {Math.max(...data.map(d => d.totalStations))}
                </p>
                <p className="text-sm text-muted-foreground">單日最高完成</p>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <strong>說明:</strong> 圖表顯示每日完成的機台數量及對應的站別完成數。
              每台機台完成代表 Station 0、Station 1、Station 2、Station 3 共4個站別全部完成。
              統計範圍為最近30天內狀態為「已完成」的機台。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}