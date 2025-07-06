import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Monitor, Play, User } from "lucide-react";

interface UnifiedSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
}

interface SystemProgressInfo {
  system: UnifiedSystem;
  progress: number;
  status: string;
  test_items_completed: number;
  test_items_total: number;
}

interface SystemSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  systems: UnifiedSystem[];
  systemProgress: SystemProgressInfo[];
  onSystemSelect: (systemName: string) => void;
}

export function SystemSelectionDialog({
  open,
  onOpenChange,
  stationName,
  systems,
  systemProgress,
  onSystemSelect
}: SystemSelectionDialogProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-primary text-primary-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleSystemSelect = (systemName: string) => {
    onSystemSelect(systemName);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {stationName} - 系統選擇
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            該站點共有 {systems.length} 台系統正在處理，請選擇要查看的系統：
          </p>
          
          <div className="grid gap-4">
            {systems.map((system) => {
              const progressInfo = systemProgress.find(sp => sp.system.id === system.id);
              
              return (
                <div
                  key={system.id}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSystemSelect(system.system_name)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{system.system_name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        {system.assigned_engineer}
                      </div>
                      {system.model && (
                        <div className="text-sm text-muted-foreground">
                          型號: {system.model}
                        </div>
                      )}
                    </div>
                    <Badge className={getStatusColor(system.status)} variant="outline">
                      <Play className="h-3 w-3 mr-1" />
                      {system.status === 'Done' ? '已完成' : system.status === 'On-going' ? '進行中' : '未開始'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>整體進度</span>
                      <span>{system.overall_progress}%</span>
                    </div>
                    <Progress value={system.overall_progress} className="h-2" />
                    
                    {progressInfo && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>站點進度: {progressInfo.progress}%</span>
                        <span>
                          測試項目: {progressInfo.test_items_completed}/{progressInfo.test_items_total}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <Button 
                    className="w-full mt-3" 
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSystemSelect(system.system_name);
                    }}
                  >
                    查看詳情
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}