-- 1. 為test_systems表添加新欄位：Ubuntu版本、CUDA版本、是否列入統計
ALTER TABLE public.test_systems 
ADD COLUMN ubuntu_version TEXT,
ADD COLUMN cuda_version TEXT,
ADD COLUMN exclude_from_dashboard BOOLEAN DEFAULT false;

-- 2. 創建索引以提升查詢性能
CREATE INDEX idx_test_systems_exclude_from_dashboard ON public.test_systems(exclude_from_dashboard);

-- 3. 更新現有記錄的預設值
UPDATE public.test_systems 
SET exclude_from_dashboard = false 
WHERE exclude_from_dashboard IS NULL;