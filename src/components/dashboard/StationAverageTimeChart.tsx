
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useStationTimeAnalytics } from "@/hooks/useStationTimeAnalytics";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Calendar, Clock, Filter } from "lucide-react";

export function StationAverageTimeChart() {
  const { averageTimes, isLoading, loadStationTimeRecords } = useStationTimeAnalytics();
  const { stations } = useUnifiedData();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterType, setFilterType] = useState<'estimated_start' | 'estimated_end' | 'actual_completed'>('actual_completed');

  const handleFilter = () => {
    loadStationTimeRecords({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      filter_type: filterType
    });
  };

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setFilterType('actual_completed');
    loadStationTimeRecords();
  };

  // 準備圖表數據 - 動態顯示所有站點的實際平均處理時間
  const chartData = stations
    .sort((a, b) => a.station_order - b.station_order)
    .map(station => {
      const actualData = averageTimes.find(item => item.station_name === station.station_name);
      const actualTime = actualData ? Number(actualData.average_hours.toFixed(2)) : 0;
      
      return {
        station: station.station_name,
        actualTime: actualTime,
        sampleCount: actualData?.total_records || 0
      };
    });

  // 自訂 Tooltip 格式化
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.station}</p>
          <p className="text-primary">
            平均處理時間: {data.actualTime} 小時
          </p>
          <p className="text-xs text-muted-foreground">
            樣本數: {data.sampleCount} 筆
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
          <Clock className="h-5 w-5" />
          各站平均處理時間分析
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 篩選器區域 */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4" />
            <Label className="font-medium">時間篩選器</Label>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="filter-type">篩選依據</Label>
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual_completed">實際完成</SelectItem>
                  <SelectItem value="estimated_start">預計開始</SelectItem>
                  <SelectItem value="estimated_end">預計完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="start-date">開始日期</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="end-date">結束日期</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleFilter} disabled={isLoading}>
                <Calendar className="h-4 w-4 mr-2" />
                篩選
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isLoading}>
                重設
              </Button>
            </div>
          </div>
        </div>

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
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
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
              <h3 className="text-lg font-semibold mb-4">各站點處理時間統計</h3>
              <div className={`grid grid-cols-1 gap-4 ${chartData.length <= 3 ? 'md:grid-cols-3' : chartData.length <= 4 ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
                {chartData.map((data, index) => (
                  <div key={index} className="text-center p-4 bg-muted/30 rounded-lg border space-y-2">
                    <p className="font-medium text-sm">{data.station}</p>
                    <p className="text-2xl font-bold text-primary">{data.actualTime}</p>
                    <p className="text-xs text-muted-foreground">小時</p>
                    <p className="text-xs text-muted-foreground">{data.sampleCount} 筆樣本</p>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 詳細樣本數據表 */}
            <div>
              <h4 className="text-md font-semibold mb-3">樣本數據明細</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border border-border p-3 text-left">站點名稱</th>
                      <th className="border border-border p-3 text-right">平均處理時間 (小時)</th>
                      <th className="border border-border p-3 text-right">樣本數量</th>
                      <th className="border border-border p-3 text-right">總處理時間 (小時)</th>
                      <th className="border border-border p-3 text-left">效率評估</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((data, index) => {
                      const totalTime = (data.actualTime * data.sampleCount).toFixed(1);
                      const efficiency = data.actualTime <= 8 ? '良好' : data.actualTime <= 12 ? '正常' : '需改善';
                      const efficiencyColor = data.actualTime <= 8 ? 'text-success' : data.actualTime <= 12 ? 'text-warning' : 'text-destructive';
                      
                      return (
                        <tr key={index} className="hover:bg-muted/25">
                          <td className="border border-border p-3 font-medium">{data.station}</td>
                          <td className="border border-border p-3 text-right">{data.actualTime}</td>
                          <td className="border border-border p-3 text-right">{data.sampleCount}</td>
                          <td className="border border-border p-3 text-right">{totalTime}</td>
                          <td className={`border border-border p-3 font-medium ${efficiencyColor}`}>{efficiency}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
