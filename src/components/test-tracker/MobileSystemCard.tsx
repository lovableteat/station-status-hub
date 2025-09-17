import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemResetDialog } from "./SystemResetDialog";
import { SystemDeleteButton } from "./SystemManager";
import { SystemCompleteButton } from "./SystemCompleteButton";
import { StationStatusSelector } from "./StationStatusSelector";
import { MobileProgressInput } from "./MobileProgressInput";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Edit } from "lucide-react";
import { useState } from "react";

interface MobileSystemCardProps {
  system: TestSystem;
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  getStatusColor: (status: string) => string;
  onSystemUpdate: (newSystemId?: string) => void;
}

export function MobileSystemCard({
  system,
  stations,
  items,
  progress,
  getProgressForSystemItem,
  getStatusColor,
  onSystemUpdate
}: MobileSystemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const filteredStations = stations.sort((a, b) => a.station_order - b.station_order);

  // Format time helper
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  // 計算處理時長的輔助函數
  const calculateManualProcessingTime = (systemId: string, stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const stationProgressRecords = stationItems.map(item => 
      getProgressForSystemItem(systemId, stationId, item.id)
    ).filter(Boolean);
    
    // 找出所有已完成測項的處理時間
    const completedItems = stationProgressRecords.filter(p => 
      p?.started_at && p?.completed_at && p?.status === 'Done'
    );
    
    if (completedItems.length === 0) return null;
    
    // 計算每個測項的處理時間並求和
    let totalHours = 0;
    completedItems.forEach(item => {
      if (item.started_at && item.completed_at) {
        const start = new Date(item.started_at);
        const end = new Date(item.completed_at);
        const diffMs = end.getTime() - start.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        totalHours += diffHours;
      }
    });
    
    const avgHours = Math.round((totalHours / completedItems.length) * 10) / 10;
    
    // 找出最早開始時間和最晚結束時間作為站點時間範圍
    const allStartTimes = completedItems
      .map(p => new Date(p.started_at!))
      .sort((a, b) => a.getTime() - b.getTime());
    
    const allEndTimes = completedItems
      .map(p => new Date(p.completed_at!))
      .sort((a, b) => b.getTime() - a.getTime());
    
    return {
      startTime: allStartTimes[0],
      endTime: allEndTimes[0],
      totalHours: Math.round(totalHours * 10) / 10,
      averageHours: avgHours,
      completedItemsCount: completedItems.length
    };
  };

  return (
    <Card className="border-2 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold">
            <button 
              className="text-primary hover:underline cursor-pointer text-left"
              onClick={() => {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('system', system.system_name);
                window.history.pushState({}, '', currentUrl.toString());
                
                const event = new CustomEvent('navigate', { 
                  detail: { module: 'monitor', params: { system: system.system_name } } 
                });
                window.dispatchEvent(event);
              }}
            >
              {system.system_name}
            </button>
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            <SystemCompleteButton
              systemId={system.id}
              systemName={system.system_name}
              stations={stations}
              items={items}
              onSystemUpdate={onSystemUpdate}
            />
            <SystemEditDialog
              systemId={system.id}
              systemName={system.system_name}
              assignedEngineer={system.assigned_engineer}
              onUpdate={onSystemUpdate}
            />
            <SystemResetDialog
              systemId={system.id}
              systemName={system.system_name}
              onReset={onSystemUpdate}
            />
            <SystemDeleteButton
              systemId={system.id}
              systemName={system.system_name}
              onSystemUpdate={onSystemUpdate}
            />
          </div>
        </div>
        
        {/* 基本信息卡片 */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div className="bg-muted/30 rounded p-2">
            <span className="text-muted-foreground">型號:</span>
            <div className="font-medium">{system.model || '未設定'}</div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <span className="text-muted-foreground">序號:</span>
            <div className="font-medium">{system.serial_number || '未設定'}</div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <span className="text-muted-foreground">90BOM:</span>
            <div className="font-medium">{(system as any).bom_90 || '未設定'}</div>
          </div>
          <div className="bg-muted/30 rounded p-2">
            <span className="text-muted-foreground">工程師:</span>
            <div className="font-medium">{system.assigned_engineer}</div>
          </div>
        </div>

        {/* 當前站點選擇器 */}
        <div className="flex items-center justify-between mt-3 p-2 bg-primary/5 rounded">
          <span className="text-sm font-medium">當前站點:</span>
          <StationStatusSelector
            systemId={system.id}
            currentStatus={system.current_station || '未開始'}
            onUpdate={onSystemUpdate}
          />
        </div>

        {/* 整體進度 */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">整體進度:</span>
            <span className="font-bold text-primary">{system.overall_progress}%</span>
          </div>
          <Progress value={system.overall_progress} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full">
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  收起站點詳情
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  展開站點詳情
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-4">
            <div className="space-y-4">
              {filteredStations.map(station => {
                const stationItems = items.filter(item => item.station_id === station.id);
                const completedItems = stationItems.filter(item => {
                  const prog = getProgressForSystemItem(system.id, station.id, item.id);
                  return prog?.status === 'Done';
                });
                const overallPercent = stationItems.length > 0 
                  ? Math.round((completedItems.length / stationItems.length) * 100) 
                  : 0;

                const processingTime = calculateManualProcessingTime(system.id, station.id);

                return (
                  <div key={station.id} className="border rounded-lg p-3 bg-muted/10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-base">{station.station_name}</h4>
                      <div className="flex gap-1">
                        <MobileProgressInput
                          systemId={system.id}
                          systemName={system.system_name}
                          stationId={station.id}
                          stationName={station.station_name}
                          items={items}
                          getProgressForSystemItem={getProgressForSystemItem}
                          getStatusColor={getStatusColor}
                          onUpdate={onSystemUpdate}
                        />
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // 使用 location.hash 來模擬路由切換
                            window.location.hash = `#/test-tracker?system=${encodeURIComponent(system.system_name)}&station=${encodeURIComponent(station.station_name)}&action=edit`;
                          }}
                          className="touch-manipulation min-h-[44px] px-3"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          編輯
                        </Button>
                      </div>
                    </div>
                   
                   {/* 站點進度摘要 */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      <div className="bg-white/50 rounded p-2">
                        <span className="text-muted-foreground">進度:</span>
                        <div className="font-medium text-primary">{overallPercent}%</div>
                      </div>
                      <div className="bg-white/50 rounded p-2">
                        <span className="text-muted-foreground">總時長:</span>
                        <div className="font-medium">
                          {processingTime ? `${processingTime.totalHours} h` : '0 h'}
                        </div>
                      </div>
                    </div>

                    {/* 測試項目狀態 */}
                    <div className="space-y-1 mb-3">
                      {stationItems.slice(0, 3).map(item => {
                        const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                        
                        return (
                          <div key={item.id} className="flex items-center justify-between text-xs bg-white/30 rounded p-1.5">
                            <span className="font-medium truncate">{item.item_name}</span>
                            {itemProgress?.status && (
                              <Badge variant="outline" className={`${getStatusColor(itemProgress.status)} text-xs`}>
                                {itemProgress.status}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                      {stationItems.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center py-1">
                          ... 還有 {stationItems.length - 3} 個測試項目
                        </div>
                      )}
                    </div>
                    
                    <Progress value={overallPercent} className="h-2" />
                    
                    {processingTime && (
                      <div className="mt-3 pt-2 border-t border-border/50">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">開始:</span>
                            <div className="font-medium">{formatTime(processingTime.startTime.toISOString())}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">完成:</span>
                            <div className="font-medium">{formatTime(processingTime.endTime.toISOString())}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}