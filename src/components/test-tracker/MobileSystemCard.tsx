
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemEditDialog } from "./SystemEditDialog";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { cn } from "@/lib/utils";
import { SystemStatusCalculator } from "./SystemStatusCalculator";
import { SystemTimeManager } from "./SystemTimeManager";
import { useToast } from "@/hooks/use-toast";

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

interface MobileSystemCardProps {
  system: TestSystem;
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  onSystemUpdate: () => void;
}

export function MobileSystemCard({
  system,
  stations,
  items,
  progress,
  getProgressForSystemItem,
  onSystemUpdate,
}: MobileSystemCardProps) {
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
    <Card className="border-2">
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
                calculatedStatus.status === '已完成' 
                  ? "bg-green-500 text-white" 
                  : calculatedStatus.status === '進行中'
                  ? "bg-warning text-warning-foreground"
                  : "bg-gray-500 text-white"
              )}
            >
              {calculatedStatus.currentStation} - {calculatedStatus.status}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">進度總和:</span>
            <span className="text-sm font-medium">{calculatedStatus.progressSum}/5</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">預計開始時間:</span>
            <div className="flex flex-col items-end">
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
                className="w-44"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">實際完成時間:</span>
            <div className="flex flex-col items-end">
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
                className="w-44"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Station details can be added here if needed */}
      </CardContent>
    </Card>
  );
}
