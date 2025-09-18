-- Add new permission values to the page_permission enum
ALTER TYPE page_permission ADD VALUE IF NOT EXISTS 'l11_cabinet_view';
ALTER TYPE page_permission ADD VALUE IF NOT EXISTS 'l11_cabinet_edit';
ALTER TYPE page_permission ADD VALUE IF NOT EXISTS 'api_management_view';
ALTER TYPE page_permission ADD VALUE IF NOT EXISTS 'api_management_edit';