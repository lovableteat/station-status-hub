
-- 創建站點時間設定表
CREATE TABLE public.station_time_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL,
  station_id UUID NOT NULL,
  estimated_start_time TIMESTAMP WITH TIME ZONE,
  estimated_end_time TIMESTAMP WITH TIME ZONE,
  actual_completion_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- 確保每個系統-站點組合只有一個設定
  UNIQUE(system_id, station_id)
);

-- 建立外鍵關聯
ALTER TABLE public.station_time_settings 
ADD CONSTRAINT fk_station_time_settings_system 
FOREIGN KEY (system_id) REFERENCES public.test_systems(id) ON DELETE CASCADE;

ALTER TABLE public.station_time_settings 
ADD CONSTRAINT fk_station_time_settings_station 
FOREIGN KEY (station_id) REFERENCES public.test_flow_stations(id) ON DELETE CASCADE;

-- 建立索引以提升查詢效能
CREATE INDEX idx_station_time_settings_system_station 
ON public.station_time_settings(system_id, station_id);

-- 啟用 RLS 安全性
ALTER TABLE public.station_time_settings ENABLE ROW LEVEL SECURITY;

-- 建立 RLS 政策 - 允許匿名存取以配合現有系統設計
CREATE POLICY "Allow anonymous access to station_time_settings" 
ON public.station_time_settings 
FOR ALL 
USING (true);

-- 建立更新 updated_at 的觸發器
CREATE TRIGGER update_station_time_settings_updated_at
  BEFORE UPDATE ON public.station_time_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 建立觸發器自動更新實際完成時間
CREATE OR REPLACE FUNCTION public.update_station_actual_completion_time()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 當測試進度變為完成時，更新站點的實際完成時間
  IF NEW.status = 'Done' AND (OLD.status IS NULL OR OLD.status != 'Done') AND NEW.completed_at IS NOT NULL THEN
    -- 更新或插入站點時間設定
    INSERT INTO public.station_time_settings (system_id, station_id, actual_completion_time)
    VALUES (NEW.system_id, NEW.station_id, NEW.completed_at)
    ON CONFLICT (system_id, station_id) 
    DO UPDATE SET 
      actual_completion_time = CASE 
        WHEN station_time_settings.actual_completion_time IS NULL 
             OR NEW.completed_at > station_time_settings.actual_completion_time 
        THEN NEW.completed_at
        ELSE station_time_settings.actual_completion_time
      END,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- 建立觸發器來自動更新站點實際完成時間
CREATE TRIGGER trigger_update_station_actual_completion_time
  AFTER INSERT OR UPDATE ON public.test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_station_actual_completion_time();
