-- Drop and recreate authenticate_user function with correct return types
DROP FUNCTION IF EXISTS public.authenticate_user(text, text);

-- Recreate with matching database field types
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
 RETURNS TABLE(user_id uuid, username character varying(50), role character varying(20), success boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
    RETURN QUERY SELECT 
      user_record.id as user_id,
      user_record.username::character varying(50) as username,
      user_record.role::character varying(20) as role,
      true as success;
  ELSE
    RETURN QUERY SELECT 
      null::uuid as user_id,
      null::character varying(50) as username, 
      null::character varying(20) as role,
      false as success;
  END IF;
END;
$function$;