-- 為 issues 表新增 priority_manual 旗標
ALTER TABLE public.issues 
  ADD COLUMN IF NOT EXISTS priority_manual boolean NOT NULL DEFAULT false;

-- 新增共用欄位順序設定表
CREATE TABLE IF NOT EXISTS public.ui_table_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_key text NOT NULL UNIQUE,
  column_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ui_table_preferences TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_table_preferences TO authenticated;
GRANT ALL ON public.ui_table_preferences TO service_role;

ALTER TABLE public.ui_table_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read ui prefs"
ON public.ui_table_preferences FOR SELECT
USING (true);

CREATE POLICY "Anyone can upsert ui prefs"
ON public.ui_table_preferences FOR ALL
USING (true) WITH CHECK (true);

CREATE TRIGGER update_ui_table_preferences_updated_at
BEFORE UPDATE ON public.ui_table_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();