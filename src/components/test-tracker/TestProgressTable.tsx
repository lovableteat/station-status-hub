
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Edit,
  Eye,
  Clock,
  User,
  Settings,
  Target,
  CheckCircle,
  XCircle,
  Pause,
  Play
} from "lucide-react";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";

interface TestProgressTableProps {
  systems: any[];
  stations: any[];
  items: any[];
  progress: any[];
}

export function TestProgressTable({ systems, stations, items, progress }: TestProgressTableProps) {
  const { updateProgress } = useTestTrackerData();
  const [selectedSystem, setSelectedSystem] = useState<any>(null);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [selectedProgress, setSelectedProgress] = useState<any>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const handleEditProgress = (system: any, station: any, item: any) => {
    const existingProgress = progress.find(p => 
      p.system_id === system.id && 
      p.station_id === station.id && 
      p.item_id === item.id
    );
    
    setSelectedProgress({
      system,
      station,
      item,
      progress: existingProgress
    });
    setShowProgressDialog(true);
  };

  const handleViewSystemDetail = (system: any) => {
    setSelectedSystem(system);
    setShowDetailDialog(true);
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "font-medium";
    switch (status) {
      case 'Done':
        return <Badge className={`${baseClasses} bg-green-900 text-green-200 border-green-700`}>完成</Badge>;
      case 'On-going':
        return <Badge className={`${baseClasses} bg-orange-900 text-orange-200 border-orange-700`}>進行中</Badge>;
      case 'Not Start':
        return <Badge className={`${baseClasses} bg-slate-700 text-slate-300 border-slate-600`}>未開始</Badge>;
      default:
        return <Badge className={`${baseClasses} bg-slate-700 text-slate-300 border-slate-600`}>{status}</Badge>;
    }
  };

  const getItemStatusIcon = (status: string) => {
    switch (status) {
      case 'Done':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'On-going':
        return <Play className="h-4 w-4 text-orange-400" />;
      case 'Pause':
        return <Pause className="h-4 w-4 text-yellow-400" />;
      default:
        return <XCircle className="h-4 w-4 text-slate-500" />;
    }
  };

  const getProgressForItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const getSystemProgress = (system: any) => {
    const systemStations = stations.filter(s => [0, 1, 2, 3].includes(s.station_order));
    let totalWeight = 0;
    let completedWeight = 0;

    systemStations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      stationItems.forEach(item => {
        totalWeight += 1;
        const itemProgress = getProgressForItem(system.id, station.id, item.id);
        if (itemProgress?.status === 'Done') {
          completedWeight += 1;
        }
      });
    });

    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  };

  if (!systems.length) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center">
          <Target className="h-12 w-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400">尚無測試系統資料</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Systems Grid */}
      <div className="grid gap-6">
        {systems.map((system) => {
          const systemStations = stations
            .filter(s => [0, 1, 2, 3].includes(s.station_order))
            .sort((a, b) => a.station_order - b.station_order);
          
          const systemProgress = getSystemProgress(system);

          return (
            <Card key={system.id} className="bg-slate-800 border-slate-700 hover:bg-slate-750 transition-colors">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <CardTitle className="text-lg text-white">{system.system_name}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {system.assigned_engineer || '未指派'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Settings className="h-4 w-4" />
                          {system.current_station}
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="h-4 w-4" />
                          {systemProgress}%
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(system.status)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSystemDetail(system)}
                      className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 hover:text-white"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      詳情
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {systemStations.map((station) => {
                    const stationItems = items
                      .filter(item => item.station_id === station.id)
                      .sort((a, b) => a.item_order - b.item_order);

                    return (
                      <div key={station.id} className="border border-slate-700 rounded-lg p-4 bg-slate-750">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-medium text-white flex items-center gap-2">
                            <Settings className="h-4 w-4 text-blue-400" />
                            {station.station_name}
                          </h4>
                          <Badge variant="outline" className="text-slate-300 border-slate-600">
                            {station.estimated_hours || 0}h
                          </Badge>
                        </div>
                        
                        <div className="grid gap-3">
                          {stationItems.map((item) => {
                            const itemProgress = getProgressForItem(system.id, station.id, item.id);
                            const status = itemProgress?.status || 'Not Start';
                            
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 bg-slate-700 rounded border border-slate-600 hover:bg-slate-650 transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  {getItemStatusIcon(status)}
                                  <div className="flex-1">
                                    <div className="font-medium text-white text-sm">{item.item_name}</div>
                                    {item.description && (
                                      <div className="text-xs text-slate-400 mt-1">{item.description}</div>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {item.estimated_minutes || 30}min
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  {itemProgress && (
                                    <div className="text-xs text-slate-300">
                                      {itemProgress.progress_percent || 0}%
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditProgress(system, station, item)}
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-600"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          
                          {stationItems.length === 0 && (
                            <div className="text-center py-4 text-slate-500 text-sm">
                              此站點尚無測試項目
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Progress Edit Dialog */}
      {showProgressDialog && selectedProgress && (
        <ProgressEditDialog
          open={showProgressDialog}
          onOpenChange={setShowProgressDialog}
          system={selectedProgress.system}
          station={selectedProgress.station}
          item={selectedProgress.item}
          progress={selectedProgress.progress}
          onUpdate={updateProgress}
        />
      )}

      {/* System Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedSystem?.system_name} - 系統詳情
            </DialogTitle>
          </DialogHeader>
          {selectedSystem && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">系統名稱</p>
                  <p className="font-medium text-white">{selectedSystem.system_name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">指派工程師</p>
                  <p className="font-medium text-white">{selectedSystem.assigned_engineer || '未指派'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">目前站點</p>
                  <p className="font-medium text-white">{selectedSystem.current_station}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">整體進度</p>
                  <p className="font-medium text-white">{selectedSystem.overall_progress || 0}%</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-slate-400 mb-2">狀態</p>
                {getStatusBadge(selectedSystem.status)}
              </div>

              {selectedSystem.actual_started_at && (
                <div>
                  <p className="text-sm text-slate-400">開始時間</p>
                  <p className="font-medium text-white">
                    {new Date(selectedSystem.actual_started_at).toLocaleString('zh-TW')}
                  </p>
                </div>
              )}

              {selectedSystem.actual_completed_at && (
                <div>
                  <p className="text-sm text-slate-400">完成時間</p>
                  <p className="font-medium text-white">
                    {new Date(selectedSystem.actual_completed_at).toLocaleString('zh-TW')}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
