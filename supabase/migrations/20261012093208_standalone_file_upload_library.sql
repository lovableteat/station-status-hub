-- Standalone file library. Existing spaces, folders, files and object names
-- are preserved. No data is copied, renamed or removed by this migration.
set local lock_timeout = '5s';

alter table workspace.test_plan_spaces alter column project_id drop not null;
alter table workspace.test_plan_spaces drop constraint test_plan_spaces_project_id_fkey;
alter table workspace.test_plan_spaces add constraint test_plan_spaces_project_id_fkey
  foreign key (project_id) references workspace.test_projects(id) on delete set null;
-- Names can already repeat across legacy projects. A non-unique index avoids
-- blocking project deletion when several preserved spaces become global.
create index if not exists test_plan_spaces_global_owner_name_idx
  on workspace.test_plan_spaces(owner_id, lower(btrim(name))) where project_id is null;
create index if not exists test_plan_spaces_updated_idx
  on workspace.test_plan_spaces(updated_at desc);

-- Keep the existing identity/permission helper; only remove dependence on
-- maintenance project state. These private helpers already use SECURITY DEFINER
-- to avoid recursive parent RLS checks and still enforce active-user permission.
create or replace function workspace.test_plan_current_user_can_access_space(target_space_id uuid, action text)
returns boolean language sql stable security definer set search_path = workspace, pg_temp
as $$
  select workspace.test_plan_current_user_can(action)
    and exists (select 1 from workspace.test_plan_spaces where id = target_space_id)
$$;

create or replace function workspace.test_plan_current_user_can_read_storage_object(object_name text)
returns boolean language sql stable security definer set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can('view')
    and exists (
      select 1 from workspace.test_plan_files files
      join workspace.test_plan_spaces spaces on spaces.id = files.space_id
      where files.storage_path = object_name
    )
$$;

create or replace function workspace.test_plan_current_user_can_manage_storage_object(object_name text)
returns boolean language sql stable security definer set search_path = workspace, storage, pg_temp
as $$
  select workspace.test_plan_current_user_can('edit') and (
    exists (
      select 1 from workspace.test_plan_files files
      join workspace.test_plan_spaces spaces on spaces.id = files.space_id
      where files.storage_path = object_name
    ) or exists (
      select 1 from workspace.test_plan_storage_cleanup_queue where storage_path = object_name
    )
  )
$$;

-- Existing project-space policies remain for compatibility with older clients.
create policy "test-plan-spaces-global-read" on workspace.test_plan_spaces
  for select to authenticated using (project_id is null and workspace.test_plan_current_user_can('view'));
create policy "test-plan-spaces-global-insert" on workspace.test_plan_spaces
  for insert to authenticated with check (
    project_id is null and owner_id = workspace.test_plan_current_system_user_id()
    and workspace.test_plan_current_user_can('edit')
  );
create policy "test-plan-spaces-global-update" on workspace.test_plan_spaces
  for update to authenticated using (project_id is null and workspace.test_plan_current_user_can('edit'))
  with check (project_id is null and workspace.test_plan_current_user_can('edit'));
create policy "test-plan-spaces-global-delete" on workspace.test_plan_spaces
  for delete to authenticated using (project_id is null and workspace.test_plan_current_user_can('edit'));

-- Existing metadata/object names keep their old project segment. New global
-- spaces use <account>/global/<space>/<object>, with the same private bucket.
drop policy "test-plan-files-project-write" on storage.objects;
create policy "test-plan-files-project-write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'test-plan-files'
    and (storage.foldername(storage.objects.name))[1] = workspace.test_plan_current_system_user_id()::text
    and exists (
      select 1 from workspace.test_plan_spaces spaces
      where spaces.id::text = (storage.foldername(storage.objects.name))[3]
        and coalesce(spaces.project_id::text, 'global') = (storage.foldername(storage.objects.name))[2]
    )
    and workspace.test_plan_current_user_can('edit')
  );

notify pgrst, 'reload schema';
