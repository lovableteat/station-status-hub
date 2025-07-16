-- 先刪除生成欄位的依賴，然後修復精度問題
-- 如果存在 efficiency_ratio 生成欄位，先移除它
ALTER TABLE public.station_time_analytics DROP COLUMN IF EXISTS efficiency_ratio;

-- 重新添加 efficiency_ratio 欄位作為普通欄位
ALTER TABLE public.station_time_analytics 
ADD COLUMN efficiency_ratio NUMERIC(10,4);

-- 現在修復精度問題
ALTER TABLE public.test_progress 
ALTER COLUMN actual_hours TYPE NUMERIC(10,4);

ALTER TABLE public.station_time_analytics 
ALTER COLUMN actual_hours TYPE NUMERIC(10,4),
ALTER COLUMN estimated_hours TYPE NUMERIC(10,4);

ALTER TABLE public.station_time_records 
ALTER COLUMN total_hours TYPE NUMERIC(10,4);