-- PENDING assessment only. Not applied. Sole object change: revoke anon privileges on workspace.tasks.
begin;
set local lock_timeout='1s';
set local statement_timeout='5s';
do $preflight$
begin
  if not exists(select 1 from pg_class c where c.oid='workspace.tasks'::regclass and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='853d6eaddeaaed36fb175cd761498a5d') then raise exception 'Tasks ACL/owner/RLS/policy drift'; end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.tasks'::regclass and attacl is not null) or exists(select 1 from pg_auth_members where member='anon'::regrole) then raise exception 'Tasks column grant or role inheritance drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.tasks'::regclass and not tgisinternal) then raise exception 'Tasks business trigger drift'; end if;
  if (select count(*) from pg_constraint where conrelid='workspace.tasks'::regclass and contype<>'n')<>2 or not exists(select 1 from pg_constraint where conrelid='workspace.tasks'::regclass and conname='tasks_column_id_fkey' and pg_get_constraintdef(oid)='FOREIGN KEY (column_id) REFERENCES workspace.columns(id) ON DELETE SET NULL') or exists(select 1 from pg_constraint where confrelid='workspace.tasks'::regclass) then raise exception 'Tasks foreign-key dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.tasks'::regclass) then raise exception 'Tasks view dependency drift'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public') and p.prokind='f' and p.prosrc ~ E'\\mtasks\\M') then raise exception 'Tasks function dependency drift'; end if;
  if (select count(*) from pg_publication_tables where schemaname='workspace' and tablename='tasks')<>1 or not exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='tasks' and pubname='supabase_realtime' and rowfilter is null) then raise exception 'Tasks publication drift'; end if;
  if exists(select 1 from realtime.subscription where entity='workspace.tasks'::regclass and claims_role='anon'::regrole) then raise exception 'Tasks has a current anonymous Realtime subscriber'; end if;
end
$preflight$;
revoke all privileges on table workspace.tasks from anon;
do $postcheck$
begin
  if not exists(select 1 from pg_class c where c.oid='workspace.tasks'::regclass and c.relkind='r' and c.relowner='postgres'::regrole and c.relrowsecurity and not c.relforcerowsecurity
    and c.relacl @> '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and c.relacl <@ '{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'::aclitem[] and md5(coalesce((select string_agg(p.polname||':'||p.polcmd::text||':'||p.polpermissive::text||':'||p.polroles::text||':'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),E'\n' order by p.polname) from pg_policy p where p.polrelid=c.oid),''))='853d6eaddeaaed36fb175cd761498a5d') then raise exception 'Tasks ACL/owner/RLS/policy drift'; end if;
  if exists(select 1 from pg_attribute where attrelid='workspace.tasks'::regclass and attacl is not null) or exists(select 1 from pg_auth_members where member='anon'::regrole) then raise exception 'Tasks column grant or role inheritance drift'; end if;
  if exists(select 1 from pg_trigger where tgrelid='workspace.tasks'::regclass and not tgisinternal) then raise exception 'Tasks business trigger drift'; end if;
  if (select count(*) from pg_constraint where conrelid='workspace.tasks'::regclass and contype<>'n')<>2 or not exists(select 1 from pg_constraint where conrelid='workspace.tasks'::regclass and conname='tasks_column_id_fkey' and pg_get_constraintdef(oid)='FOREIGN KEY (column_id) REFERENCES workspace.columns(id) ON DELETE SET NULL') or exists(select 1 from pg_constraint where confrelid='workspace.tasks'::regclass) then raise exception 'Tasks foreign-key dependency drift'; end if;
  if exists(select 1 from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_depend d on d.objid=r.oid where v.relkind in ('v','m') and d.refobjid='workspace.tasks'::regclass) then raise exception 'Tasks view dependency drift'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('workspace','public') and p.prokind='f' and p.prosrc ~ E'\\mtasks\\M') then raise exception 'Tasks function dependency drift'; end if;
  if (select count(*) from pg_publication_tables where schemaname='workspace' and tablename='tasks')<>1 or not exists(select 1 from pg_publication_tables where schemaname='workspace' and tablename='tasks' and pubname='supabase_realtime' and rowfilter is null) then raise exception 'Tasks publication drift'; end if;
  if exists(select 1 from realtime.subscription where entity='workspace.tasks'::regclass and claims_role='anon'::regrole) then raise exception 'Tasks has a current anonymous Realtime subscriber'; end if;
  if has_table_privilege('anon','workspace.tasks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege('anon','workspace.tasks','SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Tasks anonymous access remains'; end if;
end
$postcheck$;
commit;
