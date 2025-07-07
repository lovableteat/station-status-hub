
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
import { useEffect, useRef, useCallback } from "react";

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

  // 修正：基於Station 0-4的進度判斷系統是否完成
  const isSystemReallyComplete = useCallback((systemId: string) => {
    console.log(`=== 檢查系統 ${systemId} 是否真正完成 ===`);
    
    const stations0To4 = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    if (stations0To4.length === 0) {
      console.log('沒有找到Station 0-4');
      return false;
    }
    
    let totalItems = 0;
    let completedItems = 0;
    
    for (const station of stations0To4) {
      const stationItems = items.filter(item => item.station_id === station.id);
      totalItems += stationItems.length;
      
      for (const item of stationItems) {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.status === 'Done') {
          completedItems++;
        }
        console.log(`站點 ${station.station_name} - 項目 ${item.item_name}: ${prog?.status || 'None'}`);
      }
    }
    
    const isComplete = totalItems > 0 && completedItems === totalItems;
    console.log(`總項目: ${totalItems}, 完成項目: ${completedItems}, 是否完成: ${isComplete}`);
    
    return isComplete;
  }, [filteredStations, items, getProgressForSystemItem]);

  // 修正：檢查系統是否有任何進度
  const hasSystemAnyProgress = useCallback((systemId: string) => {
    const stations0To4 = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    return stations0To4.some(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      return stationItems.some(item => {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        return prog?.status === 'Done';
      });
    });
  }, [filteredStations, items, getProgressForSystemItem]);

  // 修正：基於Station 0-4進度狀態獲取系統當前狀態
  const getSystemCurrentStatus = useCallback((systemId: string) => {
    const stations0To4 = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    if (stations0To4.length === 0) return '未開始';
    
    let totalItems = 0;
    let completedItems = 0;
    let hasAnyProgress = false;
    
    // 統計Station 0-4的所有項目完成情況
    for (const station of stations0To4) {
      const stationItems = items.filter(item => item.station_id === station.id);
      totalItems += stationItems.length;
      
      for (const item of stationItems) {
        const prog = getProgressForSystemItem(systemId, station.id, item.id);
        if (prog?.status === 'Done') {
          completedItems++;
          hasAnyProgress = true;
        }
      }
    }
    
    console.log(`系統 ${systemId} 狀態檢查: 總項目=${totalItems}, 完成項目=${completedItems}, 有進度=${hasAnyProgress}`);
    
    // 根據進度判斷狀態
    if (totalItems === 0) return '未開始';
    if (completedItems === 0) return '未開始';
    if (completedItems === totalItems) return '已完成';
    return '進行中';
  }, [filteredStations, items, getProgressForSystemItem]);

  // 修正：獲取系統Station 0-4中所有完成時間的最晚時間作為實際完成時間
  const getSystemLatestCompletionTime = useCallback((systemId: string) => {
    const stations0To4 = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allCompletionTimes: string[] = [];
    
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
    // 返回最晚的完成時間
    return allCompletionTimes.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  }, [filteredStations, items, getProgressForSystemItem]);

  // 獲取系統最早開始時間
  const getSystemEarliestStartTime = useCallback((systemId: string) => {
    const stations0To4 = filteredStations.filter(station => 
      station.station_order >= 0 && station.station_order <= 4
    );
    
    const allStartTimes: string[] = [];
    
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
    return allStartTimes.sort()[0];
  }, [filteredStations, items, getProgressForSystemItem]);

  // 修正：系統狀態自動更新邏輯 - 每次Station測項更新時都要檢查並更新狀態
  useEffect(() => {
    if (updateInProgress.current) {
      console.log('更新進行中，跳過...');
      return;
    }

    const updateSystemStatus = async () => {
      updateInProgress.current = true;
      console.log('=== 開始系統狀態更新 ===');

      try {
        const updates = [];
        
        for (const system of filteredSystems) {
          const calculatedStatus = getSystemCurrentStatus(system.id);
          const isComplete = calculatedStatus === '已完成';
          const latestCompletionTime = getSystemLatestCompletionTime(system.id);
          
          console.log(`系統 ${system.system_name}:`);
          console.log(`- 資料庫當前站點: "${system.current_station}"`);
          console.log(`- 計算當前站點: "${calculatedStatus}"`);
          console.log(`- 是否完成: ${isComplete}`);
          console.log(`- Station 0-4最晚完成時間: ${latestCompletionTime}`);
          console.log(`- 目前實際完成時間: ${system.actual_completed_at}`);
          
          let updatedFields: any = {};
          let needsUpdate = false;
          
          // 修正：當前站點狀態更新 - 必須基於Station 0-4進度判斷
          if (system.current_station !== calculatedStatus) {
            updatedFields.current_station = calculatedStatus;
            needsUpdate = true;
            console.log(`需要更新當前站點: "${system.current_station}" → "${calculatedStatus}"`);
          }
          
          // 修正：系統狀態更新 - 對應當前站點狀態
          const newStatus = calculatedStatus === '已完成' ? 'Done' : 
                           calculatedStatus === '未開始' ? 'Not Start' : 'On-going';
          if (system.status !== newStatus) {
            updatedFields.status = newStatus;
            needsUpdate = true;
            console.log(`需要更新狀態: "${system.status}" → "${newStatus}"`);
          }
          
          // 修正：實際完成時間處理 - 自動取Station 0-4最晚完成時間，但保留手動調整彈性
          if (isComplete && latestCompletionTime) {
            // 如果系統完成且有完成時間，但沒有設定實際完成時間，則自動設定
            if (!system.actual_completed_at) {
              updatedFields.actual_completed_at = latestCompletionTime;
              needsUpdate = true;
              console.log(`系統首次完成，自動設定實際完成時間: ${latestCompletionTime}`);
            }
            // 如果已有實際完成時間，保留手動調整的彈性，不自動覆蓋
          } else if (!isComplete && system.actual_completed_at) {
            // 系統不再完成時清除實際完成時間
            updatedFields.actual_completed_at = null;
            needsUpdate = true;
            console.log(`系統不再完成，清除實際完成時間`);
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
              console.log(`更新系統 ${update.name}:`, update.fields);
              const { error } = await supabase
                .from('test_systems')
                .update(update.fields)
                .eq('id', update.id);

              if (error) {
                console.error(`更新系統 ${update.name} 失敗:`, error);
                throw error;
              }
              console.log(`成功更新系統 ${update.name}`);
            } catch (error) {
              console.error(`更新系統 ${update.name} 時發生錯誤:`, error);
            }
          }
          
          // 觸發資料重新載入
          console.log('觸發資料重新載入...');
          setTimeout(() => {
            onSystemUpdate();
          }, 100);
        } else {
          console.log('無需更新');
        }
      } catch (error) {
        console.error('系統狀態更新錯誤:', error);
      } finally {
        setTimeout(() => {
          updateInProgress.current = false;
          console.log('更新過程完成');
        }, 500);
      }
    };

    // 延遲執行以確保資料穩定
    const timeoutId = setTimeout(() => {
      updateSystemStatus();
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    filteredSystems,
    getSystemCurrentStatus,
    getSystemLatestCompletionTime,
    onSystemUpdate,
    progress // 確保進度變更時觸發更新
  ]);

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
          const currentStation = getSystemCurrentStatus(system.id);
          
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
              const currentStation = getSystemCurrentStatus(system.id);

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
