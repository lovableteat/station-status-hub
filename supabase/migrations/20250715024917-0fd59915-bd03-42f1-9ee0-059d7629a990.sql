
-- 修復 test_progress 表中 actual_hours 欄位的精度問題
-- 將精度從 (5,2) 改為 (10,2) 以支援更大的小時數值
ALTER TABLE public.test_progress 
ALTER COLUMN actual_hours TYPE NUMERIC(10,2);

-- 同時修復 station_time_analytics 表的相關欄位
ALTER TABLE public.station_time_analytics 
ALTER COLUMN actual_hours TYPE NUMERIC(10,2),
ALTER COLUMN estimated_hours TYPE NUMERIC(10,2),
ALTER COLUMN efficiency_ratio TYPE NUMERIC(10,4);

-- 修復 station_time_records 表的 total_hours 欄位
ALTER TABLE public.station_time_records 
ALTER COLUMN total_hours TYPE NUMERIC(10,2);
