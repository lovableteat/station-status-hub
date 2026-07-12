
import { useUnifiedData } from "./useUnifiedData";

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

export function useTestTrackerData() {
  const { 
    systems, 
    stations, 
    testItems: items, 
    progress, 
    isLoading,
    refetch: loadData,
    refreshProgress,
    updateProgress
  } = useUnifiedData();

  return {
    systems,
    stations,
    items,
    progress,
    isLoading,
    loadData: (newSystemId?: string) => loadData(newSystemId),
    refreshProgress,
    updateProgress
  };
}
