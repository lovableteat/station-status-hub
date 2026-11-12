-- PREPARED ONLY. Narrow ACL-only containment. Never call a production delete RPC for verification.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '10s';
do $preflight$
declare expected record; target oid;
begin
  if exists (select 1 from pg_stat_activity where pid<>pg_backend_pid() and state='active' and query ~* 'delete_test_system[[:space:]]*\(' and query not ilike '%pg_proc%' and query not ilike '%pg_stat_activity%' and query not ilike '%pg_stat_statements%') then
    raise exception 'Machine deletion is currently running; postpone ACL cutover';
  end if;
  for expected in select * from (values
    ('public.delete_test_system(uuid)','7f04cca4183be291d0917083a0369337','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('workspace.delete_test_system(uuid)','923d91902c8261ee54e85278006e03c1','{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
  ) as reviewed(signature, definition_md5, acl) loop
    target := to_regprocedure(expected.signature);
    if target is null then raise exception 'Missing reviewed RPC: %',expected.signature; end if;
    if not exists (select 1 from pg_proc where oid=target and md5(pg_get_functiondef(oid))=expected.definition_md5 and proacl::text=expected.acl and proowner='postgres'::regrole and prosecdef) then
      raise exception 'Reviewed RPC metadata drift: %',expected.signature;
    end if;
    if not has_function_privilege('authenticated',target,'execute') or not has_function_privilege('service_role',target,'execute') then
      raise exception 'Existing caller privilege missing: %',expected.signature;
    end if;
  end loop;
end;
$preflight$;
revoke execute on function public.delete_test_system(uuid),workspace.delete_test_system(uuid) from public,anon;
do $postflight$
declare signature text; target oid;
begin
  foreach signature in array array['public.delete_test_system(uuid)','workspace.delete_test_system(uuid)'] loop
    target := to_regprocedure(signature);
    if not exists (select 1 from pg_proc where oid=target and proowner='postgres'::regrole and prosecdef and md5(pg_get_functiondef(oid))=case signature when 'public.delete_test_system(uuid)' then '7f04cca4183be291d0917083a0369337' else '923d91902c8261ee54e85278006e03c1' end) then
      raise exception 'Function definition or owner changed: %',signature;
    end if;
    if has_function_privilege('anon',target,'execute') or exists (select 1 from pg_proc p,lateral aclexplode(p.proacl) a where p.oid=target and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Anonymous EXECUTE remains: %',signature;
    end if;
    if not has_function_privilege('authenticated',target,'execute') or not has_function_privilege('service_role',target,'execute') or not has_function_privilege('postgres',target,'execute') then
      raise exception 'Existing caller privilege lost: %',signature;
    end if;
  end loop;
end;
$postflight$;
notify pgrst, 'reload schema';
commit;
