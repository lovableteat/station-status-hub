
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStationTimeAnalytics } from "@/hooks/useStationTimeAnalytics";
import { Calendar, Clock, Filter } from "lucide-react";

export function StationAverageTimeChart() {
  const { averageTimes, isLoading, loadStationTimeRecords } = useStationTimeAnalytics();
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

  // 格式化數據用於圖表顯示
  const chartData = averageTimes.map(item => ({
    station: item.station_name,
    average_hours: Number(item.average_hours.toFixed(2)),
    total_records: item.total_records
  }));

  // 自訂 Tooltip 格式化
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{label}</p>
          <p className="text-primary">
            平均處理時間: {data.average_hours} 小時
          </p>
          <p className="text-muted-foreground text-sm">
            樣本數量: {data.total_records} 筆記錄
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

        {/* 圖表區域 - 修改為橫向顯示 */}
        <div className="h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                layout="horizontalBar"
                margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number"
                  tick={{ fontSize: 12 }}
                  label={{ value: '平均時間 (小時)', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  type="category"
                  dataKey="station"
                  tick={{ fontSize: 12 }}
                  width={70}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar 
                  dataKey="average_hours" 
                  fill="hsl(var(--primary))" 
                  name="平均處理時間 (小時)"
                  radius={[0, 4, 4, 0]}
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

        {/* 統計摘要 */}
        {chartData.length > 0 && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {chartData.map((item, index) => (
              <div key={index} className="text-center p-3 bg-muted/30 rounded">
                <p className="font-medium text-sm">{item.station}</p>
                <p className="text-lg font-bold text-primary">{item.average_hours}h</p>
                <p className="text-xs text-muted-foreground">{item.total_records} 筆樣本</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
