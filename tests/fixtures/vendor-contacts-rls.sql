-- Run after the contact DDL in the same transaction; always ROLLBACK afterwards.
create temp table supplier_contact_test_accounts as
  select id, auth_user_id, row_number() over (order by id) as ordinal
  from workspace.system_users
  where status = 'active' and auth_user_id is not null
  order by id limit 2;
grant select on supplier_contact_test_accounts to authenticated;

do $$ begin
  if (select count(*) from supplier_contact_test_accounts) <> 2 then
    raise exception 'Two active authenticated accounts are needed for isolation QA';
  end if;
  if has_table_privilege('anon', 'workspace.supplier_contacts', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'workspace.supplier_contacts', 'DELETE') then
    raise exception 'Unexpected anonymous or delete privilege';
  end if;
end $$;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from supplier_contact_test_accounts where ordinal = 1), true);
set local role authenticated;
insert into workspace.supplier_contacts(id, vendor, email)
values ('df045eb0-4bc1-44ec-9270-e723836ab101', '__CONTACT_QA__', 'contact-qa@example.invalid');

do $$ declare original_stamp timestamptz; affected integer; begin
  select updated_at into original_stamp from workspace.supplier_contacts
    where id = 'df045eb0-4bc1-44ec-9270-e723836ab101';
  if original_stamp is null then raise exception 'Owner cannot read inserted contact'; end if;
  update workspace.supplier_contacts set note = 'first edit'
    where id = 'df045eb0-4bc1-44ec-9270-e723836ab101' and updated_at = original_stamp;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner edit failed'; end if;
  update workspace.supplier_contacts set note = 'stale edit'
    where id = 'df045eb0-4bc1-44ec-9270-e723836ab101' and updated_at = original_stamp;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale edit was not blocked'; end if;
  begin
    update workspace.supplier_contacts
      set owner_id = (select id from supplier_contact_test_accounts where ordinal = 2)
      where id = 'df045eb0-4bc1-44ec-9270-e723836ab101';
    raise exception 'Owner transfer was not blocked';
  exception when insufficient_privilege then null;
  end;
  insert into workspace.supplier_contacts(id, vendor, email, note)
    values ('df045eb0-4bc1-44ec-9270-e723836ab102', ' __contact_qa__ ', 'contact-qa@example.invalid', 'must not overwrite')
    on conflict (owner_id, vendor_key, email) do nothing;
  get diagnostics affected = row_count;
  if affected <> 0 or (select note from workspace.supplier_contacts where id = 'df045eb0-4bc1-44ec-9270-e723836ab101') <> 'first edit' then
    raise exception 'Duplicate import overwrote a manual edit';
  end if;
  begin
    insert into workspace.supplier_contacts(id, vendor, email) values
      ('df045eb0-4bc1-44ec-9270-e723836ab103', '__CONTACT_QA__', 'batch-qa@example.invalid'),
      ('df045eb0-4bc1-44ec-9270-e723836ab104', '', 'invalid-qa@example.invalid');
    raise exception 'Invalid batch was accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from workspace.supplier_contacts where id = 'df045eb0-4bc1-44ec-9270-e723836ab103') then
    raise exception 'Failed batch partially persisted';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', (select auth_user_id::text from supplier_contact_test_accounts where ordinal = 2), true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists (select 1 from workspace.supplier_contacts where id = 'df045eb0-4bc1-44ec-9270-e723836ab101') then
    raise exception 'Another account could read the contact';
  end if;
  update workspace.supplier_contacts set note = 'foreign edit' where id = 'df045eb0-4bc1-44ec-9270-e723836ab101';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another account could update the contact'; end if;
  begin
    insert into workspace.supplier_contacts(id, owner_id, vendor, email)
      values ('df045eb0-4bc1-44ec-9270-e723836ab105', (select id from supplier_contact_test_accounts where ordinal = 1), '__CONTACT_QA__', 'forged-qa@example.invalid');
    raise exception 'Another account could insert under a foreign owner';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'owner access, CAS, duplicate preservation, atomic import, cross-account isolation passed' as verification;
