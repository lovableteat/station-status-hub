-- Upgrade the machine-maintenance workspace without discarding legacy records.
-- Existing project data is pinned to a generated published v1 flow before the
-- application starts creating drafts and later flow versions.

alter table public.test_projects
  add column if not exists status text not null default 'active',
  add column if not exists owner_user_id uuid,
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_projects_status_check'
  ) then
    alter table public.test_projects
      add constraint test_projects_status_check
      check (status in ('planning', 'active', 'paused', 'completed', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'test_projects_owner_user_id_fkey'
  ) then
    alter table public.test_projects
      add constraint test_projects_owner_user_id_fkey
      foreign key (owner_user_id) references public.system_users(id) on delete set null;
  end if;
end
$$;

update public.test_projects
set status = case when is_archived then 'archived' else 'active' end
where status is null
   or (is_archived and status <> 'archived');

update public.test_projects
set started_at = coalesce(started_at, created_at, now())
where status = 'active'
  and started_at is null;

create or replace function public.sync_test_project_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.is_archived := new.status = 'archived';
  elsif tg_op = 'UPDATE' and new.is_archived is distinct from old.is_archived then
    new.status := case when new.is_archived then 'archived' else 'active' end;
  else
    new.is_archived := new.status = 'archived';
  end if;

  if new.status = 'active' and new.started_at is null then
    new.started_at := now();
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;

  return new;
end
$$;

drop trigger if exists sync_test_project_lifecycle on public.test_projects;
create trigger sync_test_project_lifecycle
before insert or update of status, is_archived on public.test_projects
for each row execute function public.sync_test_project_lifecycle();

create table if not exists public.test_flow_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.test_projects(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  label text,
  notes text,
  created_by uuid references public.system_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create unique index if not exists idx_test_flow_versions_one_draft
  on public.test_flow_versions(project_id)
  where status = 'draft';

create index if not exists idx_test_flow_versions_project_status
  on public.test_flow_versions(project_id, status, version_number desc);

alter table public.test_flow_versions enable row level security;
drop policy if exists "Allow anonymous access to test_flow_versions"
  on public.test_flow_versions;
create policy "Allow anonymous access to test_flow_versions"
on public.test_flow_versions for all using (true) with check (true);

drop trigger if exists update_test_flow_versions_updated_at
  on public.test_flow_versions;
create trigger update_test_flow_versions_updated_at
before update on public.test_flow_versions
for each row execute function public.update_updated_at_column();

alter table public.test_projects
  add column if not exists active_flow_version_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_projects_active_flow_version_id_fkey'
  ) then
    alter table public.test_projects
      add constraint test_projects_active_flow_version_id_fkey
      foreign key (active_flow_version_id)
      references public.test_flow_versions(id) on delete set null;
  end if;
end
$$;

insert into public.test_flow_versions (
  project_id,
  version_number,
  status,
  label,
  notes,
  published_at
)
select
  projects.id,
  1,
  'published',
  'v1',
  'Migrated from the original project flow.',
  coalesce(projects.updated_at, projects.created_at, now())
from public.test_projects as projects
where not exists (
  select 1
  from public.test_flow_versions as versions
  where versions.project_id = projects.id
)
on conflict (project_id, version_number) do nothing;

update public.test_projects as projects
set active_flow_version_id = (
  select versions.id
  from public.test_flow_versions as versions
  where versions.project_id = projects.id
    and versions.status = 'published'
  order by versions.version_number desc
  limit 1
)
where projects.active_flow_version_id is null;

alter table public.test_flow_stations
  add column if not exists flow_version_id uuid;
alter table public.test_flow_items
  add column if not exists flow_version_id uuid;
alter table public.station_contents
  add column if not exists flow_version_id uuid;
alter table public.test_systems
  add column if not exists flow_version_id uuid;

update public.test_flow_stations as stations
set flow_version_id = projects.active_flow_version_id
from public.test_projects as projects
where stations.project_id = projects.id
  and stations.flow_version_id is null;

update public.test_flow_items as items
set flow_version_id = stations.flow_version_id
from public.test_flow_stations as stations
where items.station_id = stations.id
  and items.flow_version_id is null;

update public.station_contents as contents
set flow_version_id = stations.flow_version_id
from public.test_flow_stations as stations
where contents.station_id = stations.id
  and contents.flow_version_id is null;

update public.test_systems as systems
set flow_version_id = projects.active_flow_version_id
from public.test_projects as projects
where systems.project_id = projects.id
  and systems.flow_version_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_flow_stations_flow_version_id_fkey'
  ) then
    alter table public.test_flow_stations
      add constraint test_flow_stations_flow_version_id_fkey
      foreign key (flow_version_id) references public.test_flow_versions(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'test_flow_items_flow_version_id_fkey'
  ) then
    alter table public.test_flow_items
      add constraint test_flow_items_flow_version_id_fkey
      foreign key (flow_version_id) references public.test_flow_versions(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'station_contents_flow_version_id_fkey'
  ) then
    alter table public.station_contents
      add constraint station_contents_flow_version_id_fkey
      foreign key (flow_version_id) references public.test_flow_versions(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'test_systems_flow_version_id_fkey'
  ) then
    alter table public.test_systems
      add constraint test_systems_flow_version_id_fkey
      foreign key (flow_version_id) references public.test_flow_versions(id) on delete restrict;
  end if;
end
$$;

alter table public.test_flow_stations alter column flow_version_id set not null;
alter table public.test_flow_items alter column flow_version_id set not null;
alter table public.station_contents alter column flow_version_id set not null;
alter table public.test_systems alter column flow_version_id set not null;

create or replace function public.assign_test_system_flow_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id is null then
    raise exception 'A project is required before assigning a flow version';
  end if;

  if new.flow_version_id is null then
    select active_flow_version_id
    into new.flow_version_id
    from public.test_projects
    where id = new.project_id;
  end if;

  if new.flow_version_id is null then
    raise exception 'Project % does not have a published flow version', new.project_id;
  end if;

  if not exists (
    select 1
    from public.test_flow_versions
    where id = new.flow_version_id
      and project_id = new.project_id
  ) then
    raise exception 'Flow version % does not belong to project %', new.flow_version_id, new.project_id;
  end if;

  return new;
end
$$;

drop trigger if exists assign_test_system_flow_version on public.test_systems;
create trigger assign_test_system_flow_version
before insert or update of project_id, flow_version_id on public.test_systems
for each row execute function public.assign_test_system_flow_version();

drop index if exists public.idx_test_flow_stations_project_order;
drop index if exists public.idx_test_flow_items_project_station_order;
drop index if exists public.idx_station_contents_project_station_order;

create unique index if not exists idx_test_flow_stations_version_order
  on public.test_flow_stations(flow_version_id, station_order);
create unique index if not exists idx_test_flow_items_version_station_order
  on public.test_flow_items(flow_version_id, station_id, item_order);
create unique index if not exists idx_station_contents_version_station_order
  on public.station_contents(flow_version_id, station_id, order_num);

alter table public.test_systems
  drop constraint if exists test_systems_system_name_key;
drop index if exists public.test_systems_system_name_key;
create unique index if not exists idx_test_systems_project_system_name
  on public.test_systems(project_id, lower(system_name));

create table if not exists public.test_project_tool_assignments (
  project_id uuid not null references public.test_projects(id) on delete cascade,
  tool_id uuid not null references public.tools_management(id) on delete cascade,
  is_required boolean not null default false,
  pinned_version text,
  notes text,
  created_at timestamptz not null default now(),
  primary key (project_id, tool_id)
);

create table if not exists public.test_project_code_assignments (
  project_id uuid not null references public.test_projects(id) on delete cascade,
  code_snippet_id uuid not null references public.code_snippets(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  primary key (project_id, code_snippet_id)
);

create table if not exists public.test_project_command_assignments (
  project_id uuid not null references public.test_projects(id) on delete cascade,
  command_id uuid not null references public.command_library(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  primary key (project_id, command_id)
);

alter table public.test_project_tool_assignments enable row level security;
alter table public.test_project_code_assignments enable row level security;
alter table public.test_project_command_assignments enable row level security;

drop policy if exists "Allow anonymous access to test_project_tool_assignments"
  on public.test_project_tool_assignments;
create policy "Allow anonymous access to test_project_tool_assignments"
on public.test_project_tool_assignments for all using (true) with check (true);

drop policy if exists "Allow anonymous access to test_project_code_assignments"
  on public.test_project_code_assignments;
create policy "Allow anonymous access to test_project_code_assignments"
on public.test_project_code_assignments for all using (true) with check (true);

drop policy if exists "Allow anonymous access to test_project_command_assignments"
  on public.test_project_command_assignments;
create policy "Allow anonymous access to test_project_command_assignments"
on public.test_project_command_assignments for all using (true) with check (true);

-- Preserve the old global-library behavior for every existing project.
insert into public.test_project_tool_assignments (project_id, tool_id, is_required)
select projects.id, tools.id, coalesce(tools.is_required, false)
from public.test_projects as projects
cross join public.tools_management as tools
on conflict (project_id, tool_id) do nothing;

insert into public.test_project_code_assignments (project_id, code_snippet_id)
select projects.id, snippets.id
from public.test_projects as projects
cross join public.code_snippets as snippets
on conflict (project_id, code_snippet_id) do nothing;

insert into public.test_project_command_assignments (project_id, command_id)
select projects.id, commands.id
from public.test_projects as projects
cross join public.command_library as commands
on conflict (project_id, command_id) do nothing;

create or replace function public.create_test_flow_draft(
  p_project_id uuid,
  p_created_by uuid default null
)
returns public.test_flow_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.test_flow_versions;
  v_source_version_id uuid;
  v_draft public.test_flow_versions;
  v_station record;
  v_new_station_id uuid;
begin
  select active_flow_version_id into v_source_version_id
  from public.test_projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'Project not found';
  end if;

  select * into v_existing
  from public.test_flow_versions
  where project_id = p_project_id and status = 'draft'
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.test_flow_versions (
    project_id,
    version_number,
    status,
    label,
    created_by
  )
  values (
    p_project_id,
    coalesce((select max(version_number) + 1 from public.test_flow_versions where project_id = p_project_id), 1),
    'draft',
    'Draft',
    p_created_by
  )
  returning * into v_draft;

  if v_source_version_id is not null then
    for v_station in
      select *
      from public.test_flow_stations
      where flow_version_id = v_source_version_id
      order by station_order
    loop
      insert into public.test_flow_stations (
        project_id,
        flow_version_id,
        station_name,
        station_order,
        description,
        estimated_hours
      )
      values (
        p_project_id,
        v_draft.id,
        v_station.station_name,
        v_station.station_order,
        v_station.description,
        v_station.estimated_hours
      )
      returning id into v_new_station_id;

      insert into public.test_flow_items (
        project_id,
        flow_version_id,
        station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      )
      select
        p_project_id,
        v_draft.id,
        v_new_station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      from public.test_flow_items
      where station_id = v_station.id
      order by item_order;

      insert into public.station_contents (
        project_id,
        flow_version_id,
        station_id,
        title,
        content,
        order_num
      )
      select
        p_project_id,
        v_draft.id,
        v_new_station_id,
        title,
        content,
        order_num
      from public.station_contents
      where station_id = v_station.id
      order by order_num;
    end loop;
  end if;

  return v_draft;
end
$$;

create or replace function public.discard_test_flow_draft(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  select id into v_draft_id
  from public.test_flow_versions
  where project_id = p_project_id and status = 'draft'
  limit 1;

  if v_draft_id is null then
    return false;
  end if;

  delete from public.station_contents where flow_version_id = v_draft_id;
  delete from public.test_flow_items where flow_version_id = v_draft_id;
  delete from public.test_flow_stations where flow_version_id = v_draft_id;
  delete from public.test_flow_versions where id = v_draft_id;
  return true;
end
$$;

create or replace function public.publish_test_flow_version(
  p_project_id uuid,
  p_version_id uuid
)
returns public.test_flow_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.test_flow_versions;
begin
  select * into v_version
  from public.test_flow_versions
  where id = p_version_id
    and project_id = p_project_id
    and status = 'draft'
  for update;

  if v_version.id is null then
    raise exception 'Draft flow version not found';
  end if;

  if not exists (
    select 1 from public.test_flow_stations where flow_version_id = p_version_id
  ) then
    raise exception 'A flow must contain at least one station before publishing';
  end if;

  update public.test_flow_versions
  set status = 'retired',
      updated_at = now()
  where project_id = p_project_id
    and status = 'published'
    and id <> p_version_id;

  update public.test_flow_versions
  set status = 'published',
      label = 'v' || version_number,
      published_at = now(),
      updated_at = now()
  where id = p_version_id
  returning * into v_version;

  update public.test_projects
  set active_flow_version_id = p_version_id,
      updated_at = now()
  where id = p_project_id;

  -- Systems with no progress can safely move to the newly published flow.
  update public.test_systems as systems
  set flow_version_id = p_version_id,
      updated_at = now()
  where systems.project_id = p_project_id
    and coalesce(systems.overall_progress, 0) = 0
    and coalesce(systems.status, 'Not Start') not in ('Done', '已完成', 'On-going', '進行中')
    and not exists (
      select 1 from public.test_progress where system_id = systems.id
    );

  return v_version;
end
$$;

create or replace function public.get_test_project_summaries()
returns table (
  project_id uuid,
  machine_count bigint,
  active_machine_count bigint,
  open_issue_count bigint,
  flow_version_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    projects.id,
    count(distinct systems.id) as machine_count,
    count(distinct systems.id) filter (
      where coalesce(systems.status, 'Not Start') not in ('Done', '已完成')
    ) as active_machine_count,
    count(distinct issues.id) filter (
      where coalesce(issues.status, 'open') not in ('resolved', 'closed')
    ) as open_issue_count,
    versions.label as flow_version_label
  from public.test_projects as projects
  left join public.test_systems as systems on systems.project_id = projects.id
  left join public.issues as issues on issues.project_id = projects.id
  left join public.test_flow_versions as versions
    on versions.id = projects.active_flow_version_id
  group by projects.id, versions.label;
$$;

create or replace function public.create_test_project(
  p_name text,
  p_description text default null,
  p_clone_from_project_id uuid default null
)
returns public.test_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.test_projects;
  v_source_version_id uuid;
  v_version_id uuid;
  v_station record;
  v_new_station_id uuid;
begin
  if nullif(trim(p_name), '') is null then
    raise exception 'Project name is required';
  end if;

  insert into public.test_projects (name, description, status)
  values (trim(p_name), nullif(trim(p_description), ''), 'planning')
  returning * into v_project;

  insert into public.test_flow_versions (
    project_id,
    version_number,
    status,
    label,
    notes,
    published_at
  )
  values (
    v_project.id,
    1,
    'published',
    'v1',
    case when p_clone_from_project_id is null then 'Blank project flow.' else 'Cloned project flow.' end,
    now()
  )
  returning id into v_version_id;

  update public.test_projects
  set active_flow_version_id = v_version_id
  where id = v_project.id;

  if p_clone_from_project_id is not null then
    select active_flow_version_id into v_source_version_id
    from public.test_projects
    where id = p_clone_from_project_id;

    if v_source_version_id is null then
      raise exception 'Clone source project has no published flow';
    end if;

    for v_station in
      select * from public.test_flow_stations
      where flow_version_id = v_source_version_id
      order by station_order
    loop
      insert into public.test_flow_stations (
        project_id,
        flow_version_id,
        station_name,
        station_order,
        description,
        estimated_hours
      )
      values (
        v_project.id,
        v_version_id,
        v_station.station_name,
        v_station.station_order,
        v_station.description,
        v_station.estimated_hours
      )
      returning id into v_new_station_id;

      insert into public.test_flow_items (
        project_id,
        flow_version_id,
        station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      )
      select
        v_project.id,
        v_version_id,
        v_new_station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      from public.test_flow_items
      where station_id = v_station.id;

      insert into public.station_contents (
        project_id,
        flow_version_id,
        station_id,
        title,
        content,
        order_num
      )
      select
        v_project.id,
        v_version_id,
        v_new_station_id,
        title,
        content,
        order_num
      from public.station_contents
      where station_id = v_station.id;
    end loop;

    insert into public.test_project_tool_assignments (
      project_id, tool_id, is_required, pinned_version, notes
    )
    select v_project.id, tool_id, is_required, pinned_version, notes
    from public.test_project_tool_assignments
    where project_id = p_clone_from_project_id
    on conflict (project_id, tool_id) do nothing;

    insert into public.test_project_code_assignments (
      project_id, code_snippet_id, notes
    )
    select v_project.id, code_snippet_id, notes
    from public.test_project_code_assignments
    where project_id = p_clone_from_project_id
    on conflict (project_id, code_snippet_id) do nothing;

    insert into public.test_project_command_assignments (
      project_id, command_id, notes
    )
    select v_project.id, command_id, notes
    from public.test_project_command_assignments
    where project_id = p_clone_from_project_id
    on conflict (project_id, command_id) do nothing;
  end if;

  select * into v_project from public.test_projects where id = v_project.id;
  return v_project;
end
$$;

grant select, insert, update, delete on public.test_flow_versions to anon, authenticated, service_role;
grant select, insert, update, delete on public.test_project_tool_assignments to anon, authenticated, service_role;
grant select, insert, update, delete on public.test_project_code_assignments to anon, authenticated, service_role;
grant select, insert, update, delete on public.test_project_command_assignments to anon, authenticated, service_role;
grant execute on function public.create_test_project(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.create_test_flow_draft(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.discard_test_flow_draft(uuid) to anon, authenticated, service_role;
grant execute on function public.publish_test_flow_version(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_test_project_summaries() to anon, authenticated, service_role;
