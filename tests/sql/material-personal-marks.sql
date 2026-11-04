-- Account isolation is exercised under real authenticated/anon roles. All fixtures roll back.
begin;
set local statement_timeout = '15s';
do $$
declare
  a workspace.system_users%rowtype;
  b workspace.system_users%rowtype;
  target text := 'qa:personal-marks:' || txid_current()::text;
  denied boolean;
begin
  select * into a from workspace.system_users where status='active' and auth_user_id is not null and role='admin' limit 1;
  select * into b from workspace.system_users where status='active' and auth_user_id is not null and role='engineer' limit 1;
  assert a.id is not null and b.id is not null, 'two linked test identities required';
  insert into workspace.material_bom_workspaces(id,name,source_file,sheet_name,record_count)
    values(target,'QA transaction only','QA.xlsx','Sheet1',0);
  update workspace.system_users set permissions=jsonb_set(coalesce(permissions,'{}'),'{workspaceAccess}',
    coalesce(permissions->'workspaceAccess','{}') || '{"material-requests":"view"}'::jsonb) where id=b.id;
  perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
  execute 'set local role authenticated';
  insert into workspace.material_personal_marks(workspace_id,group_key) values(target,'R1'),(target,repeat('R1234567',7000));
  assert (select count(*)=2 from workspace.material_personal_marks where workspace_id=target), 'A cannot read its own marks or a long location key failed';
  denied:=false;
  begin insert into workspace.material_personal_marks(owner_id,workspace_id,group_key) values(b.id,target,'forged');
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'A could write a mark owned by B';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from workspace.material_personal_marks where workspace_id=target),'B can see A marks';
  delete from workspace.material_personal_marks where workspace_id=target and owner_id=a.id;
  assert not found,'B can remove A marks';
  insert into workspace.material_personal_marks(workspace_id,group_key) values(target,'R1');
  assert (select count(*)=1 from workspace.material_personal_marks where workspace_id=target),'view-only B cannot mark independently';
  denied:=false;
  begin update workspace.material_personal_marks set owner_id=a.id where workspace_id=target;
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'B could reassign a private mark';
  execute 'reset role';

  perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=2 from workspace.material_personal_marks where workspace_id=target),'admin A could see B private marks';
  delete from workspace.material_personal_marks where workspace_id=target and group_key='R1';
  assert found,'A cannot unmark its own item';
  execute 'reset role';
  execute 'set local role anon';
  denied:=false;
  begin perform 1 from workspace.material_personal_marks;
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'anonymous access was granted';
  execute 'reset role';

  update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,material-requests}','"none"') where id=b.id;
  perform set_config('request.jwt.claim.sub',b.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from workspace.material_personal_marks where workspace_id=target),'revoked account can still read marks';
  denied:=false;
  begin insert into workspace.material_personal_marks(workspace_id,group_key) values(target,'denied');
  exception when insufficient_privilege then denied:=true; end;
  assert denied,'revoked account can still mark';
  execute 'reset role';
end $$;
rollback;
select 'PASS: owner isolation, admin isolation, view-only marks, long keys, unmark, anonymous and revoked access; fixtures rolled back' as result;
