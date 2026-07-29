alter type public.page_permission
  add value if not exists 'test_plan_view';
alter type public.page_permission
  add value if not exists 'test_plan_edit';

create table if not exists public.test_plan_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.system_users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  color text not null default '#22d3ee'
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists test_plan_spaces_owner_name_uidx
  on public.test_plan_spaces (owner_id, lower(btrim(name)));
create index if not exists test_plan_spaces_owner_updated_idx
  on public.test_plan_spaces (owner_id, updated_at desc);

create table if not exists public.test_plan_folders (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.test_plan_spaces (id) on delete cascade,
  parent_id uuid references public.test_plan_folders (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references public.system_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create unique index if not exists test_plan_folders_location_name_uidx
  on public.test_plan_folders (
    space_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );
create index if not exists test_plan_folders_space_parent_idx
  on public.test_plan_folders (space_id, parent_id, lower(name));

create table if not exists public.test_plan_files (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.test_plan_spaces (id) on delete cascade,
  folder_id uuid references public.test_plan_folders (id) on delete cascade,
  original_name text not null check (char_length(btrim(original_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text,
  extension text not null check (char_length(extension) <= 32),
  category text not null check (
    category in (
      'presentation',
      'spreadsheet',
      'document',
      'image',
      '3d',
      'pcb',
      'archive',
      'other'
    )
  ),
  file_size bigint not null check (file_size between 0 and 524288000),
  description text check (description is null or char_length(description) <= 1000),
  uploaded_by uuid not null references public.system_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists test_plan_files_space_folder_idx
  on public.test_plan_files (space_id, folder_id, created_at desc);
create index if not exists test_plan_files_category_idx
  on public.test_plan_files (space_id, category);
create index if not exists test_plan_files_name_idx
  on public.test_plan_files (space_id, lower(original_name));

create table if not exists public.test_plan_account_cleanup_queue (
  owner_id uuid primary key,
  auth_user_id uuid,
  storage_paths text[] not null default array[]::text[],
  queued_at timestamptz not null default now(),
  last_error text
);

alter table public.test_plan_account_cleanup_queue enable row level security;
revoke all on public.test_plan_account_cleanup_queue from anon;
revoke all on public.test_plan_account_cleanup_queue from authenticated;

create table if not exists public.test_plan_storage_cleanup_queue (
  storage_path text primary key,
  owner_id uuid not null,
  queued_at timestamptz not null default now(),
  last_error text
);

alter table public.test_plan_storage_cleanup_queue enable row level security;

create or replace function public.test_plan_queue_file_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  file_owner_id uuid;
begin
  file_owner_id := old.uploaded_by;

  if file_owner_id is not null then
    insert into public.test_plan_storage_cleanup_queue (
      storage_path,
      owner_id,
      queued_at,
      last_error
    )
    values (old.storage_path, file_owner_id, now(), null)
    on conflict (storage_path) do update
    set owner_id = excluded.owner_id,
        queued_at = excluded.queued_at,
        last_error = null;
  end if;

  return old;
end;
$$;

drop trigger if exists test_plan_queue_file_cleanup_trigger
  on public.test_plan_files;
create trigger test_plan_queue_file_cleanup_trigger
before delete on public.test_plan_files
for each row execute function public.test_plan_queue_file_cleanup();

create or replace function public.test_plan_queue_account_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  queued_paths text[];
begin
  select coalesce(
    array_agg(files.storage_path order by files.storage_path),
    array[]::text[]
  )
  into queued_paths
  from public.test_plan_files as files
  join public.test_plan_spaces as spaces on spaces.id = files.space_id
  where spaces.owner_id = old.id;

  insert into public.test_plan_account_cleanup_queue (
    owner_id,
    auth_user_id,
    storage_paths,
    queued_at,
    last_error
  )
  values (
    old.id,
    old.auth_user_id,
    queued_paths,
    now(),
    null
  )
  on conflict (owner_id) do update
  set auth_user_id = excluded.auth_user_id,
      storage_paths = excluded.storage_paths,
      queued_at = excluded.queued_at,
      last_error = null;

  return old;
end;
$$;

drop trigger if exists test_plan_queue_account_cleanup_trigger
  on public.system_users;
create trigger test_plan_queue_account_cleanup_trigger
before delete on public.system_users
for each row execute function public.test_plan_queue_account_cleanup();

create or replace function public.test_plan_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists test_plan_spaces_set_updated_at on public.test_plan_spaces;
create trigger test_plan_spaces_set_updated_at
before update on public.test_plan_spaces
for each row execute function public.test_plan_set_updated_at();

drop trigger if exists test_plan_folders_set_updated_at on public.test_plan_folders;
create trigger test_plan_folders_set_updated_at
before update on public.test_plan_folders
for each row execute function public.test_plan_set_updated_at();

drop trigger if exists test_plan_files_set_updated_at on public.test_plan_files;
create trigger test_plan_files_set_updated_at
before update on public.test_plan_files
for each row execute function public.test_plan_set_updated_at();

create or replace function public.test_plan_validate_folder_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_parent uuid;
  parent_space uuid;
  visited uuid[] := array[]::uuid[];
begin
  if new.parent_id is null then
    return new;
  end if;

  select space_id into parent_space
  from public.test_plan_folders
  where id = new.parent_id;

  if parent_space is null or parent_space <> new.space_id then
    raise exception 'Test_Plan parent folder must belong to the same space';
  end if;

  current_parent := new.parent_id;
  while current_parent is not null loop
    if current_parent = new.id or current_parent = any(visited) then
      raise exception 'Test_Plan folder hierarchy cannot contain a cycle';
    end if;
    visited := array_append(visited, current_parent);
    select parent_id into current_parent
    from public.test_plan_folders
    where id = current_parent;
  end loop;

  return new;
end;
$$;

drop trigger if exists test_plan_validate_folder_parent_trigger
  on public.test_plan_folders;
create trigger test_plan_validate_folder_parent_trigger
before insert or update of parent_id, space_id
on public.test_plan_folders
for each row execute function public.test_plan_validate_folder_parent();

create or replace function public.test_plan_validate_file_folder()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_space uuid;
begin
  if new.folder_id is null then
    return new;
  end if;
  select space_id into folder_space
  from public.test_plan_folders
  where id = new.folder_id;
  if folder_space is null or folder_space <> new.space_id then
    raise exception 'Test_Plan file folder must belong to the same space';
  end if;
  return new;
end;
$$;

drop trigger if exists test_plan_validate_file_folder_trigger
  on public.test_plan_files;
create trigger test_plan_validate_file_folder_trigger
before insert or update of folder_id, space_id
on public.test_plan_files
for each row execute function public.test_plan_validate_file_folder();

alter table public.test_plan_spaces enable row level security;
alter table public.test_plan_folders enable row level security;
alter table public.test_plan_files enable row level security;

create or replace function public.test_plan_current_system_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select users.id
  from public.system_users as users
  where users.auth_user_id = (select auth.uid())
    and users.status = 'active'
  limit 1
$$;

create or replace function public.test_plan_current_user_can(action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.system_users as users
    where users.auth_user_id = (select auth.uid())
      and users.status = 'active'
      and (
        users.role in ('admin', 'super_admin')
        or (
          exists (
            select 1
            from public.user_page_permissions as permissions
            where permissions.user_id = users.id
              and (
                (
                  action = 'view'
                  and permissions.permission::text in (
                    'test_plan_view',
                    'test_plan_edit'
                  )
                )
                or (
                  action = 'edit'
                  and permissions.permission::text = 'test_plan_edit'
                )
              )
          )
          and (
            not (
              coalesce(
                users.permissions #> '{workspaceAccess}',
                '{}'::jsonb
              ) ? 'station-status'
            )
            or (
              action = 'view'
              and users.permissions
                #>> '{workspaceAccess,station-status}' in ('view', 'edit')
            )
            or (
              action = 'edit'
              and users.permissions
                #>> '{workspaceAccess,station-status}' = 'edit'
            )
          )
        )
      )
  )
$$;

create or replace function public.test_plan_current_user_owns_space(space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.test_plan_spaces as spaces
    where spaces.id = space_id
      and spaces.owner_id = public.test_plan_current_system_user_id()
  )
$$;

revoke all on function public.test_plan_current_system_user_id() from public;
revoke all on function public.test_plan_current_user_can(text) from public;
revoke all on function public.test_plan_current_user_owns_space(uuid) from public;
grant execute on function public.test_plan_current_system_user_id()
  to authenticated;
grant execute on function public.test_plan_current_user_can(text)
  to authenticated;
grant execute on function public.test_plan_current_user_owns_space(uuid)
  to authenticated;

grant select, insert, delete on public.test_plan_storage_cleanup_queue
  to authenticated;

create policy "test-plan-storage-cleanup-owner-read"
on public.test_plan_storage_cleanup_queue for select
to authenticated
using (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

create policy "test-plan-storage-cleanup-owner-insert"
on public.test_plan_storage_cleanup_queue for insert
to authenticated
with check (
  owner_id = public.test_plan_current_system_user_id()
  and (storage.foldername(storage_path))[1] = owner_id::text
  and public.test_plan_current_user_can('edit')
);

create policy "test-plan-storage-cleanup-owner-delete"
on public.test_plan_storage_cleanup_queue for delete
to authenticated
using (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-spaces-owner-read" on public.test_plan_spaces;
create policy "test-plan-spaces-owner-read"
on public.test_plan_spaces for select
to authenticated
using (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('view')
);

drop policy if exists "test-plan-spaces-owner-insert" on public.test_plan_spaces;
create policy "test-plan-spaces-owner-insert"
on public.test_plan_spaces for insert
to authenticated
with check (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-spaces-owner-update" on public.test_plan_spaces;
create policy "test-plan-spaces-owner-update"
on public.test_plan_spaces for update
to authenticated
using (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
)
with check (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-spaces-owner-delete" on public.test_plan_spaces;
create policy "test-plan-spaces-owner-delete"
on public.test_plan_spaces for delete
to authenticated
using (
  owner_id = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-folders-owner-read" on public.test_plan_folders;
create policy "test-plan-folders-owner-read"
on public.test_plan_folders for select
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('view')
);

drop policy if exists "test-plan-folders-owner-insert" on public.test_plan_folders;
create policy "test-plan-folders-owner-insert"
on public.test_plan_folders for insert
to authenticated
with check (
  created_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-folders-owner-update" on public.test_plan_folders;
create policy "test-plan-folders-owner-update"
on public.test_plan_folders for update
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
)
with check (
  created_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-folders-owner-delete" on public.test_plan_folders;
create policy "test-plan-folders-owner-delete"
on public.test_plan_folders for delete
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-files-owner-read" on public.test_plan_files;
create policy "test-plan-files-owner-read"
on public.test_plan_files for select
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('view')
);

drop policy if exists "test-plan-files-owner-insert" on public.test_plan_files;
create policy "test-plan-files-owner-insert"
on public.test_plan_files for insert
to authenticated
with check (
  uploaded_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-files-owner-update" on public.test_plan_files;
create policy "test-plan-files-owner-update"
on public.test_plan_files for update
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
)
with check (
  uploaded_by = public.test_plan_current_system_user_id()
  and public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-files-owner-delete" on public.test_plan_files;
create policy "test-plan-files-owner-delete"
on public.test_plan_files for delete
to authenticated
using (
  public.test_plan_current_user_owns_space(space_id)
  and public.test_plan_current_user_can('edit')
);

revoke all on public.test_plan_spaces from anon;
revoke all on public.test_plan_folders from anon;
revoke all on public.test_plan_files from anon;
grant select, insert, update, delete on public.test_plan_spaces
  to authenticated;
grant select, insert, update, delete on public.test_plan_folders
  to authenticated;
grant select, insert, update, delete on public.test_plan_files
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'test-plan-files',
  'test-plan-files',
  false,
  524288000,
  null
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "test-plan-files-owner-read" on storage.objects;
create policy "test-plan-files-owner-read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('view')
);

drop policy if exists "test-plan-files-owner-write" on storage.objects;
create policy "test-plan-files-owner-write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-files-owner-update" on storage.objects;
create policy "test-plan-files-owner-update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('edit')
)
with check (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('edit')
);

drop policy if exists "test-plan-files-owner-delete" on storage.objects;
create policy "test-plan-files-owner-delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'test-plan-files'
  and (storage.foldername(name))[1]
    = public.test_plan_current_system_user_id()::text
  and public.test_plan_current_user_can('edit')
);
