-- Run as the database test administrator. Everything, including fixture data
-- and temporary permission changes, is rolled back at the end.
begin;
set local statement_timeout = '15s';
do $$
declare
  first_actor workspace.system_users%rowtype;
  second_actor workspace.system_users%rowtype;
  target text := 'qa:shared-note:' || txid_current()::text;
  result jsonb;
  denied boolean;
begin
  select * into first_actor from workspace.system_users
    where status = 'active' and auth_user_id is not null and role = 'admin' limit 1;
  select * into second_actor from workspace.system_users
    where status = 'active' and auth_user_id is not null and role = 'engineer' limit 1;
  assert first_actor.id is not null and second_actor.id is not null, 'two linked test identities required';
  insert into workspace.material_bom_workspaces(id,name,source_file,sheet_name,record_count,updated_at)
    values(target,'QA transaction only','QA.xlsx','Sheet1',1,'2000-01-01');
  insert into workspace.material_bom_records(workspace_id,record_id,data)
    values(target,'r1','{"id":"r1","name":"original","qty":1,"note":""}');
  perform set_config('request.jwt.claim.sub',first_actor.auth_user_id::text,true);
  execute 'set local role authenticated';
  result := workspace.save_material_bom_note(target,'r1','account A','');
  assert result #>> '{data,note}' = 'account A', 'account A save failed';
  assert (select updated_at > '2000-01-01'::timestamptz from workspace.material_bom_workspaces where id=target), 'workspace render cache was not invalidated';
  execute 'reset role';

  -- Give B view-only access within this uncommitted test transaction.
  update workspace.system_users set permissions = jsonb_set(coalesce(permissions,'{}'),'{workspaceAccess}',
    coalesce(permissions -> 'workspaceAccess','{}') || '{"material-requests":"view"}'::jsonb)
    where id = second_actor.id;
  update workspace.material_bom_records set data = jsonb_set(data,'{name}','"updated by colleague"')
    where workspace_id = target and record_id = 'r1';
  perform set_config('request.jwt.claim.sub',second_actor.auth_user_id::text,true);
  execute 'set local role authenticated';
  assert not rlc_priority_private.has_access(true) and rlc_priority_private.has_access(false), 'B must be view-only';
  result := workspace.save_material_bom_note(target,'r1','account B','account A');
  assert result #>> '{data,note}' = 'account B', 'account B could not edit shared Note';
  assert result #>> '{data,name}' = 'updated by colleague' and result #>> '{data,qty}' = '1', 'Note changed other BOM fields';
  denied := false;
  begin
    perform workspace.save_material_bom_note(target,'r1','stale overwrite','account A');
  exception when serialization_failure then denied := true;
  end;
  assert denied, 'stale Note overwrote a newer edit';
  denied := false;
  begin
    perform workspace.save_material_bom_note(target,'r1',repeat('x',4001),'account B');
  exception when invalid_parameter_value then denied := true;
  end;
  assert denied, 'oversized Note was accepted';
  execute 'reset role';

  insert into workspace.ui_table_preferences(table_key,column_order)
    values('material-bom-version:' || target,'{"isCurrent":false}');
  execute 'set local role authenticated';
  denied := false;
  begin
    perform workspace.save_material_bom_note(target,'r1','edit history','account B');
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'historical version was edited';
  execute 'reset role';

  update workspace.system_users set permissions = jsonb_set(permissions,'{workspaceAccess,material-requests}','"none"')
    where id = second_actor.id;
  execute 'set local role authenticated';
  denied := false;
  begin
    perform workspace.save_material_bom_note(target,'r1','no access','account B');
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'account without material access saved Note';
  perform set_config('request.jwt.claim.sub','',true);
  denied := false;
  begin
    perform workspace.save_material_bom_note(target,'r1','no session','account B');
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'missing identity saved Note';
  execute 'reset role';
  assert not has_function_privilege('anon','workspace.save_material_bom_note(text,text,text,text)','execute'), 'anonymous execution granted';
end;
$$;
select 'PASS: A/B shared editing, view-only editing, other fields preserved, stale-write conflict, length limit, history lock, denied access, missing identity, anonymous denied; all test writes rolled back' as verification;
rollback;
