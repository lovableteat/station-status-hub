
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { EditPermissionWrapper } from "@/components/layout/EditPermissionWrapper";
import { Edit, Clock, User, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
}

interface TestProgressTableProps {
  systems: any[];
  stations: any[];
  items: any[];
  progress: any[];
  engineers: string[];
  filters: {
    system: string;
    station: string;
    engineer: string;
    status: string;
  };
  onFiltersChange: (newFilters: any) => void;
  onProgressUpdate: () => void;
  canEdit?: boolean;
}

export function TestProgressTable({ 
  systems, 
  stations, 
  items, 
  progress, 
  engineers, 
  filters, 
  onFiltersChange, 
  onProgressUpdate,
  canEdit = false
}: TestProgressTableProps) {
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    status: '',
    progress_percent: 0,
    notes: '',
    started_at: '',
    completed_at: ''
  });
  const { toast } = useToast();

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const handleEditProgress = (systemId: string, stationId: string, itemId: string) => {
    const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
    const editKey = `${systemId}-${stationId}-${itemId}`;
    
    if (existingProgress) {
      setEditValues({
        status: existingProgress.status || '',
        progress_percent: existingProgress.progress_percent || 0,
        notes: existingProgress.notes || '',
        started_at: existingProgress.started_at || '',
        completed_at: existingProgress.completed_at || ''
      });
    } else {
      setEditValues({
        status: 'Not Start',
        progress_percent: 0,
        notes: '',
        started_at: '',
        completed_at: ''
      });
    }
    
    setEditingProgress(editKey);
  };

  const handleSaveProgress = async (systemId: string, stationId: string, itemId: string) => {
    try {
      const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
      
      if (existingProgress) {
        await supabase
          .from('test_progress')
          .update(editValues)
          .eq('id', existingProgress.id);
      } else {
        await supabase
          .from('test_progress')
          .insert({
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            ...editValues
          });
      }

      setEditingProgress(null);
      onProgressUpdate();
      
      toast({
        title: "成功",
        description: "測試進度已更新",
      });
    } catch (error) {
      console.error('Error saving progress:', error);
      toast({
        title: "錯誤",
        description: "儲存測試進度時發生錯誤",
        variant: "destructive"
      });
    }
  };

  const handleDeleteProgress = async (systemId: string, stationId: string, itemId: string) => {
    try {
      const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
      if (existingProgress) {
        await supabase
          .from('test_progress')
          .delete()
          .eq('id', existingProgress.id);

        onProgressUpdate();
        
        toast({
          title: "成功",
          description: "測試進度已刪除",
        });
      }
    } catch (error) {
      console.error('Error deleting progress:', error);
      toast({
        title: "錯誤",
        description: "刪除測試進度時發生錯誤",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done':
        return 'bg-green-500 text-white';
      case 'On-going':
        return 'bg-blue-500 text-white';
      case 'Issue':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const groupedData = systems.map(system => {
    const systemId = system.id;
    const systemName = system.system_name;
    const stationsForSystem = stations.map(station => {
      const stationId = station.id;
      const stationName = station.station_name;
      const itemsForStation = items.filter(item => item.station_id === stationId).map(item => {
        const itemId = item.id;
        const itemName = item.item_name;
        const prog = getProgressForSystemItem(systemId, stationId, itemId);
        return {
          itemId,
          itemName,
          progress: prog ? prog.progress_percent : 0,
          status: prog ? prog.status : 'Not Started',
          engineerId: prog ? prog.assigned_to : null,
          startDate: prog ? prog.started_at : null,
          completionDate: prog ? prog.completed_at : null,
          notes: prog ? prog.notes : null
        };
      });
      return {
        stationId,
        stationName,
        items: itemsForStation
      };
    });
    return {
      systemId,
      systemName,
      stations: stationsForSystem
    };
  });

  const handleFilterChange = (field: string, value: string) => {
    onFiltersChange({
      ...filters,
      [field]: value
    });
  };

  // Get current editing context for dialog
  const getEditingContext = () => {
    if (!editingProgress) return null;
    
    const [systemId, stationId] = editingProgress.split('-');
    const system = systems.find(s => s.id === systemId);
    const station = stations.find(s => s.id === stationId);
    const stationItems = items
      .filter(item => item.station_id === stationId)
      .map(item => ({
        ...item,
        description: item.description || ''
      }));
    
    return {
      systemId,
      stationId,
      systemName: system?.system_name || '',
      stationName: station?.station_name || '',
      stationItems
    };
  };

  const editingContext = getEditingContext();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          測試進度表
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <Label htmlFor="system-filter">系統:</Label>
            <Select
              value={filters.system}
              onValueChange={(value) => handleFilterChange('system', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="所有系統" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有系統</SelectItem>
                {systems.map(system => (
                  <SelectItem key={system.id} value={system.id}>{system.system_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="station-filter">站點:</Label>
            <Select
              value={filters.station}
              onValueChange={(value) => handleFilterChange('station', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="所有站點" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有站點</SelectItem>
                {stations.map(station => (
                  <SelectItem key={station.id} value={station.id}>{station.station_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="engineer-filter">工程師:</Label>
            <Select
              value={filters.engineer}
              onValueChange={(value) => handleFilterChange('engineer', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="所有工程師" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有工程師</SelectItem>
                {engineers.map(engineer => (
                  <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status-filter">狀態:</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => handleFilterChange('status', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="所有狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有狀態</SelectItem>
                <SelectItem value="Not Started">未開始</SelectItem>
                <SelectItem value="On-going">進行中</SelectItem>
                <SelectItem value="Done">完成</SelectItem>
                <SelectItem value="Blocked">受阻</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {groupedData.map((systemGroup) => (
            <Card key={systemGroup.systemId} className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle>{systemGroup.systemName}</CardTitle>
              </CardHeader>

              <CardContent className="pt-4">
                <div className="grid gap-3">
                  {systemGroup.stations.map((stationGroup) => (
                    <div key={stationGroup.stationId} className="space-y-2">
                      <h4 className="text-sm font-semibold">{stationGroup.stationName}</h4>

                      <div className="grid gap-2 ml-4">
                        {stationGroup.items.map((item) => (
                          <div
                            key={item.itemId}
                            className="flex items-center justify-between p-3 bg-accent/50 rounded-lg"
                          >
                            <div>
                              <p className="text-sm font-medium">{item.itemName}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge variant={item.status === 'Done' ? 'outline' : 'secondary'}>
                                {item.status}
                              </Badge>
                              <Progress value={item.progress} className="w-24" />
                              {canEdit && (
                                <EditPermissionWrapper module="test-tracker">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditProgress(
                                      systemGroup.systemId,
                                      stationGroup.stationId,
                                      item.itemId
                                    )}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </EditPermissionWrapper>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {editingContext && (
          <EditPermissionWrapper module="test-tracker">
            <ProgressEditDialog
              systemName={editingContext.systemName}
              stationName={editingContext.stationName}
              stationItems={editingContext.stationItems}
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
              systemId={editingContext.systemId}
              stationId={editingContext.stationId}
              onTimeUpdate={onProgressUpdate}
            />
          </EditPermissionWrapper>
        )}
      </CardContent>
    </Card>
  );
}
