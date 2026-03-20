
-- 建立 troubleshooting_records 表，用於工廠問題統計
CREATE TABLE public.troubleshooting_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID REFERENCES public.test_systems(id) ON DELETE SET NULL,
  station_id UUID REFERENCES public.test_flow_stations(id) ON DELETE SET NULL,
  test_item_id UUID REFERENCES public.test_flow_items(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL DEFAULT 'other',
  issue_category TEXT DEFAULT 'hardware',
  title TEXT NOT NULL,
  description TEXT,
  root_cause TEXT,
  solution TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  reported_by TEXT,
  resolved_by TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  time_to_resolve_hours NUMERIC,
  tags TEXT[] DEFAULT '{}'::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.troubleshooting_records ENABLE ROW LEVEL SECURITY;

-- Allow public access (matching project pattern)
CREATE POLICY "Allow anonymous access to troubleshooting_records"
  ON public.troubleshooting_records
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_troubleshooting_records_updated_at
  BEFORE UPDATE ON public.troubleshooting_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
