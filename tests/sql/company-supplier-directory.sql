-- Synthetic data only. Run after the migration; every test is rolled back.
begin;
select set_config('supplier_qa.admin_auth', (select auth_user_id::text from workspace.system_users where status='active' and role='admin' and auth_user_id is not null limit 1), true);
select set_config('supplier_qa.member_auth', (select auth_user_id::text from workspace.system_users where status='active' and role='engineer' and auth_user_id is not null limit 1), true);
select set_config('supplier_qa.id', gen_random_uuid()::text, true);
select set_config('supplier_qa.data', (select jsonb_object_agg(k,case when k='company' then 'Synthetic QA Company' when k='email' then 'qa@example.invalid' else '' end)::text from unnest(array['company','aliases','brands','name','title','department','email','cc','phone','mobile','extension','category','address','code','pvl','note']) k), true);
select set_config('supplier_qa.source','{"group":"Synthetic QA","file":"synthetic.xlsx","sheet":"QA","row":2,"slot":1,"raw":[]}',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('supplier_qa.admin_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare d jsonb := current_setting('supplier_qa.data')::jsonb;
  s jsonb := current_setting('supplier_qa.source')::jsonb;
  fixture jsonb; n integer; rejected boolean := false;
begin
  if workspace.current_system_user_id() is null then raise exception 'QA requires active administrator'; end if;
  fixture := jsonb_build_object('id',current_setting('supplier_qa.id'),'version',0,'data',d,'imported',d,'source',s);
  n := workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),jsonb_build_array(fixture));
  if n <> 1 then raise exception 'admin insert failed'; end if;
  begin
    perform workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),jsonb_build_array(
      fixture || jsonb_build_object('version',1,'data',d || '{"name":"should rollback"}'::jsonb),
      fixture || jsonb_build_object('id',gen_random_uuid(),'version',999)));
  exception when serialization_failure then rejected := true;
  end;
  if not rejected or (select data->>'name' from workspace.company_supplier_contacts where id=current_setting('supplier_qa.id')::uuid) <> '' then raise exception 'batch conflict was not atomic'; end if;
  rejected := false;
  begin
    perform workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),jsonb_build_array(fixture || jsonb_build_object('id',gen_random_uuid(),'data',d || '{"email":"bad\nBcc:leak@example.invalid"}'::jsonb)));
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'invalid email accepted'; end if;
  rejected := false;
  begin
    perform workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),jsonb_build_array(fixture || jsonb_build_object('id',gen_random_uuid(),'source','{"group":"x"}'::jsonb)));
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'invalid source accepted'; end if;
  n := workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),jsonb_build_array(fixture || jsonb_build_object('version',1,'data',d || '{"name":"Manual edit"}'::jsonb)));
  if n <> 1 or (select version from workspace.company_supplier_contacts where id=current_setting('supplier_qa.id')::uuid) <> 2 then raise exception 'CAS update failed'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('supplier_qa.member_auth'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare rejected boolean := false; n integer;
begin
  if workspace.current_system_user_id() is null then raise exception 'QA requires active member'; end if;
  if not exists(select 1 from workspace.company_supplier_contacts where id=current_setting('supplier_qa.id')::uuid) then raise exception 'member cannot read shared data'; end if;
  begin
    perform workspace.apply_company_supplier_contacts(workspace.current_system_user_id(),'[]'::jsonb);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'member RPC allowed'; end if;
  update workspace.company_supplier_contacts set data=data || '{"name":"Unauthorized"}'::jsonb,version=version+1 where id=current_setting('supplier_qa.id')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'member direct update allowed'; end if;
  rejected := false;
  begin
    insert into workspace.company_supplier_contacts(id,data,imported,source) values(gen_random_uuid(),current_setting('supplier_qa.data')::jsonb,current_setting('supplier_qa.data')::jsonb,current_setting('supplier_qa.source')::jsonb);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'member direct insert allowed'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from workspace.company_supplier_contacts) then raise exception 'unknown company account can read directory'; end if;
end $$;
reset role;
set local role anon;
do $$ declare rejected boolean := false; begin
  begin perform 1 from workspace.company_supplier_contacts;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'anonymous read allowed'; end if;
end $$;
reset role;
select 'PASS: admin CAS, atomic rollback, data validation, company read, member write denial, unknown-account and anonymous denial' as result;
rollback;
