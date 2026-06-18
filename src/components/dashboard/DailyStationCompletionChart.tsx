import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const sortedStations = [...stations].sort((a, b) => a.station_order - b.station_order);

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
      
      // 查詢每日每站完成的系統數量 - 只有所有測項都完成才算站點完成
      // 只查詢7/21之後的有效資料
      const validStartDate = new Date('2025-07-21');
      const actualStartDate = startDate < validStartDate ? validStartDate : startDate;
      
      // 首先獲取所有站點和對應的測項
      const { data: stationItems, error: stationError } = await supabase
        .from('test_flow_stations')
        .select(`
          id,
          station_name,
          station_order,
          test_flow_items(id, item_name)
        `);

      if (stationError) throw stationError;

      // 獲取指定日期範圍內的測試進度數據
      const { data: progressData, error: progressError } = await supabase
        .from('test_progress')
        .select(`
          system_id,
          station_id,
          item_id,
          status,
          completed_at,
          test_systems!inner(
            exclude_from_dashboard,
            system_name
          )
        `)
        .eq('test_systems.exclude_from_dashboard', false)
        .gte('completed_at', actualStartDate.toISOString())
        .lte('completed_at', endDate.toISOString());

      if (progressError) throw progressError;

      // 處理數據：只有當站點所有測項都完成時才算該站點完成
      const processedData: { [date: string]: { [station: string]: Set<string> } } = {};
      
      // 為每個系統檢查每個站點是否完全完成
      const systemsToCheck = new Set(progressData?.map(p => p.system_id) || []);
      
      for (const systemId of systemsToCheck) {
        for (const station of stationItems || []) {
          const stationTestItems = station.test_flow_items || [];
          
          // 如果站點沒有測項，跳過
          if (stationTestItems.length === 0) continue;
          
          // 獲取該系統在該站點的所有測試進度
          const systemStationProgress = progressData?.filter(
            p => p.system_id === systemId && p.station_id === station.id
          ) || [];
          
          // 檢查是否所有測項都已完成
          const completedItems = systemStationProgress.filter(p => p.status === 'Done');
          const allItemsCompleted = completedItems.length === stationTestItems.length;
          
          if (allItemsCompleted && completedItems.length > 0) {
            // 找到最後完成的測項時間作為站點完成時間
            const latestCompletionTime = completedItems
              .map(item => new Date(item.completed_at!))
              .sort((a, b) => b.getTime() - a.getTime())[0];
            
            const date = latestCompletionTime.toISOString().split('T')[0];
            
            if (!processedData[date]) {
              processedData[date] = {};
            }
            
            if (!processedData[date][station.station_name]) {
              processedData[date][station.station_name] = new Set();
            }
            
            processedData[date][station.station_name].add(systemId);
          }
        }
      }

      // 生成指定天數的圖表數據
      const chartData: DailyStationData[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const displayDate = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
        
        const dayData: DailyStationData = { date: displayDate };
        
        // 為每個站點添加該日完成數量
        sortedStations.forEach(station => {
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
      const visiblePayload = payload
        .filter((entry: any) => Number(entry.value) > 0)
        .sort((a: any, b: any) => Number(b.value) - Number(a.value));

      return (
        <div className="min-w-[220px] rounded-2xl border border-border/70 bg-popover/95 p-3 shadow-2xl backdrop-blur">
          <p className="text-sm font-semibold text-popover-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">當日各站完成台數</p>
          <div className="mt-3 space-y-2">
            {(visiblePayload.length > 0 ? visiblePayload : payload).map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-popover-foreground">{entry.dataKey}</span>
                </div>
                <span className="font-medium text-popover-foreground">{entry.value} 台</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const chartHeight = Math.max(360, chartData.length * 54);

  return (
    <Card className="overflow-hidden rounded-[30px] border border-violet-300/20 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] shadow-[0_24px_60px_-48px_hsl(245_58%_66%/0.45)]">
      <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,hsl(245_58%_66%/0.10),transparent)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-violet-200/70">每日產出</p>
            <CardTitle className="mt-3 flex items-center gap-2 text-2xl font-semibold sm:text-2xl">
              <TrendingUp className="h-5 w-5" />
              每站每日完成數量趨勢
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              以更容易掃視的方式看每天各站完成量，快速辨認哪一站正在拉高或拖慢節奏。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full border border-violet-300/18 bg-background/35 px-4 py-2 text-sm text-violet-100">
              追蹤 {days} 天
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-white/10 bg-background/35 px-4 py-2 text-sm text-foreground">
              站點 {stations.length}
            </Badge>
            <Select value={days.toString()} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger className="h-10 w-24 rounded-2xl border-white/10 bg-background/35">
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
              className="h-10 rounded-2xl border-white/10 bg-background/35 px-4 hover:bg-primary/10"
            >
              <Calendar className="h-4 w-4 mr-1" />
              {isLoading ? "載入中..." : "重新整理"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="mb-4 rounded-2xl border border-violet-300/12 bg-background/25 px-4 py-3 text-sm text-muted-foreground">
          每一列代表一天，橫條越長表示該站在當天完成的機台數越多。
        </div>

        <div className="h-[430px] overflow-y-auto pr-2">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : chartData.length > 0 ? (
            <div style={{ height: `${chartHeight}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 12, right: 30, left: 8, bottom: 12 }}
                  barCategoryGap="26%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-25" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12 }}
                    label={{ value: '完成台數', position: 'insideBottomRight', offset: -4 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    width={58}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {sortedStations.map((station, index) => (
                    <Bar
                      key={station.id}
                      dataKey={station.station_name}
                      fill={stationColors[index % stationColors.length]}
                      radius={[0, 6, 6, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
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
            {sortedStations.map((station, index) => {
                const todayData = chartData[chartData.length - 1];
                const todayCount = (todayData[station.station_name] as number) || 0;
                const weekTotal = chartData.reduce((sum, day) => 
                  sum + ((day[station.station_name] as number) || 0), 0
                );
                
                return (
                  <div 
                    key={station.id} 
                    className="rounded-[24px] border border-violet-300/12 bg-[linear-gradient(180deg,hsl(245_58%_66%/0.10),hsl(var(--background)/0.06))] p-4 text-left shadow-[0_16px_38px_-32px_hsl(245_58%_66%/0.42)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-violet-100/70">站點</p>
                        <p className="mt-3 font-medium text-sm leading-6">{station.station_name}</p>
                      </div>
                      <div 
                        className="h-4 w-4 rounded-full ring-4 ring-background/40" 
                        style={{ backgroundColor: stationColors[index % stationColors.length] }}
                      />
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-semibold text-primary">{todayCount}</p>
                        <p className="mt-1 text-xs text-muted-foreground">今日完成</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{days}天總計 {weekTotal}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
