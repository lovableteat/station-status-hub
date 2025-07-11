import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, RotateCcw, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { BulkResetDialog } from "./BulkResetDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface UnifiedSystem {
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

interface UnifiedStation {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

interface UnifiedTestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
}

interface UnifiedProgress {
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

const TestProgressTable = () => {
  const { systems, stations, testItems, progress, refetch } = useUnifiedData();
  const { toast } = useToast();
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [showSystemDialog, setShowSystemDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

  // 計算各站的處理時長
  const calculateStationDuration = (systemId: string, stationId: string) => {
    const stationProgress = progress.filter(p => p.system_id === systemId && p.station_id === stationId);
    
    if (stationProgress.length === 0) return "0 小時";
    
    const startTimes = stationProgress
      .filter(p => p.started_at)
      .map(p => new Date(p.started_at!));
    
    const endTimes = stationProgress
      .filter(p => p.completed_at)
      .map(p => new Date(p.completed_at!));
    
    if (startTimes.length === 0 || endTimes.length === 0) return "進行中";
    
    const earliestStart = new Date(Math.min(...startTimes.map(d => d.getTime())));
    const latestEnd = new Date(Math.max(...endTimes.map(d => d.getTime())));
    
    const diffMs = latestEnd.getTime() - earliestStart.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    return `${diffHours.toFixed(1)} 小時`;
  };

  // 獲取站點狀態
  const getStationStatus = (systemId: string, stationId: string) => {
    const stationProgress = progress.filter(p => p.system_id === systemId && p.station_id === stationId);
    const stationItems = testItems.filter(item => item.station_id === stationId);
    
    if (stationItems.length === 0) return "待處理";
    
    const completedItems = stationProgress.filter(p => p.status === 'Done').length;
    const inProgressItems = stationProgress.filter(p => p.status === 'On-going').length;
    
    if (completedItems === stationItems.length) return "已完成";
    if (inProgressItems > 0 || completedItems > 0) return "進行中";
    return "待處理";
  };

  // 更新系統狀態
  const updateSystemStatus = async (systemId: string, newStatus: string, currentStation?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (currentStation) {
        updateData.current_station = currentStation;
      }
      
      await supabase
        .from('test_systems')
        .update(updateData)
        .eq('id', systemId);
      
      await refetch();
      toast({
        title: "更新成功",
        description: "系統狀態已更新"
      });
    } catch (error) {
      console.error('更新系統狀態失敗:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統狀態",
        variant: "destructive"
      });
    }
  };

  const toggleSystemExpansion = (systemId: string) => {
    const newExpanded = new Set(expandedSystems);
    if (newExpanded.has(systemId)) {
      newExpanded.delete(systemId);
    } else {
      newExpanded.add(systemId);
    }
    setExpandedSystems(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case '已完成': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case '進行中': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case '待處理': return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const sortedStations = [...stations].sort((a, b) => a.station_order - b.station_order);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">GB300 L10 測試追蹤測試進度表</h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowSystemDialog(true)}
            className="bg-primary hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增機台
          </Button>
          <Button 
            onClick={() => setShowResetDialog(true)}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            重置所有進度
          </Button>
        </div>
      </div>

      <Card className="bg-card/50 border-border">
        <CardContent className="p-6">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-foreground font-semibold">機台編號</TableHead>
                <TableHead className="text-foreground font-semibold">當前狀態</TableHead>
                <TableHead className="text-foreground font-semibold">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systems.map((system) => (
                <React.Fragment key={system.id}>
                  <TableRow className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSystemExpansion(system.id)}
                          className="p-1 h-auto"
                        >
                          {expandedSystems.has(system.id) ? 
                            <ChevronDown className="w-4 h-4" /> : 
                            <ChevronRight className="w-4 h-4" />
                          }
                        </Button>
                        <div>
                          <div>{system.system_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {system.model} | {system.serial_number}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={system.status}
                        onValueChange={(value) => updateSystemStatus(system.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="已完成">已完成</SelectItem>
                          <SelectItem value="進行中">進行中</SelectItem>
                          <SelectItem value="待處理">待處理</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedSystemId(system.id);
                          setShowProgressDialog(true);
                        }}
                        className="border-primary text-primary hover:bg-primary/10"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        編輯進度
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  <TableRow className="border-none">
                    <TableCell colSpan={3} className="p-0">
                      <Collapsible open={expandedSystems.has(system.id)}>
                        <CollapsibleContent>
                          <div className="pl-8 pr-4 pb-4">
                            <div className="grid gap-3">
                              {sortedStations.map((station) => {
                                const stationStatus = getStationStatus(system.id, station.id);
                                const duration = calculateStationDuration(system.id, station.id);
                                
                                return (
                                  <div 
                                    key={station.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="font-medium text-foreground">
                                        {station.station_name}
                                      </div>
                                      <Badge className={`${getStatusColor(stationStatus)} border`}>
                                        {stationStatus}
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      處理時長: {duration}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showProgressDialog && selectedSystemId && (
        <ProgressEditDialog
          systemId={selectedSystemId}
          onUpdate={() => {
            setShowProgressDialog(false);
            setSelectedSystemId(null);
            return refetch();
          }}
        />
      )}

      {showSystemDialog && (
        <SystemEditDialog
          systemId=""
          systemName=""
          assignedEngineer=""
          onUpdate={() => {
            setShowSystemDialog(false);
            refetch();
          }}
        />
      )}

      {showResetDialog && (
        <BulkResetDialog
          onUpdate={() => {
            setShowResetDialog(false);
            refetch();
          }}
        />
      )}
    </div>
  );
};

export default TestProgressTable;
