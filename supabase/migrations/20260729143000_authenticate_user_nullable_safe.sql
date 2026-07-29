-- Nullable identity columns are expected until a legacy account completes its
-- first Auth migration. Check the stable primary key instead of the whole row.
CREATE OR REPLACE FUNCTION public.authenticate_user(username_input text, password_input text)
RETURNS TABLE(
  user_id uuid,
  username character varying,
  role character varying,
  display_name character varying,
  success boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  user_record record;
BEGIN
  SELECT users.* INTO user_record
  FROM public.system_users AS users
  WHERE users.username = username_input
    AND users.status = 'active'
  LIMIT 1;

  IF user_record.id IS NOT NULL
     AND public.verify_password(password_input, user_record.password_hash) THEN
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
      user_record.id,
      user_record.username::character varying(50),
      user_record.role::character varying(20),
      COALESCE(user_record.display_name, user_record.username)::character varying(100),
      true;
    RETURN;
  END IF;

  IF user_record.id IS NOT NULL THEN
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
    NULL::uuid,
    NULL::character varying(50),
    NULL::character varying(20),
    NULL::character varying(100),
    false;
END;
$function$;

REVOKE ALL ON FUNCTION public.authenticate_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_user(text, text) TO anon, authenticated, service_role;
