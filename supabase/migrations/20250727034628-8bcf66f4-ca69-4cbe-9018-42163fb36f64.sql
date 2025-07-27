-- Fix password hashes for existing users
UPDATE public.system_users 
SET password_hash = public.hash_password(username)
WHERE username IN ('liu52417', '111');

-- Create login audit table for tracking login records
CREATE TABLE public.login_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  username VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL,
  display_name VARCHAR(100),
  login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS on login_audit
ALTER TABLE public.login_audit ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access (since this is internal system)
CREATE POLICY "Allow anonymous access to login_audit" 
ON public.login_audit 
FOR ALL 
USING (true);

-- Update authenticate_user function to log successful logins
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
 RETURNS TABLE(user_id uuid, username character varying, role character varying, display_name character varying, success boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  user_record record;
BEGIN
  -- Get user record
  SELECT * INTO user_record
  FROM public.system_users 
  WHERE system_users.username = username_input 
    AND system_users.status = 'active';
  
  -- Check if user exists and password is correct
  IF user_record IS NOT NULL AND public.verify_password(password_input, user_record.password_hash) THEN
    -- Log successful login
    INSERT INTO public.login_audit (
      user_id, username, role, display_name, success
    ) VALUES (
      user_record.id,
      user_record.username,
      user_record.role,
      COALESCE(user_record.display_name, user_record.username),
      true
    );
    
    RETURN QUERY SELECT 
      user_record.id as user_id,
      user_record.username::character varying(50) as username,
      user_record.role::character varying(20) as role,
      COALESCE(user_record.display_name, user_record.username)::character varying(100) as display_name,
      true as success;
  ELSE
    -- Log failed login attempt if user exists
    IF user_record IS NOT NULL THEN
      INSERT INTO public.login_audit (
        user_id, username, role, display_name, success
      ) VALUES (
        user_record.id,
        user_record.username,
        user_record.role,
        COALESCE(user_record.display_name, user_record.username),
        false
      );
    END IF;
    
    RETURN QUERY SELECT 
      null::uuid as user_id,
      null::character varying(50) as username, 
      null::character varying(20) as role,
      null::character varying(100) as display_name,
      false as success;
  END IF;
END;
$function$;