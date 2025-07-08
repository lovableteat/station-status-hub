
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

  // 準備圖表數據 - 改為平面結構
  const chartData = stations
    .sort((a, b) => a.station_order - b.station_order)
    .flatMap(station => {
      const actualData = averageTimes.find(item => item.station_name === station.station_name);
      const estimatedTime = Number(station.estimated_hours || 0);
      const actualTime = actualData ? Number(actualData.average_hours.toFixed(2)) : 0;
      
      return [
        {
          station: station.station_name,
          type: '預計時間',
          value: estimatedTime,
          color: '#3b82f6'
        },
        {
          station: station.station_name,
          type: '實際時間',
          value: actualTime,
          color: '#10b981'
        }
      ];
    });

  // 自訂 Tooltip 格式化
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.station}</p>
          <p style={{ color: data.color }}>
            {data.type}: {data.value} 小時
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
          各站處理時間比較分析（預計 vs 實際）
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

        {/* 圖表區域 - 平面橫條圖 */}
        <div className="h-96">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                layout="horizontal"
                margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number"
                  tick={{ fontSize: 12 }}
                  label={{ value: '時間 (小時)', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  type="category"
                  dataKey="station"
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="value" 
                  fill={(entry: any) => entry.color}
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
        {stations.length > 0 && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stations
              .sort((a, b) => a.station_order - b.station_order)
              .map((station, index) => {
                const actualData = averageTimes.find(item => item.station_name === station.station_name);
                const estimatedTime = Number(station.estimated_hours || 0);
                const actualTime = actualData ? Number(actualData.average_hours.toFixed(2)) : 0;
                const efficiency = actualData && station.estimated_hours 
                  ? Number(((station.estimated_hours / actualData.average_hours) * 100).toFixed(1))
                  : 0;
                
                return (
                  <div key={index} className="text-center p-3 bg-muted/30 rounded space-y-1">
                    <p className="font-medium text-sm">{station.station_name}</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-600">預計: {estimatedTime}h</span>
                      <span className="text-green-600">實際: {actualTime}h</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{actualData?.total_records || 0} 筆樣本</p>
                    {efficiency > 0 && (
                      <p className="text-xs font-medium">
                        效率: {efficiency}%
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
