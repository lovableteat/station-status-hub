import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [systems, setSystems] = useState<TestSystem[]>([]);
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [progress, setProgress] = useState<TestProgress[]>([]);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const [systemsRes, stationsRes, itemsRes, progressRes] = await Promise.all([
        supabase.from('test_systems').select('*').order('system_name'),
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('test_progress').select('*')
      ]);

      if (systemsRes.data) setSystems(systemsRes.data);
      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      if (progressRes.data) setProgress(progressRes.data);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入測試資料",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    systems,
    stations,
    items,
    progress,
    loadData
  };
}