-- Create users table for login management
CREATE TABLE public.system_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'engineer',
  permissions JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  created_by VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create production targets table
CREATE TABLE public.production_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  daily_target INTEGER NOT NULL DEFAULT 10,
  weekly_target INTEGER NOT NULL DEFAULT 50,
  target_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;

-- Create policies for system_users
CREATE POLICY "Allow anonymous access to system_users" 
ON public.system_users 
FOR ALL 
USING (true);

-- Create policies for production_targets
CREATE POLICY "Allow anonymous access to production_targets" 
ON public.production_targets 
FOR ALL 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_system_users_updated_at
BEFORE UPDATE ON public.system_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_production_targets_updated_at
BEFORE UPDATE ON public.production_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default super admin
INSERT INTO public.system_users (username, password_hash, role, permissions, created_by)
VALUES ('liu52417', 'liu52417', 'super_admin', '{"all": true}', 'system');

-- Insert default production targets
INSERT INTO public.production_targets (daily_target, weekly_target) 
VALUES (10, 50);