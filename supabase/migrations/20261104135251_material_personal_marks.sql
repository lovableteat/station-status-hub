begin;
set local lock_timeout = '5s';

create table workspace.material_personal_marks (
  owner_id uuid not null default workspace.current_system_user_id() references workspace.system_users(id) on delete cascade,
  workspace_id text not null references workspace.material_bom_workspaces(id) on delete cascade,
  group_key text not null check (char_length(group_key) between 1 and 64000),
  -- Location keys can contain thousands of references; keep them out of the btree key.
  group_hash text generated always as (md5(group_key)) stored,
  primary key (owner_id, workspace_id, group_hash)
);
alter table workspace.material_personal_marks enable row level security;
revoke all on workspace.material_personal_marks from public, anon, authenticated;
grant select, insert, delete on workspace.material_personal_marks to authenticated;
grant all on workspace.material_personal_marks to service_role;

create policy personal_marks_read on workspace.material_personal_marks for select to authenticated
  using (owner_id = (select workspace.current_system_user_id()) and (select rlc_priority_private.has_access(false)));
create policy personal_marks_insert on workspace.material_personal_marks for insert to authenticated
  with check (owner_id = (select workspace.current_system_user_id()) and (select rlc_priority_private.has_access(false)));
create policy personal_marks_delete on workspace.material_personal_marks for delete to authenticated
  using (owner_id = (select workspace.current_system_user_id()) and (select rlc_priority_private.has_access(false)));

notify pgrst, 'reload schema';
commit;
