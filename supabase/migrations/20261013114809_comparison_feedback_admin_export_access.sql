begin;
create or replace function workspace.comparison_feedback_is_admin()
returns boolean language sql stable security invoker set search_path='' as $$
  select comparison_feedback_private.is_admin()
$$;
revoke all on function workspace.comparison_feedback_is_admin() from public, anon;
grant execute on function workspace.comparison_feedback_is_admin() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
