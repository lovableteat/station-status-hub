import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useStationTimeAnalytics } from "@/hooks/useStationTimeAnalytics";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Calendar, Clock, Filter, TrendingUp, Target, Activity } from "lucide-react";

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

  // 準備圖表數據 - 顯示Station 0-4的實際平均處理時間
  const chartData = stations
    .filter(station => station.station_order >= 0 && station.station_order <= 4)
    .sort((a, b) => a.station_order - b.station_order)
    .map(station => {
      const actualData = averageTimes.find(item => item.station_name === station.station_name);
      const actualTime = actualData ? Number(actualData.average_hours.toFixed(2)) : 0;
      
      return {
        station: station.station_name,
        actualTime: actualTime,
        sampleCount: actualData?.total_records || 0,
        stationOrder: station.station_order
      };
    });

  // 計算統計數據
  const totalAverageTime = chartData.reduce((sum, data) => sum + data.actualTime, 0);
  const maxTime = Math.max(...chartData.map(data => data.actualTime));
  const minTime = Math.min(...chartData.filter(data => data.actualTime > 0).map(data => data.actualTime));

  // 顏色配置 - 根據處理時間長短分配顏色
  const getBarColor = (time: number, index: number) => {
    if (time === 0) return '#e5e7eb'; // 灰色 - 無數據
    if (time === maxTime) return '#ef4444'; // 紅色 - 最長時間
    if (time === minTime) return '#10b981'; // 綠色 - 最短時間
    return '#f59e0b'; // 黃色 - 中等時間
  };

  // 自訂 Tooltip 格式化
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-4 shadow-lg">
          <p className="font-semibold text-lg mb-2">{data.station}</p>
          <div className="space-y-1">
            <p className="text-primary font-medium">
              <Clock className="h-4 w-4 inline mr-1" />
              平均處理時間: {data.actualTime} 小時
            </p>
            <p className="text-sm text-muted-foreground">
              <Target className="h-4 w-4 inline mr-1" />
              樣本數: {data.sampleCount} 筆記錄
            </p>
            {data.actualTime > 0 && (
              <p className="text-xs text-muted-foreground">
                佔總時間比例: {((data.actualTime / totalAverageTime) * 100).toFixed(1)}%
              </p>
            )}
          </div>
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
          各站平均處理時間分析
          <span className="text-sm font-normal text-muted-foreground">
            (Station 0-4)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 篩選器區域 */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4" />
            <Label className="font-medium">時間範圍篩選</Label>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="filter-type">篩選依據</Label>
              <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual_completed">實際完成時間</SelectItem>
                  <SelectItem value="estimated_start">預計開始時間</SelectItem>
                  <SelectItem value="estimated_end">預計完成時間</SelectItem>
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
              <Button onClick={handleFilter} disabled={isLoading} className="flex-1">
                <Calendar className="h-4 w-4 mr-2" />
                {isLoading ? '載入中...' : '篩選'}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isLoading}>
                重設
              </Button>
            </div>
          </div>
        </div>

        {/* 統計摘要卡片 */}
        {chartData.length > 0 && totalAverageTime > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-blue-600 mb-1">總平均時間</p>
                <p className="text-2xl font-bold text-blue-700">{totalAverageTime.toFixed(1)}</p>
                <p className="text-xs text-blue-500">小時</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm text-green-600 mb-1">最短處理時間</p>
                <p className="text-2xl font-bold text-green-700">{minTime > 0 ? minTime.toFixed(1) : '0'}</p>
                <p className="text-xs text-green-500">小時</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <Target className="h-6 w-6 text-red-600 mx-auto mb-2" />
                <p className="text-sm text-red-600 mb-1">最長處理時間</p>
                <p className="text-2xl font-bold text-red-700">{maxTime.toFixed(1)}</p>
                <p className="text-xs text-red-500">小時</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <Activity className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-purple-600 mb-1">有效站點數</p>
                <p className="text-2xl font-bold text-purple-700">{chartData.filter(d => d.actualTime > 0).length}</p>
                <p className="text-xs text-purple-500">/ 5 站</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 圖表區域 - 優化的垂直長條圖 */}
        <div className="h-96 border rounded-lg bg-white p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2 text-muted-foreground">載入資料中...</span>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 30, left: 40, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="station"
                  tick={{ fontSize: 12, fill: '#666' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#666' }}
                  label={{ value: '處理時間 (小時)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="actualTime" 
                  radius={[6, 6, 0, 0]}
                  stroke="#000"
                  strokeWidth={1}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.actualTime, index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Clock className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">目前沒有可用的時間資料</p>
                <p className="text-sm mt-2">請確認有已完成的測試記錄且符合篩選條件</p>
              </div>
            </div>
          )}
        </div>

        {/* 詳細統計表格 */}
        {chartData.length > 0 && chartData.some(d => d.actualTime > 0) && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="h-5 w-5" />
              Station 0-4 詳細處理時間統計
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {chartData.map((data, index) => (
                <Card key={index} className={`text-center p-4 border-2 transition-all duration-300 hover:shadow-md ${
                  data.actualTime === 0 ? 'bg-gray-50 border-gray-200' :
                  data.actualTime === maxTime ? 'bg-red-50 border-red-200' :
                  data.actualTime === minTime ? 'bg-green-50 border-green-200' :
                  'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="space-y-2">
                    <p className="font-medium text-sm">{data.station}</p>
                    <p className={`text-3xl font-bold ${
                      data.actualTime === 0 ? 'text-gray-400' :
                      data.actualTime === maxTime ? 'text-red-600' :
                      data.actualTime === minTime ? 'text-green-600' :
                      'text-yellow-600'
                    }`}>
                      {data.actualTime}
                    </p>
                    <p className="text-xs text-muted-foreground">小時</p>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{data.sampleCount} 筆樣本</p>
                      {data.actualTime > 0 && totalAverageTime > 0 && (
                        <p className="text-xs text-muted-foreground">
                          佔比 {((data.actualTime / totalAverageTime) * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
