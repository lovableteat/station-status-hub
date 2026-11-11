-- PREPARED ONLY. Apply only AFTER the signed-URL compatible UI is deployed
-- and tested with current sessions. Object paths/content are not modified.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '20s';

do $preflight$
begin
  if to_regprocedure('workspace.current_user_can_workspace(text,text)') is null then
    raise exception 'Security proposal prerequisite missing: workspace authorization helper';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('workspace.current_user_can_workspace(text,text)')
      and (pg_has_role('authenticated', p.proowner, 'usage') or exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) permission
        where permission.privilege_type = 'EXECUTE'
          and case when permission.grantee in (0, (select oid from pg_roles where rolname = 'anon')) then false
            else pg_has_role('authenticated', permission.grantee, 'usage') end
      ))
  ) then
    raise exception 'Security proposal prerequisite drift: Storage helper lacks authenticated EXECUTE';
  end if;
  if not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity) then
    raise exception 'Security proposal prerequisite drift: Storage objects RLS is disabled';
  end if;
  if (select count(*) from storage.buckets where id in ('issue-attachments', 'task-attachments')) <> 2 then
    raise exception 'Security proposal prerequisite missing: both reviewed attachment buckets';
  end if;
end;
$preflight$;

-- Keep legacy policies: a generic name may also authorize unrelated buckets.
-- The scoped restrictive guards below close both target buckets even when a
-- legacy permissive policy grants PUBLIC access. No other bucket is narrowed.

-- Sharing is workspace-wide, as before. Do not add owner-only rules that would
-- hide existing attachments or prevent coworkers from maintaining shared tools.
create policy station_attachments_read on storage.objects
for select to authenticated
using (bucket_id in ('issue-attachments', 'task-attachments')
  and (select workspace.current_user_can_workspace('station-status', 'view')));

create policy station_attachments_insert on storage.objects
for insert to authenticated
with check (bucket_id in ('issue-attachments', 'task-attachments')
  and (select workspace.current_user_can_workspace('station-status', 'edit')));

create policy station_attachments_update on storage.objects
for update to authenticated
using (bucket_id in ('issue-attachments', 'task-attachments')
  and (select workspace.current_user_can_workspace('station-status', 'edit')))
with check (bucket_id in ('issue-attachments', 'task-attachments')
  and (select workspace.current_user_can_workspace('station-status', 'edit')));

create policy station_attachments_delete on storage.objects
for delete to authenticated
using (bucket_id in ('issue-attachments', 'task-attachments')
  and (select workspace.current_user_can_workspace('station-status', 'edit')));

-- A restrictive guard prevents an unrelated broad permissive policy from
-- accidentally reopening these two buckets. All other buckets retain behavior.
create policy station_attachments_anon_guard on storage.objects
as restrictive for all to anon
using (bucket_id not in ('issue-attachments', 'task-attachments'))
with check (bucket_id not in ('issue-attachments', 'task-attachments'));
create policy station_attachments_read_guard on storage.objects
as restrictive for select to authenticated
using (bucket_id not in ('issue-attachments', 'task-attachments')
  or (auth.uid() is not null
    and (select workspace.current_user_can_workspace('station-status', 'view'))));
create policy station_attachments_insert_guard on storage.objects
as restrictive for insert to authenticated
with check (bucket_id not in ('issue-attachments', 'task-attachments')
  or (auth.uid() is not null
    and (select workspace.current_user_can_workspace('station-status', 'edit'))));
create policy station_attachments_update_guard on storage.objects
as restrictive for update to authenticated
using (bucket_id not in ('issue-attachments', 'task-attachments')
  or (auth.uid() is not null
    and (select workspace.current_user_can_workspace('station-status', 'edit'))))
with check (bucket_id not in ('issue-attachments', 'task-attachments')
  or (auth.uid() is not null
    and (select workspace.current_user_can_workspace('station-status', 'edit'))));
create policy station_attachments_delete_guard on storage.objects
as restrictive for delete to authenticated
using (bucket_id not in ('issue-attachments', 'task-attachments')
  or (auth.uid() is not null
    and (select workspace.current_user_can_workspace('station-status', 'edit'))));

update storage.buckets set public = false
where id in ('issue-attachments', 'task-attachments');

notify pgrst, 'reload schema';
commit;
