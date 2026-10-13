set local lock_timeout = '5s';

-- One fixed global file space per active account. This migration does not
-- delete existing content; the explicitly requested cleanup runs separately.
insert into workspace.test_plan_spaces(owner_id, project_id, name, description, color, is_personal)
select id, null, left(coalesce(nullif(btrim(display_name), ''), username), 160),
       '@' || username, '#5fae94', true
from workspace.system_users where status = 'active'
on conflict (owner_id) where is_personal do update
set name = excluded.name, description = excluded.description;

create schema if not exists file_library_private;
revoke all on schema file_library_private from public, anon, authenticated;

-- Trigger-only provisioning must bypass space INSERT RLS for the account being
-- approved. It cannot be called as an RPC, accepts no caller-supplied owner,
-- and only touches the account represented by NEW on the system_users trigger.
create or replace function file_library_private.sync_user_space()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  if new.status = 'active' then
    insert into workspace.test_plan_spaces(owner_id, project_id, name, description, color, is_personal)
    values (new.id, null, left(coalesce(nullif(btrim(new.display_name), ''), new.username), 160),
            '@' || new.username, '#5fae94', true)
    on conflict (owner_id) where is_personal do update
    set name = excluded.name, description = excluded.description;
  end if;
  return new;
end;
$$;
revoke all on function file_library_private.sync_user_space() from public, anon, authenticated;
create trigger test_plan_sync_user_space
after insert or update of display_name, username, status on workspace.system_users
for each row execute function file_library_private.sync_user_space();

-- Preserve the established authenticated workspace permission boundary.
-- Everyone with view permission can browse user spaces; only their owner or
-- an administrator with edit permission can change personal-space content.
create or replace function workspace.test_plan_current_user_can_access_space(target_space_id uuid, action text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select (select auth.uid()) is not null
    and workspace.test_plan_current_user_can(action)
    and exists (
      select 1 from workspace.test_plan_spaces spaces
      where spaces.id = target_space_id and (
        not spaces.is_personal or action = 'view'
        or spaces.owner_id = workspace.test_plan_current_system_user_id()
        or exists (
          select 1 from workspace.system_users actor
          where actor.auth_user_id = (select auth.uid())
            and actor.status = 'active' and actor.role in ('admin', 'super_admin')
        )
      )
    )
$$;
revoke all on function workspace.test_plan_current_user_can_access_space(uuid, text) from public, anon;
grant execute on function workspace.test_plan_current_user_can_access_space(uuid, text) to authenticated;

alter policy "test-plan-spaces-project-read" on workspace.test_plan_spaces
using (workspace.test_plan_current_user_can('view'));
alter policy "test-plan-spaces-project-insert" on workspace.test_plan_spaces
with check (not is_personal and owner_id = workspace.test_plan_current_system_user_id()
  and workspace.test_plan_current_user_can('edit') and (
    project_id is null or exists (
      select 1 from workspace.test_projects projects where projects.id = test_plan_spaces.project_id
        and projects.status <> 'archived' and not projects.is_archived
    )
  ));
alter policy "test-plan-spaces-project-update" on workspace.test_plan_spaces
using (not is_personal and workspace.test_plan_current_user_can('edit'))
with check (not is_personal and workspace.test_plan_current_user_can('edit'));
alter policy "test-plan-spaces-project-delete" on workspace.test_plan_spaces
using (not is_personal and workspace.test_plan_current_user_can('edit'));

alter policy "test-plan-files-project-write" on storage.objects
with check (bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1] = workspace.test_plan_current_system_user_id()::text
  and exists (
    select 1 from workspace.test_plan_spaces spaces
    where spaces.id::text = (storage.foldername(objects.name))[3]
      and coalesce(spaces.project_id::text, 'global') = (storage.foldername(objects.name))[2]
      and workspace.test_plan_current_user_can_access_space(spaces.id, 'edit')
  ));

create or replace function workspace.test_plan_current_user_can_manage_storage_object(object_name text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select (select auth.uid()) is not null and workspace.test_plan_current_user_can('edit') and (
    exists (
      select 1 from workspace.test_plan_files files
      where files.storage_path = object_name
        and workspace.test_plan_current_user_can_access_space(files.space_id, 'edit')
    ) or exists (
      select 1 from workspace.test_plan_storage_cleanup_queue queue
      where queue.storage_path = object_name and (
        queue.owner_id = workspace.test_plan_current_system_user_id()
        or exists (
          select 1 from workspace.system_users actor
          where actor.auth_user_id = (select auth.uid())
            and actor.status = 'active' and actor.role in ('admin', 'super_admin')
        )
      )
    )
  )
$$;
revoke all on function workspace.test_plan_current_user_can_manage_storage_object(text) from public, anon;
grant execute on function workspace.test_plan_current_user_can_manage_storage_object(text) to authenticated;

-- Cleanup is restricted to the caller or an administrator. Space-content
-- ownership checks above remain effective even when using the Storage API.
alter policy "test-plan-storage-cleanup-shared-read" on workspace.test_plan_storage_cleanup_queue
using (workspace.test_plan_current_user_can_manage_storage_object(storage_path));
alter policy "test-plan-storage-cleanup-shared-delete" on workspace.test_plan_storage_cleanup_queue
using (workspace.test_plan_current_user_can_manage_storage_object(storage_path));

notify pgrst, 'reload schema';
