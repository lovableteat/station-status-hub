-- PENDING: isolated proposal only. Not applied to production.
-- Changes only anon table ACL; retains policies, functions, authenticated/service rights and every row.
begin;
set local lock_timeout='1s';
set local statement_timeout='5s';
do $preflight$
begin
  if not exists (select 1 from pg_class c where c.oid='workspace.login_audit'::regclass
    and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[]
    and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='de4a6e91683ea575dc2f878a66fc5c22') then
    raise exception 'Preflight failed: login_audit ACL, policy, owner or RLS drift';
  end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.login_audit'::regclass and attacl is not null) then
    raise exception 'Preflight failed: unexpected column grant';
  end if;
  if exists(select 1 from pg_auth_members where member='anon'::regrole) then
    raise exception 'Preflight failed: anonymous role membership drift';
  end if;
  if not exists(select 1 from pg_proc where oid='authenticate_user(text,text)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='0ba66b8eb20265ef66d2d1d6052d0455') then raise exception 'Preflight failed: authenticate_user(text,text) definition or execution context drift'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.authenticate_user(text,text)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='582dafb5a2161b8c5326f8a2231a83f3') then raise exception 'Preflight failed: workspace.authenticate_user(text,text) definition or execution context drift'; end if;
end
$preflight$;
revoke all privileges on table workspace.login_audit from anon;
do $postcheck$
begin
  if not exists (select 1 from pg_class c where c.oid='workspace.login_audit'::regclass
    and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[]
    and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='de4a6e91683ea575dc2f878a66fc5c22') then
    raise exception 'Preflight failed: login_audit ACL, policy, owner or RLS drift';
  end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.login_audit'::regclass and attacl is not null) then
    raise exception 'Preflight failed: unexpected column grant';
  end if;
  if exists(select 1 from pg_auth_members where member='anon'::regrole) then
    raise exception 'Preflight failed: anonymous role membership drift';
  end if;
  if not exists(select 1 from pg_proc where oid='authenticate_user(text,text)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='0ba66b8eb20265ef66d2d1d6052d0455') then raise exception 'Preflight failed: authenticate_user(text,text) definition or execution context drift'; end if;
  if not exists(select 1 from pg_proc where oid='workspace.authenticate_user(text,text)'::regprocedure and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))='582dafb5a2161b8c5326f8a2231a83f3') then raise exception 'Preflight failed: workspace.authenticate_user(text,text) definition or execution context drift'; end if;
  if has_table_privilege('anon','workspace.login_audit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege('anon','workspace.login_audit','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Anonymous access remains'; end if;
end
$postcheck$;
commit;
