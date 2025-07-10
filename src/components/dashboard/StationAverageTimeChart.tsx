
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { supabase } from "@/integrations/supabase/client";

interface StationTimeData {
  station: string;
  stationOrder: number;
  averageHours: number;
  recordCount: number;
  estimatedHours: number;
  efficiency: number;
}

export function StationAverageTimeChart() {
  const [data, setData] = useState<StationTimeData[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStationTimeRecords();
  }, []);

  const loadStationTimeRecords = async () => {
    try {
      setIsLoading(true);
      
      // 載入站點資訊 - 動態載入所有站點
      const { data: stationsData, error: stationsError } = await supabase
        .from('test_flow_stations')
        .select('*')
        .order('station_order');

      if (stationsError) {
        console.error('Error loading stations:', stationsError);
        return;
      }

      setStations(stationsData || []);

      // 載入測試進度記錄，包含站點資訊
      let query = supabase
        .from('test_progress')
        .select(`
          *,
          test_flow_stations!inner(
            id,
            station_name,
            station_order,
            estimated_hours
          )
        `)
        .not('started_at', 'is', null)
        .not('completed_at', 'is', null);

      const { data: progressData, error } = await query;

      if (error) {
        console.error('Error loading progress data:', error);
        return;
      }

      if (!progressData || progressData.length === 0) {
        console.log('No completed progress records found');
        setData([]);
        return;
      }

      // 按站點分組並計算平均時間
      const stationGroups = progressData.reduce((acc, record) => {
        const station = record.test_flow_stations;
        if (!station) return acc;

        const stationKey = station.id;
        if (!acc[stationKey]) {
          acc[stationKey] = {
            station_name: station.station_name,
            station_order: station.station_order,
            estimated_hours: station.estimated_hours || 0,
            records: []
          };
        }

        // 計算實際處理時間（小時）
        const startTime = new Date(record.started_at);
        const endTime = new Date(record.completed_at);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);

        acc[stationKey].records.push(durationHours);
        return acc;
      }, {} as Record<string, {
        station_name: string;
        station_order: number;
        estimated_hours: number;
        records: number[];
      }>);

      // 計算每個站點的平均時間和效率
      const averages = Object.values(stationGroups).map(group => {
        const hours = group.records;
        const averageHours = hours.reduce((sum, h) => sum + h, 0) / hours.length;
        const estimatedHours = group.estimated_hours || 1;
        const efficiency = estimatedHours > 0 ? (estimatedHours / averageHours) * 100 : 0;

        return {
          station: group.station_name,
          stationOrder: group.station_order,
          averageHours: Math.round(averageHours * 100) / 100,
          recordCount: hours.length,
          estimatedHours,
          efficiency: Math.round(efficiency),
          total_records: hours.length
        };
      });

      // 排序：動態支援所有站點
      averages.sort((a, b) => a.stationOrder - b.stationOrder);

      setData(averages);
    } catch (error) {
      console.error('Error loading station time analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadStationTimeRecords();
  };

  // 準備圖表數據
  const chartData = data.map(item => ({
    ...item,
    name: item.station,
    值: item.averageHours,
    預估: item.estimatedHours,
    效率: item.efficiency
  }));

  const getBarColor = (efficiency: number) => {
    if (efficiency >= 90) return '#22c55e'; // green-500
    if (efficiency >= 70) return '#eab308'; // yellow-500
    return '#ef4444'; // red-500
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold">{label}</p>
          <p className="text-blue-600">
            平均處理時間: {data.averageHours} 小時
          </p>
          <p className="text-green-600">
            預估時間: {data.estimatedHours} 小時
          </p>
          <p className="text-purple-600">
            效率: {data.efficiency}%
          </p>
          <p className="text-gray-600">
            記錄數量: {data.recordCount} 筆
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
          各站平均處理時間分析 (包含所有測試站點)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-muted-foreground">
            {data.length > 0 ? `顯示 ${data.length} 個測試站點` : '暫無數據'}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            重新載入
          </Button>
        </div>

        <div className="space-y-6">
          {/* 圖表區域 */}
          {chartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis 
                    label={{ value: '處理時間 (小時)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="值" name="平均處理時間" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.效率)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
              <div className="text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">暫無處理時間數據</p>
                <p className="text-sm">完成測試項目後將顯示各站點平均處理時間</p>
              </div>
            </div>
          )}
        </div>

        {/* 統計摘要 - 動態顯示所有站點 */}
        {chartData.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">各站點處理時間統計</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {chartData.map((data, index) => (
                <div key={index} className="text-center p-4 bg-muted/30 rounded-lg border space-y-2">
                  <p className="font-medium text-sm">{data.station}</p>
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-blue-600">{data.averageHours}h</p>
                    <p className="text-xs text-muted-foreground">平均處理時間</p>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>預估: {data.estimatedHours}h</span>
                    <Badge 
                      variant={data.efficiency >= 90 ? "default" : data.efficiency >= 70 ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {data.efficiency}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{data.recordCount} 筆記錄</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 效率指標說明 */}
        <div className="mt-6 p-4 bg-muted/20 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">效率指標說明</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>高效率 (≥90%): 實際時間接近或優於預估</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span>中等效率 (70-89%): 略超過預估時間</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>低效率 (<70%): 大幅超過預估時間</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            效率 = (預估時間 / 實際时間) × 100%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
