-- 建立指令庫表
CREATE TABLE public.command_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  platform text NOT NULL DEFAULT 'universal',
  tags text[] DEFAULT ARRAY[]::text[],
  examples text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  is_active boolean DEFAULT true NOT NULL
);

-- 啟用RLS
ALTER TABLE public.command_library ENABLE ROW LEVEL SECURITY;

-- 建立RLS政策 - 所有用戶都可以檢視和管理指令
CREATE POLICY "Allow all users to view commands" 
ON public.command_library 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Allow all users to create commands" 
ON public.command_library 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all users to update commands" 
ON public.command_library 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow all users to delete commands" 
ON public.command_library 
FOR DELETE 
USING (true);

-- 建立觸發器自動更新updated_at
CREATE TRIGGER update_command_library_updated_at
BEFORE UPDATE ON public.command_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();