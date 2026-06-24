
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { cn } from "@/lib/utils";
import { FilterControls } from "./FilterControls";
import { TestProgressTable } from "./TestProgressTable";
import { ExportManager } from "./ExportManager";
import { PDFExportDialog } from "./pdf/PDFExportDialog";
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

type ProgressUpdates = Pick<TestProgress, "status" | "progress_percent" | "notes"> &
  Partial<Pick<TestProgress, "started_at" | "completed_at">>;

type StatusFilter = "all-status" | "未開始" | "進行中" | "已完成";

const STATUS_TABS: Array<{ value: Exclude<StatusFilter, "all-status">; label: string }> = [
  { value: "未開始", label: "尚未開始" },
  { value: "進行中", label: "進行中" },
  { value: "已完成", label: "已完成" },
];

const STATUS_TAB_STYLES: Record<
  Exclude<StatusFilter, "all-status">,
  {
    active: string;
    inactive: string;
    badgeActive: string;
    badgeInactive: string;
  }
> = {
  "未開始": {
    active:
      "border-rose-300/75 bg-rose-400/[0.28] text-white shadow-[0_20px_42px_-24px_hsl(350_95%_68%/0.82)]",
    inactive:
      "border-rose-300/55 bg-rose-400/[0.16] text-rose-50 hover:border-rose-200/75 hover:bg-rose-400/[0.24]",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-rose-100/20 text-rose-50",
  },
  "進行中": {
    active:
      "border-amber-200/80 bg-amber-300/[0.3] text-white shadow-[0_20px_42px_-24px_hsl(42_100%_66%/0.85)]",
    inactive:
      "border-amber-200/60 bg-amber-300/[0.18] text-amber-50 hover:border-amber-100/80 hover:bg-amber-300/[0.26]",
    badgeActive: "bg-white/22 text-white",
    badgeInactive: "bg-amber-100/20 text-amber-50",
  },
  "已完成": {
    active:
      "border-emerald-200/75 bg-emerald-300/[0.26] text-white shadow-[0_20px_42px_-24px_hsl(152_80%_58%/0.82)]",
    inactive:
      "border-emerald-200/55 bg-emerald-300/[0.15] text-emerald-50 hover:border-emerald-100/75 hover:bg-emerald-300/[0.23]",
    badgeActive: "bg-white/20 text-white",
    badgeInactive: "bg-emerald-100/20 text-emerald-50",
  },
};

export function TestTracker() {
  const { systems, stations, items, progress, loadData, updateProgress } = useTestTrackerData();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("all-engineers");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all-status");
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [pdfExporterOpen, setPdfExporterOpen] = useState(false);
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
      const updates: ProgressUpdates = {
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

        handleSystemUpdate();
        
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

  const handleSystemUpdate = (newSystemId?: string) => {
    loadData(newSystemId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-warning text-warning-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const normalizeSystemStatus = (system: {
    status?: string | null;
    current_station?: string | null;
    overall_progress?: number | null;
  }) => {
    const rawStatus = system.status ?? "";
    const currentStation = system.current_station ?? "";
    const overallProgress = system.overall_progress ?? 0;

    if (
      rawStatus === "Done" ||
      rawStatus === "已完成" ||
      currentStation === "已完成" ||
      overallProgress === 100
    ) {
      return "已完成";
    }

    if (
      rawStatus === "On-going" ||
      rawStatus === "進行中" ||
      currentStation === "進行中" ||
      overallProgress > 0
    ) {
      return "進行中";
    }

    return "未開始";
  };

  const hasActiveSearchTerm = searchTerm.trim().length > 0;

  const baseFilteredSystems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return systems.filter(system => {
      const displayStatus = normalizeSystemStatus(system);
      const matchesSearch =
        !keyword ||
        system.system_name?.toLowerCase().includes(keyword) ||
        system.assigned_engineer?.toLowerCase().includes(keyword) ||
        system.current_station?.toLowerCase().includes(keyword) ||
        system.serial_number?.toLowerCase().includes(keyword) ||
        displayStatus.includes(keyword);

      const matchesEngineer =
        filterEngineer === "all-engineers" || system.assigned_engineer === filterEngineer;

      return matchesSearch && matchesEngineer;
    });
  }, [systems, searchTerm, filterEngineer]);

  const statusCounts = useMemo(
    () =>
      baseFilteredSystems.reduce<Record<Exclude<StatusFilter, "all-status">, number>>(
        (accumulator, system) => {
          const normalizedStatus = normalizeSystemStatus(system) as Exclude<StatusFilter, "all-status">;
          accumulator[normalizedStatus] += 1;
          return accumulator;
        },
        {
          "未開始": 0,
          "進行中": 0,
          "已完成": 0,
        }
      ),
    [baseFilteredSystems]
  );

  const filteredSystems = useMemo(
    () =>
      baseFilteredSystems.filter((system) => {
        if (hasActiveSearchTerm || filterStatus === "all-status") {
          return true;
        }

        return normalizeSystemStatus(system) === filterStatus;
      }),
    [baseFilteredSystems, filterStatus, hasActiveSearchTerm]
  );

  const engineers = useMemo(
    () =>
      [...new Set(
        systems
          .map(system => system.assigned_engineer)
          .filter((engineer): engineer is string => Boolean(engineer?.trim()))
      )].sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [systems]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">L10 測試追蹤</h1>
          <p className="text-muted-foreground">系統測試進度管理 - {systems.length} 台機器測試狀態</p>
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
        engineers={engineers}
      />

      <div className="rounded-2xl border border-primary/15 bg-card/90 p-2 shadow-[0_18px_48px_-38px_hsl(220_50%_2%/0.9)]">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = filterStatus === tab.value;
            const palette = STATUS_TAB_STYLES[tab.value];

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilterStatus(tab.value)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all duration-200",
                  isActive ? palette.active : palette.inactive
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    isActive ? palette.badgeActive : palette.badgeInactive
                  )}
                >
                  {statusCounts[tab.value]}
                </span>
              </button>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            onClick={() => setFilterStatus("all-status")}
            className={cn(
              "ml-auto rounded-xl border px-4 text-sm font-medium",
              filterStatus === "all-status"
                ? "border-primary/35 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "border-border/70 text-muted-foreground hover:border-primary/25 hover:text-foreground"
            )}
          >
            全部
            <span className="ml-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-foreground/75">
              {baseFilteredSystems.length}
            </span>
          </Button>
        </div>

        {hasActiveSearchTerm && (
          <div className="px-2 pb-1 pt-2 text-sm text-primary/90">
            目前為搜尋模式，已跨所有狀態顯示符合的機台結果。
          </div>
        )}
      </div>

      {/* Content */}
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
          onSystemUpdate={handleSystemUpdate}
        />
      </div>

      {/* PDF Exporter Dialog */}
      <PDFExportDialog
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
