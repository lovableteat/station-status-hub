-- Fix the authenticate_user function - resolve column reference ambiguity
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
 RETURNS TABLE(user_id uuid, username text, role text, success boolean)
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
      user_record.username as username,
      user_record.role as role,
      true as success;
  ELSE
    RETURN QUERY SELECT 
      null::uuid as user_id,
      null::text as username, 
      null::text as role,
      false as success;
  END IF;
END;
$function$;