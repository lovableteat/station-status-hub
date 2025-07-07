
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "./StatsCard";
import { TestPassChart } from "./TestPassChart";
import { DailyCompletion } from "./DailyCompletion";
import { StationHeatmap } from "./StationHeatmap";
import { MachineTable } from "./MachineTable";
import { SystemStatusList } from "./SystemStatusList";
import { StationOverview } from "./StationOverview";
import { TestPassRateCard } from "./TestPassRateCard";
import { ExportDialog } from "@/components/production/ExportDialog";
import { BackButton } from "@/components/common/BackButton";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DashboardProps {
  onNavigate?: (module: string, params?: any) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { systems, progress, stationStatuses, stations, testItems } = useUnifiedData();
  const { toast } = useToast();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  
  const handleStationClick = (stationId: string) => {
    onNavigate?.('monitor', { station: stationId });
  };

  // Helper function to check if all stations 0-4 are 100% complete
  const areAllStationsComplete = (systemId: string) => {
    const stations0To4 = stations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.every(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      if (stationItems.length === 0) return true;
      
      const completedItems = stationItems.filter(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        return prog?.status === 'Done';
      });
      return completedItems.length === stationItems.length;
    });
  };

  // Helper function to check if any progress exists for stations 0-4
  const hasAnyProgress = (systemId: string) => {
    const stations0To4 = stations.filter(station => station.station_order >= 0 && station.station_order <= 4);
    return stations0To4.some(station => {
      const stationItems = testItems.filter(item => item.station_id === station.id);
      return stationItems.some(item => {
        const prog = progress.find(p => 
          p.system_id === systemId && 
          p.station_id === station.id && 
          p.item_id === item.id
        );
        return prog?.status === 'Done';
      });
    });
  };

  // Get current station status for a system (進行中、未開始、已完成)
  const getCurrentStationStatus = (systemId: string) => {
    const allStationsComplete = areAllStationsComplete(systemId);
    const anyProgress = hasAnyProgress(systemId);
    
    if (allStationsComplete) {
      return '已完成';
    } else if (anyProgress) {
      return '進行中';
    } else {
      return '未開始';
    }
  };

  // Calculate real-time metrics based on current station status logic
  const totalSystems = systems.length;
  
  // Count systems based on current station status logic
  let completedSystems = 0;
  let ongoingSystems = 0;
  let notStartedSystems = 0;
  
  systems.forEach(system => {
    const status = getCurrentStationStatus(system.id);
    
    if (status === '已完成') {
      completedSystems++;
    } else if (status === '未開始') {
      notStartedSystems++;
    } else if (status === '進行中') {
      ongoingSystems++;
    }
  });
  
  const completionRate = totalSystems > 0 ? Math.round((completedSystems / totalSystems) * 100) : 0;
  
  // Calculate average progress
  const averageProgress = totalSystems > 0 
    ? Math.round(systems.reduce((sum, s) => sum + (s.overall_progress || 0), 0) / totalSystems)
    : 0;
    
  // Calculate test pass rate
  const totalProgress = progress.length;
  const passedTests = progress.filter(p => p.status === 'Done').length;
  const passRate = totalProgress > 0 ? Math.round((passedTests / totalProgress) * 100) : 0;
  
  // Calculate active engineers
  const engineers = [...new Set(systems.map(s => s.assigned_engineer).filter(Boolean))];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">系統儀表板</h1>
            <p className="text-muted-foreground">
              測試管理系統總覽 - 實時監控測試進度與系統狀態
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
          <Download className="h-4 w-4 mr-2" />
          匯出報表
        </Button>
      </div>

      {/* Station Overview */}
      <StationOverview />

      {/* Test Pass Rate Metrics */}
      <TestPassRateCard />

      {/* Key Performance Indicators - Updated with correct logic */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="進行中系統"
          value={`${ongoingSystems}`}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={`${notStartedSystems}個未開始待處理`}
          trend={{ value: ongoingSystems > notStartedSystems ? 2.3 : -1.8, isPositive: ongoingSystems > notStartedSystems }}
          variant={ongoingSystems > 0 ? "warning" : "success"}
        />
        <StatsCard
          title="系統完成狀況"
          value={`${completedSystems}/${totalSystems}`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={`完成率 ${completionRate}%`}
          trend={{ value: completionRate >= 70 ? 5.2 : -2.8, isPositive: completionRate >= 70 }}
          variant={completionRate >= 70 ? "success" : "warning"}
        />
        <StatsCard
          title="活躍工程師"
          value={`${engineers.length}`}
          icon={<Users className="h-4 w-4" />}
          description={`負責 ${totalSystems} 個系統`}
          variant="default"
        />
      </div>

      {/* Charts Section */}
      <Card>
        <CardHeader>
          <CardTitle>每日完成與預計完成狀況</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyCompletion />
        </CardContent>
      </Card>

      {/* System Status List */}
      <SystemStatusList onNavigate={onNavigate} />

      {/* Station Heatmap */}
      <Card>
        <CardContent className="pt-6">
          <StationHeatmap onStationClick={handleStationClick} />
        </CardContent>
      </Card>

      {/* Machine List */}
      <Card>
        <CardContent className="pt-6">
          <MachineTable />
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="系統儀表板"
        data={systems}
      />
    </div>
  );
}
