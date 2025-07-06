import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MachineTimelineData } from "@/hooks/useMachineTimelineData";

interface MachineDetailDialogProps {
  machine: MachineTimelineData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MachineDetailDialog({ 
  machine, 
  open, 
  onOpenChange 
}: MachineDetailDialogProps) {
  if (!machine) return null;

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '未設定';
    return new Date(dateStr).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done':
        return 'bg-success text-success-foreground';
      case 'On-going':
        return 'bg-warning text-warning-foreground';
      case 'Not Start':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xl font-bold">{machine.system_name}</span>
            <Badge className={getStatusColor(machine.status)}>
              {machine.status}
            </Badge>
            <Badge variant="outline">
              {machine.overall_progress}% 完成
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 系統基本資訊 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">系統資訊</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">負責工程師</span>
                <p className="font-medium">{machine.assigned_engineer || '未分配'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">整體進度</span>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={machine.overall_progress} className="flex-1" />
                  <span className="text-sm font-medium">{machine.overall_progress}%</span>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">開始時間</span>
                <p className="font-medium">{formatDateTime(machine.start_time)}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">完成時間</span>
                <p className="font-medium">{formatDateTime(machine.end_time)}</p>
              </div>
              {machine.duration_hours && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">測試時長</span>
                  <p className="font-medium">{machine.duration_hours.toFixed(1)} 小時</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 測試站點進度 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">測試站點進度</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {machine.stations.map((station) => (
                  <div key={station.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">{station.name}</h4>
                        <Badge 
                          variant="outline"
                          className={getStatusColor(station.status)}
                        >
                          {station.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-medium">{station.progress}%</span>
                    </div>
                    
                    <Progress value={station.progress} className="mb-3" />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">開始時間: </span>
                        <span className="font-medium">{formatDateTime(station.start_time)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">完成時間: </span>
                        <span className="font-medium">{formatDateTime(station.end_time)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}