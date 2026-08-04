-- Expose only the minimal, non-sensitive account directory needed for private
-- messaging. Presence remains the sole source of online/offline state.
CREATE OR REPLACE FUNCTION public.list_active_collaboration_members()
RETURNS TABLE(
  user_id uuid,
  username varchar,
  display_name varchar,
  role varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    account.id,
    account.username,
    coalesce(account.display_name, account.username)::varchar,
    account.role
  FROM public.system_users AS account
  WHERE auth.uid() IS NOT NULL
    AND account.status = 'active'
  ORDER BY lower(coalesce(account.display_name, account.username)), lower(account.username);
$$;

REVOKE ALL ON FUNCTION public.list_active_collaboration_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_collaboration_members()
  TO authenticated, service_role;
