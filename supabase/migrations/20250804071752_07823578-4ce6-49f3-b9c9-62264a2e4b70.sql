-- 首先移除有問題的觸發器和函數
DROP TRIGGER IF EXISTS test_progress_audit_trigger ON public.test_progress;
DROP FUNCTION IF EXISTS public.log_test_progress_changes();

-- 刪除有問題的審計表並重新創建正確的結構
DROP TABLE IF EXISTS public.test_progress_audit;

-- 創建簡化的審計表（可選，主要用於記錄）
CREATE TABLE IF NOT EXISTS public.test_progress_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL,
  station_id UUID NOT NULL,
  item_id UUID NOT NULL,
  change_type TEXT NOT NULL, -- 使用 change_type 而不是 operation_type
  old_values JSONB,
  new_values JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE public.test_progress_audit ENABLE ROW LEVEL SECURITY;

-- 創建 RLS 政策
CREATE POLICY "Users can view all audit records" 
ON public.test_progress_audit 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert audit records" 
ON public.test_progress_audit 
FOR INSERT 
WITH CHECK (true);

-- 創建簡化的審計函數（可選）
CREATE OR REPLACE FUNCTION public.log_test_progress_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- 只記錄與計時相關的變更
  IF TG_OP = 'INSERT' THEN
    IF NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
      INSERT INTO public.test_progress_audit (
        system_id, station_id, item_id, change_type, 
        old_values, new_values, user_id
      ) VALUES (
        NEW.system_id, NEW.station_id, NEW.item_id, 'insert',
        NULL,
        jsonb_build_object(
          'started_at', NEW.started_at,
          'completed_at', NEW.completed_at,
          'status', NEW.status,
          'actual_hours', NEW.actual_hours
        ),
        auth.uid()
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- 只有當計時相關欄位發生變化時才記錄
    IF OLD.started_at IS DISTINCT FROM NEW.started_at OR 
       OLD.completed_at IS DISTINCT FROM NEW.completed_at OR
       OLD.status IS DISTINCT FROM NEW.status OR
       OLD.actual_hours IS DISTINCT FROM NEW.actual_hours THEN
      
      INSERT INTO public.test_progress_audit (
        system_id, station_id, item_id, change_type,
        old_values, new_values, user_id
      ) VALUES (
        NEW.system_id, NEW.station_id, NEW.item_id, 'update',
        jsonb_build_object(
          'started_at', OLD.started_at,
          'completed_at', OLD.completed_at,
          'status', OLD.status,
          'actual_hours', OLD.actual_hours
        ),
        jsonb_build_object(
          'started_at', NEW.started_at,
          'completed_at', NEW.completed_at,
          'status', NEW.status,
          'actual_hours', NEW.actual_hours
        ),
        auth.uid()
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.test_progress_audit (
      system_id, station_id, item_id, change_type,
      old_values, new_values, user_id
    ) VALUES (
      OLD.system_id, OLD.station_id, OLD.item_id, 'delete',
      jsonb_build_object(
        'started_at', OLD.started_at,
        'completed_at', OLD.completed_at,
        'status', OLD.status,
        'actual_hours', OLD.actual_hours
      ),
      NULL,
      auth.uid()
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 重新創建觸發器（可選，因為計時功能不依賴它）
-- CREATE TRIGGER test_progress_audit_trigger
--   AFTER INSERT OR UPDATE OR DELETE ON public.test_progress
--   FOR EACH ROW EXECUTE FUNCTION public.log_test_progress_changes();