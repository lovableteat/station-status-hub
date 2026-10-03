-- Emergency fail-closed RPC containment after SQL3.
-- First disable or replace any deployed legacy account-admin-sync version that
-- still performs service-role system_users writes. SQL cannot revoke the
-- platform service key from an already deployed legacy Edge implementation.
-- This intentionally does not restore direct authenticated table writes.
begin;

revoke all on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) from public, anon, authenticated;
revoke all on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) from public, anon, authenticated;
revoke all on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) from public, anon, authenticated;
revoke all on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) from public, anon, authenticated;

grant execute on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) to service_role;
grant execute on function workspace.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) to service_role;
grant execute on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text, boolean
) to service_role;

revoke all on function workspace.create_system_user_admin_profile(
  text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function workspace.update_system_user_admin_profile(
  uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function workspace.delete_system_user_admin_profile(uuid)
  from public, anon, authenticated, service_role;
revoke all on function workspace.authorize_system_user_admin_sync(uuid)
  from public, anon, authenticated, service_role;
revoke all on function workspace.approve_system_user(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.approve_system_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) to service_role;

revoke all on table workspace.user_page_permissions
  from public, anon, authenticated;
grant select on table workspace.user_page_permissions to authenticated;
grant all on table workspace.user_page_permissions to service_role;

notify pgrst, 'reload schema';
commit;
