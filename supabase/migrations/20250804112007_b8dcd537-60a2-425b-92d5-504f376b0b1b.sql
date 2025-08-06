-- 為 issues 表格添加 relate 和 category 字段
ALTER TABLE public.issues
ADD COLUMN relate text,
ADD COLUMN category text;