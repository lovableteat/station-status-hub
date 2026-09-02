-- Keep Test_Plan storage isolated by the maintenance project currently selected
-- in the application.  Spaces used to be shared globally, which made files
-- from different maintenance projects appear in the same list.

alter table if exists workspace.test_plan_spaces
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'test_plan_spaces_project_id_fkey'
      and conrelid = 'workspace.test_plan_spaces'::regclass
  ) then
    alter table workspace.test_plan_spaces
      add constraint test_plan_spaces_project_id_fkey
      foreign key (project_id)
      references workspace.test_projects(id)
      on delete cascade;
  end if;
end
$$;

-- Preserve existing spaces.  Prefer the project owned by the same system
-- account; anything that cannot be mapped safely is kept in one explicit
-- legacy project instead of being silently copied into every new project.
do $$
declare
  legacy_project_id uuid;
begin
  select id
    into legacy_project_id
  from workspace.test_projects
  where name = 'Legacy Imported Project'
  order by created_at
  limit 1;

  if legacy_project_id is null then
    insert into workspace.test_projects (name, description)
    values (
      'Legacy Imported Project',
      '資料儲存專案隔離前匯入的舊資料；請確認後再移轉至正確專案。'
    )
    returning id into legacy_project_id;
  end if;

  update workspace.test_plan_spaces as spaces
  set project_id = (
    select projects.id
    from workspace.test_projects as projects
    where projects.owner_user_id = spaces.owner_id
      and projects.status <> 'archived'
      and not projects.is_archived
    order by projects.updated_at desc, projects.created_at desc
    limit 1
  )
  where spaces.project_id is null;

  update workspace.test_plan_spaces
  set project_id = legacy_project_id
  where project_id is null;
end
$$;

alter table workspace.test_plan_spaces
  alter column project_id set not null;

drop index if exists workspace.test_plan_spaces_owner_name_uidx;
drop index if exists workspace.test_plan_spaces_owner_updated_idx;
create unique index if not exists test_plan_spaces_project_owner_name_uidx
  on workspace.test_plan_spaces (project_id, owner_id, lower(btrim(name)));
create index if not exists test_plan_spaces_project_updated_idx
  on workspace.test_plan_spaces (project_id, updated_at desc);

create or replace function workspace.test_plan_current_user_can_access_space(
  target_space_id uuid,
  action text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, pg_temp
as $$
  select workspace.test_plan_current_user_can(action)
    and exists (
      select 1
      from workspace.test_plan_spaces as spaces
      join workspace.test_projects as projects
        on projects.id = spaces.project_id
      where spaces.id = target_space_id
        and spaces.project_id is not null
        and projects.status <> 'archived'
        and not projects.is_archived
    )
$$;

create or replace function workspace.test_plan_current_user_can_read_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can('view')
    and exists (
      select 1
      from workspace.test_plan_files as files
      join workspace.test_plan_spaces as spaces
        on spaces.id = files.space_id
      join workspace.test_projects as projects
        on projects.id = spaces.project_id
      where files.storage_path = object_name
        and projects.status <> 'archived'
        and not projects.is_archived
    )
$$;

create or replace function workspace.test_plan_current_user_can_manage_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can('edit')
    and (
      exists (
        select 1
        from workspace.test_plan_files as files
        join workspace.test_plan_spaces as spaces
          on spaces.id = files.space_id
        join workspace.test_projects as projects
          on projects.id = spaces.project_id
        where files.storage_path = object_name
          and projects.status <> 'archived'
          and not projects.is_archived
      )
      or exists (
        select 1
        from workspace.test_plan_storage_cleanup_queue as cleanup
        where cleanup.storage_path = object_name
      )
    )
$$;

-- Keep legacy public callers safe after the application tables were moved to
-- the workspace schema.  Policies below use the workspace-qualified helpers.
create or replace function public.test_plan_current_user_can_access_space(
  target_space_id uuid,
  action text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, pg_temp
as $$
  select workspace.test_plan_current_user_can_access_space(target_space_id, action)
$$;

create or replace function public.test_plan_current_user_can_read_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can_read_storage_object(object_name)
$$;

create or replace function public.test_plan_current_user_can_manage_storage_object(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can_manage_storage_object(object_name)
$$;

drop policy if exists "test-plan-spaces-shared-read" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-insert" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-update" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-delete" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-project-read" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-project-insert" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-project-update" on workspace.test_plan_spaces;
drop policy if exists "test-plan-spaces-project-delete" on workspace.test_plan_spaces;

create policy "test-plan-spaces-project-read"
on workspace.test_plan_spaces for select
to authenticated
using (
  project_id is not null
  and workspace.test_plan_current_user_can('view')
);

create policy "test-plan-spaces-project-insert"
on workspace.test_plan_spaces for insert
to authenticated
with check (
  owner_id = workspace.test_plan_current_system_user_id()
  and project_id is not null
  and exists (
    select 1 from workspace.test_projects as projects
    where projects.id = project_id
      and projects.status <> 'archived'
      and not projects.is_archived
  )
  and workspace.test_plan_current_user_can('edit')
);

create policy "test-plan-spaces-project-update"
on workspace.test_plan_spaces for update
to authenticated
using (project_id is not null and workspace.test_plan_current_user_can('edit'))
with check (project_id is not null and workspace.test_plan_current_user_can('edit'));

create policy "test-plan-spaces-project-delete"
on workspace.test_plan_spaces for delete
to authenticated
using (project_id is not null and workspace.test_plan_current_user_can('edit'));

drop policy if exists "test-plan-folders-shared-read" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-shared-insert" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-shared-update" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-shared-delete" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-project-read" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-project-insert" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-project-update" on workspace.test_plan_folders;
drop policy if exists "test-plan-folders-project-delete" on workspace.test_plan_folders;

create policy "test-plan-folders-project-read"
on workspace.test_plan_folders for select
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'view'));
create policy "test-plan-folders-project-insert"
on workspace.test_plan_folders for insert
to authenticated
with check (
  created_by = workspace.test_plan_current_system_user_id()
  and workspace.test_plan_current_user_can_access_space(space_id, 'edit')
);
create policy "test-plan-folders-project-update"
on workspace.test_plan_folders for update
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'edit'))
with check (workspace.test_plan_current_user_can_access_space(space_id, 'edit'));
create policy "test-plan-folders-project-delete"
on workspace.test_plan_folders for delete
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'edit'));

drop policy if exists "test-plan-files-shared-read" on workspace.test_plan_files;
drop policy if exists "test-plan-files-shared-insert" on workspace.test_plan_files;
drop policy if exists "test-plan-files-shared-update" on workspace.test_plan_files;
drop policy if exists "test-plan-files-shared-delete" on workspace.test_plan_files;
drop policy if exists "test-plan-files-project-read" on workspace.test_plan_files;
drop policy if exists "test-plan-files-project-insert" on workspace.test_plan_files;
drop policy if exists "test-plan-files-project-update" on workspace.test_plan_files;
drop policy if exists "test-plan-files-project-delete" on workspace.test_plan_files;

create policy "test-plan-files-project-read"
on workspace.test_plan_files for select
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'view'));
create policy "test-plan-files-project-insert"
on workspace.test_plan_files for insert
to authenticated
with check (
  uploaded_by = workspace.test_plan_current_system_user_id()
  and workspace.test_plan_current_user_can_access_space(space_id, 'edit')
);
create policy "test-plan-files-project-update"
on workspace.test_plan_files for update
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'edit'))
with check (workspace.test_plan_current_user_can_access_space(space_id, 'edit'));
create policy "test-plan-files-project-delete"
on workspace.test_plan_files for delete
to authenticated
using (workspace.test_plan_current_user_can_access_space(space_id, 'edit'));

drop policy if exists "test-plan-files-shared-read" on storage.objects;
drop policy if exists "test-plan-files-shared-write" on storage.objects;
drop policy if exists "test-plan-files-shared-update" on storage.objects;
drop policy if exists "test-plan-files-shared-delete" on storage.objects;
drop policy if exists "test-plan-files-project-read" on storage.objects;
drop policy if exists "test-plan-files-project-write" on storage.objects;
drop policy if exists "test-plan-files-project-update" on storage.objects;
drop policy if exists "test-plan-files-project-delete" on storage.objects;

create policy "test-plan-files-project-read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'test-plan-files'
  and workspace.test_plan_current_user_can_read_storage_object(storage.objects.name)
);

create policy "test-plan-files-project-write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'test-plan-files'
  and (storage.foldername(storage.objects.name))[1]
    = workspace.test_plan_current_system_user_id()::text
  and (storage.foldername(storage.objects.name))[2] is not null
  and (storage.foldername(storage.objects.name))[3] is not null
  and exists (
    select 1
    from workspace.test_plan_spaces as spaces
    join workspace.test_projects as projects
      on projects.id = spaces.project_id
    where spaces.id::text = (storage.foldername(storage.objects.name))[3]
      and spaces.project_id::text = (storage.foldername(storage.objects.name))[2]
      and projects.status <> 'archived'
      and not projects.is_archived
  )
  and workspace.test_plan_current_user_can('edit')
);

create policy "test-plan-files-project-update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'test-plan-files'
  and workspace.test_plan_current_user_can_manage_storage_object(storage.objects.name)
)
with check (
  bucket_id = 'test-plan-files'
  and workspace.test_plan_current_user_can_manage_storage_object(storage.objects.name)
);

create policy "test-plan-files-project-delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'test-plan-files'
  and workspace.test_plan_current_user_can_manage_storage_object(storage.objects.name)
);

notify pgrst, 'reload schema';
