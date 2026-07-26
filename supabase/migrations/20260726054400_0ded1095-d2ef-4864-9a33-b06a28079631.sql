
-- === Software version dynamic fields (mirror of address fields) ===
CREATE TABLE public.test_project_software_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.test_projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  placeholder text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_project_software_fields TO authenticated;
GRANT ALL ON public.test_project_software_fields TO service_role;
ALTER TABLE public.test_project_software_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "software_fields_all_authenticated"
  ON public.test_project_software_fields FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_software_fields_updated_at
  BEFORE UPDATE ON public.test_project_software_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.test_system_software_values (
  field_id uuid NOT NULL REFERENCES public.test_project_software_fields(id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.test_systems(id) ON DELETE CASCADE,
  value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (field_id, system_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_system_software_values TO authenticated;
GRANT ALL ON public.test_system_software_values TO service_role;
ALTER TABLE public.test_system_software_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "software_values_all_authenticated"
  ON public.test_system_software_values FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_software_values_updated_at
  BEFORE UPDATE ON public.test_system_software_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === Circuit editor workspace ===
CREATE TABLE public.circuit_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  board_width numeric NOT NULL DEFAULT 100,
  board_height numeric NOT NULL DEFAULT 80,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circuit_projects TO authenticated;
GRANT ALL ON public.circuit_projects TO service_role;
ALTER TABLE public.circuit_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circuit_projects_all_authenticated"
  ON public.circuit_projects FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_circuit_projects_updated_at
  BEFORE UPDATE ON public.circuit_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.circuit_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  manufacturer text,
  width numeric NOT NULL DEFAULT 10,
  height numeric NOT NULL DEFAULT 10,
  color text NOT NULL DEFAULT '#22d3ee',
  pin_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circuit_components TO authenticated;
GRANT ALL ON public.circuit_components TO service_role;
ALTER TABLE public.circuit_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circuit_components_all_authenticated"
  ON public.circuit_components FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_circuit_components_updated_at
  BEFORE UPDATE ON public.circuit_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed some starter components so the library is not empty
INSERT INTO public.circuit_components (name, category, manufacturer, width, height, color, pin_count) VALUES
  ('MCU STM32F4', 'ic', 'STMicro', 14, 14, '#22d3ee', 100),
  ('Capacitor 10uF', 'passive', 'Murata', 3.2, 1.6, '#f59e0b', 2),
  ('Resistor 10k', 'passive', 'Yageo', 3.2, 1.6, '#a78bfa', 2),
  ('USB-C Connector', 'connector', 'Molex', 9, 7.3, '#34d399', 24),
  ('LED Red 0805', 'passive', 'Kingbright', 2.0, 1.25, '#ef4444', 2),
  ('Crystal 16MHz', 'passive', 'Abracon', 5, 3.2, '#f472b6', 4);
