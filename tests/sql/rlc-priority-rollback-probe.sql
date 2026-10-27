-- Run with a database-administrator connection after the migration.
-- Uses existing account/project identities internally; every data change is rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $probe$
declare
  administrator uuid; administrator_auth uuid; member uuid; member_auth uuid; project uuid;
  payload jsonb; saved jsonb; second_saved jsonb; first_stamp timestamptz; denied boolean;
begin
  select id,auth_user_id into administrator,administrator_auth from workspace.system_users
    where status='active' and role in ('admin','super_admin') and auth_user_id is not null order by id limit 1;
  select id,auth_user_id into member,member_auth from workspace.system_users
    where status='active' and role not in ('admin','super_admin') and auth_user_id is not null order by id limit 1;
  select id into project from workspace.test_projects where not is_archived order by id limit 1;
  if administrator is null or member is null or project is null then raise exception 'Probe needs active authenticated admin/member and an unarchived test project'; end if;
  payload := jsonb_build_object('projectId',project::text,'kind','R','spec','RLC PROBE '||gen_random_uuid()::text||' 10K 1% 0603',
    'manufacturer','Example Probe','mpn','R-PROBE','customerApproval','pending','avl','pending','engineering','pending','rank',null,'notes','','evidence','',
    'updatedBy',gen_random_uuid()::text);
  payload := payload || jsonb_build_object('specKey',format('[%s,%s]',to_json('R'::text)::text,to_json(payload->>'spec')::text),'candidateKey','["EXAMPLE PROBE","R-PROBE"]');
  perform set_config('request.jwt.claim.sub',administrator_auth::text,true);
  execute 'set local role authenticated';
  saved := workspace.save_rlc_priority_rule(administrator,payload,null);
  if saved->>'updated_by' is distinct from administrator::text or saved->>'updated_at' is null or (saved->>'version')::integer <> 1 then raise exception 'Server stamps were not enforced'; end if;
  first_stamp := (saved->>'updated_at')::timestamptz;
  second_saved := workspace.save_rlc_priority_rule(administrator,payload||'{"rank":2,"customerApproval":"approved"}'::jsonb,first_stamp);
  if (second_saved->>'version')::integer <> 2 or (second_saved->>'updated_at')::timestamptz <= first_stamp then raise exception 'Version/time did not advance'; end if;

  denied := false;
  begin perform workspace.save_rlc_priority_rule(administrator,payload,first_stamp); exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Stale CAS update was accepted'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(administrator,payload,null); exception when unique_violation then denied := true; end;
  if not denied then raise exception 'Duplicate create replaced an existing rule'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(gen_random_uuid(),payload,null); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Forged actor was accepted'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(administrator,jsonb_set(payload,'{projectId}',to_jsonb(gen_random_uuid()::text)),null); exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'Unknown project was accepted'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(administrator,payload||'{"rank":1.5}'::jsonb,(second_saved->>'updated_at')::timestamptz); exception when raise_exception or invalid_text_representation then denied := true; end;
  if not denied then raise exception 'Fractional rank was accepted'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(administrator,payload||'{"avl":"Approved"}'::jsonb,(second_saved->>'updated_at')::timestamptz); exception when check_violation then denied := true; end;
  if not denied then raise exception 'Invalid qualification was accepted'; end if;
  denied := false;
  begin update workspace.rlc_priority_rules set project_id=gen_random_uuid() where id=(saved->>'id')::uuid; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Direct identity update was allowed'; end if;
  denied := false;
  begin update workspace.rlc_priority_rules set updated_by=gen_random_uuid() where id=(saved->>'id')::uuid; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Direct stamp forgery was allowed'; end if;
  denied := false;
  begin update workspace.rlc_priority_rules set notes='lost update' where id=(saved->>'id')::uuid; exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Versionless direct update was allowed'; end if;

  execute 'reset role';
  update workspace.system_users set permissions=jsonb_set(coalesce(permissions,'{}'::jsonb),'{workspaceAccess}','{"material-requests":"view"}'::jsonb)
    || '{"pagePermissions":["data_center_edit"]}'::jsonb where id=member;
  perform set_config('request.jwt.claim.sub',member_auth::text,true);
  execute 'set local role authenticated';
  if not rlc_priority_private.has_access(false) or rlc_priority_private.has_access(true) then raise exception 'Explicit view did not override legacy edit'; end if;
  if not exists(select 1 from workspace.rlc_priority_rules where id=(saved->>'id')::uuid) then raise exception 'Material viewer cannot read the shared project rule'; end if;
  denied := false;
  begin perform workspace.save_rlc_priority_rule(member,payload,(second_saved->>'updated_at')::timestamptz); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Viewer saved a rule'; end if;
  execute 'reset role';
  update workspace.system_users set permissions=jsonb_set(permissions,'{workspaceAccess,material-requests}','"none"'::jsonb) where id=member;
  execute 'set local role authenticated';
  if rlc_priority_private.has_access(false) or rlc_priority_private.has_access(true) or exists(select 1 from workspace.rlc_priority_rules where id=(saved->>'id')::uuid) then raise exception 'Explicit revocation did not override legacy edit'; end if;

  execute 'reset role';
  update workspace.system_users set permissions=(permissions-'workspaceAccess')||'{"pagePermissions":["data_center_view"]}'::jsonb where id=member;
  execute 'set local role authenticated';
  if not rlc_priority_private.has_access(false) or rlc_priority_private.has_access(true) then raise exception 'Legacy view fallback is wrong'; end if;
  execute 'reset role';
  update workspace.system_users set permissions=(permissions-'workspaceAccess')||'{"pagePermissions":["data_center_edit"]}'::jsonb where id=member;
  execute 'set local role authenticated';
  if not rlc_priority_private.has_access(false) or not rlc_priority_private.has_access(true) then raise exception 'Legacy edit fallback is wrong'; end if;
  perform workspace.save_rlc_priority_rule(member,payload||'{"notes":"legacy edit probe"}'::jsonb,(second_saved->>'updated_at')::timestamptz);

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  execute 'set local role authenticated';
  if rlc_priority_private.has_access(false) or rlc_priority_private.has_access(true) or exists(select 1 from workspace.rlc_priority_rules) then raise exception 'Unmapped session can access rules'; end if;
  execute 'reset role';
  execute 'set local role anon';
  denied := false;
  begin perform count(*) from workspace.rlc_priority_rules; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous role can read rules'; end if;
  execute 'reset role';
  raise notice 'RLC rollback probes passed: stamps, CAS, actor, project, values, identity, RLS explicit/legacy access, unmapped session and anon';
end;
$probe$;
rollback;
