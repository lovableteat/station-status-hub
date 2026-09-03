-- Application administrators manage the organization, but have no password
-- bypass. Password hashes, attempts and grants are inaccessible to clients.
create extension if not exists pgcrypto;
-- Keep performance passwords independent of the legacy site-login hash.
-- pgcrypto may be installed in public or extensions on a hosted project.
create or replace function workspace.performance_password_hash(p_password text, p_hash text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_schema text; v_result text;
begin
  select n.nspname into strict v_schema from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format('select %I.crypt($1, coalesce($2, %I.gen_salt(''bf'', 10)))', v_schema, v_schema)
    into v_result using p_password, p_hash;
  return v_result;
end;
$$;
revoke all on function workspace.performance_password_hash(text, text) from public, anon, authenticated;
create table if not exists workspace.performance_group_secrets (
  owner_id uuid primary key references workspace.system_users(id) on delete restrict,
  password_hash text not null,
  version timestamptz not null default clock_timestamp()
);
create table if not exists workspace.performance_group_unlocks (
  auth_user_id uuid not null,
  session_id text not null,
  owner_id uuid not null references workspace.performance_group_secrets(owner_id) on delete cascade,
  version timestamptz not null,
  expires_at timestamptz not null,
  primary key (auth_user_id, session_id, owner_id)
);
create table if not exists workspace.performance_group_attempts (
  auth_user_id uuid not null,
  owner_id uuid not null references workspace.performance_group_secrets(owner_id) on delete cascade,
  failures integer not null default 0,
  blocked_until timestamptz,
  primary key (auth_user_id, owner_id)
);
alter table workspace.performance_group_secrets enable row level security;
alter table workspace.performance_group_unlocks enable row level security;
alter table workspace.performance_group_attempts enable row level security;
revoke all on workspace.performance_group_secrets, workspace.performance_group_unlocks, workspace.performance_group_attempts from public, anon, authenticated;
grant all on workspace.performance_group_secrets, workspace.performance_group_unlocks, workspace.performance_group_attempts to service_role;

create or replace function workspace.performance_org_ancestors(p_employee_id uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with recursive ancestors(id) as (
    select manager_id from workspace.performance_org_members where employee_id = p_employee_id and manager_id is not null
    union
    select o.manager_id from workspace.performance_org_members o join ancestors a on o.employee_id = a.id where o.manager_id is not null
  ) select coalesce(array_agg(id), array[]::uuid[]) from ancestors;
$$;
revoke all on function workspace.performance_org_ancestors(uuid) from public, anon, authenticated;

alter table workspace.performance_reviews add column if not exists privacy_scope_ids uuid[] not null default array[]::uuid[];
-- Resolve historic names once, so subsequent name changes cannot claim a row.
update workspace.performance_reviews set employee_id = workspace.resolve_performance_employee(employee_id)::text
where workspace.resolve_performance_employee(employee_id) is not null
  and employee_id <> workspace.resolve_performance_employee(employee_id)::text;
create or replace function workspace.current_user_is_performance_employee(p_employee_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from workspace.system_users where id = workspace.current_system_user_id()
    and status = 'active' and id = workspace.resolve_performance_employee(p_employee_id));
$$;
-- Capture both the existing reviewer and the organization ancestry before any
-- future reassignment. The retained scopes prevent administrators reparenting
-- an employee or changing their level to bypass a group's existing password.
update workspace.performance_reviews r set privacy_scope_ids = (
  select coalesce(array_agg(distinct owner_id), array[]::uuid[]) from unnest(
    r.privacy_scope_ids || workspace.performance_org_ancestors(workspace.resolve_performance_employee(r.employee_id))
    || array[workspace.resolve_performance_employee(r.reviewer_name), workspace.resolve_performance_employee(r.employee_id)]
  ) owner_id where owner_id is not null
);

create or replace function workspace.performance_scopes_unlocked(p_scopes uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from workspace.performance_group_secrets secret
    where secret.owner_id = any(p_scopes)
      and not exists (select 1 from workspace.performance_group_unlocks grant_row
        where grant_row.owner_id = secret.owner_id and grant_row.version = secret.version
          and grant_row.auth_user_id = (select auth.uid())
          and grant_row.session_id = (select auth.jwt() ->> 'session_id')
          and grant_row.expires_at > now())
  );
$$;
revoke all on function workspace.performance_scopes_unlocked(uuid[]) from public, anon;
grant execute on function workspace.performance_scopes_unlocked(uuid[]) to authenticated;

create or replace function workspace.can_manage_performance_record(p_employee_id text, p_reviewer_name text, p_scopes uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype; v_employee uuid; v_ancestors uuid[];
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  if not found then return false; end if;
  v_employee := workspace.resolve_performance_employee(p_employee_id);
  v_ancestors := workspace.performance_org_ancestors(v_employee);
  -- This check deliberately precedes the administrator branch.
  if not workspace.performance_scopes_unlocked(coalesce(p_scopes, array[]::uuid[]) || v_ancestors || array[v_employee]) then return false; end if;
  if v_actor.role in ('admin', 'super_admin') then return true; end if;
  if not workspace.current_user_is_performance_manager() or not workspace.current_user_can_workspace('performance', 'edit') then return false; end if;
  if v_employee = v_actor.id then return false; end if;
  return v_actor.id = any(v_ancestors)
    or (not exists (select 1 from workspace.performance_org_members where employee_id = v_employee)
      and nullif(trim(p_reviewer_name), '') is not null
      and workspace.resolve_performance_employee(p_reviewer_name) = v_actor.id);
end;
$$;
revoke all on function workspace.can_manage_performance_record(text, text, uuid[]) from public, anon;
grant execute on function workspace.can_manage_performance_record(text, text, uuid[]) to authenticated;

-- No older permissive administrator policy may override the password gate.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'workspace' and tablename = 'performance_reviews' loop
    execute format('drop policy %I on workspace.performance_reviews', p.policyname);
  end loop;
end $$;
create policy performance_reviews_read on workspace.performance_reviews for select to authenticated using (
  (workspace.current_user_can_workspace('performance', 'view') and workspace.current_user_is_performance_employee(employee_id))
  or workspace.can_manage_performance_record(employee_id, reviewer_name, privacy_scope_ids)
);
create policy performance_reviews_insert on workspace.performance_reviews for insert to authenticated with check (
  (workspace.current_user_can_workspace('performance', 'edit') and workspace.current_user_is_performance_employee(employee_id))
  or workspace.can_manage_performance_record(employee_id, reviewer_name, privacy_scope_ids)
);
create policy performance_reviews_update on workspace.performance_reviews for update to authenticated using (
  (workspace.current_user_can_workspace('performance', 'edit') and workspace.current_user_is_performance_employee(employee_id))
  or workspace.can_manage_performance_record(employee_id, reviewer_name, privacy_scope_ids)
) with check (
  (workspace.current_user_can_workspace('performance', 'edit') and workspace.current_user_is_performance_employee(employee_id))
  or workspace.can_manage_performance_record(employee_id, reviewer_name, privacy_scope_ids)
);
create policy performance_reviews_delete on workspace.performance_reviews for delete to authenticated using (
  workspace.can_manage_performance_record(employee_id, reviewer_name, privacy_scope_ids)
);

create or replace function workspace.sync_performance_review_org_manager()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_manager text; v_scopes uuid[];
begin
  v_scopes := workspace.performance_org_ancestors(workspace.resolve_performance_employee(new.employee_id));
  v_scopes := v_scopes || array[workspace.resolve_performance_employee(new.employee_id)];
  if tg_op = 'UPDATE' then
    v_scopes := v_scopes || old.privacy_scope_ids;
    if old.status = 'approved' then
      select coalesce(array_agg(distinct id), array[]::uuid[]) into new.privacy_scope_ids from unnest(v_scopes) id where id is not null;
      return new;
    end if;
  end if;
  select coalesce(u.username, '') into v_manager from workspace.performance_org_members o
  left join workspace.system_users u on u.id = o.manager_id
  where o.employee_id = workspace.resolve_performance_employee(new.employee_id);
  if found then new.reviewer_name := v_manager; end if;
  v_scopes := v_scopes || array[workspace.resolve_performance_employee(new.reviewer_name)];
  select coalesce(array_agg(distinct id), array[]::uuid[]) into new.privacy_scope_ids from unnest(v_scopes) id where id is not null;
  return new;
end;
$$;

create or replace function workspace.guard_performance_review_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor workspace.system_users%rowtype; v_allowed boolean;
begin
  select * into v_actor from workspace.system_users where id = workspace.current_system_user_id() and status = 'active';
  -- The account-service/database maintenance role has no user session.
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'Review identity cannot be reassigned' using errcode = '42501';
  end if;
  -- Organization reassignment by an admin may update reviewer metadata only.
  if tg_op = 'UPDATE'
    and ((v_actor.role in ('admin', 'super_admin') and
      (to_jsonb(new) - array['reviewer_name','updated_at','privacy_scope_ids']) = (to_jsonb(old) - array['reviewer_name','updated_at','privacy_scope_ids']))
    or (to_jsonb(new) - 'privacy_scope_ids') = (to_jsonb(old) - 'privacy_scope_ids')) then return new; end if;
  if tg_op = 'UPDATE' then
    v_allowed := workspace.can_manage_performance_record(old.employee_id, old.reviewer_name, old.privacy_scope_ids);
  else
    v_allowed := workspace.can_manage_performance_record(new.employee_id, new.reviewer_name, array[]::uuid[]);
  end if;
  if v_allowed then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.manager_feedback, '') <> '' or new.score is not null or coalesce(new.reviewer_name, '') <> '' or new.status = 'approved' then
      raise exception 'Only the authorized reviewer can edit manager assessment fields' using errcode = '42501';
    end if;
  elsif new.manager_feedback is distinct from old.manager_feedback or new.score is distinct from old.score
    or new.reviewer_name is distinct from old.reviewer_name
    or (new.status = 'approved' and old.status <> 'approved') then
    raise exception 'Only the authorized reviewer can edit manager assessment fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Some deployments skipped the earlier optional manager migration; install
-- the guard trigger here as well as replacing its function.
drop trigger if exists guard_performance_review_self_update on workspace.performance_reviews;
create trigger guard_performance_review_self_update before insert or update on workspace.performance_reviews
for each row execute function workspace.guard_performance_review_self_update();
revoke all on function workspace.guard_performance_review_self_update() from public, anon, authenticated;

create or replace function workspace.get_performance_group_locks()
returns table(owner_id uuid, owner_name text, unlocked boolean, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(workspace.current_user_is_performance_manager(), false) or not coalesce(workspace.current_user_can_workspace('performance', 'view'), false) then
    raise exception 'Performance manager access required' using errcode = '42501';
  end if;
  return query select s.owner_id, coalesce(nullif(u.display_name, ''), u.username)::text,
    workspace.performance_scopes_unlocked(array[s.owner_id]),
    (select g.expires_at from workspace.performance_group_unlocks g where g.owner_id = s.owner_id
      and g.auth_user_id = auth.uid() and g.session_id = auth.jwt() ->> 'session_id' and g.version = s.version and g.expires_at > now())
  from workspace.performance_group_secrets s join workspace.system_users u on u.id = s.owner_id order by u.display_name;
end;
$$;
revoke all on function workspace.get_performance_group_locks() from public, anon;
grant execute on function workspace.get_performance_group_locks() to authenticated;

create or replace function workspace.unlock_performance_group(p_owner_id uuid, p_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s workspace.performance_group_secrets%rowtype; a workspace.performance_group_attempts%rowtype; v_session text := auth.jwt() ->> 'session_id';
begin
  if not coalesce(workspace.current_user_is_performance_manager(), false) or not coalesce(workspace.current_user_can_workspace('performance', 'view'), false) or nullif(v_session, '') is null then
    raise exception 'Performance manager session required' using errcode = '42501';
  end if;
  select * into s from workspace.performance_group_secrets where owner_id = p_owner_id for update;
  if not found then return false; end if;
  insert into workspace.performance_group_attempts(auth_user_id, owner_id) values (auth.uid(), p_owner_id) on conflict do nothing;
  select * into a from workspace.performance_group_attempts where auth_user_id = auth.uid() and owner_id = p_owner_id for update;
  if a.blocked_until > now() then return false; end if;
  if octet_length(coalesce(p_password, '')) > 72 or not coalesce(workspace.performance_password_hash(p_password, s.password_hash) = s.password_hash, false) then
    update workspace.performance_group_attempts set failures = case when a.blocked_until is not null then 1 else failures + 1 end,
      blocked_until = case when a.blocked_until is null and a.failures >= 4 then now() + interval '5 minutes' else null end
    where auth_user_id = auth.uid() and owner_id = p_owner_id;
    return false;
  end if;
  delete from workspace.performance_group_attempts where auth_user_id = auth.uid() and owner_id = p_owner_id;
  insert into workspace.performance_group_unlocks(auth_user_id, session_id, owner_id, version, expires_at)
  values (auth.uid(), v_session, p_owner_id, s.version, now() + interval '30 minutes')
  on conflict (auth_user_id, session_id, owner_id) do update set version = excluded.version, expires_at = excluded.expires_at;
  return true;
end;
$$;
revoke all on function workspace.unlock_performance_group(uuid, text) from public, anon;
grant execute on function workspace.unlock_performance_group(uuid, text) to authenticated;

create or replace function workspace.set_performance_group_password(p_password text, p_current_password text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := workspace.current_system_user_id(); v_session text := auth.jwt() ->> 'session_id'; v_version timestamptz;
begin
  if not coalesce(workspace.current_user_is_performance_manager(), false) or not coalesce(workspace.current_user_can_workspace('performance', 'edit'), false) or nullif(v_session, '') is null then
    raise exception 'Performance manager session required' using errcode = '42501';
  end if;
  if p_password is null or (p_password <> '' and (length(p_password) < 8 or octet_length(p_password) > 72)) then
    raise exception 'Use 8 or more characters, at most 72 bytes' using errcode = '22023';
  end if;
  -- Serialize first-time setup as well as password rotation, in the same lock
  -- order as organization edits. Passwords never travel through browser storage.
  lock table workspace.performance_org_members in share row exclusive mode;
  perform id from workspace.system_users where id = v_owner for update;
  if exists (select 1 from workspace.performance_group_secrets where owner_id = v_owner)
    and not workspace.unlock_performance_group(v_owner, p_current_password) then return false; end if;
  if p_password = '' then
    delete from workspace.performance_group_secrets where owner_id = v_owner;
    return true;
  end if;
  -- The review trigger retains all current scopes, including completed rows.
  update workspace.performance_reviews r set privacy_scope_ids = r.privacy_scope_ids
  where v_owner = any(workspace.performance_org_ancestors(workspace.resolve_performance_employee(r.employee_id)))
    or workspace.resolve_performance_employee(r.employee_id) = v_owner;
  insert into workspace.performance_group_secrets(owner_id, password_hash) values(v_owner, workspace.performance_password_hash(p_password))
  on conflict(owner_id) do update set password_hash = excluded.password_hash, version = clock_timestamp()
  returning version into v_version;
  delete from workspace.performance_group_unlocks where owner_id = v_owner;
  insert into workspace.performance_group_unlocks(auth_user_id, session_id, owner_id, version, expires_at)
  values (auth.uid(), v_session, v_owner, v_version, now() + interval '30 minutes');
  return true;
end;
$$;
revoke all on function workspace.set_performance_group_password(text, text) from public, anon;
grant execute on function workspace.set_performance_group_password(text, text) to authenticated;

create or replace function workspace.lock_performance_groups()
returns void language sql security definer set search_path = '' as $$
  delete from workspace.performance_group_unlocks where auth_user_id = auth.uid() and session_id = auth.jwt() ->> 'session_id';
$$;
revoke all on function workspace.lock_performance_groups() from public, anon;
grant execute on function workspace.lock_performance_groups() to authenticated;

-- Snapshot the old ancestor scopes before changing a manager's parent. This
-- also covers moving an entire section whose members keep the same reviewer.
create or replace function workspace.retain_performance_org_privacy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id then return new; end if;
  update workspace.performance_reviews r set privacy_scope_ids = r.privacy_scope_ids
  where old.employee_id = any(workspace.performance_org_ancestors(workspace.resolve_performance_employee(r.employee_id)))
    or workspace.resolve_performance_employee(r.employee_id) = old.employee_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function workspace.retain_performance_org_privacy() from public, anon, authenticated;
drop trigger if exists retain_performance_org_privacy on workspace.performance_org_members;
create trigger retain_performance_org_privacy before update or delete on workspace.performance_org_members
for each row execute function workspace.retain_performance_org_privacy();
notify pgrst, 'reload schema';
