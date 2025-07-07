
-- 建立站別時間記錄表
CREATE TABLE public.station_time_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL REFERENCES test_systems(id),
  station_id UUID NOT NULL REFERENCES test_flow_stations(id),
  station_name VARCHAR(50) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  total_hours NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE NULL
    END
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_station_time_records_system_station ON station_time_records(system_id, station_id);
CREATE INDEX idx_station_time_records_times ON station_time_records(start_time, end_time);

-- 啟用 RLS
ALTER TABLE public.station_time_records ENABLE ROW LEVEL SECURITY;

-- 建立 RLS 政策
CREATE POLICY "Allow anonymous access to station_time_records" 
ON public.station_time_records 
FOR ALL 
USING (true);

-- 建立觸發器函數來自動記錄站別時間
CREATE OR REPLACE FUNCTION public.record_station_times()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  station_rec RECORD;
  first_item_id UUID;
  last_item_id UUID;
  all_items_done BOOLEAN;
  any_item_started BOOLEAN;
BEGIN
  -- 取得站別資訊
  SELECT * INTO station_rec 
  FROM test_flow_stations 
  WHERE id = NEW.station_id;
  
  -- 取得該站別的第一個和最後一個測項
  SELECT id INTO first_item_id
  FROM test_flow_items 
  WHERE station_id = NEW.station_id 
  ORDER BY item_order 
  LIMIT 1;
  
  SELECT id INTO last_item_id
  FROM test_flow_items 
  WHERE station_id = NEW.station_id 
  ORDER BY item_order DESC 
  LIMIT 1;
  
  -- 檢查是否有任何測項開始
  SELECT EXISTS(
    SELECT 1 FROM test_progress 
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id 
    AND status IN ('On-going', 'Done')
  ) INTO any_item_started;
  
  -- 檢查是否所有測項都完成
  SELECT NOT EXISTS(
    SELECT 1 FROM test_flow_items tfi
    LEFT JOIN test_progress tp ON tfi.id = tp.item_id 
      AND tp.system_id = NEW.system_id 
      AND tp.station_id = NEW.station_id
    WHERE tfi.station_id = NEW.station_id
    AND (tp.status IS NULL OR tp.status != 'Done')
  ) INTO all_items_done;
  
  -- 建立或更新記錄
  INSERT INTO station_time_records (system_id, station_id, station_name, start_time, end_time)
  VALUES (NEW.system_id, NEW.station_id, station_rec.station_name, NULL, NULL)
  ON CONFLICT (system_id, station_id) 
  DO NOTHING;
  
  -- 記錄開始時間（當第一個測項開始時）
  IF any_item_started THEN
    UPDATE station_time_records 
    SET start_time = COALESCE(start_time, now()),
        updated_at = now()
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id;
  END IF;
  
  -- 記錄結束時間（當所有測項完成時）
  IF all_items_done THEN
    UPDATE station_time_records 
    SET end_time = COALESCE(end_time, now()),
        updated_at = now()
    WHERE system_id = NEW.system_id 
    AND station_id = NEW.station_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 建立觸發器
CREATE TRIGGER trigger_record_station_times
  AFTER INSERT OR UPDATE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION record_station_times();

-- 為現有資料補充時間記錄
INSERT INTO station_time_records (system_id, station_id, station_name, start_time, end_time)
SELECT DISTINCT 
  tp.system_id,
  tp.station_id,
  tfs.station_name,
  MIN(tp.started_at) as start_time,
  CASE 
    WHEN COUNT(CASE WHEN tp.status = 'Done' THEN 1 END) = COUNT(*) 
    THEN MAX(tp.completed_at) 
    ELSE NULL 
  END as end_time
FROM test_progress tp
JOIN test_flow_stations tfs ON tp.station_id = tfs.id
WHERE tp.started_at IS NOT NULL
GROUP BY tp.system_id, tp.station_id, tfs.station_name
ON CONFLICT (system_id, station_id) DO NOTHING;

-- 新增唯一約束
ALTER TABLE public.station_time_records 
ADD CONSTRAINT unique_system_station UNIQUE (system_id, station_id);
