
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { StationStatusSelector } from "./StationStatusSelector";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { SystemStatusCalculator, TestSystem, TestStation, TestItem, TestProgress } from "./SystemStatusCalculator";
import { SystemStatusUpdater } from "./SystemStatusUpdater";

interface TestProgressTableProps {
  filteredSystems: TestSystem[];
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
}

export function TestProgressTable({
  filteredSystems,
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
}: TestProgressTableProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleStationStatusChange = async (systemId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({ current_station: newStatus })
        .eq('id', systemId);

      if (error) throw error;

      toast({
        title: "狀態已更新",
        description: `系統狀態已更新為：${newStatus}`,
      });
    } catch (error) {
      console.error('更新站點狀態錯誤:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統狀態",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4">
      {filteredSystems.map((system) => (
        <Card key={system.id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{system.system_name}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {system.assigned_engineer}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <StationStatusSelector
                  currentStatus={system.current_station || '未開始'}
                  onStatusChange={(status) => handleStationStatusChange(system.id, status)}
                  className="min-w-24"
                />
                <div className="text-sm text-gray-600">
                  {system.overall_progress}%
                </div>
              </div>
            </div>
            <Progress value={system.overall_progress} className="h-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stations
                .filter(station => station.station_order >= 0 && station.station_order <= 4)
                .sort((a, b) => a.station_order - b.station_order)
                .map((station) => {
                  const stationItems = items.filter(item => item.station_id === station.id);
                  
                  return (
                    <div key={station.id} className="border rounded-lg p-3">
                      <h4 className="font-medium text-sm mb-2">{station.station_name}</h4>
                      <div className="grid gap-2">
                        {stationItems.map((item) => {
                          const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                          const editKey = `${system.id}-${station.id}-${item.id}`;
                          const isEditing = editingProgress === editKey;
                          
                          return (
                            <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                              <div className="flex-1">
                                <div className="font-medium">{item.item_name}</div>
                                {itemProgress?.notes && (
                                  <div className="text-xs text-gray-600 mt-1">{itemProgress.notes}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={itemProgress?.status === 'Done' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {itemProgress?.status || 'Not Start'}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditProgress(system.id, station.id, item.id)}
                                  className="h-6 px-2 text-xs"
                                >
                                  編輯
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
