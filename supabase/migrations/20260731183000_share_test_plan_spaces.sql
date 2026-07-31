-- Test Plan spaces are shared collaboration areas. The creator remains recorded
-- for audit purposes, while access follows the Test Plan view/edit permission.

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
  select public.test_plan_current_user_can(action)
    and exists (
      select 1
      from public.test_plan_spaces as spaces
      where spaces.id = target_space_id
    )
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
  select public.test_plan_current_user_can('view')
    and exists (
      select 1
      from public.test_plan_files as files
      where files.storage_path = object_name
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
      )
      or exists (
        select 1
        from public.test_plan_storage_cleanup_queue as cleanup
        where cleanup.storage_path = object_name
      )
    )
$$;

revoke all on function public.test_plan_current_user_can_access_space(uuid, text)
  from public;
revoke all on function public.test_plan_current_user_can_read_storage_object(text)
  from public;
revoke all on function public.test_plan_current_user_can_manage_storage_object(text)
  from public;
grant execute on function public.test_plan_current_user_can_access_space(uuid, text)
  to authenticated;
grant execute on function public.test_plan_current_user_can_read_storage_object(text)
  to authenticated;
grant execute on function public.test_plan_current_user_can_manage_storage_object(text)
  to authenticated;

drop policy if exists "test-plan-spaces-owner-read" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-owner-insert" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-owner-update" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-owner-delete" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-read" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-insert" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-update" on public.test_plan_spaces;
drop policy if exists "test-plan-spaces-shared-delete" on public.test_plan_spaces;

create policy "test-plan-spaces-shared-read"
on public.test_plan_spaces for select
to authenticated
using (public.test_plan_current_user_can('view'));

create policy "test-plan-spaces-shared-insert"
on public.test_plan_spaces for insert
to authenticated
with check (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

create policy "test-plan-spaces-shared-update"
on public.test_plan_spaces for update
to authenticated
using (public.test_plan_current_user_can('edit'))
with check (public.test_plan_current_user_can('edit'));

create policy "test-plan-spaces-shared-delete"
on public.test_plan_spaces for delete
to authenticated
using (public.test_plan_current_user_can('edit'));

drop policy if exists "test-plan-folders-owner-read" on public.test_plan_folders;
drop policy if exists "test-plan-folders-owner-insert" on public.test_plan_folders;
drop policy if exists "test-plan-folders-owner-update" on public.test_plan_folders;
drop policy if exists "test-plan-folders-owner-delete" on public.test_plan_folders;
drop policy if exists "test-plan-folders-shared-read" on public.test_plan_folders;
drop policy if exists "test-plan-folders-shared-insert" on public.test_plan_folders;
drop policy if exists "test-plan-folders-shared-update" on public.test_plan_folders;
drop policy if exists "test-plan-folders-shared-delete" on public.test_plan_folders;

create policy "test-plan-folders-shared-read"
on public.test_plan_folders for select
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'view'));

create policy "test-plan-folders-shared-insert"
on public.test_plan_folders for insert
to authenticated
with check (
  created_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can_access_space(space_id, 'edit')
);

create policy "test-plan-folders-shared-update"
on public.test_plan_folders for update
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'edit'))
with check (public.test_plan_current_user_can_access_space(space_id, 'edit'));

create policy "test-plan-folders-shared-delete"
on public.test_plan_folders for delete
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'edit'));

drop policy if exists "test-plan-files-owner-read" on public.test_plan_files;
drop policy if exists "test-plan-files-owner-insert" on public.test_plan_files;
drop policy if exists "test-plan-files-owner-update" on public.test_plan_files;
drop policy if exists "test-plan-files-owner-delete" on public.test_plan_files;
drop policy if exists "test-plan-files-shared-read" on public.test_plan_files;
drop policy if exists "test-plan-files-shared-insert" on public.test_plan_files;
drop policy if exists "test-plan-files-shared-update" on public.test_plan_files;
drop policy if exists "test-plan-files-shared-delete" on public.test_plan_files;

create policy "test-plan-files-shared-read"
on public.test_plan_files for select
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'view'));

create policy "test-plan-files-shared-insert"
on public.test_plan_files for insert
to authenticated
with check (
  uploaded_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can_access_space(space_id, 'edit')
);

create policy "test-plan-files-shared-update"
on public.test_plan_files for update
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'edit'))
with check (public.test_plan_current_user_can_access_space(space_id, 'edit'));

create policy "test-plan-files-shared-delete"
on public.test_plan_files for delete
to authenticated
using (public.test_plan_current_user_can_access_space(space_id, 'edit'));

-- Audit and ownership columns cannot be reassigned by browser clients.
revoke update on public.test_plan_spaces from authenticated;
grant update (name, description, color, updated_at)
  on public.test_plan_spaces to authenticated;
revoke update on public.test_plan_folders from authenticated;
grant update (parent_id, name, updated_at)
  on public.test_plan_folders to authenticated;
revoke update on public.test_plan_files from authenticated;
grant update (
  folder_id,
  original_name,
  mime_type,
  extension,
  category,
  description,
  updated_at
) on public.test_plan_files to authenticated;

drop policy if exists "test-plan-storage-cleanup-owner-read"
  on public.test_plan_storage_cleanup_queue;
drop policy if exists "test-plan-storage-cleanup-owner-delete"
  on public.test_plan_storage_cleanup_queue;
drop policy if exists "test-plan-storage-cleanup-shared-read"
  on public.test_plan_storage_cleanup_queue;
drop policy if exists "test-plan-storage-cleanup-shared-delete"
  on public.test_plan_storage_cleanup_queue;

create policy "test-plan-storage-cleanup-shared-read"
on public.test_plan_storage_cleanup_queue for select
to authenticated
using (public.test_plan_current_user_can('edit'));

create policy "test-plan-storage-cleanup-shared-delete"
on public.test_plan_storage_cleanup_queue for delete
to authenticated
using (public.test_plan_current_user_can('edit'));

drop policy if exists "test-plan-files-owner-read" on storage.objects;
drop policy if exists "test-plan-files-owner-write" on storage.objects;
drop policy if exists "test-plan-files-owner-update" on storage.objects;
drop policy if exists "test-plan-files-owner-delete" on storage.objects;
drop policy if exists "test-plan-files-shared-read" on storage.objects;
drop policy if exists "test-plan-files-shared-write" on storage.objects;
drop policy if exists "test-plan-files-shared-update" on storage.objects;
drop policy if exists "test-plan-files-shared-delete" on storage.objects;

create policy "test-plan-files-shared-read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'test-plan-files'
  and public.test_plan_current_user_can_read_storage_object(name)
);

create policy "test-plan-files-shared-write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('edit')
);

create policy "test-plan-files-shared-update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'test-plan-files'
  and public.test_plan_current_user_can_manage_storage_object(name)
)
with check (
  bucket_id = 'test-plan-files'
  and public.test_plan_current_user_can_manage_storage_object(name)
);

create policy "test-plan-files-shared-delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'test-plan-files'
  and public.test_plan_current_user_can_manage_storage_object(name)
);
