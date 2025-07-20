import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { EditPermissionWrapper } from "@/components/layout/EditPermissionWrapper";
import { Edit, Clock, User, FileText } from "lucide-react";

interface TestProgressTableProps {
  systems: any[];
  stations: any[];
  items: any[];
  progress: any[];
  engineers: any[];
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
  const [editingProgress, setEditingProgress] = useState<{
    systemId: string;
    stationId: string;
    itemId: string;
  } | null>(null);

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const handleEditProgress = (systemId: string, stationId: string, itemId: string) => {
    setEditingProgress({ systemId, stationId, itemId });
  };

  const handleCloseEditDialog = () => {
    setEditingProgress(null);
    onProgressUpdate();
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
          progress: prog ? prog.progress : 0,
          status: prog ? prog.status : 'Not Started',
          engineerId: prog ? prog.engineer_id : null,
          startDate: prog ? prog.start_date : null,
          completionDate: prog ? prog.completion_date : null,
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
              id="system-filter"
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
              id="station-filter"
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
              id="engineer-filter"
              value={filters.engineer}
              onValueChange={(value) => handleFilterChange('engineer', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="所有工程師" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有工程師</SelectItem>
                {engineers.map(engineer => (
                  <SelectItem key={engineer.id} value={engineer.id}>{engineer.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status-filter">狀態:</Label>
            <Select
              id="status-filter"
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

        {/* Progress Edit Dialog */}
        <EditPermissionWrapper module="test-tracker">
          <ProgressEditDialog
            isOpen={editingProgress !== null}
            onClose={handleCloseEditDialog}
            systemId={editingProgress?.systemId || ''}
            stationId={editingProgress?.stationId || ''}
            itemId={editingProgress?.itemId || ''}
          />
        </EditPermissionWrapper>
      </CardContent>
    </Card>
  );
}
