-- Version matches the applied production migration.
begin;
set local lock_timeout = '5s';

create schema if not exists supplier_directory_private;
revoke all on schema supplier_directory_private from public, anon;
grant usage on schema supplier_directory_private to authenticated;

create function supplier_directory_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from workspace.system_users
    where auth_user_id = (select auth.uid()) and status = 'active' and role in ('admin','super_admin'));
$$;
revoke all on function supplier_directory_private.is_admin() from public, anon;
grant execute on function supplier_directory_private.is_admin() to authenticated;

create function supplier_directory_private.valid_data(d jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select jsonb_typeof(d) = 'object' and jsonb_object_length_check.n = 16
    and char_length(btrim(d->>'company')) > 0
    and not exists (select 1 from jsonb_each(d) f
      where f.key <> all (array['company','aliases','brands','name','title','department','email','cc','phone','mobile','extension','category','address','code','pvl','note'])
        or jsonb_typeof(f.value) <> 'string' or char_length(f.value #>> '{}') > 6000)
    and not exists (select 1 from regexp_split_to_table(concat_ws(';',d->>'email',d->>'cc'), '[;,\n]') e
      where btrim(e) <> '' and (char_length(btrim(e)) > 254 or btrim(e) !~ '^[^[:space:]@<>:;,]+@[^[:space:]@<>:;,]+\.[a-zA-Z]{2,}$'))
  from (select count(*) n from jsonb_object_keys(case when jsonb_typeof(d) = 'object' then d else '{}'::jsonb end)) jsonb_object_length_check;
$$;
revoke all on function supplier_directory_private.valid_data(jsonb) from public, anon;
grant execute on function supplier_directory_private.valid_data(jsonb) to authenticated;

create function supplier_directory_private.valid_source(s jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(s) = 'object' and char_length(s::text) <= 1048576
    and jsonb_typeof(s->'group') = 'string' and char_length(btrim(s->>'group')) between 1 and 200
    and jsonb_typeof(s->'file') = 'string' and char_length(s->>'file') <= 500
    and jsonb_typeof(s->'sheet') = 'string' and char_length(s->>'sheet') <= 200
    and jsonb_typeof(s->'row') = 'number' and s->>'row' ~ '^[0-9]{1,6}$'
    and s->>'slot' in ('1','2') and jsonb_typeof(s->'raw') = 'array'
    and jsonb_array_length(s->'raw') <= 256
    and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s->'raw') = 'array' then s->'raw' else '[]'::jsonb end) v
      where jsonb_typeof(v->'label') is distinct from 'string' or jsonb_typeof(v->'value') is distinct from 'string'
        or char_length(v->>'label') > 6000 or char_length(v->>'value') > 6000), false);
$$;
revoke all on function supplier_directory_private.valid_source(jsonb) from public, anon;
grant execute on function supplier_directory_private.valid_source(jsonb) to authenticated;

create table workspace.company_supplier_contacts (
  id uuid primary key,
  data jsonb not null check (supplier_directory_private.valid_data(data)),
  imported jsonb not null check (supplier_directory_private.valid_data(imported)),
  source jsonb not null check (supplier_directory_private.valid_source(source)),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid default workspace.current_system_user_id() references workspace.system_users(id) on delete set null
);
create index company_supplier_contacts_source_idx on workspace.company_supplier_contacts ((source->>'group'),id);
alter table workspace.company_supplier_contacts enable row level security;
revoke all on workspace.company_supplier_contacts from public, anon, authenticated;
grant select,insert,update on workspace.company_supplier_contacts to authenticated;
grant all on workspace.company_supplier_contacts to service_role;
create policy company_suppliers_read on workspace.company_supplier_contacts for select to authenticated
  using ((select workspace.current_system_user_id()) is not null);
create policy company_suppliers_insert on workspace.company_supplier_contacts for insert to authenticated
  with check ((select supplier_directory_private.is_admin()));
create policy company_suppliers_update on workspace.company_supplier_contacts for update to authenticated
  using ((select supplier_directory_private.is_admin())) with check ((select supplier_directory_private.is_admin()));

create function supplier_directory_private.check_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.version <> 1) or (tg_op = 'UPDATE' and (new.id <> old.id or new.version <> old.version + 1)) then
    raise exception '資料版本已變更，請重新載入並比對' using errcode = '40001';
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := workspace.current_system_user_id();
  return new;
end;
$$;
revoke all on function supplier_directory_private.check_version() from public, anon, authenticated;
create trigger company_suppliers_version before insert or update on workspace.company_supplier_contacts
  for each row execute function supplier_directory_private.check_version();

create function workspace.apply_company_supplier_contacts(p_actor uuid, p_contacts jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; affected integer; total integer := 0;
begin
  if p_actor is distinct from workspace.current_system_user_id() or not supplier_directory_private.is_admin() then
    raise exception '只有有效管理員可修改公司聯絡資料' using errcode = '42501';
  end if;
  if p_contacts is null or jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) not between 1 and 5000
    or octet_length(p_contacts::text) > 15728640 then raise exception '每次限 5000 筆、15 MiB'; end if;
  if exists(select 1 from jsonb_array_elements(p_contacts) x group by x->>'id' having count(*) > 1) then
    raise exception '同一批次不可重複修改同一聯絡人';
  end if;
  -- Stable lock order prevents two overlapping batches deadlocking.
  for item in select value from jsonb_array_elements(p_contacts) order by value->>'id' loop
    if (item->>'version')::integer = 0 then
      insert into workspace.company_supplier_contacts (id,data,imported,source)
        values ((item->>'id')::uuid,item->'data',item->'imported',item->'source');
    else
      update workspace.company_supplier_contacts set data=item->'data',imported=item->'imported',source=item->'source',version=version+1
        where id=(item->>'id')::uuid and version=(item->>'version')::integer;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception '聯絡資料已被其他人修改，整批未儲存；請重新載入再比較' using errcode = '40001'; end if;
    end if;
    total := total + 1;
  end loop;
  return total;
end;
$$;
revoke all on function workspace.apply_company_supplier_contacts(uuid,jsonb) from public, anon;
grant execute on function workspace.apply_company_supplier_contacts(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
