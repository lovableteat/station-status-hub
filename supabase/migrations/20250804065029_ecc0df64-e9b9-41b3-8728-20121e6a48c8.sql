-- 修復 log_test_progress_changes 觸發器以正確記錄當前用戶
-- 由於無法在觸發器中直接獲取應用層的用戶信息，我們需要依賴 assigned_to 欄位

CREATE OR REPLACE FUNCTION public.log_test_progress_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO test_progress_audit (
      system_id, station_id, item_id, 
      new_status, new_progress_percent, new_notes,
      changed_by, change_type
    ) VALUES (
      NEW.system_id, NEW.station_id, NEW.item_id,
      NEW.status, NEW.progress_percent, NEW.notes,
      COALESCE(NEW.assigned_to, 'system'), 'insert'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO test_progress_audit (
      system_id, station_id, item_id,
      old_status, new_status, 
      old_progress_percent, new_progress_percent,
      old_notes, new_notes,
      changed_by, change_type
    ) VALUES (
      NEW.system_id, NEW.station_id, NEW.item_id,
      OLD.status, NEW.status,
      OLD.progress_percent, NEW.progress_percent, 
      OLD.notes, NEW.notes,
      COALESCE(NEW.assigned_to, 'system'), 'update'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO test_progress_audit (
      system_id, station_id, item_id,
      old_status, old_progress_percent, old_notes,
      changed_by, change_type
    ) VALUES (
      OLD.system_id, OLD.station_id, OLD.item_id,
      OLD.status, OLD.progress_percent, OLD.notes,
      COALESCE(OLD.assigned_to, 'system'), 'delete'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;