import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, ArrowLeft, Clock, User, Gauge
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { ExportDialog } from './ExportDialog';

interface MachineWorkOrder {
  id: string;
  systemName: string;
  assignedEngineer: string;
  startTime: Date;
  endTime: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  progress: number;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

interface MachineSchedule {
  machineId: string;
  machineName: string;
  utilization: number;
  workOrders: MachineWorkOrder[];
  productionLine: string;
}

type TimeScale = 'day' | 'week' | 'month';

export function MachineGanttChart() {
  const { systems, stationStatuses, stations } = useUnifiedData();
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<MachineWorkOrder | null>(null);
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Convert station data to machine schedules
  const machineSchedules = useMemo(() => {
    const schedules: MachineSchedule[] = stationStatuses.map((station) => {
      // Find systems assigned to this station
      const assignedSystems = systems.filter(s => s.current_station === station.name);
      
      const workOrders: MachineWorkOrder[] = assignedSystems.map((system, index) => {
        const startTime = new Date();
        startTime.setHours(8 + index * 2); // Stagger start times
        
        const endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + 8); // 8-hour work orders
        
        let status: MachineWorkOrder['status'] = 'not_started';
        if (system.status === 'On-going') status = 'in_progress';
        else if (system.status === 'Done') status = 'completed';
        else if (system.overall_progress > 0) status = 'delayed';
        
        return {
          id: system.id,
          systemName: system.system_name,
          assignedEngineer: system.assigned_engineer || 'Unassigned',
          startTime,
          endTime,
          status,
          progress: system.overall_progress || 0,
          priority: system.overall_progress < 50 ? 'high' : 'medium',
          notes: `Model: ${system.model}`
        };
      });

      return {
        machineId: station.id,
        machineName: station.name,
        utilization: station.efficiency,
        workOrders,
        productionLine: station.name.includes('TEAM') ? station.name.split(' - ')[1] : 'DEFAULT'
      };
    });

    return schedules;
  }, [stationStatuses, systems]);

  // Group machines by production line
  const groupedMachines = useMemo(() => {
    const groups: Record<string, MachineSchedule[]> = {};
    machineSchedules.forEach(machine => {
      if (!groups[machine.productionLine]) {
        groups[machine.productionLine] = [];
      }
      groups[machine.productionLine].push(machine);
    });
    return groups;
  }, [machineSchedules]);

  useEffect(() => {
    // Set initial view range
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 3);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    setViewRange({ start, end });
  }, []);

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let increment: number;
    let format: Intl.DateTimeFormatOptions;
    
    switch (timeScale) {
      case 'day':
        increment = 1;
        format = { month: 'short', day: 'numeric' };
        break;
      case 'week':
        increment = 1;
        format = { month: 'short', day: 'numeric' };
        break;
      case 'month':
        increment = 7;
        format = { month: 'short', day: 'numeric' };
        break;
    }
    
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
  }, [viewRange, timeScale]);

  const getStatusColor = (status: MachineWorkOrder['status']) => {
    switch (status) {
      case 'completed': return 'hsl(var(--success))';
      case 'in_progress': return 'hsl(var(--primary))';
      case 'delayed': return 'hsl(var(--destructive))';
      default: return 'hsl(var(--muted))';
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel * 1.5, 5) : Math.max(zoomLevel / 1.5, 0.5);
    setZoomLevel(newZoom);
  };

  const handleTimeNavigation = (direction: 'prev' | 'next') => {
    const { start, end } = viewRange;
    const duration = end.getTime() - start.getTime();
    const shift = direction === 'next' ? duration * 0.5 : -duration * 0.5;
    
    setViewRange({
      start: new Date(start.getTime() + shift),
      end: new Date(end.getTime() + shift)
    });
  };

  const handleWorkOrderClick = (workOrder: MachineWorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsWorkOrderDialogOpen(true);
  };

  const toggleLineExpansion = (line: string) => {
    const newExpanded = new Set(expandedLines);
    if (newExpanded.has(line)) {
      newExpanded.delete(line);
    } else {
      newExpanded.add(line);
    }
    setExpandedLines(newExpanded);
  };

  const renderWorkOrderBar = (workOrder: MachineWorkOrder) => {
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const orderStart = Math.max(0, workOrder.startTime.getTime() - start.getTime());
    const orderEnd = Math.min(totalDuration, workOrder.endTime.getTime() - start.getTime());
    const orderDuration = orderEnd - orderStart;
    
    if (orderDuration <= 0) return null;
    
    const leftPercent = (orderStart / totalDuration) * 100;
    const widthPercent = Math.max((orderDuration / totalDuration) * 100 * zoomLevel, 60);
    
    return (
      <div
        className="relative h-8 rounded cursor-pointer transition-all duration-200 hover:h-9 shadow-sm animate-fade-in"
        style={{
          left: `${leftPercent}%`,
          width: `${widthPercent}px`,
          backgroundColor: getStatusColor(workOrder.status),
          minWidth: '80px'
        }}
        onClick={() => handleWorkOrderClick(workOrder)}
      >
        {/* Progress fill */}
        <div 
          className="h-full bg-white/30 rounded transition-all duration-500"
          style={{ width: `${workOrder.progress}%` }}
        />
        
        {/* Work order content */}
        <div className="absolute inset-0 flex items-center px-2 text-white text-xs font-medium">
          <span className="truncate mr-1" style={{ maxWidth: '60%' }}>
            {workOrder.systemName}
          </span>
          <span className="text-xs opacity-90 ml-auto">
            {workOrder.progress}%
          </span>
        </div>
      </div>
    );
  };

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
              {/* Time Scale Selector */}
              <Select value={timeScale} onValueChange={(value: TimeScale) => setTimeScale(value)}>
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">日</SelectItem>
                  <SelectItem value="week">週</SelectItem>
                  <SelectItem value="month">月</SelectItem>
                </SelectContent>
              </Select>
              
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
}