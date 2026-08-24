-- Repair objects that were absent when the application tables were archived
-- into the hosted `workspace` schema. This migration is deliberately additive:
-- it does not rewrite accounts, machines, test progress, projects, or issues.

alter type public.page_permission
  add value if not exists 'performance_view';
alter type public.page_permission
  add value if not exists 'performance_edit';

create table if not exists workspace.performance_reviews (
  id text primary key,
  cycle_id text not null default '2026-q3',
  employee_id text,
  employee_name text not null,
  department text not null default '',
  role text not null default '工程師',
  reviewer_name text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'in-progress', 'submitted', 'approved')),
  score numeric(5, 2)
    check (score is null or (score >= 0 and score <= 100)),
  due_date date,
  goals jsonb not null default '[]'::jsonb,
  self_feedback text not null default '',
  manager_feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists performance_reviews_cycle_id_idx
  on workspace.performance_reviews (cycle_id);
create index if not exists performance_reviews_status_idx
  on workspace.performance_reviews (status);
create index if not exists performance_reviews_employee_id_idx
  on workspace.performance_reviews (employee_id);

create table if not exists workspace.test_project_system_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.test_projects(id) on delete cascade,
  category text not null check (category in ('software', 'statistics')),
  field_key text not null,
  label text not null,
  placeholder text,
  field_type text not null check (field_type in ('text', 'number', 'boolean', 'select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_test_project_system_fields_project_key
  on workspace.test_project_system_fields(project_id, field_key);
create index if not exists idx_test_project_system_fields_project_order
  on workspace.test_project_system_fields(project_id, sort_order, created_at);

create table if not exists workspace.test_system_field_values (
  field_id uuid not null
    references workspace.test_project_system_fields(id) on delete cascade,
  system_id uuid not null references workspace.test_systems(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (field_id, system_id)
);

create index if not exists idx_test_system_field_values_system
  on workspace.test_system_field_values(system_id);

create or replace function workspace.current_user_can_workspace(
  p_workspace text,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user workspace.system_users%rowtype;
  v_level text;
  v_permissions text[];
begin
  select users.*
  into v_user
  from workspace.system_users as users
  where users.auth_user_id = (select auth.uid())
    and users.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  if v_user.role in ('admin', 'super_admin') then
    return true;
  end if;

  if coalesce(v_user.permissions, '{}'::jsonb) #> '{workspaceAccess}' ? p_workspace then
    v_level := coalesce(
      v_user.permissions #>> array['workspaceAccess', p_workspace],
      'none'
    );
    return case
      when p_action = 'edit' then v_level = 'edit'
      else v_level in ('view', 'edit')
    end;
  end if;

  v_permissions := case
    when p_workspace = 'station-status' and p_action = 'edit' then array[
      'dashboard_edit', 'test_tracker_edit', 'flow_info_edit',
      'issues_edit', 'production_edit', 'tools_edit'
    ]
    when p_workspace = 'station-status' then array[
      'dashboard_view', 'dashboard_edit',
      'test_tracker_view', 'test_tracker_edit',
      'flow_info_view', 'flow_info_edit',
      'issues_view', 'issues_edit',
      'production_view', 'production_edit',
      'tools_view', 'tools_edit'
    ]
    when p_workspace = 'ai-chat' and p_action = 'edit' then
      array['comparison_edit', 'api_management_edit']
    when p_workspace = 'ai-chat' then array[
      'comparison_view', 'comparison_edit',
      'api_management_view', 'api_management_edit'
    ]
    when p_workspace = 'performance' and p_action = 'edit' then
      array['performance_edit']
    when p_workspace = 'performance' then
      array['performance_view', 'performance_edit']
    else array[]::text[]
  end;

  return exists (
    select 1
    from workspace.user_page_permissions as page_permissions
    where page_permissions.user_id = v_user.id
      and page_permissions.permission::text = any(v_permissions)
  );
end;
$$;

revoke all on function workspace.current_user_can_workspace(text, text) from public, anon;
grant execute on function workspace.current_user_can_workspace(text, text)
  to authenticated, service_role;

-- Remove every legacy permissive policy before installing permission-aware ones.
do $$
declare
  target_table text;
  policy_record record;
begin
  foreach target_table in array array[
    'system_users', 'api_keys', 'performance_reviews',
    'test_project_system_fields', 'test_system_field_values'
  ] loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'workspace'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on workspace.%I',
        policy_record.policyname,
        target_table
      );
    end loop;
  end loop;
end
$$;

alter table workspace.system_users enable row level security;
revoke all on table workspace.system_users from public;
revoke all on table workspace.system_users from anon;
revoke all on table workspace.system_users from authenticated;
grant select (
  id, username, display_name, role, status, permissions,
  created_by, created_at, updated_at, registration_requested_at,
  approved_at, approved_by, auth_user_id, auth_migrated_at,
  last_seen_at, avatar_path
) on workspace.system_users to authenticated;
grant all on table workspace.system_users to service_role;

create policy system_users_authenticated_read
  on workspace.system_users for select to authenticated
  using (workspace.current_system_user_id() is not null);

alter table workspace.api_keys enable row level security;
revoke all on table workspace.api_keys from public;
revoke all on table workspace.api_keys from anon;
revoke all on table workspace.api_keys from authenticated;
grant select, insert, update, delete on workspace.api_keys to authenticated;
grant all on table workspace.api_keys to service_role;

create policy api_keys_read
  on workspace.api_keys for select to authenticated
  using (workspace.current_user_can_workspace('ai-chat', 'view'));
create policy api_keys_insert
  on workspace.api_keys for insert to authenticated
  with check (workspace.current_user_can_workspace('ai-chat', 'edit'));
create policy api_keys_update
  on workspace.api_keys for update to authenticated
  using (workspace.current_user_can_workspace('ai-chat', 'edit'))
  with check (workspace.current_user_can_workspace('ai-chat', 'edit'));
create policy api_keys_delete
  on workspace.api_keys for delete to authenticated
  using (workspace.current_user_can_workspace('ai-chat', 'edit'));

alter table workspace.performance_reviews enable row level security;
revoke all on table workspace.performance_reviews from public, anon, authenticated;
grant select, insert, update, delete on workspace.performance_reviews to authenticated;
grant all on table workspace.performance_reviews to service_role;

create policy performance_reviews_read
  on workspace.performance_reviews for select to authenticated
  using (workspace.current_user_can_workspace('performance', 'view'));
create policy performance_reviews_insert
  on workspace.performance_reviews for insert to authenticated
  with check (workspace.current_user_can_workspace('performance', 'edit'));
create policy performance_reviews_update
  on workspace.performance_reviews for update to authenticated
  using (workspace.current_user_can_workspace('performance', 'edit'))
  with check (workspace.current_user_can_workspace('performance', 'edit'));
create policy performance_reviews_delete
  on workspace.performance_reviews for delete to authenticated
  using (workspace.current_user_can_workspace('performance', 'edit'));

alter table workspace.test_project_system_fields enable row level security;
alter table workspace.test_system_field_values enable row level security;
revoke all on table workspace.test_project_system_fields from public, anon, authenticated;
revoke all on table workspace.test_system_field_values from public, anon, authenticated;
grant select, insert, update, delete on workspace.test_project_system_fields to authenticated;
grant select on workspace.test_system_field_values to authenticated;
grant all on table workspace.test_project_system_fields to service_role;
grant all on table workspace.test_system_field_values to service_role;

create policy test_project_system_fields_read
  on workspace.test_project_system_fields for select to authenticated
  using (workspace.current_user_can_workspace('station-status', 'view'));
create policy test_project_system_fields_write
  on workspace.test_project_system_fields for all to authenticated
  using (workspace.current_user_can_workspace('station-status', 'edit'))
  with check (workspace.current_user_can_workspace('station-status', 'edit'));
create policy test_system_field_values_read
  on workspace.test_system_field_values for select to authenticated
  using (workspace.current_user_can_workspace('station-status', 'view'));

create or replace function workspace.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists update_performance_reviews_updated_at
  on workspace.performance_reviews;
create trigger update_performance_reviews_updated_at
before update on workspace.performance_reviews
for each row execute function workspace.touch_updated_at();

drop trigger if exists update_test_project_system_fields_updated_at
  on workspace.test_project_system_fields;
create trigger update_test_project_system_fields_updated_at
before update on workspace.test_project_system_fields
for each row execute function workspace.touch_updated_at();

drop trigger if exists update_test_system_field_values_updated_at
  on workspace.test_system_field_values;
create trigger update_test_system_field_values_updated_at
before update on workspace.test_system_field_values
for each row execute function workspace.touch_updated_at();

insert into workspace.test_project_system_fields (
  project_id, category, field_key, label, field_type, is_system, sort_order
)
select
  projects.id,
  reserved.category,
  reserved.field_key,
  reserved.label,
  reserved.field_type,
  true,
  reserved.sort_order
from workspace.test_projects as projects
cross join (
  values
    ('software', 'bom_90', 'BOM 90', 'text', 0),
    ('software', 'ubuntu_version', 'Ubuntu Version', 'text', 1),
    ('software', 'cuda_version', 'CUDA Version', 'text', 2),
    ('statistics', 'include_in_dashboard', 'Include in Dashboard', 'boolean', 3)
) as reserved(category, field_key, label, field_type, sort_order)
on conflict (project_id, field_key) do nothing;

insert into workspace.test_system_field_values (field_id, system_id, value)
select
  fields.id,
  systems.id,
  case fields.field_key
    when 'bom_90' then coalesce(to_jsonb(systems.bom_90), 'null'::jsonb)
    when 'ubuntu_version' then coalesce(to_jsonb(systems.ubuntu_version), 'null'::jsonb)
    when 'cuda_version' then coalesce(to_jsonb(systems.cuda_version), 'null'::jsonb)
    when 'include_in_dashboard' then
      to_jsonb(not coalesce(systems.exclude_from_dashboard, false))
  end
from workspace.test_systems as systems
join workspace.test_project_system_fields as fields
  on fields.project_id = systems.project_id
 and fields.field_key in (
   'bom_90', 'ubuntu_version', 'cuda_version', 'include_in_dashboard'
 )
on conflict (field_id, system_id) do nothing;

insert into workspace.test_project_system_fields (
  project_id, category, field_key, label, placeholder, field_type,
  is_system, sort_order, created_at, updated_at
)
select
  legacy_fields.project_id,
  'software',
  'legacy_software_' || md5(legacy_fields.id::text),
  legacy_fields.label,
  legacy_fields.placeholder,
  'text',
  false,
  legacy_fields.sort_order,
  legacy_fields.created_at,
  legacy_fields.updated_at
from workspace.test_project_software_fields as legacy_fields
on conflict (project_id, field_key) do nothing;

insert into workspace.test_system_field_values (
  field_id, system_id, value, created_at, updated_at
)
select
  fields.id,
  legacy_values.system_id,
  to_jsonb(legacy_values.value),
  legacy_values.created_at,
  legacy_values.updated_at
from workspace.test_system_software_values as legacy_values
join workspace.test_project_software_fields as legacy_fields
  on legacy_fields.id = legacy_values.field_id
join workspace.test_project_system_fields as fields
  on fields.project_id = legacy_fields.project_id
 and fields.field_key = 'legacy_software_' || md5(legacy_fields.id::text)
on conflict (field_id, system_id) do nothing;

create or replace function workspace.seed_reserved_system_metadata_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into workspace.test_project_system_fields (
    project_id, category, field_key, label, field_type, is_system, sort_order
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
  on workspace.test_projects;
create trigger seed_reserved_system_metadata_fields
after insert on workspace.test_projects
for each row execute function workspace.seed_reserved_system_metadata_fields();

create or replace function workspace.protect_system_metadata_definition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system and exists (
      select 1 from workspace.test_projects where id = old.project_id
    ) then
      raise exception 'Reserved system metadata field % cannot be deleted', old.field_key;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.is_system and not (
      (new.field_key in ('bom_90', 'ubuntu_version', 'cuda_version')
        and new.category = 'software' and new.field_type = 'text')
      or (new.field_key = 'include_in_dashboard'
        and new.category = 'statistics' and new.field_type = 'boolean')
    ) then
      raise exception 'System metadata field % does not match a reserved definition', new.field_key;
    end if;
    return new;
  end if;

  if old.is_system is distinct from new.is_system then
    raise exception 'System metadata status cannot be changed for field %', old.field_key;
  end if;
  if old.is_system and (
    old.project_id is distinct from new.project_id
    or old.field_key is distinct from new.field_key
    or old.category is distinct from new.category
    or old.field_type is distinct from new.field_type
  ) then
    raise exception 'Reserved system metadata field % has a stable definition', old.field_key;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_test_project_system_fields
  on workspace.test_project_system_fields;
create trigger protect_test_project_system_fields
before insert or update or delete on workspace.test_project_system_fields
for each row execute function workspace.protect_system_metadata_definition();

create or replace function workspace.save_test_system_metadata(
  p_system_id uuid,
  p_system_patch jsonb,
  p_address_values jsonb,
  p_metadata_values jsonb,
  p_empty_field_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if (select auth.role()) <> 'service_role'
    and not workspace.current_user_can_workspace('station-status', 'edit') then
    raise exception 'Station workspace edit access required' using errcode = '42501';
  end if;

  select project_id into v_project_id
  from workspace.test_systems
  where id = p_system_id;

  if not found then
    raise exception 'System % was not found', p_system_id;
  end if;

  if exists (
    with requested_field_ids as (
      select values_to_save.field_id
      from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
        as values_to_save(field_id uuid, value jsonb)
      union all
      select unnest(coalesce(p_empty_field_ids, array[]::uuid[]))
    )
    select 1
    from requested_field_ids as requested
    group by requested.field_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate metadata field IDs are not allowed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_address_values, '[]'::jsonb))
      as values_to_save(field_id uuid, value text)
    left join workspace.test_project_address_fields as fields
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
    from requested_field_ids as requested
    left join workspace.test_project_system_fields as fields
      on fields.id = requested.field_id
    where fields.id is null or fields.project_id is distinct from v_project_id
  ) then
    raise exception 'Metadata field does not belong to system project %', v_project_id;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
      as values_to_save(field_id uuid, value jsonb)
    join workspace.test_project_system_fields as fields
      on fields.id = values_to_save.field_id
     and fields.project_id = v_project_id
    where
      (fields.field_type = 'text'
        and jsonb_typeof(values_to_save.value) not in ('string', 'null'))
      or (fields.field_type = 'number' and (
        jsonb_typeof(values_to_save.value) <> 'number'
        or case when jsonb_typeof(values_to_save.value) = 'number' then
          (values_to_save.value #>> '{}')::numeric
            in ('Infinity'::numeric, '-Infinity'::numeric, 'NaN'::numeric)
        else false end
      ))
      or (fields.field_type = 'boolean'
        and jsonb_typeof(values_to_save.value) <> 'boolean')
      or (fields.field_type = 'select' and (
        jsonb_typeof(values_to_save.value) <> 'string'
        or not (fields.options @> jsonb_build_array(values_to_save.value))
      ))
  ) then
    raise exception 'Metadata value does not match its field definition';
  end if;

  if exists (
    select 1
    from workspace.test_project_system_fields as fields
    left join workspace.test_system_field_values as existing_values
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
    ) as resolved_value on true
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

  update workspace.test_systems
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
    exclude_from_dashboard = coalesce(
      (p_system_patch->>'exclude_from_dashboard')::boolean,
      false
    ),
    team = p_system_patch->>'team'
  where id = p_system_id;

  insert into workspace.test_system_address_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_address_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value text)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  insert into workspace.test_system_field_values (field_id, system_id, value)
  select values_to_save.field_id, p_system_id, values_to_save.value
  from jsonb_to_recordset(coalesce(p_metadata_values, '[]'::jsonb))
    as values_to_save(field_id uuid, value jsonb)
  on conflict (field_id, system_id)
  do update set value = excluded.value;

  delete from workspace.test_system_field_values
  where system_id = p_system_id
    and field_id = any(coalesce(p_empty_field_ids, array[]::uuid[]));
end;
$$;

revoke all on function workspace.save_test_system_metadata(
  uuid, jsonb, jsonb, jsonb, uuid[]
) from public, anon;
grant execute on function workspace.save_test_system_metadata(
  uuid, jsonb, jsonb, jsonb, uuid[]
) to authenticated, service_role;

create or replace function workspace.reorder_test_project_system_fields(
  p_project_id uuid,
  p_field_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_field_count integer;
  requested_unique_count integer;
begin
  if (select auth.role()) <> 'service_role'
    and not workspace.current_user_can_workspace('station-status', 'edit') then
    raise exception 'Station workspace edit access required' using errcode = '42501';
  end if;

  select count(*) into project_field_count
  from workspace.test_project_system_fields
  where project_id = p_project_id;

  select count(distinct field_id) into requested_unique_count
  from unnest(coalesce(p_field_ids, array[]::uuid[])) as requested(field_id);

  if cardinality(coalesce(p_field_ids, array[]::uuid[])) <> project_field_count
    or requested_unique_count <> project_field_count then
    raise exception 'Field order must contain every project field exactly once';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_field_ids, array[]::uuid[])) as requested(field_id)
    left join workspace.test_project_system_fields as fields
      on fields.id = requested.field_id and fields.project_id = p_project_id
    where fields.id is null
  ) then
    raise exception 'Field order contains a field outside project %', p_project_id;
  end if;

  update workspace.test_project_system_fields as fields
  set sort_order = requested.ordinality - 1
  from unnest(p_field_ids) with ordinality as requested(field_id, ordinality)
  where fields.id = requested.field_id and fields.project_id = p_project_id;
end;
$$;

revoke all on function workspace.reorder_test_project_system_fields(uuid, uuid[])
  from public, anon;
grant execute on function workspace.reorder_test_project_system_fields(uuid, uuid[])
  to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'workspace'
        and tablename = 'performance_reviews'
    ) then
      alter publication supabase_realtime add table workspace.performance_reviews;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'workspace'
        and tablename = 'test_project_system_fields'
    ) then
      alter publication supabase_realtime add table workspace.test_project_system_fields;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'workspace'
        and tablename = 'test_system_field_values'
    ) then
      alter publication supabase_realtime add table workspace.test_system_field_values;
    end if;
  end if;
end
$$;

notify pgrst, 'reload schema';
