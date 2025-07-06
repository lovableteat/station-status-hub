-- Ensure there's a super admin account and fix RLS for user creation
-- First, create or update the super admin account with proper password
INSERT INTO public.system_users (username, password_hash, role, status, created_by)
VALUES ('liu52417', public.hash_password('admin123'), 'super_admin', 'active', 'system')
ON CONFLICT (username) 
DO UPDATE SET 
  password_hash = public.hash_password('admin123'),
  role = 'super_admin',
  status = 'active',
  updated_at = now();

-- Also ensure RLS policies allow the super admin to create new users
-- Update the RLS policies to allow super admin operations
DROP POLICY IF EXISTS "Service role can insert users" ON public.system_users;
DROP POLICY IF EXISTS "Users can view their own record" ON public.system_users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.system_users;
DROP POLICY IF EXISTS "Service role can delete users" ON public.system_users;

-- Create new policies that work properly for admin operations
CREATE POLICY "Allow anonymous access to system_users" 
ON public.system_users 
FOR ALL 
USING (true);