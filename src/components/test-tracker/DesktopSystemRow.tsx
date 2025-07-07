
import { Badge } from "@/components/ui/badge";
import { SystemEditDialog } from "./SystemEditDialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { cn } from "@/lib/utils";
import { SystemStatusCalculator } from "./SystemStatusCalculator";
import { SystemTimeManager } from "./SystemTimeManager";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { ProgressEditDialog } from "./ProgressEditDialog";

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

interface DesktopSystemRowProps {
  system: TestSystem;
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
  gridColumns: string;
}

export function DesktopSystemRow({
  system,
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
  gridColumns,
}: DesktopSystemRowProps) {
  const { toast } = useToast();

  const calculatedStatus = SystemStatusCalculator.calculateSystemStatus(
    system.id,
    stations,
    items,
    getProgressForSystemItem
  );

  const systemStartTime = SystemStatusCalculator.getSystemEarliestStartTime(
    system.id,
    stations,
    items,
    getProgressForSystemItem
  );

  const systemEndTime = SystemStatusCalculator.getSystemLatestCompletionTime(
    system.id,
    stations,
    items,
    getProgressForSystemItem
  );

  const filteredStations = stations
    .filter(station => station.station_order >= 0 && station.station_order <= 4)
    .sort((a, b) => a.station_order - b.station_order);

  const handleValidationError = (error: string | null) => {
    if (error) {
      toast({
        title: "時間設定錯誤",
        description: error,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grid gap-2 p-4 border-b hover:bg-muted/25" style={{ gridTemplateColumns: gridColumns }}>
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
      <div className="flex flex-col gap-1">
        <Badge 
          variant="secondary" 
          className={cn(
            "px-2 py-1 rounded-full font-medium text-xs w-fit",
            calculatedStatus.status === '已完成' 
              ? "bg-green-500 text-white" 
              : calculatedStatus.status === '進行中'
              ? "bg-warning text-warning-foreground"
              : "bg-gray-500 text-white"
          )}
        >
          {calculatedStatus.currentStation}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {calculatedStatus.status} ({calculatedStatus.progressSum}/5)
        </span>
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
            await SystemTimeManager.updateSystemTime(
              system.id,
              'start',
              newStartTime,
              progress,
              filteredStations,
              onSystemUpdate,
              toast
            );
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
            await SystemTimeManager.updateSystemTime(
              system.id,
              'end',
              newEndTime,
              progress,
              filteredStations,
              onSystemUpdate,
              toast
            );
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
          value={system.actual_completed_at || systemEndTime}
          onChange={async (newActualTime) => {
            await SystemTimeManager.updateActualCompletionTime(
              system.id,
              newActualTime,
              onSystemUpdate,
              toast
            );
          }}
          onValidationError={handleValidationError}
          placeholder="實際完成時間"
          className="w-full text-xs"
        />
      </div>
    </div>
  );
}
