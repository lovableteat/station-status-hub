begin;
set local lock_timeout = '5s';

-- Keep the original uploader for audit/account cleanup and separately remember
-- the account whose authorized metadata deletion requested physical cleanup.
alter table workspace.test_plan_storage_cleanup_queue
  add column if not exists requested_by uuid;
create index if not exists test_plan_cleanup_requested_by_idx
  on workspace.test_plan_storage_cleanup_queue(requested_by)
  where requested_by is not null;

create schema if not exists file_library_private;
revoke all on schema file_library_private from public, anon, authenticated;

-- Trigger-only, never an RPC: the DELETE policy already authorizes OLD's space.
-- A service/account-cascade operation without an active actor records NULL.
create or replace function file_library_private.queue_file_cleanup()
returns trigger
language plpgsql security definer
set search_path = '' as $$
begin
  insert into workspace.test_plan_storage_cleanup_queue(
    storage_path, owner_id, requested_by, queued_at, last_error
  ) values (
    old.storage_path, old.uploaded_by, workspace.test_plan_current_system_user_id(), now(), null
  )
  on conflict (storage_path) do update
  set owner_id = excluded.owner_id,
      requested_by = excluded.requested_by,
      queued_at = excluded.queued_at,
      last_error = null;
  return old;
end;
$$;
revoke all on function file_library_private.queue_file_cleanup()
  from public, anon, authenticated;

drop trigger if exists test_plan_queue_file_cleanup_trigger
  on workspace.test_plan_files;
create trigger test_plan_queue_file_cleanup_trigger
before delete on workspace.test_plan_files
for each row execute function file_library_private.queue_file_cleanup();

create or replace function workspace.test_plan_current_user_can_manage_storage_object(object_name text)
returns boolean language sql stable security definer
set search_path = '' as $$
  select (select auth.uid()) is not null
    and workspace.test_plan_current_user_can('edit') and (
      exists (
        select 1 from workspace.test_plan_files files
        where files.storage_path = object_name
          and workspace.test_plan_current_user_can_access_space(files.space_id, 'edit')
      ) or (
        -- A cleanup request must never override a live file's space boundary.
        not exists (
          select 1 from workspace.test_plan_files files
          where files.storage_path = object_name
        ) and exists (
          select 1 from workspace.test_plan_storage_cleanup_queue queue
          where queue.storage_path = object_name and (
            queue.owner_id = workspace.test_plan_current_system_user_id()
            or queue.requested_by = workspace.test_plan_current_system_user_id()
            or exists (
              select 1 from workspace.system_users actor
              where actor.auth_user_id = (select auth.uid())
                and actor.status = 'active' and actor.role in ('admin', 'super_admin')
            )
          )
        )
      )
    )
$$;
revoke all on function workspace.test_plan_current_user_can_manage_storage_object(text)
  from public, anon;
grant execute on function workspace.test_plan_current_user_can_manage_storage_object(text)
  to authenticated;

-- Browser INSERT is only the upload/metadata-failure compensation path.
-- Retain the uploader/path checks and forbid forged requesters or live files.
alter policy "test-plan-storage-cleanup-owner-insert"
on workspace.test_plan_storage_cleanup_queue
with check (
  owner_id = workspace.test_plan_current_system_user_id()
  and (storage.foldername(storage_path))[1] = owner_id::text
  and workspace.test_plan_current_user_can('edit')
  and (requested_by is null or requested_by = workspace.test_plan_current_system_user_id())
  and not exists (
    select 1 from workspace.test_plan_files files
    where files.storage_path = test_plan_storage_cleanup_queue.storage_path
  )
);

-- Existing SELECT/DELETE policies delegate to the helper above, including
-- Storage SELECT after metadata deletion. No UPDATE policy/grant is added.
notify pgrst, 'reload schema';
commit;
