-- 為 issues 表添加處理過程和解決方案欄位
ALTER TABLE public.issues 
ADD COLUMN IF NOT EXISTS process_notes text,
ADD COLUMN IF NOT EXISTS solution text;