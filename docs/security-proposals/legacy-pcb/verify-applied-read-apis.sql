-- Read-only check of the already-applied additive APIs and four immutable ledgers.
-- Not a migration: never submit to apply_migration or use to bypass later gates.
-- Does not read account/PCB content, call either API, or assume raw access closed.
BEGIN READ ONLY;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='10s';
DO $applied_legacy_pcb_ledger$
DECLARE expected record;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'Applied legacy PCB ledger missing';
 END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('20261112001122','restrict_internal_stats_cleanup_execution',3793,'80133f087d07ad6c7766cb8a67f7a9d3'),
  ('20261112013540','restrict_anonymous_delete_test_system_execution',3036,'b8a346e30aaa288e5c053addb576ef3f'),
  ('20261112022029','restrict_anonymous_login_audit_access',4521,'d1340d27f2186395010ffe6f9ba0de58'),
  ('20261112064452','add_protected_profile_and_legacy_pcb_read_apis',42759,'ad9bd1f1d425fed402deee5074f08d8d')
 ) AS x(version,name,statement_bytes,statement_md5) LOOP
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations m
   WHERE m.version=expected.version AND m.name=expected.name
    AND cardinality(m.statements)=1
    AND octet_length(m.statements[1])=expected.statement_bytes
    AND md5(m.statements[1])=expected.statement_md5)<>1 THEN
   RAISE EXCEPTION 'Applied legacy PCB ledger mismatch: %',expected.version;
  END IF;
 END LOOP;
END;
$applied_legacy_pcb_ledger$;
DO $legacy_api_postflight$
DECLARE target oid; expected record;
BEGIN
 -- Only these exact workspace zero-argument identities may have the API names.
 -- Reject overloads/aliases even when their source does not mention the table.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','workspace')
   AND p.proname IN ('list_system_user_profiles','load_pcb_designer_legacy_workspace')
   AND p.oid NOT IN (coalesce(to_regprocedure('workspace.list_system_user_profiles()'),0::oid),
    coalesce(to_regprocedure('workspace.load_pcb_designer_legacy_workspace()'),0::oid))) THEN
  RAISE EXCEPTION 'Legacy PCB API drift: unexpected name or overload collision';
 END IF;
 FOR expected IN SELECT * FROM jsonb_to_recordset('[{"name":"list_system_user_profiles","body_md5":"fdfdf63dda67901eabef3676ea0cc02c"},{"name":"load_pcb_designer_legacy_workspace","body_md5":"5a2bdec176bd154e5d99bf20ce7b2091"}]'::jsonb) AS x(name text,body_md5 text) LOOP
  target:=to_regprocedure('workspace.'||expected.name||'()');
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=target AND p.proowner='postgres'::regrole
   AND p.prokind='f' AND p.pronargs=0 AND pg_get_function_identity_arguments(p.oid)=''
   AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""']::text[] AND md5(p.prosrc)=expected.body_md5
   AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[])
   OR has_function_privilege('anon',target,'execute') OR has_function_privilege('service_role',target,'execute') THEN
   RAISE EXCEPTION 'Legacy PCB API drift: %',expected.name;
  END IF;
 END LOOP;
END;
$legacy_api_postflight$;
SELECT 'applied_legacy_pcb_apis_verified' AS status;
COMMIT;
