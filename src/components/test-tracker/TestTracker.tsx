
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { FilterControls } from "./FilterControls";
import { TestProgressTable } from "./TestProgressTable";
import { ExportManager } from "./ExportManager";
import { TestTrackerPDFExporter } from "./TestTrackerPDFExporter";
import { TestItemStatusReport } from "./TestItemStatusReport";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function TestTracker() {
  const { systems, stations, items, progress, loadData, updateProgress } = useTestTrackerData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [pdfExporterOpen, setPdfExporterOpen] = useState(false);
  const [showStatusReport, setShowStatusReport] = useState(false);
  const [editValues, setEditValues] = useState<{
    status: string;
    progress_percent: number;
    notes: string;
    started_at?: string;
    completed_at?: string;
  }>({ status: "", progress_percent: 0, notes: "", started_at: undefined, completed_at: undefined });
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
    
    setEditingProgress(editKey);
    setEditValues({
      status: existingProgress?.status || "Not Start",
      progress_percent: existingProgress?.progress_percent || 0,
      notes: existingProgress?.notes || "",
      started_at: existingProgress?.started_at,
      completed_at: existingProgress?.completed_at
    });
  };

  const handleSaveProgress = async (systemId: string, stationId: string, itemId: string) => {
    try {
      // 找到對應的station，檢查是否為Station 0-4
      const station = stations.find(s => s.id === stationId);
      const isStation0To4 = station && station.station_order >= 0 && station.station_order <= 4;
      
      const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
      const currentTime = new Date().toISOString();
      
      // 準備更新數據
      const updates: any = {
        status: editValues.status,
        progress_percent: editValues.progress_percent,
        notes: editValues.notes
      };

      // 只對Station 0-4自動記錄時間
      if (isStation0To4) {
        // 如果狀態從 "Not Start" 變為 "On-going"，設定開始時間
        if (existingProgress?.status === 'Not Start' && editValues.status === 'On-going') {
          updates.started_at = currentTime;
        }
        // 如果狀態變為 "Done"，設定完成時間
        if (editValues.status === 'Done' && existingProgress?.status !== 'Done') {
          updates.completed_at = currentTime;
          // 如果沒有開始時間，也設定開始時間
          if (!existingProgress?.started_at) {
            updates.started_at = currentTime;
          }
        }
        // 保留現有時間（如果不是狀態變更觸發）
        if (editValues.started_at) {
          updates.started_at = editValues.started_at;
        }
        if (editValues.completed_at) {
          updates.completed_at = editValues.completed_at;
        }
      } else {
        // 非Station 0-4的站點，保持手動設定的時間
        updates.started_at = editValues.started_at;
        updates.completed_at = editValues.completed_at;
      }

      const success = await updateProgress(systemId, stationId, itemId, updates);
      
      if (success) {
        setEditingProgress(null);
        const stationName = station?.station_name || `Station ${station?.station_order}`;
        toast({
          title: "儲存成功",
          description: `${stationName} 測試進度已更新${isStation0To4 ? '，時間已自動記錄' : ''}`,
        });
      } else {
        throw new Error('Update failed');
      }
    } catch (error) {
      console.error('Error saving progress:', error);
      toast({
        title: "儲存失敗",
        description: "無法更新測試進度",
        variant: "destructive"
      });
    }
  };

  const handleDeleteProgress = async (systemId: string, stationId: string, itemId: string) => {
    if (!confirm('DELETE the progress for this test item?')) {
      return;
    }

    try {
      const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
      
      if (existingProgress) {
        const { error } = await supabase
          .from('test_progress')
          .delete()
          .eq('id', existingProgress.id);

        if (error) throw error;

        await loadData();
        
        toast({
          title: "Deleted",
          description: "Test progress record deleted successfully"
        });
      }
    } catch (error) {
      console.error('Error deleting progress:', error);
      toast({
        title: "Delete Error",
        description: "Failed to delete test progress record",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-warning text-warning-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredSystems = systems.filter(system => {
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         system.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         system.current_station?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEngineer = !filterEngineer || filterEngineer === "all-engineers" || system.assigned_engineer === filterEngineer;
    const matchesStatus = !filterStatus || filterStatus === "all-status" || 
                         system.status === filterStatus || 
                         system.current_station === filterStatus;
    return matchesSearch && matchesEngineer && matchesStatus;
  });

  const engineers = [...new Set(systems.map(s => s.assigned_engineer))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試追蹤</h1>
          <p className="text-muted-foreground">系統測試進度管理 - 40 台機器測試狀態</p>
        </div>
        <div className="flex gap-2">
          <ExportManager 
            systems={filteredSystems} 
            stations={stations} 
            progress={progress} 
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                PDF 匯出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setPdfExporterOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                完整測試追蹤 PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <FilterControls
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterEngineer={filterEngineer}
        setFilterEngineer={setFilterEngineer}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        engineers={engineers}
      />

      {/* Navigation Tabs */}
      <div className="flex border-b">
        <button 
          className={`px-4 py-2 font-medium ${!showStatusReport ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setShowStatusReport(false)}
        >
          測試進度表
        </button>
        <button 
          className={`px-4 py-2 font-medium ${showStatusReport ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setShowStatusReport(true)}
        >
          測項狀態報表
        </button>
      </div>

      {/* Content */}
      {!showStatusReport ? (
        <div data-testtracker-table>
          <TestProgressTable
            filteredSystems={filteredSystems}
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
            onSystemUpdate={loadData}
          />
        </div>
      ) : (
        <TestItemStatusReport
          systems={filteredSystems}
          stations={stations}
          items={items}
          progress={progress}
        />
      )}

      {/* PDF Exporter Dialog */}
      <TestTrackerPDFExporter
        systems={filteredSystems}
        stations={stations}
        items={items}
        progress={progress}
        isOpen={pdfExporterOpen}
        onClose={() => setPdfExporterOpen(false)}
      />
    </div>
  );
}
