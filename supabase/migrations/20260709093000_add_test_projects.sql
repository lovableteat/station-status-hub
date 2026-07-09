create table if not exists public.test_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists idx_test_projects_name
  on public.test_projects(name);

alter table public.test_projects enable row level security;

drop policy if exists "Allow anonymous access to test_projects" on public.test_projects;
create policy "Allow anonymous access to test_projects"
on public.test_projects
for all
using (true)
with check (true);

drop trigger if exists update_test_projects_updated_at on public.test_projects;
create trigger update_test_projects_updated_at
before update on public.test_projects
for each row
execute function public.update_updated_at_column();

alter table public.test_systems
  add column if not exists project_id uuid;

alter table public.test_flow_stations
  add column if not exists project_id uuid;

alter table public.test_flow_items
  add column if not exists project_id uuid;

alter table public.station_contents
  add column if not exists project_id uuid;

alter table public.issues
  add column if not exists project_id uuid;

alter table public.test_progress
  add column if not exists project_id uuid;

alter table public.station_time_records
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_systems_project_id_fkey'
  ) then
    alter table public.test_systems
      add constraint test_systems_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_flow_stations_project_id_fkey'
  ) then
    alter table public.test_flow_stations
      add constraint test_flow_stations_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_flow_items_project_id_fkey'
  ) then
    alter table public.test_flow_items
      add constraint test_flow_items_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'station_contents_project_id_fkey'
  ) then
    alter table public.station_contents
      add constraint station_contents_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'issues_project_id_fkey'
  ) then
    alter table public.issues
      add constraint issues_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_progress_project_id_fkey'
  ) then
    alter table public.test_progress
      add constraint test_progress_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'station_time_records_project_id_fkey'
  ) then
    alter table public.station_time_records
      add constraint station_time_records_project_id_fkey
      foreign key (project_id) references public.test_projects(id) on delete restrict;
  end if;
end
$$;

do $$
declare
  legacy_project_id uuid;
begin
  select id
  into legacy_project_id
  from public.test_projects
  where name = 'Legacy Imported Project'
  limit 1;

  if legacy_project_id is null then
    insert into public.test_projects (name, description)
    values (
      'Legacy Imported Project',
      'Auto-created during project-scope migration to preserve pre-existing machine maintenance records.'
    )
    returning id into legacy_project_id;
  end if;

  update public.test_systems
  set project_id = legacy_project_id
  where project_id is null;

  update public.test_flow_stations
  set project_id = legacy_project_id
  where project_id is null;

  update public.test_flow_items as items
  set project_id = coalesce(items.project_id, stations.project_id, legacy_project_id)
  from public.test_flow_stations as stations
  where items.station_id = stations.id
    and items.project_id is null;

  update public.station_contents as contents
  set project_id = coalesce(contents.project_id, stations.project_id, legacy_project_id)
  from public.test_flow_stations as stations
  where contents.station_id = stations.id
    and contents.project_id is null;

  update public.issues as issue_rows
  set project_id = systems.project_id
  from public.test_systems as systems
  where issue_rows.project_id is null
    and issue_rows.system_id = systems.id;

  update public.issues as issue_rows
  set project_id = stations.project_id
  from public.test_flow_stations as stations
  where issue_rows.project_id is null
    and issue_rows.station_id = stations.id;

  update public.issues
  set project_id = legacy_project_id
  where project_id is null;

  update public.test_progress as progress_rows
  set project_id = systems.project_id
  from public.test_systems as systems
  where progress_rows.project_id is null
    and progress_rows.system_id = systems.id;

  update public.station_time_records as time_rows
  set project_id = systems.project_id
  from public.test_systems as systems
  where time_rows.project_id is null
    and time_rows.system_id = systems.id;

  update public.test_progress
  set project_id = legacy_project_id
  where project_id is null;

update public.station_time_records
  set project_id = legacy_project_id
  where project_id is null;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.test_flow_stations
    where station_order is not null
    group by station_order
    having count(*) > 1
  ) then
    with normalized_stations as (
      select
        id,
        row_number() over (
          order by station_order nulls last, created_at nulls last, id
        ) - 1 as new_station_order
      from public.test_flow_stations
    )
    update public.test_flow_stations as stations
    set station_order = normalized_stations.new_station_order
    from normalized_stations
    where stations.id = normalized_stations.id
      and stations.station_order is distinct from normalized_stations.new_station_order;
  end if;

  if exists (
    select 1
    from public.test_flow_items
    where item_order is not null
    group by station_id, item_order
    having count(*) > 1
  ) then
    with affected_stations as (
      select station_id
      from public.test_flow_items
      where item_order is not null
      group by station_id, item_order
      having count(*) > 1
    ), normalized_items as (
      select
        id,
        row_number() over (
          partition by station_id
          order by item_order nulls last, created_at nulls last, id
        ) - 1 as new_item_order
      from public.test_flow_items
      where station_id in (select station_id from affected_stations)
    )
    update public.test_flow_items as items
    set item_order = normalized_items.new_item_order
    from normalized_items
    where items.id = normalized_items.id
      and items.item_order is distinct from normalized_items.new_item_order;
  end if;

  if exists (
    select 1
    from public.station_contents
    where order_num is not null
    group by station_id, order_num
    having count(*) > 1
  ) then
    with affected_stations as (
      select station_id
      from public.station_contents
      where order_num is not null
      group by station_id, order_num
      having count(*) > 1
    ), normalized_contents as (
      select
        id,
        row_number() over (
          partition by station_id
          order by order_num nulls last, created_at nulls last, id
        ) - 1 as new_order_num
      from public.station_contents
      where station_id in (select station_id from affected_stations)
    )
    update public.station_contents as contents
    set order_num = normalized_contents.new_order_num
    from normalized_contents
    where contents.id = normalized_contents.id
      and contents.order_num is distinct from normalized_contents.new_order_num;
  end if;
end
$$;

alter table public.test_systems
  alter column project_id set not null;

alter table public.test_flow_stations
  alter column project_id set not null;

alter table public.test_flow_items
  alter column project_id set not null;

alter table public.station_contents
  alter column project_id set not null;

alter table public.issues
  alter column project_id set not null;

alter table public.test_progress
  alter column project_id set not null;

alter table public.station_time_records
  alter column project_id set not null;

create index if not exists idx_test_systems_project_id
  on public.test_systems(project_id);

create index if not exists idx_test_flow_stations_project_id
  on public.test_flow_stations(project_id);

create index if not exists idx_test_flow_items_project_id
  on public.test_flow_items(project_id);

create index if not exists idx_station_contents_project_id
  on public.station_contents(project_id);

create index if not exists idx_issues_project_id
  on public.issues(project_id);

create index if not exists idx_test_progress_project_id
  on public.test_progress(project_id);

create index if not exists idx_station_time_records_project_id
  on public.station_time_records(project_id);

create unique index if not exists idx_test_flow_stations_project_order
  on public.test_flow_stations(project_id, station_order);

create unique index if not exists idx_test_flow_items_project_station_order
  on public.test_flow_items(project_id, station_id, item_order);

create unique index if not exists idx_station_contents_project_station_order
  on public.station_contents(project_id, station_id, order_num);

create or replace function public.sync_test_progress_project_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.system_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.project_id is null then
    select project_id
    into new.project_id
    from public.test_systems
    where id = new.system_id;
  elsif new.system_id is distinct from old.system_id then
    select project_id
    into new.project_id
    from public.test_systems
    where id = new.system_id;
  end if;

  if new.project_id is null then
    raise exception 'Unable to resolve project for test_progress system_id %', new.system_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_test_progress_project_id on public.test_progress;
create trigger set_test_progress_project_id
before insert or update of system_id, project_id on public.test_progress
for each row
execute function public.sync_test_progress_project_id();

create or replace function public.sync_station_time_record_project_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.system_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.project_id is null then
    select project_id
    into new.project_id
    from public.test_systems
    where id = new.system_id;
  elsif new.system_id is distinct from old.system_id then
    select project_id
    into new.project_id
    from public.test_systems
    where id = new.system_id;
  end if;

  if new.project_id is null then
    raise exception 'Unable to resolve project for station_time_records system_id %', new.system_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_station_time_record_project_id on public.station_time_records;
create trigger set_station_time_record_project_id
before insert or update of system_id, project_id on public.station_time_records
for each row
execute function public.sync_station_time_record_project_id();

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
  source_station record;
  v_new_station_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Project name is required';
  end if;

  insert into public.test_projects (name, description)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), '')
  )
  returning * into v_project;

  if p_clone_from_project_id is not null then
    if not exists (
      select 1
      from public.test_projects
      where id = p_clone_from_project_id
    ) then
      raise exception 'Source project not found';
    end if;

    for source_station in
      select id, station_name, station_order, description, estimated_hours
      from public.test_flow_stations
      where project_id = p_clone_from_project_id
      order by station_order, created_at, id
    loop
      insert into public.test_flow_stations (
        project_id,
        station_name,
        station_order,
        description,
        estimated_hours
      )
      values (
        v_project.id,
        source_station.station_name,
        source_station.station_order,
        source_station.description,
        source_station.estimated_hours
      )
      returning id into v_new_station_id;

      insert into public.test_flow_items (
        project_id,
        station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      )
      select
        v_project.id,
        v_new_station_id,
        item_name,
        item_order,
        description,
        estimated_minutes
      from public.test_flow_items
      where station_id = source_station.id
      order by item_order, created_at, id;

      insert into public.station_contents (
        project_id,
        station_id,
        title,
        content,
        order_num
      )
      select
        v_project.id,
        v_new_station_id,
        title,
        content,
        order_num
      from public.station_contents
      where station_id = source_station.id
      order by order_num, created_at, id;
    end loop;
  end if;

  return v_project;
end;
$$;

grant execute on function public.create_test_project(text, text, uuid) to anon;
grant execute on function public.create_test_project(text, text, uuid) to authenticated;
grant execute on function public.create_test_project(text, text, uuid) to service_role;
