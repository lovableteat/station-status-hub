-- Create station_contents table for detailed station information
CREATE TABLE public.station_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.test_flow_stations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.station_contents ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access
CREATE POLICY "Allow anonymous access to station_contents" 
ON public.station_contents 
FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_station_contents_updated_at
BEFORE UPDATE ON public.station_contents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();