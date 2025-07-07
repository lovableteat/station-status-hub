
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { SystemStatusUpdater } from "./SystemStatusUpdater";
import { MobileSystemCard } from "./MobileSystemCard";
import { DesktopSystemRow } from "./DesktopSystemRow";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  actual_completed_at?: string;
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
}: TestProgressTableProps) {
  const isMobile = useIsMobile();
  
  // Show all stations ordered by station_order
  const filteredStations = stations
    .filter(station => station.station_order >= 0 && station.station_order <= 4)
    .sort((a, b) => a.station_order - b.station_order);

  // Mobile card view
  if (isMobile) {
    return (
      <>
        <SystemStatusUpdater
          filteredSystems={filteredSystems}
          stations={stations}
          items={items}
          progress={progress}
          getProgressForSystemItem={getProgressForSystemItem}
          onSystemUpdate={onSystemUpdate}
        />
        <div className="space-y-4">
          {filteredSystems.map(system => (
            <MobileSystemCard
              key={system.id}
              system={system}
              stations={stations}
              items={items}
              progress={progress}
              getProgressForSystemItem={getProgressForSystemItem}
              onSystemUpdate={onSystemUpdate}
            />
          ))}
        </div>
      </>
    );
  }

  // Desktop table view
  const gridColumns = `120px 90px repeat(${filteredStations.length}, 130px) 160px 160px 140px`;

  return (
    <>
      <SystemStatusUpdater
        filteredSystems={filteredSystems}
        stations={stations}
        items={items}
        progress={progress}
        getProgressForSystemItem={getProgressForSystemItem}
        onSystemUpdate={onSystemUpdate}
      />
      <Card>
        <CardHeader>
          <CardTitle>GB300 L10 測試進度表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              {/* Header Row */}
              <div className="grid gap-2 p-4 bg-muted/50 rounded-t-lg border-b" style={{ gridTemplateColumns: gridColumns }}>
                <div className="font-semibold">機台編號</div>
                <div className="font-semibold">當前站點</div>
                {filteredStations.map(station => (
                  <div key={station.id} className="font-semibold text-center">
                    {station.station_name}
                  </div>
                ))}
                <div className="font-semibold text-center text-sm">預計開始</div>
                <div className="font-semibold text-center text-sm">預計完成</div>
                <div className="font-semibold text-center text-sm">實際完成</div>
              </div>

              {/* Data Rows */}
              {filteredSystems.map(system => (
                <DesktopSystemRow
                  key={system.id}
                  system={system}
                  stations={stations}
                  items={items}
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
                  onSystemUpdate={onSystemUpdate}
                  gridColumns={gridColumns}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
