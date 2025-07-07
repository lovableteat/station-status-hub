import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useCallback, useMemo } from "react";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  actual_completed_at?: string;
}

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
}

interface TestProgress {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status: string;
  progress_percent: number;
  notes: string;
  started_at?: string;
  completed_at?: string;
}

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
  const updateInProgress = useRef(false);
  
  // Handle validation errors
  const handleValidationError = (error: string | null) => {
    if (error) {
      toast({
        title: "時間設定錯誤",
        description: error,
        variant: "destructive"
      });
    }
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

  // **完全重寫：即時計算系統當前狀態**
  const calculateRealTimeSystemStatus = useCallback((systemId: string) => {
    console.log(`=== 即時計算系統 ${systemId} 狀態 ===`);
    
    // 只考慮 Station 0-4
    const targetStations = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    if (targetStations.length === 0) {
      console.log('沒有找到 Station 0-4');
      return '未開始';
    }
    
    let totalItems = 0;
    let completedItems = 0;
    let hasAnyStarted = false;
    
    // 檢查每個站點的所有測項
    for (const station of targetStations) {
      const stationItems = items.filter(item => item.station_id === station.id);
      
      for (const item of stationItems) {
        totalItems++;
        const itemProgress = getProgressForSystemItem(systemId, station.id, item.id);
        
        if (itemProgress) {
          // 任何非 'Not Start' 的狀態都算已開始
          if (itemProgress.status !== 'Not Start') {
            hasAnyStarted = true;
          }
          
          // 只有 'Done' 狀態才算完成
          if (itemProgress.status === 'Done') {
            completedItems++;
          }
        }
      }
    }
    
    console.log(`系統 ${systemId} - 總項目: ${totalItems}, 完成項目: ${completedItems}, 有開始: ${hasAnyStarted}`);
    
    // **嚴格的狀態判斷**
    let status: string;
    if (totalItems === 0) {
      status = '未開始';
    } else if (completedItems === totalItems && totalItems > 0) {
      // 只有當所有項目都完成時才是「已完成」
      status = '已完成';
    } else if (hasAnyStarted) {
      // 有任何項目開始但未全部完成就是「進行中」
      status = '進行中';
    } else {
      // 沒有任何項目開始就是「未開始」
      status = '未開始';
    }
    
    console.log(`系統 ${systemId} 最終狀態: ${status}`);
    return status;
  }, [filteredStations, items, getProgressForSystemItem]);

  // 使用 useMemo 確保狀態即時計算
  const systemStatuses = useMemo(() => {
    const statuses: Record<string, string> = {};
    filteredSystems.forEach(system => {
      statuses[system.id] = calculateRealTimeSystemStatus(system.id);
    });
    return statuses;
  }, [filteredSystems, calculateRealTimeSystemStatus, progress]); // 依賴 progress 確保即時更新

  // 獲取系統最晚完成時間
  const getSystemLatestCompletionTime = useCallback((systemId: string) => {
    const targetStations = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allCompletionTimes: string[] = [];
    
    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.completed_at) {
          allCompletionTimes.push(prog.completed_at);
        }
      });
    });
    
    if (allCompletionTimes.length === 0) return undefined;
    return allCompletionTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [filteredStations, items, getProgressForSystemItem]);

  // 獲取系統最早開始時間
  const getSystemEarliestStartTime = useCallback((systemId: string) => {
    const targetStations = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allStartTimes: string[] = [];
    
    targetStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.started_at) {
          allStartTimes.push(prog.started_at);
        }
      });
    });
    
    if (allStartTimes.length === 0) return undefined;
    return allStartTimes.sort()[0];
  }, [filteredStations, items, getProgressForSystemItem]);

  // **系統狀態自動更新邏輯 - 確保即時同步**
  useEffect(() => {
    if (updateInProgress.current) {
      return;
    }

    const updateSystemStatus = async () => {
      updateInProgress.current = true;
      console.log('=== 開始系統狀態自動更新 ===');

      try {
        const updates = [];
        
        for (const system of filteredSystems) {
          const calculatedStatus = systemStatuses[system.id];
          const isComplete = calculatedStatus === '已完成';
          const latestCompletionTime = getSystemLatestCompletionTime(system.id);
          
          console.log(`系統 ${system.system_name}:`);
          console.log(`- 資料庫狀態: "${system.current_station}"`);
          console.log(`- 即時計算狀態: "${calculatedStatus}"`);
          console.log(`- 是否完成: ${isComplete}`);
          
          let updatedFields: any = {};
          let needsUpdate = false;
          
          // 當前站點狀態更新
          if (system.current_station !== calculatedStatus) {
            updatedFields.current_station = calculatedStatus;
            needsUpdate = true;
            console.log(`需要更新當前站點: "${system.current_station}" → "${calculatedStatus}"`);
          }
          
          // 系統狀態更新
          const newStatus = calculatedStatus === '已完成' ? 'Done' : 
                           calculatedStatus === '未開始' ? 'Not Start' : 'On-going';
          if (system.status !== newStatus) {
            updatedFields.status = newStatus;
            needsUpdate = true;
            console.log(`需要更新狀態: "${system.status}" → "${newStatus}"`);
          }
          
          // 實際完成時間處理
          if (isComplete && latestCompletionTime) {
            if (!system.actual_completed_at) {
              updatedFields.actual_completed_at = latestCompletionTime;
              needsUpdate = true;
              console.log(`設定實際完成時間: ${latestCompletionTime}`);
            }
          } else if (!isComplete && system.actual_completed_at) {
            updatedFields.actual_completed_at = null;
            needsUpdate = true;
            console.log(`清除實際完成時間`);
          }
          
          if (needsUpdate) {
            updates.push({
              id: system.id,
              fields: updatedFields,
              name: system.system_name
            });
          }
        }
        
        // 執行批量更新
        if (updates.length > 0) {
          console.log(`執行 ${updates.length} 個系統更新...`);
          
          for (const update of updates) {
            try {
              const { error } = await supabase
                .from('test_systems')
                .update(update.fields)
                .eq('id', update.id);

              if (error) throw error;
              console.log(`成功更新系統 ${update.name}`);
            } catch (error) {
              console.error(`更新系統 ${update.name} 失敗:`, error);
            }
          }
          
          // 觸發資料重新載入
          onSystemUpdate();
        }
      } catch (error) {
        console.error('系統狀態更新錯誤:', error);
      } finally {
        updateInProgress.current = false;
      }
    };

    // 立即執行更新
    updateSystemStatus();
  }, [filteredSystems, systemStatuses, getSystemLatestCompletionTime, onSystemUpdate]);

  const updateSystemTime = async (systemId: string, timeType: 'start' | 'end', newTime: string | null) => {
    try {
      const systemProgressRecords = progress.filter(p => p.system_id === systemId);
      
      if (systemProgressRecords.length === 0) {
        toast({
          title: "無法更新",
          description: "該系統尚未有任何測試進度記錄",
          variant: "destructive"
        });
        return;
      }

      const updateColumn = timeType === 'start' ? 'started_at' : 'completed_at';
      
      const targetStationIds = filteredStations
        .filter(station => station.station_order >= 0 && station.station_order <= 4)
        .map(station => station.id);
      
      const { error } = await supabase
        .from('test_progress')
        .update({ [updateColumn]: newTime })
        .eq('system_id', systemId)
        .in('station_id', targetStationIds);

      if (error) throw error;
      
      await onSystemUpdate();
      
      toast({
        title: "更新成功",
        description: `系統${timeType === 'start' ? '開始' : '完成'}時間已更新（僅影響Station 0-4）`,
      });
    } catch (error) {
      console.error('Error updating system time:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統時間",
        variant: "destructive"
      });
    }
  };

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-4">
        {filteredSystems.map(system => {
          const currentStation = systemStatuses[system.id] || '未開始';
          
          return (
            <Card key={system.id} className="border-2">
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
                  <div className="flex gap-2">
                    <SystemEditDialog
                      systemId={system.id}
                      systemName={system.system_name}
                      assignedEngineer={system.assigned_engineer}
                      onUpdate={onSystemUpdate}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">當前站點:</span>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "px-3 py-1 rounded-full font-medium text-sm",
                        currentStation === '已完成' 
                          ? "bg-green-500 text-white" 
                          : currentStation === '進行中'
                          ? "bg-warning text-warning-foreground"
                          : "bg-gray-500 text-white"
                      )}
                    >
                      {currentStation}
                    </Badge>
                  </div>
                  
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-medium">預計開始時間:</span>
                    <div className="flex flex-col items-end">
                      <DateTimePicker
                        value={getSystemEarliestStartTime(system.id)}
                        onChange={async (newStartTime) => {
                          await updateSystemTime(system.id, 'start', newStartTime);
                        }}
                        onValidationError={handleValidationError}
                        placeholder="設定開始時間"
                        className="w-44"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-medium">預計完成時間:</span>
                    <div className="flex flex-col items-end">
                      <DateTimePicker
                        value={getSystemLatestCompletionTime(system.id)}
                        minDate={getSystemEarliestStartTime(system.id)}
                        onChange={async (newEndTime) => {
                          await updateSystemTime(system.id, 'end', newEndTime);
                        }}
                        onValidationError={handleValidationError}
                        placeholder="設定完成時間"
                        className="w-44"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-medium">實際完成時間:</span>
                    <div className="flex flex-col items-end">
                      <DateTimePicker
                        value={system.actual_completed_at || getSystemLatestCompletionTime(system.id)}
                        onChange={async (newActualTime) => {
                          try {
                            const { error } = await supabase
                              .from('test_systems')
                              .update({ actual_completed_at: newActualTime })
                              .eq('id', system.id);

                            if (error) throw error;
                            
                            await onSystemUpdate();
                            
                            toast({
                              title: "更新成功",
                              description: "實際完成時間已更新",
                            });
                          } catch (error) {
                            console.error('Error updating actual completion time:', error);
                            toast({
                              title: "更新失敗",
                              description: "無法更新實際完成時間",
                              variant: "destructive"
                            });
                          }
                        }}
                        onValidationError={handleValidationError}
                        placeholder="實際完成時間"
                        className="w-44"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                
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

                    return (
                      <div key={station.id} className="border rounded-lg p-4 bg-muted/20">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-base">{station.station_name}</h4>
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
                          />
                        </div>
                         <div className="space-y-2">
                           <div className="flex items-center justify-between text-sm">
                             <span className="font-medium">進度: {overallPercent}%</span>
                             <span className="text-muted-foreground">{completedItems.length}/{stationItems.length} 項目</span>
                          </div>
                          <Progress value={overallPercent} className="h-3" />
                          
                           {(() => {
                             const stationItems = items.filter(item => item.station_id === station.id);
                             const stationProgressRecords = stationItems.map(item => 
                               getProgressForSystemItem(system.id, station.id, item.id)
                             ).filter(Boolean);
                             
                             const startTimes = stationProgressRecords.map(p => p?.started_at).filter(Boolean);
                             const completionTimes = stationProgressRecords.map(p => p?.completed_at).filter(Boolean);
                             
                             const startTime = startTimes.length > 0 ? startTimes.sort()[0] : undefined;
                             const completionTime = completionTimes.length > 0 ? completionTimes.sort().reverse()[0] : undefined;
                             
                             if (!startTime && !completionTime) return null;
                             
                             return (
                               <div className="mt-3 pt-3 border-t space-y-2">
                                 <div className="flex justify-between items-center text-sm">
                                   <span className="text-muted-foreground">開始時間:</span>
                                   <span className="font-medium">{formatTime(startTime)}</span>
                                 </div>
                                 <div className="flex justify-between items-center text-sm">
                                   <span className="text-muted-foreground">完成時間:</span>
                                   <span className="font-medium">{formatTime(completionTime)}</span>
                                 </div>
                               </div>
                             );
                           })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Desktop table view
  const gridColumns = `120px 90px repeat(${filteredStations.length}, 130px) 160px 160px 140px`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>測試進度表</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Header Row */}
            <div className="grid gap-2 p-4 bg-muted/50 rounded-t-lg border-b" style={{ gridTemplateColumns: gridColumns }}>
              <div className="font-semibold">機台編號</div>
              <div className="font-semibold">當前站點</div>
              {filteredStations.map(station => (
                <div key={station.id} className="font-semibold text-center">
                  {station.station_name}
                </div>
              ))}
              <div className="font-semibold text-center text-sm">預計開始</div>
              <div className="font-semibold text-center text-sm">預計完成</div>
              <div className="font-semibold text-center text-sm">實際完成</div>
            </div>

            {/* Data Rows */}
            {filteredSystems.map(system => {
              const systemStartTime = getSystemEarliestStartTime(system.id);
              const systemEndTime = getSystemLatestCompletionTime(system.id);
              const currentStation = systemStatuses[system.id] || '未開始';

              return (
                <div key={system.id} className="grid gap-2 p-4 border-b hover:bg-muted/25" style={{ gridTemplateColumns: gridColumns }}>
                  <div className="flex items-center gap-2">
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
                    >
                      {system.system_name}
                    </button>
                    <SystemEditDialog
                      systemId={system.id}
                      systemName={system.system_name}
                      assignedEngineer={system.assigned_engineer}
                      onUpdate={onSystemUpdate}
                    />
                  </div>
                  <div>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "px-2 py-1 rounded-full font-medium text-xs",
                        currentStation === '已完成' 
                          ? "bg-green-500 text-white" 
                          : currentStation === '進行中'
                          ? "bg-warning text-warning-foreground"
                          : "bg-gray-500 text-white"
                      )}
                    >
                      {currentStation}
                    </Badge>
                  </div>
                  
                  {filteredStations.map(station => {
                    const stationItems = items.filter(item => item.station_id === station.id);
                    const completedItems = stationItems.filter(item => {
                      const prog = getProgressForSystemItem(system.id, station.id, item.id);
                      return prog?.status === 'Done';
                    });
                    const overallPercent = stationItems.length > 0 
                      ? Math.round((completedItems.length / stationItems.length) * 100) 
                      : 0;

                    return (
                      <div key={station.id}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
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
                            />
                          </div>
                          <Progress value={overallPercent} className="h-2" />
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* System Start Time Column */}
                  <div className="flex flex-col items-center py-2 px-1">
                    <label className="text-xs text-muted-foreground mb-1 font-medium">預計開始</label>
                    <DateTimePicker
                      value={systemStartTime}
                      onChange={async (newStartTime) => {
                        await updateSystemTime(system.id, 'start', newStartTime);
                      }}
                      maxDate={systemEndTime}
                      onValidationError={handleValidationError}
                      placeholder="設定開始時間"
                      className="w-full text-xs"
                    />
                  </div>
                  
                  {/* System End Time Column */}
                  <div className="flex flex-col items-center py-2 px-1">
                    <label className="text-xs text-muted-foreground mb-1 font-medium">預計完成</label>
                    <DateTimePicker
                      value={systemEndTime}
                      minDate={systemStartTime}
                      onChange={async (newEndTime) => {
                        await updateSystemTime(system.id, 'end', newEndTime);
                      }}
                      onValidationError={handleValidationError}
                      placeholder="設定完成時間"
                      className="w-full text-xs"
                    />
                  </div>
                  
                  {/* Actual Completion Time Column */}
                  <div className="flex flex-col items-center py-2 px-1">
                    <label className="text-xs text-muted-foreground mb-1 font-medium">實際完成</label>
                    <DateTimePicker
                      value={system.actual_completed_at || getSystemLatestCompletionTime(system.id)}
                      onChange={async (newActualTime) => {
                        try {
                          const { error } = await supabase
                            .from('test_systems')
                            .update({ actual_completed_at: newActualTime })
                            .eq('id', system.id);

                          if (error) throw error;
                          
                          await onSystemUpdate();
                          
                          toast({
                            title: "更新成功",
                            description: "實際完成時間已更新",
                          });
                        } catch (error) {
                          console.error('Error updating actual completion time:', error);
                          toast({
                            title: "更新失敗",
                            description: "無法更新實際完成時間",
                            variant: "destructive"
                          });
                        }
                      }}
                      onValidationError={handleValidationError}
                      placeholder="實際完成時間"
                      className="w-full text-xs"
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
