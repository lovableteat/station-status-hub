-- Fix critical security vulnerabilities

-- Install pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create function to hash passwords using crypt
CREATE OR REPLACE FUNCTION public.hash_password(password text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT crypt(password, gen_salt('bf', 10));
$$;

-- Create function to verify passwords
CREATE OR REPLACE FUNCTION public.verify_password(password text, hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT crypt(password, hash) = hash;
$$;

-- Hash existing plaintext passwords in system_users table
UPDATE public.system_users 
SET password_hash = public.hash_password(password_hash)
WHERE password_hash NOT LIKE '$2%'; -- Only update if not already hashed

-- Drop the insecure anonymous access policy for system_users
DROP POLICY IF EXISTS "Allow anonymous access to system_users" ON public.system_users;

-- Create secure RLS policies for system_users that require authentication
-- Only allow users to see their own record for security
CREATE POLICY "Users can view their own record" 
ON public.system_users 
FOR SELECT 
USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

-- Allow authenticated users to update their own record (for password changes)
CREATE POLICY "Users can update their own record" 
ON public.system_users 
FOR UPDATE 
USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

-- Only service role can insert new users (admin functionality)
CREATE POLICY "Service role can insert users" 
ON public.system_users 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Only service role can delete users (admin functionality)  
CREATE POLICY "Service role can delete users" 
ON public.system_users 
FOR DELETE 
USING (auth.role() = 'service_role');

-- Create a secure login function that uses proper password verification
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
RETURNS TABLE(user_id uuid, username text, role text, success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record record;
BEGIN
  -- Get user record
  SELECT * INTO user_record
  FROM public.system_users 
  WHERE username = username_input 
    AND status = 'active';
  
  -- Check if user exists and password is correct
  IF user_record IS NOT NULL AND public.verify_password(password_input, user_record.password_hash) THEN
    RETURN QUERY SELECT 
      user_record.id,
      user_record.username,
      user_record.role,
      true as success;
  ELSE
    RETURN QUERY SELECT 
      null::uuid as user_id,
      null::text as username, 
      null::text as role,
      false as success;
  END IF;
END;
$$;