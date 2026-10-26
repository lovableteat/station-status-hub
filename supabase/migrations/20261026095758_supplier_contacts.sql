-- Personal supplier contacts: append-only imports and owner-scoped, versioned edits.
-- Version matches the verified production migration history.
begin;
set local lock_timeout = '5s';

create table if not exists workspace.supplier_contacts (
  id uuid primary key,
  owner_id uuid not null default workspace.current_system_user_id()
    references workspace.system_users(id) on delete cascade,
  vendor text not null check (char_length(vendor) <= 200 and char_length(btrim(vendor)) > 0),
  vendor_key text generated always as (lower(btrim(vendor))) stored,
  name text not null default '' check (char_length(name) <= 200),
  email text not null check (char_length(btrim(email)) between 1 and 2000),
  cc text not null default '' check (char_length(cc) <= 2000),
  phone text not null default '' check (char_length(phone) <= 160),
  note text not null default '' check (char_length(note) <= 4000),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, vendor_key, email)
);
create index if not exists supplier_contacts_owner_order_idx
  on workspace.supplier_contacts(owner_id, vendor_key, id);

alter table workspace.supplier_contacts enable row level security;
revoke all on table workspace.supplier_contacts from public, anon, authenticated;
grant select, insert, update on table workspace.supplier_contacts to authenticated;
grant all on table workspace.supplier_contacts to service_role;

create policy supplier_contacts_owner_read on workspace.supplier_contacts
  for select to authenticated
  using (owner_id = (select workspace.current_system_user_id()));
create policy supplier_contacts_owner_insert on workspace.supplier_contacts
  for insert to authenticated
  with check (owner_id = (select workspace.current_system_user_id()));
create policy supplier_contacts_owner_update on workspace.supplier_contacts
  for update to authenticated
  using (owner_id = (select workspace.current_system_user_id()))
  with check (owner_id = (select workspace.current_system_user_id()));

create or replace function workspace.stamp_supplier_contact_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function workspace.stamp_supplier_contact_updated_at() from public, anon, authenticated;
create trigger supplier_contacts_updated_at before update on workspace.supplier_contacts
  for each row execute function workspace.stamp_supplier_contact_updated_at();

notify pgrst, 'reload schema';
commit;
