-- Create test_systems table for GB300 systems
CREATE TABLE public.test_systems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_name VARCHAR NOT NULL UNIQUE, -- System01, System02, etc.
  serial_number VARCHAR,
  model VARCHAR DEFAULT 'GB300',
  current_station VARCHAR DEFAULT 'Station 0',
  overall_progress INTEGER DEFAULT 0,
  assigned_engineer VARCHAR,
  status VARCHAR DEFAULT 'Not Start',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_flow_stations table for station definitions
CREATE TABLE public.test_flow_stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_name VARCHAR NOT NULL, -- Station 0, Station 1, etc.
  station_order INTEGER NOT NULL,
  description TEXT,
  estimated_hours DECIMAL(4,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_flow_items table for items within each station
CREATE TABLE public.test_flow_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id UUID NOT NULL REFERENCES public.test_flow_stations(id),
  item_name VARCHAR NOT NULL,
  item_order INTEGER NOT NULL,
  description TEXT,
  estimated_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_progress table to track each system's progress on each item
CREATE TABLE public.test_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id UUID NOT NULL REFERENCES public.test_systems(id),
  station_id UUID NOT NULL REFERENCES public.test_flow_stations(id),
  item_id UUID NOT NULL REFERENCES public.test_flow_items(id),
  status VARCHAR DEFAULT 'Not Start', -- Not Start, On-going, Done
  progress_percent INTEGER DEFAULT 0,
  notes TEXT,
  assigned_to VARCHAR,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(system_id, station_id, item_id)
);

-- Enable Row Level Security
ALTER TABLE public.test_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_flow_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_flow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_progress ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (since no auth is implemented yet)
CREATE POLICY "Allow anonymous access to test_systems" 
ON public.test_systems FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to test_flow_stations" 
ON public.test_flow_stations FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to test_flow_items" 
ON public.test_flow_items FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to test_progress" 
ON public.test_progress FOR ALL USING (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_test_systems_updated_at
  BEFORE UPDATE ON public.test_systems
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_test_progress_updated_at
  BEFORE UPDATE ON public.test_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial station data
INSERT INTO public.test_flow_stations (station_name, station_order, description, estimated_hours) VALUES
('Station 0', 0, 'Power On with NV - 組裝與 TIM 燒錄階段', 5.0),
('Station 1', 1, '正式上電', 1.5),
('Station 2', 2, '韌體更新 (FW Update)', 1.5),
('Station 3', 3, '功能驗證 (Function Check)', 1.5),
('Station 4', 4, 'NV Diag 與 Bake 測試', 4.0);

-- Insert test items for Station 0
INSERT INTO public.test_flow_items (station_id, item_name, item_order, description, estimated_minutes) 
SELECT id, 'Chassis Assembly', 1, '組裝機殼', 120 FROM public.test_flow_stations WHERE station_name = 'Station 0'
UNION ALL
SELECT id, 'Tim Curing', 2, '加熱至 65°C，持續 60 分鐘', 180 FROM public.test_flow_stations WHERE station_name = 'Station 0';

-- Insert test items for Station 1
INSERT INTO public.test_flow_items (station_id, item_name, item_order, description, estimated_minutes) 
SELECT id, 'Boot to BIOS', 1, '開機至 UEFI', 30 FROM public.test_flow_stations WHERE station_name = 'Station 1'
UNION ALL
SELECT id, 'Monitor Display', 2, 'PCI 顯示 PCIE 裝置', 30 FROM public.test_flow_stations WHERE station_name = 'Station 1';

-- Insert test items for Station 2
INSERT INTO public.test_flow_items (station_id, item_name, item_order, description, estimated_minutes) 
SELECT id, 'BIOS Update', 1, 'BIOS 韌體更新', 20 FROM public.test_flow_stations WHERE station_name = 'Station 2'
UNION ALL
SELECT id, 'BMC Update', 2, 'BMC 韌體更新', 20 FROM public.test_flow_stations WHERE station_name = 'Station 2'
UNION ALL
SELECT id, 'GPU Update', 3, 'GPU 韌體更新', 15 FROM public.test_flow_stations WHERE station_name = 'Station 2'
UNION ALL
SELECT id, 'FRU/MAC Update', 4, 'FRU / MAC 更新', 25 FROM public.test_flow_stations WHERE station_name = 'Station 2';

-- Insert test items for Station 3
INSERT INTO public.test_flow_items (station_id, item_name, item_order, description, estimated_minutes) 
SELECT id, 'PCIe Check', 1, 'PCIe 裝置檢查 lspci', 15 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'GPU Verification', 2, 'GPU 驗證 nvidia-smi', 15 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'Network Test', 3, 'BF3 / CX8 狀態查詢', 20 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'Infiniband Test', 4, 'Infiniband 測試 ibstat', 15 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'TPM Check', 5, 'TPM、I210 MAC 驗證', 15 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'SFT Test', 6, 'SFT 測試', 20 FROM public.test_flow_stations WHERE station_name = 'Station 3'
UNION ALL
SELECT id, 'Stress Test', 7, 'CPU / DIMM / Disk 壓力測試', 30 FROM public.test_flow_stations WHERE station_name = 'Station 3';

-- Insert test items for Station 4
INSERT INTO public.test_flow_items (station_id, item_name, item_order, description, estimated_minutes) 
SELECT id, 'Tim Bake Tool', 1, 'Tim Bake 工具執行', 60 FROM public.test_flow_stations WHERE station_name = 'Station 4'
UNION ALL
SELECT id, 'NV Diag', 2, 'NV 協同測試項目', 120 FROM public.test_flow_stations WHERE station_name = 'Station 4'
UNION ALL
SELECT id, 'Log Collection', 3, 'Dump Log 並標記 MFG mode', 30 FROM public.test_flow_stations WHERE station_name = 'Station 4';

-- Insert 40 test systems
INSERT INTO public.test_systems (system_name, assigned_engineer, status)
SELECT 
  'System' || LPAD(generate_series::text, 2, '0') as system_name,
  CASE 
    WHEN generate_series <= 10 THEN 'Wilson'
    WHEN generate_series <= 20 THEN 'Brain' 
    WHEN generate_series <= 30 THEN 'Uturn'
    ELSE 'Kunfang'
  END as assigned_engineer,
  'Not Start' as status
FROM generate_series(1, 40);