import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";

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
  onSystemUpdate: () => void;
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
  onSystemUpdate,
}: TestProgressTableProps) {
  // Filter stations to only show Station 0-3
  const filteredStations = stations.filter(station => 
    station.station_order >= 0 && station.station_order <= 3
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>測試進度表</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[1400px]">
            {/* Header Row */}
            <div className="grid gap-2 p-4 bg-muted/50 rounded-t-lg border-b" style={{ gridTemplateColumns: `2fr 1fr 1fr repeat(${filteredStations.length}, 2fr)` }}>
              <div className="font-semibold">機台編號</div>
              <div className="font-semibold">負責人</div>
              <div className="font-semibold">當前站點</div>
              {filteredStations.map(station => (
                <div key={station.id} className="font-semibold text-center">
                  {station.station_name}
                </div>
              ))}
            </div>

            {/* Data Rows */}
            {filteredSystems.map(system => (
              <div key={system.id} className="grid gap-2 p-4 border-b hover:bg-muted/25" style={{ gridTemplateColumns: `2fr 1fr 1fr repeat(${filteredStations.length}, 2fr)` }}>
                <div className="flex items-center gap-2">
                  <button 
                    className="font-medium text-primary hover:underline cursor-pointer text-left"
                    onClick={() => {
                      // Navigate to production monitor with focus on specific system
                      const currentUrl = new URL(window.location.href);
                      currentUrl.searchParams.set('system', system.system_name);
                      window.history.pushState({}, '', currentUrl.toString());
                      
                      // Dispatch custom event to trigger navigation
                      const event = new CustomEvent('navigate', { 
                        detail: { module: 'monitor', params: { system: system.system_name } } 
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    {system.system_name}
                  </button>
                  <SystemEditDialog
                    systemId={system.id}
                    systemName={system.system_name}
                    assignedEngineer={system.assigned_engineer}
                    onUpdate={onSystemUpdate}
                  />
                </div>
                <div>
                  <SystemEditDialog
                    systemId={system.id}
                    systemName={system.system_name}
                    assignedEngineer={system.assigned_engineer}
                    onUpdate={onSystemUpdate}
                    variant="button"
                  />
                </div>
                <div>
                  <Badge 
                    variant="secondary" 
                    className="bg-warning text-warning-foreground px-3 py-1 rounded-full font-medium"
                  >
                    {system.current_station}
                  </Badge>
                </div>
                
                {filteredStations.map(station => {
                  const stationItems = items.filter(item => item.station_id === station.id);
                  const completedItems = stationItems.filter(item => {
                    const prog = getProgressForSystemItem(system.id, station.id, item.id);
                    return prog?.status === 'Done';
                  });
                  const overallPercent = stationItems.length > 0 
                    ? Math.round((completedItems.length / stationItems.length) * 100) 
                    : 0;

                  return (
                    <div key={station.id}>
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