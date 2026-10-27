begin;
set local lock_timeout = '5s';

create schema rlc_priority_private;
revoke all on schema rlc_priority_private from public, anon;
grant usage on schema rlc_priority_private to authenticated;

-- Match the material-requests workspace's explicit setting before legacy page permissions.
create function rlc_priority_private.has_access(p_edit boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = (select auth.uid()) and account.status = 'active'
      and (account.role in ('admin', 'super_admin') or case
        when jsonb_typeof(account.permissions -> 'workspaceAccess') = 'object'
          and (account.permissions -> 'workspaceAccess') ? 'material-requests'
        then case when p_edit then account.permissions #>> '{workspaceAccess,material-requests}' = 'edit'
          else account.permissions #>> '{workspaceAccess,material-requests}' in ('view', 'edit') end
        else workspace.current_user_has_stored_page_permission('data_center_edit')
          or (not p_edit and workspace.current_user_has_stored_page_permission('data_center_view'))
        end)
  );
$$;
revoke all on function rlc_priority_private.has_access(boolean) from public, anon;
grant execute on function rlc_priority_private.has_access(boolean) to authenticated;

create table workspace.rlc_priority_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.test_projects(id) on delete restrict,
  spec_key text not null check (char_length(spec_key) <= 36016),
  kind text not null check (kind in ('R', 'L', 'C')),
  spec text not null check (char_length(spec) between 1 and 6000 and spec = regexp_replace(btrim(spec), '\s+', ' ', 'g')),
  candidate_key text not null check (char_length(candidate_key) <= 9010),
  manufacturer text not null check (char_length(manufacturer) between 1 and 500 and manufacturer = regexp_replace(btrim(manufacturer), '\s+', ' ', 'g')),
  mpn text not null check (char_length(mpn) between 1 and 1000 and mpn = regexp_replace(btrim(mpn), '\s+', ' ', 'g')),
  customer_approval text not null default 'pending' check (customer_approval in ('pending', 'approved', 'not-required', 'blocked')),
  avl text not null default 'pending' check (avl in ('pending', 'approved', 'not-required', 'blocked')),
  engineering text not null default 'pending' check (engineering in ('pending', 'approved', 'not-required', 'blocked')),
  rank bigint check (rank > 0 and rank <= 9007199254740991),
  notes text not null default '' check (char_length(notes) <= 6000),
  evidence text not null default '' check (char_length(evidence) <= 6000),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  -- Historical actor identity is retained if the account is later removed.
  updated_by uuid not null default workspace.current_system_user_id(),
  check (spec_key = format('[%s,%s]', to_json(kind)::text, to_json(spec)::text)),
  check (candidate_key = format('[%s,%s]', to_json(upper(manufacturer))::text, to_json(upper(mpn))::text)),
  -- Full keys are retained and compared for every read/update; hashes keep long Name values out of btree entries.
  spec_hash text generated always as (md5(spec_key)) stored,
  candidate_hash text generated always as (md5(candidate_key)) stored,
  unique (project_id, spec_hash, candidate_hash)
);
create index rlc_priority_rules_project_id_idx on workspace.rlc_priority_rules(project_id, id);
alter table workspace.rlc_priority_rules enable row level security;
revoke all on workspace.rlc_priority_rules from public, anon, authenticated;
grant select on workspace.rlc_priority_rules to authenticated;
grant insert (project_id, spec_key, kind, spec, candidate_key, manufacturer, mpn, customer_approval, avl, engineering, rank, notes, evidence)
  on workspace.rlc_priority_rules to authenticated;
grant update (customer_approval, avl, engineering, rank, notes, evidence, version)
  on workspace.rlc_priority_rules to authenticated;
grant all on workspace.rlc_priority_rules to service_role;
create policy rlc_priority_rules_read on workspace.rlc_priority_rules for select to authenticated
  using ((select rlc_priority_private.has_access(false)));
create policy rlc_priority_rules_insert on workspace.rlc_priority_rules for insert to authenticated
  with check ((select rlc_priority_private.has_access(true)));
create policy rlc_priority_rules_update on workspace.rlc_priority_rules for update to authenticated
  using ((select rlc_priority_private.has_access(true))) with check ((select rlc_priority_private.has_access(true)));

create function rlc_priority_private.stamp_rule() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if workspace.current_system_user_id() is null then raise exception '需要有效帳號' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if new.version <> 1 then raise exception '規則版本不正確' using errcode = '40001'; end if;
    new.updated_at := clock_timestamp();
  else
    if row(new.id, new.project_id, new.spec_key, new.kind, new.spec, new.candidate_key, new.manufacturer, new.mpn)
      is distinct from row(old.id, old.project_id, old.spec_key, old.kind, old.spec, old.candidate_key, old.manufacturer, old.mpn)
      or new.version <> old.version + 1 then
      raise exception '規則識別或版本已變更，請重新載入' using errcode = '40001';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  new.updated_by := workspace.current_system_user_id();
  return new;
end;
$$;
revoke all on function rlc_priority_private.stamp_rule() from public, anon, authenticated;
create trigger rlc_priority_rules_stamp before insert or update on workspace.rlc_priority_rules
  for each row execute function rlc_priority_private.stamp_rule();

create function workspace.save_rlc_priority_rule(p_actor uuid, p_rule jsonb, p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved workspace.rlc_priority_rules; rank_value bigint;
begin
  if p_actor is distinct from workspace.current_system_user_id() or not rlc_priority_private.has_access(true) then
    raise exception '帳號或物料編輯權限已變更' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rule) is distinct from 'object' or octet_length(p_rule::text) > 100000 then raise exception '規則格式或大小不正確'; end if;
  if exists (select 1 from unnest(array['projectId','specKey','kind','spec','candidateKey','manufacturer','mpn','customerApproval','avl','engineering','notes','evidence']) f
    where jsonb_typeof(p_rule -> f) is distinct from 'string') then raise exception '規則欄位必須是字串'; end if;
  if jsonb_typeof(p_rule -> 'rank') = 'number' and p_rule ->> 'rank' ~ '^[0-9]+$' then rank_value := (p_rule ->> 'rank')::bigint;
  elsif jsonb_typeof(p_rule -> 'rank') is distinct from 'null' then raise exception '優先序必須為正整數或空值'; end if;
  if p_expected_updated_at is null then
    insert into workspace.rlc_priority_rules(project_id,spec_key,kind,spec,candidate_key,manufacturer,mpn,customer_approval,avl,engineering,rank,notes,evidence)
      values ((p_rule->>'projectId')::uuid,p_rule->>'specKey',p_rule->>'kind',p_rule->>'spec',p_rule->>'candidateKey',p_rule->>'manufacturer',p_rule->>'mpn',
        p_rule->>'customerApproval',p_rule->>'avl',p_rule->>'engineering',rank_value,p_rule->>'notes',p_rule->>'evidence') returning * into saved;
  else
    update workspace.rlc_priority_rules set customer_approval=p_rule->>'customerApproval',avl=p_rule->>'avl',engineering=p_rule->>'engineering',
      rank=rank_value,notes=p_rule->>'notes',evidence=p_rule->>'evidence',version=version+1
      where project_id=(p_rule->>'projectId')::uuid and spec_key=p_rule->>'specKey' and candidate_key=p_rule->>'candidateKey'
        and kind=p_rule->>'kind' and spec=p_rule->>'spec' and manufacturer=p_rule->>'manufacturer' and mpn=p_rule->>'mpn'
        and updated_at=p_expected_updated_at returning * into saved;
    if not found then raise exception '規則已由其他人更新，請重新載入核對' using errcode = '40001'; end if;
  end if;
  return to_jsonb(saved) - 'spec_hash' - 'candidate_hash';
end;
$$;
revoke all on function workspace.save_rlc_priority_rule(uuid,jsonb,timestamptz) from public, anon;
grant execute on function workspace.save_rlc_priority_rule(uuid,jsonb,timestamptz) to authenticated;
notify pgrst, 'reload schema';
commit;
