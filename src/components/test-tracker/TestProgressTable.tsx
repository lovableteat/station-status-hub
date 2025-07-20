
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Plus, Settings, RotateCcw, Download, FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemResetDialog } from "./SystemResetDialog";
import { TestManagementPanel } from "./TestManagementPanel";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
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
  getStatusColor: (status: string) => string;
  onSystemUpdate: () => void;
  canEdit: boolean;
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
  getStatusColor,
  onSystemUpdate,
  canEdit
}: TestProgressTableProps) {
  const [selectedSystem, setSelectedSystem] = useState<TestSystem | null>(null);
  const [selectedStation, setSelectedStation] = useState<TestStation | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSystemEditDialog, setShowSystemEditDialog] = useState(false);
  const [showSystemResetDialog, setShowSystemResetDialog] = useState(false);
  const [showManagementPanel, setShowManagementPanel] = useState(false);

  const handleSystemClick = (system: TestSystem) => {
    setSelectedSystem(system);
    setShowSystemEditDialog(true);
  };

  const handleStationClick = (system: TestSystem, station: TestStation) => {
    setSelectedSystem(system);
    setSelectedStation(station);
    setShowEditDialog(true);
  };

  const getStationProgress = (systemId: string, stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const completedItems = stationItems.filter(item => {
      const itemProgress = getProgressForSystemItem(systemId, stationId, item.id);
      return itemProgress && itemProgress.status === 'Done';
    });
    
    return stationItems.length > 0 ? Math.round((completedItems.length / stationItems.length) * 100) : 0;
  };

  const getStationStatus = (systemId: string, stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const allProgress = stationItems.map(item => getProgressForSystemItem(systemId, stationId, item.id));
    
    if (allProgress.every(p => p && p.status === 'Done')) return 'Done';
    if (allProgress.some(p => p && p.status === 'On-going')) return 'On-going';
    if (allProgress.some(p => p && p.status === 'Issue')) return 'Issue';
    return 'Not Start';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle>測試進度總覽</CardTitle>
            {canEdit && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowManagementPanel(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  測試管理
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="grid grid-cols-1 gap-4">
                {/* Header */}
                <div className="grid grid-cols-8 gap-4 p-4 bg-muted/20 rounded-lg font-medium text-sm">
                  <div>系統名稱</div>
                  <div>負責工程師</div>
                  <div>Station 0</div>
                  <div>Station 1</div>
                  <div>Station 2</div>
                  <div>Station 3</div>
                  <div>總進度</div>
                  <div>狀態</div>
                </div>

                {/* System rows */}
                {filteredSystems.map(system => (
                  <div key={system.id} className="grid grid-cols-8 gap-4 p-4 border rounded-lg hover:bg-muted/10">
                    <div 
                      className="font-medium cursor-pointer hover:text-primary"
                      onClick={() => canEdit && handleSystemClick(system)}
                    >
                      {system.system_name}
                    </div>
                    <div>{system.assigned_engineer}</div>
                    
                    {/* Station progress columns */}
                    {stations.filter(s => s.station_order >= 0 && s.station_order <= 3).map(station => {
                      const progress = getStationProgress(system.id, station.id);
                      const status = getStationStatus(system.id, station.id);
                      
                      return (
                        <div key={station.id} className="space-y-1">
                          <div 
                            className={`text-sm px-2 py-1 rounded cursor-pointer ${getStatusColor(status)}`}
                            onClick={() => canEdit && handleStationClick(system, station)}
                          >
                            {progress}%
                          </div>
                          <div className="text-xs text-muted-foreground">{status}</div>
                        </div>
                      );
                    })}
                    
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{system.overall_progress}%</div>
                      <div className="w-full bg-muted h-2 rounded">
                        <div 
                          className="bg-primary h-2 rounded transition-all duration-300"
                          style={{ width: `${system.overall_progress}%` }}
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(system.status)}>
                        {system.status}
                      </Badge>
                      {canEdit && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSelectedSystem(system);
                            setShowSystemResetDialog(true);
                          }}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Edit Dialog */}
      {showEditDialog && selectedSystem && selectedStation && (
        <ProgressEditDialog
          systemName={selectedSystem.system_name}
          stationName={selectedStation.station_name}
          stationItems={items.filter(item => item.station_id === selectedStation.id)}
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
          systemId={selectedSystem.id}
          stationId={selectedStation.id}
          onTimeUpdate={onSystemUpdate}
          onClose={() => setShowEditDialog(false)}
        />
      )}

      {/* System Edit Dialog */}
      {showSystemEditDialog && selectedSystem && (
        <SystemEditDialog
          systemId={selectedSystem.id}
          systemName={selectedSystem.system_name}
          assignedEngineer={selectedSystem.assigned_engineer}
          onUpdate={onSystemUpdate}
        />
      )}

      {/* System Reset Dialog */}
      {showSystemResetDialog && selectedSystem && (
        <SystemResetDialog
          systemId={selectedSystem.id}
          systemName={selectedSystem.system_name}
          onReset={onSystemUpdate}
        />
      )}

      {/* Test Management Panel */}
      {showManagementPanel && (
        <TestManagementPanel />
      )}
    </div>
  );
}
