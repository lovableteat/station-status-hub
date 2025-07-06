-- Fix additional RLS policies for better security

-- Fix engineers table - require authentication for sensitive data
DROP POLICY IF EXISTS "Allow anonymous access to engineers" ON public.engineers;
CREATE POLICY "Allow authenticated users to view engineers" 
ON public.engineers 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admins can manage engineers" 
ON public.engineers 
FOR ALL 
TO authenticated
USING (auth.role() = 'service_role');

-- Fix user_roles table - this is sensitive data
DROP POLICY IF EXISTS "Allow anonymous access to user_roles" ON public.user_roles;
CREATE POLICY "Allow authenticated users to view user roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admins can manage user roles" 
ON public.user_roles 
FOR ALL 
TO authenticated
USING (auth.role() = 'service_role');

-- Station time analytics can remain public for dashboard viewing
-- Keep: "Allow anonymous access to station_time_analytics"

-- Export logs should be restricted to authenticated users
DROP POLICY IF EXISTS "Allow anonymous access to export logs" ON public.test_export_logs;
CREATE POLICY "Allow authenticated users to view export logs" 
ON public.test_export_logs 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create export logs" 
ON public.test_export_logs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- System settings should be restricted
DROP POLICY IF EXISTS "Allow anonymous access to system_settings" ON public.system_settings;
CREATE POLICY "Allow authenticated users to view system settings" 
ON public.system_settings 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admins can manage system settings" 
ON public.system_settings 
FOR ALL 
TO authenticated
USING (auth.role() = 'service_role');

-- Station contents can remain public for viewing test procedures
-- Keep: "Allow anonymous access to station_contents"