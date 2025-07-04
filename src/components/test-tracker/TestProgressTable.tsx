import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressEditDialog } from "./ProgressEditDialog";

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
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
  getStatusColor: (status: string) => string;
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
  getStatusColor,
}: TestProgressTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>測試進度表</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[1400px]">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 p-4 bg-muted/50 rounded-t-lg border-b">
              <div className="col-span-2 font-semibold">機台編號</div>
              <div className="col-span-1 font-semibold">負責人</div>
              <div className="col-span-1 font-semibold">當前站點</div>
              {stations.map(station => (
                <div key={station.id} className="col-span-2 font-semibold text-center">
                  {station.station_name}
                </div>
              ))}
            </div>

            {/* Data Rows */}
            {filteredSystems.map(system => (
              <div key={system.id} className="grid grid-cols-12 gap-2 p-4 border-b hover:bg-muted/25">
                <div className="col-span-2 font-medium">{system.system_name}</div>
                <div className="col-span-1">
                  <Badge variant="outline">{system.assigned_engineer}</Badge>
                </div>
                <div className="col-span-1">
                  <Badge className={getStatusColor(system.status)}>
                    {system.current_station}
                  </Badge>
                </div>
                
                {stations.map(station => {
                  const stationItems = items.filter(item => item.station_id === station.id);
                  const completedItems = stationItems.filter(item => {
                    const prog = getProgressForSystemItem(system.id, station.id, item.id);
                    return prog?.status === 'Done';
                  });
                  const overallPercent = stationItems.length > 0 
                    ? Math.round((completedItems.length / stationItems.length) * 100) 
                    : 0;

                  return (
                    <div key={station.id} className="col-span-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>進度: {overallPercent}%</span>
                          <ProgressEditDialog
                            systemName={system.system_name}
                            stationName={station.station_name}
                            stationItems={stationItems}
                            progress={progress}
                            editingProgress={editingProgress}
                            setEditingProgress={setEditingProgress}
                            editValues={editValues}
                            setEditValues={setEditValues}
                            getProgressForSystemItem={getProgressForSystemItem}
                            handleEditProgress={handleEditProgress}
                            handleSaveProgress={handleSaveProgress}
                            getStatusColor={getStatusColor}
                            systemId={system.id}
                            stationId={station.id}
                          />
                        </div>
                        <Progress value={overallPercent} className="h-2" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}