-- 移除有問題的觸發器和函數
DROP TRIGGER IF EXISTS trigger_update_station_time_analytics ON public.test_progress;
DROP FUNCTION IF EXISTS public.update_station_time_analytics();

-- 確保所有核心觸發器存在並正常工作
-- 重新創建系統狀態更新觸發器（如果不存在）
DROP TRIGGER IF EXISTS update_system_status_trigger ON public.test_progress;
CREATE TRIGGER update_system_status_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.test_progress
    FOR EACH ROW EXECUTE FUNCTION public.update_system_completion_status();

-- 重新創建測試進度變更記錄觸發器（如果不存在）
DROP TRIGGER IF EXISTS log_test_progress_trigger ON public.test_progress;
CREATE TRIGGER log_test_progress_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.test_progress
    FOR EACH ROW EXECUTE FUNCTION public.log_test_progress_changes();

-- 重新創建站點時間記錄觸發器（如果不存在）
DROP TRIGGER IF EXISTS record_station_times_trigger ON public.test_progress;
CREATE TRIGGER record_station_times_trigger
    AFTER INSERT OR UPDATE ON public.test_progress
    FOR EACH ROW EXECUTE FUNCTION public.record_station_times();