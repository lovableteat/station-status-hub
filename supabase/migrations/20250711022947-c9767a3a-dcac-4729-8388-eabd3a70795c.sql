
-- 創建問題追蹤表
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to TEXT,
  system_id TEXT,
  station_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- 創建 RLS 政策，允許匿名訪問（與現有表保持一致）
CREATE POLICY "Allow anonymous access to issues" 
  ON public.issues 
  FOR ALL 
  USING (true);

-- 創建更新觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_issues_updated_at 
  BEFORE UPDATE ON public.issues 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
