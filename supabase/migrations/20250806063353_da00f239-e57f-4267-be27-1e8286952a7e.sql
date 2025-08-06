-- 修復 test_progress_audit 表缺少的欄位問題
-- 如果表不存在，創建它
CREATE TABLE IF NOT EXISTS public.test_progress_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id uuid NOT NULL,
  station_id uuid NOT NULL,
  item_id uuid NOT NULL,
  change_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 確保表有正確的 RLS 策略
ALTER TABLE public.test_progress_audit ENABLE ROW LEVEL SECURITY;

-- 創建允許匿名訪問的策略（與其他表保持一致）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'test_progress_audit' 
    AND policyname = 'Allow anonymous access to test_progress_audit'
  ) THEN
    CREATE POLICY "Allow anonymous access to test_progress_audit" 
    ON public.test_progress_audit 
    FOR ALL 
    USING (true);
  END IF;
END $$;