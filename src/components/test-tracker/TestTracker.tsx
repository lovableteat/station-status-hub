
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { FilterControls } from "./FilterControls";
import { TestProgressTable } from "./TestProgressTable";
import { ExportManager } from "./ExportManager";

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
  const { toast } = useToast();

  const filteredSystems = systems.filter(system => {
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         system.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEngineer = !filterEngineer || filterEngineer === "all-engineers" || system.assigned_engineer === filterEngineer;
    const matchesStatus = !filterStatus || filterStatus === "all-status" || system.status === filterStatus;
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
        <ExportManager 
          systems={filteredSystems} 
          stations={stations} 
          progress={progress} 
        />
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

      {/* Test Progress Table */}
      <TestProgressTable />
    </div>
  );
}
