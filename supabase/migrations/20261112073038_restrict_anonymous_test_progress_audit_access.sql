-- PENDING: isolated proposal only. Not applied to production.
-- Changes only anon table ACL; retains policies, functions, authenticated/service rights and every row.
begin;
set local lock_timeout='1s';
set local statement_timeout='5s';
do $preflight$
begin
  if not exists (select 1 from pg_class c where c.oid='workspace.test_progress_audit'::regclass
    and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[]
    and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='45aea7988cfc4f1244dc48f55c3a3941') then
    raise exception 'Preflight failed: test_progress_audit ACL, policy, owner or RLS drift';
  end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.test_progress_audit'::regclass and attacl is not null) then
    raise exception 'Preflight failed: unexpected column grant';
  end if;
  if exists(select 1 from pg_auth_members where member='anon'::regrole) then
    raise exception 'Preflight failed: anonymous role membership drift';
  end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468') then raise exception 'Preflight failed: log_test_progress_changes() definition or execution context drift'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2') then raise exception 'Preflight failed: workspace.log_test_progress_changes() definition or execution context drift'; end if;
  if exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='test_progress_audit') then raise exception 'Audit publication drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.test_progress_audit'::regclass and not tgisinternal) or exists(select 1 from pg_constraint where contype='f' and (conrelid='workspace.test_progress_audit'::regclass or confrelid='workspace.test_progress_audit'::regclass)) then raise exception 'Audit trigger/FK dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.test_progress_audit'::regclass) then raise exception 'Audit view dependency drift'; end if;
  if not exists(select 1 from pg_trigger where tgname='log_test_progress_trigger' and tgrelid='workspace.test_progress'::regclass and tgenabled='O' and pg_get_triggerdef(oid)='CREATE TRIGGER log_test_progress_trigger AFTER INSERT OR DELETE OR UPDATE ON workspace.test_progress FOR EACH ROW EXECUTE FUNCTION log_test_progress_changes()') then raise exception 'Audit writer trigger drift'; end if;
  if not exists(select 1 from pg_proc where oid='delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='7f04cca4183be291d0917083a0369337' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: log_test_progress_changes()'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='923d91902c8261ee54e85278006e03c1' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.log_test_progress_changes()'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','workspace') and p.prokind='f' and p.prosrc ilike '%test_progress_audit%' and p.oid not in ('delete_test_system(uuid)'::regprocedure,'log_test_progress_changes()'::regprocedure,'workspace.delete_test_system(uuid)'::regprocedure,'workspace.log_test_progress_changes()'::regprocedure)) then raise exception 'Unexpected audit function dependency'; end if;
end
$preflight$;
revoke all privileges on table workspace.test_progress_audit from anon;
do $postcheck$
begin
  if not exists (select 1 from pg_class c where c.oid='workspace.test_progress_audit'::regclass
    and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[]
    and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='45aea7988cfc4f1244dc48f55c3a3941') then
    raise exception 'Preflight failed: test_progress_audit ACL, policy, owner or RLS drift';
  end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.test_progress_audit'::regclass and attacl is not null) then
    raise exception 'Preflight failed: unexpected column grant';
  end if;
  if exists(select 1 from pg_auth_members where member='anon'::regrole) then
    raise exception 'Preflight failed: anonymous role membership drift';
  end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468') then raise exception 'Preflight failed: log_test_progress_changes() definition or execution context drift'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2') then raise exception 'Preflight failed: workspace.log_test_progress_changes() definition or execution context drift'; end if;
  if has_table_privilege('anon','workspace.test_progress_audit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege('anon','workspace.test_progress_audit','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Anonymous access remains'; end if;
  if exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='test_progress_audit') then raise exception 'Audit publication drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.test_progress_audit'::regclass and not tgisinternal) or exists(select 1 from pg_constraint where contype='f' and (conrelid='workspace.test_progress_audit'::regclass or confrelid='workspace.test_progress_audit'::regclass)) then raise exception 'Audit trigger/FK dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.test_progress_audit'::regclass) then raise exception 'Audit view dependency drift'; end if;
  if not exists(select 1 from pg_trigger where tgname='log_test_progress_trigger' and tgrelid='workspace.test_progress'::regclass and tgenabled='O' and pg_get_triggerdef(oid)='CREATE TRIGGER log_test_progress_trigger AFTER INSERT OR DELETE OR UPDATE ON workspace.test_progress FOR EACH ROW EXECUTE FUNCTION log_test_progress_changes()') then raise exception 'Audit writer trigger drift'; end if;
  if not exists(select 1 from pg_proc where oid='delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='7f04cca4183be291d0917083a0369337' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='4864179770ad9e9ee272a0adae788468' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: log_test_progress_changes()'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.delete_test_system(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='923d91902c8261ee54e85278006e03c1' and proacl @> '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.delete_test_system(uuid)'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.log_test_progress_changes()'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='1f1f1f0649cdfb268ca4f779126458e2' and proacl @> '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[] and proacl <@ '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) then raise exception 'Audit dependency definition/ACL drift: workspace.log_test_progress_changes()'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','workspace') and p.prokind='f' and p.prosrc ilike '%test_progress_audit%' and p.oid not in ('delete_test_system(uuid)'::regprocedure,'log_test_progress_changes()'::regprocedure,'workspace.delete_test_system(uuid)'::regprocedure,'workspace.log_test_progress_changes()'::regprocedure)) then raise exception 'Unexpected audit function dependency'; end if;
end
$postcheck$;
commit;
