
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Edit, Clock } from "lucide-react";

export function TestProgressTable() {
  const { systems, stations, testItems, progress, isLoading } = useUnifiedData();
  const [editingProgress, setEditingProgress] = useState<any>(null);
  const [selectedSystem, setSelectedSystem] = useState<string>("");

  // 計算系統的總處理時長（基於實際測項處理時間）
  const calculateSystemTotalHours = (systemId: string) => {
    const systemProgress = progress.filter(p => p.system_id === systemId);
    return systemProgress.reduce((total, p) => {
      // 使用 actual_hours 如果存在，否則嘗試從時間戳計算
      if (p.actual_hours && p.actual_hours > 0) {
        return total + p.actual_hours;
      }
      
      const startTime = p.started_at ? new Date(p.started_at) : null;
      const endTime = p.completed_at ? new Date(p.completed_at) : null;
      
      if (startTime && endTime) {
        const diffMs = endTime.getTime() - startTime.getTime();
        const diffHours = Math.max(0, diffMs / (1000 * 60 * 60)); // 確保時間為正數
        return total + diffHours;
      }
      return total;
    }, 0);
  };

  // 格式化時間顯示
  const formatHours = (hours: number) => {
    if (hours === 0) return "0 小時";
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes} 分鐘`;
    }
    return `${hours.toFixed(1)} 小時`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'Not Start': { variant: 'secondary' as const, label: '未開始' },
      'On-going': { variant: 'default' as const, label: '進行中' },
      'Done': { variant: 'default' as const, label: '完成' },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['Not Start'];
    
    return (
      <Badge 
        variant={config.variant}
        className={status === 'Done' ? 'bg-green-100 text-green-800 border-green-200' : 
                  status === 'On-going' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
      >
        {config.label}
      </Badge>
    );
  };

  const handleEditProgress = (system: any, station: any, item: any) => {
    const existingProgress = progress.find(p => 
      p.system_id === system.id && 
      p.station_id === station.id && 
      p.item_id === item.id
    );

    setEditingProgress({
      system,
      station,
      item,
      progress: existingProgress
    });
  };

  if (isLoading) {
    return <div className="p-4">載入中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">測試進度表 - 手動計時版</h2>
      </div>

      <Tabs value={selectedSystem || systems[0]?.id || ""} onValueChange={setSelectedSystem}>
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 mb-4">
          {systems.map((system) => (
            <TabsTrigger key={system.id} value={system.id} className="text-sm">
              {system.system_name}
            </TabsTrigger>
          ))}
        </TabsList>

        {systems.map((system) => {
          const systemTotalHours = calculateSystemTotalHours(system.id);
          
          return (
            <TabsContent key={system.id} value={system.id}>
              <div className="space-y-4">
                {/* 系統總處理時長顯示 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5" />
                      {system.system_name} - 總處理時長
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatHours(systemTotalHours)}
                    </div>
                  </CardContent>
                </Card>

                {/* 各站點測試項目 */}
                <div className="grid gap-4">
                  {stations.map((station) => {
                    const stationItems = testItems.filter(item => item.station_id === station.id);
                    
                    if (stationItems.length === 0) return null;

                    return (
                      <Card key={station.id}>
                        <CardHeader>
                          <CardTitle className="text-lg">{station.station_name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="max-h-96">
                            <div className="space-y-3">
                              {stationItems.map((item) => {
                                const itemProgress = progress.find(p => 
                                  p.system_id === system.id && 
                                  p.station_id === station.id && 
                                  p.item_id === item.id
                                );

                                return (
                                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex-1">
                                      <div className="font-medium">{item.item_name}</div>
                                      {item.description && (
                                        <div className="text-sm text-muted-foreground mt-1">
                                          {item.description}
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center gap-3">
                                      {getStatusBadge(itemProgress?.status || 'Not Start')}
                                      
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEditProgress(system, station, item)}
                                        className="h-8 px-2"
                                      >
                                        <Edit className="h-3 w-3 mr-1" />
                                        編輯
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {editingProgress && (
        <ProgressEditDialog
          progress={editingProgress}
          onClose={() => setEditingProgress(null)}
        />
      )}
    </div>
  );
}
