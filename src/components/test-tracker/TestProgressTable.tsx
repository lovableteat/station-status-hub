
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Edit, ExternalLink, FileText, Clock } from "lucide-react";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { ExportManager } from "./ExportManager";
import { FilterControls } from "./FilterControls";
import { format } from "date-fns";

export function TestProgressTable() {
  const { systems, stations, items, progress, loadData } = useTestTrackerData();
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [filteredSystems, setFilteredSystems] = useState(systems);

  useEffect(() => {
    setFilteredSystems(systems);
  }, [systems]);

  const handleEditProgress = (systemId: string, stationId: string, itemId: string) => {
    setSelectedSystem(systemId);
    setSelectedStation(stationId);
    setSelectedItem(itemId);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedSystem(null);
    setSelectedStation(null);
    setSelectedItem(null);
    loadData();
  };

  const getProgressData = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Done':
        return <Badge className="bg-green-100 text-green-800 border-green-300">完成</Badge>;
      case 'On-going':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">進行中</Badge>;
      case 'Issue':
        return <Badge className="bg-red-100 text-red-800 border-red-300">問題</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">未開始</Badge>;
    }
  };

  // Calculate system completion time (when all stations are 100% complete)
  const getSystemCompletionTime = (systemId: string) => {
    const system = systems.find(s => s.id === systemId);
    if (!system || system.status !== 'Done') return null;
    
    // Find the latest completion time among all stations for this system
    let latestCompletionTime = null;
    
    stations.forEach(station => {
      const stationItems = items.filter(item => item.station_id === station.id);
      const stationProgress = progress.filter(p => 
        p.system_id === systemId && p.station_id === station.id
      );
      
      // Check if all items in this station are completed
      const allItemsCompleted = stationItems.every(item => {
        const itemProgress = stationProgress.find(p => p.item_id === item.id);
        return itemProgress && itemProgress.status === 'Done';
      });
      
      if (allItemsCompleted) {
        // Find the latest completion time in this station
        stationProgress.forEach(p => {
          if (p.status === 'Done' && p.completed_at) {
            const completionTime = new Date(p.completed_at);
            if (!latestCompletionTime || completionTime > latestCompletionTime) {
              latestCompletionTime = completionTime;
            }
          }
        });
      }
    });
    
    return latestCompletionTime;
  };

  const calculateSystemProgress = (systemId: string) => {
    const totalItems = items.length;
    if (totalItems === 0) return 0;
    
    const completedItems = progress.filter(p => 
      p.system_id === systemId && p.status === 'Done'
    ).length;
    
    return Math.round((completedItems / totalItems) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">測試進度表</h2>
        <ExportManager 
          systems={filteredSystems} 
          stations={stations} 
          progress={progress} 
        />
      </div>

      <FilterControls 
        searchTerm=""
        setSearchTerm={() => {}}
        filterEngineer=""
        setFilterEngineer={() => {}}
        filterStatus=""
        setFilterStatus={() => {}}
        engineers={[]}
      />

      <Card>
        <CardHeader>
          <CardTitle>系統測試進度總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>系統名稱</TableHead>
                  <TableHead>整體進度</TableHead>
                  <TableHead>當前站點</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>實際完成</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSystems.map((system) => {
                  const systemProgress = calculateSystemProgress(system.id);
                  const completionTime = getSystemCompletionTime(system.id);
                  
                  return (
                    <TableRow key={system.id}>
                      <TableCell className="font-medium">{system.system_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Progress value={systemProgress} className="w-24" />
                          <span className="text-sm">{systemProgress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{system.current_station}</TableCell>
                      <TableCell>{getStatusBadge(system.status)}</TableCell>
                      <TableCell>
                        {completionTime ? (
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {format(completionTime, 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            // Navigate to system detail or show more options
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Progress Table */}
      <Card>
        <CardHeader>
          <CardTitle>詳細測試項目進度</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>系統</TableHead>
                  <TableHead>站點</TableHead>
                  <TableHead>測試項目</TableHead>
                  <TableHead>進度</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>開始時間</TableHead>
                  <TableHead>完成時間</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSystems.map((system) =>
                  stations.map((station) =>
                    items.filter(item => item.station_id === station.id).map((item) => {
                      const progressData = getProgressData(system.id, station.id, item.id);
                      
                      return (
                        <TableRow key={`${system.id}-${station.id}-${item.id}`}>
                          <TableCell className="font-medium">{system.system_name}</TableCell>
                          <TableCell>{station.station_name}</TableCell>
                          <TableCell>{item.item_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Progress value={progressData?.progress_percent || 0} className="w-16" />
                              <span className="text-sm">{progressData?.progress_percent || 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(progressData?.status || 'Not Start')}</TableCell>
                          <TableCell>
                            {progressData?.started_at ? (
                              <span className="text-sm">
                                {format(new Date(progressData.started_at), 'MM-dd HH:mm')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {progressData?.completed_at ? (
                              <span className="text-sm">
                                {format(new Date(progressData.completed_at), 'MM-dd HH:mm')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {progressData?.notes || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditProgress(system.id, station.id, item.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Progress Edit Dialog */}
      {isEditDialogOpen && selectedSystem && selectedStation && selectedItem && (
        <ProgressEditDialog
          systemId={selectedSystem}
          stationId={selectedStation}
          itemId={selectedItem}
          currentProgress={getProgressData(selectedSystem, selectedStation, selectedItem)}
          onClose={handleCloseEditDialog}
        />
      )}
    </div>
  );
}
