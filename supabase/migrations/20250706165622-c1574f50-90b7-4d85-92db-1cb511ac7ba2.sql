-- Temporarily allow anonymous access to engineers and user_roles for user management functionality
-- This is needed until full Supabase Auth integration is implemented

-- Allow anonymous access to engineers table for user management
DROP POLICY IF EXISTS "Allow authenticated users to view engineers" ON public.engineers;
DROP POLICY IF EXISTS "Admins can manage engineers" ON public.engineers;
CREATE POLICY "Allow anonymous access to engineers" 
ON public.engineers 
FOR ALL 
USING (true);

-- Allow anonymous access to user_roles table for user management  
DROP POLICY IF EXISTS "Allow authenticated users to view user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Allow anonymous access to user_roles"
ON public.user_roles
FOR ALL
USING (true);

-- Note: These policies should be restricted once full authentication is implemented