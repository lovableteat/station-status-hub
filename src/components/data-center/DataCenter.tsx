import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  AlertTriangle,
  Warning,
  XCircle,
  Loader2
} from "lucide-react";

interface SystemProgress {
  system: any;
  stationProgress: {
    stationId: string;
    stationName: string;
    progress: number;
    totalItems: number;
    completedItems: number;
  }[];
}

export function DataCenter() {
  const [sortColumn, setSortColumn] = useState<keyof SystemProgress | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [systemFilter, setSystemFilter] = useState<string>("");
  const [systemProgress, setSystemProgress] = useState<SystemProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { systems, stations, testItems, progress } = useUnifiedData();
  const { toast } = useToast();

  useEffect(() => {
    if (systems && stations && testItems && progress) {
      const calculatedProgress = getSystemProgressByStation();
      setSystemProgress(calculatedProgress);
      setIsLoading(false);
    }
  }, [systems, stations, testItems, progress]);

  const handleSort = (column: keyof SystemProgress) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedData = () => {
    let data = [...systemProgress];

    if (sortColumn) {
      data.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }

        if (typeof aValue === "string" && typeof bValue === "string") {
          return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }

        return 0;
      });
    }

    return data;
  };

  // 篩選目標站點並計算總進度
  const getSystemProgressByStation = () => {
    const targetStations = stations.filter(station => 
      station.station_name.includes('Station 0') || station.station_name.includes('組裝') ||
      station.station_name.includes('Station 1') || station.station_name.includes('開機') ||
      station.station_name.includes('Station 2') || station.station_name.includes('FW') ||
      station.station_name.includes('Station 3') || station.station_name.includes('EE')
    );

    return systems.map(system => {
      const systemProgress = targetStations.map(station => {
        // 取得該站點的所有測試項目
        const stationTestItems = testItems.filter(item => item.station_id === station.id);
        
        // 如果沒有測試項目，則該站點進度為 0
        if (stationTestItems.length === 0) {
          return {
            stationId: station.id,
            stationName: station.station_name,
            progress: 0,
            totalItems: 0,
            completedItems: 0
          };
        }

        // 計算該系統在該站點的總進度
        const stationProgress = stationTestItems.map(item => {
          const itemProgress = progress.find(p => 
            p.system_id === system.id && 
            p.station_id === station.id && 
            p.item_id === item.id
          );
          return itemProgress?.progress_percent || 0;
        });

        const completedItems = stationProgress.filter(p => p === 100).length;
        const averageProgress = stationProgress.reduce((sum, p) => sum + p, 0) / stationProgress.length;

        return {
          stationId: station.id,
          stationName: station.station_name,
          progress: Math.round(averageProgress),
          totalItems: stationTestItems.length,
          completedItems
        };
      });

      return {
        system,
        stationProgress: systemProgress
      };
    });
  };

  const filteredData = sortedData().filter(item => {
    const stationMatch = stationFilter === "all" || item.stationProgress.some(sp => sp.stationName === stationFilter);
    const systemMatch = item.system.system_name.toLowerCase().includes(systemFilter.toLowerCase());
    return stationMatch && systemMatch;
  });

  const getStatusIcon = (progress: number) => {
    if (progress === 100) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    } else if (progress > 0 && progress < 100) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">資料中心</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>系統進度總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center mb-4">
            <Select value={stationFilter} onValueChange={setStationFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="站點" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有站點</SelectItem>
                {stations.map(station => (
                  <SelectItem key={station.id} value={station.station_name}>{station.station_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="text"
              placeholder="搜尋系統..."
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              className="border rounded px-2 py-1 w-48"
            />
          </div>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              載入中...
            </div>
          ) : (
            <ScrollArea className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => handleSort("system")} className="cursor-pointer">
                      系統名稱
                      {sortColumn === "system" && (
                        sortDirection === "asc" ? <ArrowUp className="inline w-4 h-4 ml-1" /> : <ArrowDown className="inline w-4 h-4 ml-1" />
                      )}
                    </TableHead>
                    {stations.map(station => (
                      <TableHead key={station.id} className="text-right">
                        {station.station_name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map(item => (
                    <TableRow key={item.system.id}>
                      <TableCell className="font-medium">{item.system.system_name}</TableCell>
                      {item.stationProgress.map(sp => (
                        <TableCell key={sp.stationId} className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {getStatusIcon(sp.progress)}
                            <span>{sp.progress}%</span>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
