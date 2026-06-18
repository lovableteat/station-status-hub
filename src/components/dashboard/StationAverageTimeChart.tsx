
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useStationTimeAnalytics } from "@/hooks/useStationTimeAnalytics";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Calendar, Clock, RotateCcw } from "lucide-react";

interface ChartDataPoint {
  station: string;
  actualTime: number;
  sampleCount: number;
  totalHours: number;
  calculationDetails: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

export function StationAverageTimeChart() {
  const { averageTimes, systemStationTimes, isLoading, loadStationTimeRecords } = useStationTimeAnalytics();
  const { stations } = useUnifiedData();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleFilter = () => {
    if (!startDate || !endDate) {
      loadStationTimeRecords();
      return;
    }
    
    loadStationTimeRecords({
      start_date: startDate,
      end_date: endDate,
      filter_type: 'actual_completed'
    });
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    loadStationTimeRecords();
  };

  // 準備圖表數據 - 動態顯示所有站點的實際平均處理時間
  const chartData = [...stations]
    .sort((a, b) => a.station_order - b.station_order)
    .map(station => {
      const actualData = averageTimes.find(item => item.station_name === station.station_name);
      const actualTime = actualData ? Number(actualData.average_hours.toFixed(2)) : 0;
      
      return {
        station: station.station_name,
        actualTime: actualTime,
        sampleCount: actualData?.total_records || 0,
        totalHours: actualData?.total_hours_sum || 0,
        calculationDetails: actualData?.calculation_details || ''
      };
    });

  // 自訂 Tooltip 格式化
  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-popover-foreground">{data.station}</p>
          <p className="text-primary">
            平均處理時間: {data.actualTime} 小時
          </p>
          <p className="text-xs text-muted-foreground">
            機台數: {data.sampleCount} 台
          </p>
          <p className="text-xs text-muted-foreground">
            計算: 各測項時間加總 ÷ 機台數
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="overflow-hidden rounded-[30px] border border-primary/22 bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--card)))] shadow-[0_24px_60px_-48px_hsl(var(--primary)/0.45)]">
      <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,hsl(var(--primary)/0.08),transparent)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary/75">節拍分析</p>
            <CardTitle className="mt-3 flex items-center gap-2 text-2xl font-semibold sm:text-2xl">
              <Clock className="h-5 w-5" />
              各站平均處理時間分析
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              把每個站點的平均處理節奏、樣本數與詳細計算過程放在同一個視覺區塊中。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full border border-primary/20 bg-background/35 px-4 py-2 text-sm text-primary">
              站點 {chartData.length}
            </Badge>
            <Badge variant="secondary" className="rounded-full border border-white/10 bg-background/35 px-4 py-2 text-sm text-foreground">
              明細 {systemStationTimes.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {/* 移除時間範圍篩選功能 */}

        {/* 圖表區域 - 垂直長條圖 */}
        <div className="h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="station"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ value: '時間 (小時)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="actualTime" 
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>目前沒有可用的時間資料</p>
                <p className="text-sm">請確認有已完成的測試記錄</p>
              </div>
            </div>
          )}
        </div>

        {/* 統計摘要與樣本數據表 */}
        {chartData.length > 0 && (
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="mb-4 text-lg font-semibold">各站點處理時間統計</h3>
              <div className={`grid grid-cols-1 gap-4 ${chartData.length <= 3 ? 'md:grid-cols-3' : chartData.length <= 4 ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
                {chartData.map((data, index) => (
                  <div
                    key={index}
                    className="rounded-[24px] border border-primary/14 bg-[linear-gradient(180deg,hsl(var(--primary)/0.10),hsl(var(--background)/0.08))] p-4 text-left shadow-[0_16px_38px_-32px_hsl(var(--primary)/0.5)]"
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-primary/70">站點</p>
                    <p className="mt-3 font-medium text-sm leading-6">{data.station}</p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <p className="text-3xl font-semibold text-primary">{data.actualTime}</p>
                      <p className="text-xs text-muted-foreground">小時</p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{data.sampleCount} 台機台</p>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 詳細計算過程表 */}
            <div>
              <h4 className="mb-3 text-lg font-semibold text-foreground">計算過程明細</h4>
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/75 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-secondary/90 text-foreground">
                      <tr>
                        <th className="px-4 py-3.5 text-left font-semibold">站點名稱</th>
                        <th className="px-4 py-3.5 text-right font-semibold">平均處理時間 (小時)</th>
                        <th className="px-4 py-3.5 text-right font-semibold">機台數量</th>
                        <th className="px-4 py-3.5 text-right font-semibold">總處理時間 (小時)</th>
                        <th className="px-4 py-3.5 text-left font-semibold">計算過程</th>
                        <th className="px-4 py-3.5 text-center font-semibold">效率評估</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                    {chartData.map((data, index) => {
                      const efficiency = data.actualTime <= 8 ? '良好' : data.actualTime <= 12 ? '正常' : '需改善';
                      const efficiencyColor = data.actualTime <= 8
                        ? 'border-primary/35 bg-primary/10 text-primary'
                        : data.actualTime <= 12
                          ? 'border-amber-300/35 bg-amber-400/10 text-amber-200'
                          : 'border-destructive/35 bg-destructive/10 text-destructive';
                      
                      return (
                        <tr key={index} className="odd:bg-background/20 transition-colors hover:bg-primary/[0.06]">
                          <td className="px-4 py-4 font-semibold text-foreground">{data.station}</td>
                          <td className="px-4 py-4 text-right font-medium text-foreground">{data.actualTime}</td>
                          <td className="px-4 py-4 text-right text-foreground">{data.sampleCount}</td>
                          <td className="px-4 py-4 text-right text-foreground">{data.totalHours}</td>
                          <td className="px-4 py-4 leading-6 text-foreground/80">{data.calculationDetails}</td>
                          <td className="px-4 py-4 text-center">
                            <Badge variant="outline" className={efficiencyColor}>{efficiency}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 系統各站時長明細 */}
            {systemStationTimes.length > 0 && (
              <div>
                <h4 className="mb-3 text-lg font-semibold text-foreground">各機台站別時長明細 (各測項時間加總)</h4>
                <div className="max-h-96 overflow-auto rounded-2xl border border-border/80 bg-card/75 shadow-sm">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 z-10 bg-secondary/95 text-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-3.5 text-left font-semibold">機台名稱</th>
                        <th className="px-4 py-3.5 text-left font-semibold">站點名稱</th>
                        <th className="px-4 py-3.5 text-right font-semibold">站別總時長 (小時)</th>
                        <th className="px-4 py-3.5 text-left font-semibold">說明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {[...systemStationTimes]
                        .sort((a, b) => {
                          // 先按系統名稱排序，再按站點順序排序
                          if (a.system_name !== b.system_name) {
                            return a.system_name.localeCompare(b.system_name);
                          }
                          const getStationOrder = (name: string) => {
                            const match = name.match(/Station\s*(\d+)/i);
                            return match ? parseInt(match[1]) : 999;
                          };
                          return getStationOrder(a.station_name) - getStationOrder(b.station_name);
                        })
                        .map((data, index) => (
                          <tr key={index} className="odd:bg-background/20 transition-colors hover:bg-primary/[0.06]">
                            <td className="px-4 py-4 font-semibold text-foreground">{data.system_name}</td>
                            <td className="px-4 py-4 text-foreground">{data.station_name}</td>
                            <td className="px-4 py-4 text-right font-medium text-foreground">{data.total_duration.toFixed(2)}</td>
                            <td className="px-4 py-4 text-foreground/80">該站別下所有測項時間加總</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
