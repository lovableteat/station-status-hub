-- Emergency fail-closed containment after SQL3.
-- Run only after rolling the frontend back to a service-mediated version.
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
grant execute on function public.set_user_access_permissions(
  uuid, public.page_permission[], jsonb, text
) to service_role;

revoke all on table workspace.user_page_permissions
  from public, anon, authenticated;
grant select on table workspace.user_page_permissions to authenticated;
grant all on table workspace.user_page_permissions to service_role;

notify pgrst, 'reload schema';
commit;
