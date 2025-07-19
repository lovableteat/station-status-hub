-- 為系統用戶添加頁面權限管理
-- 創建頁面權限枚舉
CREATE TYPE public.page_permission AS ENUM (
  'dashboard_view',
  'dashboard_edit',
  'test_tracker_view', 
  'test_tracker_edit',
  'issues_view',
  'issues_edit',
  'production_view',
  'production_edit',
  'data_center_view',
  'data_center_edit',
  'tools_view',
  'tools_edit',
  'admin_view',
  'admin_edit'
);

-- 創建用戶權限表
CREATE TABLE public.user_page_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE,
  permission public.page_permission NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  granted_by VARCHAR(50),
  UNIQUE(user_id, permission)
);

-- 啟用 RLS
ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- 創建 RLS 政策
CREATE POLICY "Allow anonymous access to user_page_permissions" 
ON public.user_page_permissions 
FOR ALL 
USING (true);