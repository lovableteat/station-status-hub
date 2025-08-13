-- One-off cleanup: remove specific systems with full cascade via RPC
-- Target: GB300 L10 手動計時版 - remove System32, System33

-- Execute the transactional delete for each matching system
SELECT public.delete_test_system(ts.id)
FROM public.test_systems ts
WHERE ts.system_name IN ('System32','System33');