insert into public.test_project_system_fields (
  project_id,
  category,
  field_key,
  label,
  field_type,
  is_system,
  sort_order
)
select
  projects.id,
  reserved.category,
  reserved.field_key,
  reserved.label,
  reserved.field_type,
  true,
  reserved.sort_order
from public.test_projects projects
cross join (
  values
    ('software', 'bom_90', 'BOM 90', 'text', 0),
    ('software', 'ubuntu_version', 'Ubuntu Version', 'text', 1),
    ('software', 'cuda_version', 'CUDA Version', 'text', 2),
    ('statistics', 'include_in_dashboard', 'Include in Dashboard', 'boolean', 3)
) as reserved(category, field_key, label, field_type, sort_order)
on conflict (project_id, field_key) do nothing;

create or replace function public.seed_reserved_system_metadata_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.test_project_system_fields (
    project_id,
    category,
    field_key,
    label,
    field_type,
    is_system,
    sort_order
  )
  values
    (new.id, 'software', 'bom_90', 'BOM 90', 'text', true, 0),
    (new.id, 'software', 'ubuntu_version', 'Ubuntu Version', 'text', true, 1),
    (new.id, 'software', 'cuda_version', 'CUDA Version', 'text', true, 2),
    (new.id, 'statistics', 'include_in_dashboard', 'Include in Dashboard', 'boolean', true, 3)
  on conflict (project_id, field_key) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_reserved_system_metadata_fields
  on public.test_projects;
create trigger seed_reserved_system_metadata_fields
after insert on public.test_projects
for each row execute function public.seed_reserved_system_metadata_fields();

create or replace function public.protect_system_metadata_definition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'Reserved system metadata field % cannot be deleted', old.field_key;
    end if;
    return old;
  end if;

  if old.is_system and (
    old.project_id is distinct from new.project_id
    or old.field_key is distinct from new.field_key
    or old.category is distinct from new.category
    or old.field_type is distinct from new.field_type
    or old.is_system is distinct from new.is_system
  ) then
    raise exception 'Reserved system metadata field % has a stable definition', old.field_key;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_test_project_system_fields
  on public.test_project_system_fields;
create trigger protect_test_project_system_fields
before update or delete on public.test_project_system_fields
for each row execute function public.protect_system_metadata_definition();

create or replace function public.save_test_system_metadata(
  p_system_id uuid,
  p_system_patch jsonb,
  p_address_values jsonb,
  p_metadata_values jsonb,
  p_empty_field_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  select project_id
  into v_project_id
  from public.test_systems
  where id = p_system_id;

  if not found then
    raise exception 'System % was not found', p_system_id;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_address_values, '[]'::jsonb))
      as values_to_save(field_id uuid, value text)
    left join public.test_project_address_fields fields
      on fields.id = values_to_save.field_id
    where fields.id is null or fields.project_id is distinct from v_project_id
  ) then
    raise exception 'Address field does not belong to system project %', v_project_id;
  end if;

  if exists (
    with requested_field_ids as (
      select values_to_save.field_id
      from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
        as values_to_save(field_id uuid, value jsonb)
      union
      select unnest(coalesce(p_empty_field_ids, array[]::uuid[]))
    )
    select 1
    from requested_field_ids requested
    left join public.test_project_system_fields fields
      on fields.id = requested.field_id
    where fields.id is null or fields.project_id is distinct from v_project_id
  ) then
    raise exception 'Metadata field does not belong to system project %', v_project_id;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
      as values_to_save(field_id uuid, value jsonb)
    join public.test_project_system_fields fields
      on fields.id = values_to_save.field_id
     and fields.project_id = v_project_id
    where
      (fields.field_type = 'text' and jsonb_typeof(values_to_save.value) not in ('string', 'null'))
      or (fields.field_type = 'number' and (
        jsonb_typeof(values_to_save.value) <> 'number'
        or case when jsonb_typeof(values_to_save.value) = 'number' then
          (values_to_save.value #>> '{}')::numeric in ('Infinity'::numeric, '-Infinity'::numeric, 'NaN'::numeric)
        else false end
      ))
      or (fields.field_type = 'boolean' and jsonb_typeof(values_to_save.value) <> 'boolean')
      or (fields.field_type = 'select' and (
        jsonb_typeof(values_to_save.value) <> 'string'
        or not (fields.options @> jsonb_build_array(values_to_save.value))
      ))
  ) then
    raise exception 'Metadata value does not match its field definition';
  end if;

  if exists (
    select 1
    from public.test_project_system_fields fields
    left join public.test_system_field_values existing_values
      on existing_values.field_id = fields.id
     and existing_values.system_id = p_system_id
    left join jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
      as incoming_values(field_id uuid, value jsonb)
      on incoming_values.field_id = fields.id
    left join lateral (
      select case
        when incoming_values.field_id is null then existing_values.value
        else incoming_values.value
      end as value
    ) resolved_value on true
    where fields.project_id = v_project_id
      and fields.is_required
      and (
        fields.id = any(coalesce(p_empty_field_ids, array[]::uuid[]))
        or resolved_value.value is null
        or resolved_value.value = 'null'::jsonb
        or (
          jsonb_typeof(resolved_value.value) = 'string'
          and btrim(resolved_value.value #>> '{}') = ''
        )
      )
  ) then
    raise exception 'Required metadata fields must have values';
  end if;

  update public.test_systems
  set
    system_name = p_system_patch->>'system_name',
    assigned_engineer = p_system_patch->>'assigned_engineer',
    model = p_system_patch->>'model',
    serial_number = p_system_patch->>'serial_number',
    cabinet = p_system_patch->>'cabinet',
    os_mac_address = p_system_patch->>'os_mac_address',
    bmc_address = p_system_patch->>'bmc_address',
    old_bmc_address = p_system_patch->>'old_bmc_address',
    bom_90 = p_system_patch->>'bom_90',
    ubuntu_version = p_system_patch->>'ubuntu_version',
    cuda_version = p_system_patch->>'cuda_version',
    exclude_from_dashboard = coalesce((p_system_patch->>'exclude_from_dashboard')::boolean, false),
    team = p_system_patch->>'team'
  where id = p_system_id;

  insert into public.test_system_address_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_address_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value text)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  insert into public.test_system_field_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value jsonb)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  delete from public.test_system_field_values
  where system_id = p_system_id
    and field_id = any(coalesce(p_empty_field_ids, array[]::uuid[]));
end;
$$;

grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to anon;
grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to authenticated;
grant execute on function public.save_test_system_metadata(uuid, jsonb, jsonb, jsonb, uuid[])
  to service_role;
