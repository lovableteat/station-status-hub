create or replace function public.reorder_test_project_system_fields(
  p_project_id uuid,
  p_field_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  project_field_count integer;
  requested_unique_count integer;
begin
  select count(*)
  into project_field_count
  from public.test_project_system_fields
  where project_id = p_project_id;

  select count(distinct field_id)
  into requested_unique_count
  from unnest(coalesce(p_field_ids, array[]::uuid[])) as requested(field_id);

  if cardinality(coalesce(p_field_ids, array[]::uuid[])) <> project_field_count
    or requested_unique_count <> project_field_count then
    raise exception
      'Field order must contain every project field exactly once (project %, expected %, received %)',
      p_project_id,
      project_field_count,
      cardinality(coalesce(p_field_ids, array[]::uuid[]));
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_field_ids, array[]::uuid[])) as requested(field_id)
    left join public.test_project_system_fields fields
      on fields.id = requested.field_id
      and fields.project_id = p_project_id
    where fields.id is null
  ) then
    raise exception 'Field order contains a field outside project %', p_project_id;
  end if;

  update public.test_project_system_fields fields
  set sort_order = requested.ordinality - 1
  from unnest(p_field_ids) with ordinality as requested(field_id, ordinality)
  where fields.id = requested.field_id
    and fields.project_id = p_project_id;
end;
$$;

grant execute on function public.reorder_test_project_system_fields(uuid, uuid[])
  to anon;
grant execute on function public.reorder_test_project_system_fields(uuid, uuid[])
  to authenticated;
grant execute on function public.reorder_test_project_system_fields(uuid, uuid[])
  to service_role;
