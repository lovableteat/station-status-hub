-- Historical embedded credential provisioning removed. No operational data is changed by this source edit.

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