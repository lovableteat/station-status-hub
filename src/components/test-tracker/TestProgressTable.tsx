
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SystemEditDialog } from "./SystemEditDialog";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ArrowRight, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
  systems: TestSystem[];
  stations: TestStation[];
  testItems: TestItem[];
  progress: TestProgress[];
  onProgressUpdate: (
    systemId: string,
    stationId: string,
    itemId: string,
    updates: Partial<TestProgress>
  ) => Promise<boolean>;
  onNavigate?: (module: string, params?: any) => void;
}

export function TestProgressTable({
  systems,
  stations,
  testItems,
  progress,
  onProgressUpdate,
  onNavigate
}: TestProgressTableProps) {
  const [editingSystem, setEditingSystem] = useState<TestSystem | null>(null);

  const handleSystemUpdate = async () => {
    // Refresh the data after system update
    window.location.reload();
  };

  const getProgressStatus = (systemId: string, stationId: string, itemId: string) => {
    const progressItem = progress.find(
      (p) =>
        p.system_id === systemId &&
        p.station_id === stationId &&
        p.item_id === itemId
    );
    return progressItem ? progressItem.status : "Not Started";
  };

  const getProgressPercent = (systemId: string, stationId: string, itemId: string) => {
    const progressItem = progress.find(
      (p) =>
        p.system_id === systemId &&
        p.station_id === stationId &&
        p.item_id === itemId
    );
    return progressItem ? progressItem.progress_percent : 0;
  };

  const handleNavigateToStation = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  const handleSystemDetailView = (systemId: string) => {
    onNavigate?.('detail', { system: systemId });
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">系統名稱</TableHead>
            {stations.map((station) => (
              <TableHead key={station.id} className="w-[150px] cursor-pointer" onClick={() => handleNavigateToStation(station.id)}>
                {station.station_name}
              </TableHead>
            ))}
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {systems.map((system) => (
            <TableRow key={system.id}>
              <TableCell className="font-medium">{system.system_name}</TableCell>
              {stations.map((station) => {
                const itemsForStation = testItems.filter(
                  (item) => item.station_id === station.id
                );

                if (itemsForStation.length === 0) {
                  return <TableCell key={station.id}>No Items</TableCell>;
                }

                const completedItems = itemsForStation.filter(item => {
                  const progressItem = progress.find(
                    (p) =>
                      p.system_id === system.id &&
                      p.station_id === station.id &&
                      p.item_id === item.id
                  );
                  return progressItem && progressItem.status === 'Done';
                }).length;
                
                const allDone = completedItems === itemsForStation.length;

                return (
                  <TableCell key={station.id}>
                    <div className="flex flex-col space-y-1">
                      <Progress value={Math.round((completedItems / itemsForStation.length) * 100)} />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{completedItems}/{itemsForStation.length}</span>
                        <span>{Math.round((completedItems / itemsForStation.length) * 100)}%</span>
                      </div>
                      <div className="flex items-center justify-center">
                        {allDone ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                    </div>
                  </TableCell>
                );
              })}
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingSystem(system)}>
                      編輯
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSystemDetailView(system.id)}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      查看詳細
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingSystem && (
        <SystemEditDialog
          isOpen={!!editingSystem}
          onClose={() => setEditingSystem(null)}
          system={editingSystem}
          onUpdate={handleSystemUpdate}
        />
      )}
    </div>
  );
}
