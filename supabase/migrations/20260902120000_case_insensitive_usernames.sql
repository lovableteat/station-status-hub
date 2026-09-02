-- Treat account names as case-insensitive during authentication while keeping
-- password verification case-sensitive. The stored username is preserved so
-- existing display names and audit records do not change unexpectedly.

-- A case-insensitive lookup must not be ambiguous. Existing usernames are
-- validated by this unique index before the new login behavior is enabled.
CREATE UNIQUE INDEX IF NOT EXISTS system_users_username_lower_unique
  ON workspace.system_users (lower(username));

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
  normalized_username text := lower(btrim(COALESCE(username_input, '')));
BEGIN
  SELECT users.* INTO user_record
  FROM workspace.system_users AS users
  WHERE lower(users.username) = normalized_username
    AND users.status = 'active'
  LIMIT 1;

  IF user_record.id IS NOT NULL
     AND public.verify_password(password_input, user_record.password_hash) THEN
    INSERT INTO workspace.login_audit (
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
    INSERT INTO workspace.login_audit (
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

-- Keep the archived workspace RPC and the legacy public RPC on the same
-- implementation so every client path gets identical case handling.
CREATE OR REPLACE FUNCTION workspace.authenticate_user(username_input text, password_input text)
RETURNS TABLE(
  user_id uuid,
  username character varying,
  role character varying,
  display_name character varying,
  success boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT * FROM public.authenticate_user($1, $2);
$function$;

REVOKE ALL ON FUNCTION public.authenticate_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_user(text, text)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION workspace.authenticate_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace.authenticate_user(text, text)
  TO anon, authenticated, service_role;
