-- 檢查並修復時間相關欄位的精度問題，解決計時失敗問題
-- 增加 actual_hours 欄位的精度以支援更大的時間值
ALTER TABLE public.test_progress 
ALTER COLUMN actual_hours TYPE NUMERIC(10,4);

-- 同時檢查相關表格
ALTER TABLE public.station_time_analytics 
ALTER COLUMN actual_hours TYPE NUMERIC(10,4),
ALTER COLUMN estimated_hours TYPE NUMERIC(10,4),
ALTER COLUMN efficiency_ratio TYPE NUMERIC(10,4);

ALTER TABLE public.station_time_records 
ALTER COLUMN total_hours TYPE NUMERIC(10,4);