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

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
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
  
  // Filter stations to only show Station 0-3
  const filteredStations = stations.filter(station => 
    station.station_order >= 0 && station.station_order <= 3
  );

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

  // Helper function to format datetime for input field
  const formatDateTimeLocal = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      return date.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  // Optimized function to update system start/end times
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

      // Batch update - more efficient
      const updateColumn = timeType === 'start' ? 'started_at' : 'completed_at';
      const { error } = await supabase
        .from('test_progress')
        .update({ [updateColumn]: newTime })
        .eq('system_id', systemId);

      if (error) throw error;
      
      await onSystemUpdate();
      
      toast({
        title: "更新成功",
        description: `系統${timeType === 'start' ? '開始' : '完成'}時間已更新`,
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
        {filteredSystems.map(system => (
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
                  <span className="text-sm text-muted-foreground">負責人:</span>
                  <SystemEditDialog
                    systemId={system.id}
                    systemName={system.system_name}
                    assignedEngineer={system.assigned_engineer}
                    onUpdate={onSystemUpdate}
                    variant="button"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">當前站點:</span>
                  <Badge 
                    variant="secondary" 
                    className="bg-warning text-warning-foreground px-3 py-1 rounded-full font-medium text-sm"
                  >
                    {system.current_station?.split(' - ')[0] || system.current_station}
                  </Badge>
                </div>
                
                {/* System-wide Start and End Time for Mobile - Enhanced UX */}
                <div className="flex items-center justify-between border-t pt-2 mt-2">
                  <span className="text-sm text-muted-foreground font-medium">系統開始時間:</span>
                  <div className="flex flex-col items-end">
                    <DateTimePicker
                      value={(() => {
                        const allProgressRecords = filteredStations.flatMap(station => {
                          const stationItems = items.filter(item => item.station_id === station.id);
                          return stationItems.map(item => 
                            getProgressForSystemItem(system.id, station.id, item.id)
                          ).filter(Boolean);
                        });
                        const allStartTimes = allProgressRecords.map(p => p.started_at).filter(Boolean);
                        return allStartTimes.length > 0 ? allStartTimes.sort()[0] : undefined;
                      })()}
                      onChange={async (newStartTime) => {
                        await updateSystemTime(system.id, 'start', newStartTime);
                      }}
                      maxDate={(() => {
                        const allProgressRecords = filteredStations.flatMap(station => {
                          const stationItems = items.filter(item => item.station_id === station.id);
                          return stationItems.map(item => 
                            getProgressForSystemItem(system.id, station.id, item.id)
                          ).filter(Boolean);
                        });
                        const allEndTimes = allProgressRecords.map(p => p.completed_at).filter(Boolean);
                        return allEndTimes.length > 0 ? allEndTimes.sort().reverse()[0] : undefined;
                      })()}
                      onValidationError={handleValidationError}
                      placeholder="設定開始時間"
                      className="w-44"
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-medium">系統完成時間:</span>
                  <div className="flex flex-col items-end">
                    <DateTimePicker
                      value={(() => {
                        const allProgressRecords = filteredStations.flatMap(station => {
                          const stationItems = items.filter(item => item.station_id === station.id);
                          return stationItems.map(item => 
                            getProgressForSystemItem(system.id, station.id, item.id)
                          ).filter(Boolean);
                        });
                        const allEndTimes = allProgressRecords.map(p => p.completed_at).filter(Boolean);
                        return allEndTimes.length > 0 ? allEndTimes.sort().reverse()[0] : undefined;
                      })()}
                      minDate={(() => {
                        const allProgressRecords = filteredStations.flatMap(station => {
                          const stationItems = items.filter(item => item.station_id === station.id);
                          return stationItems.map(item => 
                            getProgressForSystemItem(system.id, station.id, item.id)
                          ).filter(Boolean);
                        });
                        const allStartTimes = allProgressRecords.map(p => p.started_at).filter(Boolean);
                        return allStartTimes.length > 0 ? allStartTimes.sort()[0] : undefined;
                      })()}
                      onChange={async (newEndTime) => {
                        await updateSystemTime(system.id, 'end', newEndTime);
                      }}
                      onValidationError={handleValidationError}
                      placeholder="設定完成時間"
                      disabled={(() => {
                        const allProgressRecords = filteredStations.flatMap(station => {
                          const stationItems = items.filter(item => item.station_id === station.id);
                          return stationItems.map(item => 
                            getProgressForSystemItem(system.id, station.id, item.id)
                          ).filter(Boolean);
                        });
                        const allStartTimes = allProgressRecords.map(p => p.started_at).filter(Boolean);
                        return allStartTimes.length === 0;
                      })()}
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
                        
                         {/* Show time info for all stations in mobile view */}
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
        ))}
      </div>
    );
  }

  // Use fixed widths for better alignment
  const gridColumns = `200px 120px 120px repeat(${filteredStations.length}, 150px) 160px 160px`;

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
              <div className="font-semibold">負責人</div>
              <div className="font-semibold">當前站點</div>
              {filteredStations.map(station => (
                <div key={station.id} className="font-semibold text-center">
                  {station.station_name}
                </div>
              ))}
              <div className="font-semibold text-center text-sm">開始時間</div>
              <div className="font-semibold text-center text-sm">完成時間</div>
            </div>

            {/* Data Rows */}
            {filteredSystems.map(system => {
              // Calculate overall start and end times for this system across all stations
              const allProgressRecords = filteredStations.flatMap(station => {
                const stationItems = items.filter(item => item.station_id === station.id);
                return stationItems.map(item => 
                  getProgressForSystemItem(system.id, station.id, item.id)
                ).filter(Boolean);
              });
              
              const allStartTimes = allProgressRecords.map(p => p.started_at).filter(Boolean);
              const allEndTimes = allProgressRecords.map(p => p.completed_at).filter(Boolean);
              
              const systemStartTime = allStartTimes.length > 0 ? allStartTimes.sort()[0] : undefined;
              const systemEndTime = allEndTimes.length > 0 ? allEndTimes.sort().reverse()[0] : undefined;

              return (
                <div key={system.id} className="grid gap-2 p-4 border-b hover:bg-muted/25" style={{ gridTemplateColumns: gridColumns }}>
                  <div className="flex items-center gap-2">
                    <button 
                      className="font-medium text-primary hover:underline cursor-pointer text-left"
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
                    <SystemEditDialog
                      systemId={system.id}
                      systemName={system.system_name}
                      assignedEngineer={system.assigned_engineer}
                      onUpdate={onSystemUpdate}
                      variant="button"
                    />
                  </div>
                  <div>
                    <Badge 
                      variant="secondary" 
                      className="bg-warning text-warning-foreground px-3 py-1 rounded-full font-medium"
                    >
                      {system.current_station?.split(' - ')[0] || system.current_station}
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
                  
                  {/* System Start Time Column - Editable with better UX */}
                  <div className="flex flex-col items-center py-2 px-1">
                    <label className="text-xs text-muted-foreground mb-1 font-medium">開始時間</label>
                    <DateTimePicker
                      value={systemStartTime}
                      onChange={async (newStartTime) => {
                        await updateSystemTime(system.id, 'start', newStartTime);
                      }}
                      maxDate={systemEndTime}
                      onValidationError={handleValidationError}
                      placeholder="設定開始時間"
                      className="w-full"
                    />
                  </div>
                  
                  {/* System End Time Column - Editable with better UX */}
                  <div className="flex flex-col items-center py-2 px-1">
                    <label className="text-xs text-muted-foreground mb-1 font-medium">完成時間</label>
                    <DateTimePicker
                      value={systemEndTime}
                      minDate={systemStartTime}
                      onChange={async (newEndTime) => {
                        await updateSystemTime(system.id, 'end', newEndTime);
                      }}
                      onValidationError={handleValidationError}
                      placeholder="設定完成時間"
                      disabled={!systemStartTime}
                      className="w-full"
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