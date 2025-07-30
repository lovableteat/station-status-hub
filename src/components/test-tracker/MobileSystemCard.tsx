import React, { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SystemEditDialog } from "./SystemEditDialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
  actual_started_at?: string;
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

interface MobileSystemCardProps {
  system: TestSystem;
  onProgressUpdate?: (
    systemId: string,
    stationId: string,
    itemId: string,
    updates: Partial<TestProgress>
  ) => Promise<boolean>;
  onNavigate?: (module: string, params?: any) => void;
  stations: TestStation[];
  testItems: TestItem[];
  progress: TestProgress[];
}

export function MobileSystemCard({
  system,
  onProgressUpdate,
  onNavigate,
  stations,
  testItems,
  progress
}: MobileSystemCardProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const router = useRouter();

  const currentStation = stations.find(station => station.id === system.current_station);
  const systemProgress = progress.filter(p => p.system_id === system.id);

  const completedItems = systemProgress.filter(p => p.status === 'Done').length;
  const totalItems = testItems.filter(item => stations.find(s => s.id === item.station_id)?.id === system.current_station).length;

  const lastUpdate = systemProgress.reduce((latest, current) => {
    const currentCompletedAt = current.completed_at ? new Date(current.completed_at) : null;
    if (!latest) return currentCompletedAt;
    if (!currentCompletedAt) return latest;
    return currentCompletedAt > latest ? currentCompletedAt : latest;
  }, null as Date | null);

  const handleSystemUpdate = useCallback(async () => {
    router.refresh();
  }, [router]);

  return (
    <Card className="w-full mb-4">
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>{system.system_name}</CardTitle>
            <CardDescription>
              {system.model && <div>型號: {system.model}</div>}
              {system.serial_number && <div>序號: {system.serial_number}</div>}
            </CardDescription>
          </div>
          <div>
            {lastUpdate && (
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: zhTW })}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2">
          {system.status === 'Active' && (
            <Badge variant="outline">
              <Clock className="h-4 w-4 mr-1" />
              {system.status}
            </Badge>
          )}
          {system.status === 'Warning' && (
            <Badge variant="warning">
              <AlertTriangle className="h-4 w-4 mr-1" />
              {system.status}
            </Badge>
          )}
          {system.status === 'Completed' && (
            <Badge variant="success">
              <CheckCircle className="h-4 w-4 mr-1" />
              {system.status}
            </Badge>
          )}
        </div>

        <div className="my-2">
          <Progress value={system.overall_progress} />
          <div className="text-sm text-muted-foreground">
            {system.overall_progress}% 完成
          </div>
        </div>

        {currentStation ? (
          <div className="my-2">
            <div className="text-sm font-medium">目前站點: {currentStation.station_name}</div>
            <div className="text-sm text-muted-foreground">
              {completedItems} / {totalItems} 測試項目完成
            </div>
          </div>
        ) : (
          <div className="my-2 text-muted-foreground">
            系統不在任何站點
          </div>
        )}

        <div className="flex justify-between mt-4">
          <Button size="sm" onClick={() => onNavigate?.('monitor', { system: system.id })}>
            查看進度
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setIsEditDialogOpen(true)}>
            編輯系統
          </Button>
        </div>
      </CardContent>

      <SystemEditDialog
        system={system}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onUpdate={handleSystemUpdate}
      />
    </Card>
  );
}
