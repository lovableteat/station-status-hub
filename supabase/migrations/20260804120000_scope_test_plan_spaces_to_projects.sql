-- Test Plan spaces must belong to a maintenance project. The original schema
-- only recorded the creator, so changing projects could show the same spaces.

alter table public.test_plan_spaces
  add column if not exists project_id uuid;

do $$
declare
  legacy_project_id uuid;
begin
  if exists (
    select 1
    from public.test_plan_spaces
    where project_id is null
  ) then
    select id
    into legacy_project_id
    from public.test_projects
    where name = '未分類 Test_Plan 資料'
    order by created_at asc
    limit 1;

    if legacy_project_id is null then
      select (public.create_test_project(
        '未分類 Test_Plan 資料',
        '舊版 Test_Plan 空間自動保留。請在實際專案中建立新的資料空間。',
        null
      )).id
      into legacy_project_id;
    end if;

    update public.test_plan_spaces
    set project_id = legacy_project_id
    where project_id is null;
  end if;
end
$$;

alter table public.test_plan_spaces
  alter column project_id set not null;

alter table public.test_plan_spaces
  drop constraint if exists test_plan_spaces_project_id_fkey;

alter table public.test_plan_spaces
  add constraint test_plan_spaces_project_id_fkey
  foreign key (project_id)
  references public.test_projects (id)
  on delete restrict;

drop index if exists public.test_plan_spaces_owner_name_uidx;
create unique index if not exists test_plan_spaces_project_name_uidx
  on public.test_plan_spaces (project_id, lower(btrim(name)));

drop index if exists public.test_plan_spaces_owner_updated_idx;
create index if not exists test_plan_spaces_project_updated_idx
  on public.test_plan_spaces (project_id, updated_at desc);

create or replace function public.test_plan_current_user_can_access_project(
  target_project_id uuid,
  action text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.test_plan_current_user_can(action)
    and exists (
      select 1
      from public.test_projects as projects
      where projects.id = target_project_id
        and not coalesce(projects.is_archived, false)
    )
$$;

create or replace function public.test_plan_current_user_can_access_space(
  target_space_id uuid,
  action text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.test_plan_current_user_can_access_project(
    spaces.project_id,
    action
  )
  from public.test_plan_spaces as spaces
  where spaces.id = target_space_id
$$;

create or replace function public.test_plan_current_user_can_read_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1
    from public.test_plan_files as files
    where files.storage_path = object_name
      and public.test_plan_current_user_can_access_space(files.space_id, 'view')
  )
$$;

create or replace function public.test_plan_current_user_can_manage_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select public.test_plan_current_user_can('edit')
    and (
      (storage.foldername(object_name))[1]
        = public.test_plan_current_system_user_id()::text
      or exists (
        select 1
        from public.test_plan_files as files
        where files.storage_path = object_name
          and public.test_plan_current_user_can_access_space(files.space_id, 'edit')
      )
      or exists (
        select 1
        from public.test_plan_storage_cleanup_queue as cleanup
        where cleanup.storage_path = object_name
      )
    )
$$;

revoke all on function public.test_plan_current_user_can_access_project(uuid, text)
  from public;
revoke all on function public.test_plan_current_user_can_access_space(uuid, text)
  from public;
revoke all on function public.test_plan_current_user_can_read_storage_object(text)
  from public;
revoke all on function public.test_plan_current_user_can_manage_storage_object(text)
  from public;
grant execute on function public.test_plan_current_user_can_access_project(uuid, text)
  to authenticated;
grant execute on function public.test_plan_current_user_can_access_space(uuid, text)
  to authenticated;
grant execute on function public.test_plan_current_user_can_read_storage_object(text)
  to authenticated;
grant execute on function public.test_plan_current_user_can_manage_storage_object(text)
  to authenticated;

drop policy if exists "test-plan-spaces-shared-read" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-insert" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-update" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-delete" on public.test_plan_spaces;

create policy "test-plan-spaces-project-read"
on public.test_plan_spaces for select
to authenticated
using (public.test_plan_current_user_can_access_project(project_id, 'view'));

create policy "test-plan-spaces-project-insert"
on public.test_plan_spaces for insert
to authenticated
with check (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can_access_project(project_id, 'edit')
);

create policy "test-plan-spaces-project-update"
on public.test_plan_spaces for update
to authenticated
using (public.test_plan_current_user_can_access_project(project_id, 'edit'))
with check (public.test_plan_current_user_can_access_project(project_id, 'edit'));

create policy "test-plan-spaces-project-delete"
on public.test_plan_spaces for delete
to authenticated
using (public.test_plan_current_user_can_access_project(project_id, 'edit'));

-- Browser clients may edit a space but cannot move it to another project.
revoke update on public.test_plan_spaces from authenticated;
grant update (name, description, color, updated_at)
  on public.test_plan_spaces to authenticated;
