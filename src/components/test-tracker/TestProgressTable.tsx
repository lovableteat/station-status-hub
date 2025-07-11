
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SystemEditDialog } from "./SystemEditDialog";
import { StationStatusSelector } from "./StationStatusSelector";
import { BulkResetDialog } from "./BulkResetDialog";
import { SystemManager, SystemDeleteButton } from "./SystemManager";
import { SystemResetDialog } from "./SystemResetDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SystemStatusUpdater } from "./SystemStatusUpdater";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  const { toast } = useToast();
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
  
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

  const toggleSystemExpanded = (systemId: string) => {
    const newExpanded = new Set(expandedSystems);
    if (newExpanded.has(systemId)) {
      newExpanded.delete(systemId);
    } else {
      newExpanded.add(systemId);
    }
    setExpandedSystems(newExpanded);
  };

  const getSystemDisplayInfo = (system: TestSystem) => {
    const parts = [];
    if (system.system_name) parts.push(system.system_name);
    if (system.model) parts.push(`型號: ${system.model}`);
    if (system.serial_number) parts.push(`序列號: ${system.serial_number}`);
    return parts.join(' | ');
  };

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
              <Collapsible
                open={expandedSystems.has(system.id)}
                onOpenChange={() => toggleSystemExpanded(system.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/10 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedSystems.has(system.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <CardTitle className="text-lg text-card-foreground">
                            {getSystemDisplayInfo(system)}
                          </CardTitle>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span>負責工程師: {system.assigned_engineer || '未指派'}</span>
                            <span>整體進度: {system.overall_progress}%</span>
                            <Badge variant={system.status === 'Done' ? 'default' : system.status === 'On-going' ? 'secondary' : 'outline'}>
                              {system.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StationStatusSelector
                          systemId={system.id}
                          currentStatus={system.current_station || '未開始'}
                          onUpdate={onSystemUpdate}
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
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

                        return (
                          <Card key={station.id} className="border-border bg-background/50">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base text-card-foreground">
                                {station.station_name}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">進度</span>
                                  <span className="font-medium text-card-foreground">{overallPercent}%</span>
                                </div>
                                <Progress value={overallPercent} className="h-2" />
                                <div className="text-xs text-muted-foreground">
                                  {completedItems.length}/{stationItems.length} 項目完成
                                </div>
                              </div>

                              {processingTime && (
                                <div className="space-y-2 pt-2 border-t border-border">
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <div className="flex justify-between">
                                      <span>開始時間:</span>
                                      <span className="text-card-foreground">{formatTime(processingTime.startTime.toISOString())}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>完成時間:</span>
                                      <span className="text-card-foreground">{formatTime(processingTime.endTime.toISOString())}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                      <span>處理時長:</span>
                                      <span className="text-primary">{processingTime.duration} 小時</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 測試項目詳情 */}
                              <div className="space-y-1">
                                {stationItems.map((item) => {
                                  const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                                  return (
                                    <div key={item.id} className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground truncate flex-1 mr-2">
                                        {item.item_name}
                                      </span>
                                      <Badge 
                                        variant={itemProgress?.status === 'Done' ? 'default' : 
                                                itemProgress?.status === 'On-going' ? 'secondary' : 'outline'}
                                        className="text-xs py-0 px-1"
                                      >
                                        {itemProgress?.status || 'Not Start'}
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
