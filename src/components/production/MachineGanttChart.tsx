import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, Clock, User, Gauge, Calendar
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { ExportDialog } from './ExportDialog';
import React from 'react';

interface MachineWorkOrder {
  id: string;
  systemId: string;
  systemName: string;
  assignedEngineer: string;
  startTime: Date;
  endTime: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  progress: number;
  priority: 'low' | 'medium' | 'high';
  stationId: string;
  itemsCompleted: number;
  itemsTotal: number;
  actualHours?: number;
  estimatedHours: number;
  notes?: string;
}

interface MachineSchedule {
  machineId: string;
  machineName: string;
  stationOrder: number;
  utilization: number;
  workOrders: MachineWorkOrder[];
  totalSystems: number;
  completedSystems: number;
  ongoingSystems: number;
}

export const MachineGanttChart = React.memo(function MachineGanttChart() {
  const { systems, stations, progress, stationStatuses } = useUnifiedData();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<MachineWorkOrder | null>(null);
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { toast } = useToast();

  // Convert real data to machine schedules with proper work order calculation
  const machineSchedules = useMemo(() => {
    const schedules: MachineSchedule[] = stations.map((station) => {
      // Find all systems and their progress for this station
      const systemsForStation = systems.map(system => {
        const systemProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        // Calculate station-specific progress
        const completedItems = systemProgress.filter(p => p.status === 'Done').length;
        const totalItems = systemProgress.length;
        const stationProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        
        // Determine if this system has work at this station
        if (totalItems === 0) return null;
        
        // Calculate timeline based on actual data
        let startTime = new Date();
        let endTime = new Date();
        let actualHours: number | undefined;
        
        // Get earliest started_at and latest completed_at for this station
        const startedItems = systemProgress.filter(p => p.started_at);
        const completedItems_withTime = systemProgress.filter(p => p.completed_at);
        
        if (startedItems.length > 0) {
          const startTimes = startedItems.map(p => new Date(p.started_at!));
          startTime = new Date(Math.min(...startTimes.map(d => d.getTime())));
        } else {
          // Use current time + estimated offset based on station order
          startTime = new Date();
          startTime.setHours(startTime.getHours() + (station.station_order * 8));
        }
        
        if (completedItems_withTime.length === totalItems && completedItems_withTime.length > 0) {
          // All items completed - use actual completion time
          const endTimes = completedItems_withTime.map(p => new Date(p.completed_at!));
          endTime = new Date(Math.max(...endTimes.map(d => d.getTime())));
          actualHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        } else {
          // Use estimated hours
          const estimatedHours = station.estimated_hours || 8;
          endTime = new Date(startTime.getTime() + (estimatedHours * 60 * 60 * 1000));
        }
        
        // Determine status
        let status: MachineWorkOrder['status'] = 'not_started';
        if (stationProgress === 100) {
          status = 'completed';
        } else if (stationProgress > 0) {
          status = new Date() > endTime ? 'delayed' : 'in_progress';
        } else if (startTime <= new Date()) {
          status = 'delayed';
        }
        
        // Determine priority
        const priority: MachineWorkOrder['priority'] = 
          status === 'delayed' ? 'high' : 
          stationProgress < 50 && new Date() > new Date(endTime.getTime() - 24 * 60 * 60 * 1000) ? 'medium' : 
          'low';
        
        return {
          id: `${system.id}-${station.id}`,
          systemId: system.id,
          systemName: system.system_name,
          assignedEngineer: system.assigned_engineer || 'Unassigned',
          startTime,
          endTime,
          status,
          progress: stationProgress,
          priority,
          stationId: station.id,
          itemsCompleted: completedItems,
          itemsTotal: totalItems,
          actualHours,
          estimatedHours: station.estimated_hours || 8,
          notes: `Model: ${system.model || 'N/A'} | Serial: ${system.serial_number || 'N/A'}`
        };
      }).filter(Boolean) as MachineWorkOrder[];
      
      // Get station efficiency data
      const stationStatus = stationStatuses.find(s => s.name === station.station_name);
      const totalSystemsAtStation = systemsForStation.length;
      const completedSystemsAtStation = systemsForStation.filter(wo => wo.status === 'completed').length;
      const ongoingSystemsAtStation = systemsForStation.filter(wo => wo.status === 'in_progress').length;
      
      return {
        machineId: station.id,
        machineName: station.station_name,
        stationOrder: station.station_order,
        utilization: stationStatus?.efficiency || 0,
        workOrders: systemsForStation,
        totalSystems: totalSystemsAtStation,
        completedSystems: completedSystemsAtStation,
        ongoingSystems: ongoingSystemsAtStation
      };
    });
    
    // Sort by station order
    return schedules.sort((a, b) => a.stationOrder - b.stationOrder);
  }, [stations, systems, progress, stationStatuses]);

  // Calculate optimal view range based on actual work orders
  useEffect(() => {
    const allWorkOrders = machineSchedules.flatMap(m => m.workOrders);
    if (allWorkOrders.length === 0) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 3);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      setViewRange({ start, end });
      return;
    }
    
    const startTimes = allWorkOrders.map(wo => wo.startTime.getTime());
    const endTimes = allWorkOrders.map(wo => wo.endTime.getTime());
    
    const minStart = new Date(Math.min(...startTimes));
    const maxEnd = new Date(Math.max(...endTimes));
    
    // Add some padding
    minStart.setDate(minStart.getDate() - 1);
    maxEnd.setDate(maxEnd.getDate() + 1);
    
    setViewRange({ start: minStart, end: maxEnd });
  }, [machineSchedules]);

  // Generate time markers with better spacing
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    // Adjust increment based on zoom level and total days
    let increment = Math.max(1, Math.floor(totalDays / (15 * zoomLevel))); // Target ~15 markers
    const format: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric',
      ...(totalDays > 30 ? {} : { weekday: 'short' })
    };
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      markers.push({
        date: new Date(currentDate),
        percent,
        label: currentDate.toLocaleDateString('zh-TW', format)
      });
      
      currentDate.setDate(currentDate.getDate() + increment);
    }
    
    return markers;
  }, [viewRange, zoomLevel]);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel * 1.5, 5) : Math.max(zoomLevel / 1.5, 0.5);
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  const handleTimeNavigation = useCallback((direction: 'prev' | 'next') => {
    const { start, end } = viewRange;
    const duration = end.getTime() - start.getTime();
    const shift = direction === 'next' ? duration * 0.3 : -duration * 0.3;
    
    setViewRange({
      start: new Date(start.getTime() + shift),
      end: new Date(end.getTime() + shift)
    });
  }, [viewRange]);

  const handleWorkOrderClick = useCallback((workOrder: MachineWorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsWorkOrderDialogOpen(true);
  }, []);

  const renderWorkOrderBar = useCallback((workOrder: MachineWorkOrder) => {
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const orderStart = Math.max(0, workOrder.startTime.getTime() - start.getTime());
    const orderEnd = Math.min(totalDuration, workOrder.endTime.getTime() - start.getTime());
    const orderDuration = orderEnd - orderStart;
    
    if (orderDuration <= 0) return null;
    
    const leftPercent = (orderStart / totalDuration) * 100;
    const widthPercent = Math.max((orderDuration / totalDuration) * 100, 0.5); // Minimum 0.5% width
    
    return (
      <TooltipProvider key={workOrder.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute h-7 rounded cursor-pointer transition-all duration-200 hover:h-8 hover:-translate-y-0.5 shadow-sm animate-fade-in flex items-center justify-center overflow-hidden"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                backgroundColor: getStatusColor(workOrder.status),
                minWidth: '60px'
              }}
              onClick={() => handleWorkOrderClick(workOrder)}
            >
              {/* Progress fill */}
              <div 
                className="absolute inset-0 bg-white/20 rounded transition-all duration-500"
                style={{ width: `${workOrder.progress}%` }}
              />
              
              {/* System name and progress */}
              <div className="relative z-10 flex items-center gap-1 px-2 text-white text-xs font-medium">
                <span className="truncate">{workOrder.systemName}</span>
                <span className="text-white/80">({workOrder.progress}%)</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <div className="font-medium">{workOrder.systemName}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>進度: {workOrder.progress}%</div>
                <div>狀態: {getStatusLabel(workOrder.status)}</div>
                <div>負責人: {workOrder.assignedEngineer}</div>
                <div>優先度: {getPriorityLabel(workOrder.priority)}</div>
              </div>
              <div className="text-xs text-muted-foreground border-t pt-2">
                <div>開始: {workOrder.startTime.toLocaleDateString('zh-TW')}</div>
                <div>結束: {workOrder.endTime.toLocaleDateString('zh-TW')}</div>
                <div>項目: {workOrder.itemsCompleted}/{workOrder.itemsTotal}</div>
                {workOrder.actualHours && (
                  <div>實際時數: {workOrder.actualHours.toFixed(1)}h</div>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }, [viewRange, handleWorkOrderClick]);

  const getStatusColor = useCallback((status: MachineWorkOrder['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted-foreground))';
    }
  }, []);

  const getStatusLabel = useCallback((status: MachineWorkOrder['status']) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'in_progress': return '進行中';
      case 'delayed': return '延遲';
      default: return '未開始';
    }
  }, []);

  const getPriorityLabel = useCallback((priority: MachineWorkOrder['priority']) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      default: return '低';
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">機台排程甘特圖</CardTitle>
              <p className="text-muted-foreground text-sm">機台生產排程與工單狀態一覽</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => handleZoom('out')}>
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleZoom('in')}>
                  <ZoomIn className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Navigation Controls */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('prev')}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('next')}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
              
              {/* Export Button */}
              <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
                <Download className="h-3 w-3 mr-1" />
                匯出
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 flex flex-col space-y-4">
          {/* Machine List Section */}
          <div className="border-b bg-muted/30">
            <div className="p-3 border-b bg-background">
              <h3 className="font-semibold text-sm">機台列表</h3>
              <p className="text-xs text-muted-foreground">機台狀態與利用率</p>
            </div>
            <div className="p-2">
              <div className="grid grid-cols-3 gap-2">
                {machineSchedules.map(machine => (
                  <div key={machine.machineId} className="p-2 bg-background rounded border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">{machine.machineName}</span>
                      <Badge variant="outline" className="text-xs">
                        <Gauge className="h-3 w-3 mr-1" />
                        {machine.utilization}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      工單數量: {machine.workOrders.length}
                    </div>
                    <Progress value={machine.utilization} className="h-1" />
                    <div className="text-xs text-muted-foreground mt-1">
                      即時利用率
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gantt Chart Section */}
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b bg-background">
              <h3 className="font-semibold text-sm">甘特圖排程</h3>
              <p className="text-xs text-muted-foreground">機台工單時程與進度</p>
            </div>
            
            <div className="flex flex-1 border-t">
              {/* Left Panel - Machine Names */}
              <div className="w-48 border-r bg-muted/20 flex flex-col">
                <div className="p-2 border-b bg-background">
                  <div className="text-xs font-semibold">機台名稱</div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-1 p-1">
                    {machineSchedules.map(machine => (
                      <div key={machine.machineId} className="h-12 flex items-center px-2 text-xs font-medium border-b border-border/20">
                        {machine.machineName}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              
              {/* Right Panel - Timeline and Progress Bars */}
              <div className="flex-1 flex flex-col">
                {/* Timeline Header */}
                <div className="relative h-10 bg-muted/20 border-b overflow-hidden">
                  {timeMarkers.map((marker, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 border-l border-border/30"
                      style={{ left: `${marker.percent}%` }}
                    >
                      <div className="absolute top-1 left-1 text-xs text-muted-foreground whitespace-nowrap">
                        {marker.label}
                      </div>
                    </div>
                  ))}
                  
                  {/* Today Line */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                    style={{ 
                      left: `${((new Date().getTime() - viewRange.start.getTime()) / (viewRange.end.getTime() - viewRange.start.getTime())) * 100}%` 
                    }}
                  >
                    <div className="absolute -top-1 -left-4 text-xs text-primary font-medium bg-background px-1 rounded">
                      今日
                    </div>
                  </div>
                </div>
                
                {/* Progress Bars Area */}
                <ScrollArea className="flex-1">
                  <div className="space-y-1 p-1">
                    {machineSchedules.map(machine => (
                      <div key={machine.machineId} className="h-12 relative border-b border-border/20">
                        {machine.workOrders.map(workOrder => (
                          <div key={workOrder.id} className="absolute top-1 bottom-1">
                            {renderWorkOrderBar(workOrder)}
                          </div>
                        ))}
                        {machine.workOrders.length === 0 && (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground opacity-50">
                            無排程工單
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Work Order Detail Dialog */}
      <Dialog open={isWorkOrderDialogOpen} onOpenChange={setIsWorkOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>工單詳情 - {selectedWorkOrder?.systemName}</DialogTitle>
          </DialogHeader>
          {selectedWorkOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">工單編號</div>
                  <div className="font-medium">{selectedWorkOrder.systemName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">負責人</div>
                  <div className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {selectedWorkOrder.assignedEngineer}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">開始時間</div>
                  <div className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {selectedWorkOrder.startTime.toLocaleString('zh-TW')}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">結束時間</div>
                  <div className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {selectedWorkOrder.endTime.toLocaleString('zh-TW')}
                  </div>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-2">進度狀態</div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>完成進度</span>
                    <span className="font-medium">{selectedWorkOrder.progress}%</span>
                  </div>
                  <Progress value={selectedWorkOrder.progress} className="h-2" />
                </div>
              </div>
              
              {selectedWorkOrder.notes && (
                <div>
                  <div className="text-sm text-muted-foreground">備註</div>
                  <div className="text-sm bg-muted/50 p-2 rounded">{selectedWorkOrder.notes}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="機台排程甘特圖"
        data={machineSchedules}
      />
    </div>
  );
});