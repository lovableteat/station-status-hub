import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, Clock, User, Gauge, Calendar, Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { ExportDialog } from './ExportDialog';
import React from 'react';

// 工單狀態類型
type WorkOrderStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed';

// 工單優先度類型
type WorkOrderPriority = 'low' | 'medium' | 'high';

// 時間視圖類型
type TimeScale = 'day' | 'week' | 'month';

// 機台工單介面
interface MachineWorkOrder {
  id: string;
  systemId: string;
  systemName: string;
  serialNumber?: string;
  model?: string;
  assignedEngineer: string;
  startTime: Date;
  endTime: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  status: WorkOrderStatus;
  progress: number;
  priority: WorkOrderPriority;
  stationId: string;
  stationName: string;
  itemsCompleted: number;
  itemsTotal: number;
  actualHours?: number;
  estimatedHours: number;
  notes?: string;
  isOverdue: boolean;
}

// 機台排程介面
interface MachineSchedule {
  machineId: string;
  machineName: string;
  stationOrder: number;
  utilization: number;
  efficiency: number;
  workOrders: MachineWorkOrder[];
  totalSystems: number;
  completedSystems: number;
  ongoingSystems: number;
  delayedSystems: number;
  avgCompletionTime: number;
}

// 時間標記介面
interface TimeMarker {
  date: Date;
  percent: number;
  label: string;
  isToday?: boolean;
}

export const MachineGanttChart = React.memo(function MachineGanttChart() {
  const { systems, stations, progress, stationStatuses } = useUnifiedData();
  const [timeScale, setTimeScale] = useState<TimeScale>('week');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewRange, setViewRange] = useState({ start: new Date(), end: new Date() });
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<MachineWorkOrder | null>(null);
  const [isWorkOrderDialogOpen, setIsWorkOrderDialogOpen] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { toast } = useToast();

  // 提取機台編號的函數
  const getStationNumber = useCallback((stationName: string) => {
    const match = stationName.match(/Station\s*(\d+)/i);
    return match ? match[1] : stationName;
  }, []);

  // 計算機台工單資料的核心邏輯
  const machineSchedules = useMemo(() => {
    if (!stations.length || !systems.length) return [];

    const schedules: MachineSchedule[] = stations.map((station) => {
      // 獲取該機台的所有工單
      const systemsForStation = systems.map(system => {
        const systemProgress = progress.filter(p => 
          p.system_id === system.id && p.station_id === station.id
        );
        
        // 如果沒有工作項目，跳過
        if (systemProgress.length === 0) return null;
        
        // 計算進度統計
        const completedItems = systemProgress.filter(p => p.status === 'Done').length;
        const inProgressItems = systemProgress.filter(p => p.status === 'In Progress').length;
        const totalItems = systemProgress.length;
        const stationProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        
        // 計算實際時間
        let actualStartTime: Date | undefined;
        let actualEndTime: Date | undefined;
        let estimatedStartTime = new Date();
        let estimatedEndTime = new Date(estimatedStartTime.getTime() + (station.estimated_hours || 8) * 60 * 60 * 1000);
        
        // 獲取實際開始和結束時間
        const startedItems = systemProgress.filter(p => p.started_at);
        const completedItems_withTime = systemProgress.filter(p => p.completed_at);
        
        if (startedItems.length > 0) {
          const startTimes = startedItems.map(p => new Date(p.started_at!));
          actualStartTime = new Date(Math.min(...startTimes.map(d => d.getTime())));
          estimatedStartTime = actualStartTime;
        }
        
        if (completedItems_withTime.length === totalItems && completedItems_withTime.length > 0) {
          const endTimes = completedItems_withTime.map(p => new Date(p.completed_at!));
          actualEndTime = new Date(Math.max(...endTimes.map(d => d.getTime())));
          estimatedEndTime = actualEndTime;
        } else if (actualStartTime) {
          // 如果已開始但未完成，使用開始時間 + 預估時間
          estimatedEndTime = new Date(actualStartTime.getTime() + (station.estimated_hours || 8) * 60 * 60 * 1000);
        }
        
        // 計算實際工時
        const actualHours = actualStartTime && actualEndTime 
          ? (actualEndTime.getTime() - actualStartTime.getTime()) / (1000 * 60 * 60)
          : undefined;
        
        // 判斷狀態
        let status: WorkOrderStatus = 'not_started';
        const now = new Date();
        
        if (stationProgress === 100) {
          status = 'completed';
        } else if (stationProgress > 0) {
          status = now > estimatedEndTime ? 'delayed' : 'in_progress';
        } else if (estimatedStartTime <= now) {
          status = 'delayed';
        }
        
        // 判斷優先度
        const isOverdue = now > estimatedEndTime && status !== 'completed';
        const priority: WorkOrderPriority = 
          status === 'delayed' || isOverdue ? 'high' : 
          stationProgress < 50 && now > new Date(estimatedEndTime.getTime() - 24 * 60 * 60 * 1000) ? 'medium' : 
          'low';
        
        return {
          id: `${system.id}-${station.id}`,
          systemId: system.id,
          systemName: system.system_name,
          serialNumber: system.serial_number,
          model: system.model,
          assignedEngineer: system.assigned_engineer || '未分派',
          startTime: estimatedStartTime,
          endTime: estimatedEndTime,
          actualStartTime,
          actualEndTime,
          status,
          progress: stationProgress,
          priority,
          stationId: station.id,
          stationName: getStationNumber(station.station_name),
          itemsCompleted: completedItems,
          itemsTotal: totalItems,
          actualHours,
          estimatedHours: station.estimated_hours || 8,
          notes: `型號: ${system.model || 'N/A'} | 序號: ${system.serial_number || 'N/A'}`,
          isOverdue
        };
      }).filter(Boolean) as MachineWorkOrder[];
      
      // 計算機台統計資料
      const stationStatus = stationStatuses.find(s => s.name === station.station_name);
      const totalSystemsAtStation = systemsForStation.length;
      const completedSystemsAtStation = systemsForStation.filter(wo => wo.status === 'completed').length;
      const ongoingSystemsAtStation = systemsForStation.filter(wo => wo.status === 'in_progress').length;
      const delayedSystemsAtStation = systemsForStation.filter(wo => wo.status === 'delayed').length;
      
      // 計算平均完成時間
      const completedWorkOrders = systemsForStation.filter(wo => wo.actualHours);
      const avgCompletionTime = completedWorkOrders.length > 0 
        ? completedWorkOrders.reduce((sum, wo) => sum + (wo.actualHours || 0), 0) / completedWorkOrders.length
        : station.estimated_hours || 8;
      
      // 計算效率 (實際時間 vs 預估時間)
      const efficiency = completedWorkOrders.length > 0
        ? Math.round((station.estimated_hours || 8) / avgCompletionTime * 100)
        : stationStatus?.efficiency || 0;
      
      return {
        machineId: station.id,
        machineName: getStationNumber(station.station_name),
        stationOrder: station.station_order,
        utilization: Math.min(100, Math.round((ongoingSystemsAtStation + completedSystemsAtStation) / Math.max(1, totalSystemsAtStation) * 100)),
        efficiency,
        workOrders: systemsForStation,
        totalSystems: totalSystemsAtStation,
        completedSystems: completedSystemsAtStation,
        ongoingSystems: ongoingSystemsAtStation,
        delayedSystems: delayedSystemsAtStation,
        avgCompletionTime
      };
    });
    
    // 按機台順序排序
    return schedules.sort((a, b) => a.stationOrder - b.stationOrder);
  }, [stations, systems, progress, stationStatuses, getStationNumber]);

  // 計算最佳視圖時間範圍
  useEffect(() => {
    const allWorkOrders = machineSchedules.flatMap(m => m.workOrders);
    if (allWorkOrders.length === 0) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      const end = new Date(now);
      end.setDate(end.getDate() + 14);
      setViewRange({ start, end });
      return;
    }
    
    const startTimes = allWorkOrders.map(wo => wo.startTime.getTime());
    const endTimes = allWorkOrders.map(wo => wo.endTime.getTime());
    
    const minStart = new Date(Math.min(...startTimes));
    const maxEnd = new Date(Math.max(...endTimes));
    
    // 添加緩衝時間
    const paddingDays = timeScale === 'day' ? 1 : timeScale === 'week' ? 3 : 7;
    minStart.setDate(minStart.getDate() - paddingDays);
    maxEnd.setDate(maxEnd.getDate() + paddingDays);
    
    setViewRange({ start: minStart, end: maxEnd });
  }, [machineSchedules, timeScale]);

  // 生成時間軸標記
  const timeMarkers = useMemo(() => {
    const markers: TimeMarker[] = [];
    const { start, end } = viewRange;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 根據時間尺度和縮放級別調整間隔
    let increment: number;
    let format: Intl.DateTimeFormatOptions;
    
    switch (timeScale) {
      case 'day':
        increment = Math.max(1, Math.floor(totalDays / (20 * zoomLevel)));
        format = { month: 'short', day: 'numeric', weekday: 'short' };
        break;
      case 'week':
        increment = Math.max(3, Math.floor(totalDays / (15 * zoomLevel)));
        format = { month: 'short', day: 'numeric' };
        break;
      case 'month':
        increment = Math.max(7, Math.floor(totalDays / (10 * zoomLevel)));
        format = { month: 'short', day: 'numeric' };
        break;
    }
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const dayFromStart = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const percent = totalDays > 0 ? (dayFromStart / totalDays) * 100 : 0;
      
      const markerDate = new Date(currentDate);
      markerDate.setHours(0, 0, 0, 0);
      
      markers.push({
        date: new Date(currentDate),
        percent,
        label: currentDate.toLocaleDateString('zh-TW', format),
        isToday: markerDate.getTime() === today.getTime()
      });
      
      currentDate.setDate(currentDate.getDate() + increment);
    }
    
    return markers;
  }, [viewRange, zoomLevel, timeScale]);

  // 縮放控制
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel * 1.2, 3) : Math.max(zoomLevel / 1.2, 0.3);
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  // 時間軸導航
  const handleTimeNavigation = useCallback((direction: 'prev' | 'next') => {
    const { start, end } = viewRange;
    const duration = end.getTime() - start.getTime();
    const shiftRatio = timeScale === 'day' ? 0.2 : timeScale === 'week' ? 0.3 : 0.5;
    const shift = direction === 'next' ? duration * shiftRatio : -duration * shiftRatio;
    
    setViewRange({
      start: new Date(start.getTime() + shift),
      end: new Date(end.getTime() + shift)
    });
  }, [viewRange, timeScale]);

  // 工單點擊處理
  const handleWorkOrderClick = useCallback((workOrder: MachineWorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setIsWorkOrderDialogOpen(true);
  }, []);

  // 時間尺度改變處理
  const handleTimeScaleChange = useCallback((newScale: TimeScale) => {
    setTimeScale(newScale);
    setZoomLevel(1); // 重置縮放級別
  }, []);

  // 渲染工單進度條
  const renderWorkOrderBar = useCallback((workOrder: MachineWorkOrder) => {
    const { start, end } = viewRange;
    const totalDuration = end.getTime() - start.getTime();
    const orderStart = Math.max(0, workOrder.startTime.getTime() - start.getTime());
    const orderEnd = Math.min(totalDuration, workOrder.endTime.getTime() - start.getTime());
    const orderDuration = orderEnd - orderStart;
    
    if (orderDuration <= 0) return null;
    
    const leftPercent = (orderStart / totalDuration) * 100;
    const widthPercent = Math.max((orderDuration / totalDuration) * 100, 1); // 最小寬度 1%
    
    return (
      <TooltipProvider key={workOrder.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`
                absolute h-6 rounded-sm cursor-pointer transition-all duration-200 
                hover:h-7 hover:-translate-y-0.5 hover:shadow-md
                animate-fade-in flex items-center justify-center overflow-hidden
                ${workOrder.isOverdue ? 'animate-pulse' : ''}
              `}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                backgroundColor: getStatusColor(workOrder.status),
                minWidth: '80px',
                border: workOrder.priority === 'high' ? '2px solid hsl(var(--destructive))' : 
                        workOrder.priority === 'medium' ? '1px solid hsl(var(--warning))' : 'none'
              }}
              onClick={() => handleWorkOrderClick(workOrder)}
            >
              {/* 進度填充 */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-white/30 to-transparent rounded-sm transition-all duration-300"
                style={{ width: `${workOrder.progress}%` }}
              />
              
              {/* 系統名稱和進度 */}
              <div className="relative z-10 flex items-center justify-between px-2 text-white text-xs font-medium w-full">
                <span className="truncate flex-1 mr-1">{workOrder.systemName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {workOrder.isOverdue && <Clock className="h-3 w-3 text-red-200" />}
                  <span>{workOrder.progress}%</span>
                </div>
              </div>
              
              {/* 優先度指示器 */}
              {workOrder.priority === 'high' && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-base">{workOrder.systemName}</span>
                <Badge variant={workOrder.status === 'completed' ? 'default' : 
                              workOrder.status === 'delayed' ? 'destructive' : 'secondary'}>
                  {getStatusLabel(workOrder.status)}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">基本資訊</div>
                  <div>機台: {workOrder.stationName}</div>
                  <div>負責人: {workOrder.assignedEngineer}</div>
                  <div>型號: {workOrder.model || 'N/A'}</div>
                  <div>序號: {workOrder.serialNumber || 'N/A'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-muted-foreground">時程資訊</div>
                  <div>預計: {workOrder.startTime.toLocaleDateString('zh-TW')}</div>
                  <div>到: {workOrder.endTime.toLocaleDateString('zh-TW')}</div>
                  {workOrder.actualStartTime && (
                    <div>實際開始: {workOrder.actualStartTime.toLocaleDateString('zh-TW')}</div>
                  )}
                  {workOrder.actualEndTime && (
                    <div>實際結束: {workOrder.actualEndTime.toLocaleDateString('zh-TW')}</div>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>完成進度</span>
                  <span className="font-medium">{workOrder.progress}%</span>
                </div>
                <Progress value={workOrder.progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>已完成: {workOrder.itemsCompleted}</span>
                  <span>總計: {workOrder.itemsTotal}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  優先度: <span className={
                    workOrder.priority === 'high' ? 'text-red-500 font-medium' :
                    workOrder.priority === 'medium' ? 'text-yellow-500 font-medium' :
                    'text-green-500'
                  }>{getPriorityLabel(workOrder.priority)}</span>
                </div>
                <div>
                  預估時數: {workOrder.estimatedHours}h
                </div>
                {workOrder.actualHours && (
                  <>
                    <div>實際時數: {workOrder.actualHours.toFixed(1)}h</div>
                    <div>效率: {Math.round((workOrder.estimatedHours / workOrder.actualHours) * 100)}%</div>
                  </>
                )}
              </div>
              
              {workOrder.notes && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  {workOrder.notes}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }, [viewRange, handleWorkOrderClick]);

  // 狀態顏色映射
  const getStatusColor = useCallback((status: WorkOrderStatus) => {
    switch (status) {
      case 'completed': return 'hsl(var(--chart-2))'; // 綠色
      case 'in_progress': return 'hsl(var(--chart-1))'; // 藍色  
      case 'delayed': return 'hsl(var(--chart-5))'; // 紅色
      default: return 'hsl(var(--muted))'; // 灰色
    }
  }, []);

  // 狀態標籤映射
  const getStatusLabel = useCallback((status: WorkOrderStatus) => {
    switch (status) {
      case 'completed': return '已完成';
      case 'in_progress': return '進行中';
      case 'delayed': return '延遲';
      default: return '未開始';
    }
  }, []);

  // 優先度標籤映射
  const getPriorityLabel = useCallback((priority: WorkOrderPriority) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      default: return '低';
    }
  }, []);

  // 計算總體統計
  const overallStats = useMemo(() => {
    const allWorkOrders = machineSchedules.flatMap(m => m.workOrders);
    const total = allWorkOrders.length;
    const completed = allWorkOrders.filter(wo => wo.status === 'completed').length;
    const inProgress = allWorkOrders.filter(wo => wo.status === 'in_progress').length;
    const delayed = allWorkOrders.filter(wo => wo.status === 'delayed').length;
    const avgUtilization = machineSchedules.length > 0 
      ? Math.round(machineSchedules.reduce((sum, m) => sum + m.utilization, 0) / machineSchedules.length)
      : 0;
    
    return { total, completed, inProgress, delayed, avgUtilization };
  }, [machineSchedules]);

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* 總體統計卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">總工單</p>
              <p className="text-2xl font-bold">{overallStats.total}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 rounded-full bg-chart-2" />
            <div>
              <p className="text-sm text-muted-foreground">已完成</p>
              <p className="text-2xl font-bold text-chart-2">{overallStats.completed}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 rounded-full bg-chart-1" />
            <div>
              <p className="text-sm text-muted-foreground">進行中</p>
              <p className="text-2xl font-bold text-chart-1">{overallStats.inProgress}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <div className="h-3 w-3 rounded-full bg-chart-5" />
            <div>
              <p className="text-sm text-muted-foreground">延遲</p>
              <p className="text-2xl font-bold text-chart-5">{overallStats.delayed}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Gauge className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">平均利用率</p>
              <p className="text-2xl font-bold">{overallStats.avgUtilization}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 主要甘特圖 */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">機台排程甘特圖</CardTitle>
              <p className="text-muted-foreground text-sm">
                機台工單時程規劃與進度追蹤 - 共 {machineSchedules.length} 個機台，{overallStats.total} 個工單
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* 時間尺度選擇器 */}
              <Select value={timeScale} onValueChange={handleTimeScaleChange}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">日</SelectItem>
                  <SelectItem value="week">週</SelectItem>
                  <SelectItem value="month">月</SelectItem>
                </SelectContent>
              </Select>
              
              {/* 縮放控制 */}
              <div className="flex items-center gap-1 border rounded-md">
                <Button variant="ghost" size="sm" onClick={() => handleZoom('out')}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="px-2 py-1 text-xs text-muted-foreground min-w-12 text-center">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleZoom('in')}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {/* 導航控制 */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleTimeNavigation('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* 匯出按鈕 */}
              <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
                <Download className="h-4 w-4 mr-2" />
                匯出
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0 flex-1 flex flex-col">
          {/* 甘特圖主體 - 重新設計為上下布局 */}
          <div className="flex-1 flex flex-col">
            {/* 甘特圖區域 */}
            <div className="flex-1 min-h-0">
              <div className="flex h-full">
                {/* 左側機台標籤列 - 更緊湊的設計 */}
                <div className="w-12 flex-shrink-0 bg-muted/20 border-r">
                  <div className="h-12 border-b bg-background flex items-center justify-center">
                    <span className="text-xs font-medium text-muted-foreground rotate-90">機台</span>
                  </div>
                  <div className="space-y-0">
                    {machineSchedules.map((machine) => (
                      <div key={machine.machineId} className="h-16 border-b border-border/10 flex items-center justify-center hover:bg-muted/30 transition-colors">
                        <div className="text-center">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1">
                            <span className="text-xs font-bold text-primary">{machine.machineName}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{machine.totalSystems}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* 時間軸與甘特圖主區域 */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* 時間軸標題 */}
                  <div className="relative h-12 bg-muted/20 border-b overflow-hidden">
                    {timeMarkers.map((marker, idx) => (
                      <div
                        key={idx}
                        className={`absolute top-0 bottom-0 ${marker.isToday ? 'border-l-2 border-primary' : 'border-l border-border/30'}`}
                        style={{ left: `${marker.percent}%` }}
                      >
                        <div className={`absolute top-1 left-1 text-xs whitespace-nowrap ${
                          marker.isToday ? 'text-primary font-medium' : 'text-muted-foreground'
                        }`}>
                          {marker.label}
                        </div>
                      </div>
                    ))}
                    
                    {/* 今日時間線 */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 animate-pulse"
                      style={{ 
                        left: `${((new Date().getTime() - viewRange.start.getTime()) / (viewRange.end.getTime() - viewRange.start.getTime())) * 100}%` 
                      }}
                    >
                      <div className="absolute -top-2 -left-6 text-xs text-primary font-medium bg-background px-1.5 py-0.5 rounded-sm border shadow-sm">
                        今日
                      </div>
                    </div>
                  </div>
                  
                  {/* 甘特圖工單條區域 */}
                  <ScrollArea className="flex-1">
                    <div className="min-h-0">
                      {machineSchedules.map((machine) => (
                        <div key={machine.machineId} className="relative h-16 border-b border-border/10 hover:bg-muted/20 transition-colors group">
                          {/* 背景格線 */}
                          <div className="absolute inset-0 opacity-10">
                            {timeMarkers.map((marker, idx) => (
                              <div
                                key={idx}
                                className="absolute top-0 bottom-0 border-l border-border/20"
                                style={{ left: `${marker.percent}%` }}
                              />
                            ))}
                          </div>
                          
                          {/* 工單進度條 */}
                          {machine.workOrders.map((workOrder) => (
                            <div key={workOrder.id} className="absolute inset-y-2">
                              {renderWorkOrderBar(workOrder)}
                            </div>
                          ))}
                          
                          {/* 無工單提示 */}
                          {machine.workOrders.length === 0 && (
                            <div className="h-full flex items-center justify-center text-sm text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>無排程工單</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
            
            {/* 機台統計列表 - 移到甘特圖下方，更精簡的設計 */}
            <div className="border-t bg-gradient-to-r from-muted/5 to-muted/10">
              <div className="p-3 border-b bg-background/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      機台執行統計
                    </h3>
                    <p className="text-xs text-muted-foreground">點擊進度條查看詳細資訊</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {machineSchedules.length} 個機台
                  </Badge>
                </div>
              </div>
              
              <ScrollArea className="max-h-40">
                <div className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
                    {machineSchedules.map((machine) => (
                      <Card 
                        key={machine.machineId} 
                        className="p-3 hover:shadow-md transition-all duration-200 hover:scale-105 cursor-pointer bg-gradient-to-br from-background to-muted/20"
                        onClick={() => {
                          // 可以添加點擊機台卡片的處理邏輯
                          toast({
                            title: `機台 ${machine.machineName}`,
                            description: `總工單: ${machine.totalSystems}, 完成: ${machine.completedSystems}, 進行: ${machine.ongoingSystems}, 延遲: ${machine.delayedSystems}`
                          });
                        }}
                      >
                        <div className="space-y-3">
                          {/* 機台編號與狀態 */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                                <span className="text-sm font-bold text-primary">{machine.machineName}</span>
                              </div>
                              <div>
                                <div className="text-sm font-medium">機台 {machine.machineName}</div>
                                <div className="text-xs text-muted-foreground">當日 {machine.totalSystems} 單</div>
                              </div>
                            </div>
                            <Badge 
                              variant={machine.utilization > 80 ? 'default' : machine.utilization > 50 ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {machine.utilization}%
                            </Badge>
                          </div>
                          
                          {/* 工單執行統計 */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2 rounded-md bg-chart-2/10 hover:bg-chart-2/20 transition-colors">
                              <div className="text-chart-2 font-bold text-lg">{machine.completedSystems}</div>
                              <div className="text-xs text-muted-foreground">完成</div>
                            </div>
                            <div className="text-center p-2 rounded-md bg-chart-1/10 hover:bg-chart-1/20 transition-colors">
                              <div className="text-chart-1 font-bold text-lg">{machine.ongoingSystems}</div>
                              <div className="text-xs text-muted-foreground">進行</div>
                            </div>
                            <div className="text-center p-2 rounded-md bg-chart-5/10 hover:bg-chart-5/20 transition-colors">
                              <div className="text-chart-5 font-bold text-lg">{machine.delayedSystems}</div>
                              <div className="text-xs text-muted-foreground">延遲</div>
                            </div>
                          </div>
                          
                          {/* 利用率進度條 */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">利用率</span>
                              <span className="font-medium">{machine.utilization}%</span>
                            </div>
                            <Progress 
                              value={machine.utilization} 
                              className="h-2 bg-muted/50" 
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 工單詳情對話框 */}
      <WorkOrderDetailDialog
        workOrder={selectedWorkOrder}
        isOpen={isWorkOrderDialogOpen}
        onOpenChange={setIsWorkOrderDialogOpen}
      />
      
      {/* 匯出對話框 */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="機台排程甘特圖"
        data={machineSchedules}
      />
    </div>
  );
});
const WorkOrderDetailDialog = React.memo(({ 
  workOrder, 
  isOpen, 
  onOpenChange 
}: { 
  workOrder: MachineWorkOrder | null; 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void; 
}) => {
  if (!workOrder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>工單詳情</span>
            <Badge variant={
              workOrder.status === 'completed' ? 'default' : 
              workOrder.status === 'delayed' ? 'destructive' : 
              workOrder.status === 'in_progress' ? 'secondary' : 'outline'
            }>
              {workOrder.status === 'completed' ? '已完成' :
               workOrder.status === 'delayed' ? '延遲' :
               workOrder.status === 'in_progress' ? '進行中' : '未開始'}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 基本資訊 */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">系統名稱</label>
                <p className="text-lg font-semibold">{workOrder.systemName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">機台</label>
                <p>{workOrder.stationName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">負責工程師</label>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{workOrder.assignedEngineer}</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">系統型號</label>
                <p>{workOrder.model || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">序號</label>
                <p>{workOrder.serialNumber || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">優先度</label>
                <Badge variant={
                  workOrder.priority === 'high' ? 'destructive' :
                  workOrder.priority === 'medium' ? 'secondary' : 'outline'
                }>
                  {workOrder.priority === 'high' ? '高' :
                   workOrder.priority === 'medium' ? '中' : '低'}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* 時程資訊 */}
          <div className="space-y-4">
            <h4 className="font-medium">時程資訊</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">預計開始時間</label>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4" />
                  <span>{workOrder.startTime.toLocaleString('zh-TW')}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">預計結束時間</label>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="h-4 w-4" />
                  <span>{workOrder.endTime.toLocaleString('zh-TW')}</span>
                </div>
              </div>
              {workOrder.actualStartTime && (
                <div>
                  <label className="text-sm text-muted-foreground">實際開始時間</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-green-500" />
                    <span>{workOrder.actualStartTime.toLocaleString('zh-TW')}</span>
                  </div>
                </div>
              )}
              {workOrder.actualEndTime && (
                <div>
                  <label className="text-sm text-muted-foreground">實際結束時間</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-green-500" />
                    <span>{workOrder.actualEndTime.toLocaleString('zh-TW')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* 進度資訊 */}
          <div className="space-y-4">
            <h4 className="font-medium">進度資訊</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>完成進度</span>
                <span className="font-medium">{workOrder.progress}%</span>
              </div>
              <Progress value={workOrder.progress} className="h-2" />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{workOrder.itemsCompleted}</div>
                  <div className="text-muted-foreground">已完成項目</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{workOrder.itemsTotal}</div>
                  <div className="text-muted-foreground">總項目數</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">{workOrder.itemsTotal - workOrder.itemsCompleted}</div>
                  <div className="text-muted-foreground">待完成項目</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 工時資訊 */}
          <div className="space-y-4">
            <h4 className="font-medium">工時資訊</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">預估工時</label>
                <p className="text-lg">{workOrder.estimatedHours} 小時</p>
              </div>
              {workOrder.actualHours && (
                <div>
                  <label className="text-sm text-muted-foreground">實際工時</label>
                  <p className="text-lg">{workOrder.actualHours.toFixed(1)} 小時</p>
                </div>
              )}
              {workOrder.actualHours && (
                <div className="col-span-2">
                  <label className="text-sm text-muted-foreground">效率</label>
                  <div className="flex items-center gap-2">
                    <Progress 
                      value={Math.min(100, (workOrder.estimatedHours / workOrder.actualHours) * 100)} 
                      className="flex-1 h-2" 
                    />
                    <span className="text-sm font-medium">
                      {Math.round((workOrder.estimatedHours / workOrder.actualHours) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* 備註 */}
          {workOrder.notes && (
            <div className="space-y-2">
              <h4 className="font-medium">備註</h4>
              <div className="text-sm bg-muted/50 p-3 rounded-md">
                {workOrder.notes}
              </div>
            </div>
          )}
          
          {/* 延遲警告 */}
          {workOrder.isOverdue && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <Clock className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">工單已延遲</p>
                <p className="text-sm text-destructive/80">
                  此工單已超過預計完成時間，請儘快處理
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
