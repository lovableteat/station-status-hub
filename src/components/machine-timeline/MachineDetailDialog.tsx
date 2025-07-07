import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MachineTimelineData } from "@/hooks/useMachineTimelineData";

interface MachineDetailDialogProps {
  machine: MachineTimelineData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MachineDetailDialog({ machine, isOpen, onClose }: MachineDetailDialogProps) {
  if (!machine) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{machine.system_name} 詳細資訊</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">機台編號</p>
              <p className="font-medium">{machine.system_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">整體進度</p>
              <p className="font-medium">{machine.overall_progress}%</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">狀態</p>
              <p className="font-medium">{machine.status}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">目前工站</p>
              <p className="font-medium">{machine.current_station || '尚未開始'}</p>
            </div>
          </div>
          
          {machine.planned_start_time && (
            <div>
              <p className="text-sm text-muted-foreground">預計開始時間</p>
              <p className="font-medium">
                {new Date(machine.planned_start_time).toLocaleString('zh-TW')}
              </p>
            </div>
          )}
          
          {machine.planned_end_time && (
            <div>
              <p className="text-sm text-muted-foreground">預計結束時間</p>
              <p className="font-medium">
                {new Date(machine.planned_end_time).toLocaleString('zh-TW')}
              </p>
            </div>
          )}
          
          {machine.actual_start_time && (
            <div>
              <p className="text-sm text-muted-foreground">實際開始時間</p>
              <p className="font-medium">
                {new Date(machine.actual_start_time).toLocaleString('zh-TW')}
              </p>
            </div>
          )}
          
          {machine.actual_end_time && (
            <div>
              <p className="text-sm text-muted-foreground">實際完成時間</p>
              <p className="font-medium">
                {new Date(machine.actual_end_time).toLocaleString('zh-TW')}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}