
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MobileProgressInput } from "./MobileProgressInput";
import { MobileSystemCard } from "./MobileSystemCard";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { StationStatusSelector } from "./StationStatusSelector";
import { BulkResetDialog } from "./BulkResetDialog";
import { SystemManager, SystemDeleteButton } from "./SystemManager";
import { SystemCompleteButton } from "./SystemCompleteButton";
import { SystemResetDialog } from "./SystemResetDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { SystemStatusCalculator, TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";
import { SystemStatusUpdater } from "./SystemStatusUpdater";

interface TestProgressTableProps {
  filteredSystems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  editingProgress: string | null;
  setEditingProgress: (key: string | null) => void;
  editValues: {
    status: string;
    progress_percent: number;
    notes: string;
    started_at?: string;
    completed_at?: string;
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleDeleteProgress: (systemId: string, stationId: string, itemId: string) => void;
  getStatusColor: (status: string) => string;
  onSystemUpdate: () => void;
}

export function TestProgressTable({
  filteredSystems,
  stations,
  items,
  progress,
  editingProgress,
  setEditingProgress,
  editValues,
  setEditValues,
  getProgressForSystemItem,
  handleEditProgress,
  handleSaveProgress,
  handleDeleteProgress,
  getStatusColor,
  onSystemUpdate,
}: TestProgressTableProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // 檢查序號是否重複的函數
  const isDuplicateSerialNumber = (serialNumber: string, currentSystemId: string) => {
    if (!serialNumber) return false;
    return filteredSystems.some(system => 
      system.serial_number === serialNumber && system.id !== currentSystemId
    );
  };
  
  // Show all stations ordered by station_order
  const filteredStations = stations.sort((a, b) => a.station_order - b.station_order);

  // Format time helper
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
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
  const calculateProcessingTime = (systemId: string, stationId: string, itemId: string) => {
    const itemProgress = getProgressForSystemItem(systemId, stationId, itemId);
    if (!itemProgress?.started_at || !itemProgress?.completed_at) return null;
    
    const start = new Date(itemProgress.started_at);
    const end = new Date(itemProgress.completed_at);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    return diffHours;
  };

  // 手動計時的處理時間計算邏輯
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

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-4">
        <SystemStatusUpdater
          systems={filteredSystems}
          stations={stations}
          items={items}
          progress={progress}
            onSystemUpdate={() => onSystemUpdate()}
          />
        
        <div className="flex justify-between items-center">
          <SystemManager onSystemUpdate={onSystemUpdate} />
          <BulkResetDialog onReset={onSystemUpdate} />
        </div>
        
        {filteredSystems.map(system => (
          <MobileSystemCard
            key={system.id}
            system={system}
            stations={stations}
            items={items}
            progress={progress}
            getProgressForSystemItem={getProgressForSystemItem}
            getStatusColor={getStatusColor}
            onSystemUpdate={onSystemUpdate}
          />
        ))}
      </div>
    );
  }

  // Desktop table view
  const gridColumns = `140px 100px 100px repeat(${filteredStations.length}, 200px) 140px`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>測試進度表 - 手動計時版</CardTitle>
          <div className="flex gap-2">
            <SystemManager onSystemUpdate={onSystemUpdate} />
            <BulkResetDialog onReset={onSystemUpdate} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <SystemStatusUpdater
          systems={filteredSystems}
          stations={stations}
          items={items}
          progress={progress}
          onSystemUpdate={onSystemUpdate}
        />
        
        <div className="overflow-x-auto">
          <div className="min-w-[1400px]">
            {/* Header Row */}
            <div className="grid gap-2 p-3 bg-muted/50 rounded-t-lg border-b" style={{ gridTemplateColumns: gridColumns }}>
              <div className="font-semibold">機台編號</div>
              <div className="font-semibold">序號</div>
              <div className="font-semibold">當前站點</div>
              {filteredStations.map(station => (
                <div key={station.id} className="font-semibold text-center">
                  {station.station_name}
                </div>
              ))}
              <div className="font-semibold">操作</div>
            </div>

            {/* Data Rows */}
            {filteredSystems.map(system => {
              return (
                <div key={system.id} className="grid gap-2 p-3 border-b hover:bg-muted/25" style={{ gridTemplateColumns: gridColumns }}>
                  <div className="flex items-center">
                    <button 
                      className="font-medium text-primary hover:underline cursor-pointer text-left text-sm"
                      onClick={() => {
                        const currentUrl = new URL(window.location.href);
                        currentUrl.searchParams.set('system', system.system_name);
                        window.history.pushState({}, '', currentUrl.toString());
                        
                        const event = new CustomEvent('navigate', { 
                          detail: { module: 'monitor', params: { system: system.system_name } } 
                        });
                        window.dispatchEvent(event);
                      }}
                      title={system.system_name}
                    >
                      {system.system_name}
                    </button>
                  </div>
                  <div className={cn(
                    "flex items-center text-sm",
                    system.serial_number && isDuplicateSerialNumber(system.serial_number, system.id)
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  )}>
                    {system.serial_number || '-'}
                  </div>
                  <div>
                    <StationStatusSelector
                      systemId={system.id}
                      currentStatus={system.current_station || '未開始'}
                      onUpdate={onSystemUpdate}
                    />
                  </div>
                  
                  {filteredStations.map(station => {
                    const stationItems = items.filter(item => item.station_id === station.id);
                    const completedItems = stationItems.filter(item => {
                      const prog = getProgressForSystemItem(system.id, station.id, item.id);
                      return prog?.status === 'Done';
                    });
                    
                    // 使用與SystemStatusCalculator一致的計算邏輯
                    let overallPercent = 0;
                    if (stationItems.length > 0) {
                      overallPercent = Math.round((completedItems.length / stationItems.length) * 100);
                    }
                    
                    // 如果系統整體狀態為已完成，且這是目標站點(Station 0-3)，則顯示100%
                    if (system.status === '已完成' && station.station_order >= 1 && station.station_order <= 4) {
                      overallPercent = 100;
                    }

                    const processingTime = calculateManualProcessingTime(system.id, station.id);

                    return (
                      <div key={station.id} className="px-1">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span>進度: {overallPercent}%</span>
                            <ProgressEditDialog
                              systemName={system.system_name}
                              stationName={station.station_name}
                              stationItems={stationItems}
                              progress={progress}
                              editingProgress={editingProgress}
                              setEditingProgress={setEditingProgress}
                              editValues={editValues}
                              setEditValues={setEditValues}
                              getProgressForSystemItem={getProgressForSystemItem}
                              handleEditProgress={handleEditProgress}
                              handleSaveProgress={handleSaveProgress}
                              handleDeleteProgress={handleDeleteProgress}
                              getStatusColor={getStatusColor}
                              systemId={system.id}
                              stationId={station.id}
                              onTimeUpdate={onSystemUpdate}
                            />
                          </div>
                          <Progress value={overallPercent} className="h-2" />
                          
                           {/* 只顯示總時長，不顯示個別測項時長 */}
                           
                            {processingTime && (
                              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-1">
                                <div>總時長: {processingTime.totalHours} h</div>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                  
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
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
