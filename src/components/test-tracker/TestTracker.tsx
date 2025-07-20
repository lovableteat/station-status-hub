import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TestProgressTable } from "./TestProgressTable";
import { SystemManager } from "./SystemManager";
import { TestManagementPanel } from "./TestManagementPanel";
import { TestTrackerPDFExporter } from "./TestTrackerPDFExporter";
import { FilterControls } from "./FilterControls";
import { ExportManager } from "./ExportManager";
import { BulkResetDialog } from "./BulkResetDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { EditPermissionWrapper } from "@/components/layout/EditPermissionWrapper";
import { 
  Download, 
  RefreshCw, 
  Settings, 
  Plus, 
  FileText,
  RotateCcw,
  Filter
} from "lucide-react";

interface System {
  id: string;
  system_name: string;
  current_station: string | null;
  overall_progress: number;
  created_at: string;
  assigned_engineer: string | null;
  status: string;
  model: string | null;
  serial_number: string | null;
  actual_started_at: string | null;
  actual_completed_at: string | null;
}

interface Station {
  id: string;
  station_name: string;
  station_order: number;
  created_at: string;
  description: string | null;
  estimated_hours: number | null;
}

interface Item {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  created_at: string;
  description: string | null;
  estimated_minutes: number | null;
}

interface Progress {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status: string;
  progress_percent: number;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  actual_hours: number | null;
}

export function TestTracker() {
  const [systems, setSystems] = useState<System[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showManagement, setShowManagement] = useState(false);
  const [showSystemManager, setShowSystemManager] = useState(false);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    system: '',
    station: '',
    engineer: '',
    status: ''
  });
  const [engineers, setEngineers] = useState<string[]>([]);
  const { canEditModule } = usePermissions();

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: systemsData, error: systemsError },
        { data: stationsData, error: stationsError },
        { data: itemsData, error: itemsError },
        { data: progressData, error: progressError },
        { data: engineersData, error: engineersError }
      ] = await Promise.all([
        supabase.from('test_systems').select('*').order('created_at', { ascending: false }),
        supabase.from('test_flow_stations').select('*').order('station_order', { ascending: true }),
        supabase.from('test_flow_items').select('*').order('item_order', { ascending: true }),
        supabase.from('test_progress').select('*').order('created_at', { ascending: false }),
        supabase.from('engineers').select('name').order('created_at', { ascending: true })
      ]);

      if (systemsError) throw systemsError;
      if (stationsError) throw stationsError;
      if (itemsError) throw itemsError;
      if (progressError) throw progressError;
      if (engineersError) throw engineersError;

      setSystems(systemsData || []);
      setStations(stationsData || []);
      setItems(itemsData || []);
      setProgress(progressData || []);
      setEngineers(engineersData?.map(e => e.name) || []);
    } catch (e: any) {
      setError(e.message);
      toast({
        title: "載入失敗",
        description: "無法載入測試追蹤資料",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredSystems = systems.filter(system => {
    if (filters.system && system.system_name !== filters.system) {
      return false;
    }
    const currentStationName = system.current_station || '';
    if (filters.station && currentStationName !== filters.station) {
      return false;
    }
    return true;
  });

  const stats = {
    totalSystems: systems.length,
    completedSystems: systems.filter(system => system.overall_progress === 100).length,
    inProgressSystems: systems.filter(system => system.overall_progress > 0 && system.overall_progress < 100).length,
    notStartedSystems: systems.filter(system => system.overall_progress === 0).length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試追蹤</h1>
          <p className="text-muted-foreground">追蹤系統測試進度和狀態</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={loadAllData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            重新載入
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            篩選
          </Button>

          <ExportManager 
            systems={filteredSystems}
            stations={stations}
            progress={progress}
          />

          <Button
            variant="outline"
            onClick={() => setPdfExportOpen(true)}
          >
            <FileText className="h-4 w-4 mr-2" />
            匯出 PDF
          </Button>

          <EditPermissionWrapper module="test-tracker">
            <Button
              variant="outline"
              onClick={() => setBulkResetOpen(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              批次重置
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowManagement(!showManagement)}
            >
              <Settings className="h-4 w-4 mr-2" />
              管理
            </Button>

            <Button
              onClick={() => setShowSystemManager(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              新增系統
            </Button>
          </EditPermissionWrapper>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>總系統數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSystems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>已完成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.completedSystems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>進行中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.inProgressSystems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>未開始</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.notStartedSystems}</div>
          </CardContent>
        </Card>
      </div>

      {showFilters && (
        <FilterControls
          searchTerm=""
          setSearchTerm={() => {}}
          filterEngineer={filters.engineer}
          setFilterEngineer={(engineer) => setFilters({...filters, engineer})}
          filterStatus={filters.status}
          setFilterStatus={(status) => setFilters({...filters, status})}
          engineers={engineers}
        />
      )}

      <EditPermissionWrapper module="test-tracker">
        {showManagement && (
          <TestManagementPanel />
        )}
      </EditPermissionWrapper>

      <TestProgressTable
        systems={filteredSystems}
        stations={stations}
        items={items}
        progress={progress}
        engineers={engineers}
        filters={filters}
        onFiltersChange={setFilters}
        onProgressUpdate={loadAllData}
        canEdit={canEditModule('test-tracker')}
      />

      {showSystemManager && (
        <EditPermissionWrapper module="test-tracker">
          <SystemManager
            onSystemUpdate={loadAllData}
          />
        </EditPermissionWrapper>
      )}

      {bulkResetOpen && (
        <EditPermissionWrapper module="test-tracker">
          <BulkResetDialog
            onReset={() => {
              loadAllData();
              setBulkResetOpen(false);
            }}
          />
        </EditPermissionWrapper>
      )}

      <TestTrackerPDFExporter
        systems={filteredSystems}
        stations={stations}
        items={items}
        progress={progress}
        isOpen={pdfExportOpen}
        onClose={() => setPdfExportOpen(false)}
      />
    </div>
  );
}
