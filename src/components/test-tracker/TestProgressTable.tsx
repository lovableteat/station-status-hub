import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { BulkResetDialog } from "./BulkResetDialog";
import { SystemManager, SystemDeleteButton } from "./SystemManager";
import { SystemResetDialog } from "./SystemResetDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { SystemStatusUpdater } from "./SystemStatusUpdater";
import { ChevronDown, ChevronRight, Clock, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
  actual_started_at?: string;
  actual_completed_at?: string;
}

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
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
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());
  
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

  // 計算站點處理時長
  const calculateStationProcessingTime = (systemId: string, stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const stationProgressRecords = stationItems.map(item => 
      getProgressForSystemItem(systemId, stationId, item.id)
    ).filter(Boolean);
    
    const allStartTimes = stationProgressRecords
      .map(p => p?.started_at)
      .filter(Boolean)
      .map(time => new Date(time));
    
    const allEndTimes = stationProgressRecords
      .map(p => p?.completed_at)
      .filter(Boolean)
      .map(time => new Date(time));
    
    if (allStartTimes.length === 0 || allEndTimes.length === 0) return null;
    
    const stationStartTime = new Date(Math.min(...allStartTimes.map(t => t.getTime())));
    const stationEndTime = new Date(Math.max(...allEndTimes.map(t => t.getTime())));
    
    const diffMs = stationEndTime.getTime() - stationStartTime.getTime();
    const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    
    return {
      startTime: stationStartTime,
      endTime: stationEndTime,
      duration: diffHours
    };
  };

  const toggleStationExpanded = (systemId: string, stationId: string) => {
    const key = `${systemId}-${stationId}`;
    const newExpanded = new Set(expandedStations);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedStations(newExpanded);
  };

  const getSystemDisplayInfo = (system: TestSystem) => {
    const parts = [];
    if (system.system_name) parts.push(system.system_name);
    if (system.model) parts.push(`型號: ${system.model}`);
    if (system.serial_number) parts.push(`序列號: ${system.serial_number}`);
    return parts.join(' | ');
  };

  const handleSystemClick = (systemName: string) => {
    // 導航到生產監控頁面
    window.open(`/production/${systemName}`, '_blank');
  };

  if (isMobile) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-card-foreground">測試進度表</CardTitle>
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
          
          <div className="space-y-4">
            {filteredSystems.map((system) => (
              <Card key={system.id} className="border-border bg-muted/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <CardTitle className="text-lg text-card-foreground cursor-pointer hover:text-primary"
                                   onClick={() => handleSystemClick(system.system_name)}>
                          <div className="flex items-center gap-2">
                            {getSystemDisplayInfo(system)}
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </CardTitle>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span>整體進度: {system.overall_progress}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                </CardHeader>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Desktop view - 改進的表格樣式
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-card-foreground">測試進度表</CardTitle>
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-card-foreground min-w-[200px]">機台資訊</th>
                <th className="text-left p-3 font-medium text-card-foreground min-w-[120px]">整體進度</th>
                {filteredStations.map((station) => (
                  <th key={station.id} className="text-center p-3 font-medium text-card-foreground min-w-[150px]">
                    {station.station_name}
                  </th>
                ))}
                <th className="text-left p-3 font-medium text-card-foreground min-w-[150px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredSystems.map((system) => (
                <tr key={system.id} className="border-b border-border hover:bg-muted/5">
                  <td className="p-3">
                    <div className="font-medium text-card-foreground cursor-pointer hover:text-primary"
                         onClick={() => handleSystemClick(system.system_name)}>
                      <div className="flex items-center gap-2">
                        {getSystemDisplayInfo(system)}
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Progress value={system.overall_progress} className="flex-1 h-2" />
                      <span className="text-sm font-medium text-card-foreground min-w-[40px]">{system.overall_progress}%</span>
                    </div>
                  </td>
                  {filteredStations.map((station) => {
                    const stationItems = items.filter(item => item.station_id === station.id);
                    const completedItems = stationItems.filter(item => {
                      const prog = getProgressForSystemItem(system.id, station.id, item.id);
                      return prog?.status === 'Done';
                    });
                    const overallPercent = stationItems.length > 0 
                      ? Math.round((completedItems.length / stationItems.length) * 100) 
                      : 0;

                    const processingTime = calculateStationProcessingTime(system.id, station.id);
                    const stationKey = `${system.id}-${station.id}`;

                    return (
                      <td key={station.id} className="p-3 text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <div className="cursor-pointer hover:bg-muted/10 p-2 rounded-lg transition-colors">
                              <div className="flex items-center justify-center gap-2 mb-2">
                                <span className="text-sm font-medium text-card-foreground">{overallPercent}%</span>
                              </div>
                              <Progress value={overallPercent} className="h-2 mb-2" />
                              <div className="text-xs text-muted-foreground">
                                {completedItems.length}/{stationItems.length} 完成
                              </div>
                              {processingTime && (
                                <div className="text-xs text-primary mt-1 flex items-center justify-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {processingTime.duration} 小時
                                </div>
                              )}
                            </div>
                          </DialogTrigger>
                          
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                {getSystemDisplayInfo(system)} - {station.station_name}
                              </DialogTitle>
                            </DialogHeader>
                            
                            <div className="space-y-4">
                              {processingTime && (
                                <div className="p-4 bg-muted/20 rounded-lg">
                                  <div className="text-sm font-medium text-card-foreground mb-2">處理時間記錄</div>
                                  <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">開始時間:</span>
                                      <div className="text-card-foreground">{formatTime(processingTime.startTime.toISOString())}</div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">完成時間:</span>
                                      <div className="text-card-foreground">{formatTime(processingTime.endTime.toISOString())}</div>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">總處理時長:</span>
                                      <div className="text-primary font-medium">{processingTime.duration} 小時</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="space-y-3">
                                <div className="text-sm font-medium text-card-foreground">測試項目詳情</div>
                                {stationItems.sort((a, b) => a.item_order - b.item_order).map((item) => {
                                  const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                                  const editKey = `${system.id}-${station.id}-${item.id}`;
                                  const isEditing = editingProgress === editKey;

                                  return (
                                    <div key={item.id} className="border border-border rounded-lg p-4 bg-background/30">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-card-foreground">{item.item_name}</span>
                                        <div className="flex items-center gap-2">
                                          <Badge 
                                            variant={itemProgress?.status === 'Done' ? 'default' : 
                                                    itemProgress?.status === 'On-going' ? 'secondary' : 'outline'}
                                            className="text-xs"
                                          >
                                            {itemProgress?.status || 'Not Start'}
                                          </Badge>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEditProgress(system.id, station.id, item.id)}
                                          >
                                            編輯
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      {itemProgress && (
                                        <div className="text-xs text-muted-foreground space-y-1">
                                          {itemProgress.started_at && (
                                            <div>開始: {formatTime(itemProgress.started_at)}</div>
                                          )}
                                          {itemProgress.completed_at && (
                                            <div>完成: {formatTime(itemProgress.completed_at)}</div>
                                          )}
                                          {itemProgress.notes && (
                                            <div>備註: {itemProgress.notes}</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                    );
                  })}
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <SystemEditDialog
                        systemId={system.id}
                        systemName={system.system_name}
                        assignedEngineer={system.assigned_engineer}
                        onUpdate={onSystemUpdate}
                        variant="icon"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
