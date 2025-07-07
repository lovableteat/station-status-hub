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
import { useEffect } from "react";

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

  // Helper function to format time
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

  // Check if all stations 0-4 are 100% complete for a system
  const areAllStationsComplete = (systemId: string) => {
    const stations0To4 = filteredStations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.every(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return true;
      
      const completedItems = stationItems.filter(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        return prog?.status === 'Done';
      });
      return completedItems.length === stationItems.length;
    });
  };

  // Check if any progress exists for stations 0-4
  const hasAnyProgress = (systemId: string) => {
    const stations0To4 = filteredStations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.some(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      return stationItems.some(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        return prog?.status === 'Done';
      });
    });
  };

  // Get current station for a system (只顯示進行中、未開始、已完成)
  const getCurrentStation = (systemId: string) => {
    const allStationsComplete = areAllStationsComplete(systemId);
    const anyProgress = hasAnyProgress(systemId);
    
    if (allStationsComplete) {
      return '已完成';
    } else if (anyProgress) {
      return '進行中';
    } else {
      return '未開始';
    }
  };

  // Get latest completion time across stations 0-4 for a system
  const getSystemLatestCompletionTime = (systemId: string) => {
    const allCompletionTimes: string[] = [];
    
    // 只考慮 Station 0-4
    const stations0To4 = filteredStations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    
    stations0To4.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.completed_at) {
          allCompletionTimes.push(prog.completed_at);
        }
      });
    });
    
    if (allCompletionTimes.length === 0) return undefined;
    
    // 回傳最晚的完成時間
    return allCompletionTimes.sort().reverse()[0];
  };

  // Get earliest start time across stations 0-4 for a system
  const getSystemEarliestStartTime = (systemId: string) => {
    const allStartTimes: string[] = [];
    
    // 只考慮 Station 0-4
    const stations0To4 = filteredStations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    
    stations0To4.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.started_at) {
          allStartTimes.push(prog.started_at);
        }
      });
    });
    
    if (allStartTimes.length === 0) return undefined;
    
    // 回傳最早的開始時間
    return allStartTimes.sort()[0];
  };

  // Auto-update system status based on progress changes - Fixed version
  useEffect(() => {
    const updateSystemStatus = async () => {
      console.log('Starting system status update...');
      
      for (const system of filteredSystems) {
        const currentStation = getCurrentStation(system.id);
        const isComplete = areAllStationsComplete(system.id);
        
        let updatedFields: any = {};
        let needsUpdate = false;
        
        console.log(`System ${system.system_name}: DB current_station="${system.current_station}", calculated="${currentStation}"`);
        
        // 強制更新當前站點 - 主要修復點
        if (system.current_station !== currentStation) {
          updatedFields.current_station = currentStation;
          needsUpdate = true;
          console.log(`Will update system ${system.system_name} current_station from "${system.current_station}" to "${currentStation}"`);
        }
        
        // 更新狀態
        const newStatus = currentStation === '已完成' ? 'Done' : (currentStation === '未開始' ? 'Not Start' : 'On-going');
        if (system.status !== newStatus) {
          updatedFields.status = newStatus;
          needsUpdate = true;
          console.log(`Will update system ${system.system_name} status from "${system.status}" to "${newStatus}"`);
        }
        
        // 如果系統完成，設定實際完成時間
        if (isComplete) {
          const latestCompletionTime = getSystemLatestCompletionTime(system.id);
          if (latestCompletionTime && system.actual_completed_at !== latestCompletionTime) {
            updatedFields.actual_completed_at = latestCompletionTime;
            needsUpdate = true;
            console.log(`Will set actual completion time for ${system.system_name}`);
          }
        } else {
          // 如果系統不再完成狀態，但手動設定的時間不清除
          // 只有當實際完成時間等於自動計算的時間時才清除
          const autoCompletionTime = getSystemLatestCompletionTime(system.id);
          if (system.actual_completed_at && system.actual_completed_at === autoCompletionTime) {
            updatedFields.actual_completed_at = null;
            needsUpdate = true;
            console.log(`Will clear auto-set actual completion time for ${system.system_name}`);
          }
        }
        
        if (needsUpdate) {
          try {
            console.log(`Updating system ${system.system_name} with fields:`, updatedFields);
            const { error } = await supabase
              .from('test_systems')
              .update(updatedFields)
              .eq('id', system.id);

            if (error) {
              console.error(`Error updating system ${system.system_name}:`, error);
              throw error;
            }
            console.log(`Successfully updated system ${system.system_name}`);
          } catch (error) {
            console.error('Error updating system status:', error);
          }
        }
      }
      
      // 確保更新後立即重新載入資料
      console.log('Triggering data reload...');
      await onSystemUpdate();
    };

    // 立即執行更新
    updateSystemStatus();
  }, [filteredSystems, items, progress, onSystemUpdate, getProgressForSystemItem]);

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

      // 批量更新 - 更高效率
      const updateColumn = timeType === 'start' ? 'started_at' : 'completed_at';
      
      // 只更新Station 0-4的記錄
      const stations0To4Ids = filteredStations
        .filter(station => station.station_order >= 0 && station.station_order <= 4)
        .map(station => station.id);
      
      const { error } = await supabase
        .from('test_progress')
        .update({ [updateColumn]: newTime })
        .eq('system_id', systemId)
        .in('station_id', stations0To4Ids);

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
          const isSystemComplete = areAllStationsComplete(system.id);
          const currentStation = getCurrentStation(system.id);
          
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
                        maxDate={getSystemLatestCompletionTime(system.id)}
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
                        disabled={!getSystemEarliestStartTime(system.id)}
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

  // Desktop table view - Remove assigned engineer column
  const gridColumns = `120px 90px repeat(${filteredStations.length}, 130px) 160px 160px 140px`;

  // Desktop table view
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
              const currentStation = getCurrentStation(system.id);

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
