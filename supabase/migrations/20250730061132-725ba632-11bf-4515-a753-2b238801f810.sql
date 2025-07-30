
-- 添加 exclude_from_dashboard 欄位到 test_systems 表
ALTER TABLE test_systems ADD COLUMN exclude_from_dashboard BOOLEAN DEFAULT FALSE;

-- 添加註釋說明該欄位的用途
COMMENT ON COLUMN test_systems.exclude_from_dashboard IS '是否排除在系統儀表板統計中';
