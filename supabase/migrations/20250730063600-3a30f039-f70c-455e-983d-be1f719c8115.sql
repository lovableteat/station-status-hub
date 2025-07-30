-- 為test_systems表添加Ubuntu版本和CUDA版本欄位
ALTER TABLE public.test_systems 
ADD COLUMN ubuntu_version TEXT,
ADD COLUMN cuda_version TEXT;