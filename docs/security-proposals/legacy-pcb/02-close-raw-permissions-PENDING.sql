-- PENDING, FAIL-CLOSED RELEASE GATE. Not apply-ready.
-- Order: additive APIs -> compatible clients -> twelve-RPC candidate -> this stage.
-- Only authenticated SELECT(permissions) is removed. No data is moved or rewritten.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='5s';
-- BEGIN FIXED RELEASE GATE: retain until separately reviewed release evidence.
DO $legacy_pcb_release_gate$
BEGIN
 RAISE EXCEPTION 'Legacy PCB enforcement remains pending: old clients, Realtime OLD/NEW filtering, private/dynamic return paths and hosted compatibility must be verified';
END;
$legacy_pcb_release_gate$;
-- END FIXED RELEASE GATE
-- Read-only catalog checks. No account, snapshot, or PCB content is selected.
DO $legacy_pcb_baseline$
DECLARE expected record; actual jsonb; target oid;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'Legacy PCB baseline: applied migration ledger missing';
 END IF;
 FOR expected IN SELECT * FROM jsonb_to_recordset('[{"version":"20261112001122","name":"restrict_internal_stats_cleanup_execution","md5":"80133f087d07ad6c7766cb8a67f7a9d3"},{"version":"20261112013540","name":"restrict_anonymous_delete_test_system_execution","md5":"b8a346e30aaa288e5c053addb576ef3f"},{"version":"20261112022029","name":"restrict_anonymous_login_audit_access","md5":"d1340d27f2186395010ffe6f9ba0de58"}]'::jsonb) AS x(version text,name text,md5 text) LOOP
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m
   WHERE m.version=expected.version AND m.name=expected.name
   AND cardinality(m.statements)=1 AND md5(m.statements[1])=expected.md5) THEN
   RAISE EXCEPTION 'Legacy PCB baseline: immutable applied ledger mismatch: %',expected.version;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Legacy PCB baseline: API role inheritance or bypass drift';
 END IF;
 target:=to_regclass('workspace.system_users');
 IF target IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=target AND relrowsecurity
  AND relkind='r' AND relowner='postgres'::regrole AND NOT relforcerowsecurity) THEN
  RAISE EXCEPTION 'Legacy PCB baseline: system_users ownership or RLS drift';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull) ORDER BY a.attnum)
 INTO actual FROM pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped;
 IF actual IS DISTINCT FROM '[{"name":"id","type":"uuid","not_null":true},{"name":"username","type":"character varying(50)","not_null":true},{"name":"password_hash","type":"character varying(255)","not_null":true},{"name":"role","type":"character varying(20)","not_null":true},{"name":"permissions","type":"jsonb","not_null":false},{"name":"status","type":"character varying(20)","not_null":false},{"name":"created_by","type":"character varying(50)","not_null":false},{"name":"created_at","type":"timestamp with time zone","not_null":true},{"name":"updated_at","type":"timestamp with time zone","not_null":true},{"name":"display_name","type":"character varying(100)","not_null":false},{"name":"auth_user_id","type":"uuid","not_null":false},{"name":"auth_migrated_at","type":"timestamp with time zone","not_null":false},{"name":"last_seen_at","type":"timestamp with time zone","not_null":false},{"name":"registration_requested_at","type":"timestamp with time zone","not_null":false},{"name":"approved_at","type":"timestamp with time zone","not_null":false},{"name":"approved_by","type":"uuid","not_null":false},{"name":"avatar_path","type":"text","not_null":false}]'::jsonb THEN
  RAISE EXCEPTION 'Legacy PCB baseline: exact system_users columns/types/nullability changed';
 END IF;
 IF has_table_privilege('anon',target,'select') OR has_table_privilege('authenticated',target,'select')
  OR has_column_privilege('anon',target,'permissions','select')
  OR has_column_privilege('anon',target,'password_hash','select')
  OR has_column_privilege('authenticated',target,'password_hash','select')
  OR has_column_privilege('authenticated',target,'permissions','update')
  OR has_column_privilege('authenticated',target,'auth_user_id','update') THEN
  RAISE EXCEPTION 'Legacy PCB baseline: unexpected raw table/password/write access';
 END IF;
 IF ARRAY(SELECT acl::text FROM pg_class c, LATERAL unnest(c.relacl) acl WHERE c.oid=target ORDER BY acl::text) IS DISTINCT FROM ARRAY['postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']::text[] THEN
  RAISE EXCEPTION 'Legacy PCB baseline: table ACL drift';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('policyname',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) ORDER BY policyname)
 INTO actual FROM pg_policies WHERE schemaname='workspace' AND tablename='system_users';
 IF actual IS DISTINCT FROM '[{"policyname":"system_users_authenticated_read","permissive":"PERMISSIVE","roles":["authenticated"],"cmd":"SELECT","qual":"(workspace.current_system_user_id() IS NOT NULL)","with_check":null}]'::jsonb THEN
  RAISE EXCEPTION 'Legacy PCB baseline: system_users policy drift';
 END IF;
 IF NOT has_schema_privilege('authenticated','workspace','usage') THEN
  RAISE EXCEPTION 'Legacy PCB baseline: authenticated schema usage missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: current_system_user_id'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.pcb_designer_can_view(uuid)') AND md5(pg_get_functiondef(p.oid))='fc96201eb6adb11d9aca190be3c54d2c' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: pcb_designer_can_view'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_user_has_stored_page_permission(text)') AND md5(pg_get_functiondef(p.oid))='fb1eeed1e06ce9e4992cf14452d666e4' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: current_user_has_stored_page_permission'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.set_user_access_permissions(uuid,page_permission[],jsonb,text)') AND md5(pg_get_functiondef(p.oid))='ea32901d1fed5076b9a9947d018bf941' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: set_user_access_permissions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.can_manage_system_users()') AND md5(pg_get_functiondef(p.oid))='38280a61d6835ba8dfaaff2296eac6e3' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: can_manage_system_users'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.set_user_access_permissions(uuid,page_permission[],jsonb,text,boolean)') AND md5(pg_get_functiondef(p.oid))='1aa74f293e268384080e45ba21c4fa57' AND p.proowner='postgres'::regrole AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Legacy PCB baseline: authorization function changed: set_user_access_permissions'; END IF;

 FOR expected IN SELECT unnest(ARRAY['public.calculate_daily_production_stats()','workspace.calculate_daily_production_stats()',
  'public.cleanup_old_notifications()','workspace.cleanup_old_notifications()']) AS signature LOOP
  target:=to_regprocedure(expected.signature);
  IF target IS NULL OR has_function_privilege('anon',target,'execute') OR has_function_privilege('authenticated',target,'execute')
   OR NOT has_function_privilege('service_role',target,'execute') OR NOT has_function_privilege('postgres',target,'execute')
   OR NOT (SELECT has_schema_privilege('service_role',p.pronamespace,'usage') AND has_schema_privilege('postgres',p.pronamespace,'usage') FROM pg_proc p WHERE p.oid=target) THEN
   RAISE EXCEPTION 'Legacy PCB baseline: applied internal RPC boundary drift';
  END IF;
 END LOOP;
 FOR expected IN SELECT unnest(ARRAY['public.delete_test_system(uuid)','workspace.delete_test_system(uuid)']) AS signature LOOP
  target:=to_regprocedure(expected.signature);
  IF target IS NULL OR has_function_privilege('anon',target,'execute') OR NOT has_function_privilege('authenticated',target,'execute')
   OR NOT has_function_privilege('service_role',target,'execute') OR NOT has_function_privilege('postgres',target,'execute')
   OR NOT (SELECT has_schema_privilege('authenticated',p.pronamespace,'usage') AND has_schema_privilege('service_role',p.pronamespace,'usage') AND has_schema_privilege('postgres',p.pronamespace,'usage') FROM pg_proc p WHERE p.oid=target) THEN
   RAISE EXCEPTION 'Legacy PCB baseline: applied delete RPC boundary drift';
  END IF;
 END LOOP;
 target:=to_regclass('workspace.login_audit');
 IF target IS NULL OR has_table_privilege('anon',target,'select,insert,update,delete,truncate,references,trigger')
  OR has_any_column_privilege('anon',target,'select,insert,update,references')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=target AND relowner='postgres'::regrole AND relrowsecurity)
  OR NOT has_table_privilege('authenticated',target,'select') OR NOT has_table_privilege('service_role',target,'select,insert,update,delete') THEN
  RAISE EXCEPTION 'Legacy PCB baseline: applied login audit boundary drift';
 END IF;
END;
$legacy_pcb_baseline$;
DO $raw_column_preflight$
DECLARE target oid:='workspace.system_users'::regclass; column_row record;
BEGIN
 FOR column_row IN SELECT a.attname,a.attacl FROM pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped LOOP
  IF column_row.attname='password_hash' THEN
   IF column_row.attacl IS NOT NULL THEN RAISE EXCEPTION 'Legacy PCB raw ACL: password column drift'; END IF;
  ELSIF ARRAY(SELECT a::text FROM unnest(column_row.attacl) a ORDER BY a::text) IS DISTINCT FROM ARRAY['authenticated=r/postgres']::text[] THEN
   RAISE EXCEPTION 'Legacy PCB raw ACL: existing column grant changed: %',column_row.attname;
  END IF;
 END LOOP;
END;
$raw_column_preflight$;
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
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at current_system_user_id'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='79a9d13c088e503a9c8658222ca3d611' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='eacd1b11f642cfbe7a99148085610450' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='00cbfb987e1ebc1fd52f7c1b6c6f31c1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='d501033b71b49134522c5cd377cec0b9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='f6a0e6c6e0bf3a4db56702f86fce5eee' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='10ad95ff35662de30f23873ba2e5d7fe' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='715560809078e631886810264d68d704' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='6e9ced322200cce2e64f850ac3ab034b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='73946309b1a685c2f7c85e0d6f12e829' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='aa958078a56c205b4a3707afd0795a9b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='6d9168d17709b75c19c69b4475899a2c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='cf2f4a873566142d01186fc07da94d8d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Preflight failed: API role inheritance'; END IF;
END $preflight$;
DO $legacy_read_surface$
DECLARE expected jsonb := '[
  {
    "schema": "circuit_change_private",
    "name": "record_event",
    "args": "p_item workspace.circuit_change_items, p_type text, p_note text, p_actor uuid",
    "definition_md5": "857e7d720f48d42474c3cc00d3addcdb",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "comparison_feedback_private",
    "name": "create_draft",
    "args": "p_id uuid, p_reporter_id uuid, p_title text, p_description text, p_category text, p_tab text, p_project text, p_context jsonb, p_images jsonb",
    "definition_md5": "417e6c41bb3f0896bbec7a86d27372c2",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "comparison_feedback_private",
    "name": "is_admin",
    "args": "",
    "definition_md5": "531f4e2f4df584d00d4669fc42d9b029",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "maintenance_private",
    "name": "account_access",
    "args": "p_id uuid, p_edit boolean",
    "definition_md5": "8050c502c19a816c82ca6b0c61a4a08d",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "maintenance_private",
    "name": "audit_fault",
    "args": "",
    "definition_md5": "be4a8735536d56323013fdb77aa88f7e",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "authenticate_user",
    "args": "username_input text, password_input text",
    "definition_md5": "0ba66b8eb20265ef66d2d1d6052d0455",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "can_delete_chat_media_object",
    "args": "p_name text",
    "definition_md5": "b2da65b416fc7e9d060a772aa3be6d92",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "can_manage_system_users",
    "args": "",
    "definition_md5": "b31161ad8b74a722bfcf95d2ad6ee1df",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "clear_direct_chat_history",
    "args": "p_thread_id uuid",
    "definition_md5": "766333811552a2a49cc631bc56e8ca53",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "current_system_user_id",
    "args": "",
    "definition_md5": "caac436ac1da43904ffb4be520255d34",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "delete_direct_chat_message",
    "args": "p_message_id uuid",
    "definition_md5": "70ebd180cf6352193de370a6320b08c4",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "get_current_system_user",
    "args": "",
    "definition_md5": "f8f6a8e97747cb6e70a9c2d71f27e70f",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "list_active_collaboration_members",
    "args": "",
    "definition_md5": "90ada8bcdf5e52abac0168e6296babe8",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "list_direct_chat_threads",
    "args": "",
    "definition_md5": "931972016f7504f0845135caa6c37095",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "register_system_user",
    "args": "username_input text, password_input text, display_name_input text",
    "definition_md5": "5c927db2f81977f588fcdd6218e3a7c2",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "set_own_avatar_path",
    "args": "p_avatar_path text",
    "definition_md5": "64d660c22f3e6cf532e725a0bb47a024",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "start_direct_chat",
    "args": "p_other_user_id uuid",
    "definition_md5": "aa9684f490106e895d3e504fcb44e6c0",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "test_plan_current_system_user_id",
    "args": "",
    "definition_md5": "762de898a09ccf26a015fb4feaf79943",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "test_plan_current_user_can",
    "args": "action text",
    "definition_md5": "3869b22b4503723aee4aa67b6e50e025",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "rlc_priority_private",
    "name": "has_access",
    "args": "p_edit boolean",
    "definition_md5": "02cca055f23186b86e424fe1a9e694fc",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "supplier_directory_private",
    "name": "is_admin",
    "args": "",
    "definition_md5": "7876c66c6d95aacc5c69b0825f59d0fc",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "acquire_pcb_designer_project_lock",
    "args": "p_user_id uuid, p_project_id text, p_project_name text, p_editor_client_id text, p_lease_seconds integer",
    "definition_md5": "79a9d13c088e503a9c8658222ca3d611",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "approve_system_user",
    "args": "p_user_id uuid",
    "definition_md5": "fc6c2407be66e5a36df0b29e157b1a86",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "authorize_system_user_admin_sync",
    "args": "p_user_id uuid",
    "definition_md5": "cb31d1100a1736fe67b6abecf40a824d",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_delete_chat_media_object",
    "args": "p_name text",
    "definition_md5": "ab684aba9d3c41395e2b4a9d86af09de",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_edit_data_center_projects",
    "args": "",
    "definition_md5": "96e27bc397b7219e69bcc943ddba97a0",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_manage_performance_record",
    "args": "p_employee_id text, p_reviewer_name text, p_scopes uuid[]",
    "definition_md5": "145ce2027e8499e9df071316f1558510",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_manage_system_users",
    "args": "",
    "definition_md5": "38280a61d6835ba8dfaaff2296eac6e3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_read_department_assessment",
    "args": "p_employee uuid, p_scopes uuid[]",
    "definition_md5": "4f97a81b84c9317ce1cc8ce5add4c201",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_read_performance_section_report",
    "args": "p_chief uuid, p_director uuid, p_status text, p_scopes uuid[]",
    "definition_md5": "0a4ca51f8f925a9d49db931cba4d1887",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_view_data_center_projects",
    "args": "",
    "definition_md5": "273e43bc6404ede4981b3bb7546e34ee",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "canonical_performance_employee_name",
    "args": "",
    "definition_md5": "addfcd313abc1a63f40f808a3b0643a5",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "circuit_pdf_save_ai_review",
    "args": "p_series_id text, p_report jsonb, p_expected_revision integer",
    "definition_md5": "7ab4e37a0e3baa890e5beeaa761b7c95",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "circuit_pdf_set_official",
    "args": "p_series_id text, p_document_id text, p_expected_revision integer",
    "definition_md5": "ef5ede5d0e7204e72cc763b3a5162f98",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "clear_direct_chat_history",
    "args": "p_thread_id uuid",
    "definition_md5": "c5a07a0bf513bcb1093df769fab95787",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "create_system_user_admin_profile",
    "args": "p_username text, p_password_hash text, p_role text, p_status text, p_display_name text",
    "definition_md5": "04a836c896f7bda6010e00d34a6137d4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_system_user_id",
    "args": "",
    "definition_md5": "ab7dcd6483326e5ba97480e54c4a289e",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_can_workspace",
    "args": "p_workspace text, p_action text",
    "definition_md5": "7d51fd80cbe37ade6dd9362b605d2765",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_has_stored_page_permission",
    "args": "p_permission text",
    "definition_md5": "fb1eeed1e06ce9e4992cf14452d666e4",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_is_performance_employee",
    "args": "p_employee_id text",
    "definition_md5": "4620616629cadde8586a3f1d1114d1a4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_is_performance_manager",
    "args": "",
    "definition_md5": "f9fac89dafa130f6a324d96bb4d61753",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "delete_direct_chat_message",
    "args": "p_message_id uuid",
    "definition_md5": "1a3ab9b744bd08e082e0d2db9c22502f",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "delete_system_user_admin_profile",
    "args": "p_user_id uuid",
    "definition_md5": "aaa96d015fb8bca835ef7760b3cd5e99",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "ensure_performance_return_notification",
    "args": "p_review_id text",
    "definition_md5": "5b2f59ad4a0fc871635c31f5a44fc3e5",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_current_system_user",
    "args": "",
    "definition_md5": "83cedc00f39d586a734e43f5b1f8b8d8",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_assessment",
    "args": "p_review_id text, p_cycle_id text",
    "definition_md5": "de33c93a472ab118b2774f1e60a2b3ac",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_assessments",
    "args": "p_cycle_id text",
    "definition_md5": "9a7a28a0503d0c10da5d3b23f362e3ef",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_progress",
    "args": "p_cycle_id text",
    "definition_md5": "c8bc705e2bc15cdac39f02f895784d49",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_results",
    "args": "p_cycle_id text",
    "definition_md5": "cc4b7b54981ecdbb03c41f6fbd284ee3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_group_locks",
    "args": "",
    "definition_md5": "f2119328d58bcbce5a70b8404d00487a",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_organization",
    "args": "",
    "definition_md5": "691f81d205c1d850fd366b50f3e837f3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_section_reports",
    "args": "p_cycle_id text",
    "definition_md5": "0bd2f5e8ee820c9fc452561fb2e3bf5b",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_self_context",
    "args": "",
    "definition_md5": "38f90efa4b6f175403f068b1ebd41c9c",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "guard_performance_review_self_update",
    "args": "",
    "definition_md5": "fd94432e62757d435dd0bec85e0942a5",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "list_active_collaboration_members",
    "args": "",
    "definition_md5": "2f84ee913da4ec2ff05263b5ef7fd236",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "list_direct_chat_threads",
    "args": "",
    "definition_md5": "52bbb225bcc521d59f0e1855305031d8",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "load_pcb_designer_project_lock",
    "args": "p_user_id uuid, p_project_id text",
    "definition_md5": "f6a0e6c6e0bf3a4db56702f86fce5eee",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_add_note",
    "args": "p_issue_id uuid, p_message_id uuid, p_body text",
    "definition_md5": "4550da71d81a75210a17b67d2bc231c2",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_update_fault",
    "args": "p_issue_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb",
    "definition_md5": "19682935765ee003526270dde959eb46",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_workspace",
    "args": "p_project_id uuid",
    "definition_md5": "91e83b9aa2143bac9b4b4649961beb31",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "pcb_designer_can_edit",
    "args": "p_user_id uuid",
    "definition_md5": "c5b602b3363c8c4102c2e69c77e0dc09",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "pcb_designer_can_view",
    "args": "p_user_id uuid",
    "definition_md5": "fc96201eb6adb11d9aca190be3c54d2c",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "register_system_user",
    "args": "username_input text, password_input text, display_name_input text",
    "definition_md5": "58ab9a62ffe147767bbc6a3ce6dda9e8",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "remove_performance_organization_member",
    "args": "p_employee_id uuid, p_expected_updated_at timestamp with time zone",
    "definition_md5": "2491d76ab40368b86aa220b85295d71a",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "resolve_performance_employee",
    "args": "p_identifier text",
    "definition_md5": "6cc38bf02c4ccb4eb93482a5f54f6f2b",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "review_performance_section_report_v2",
    "args": "p_id uuid, p_action text, p_feedback text, p_attachments jsonb, p_expected_updated_at timestamp with time zone",
    "definition_md5": "01c0458859817738d39400deba2f516e",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "save_performance_organization_member",
    "args": "p_employee_id uuid, p_manager_id uuid, p_department text, p_job_title text, p_expected_updated_at timestamp with time zone, p_performance_role text, p_org_level text, p_section text",
    "definition_md5": "6447aa629ef36258ee2c0b988cb46406",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "save_performance_section_report",
    "args": "p_cycle_id text, p_summary text, p_submit boolean, p_expected_updated_at timestamp with time zone",
    "definition_md5": "10227e4e0bfbde048fbfae8ea1d95e2b",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "search_maintenance_knowledge",
    "args": "p_query text, p_project_ids uuid[], p_limit integer, p_workspace text",
    "definition_md5": "abc82e6b802901322fd7f2a40c3ca5b2",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_own_avatar_path",
    "args": "p_avatar_path text",
    "definition_md5": "aa5e6eff52935d4e1cb898f3c39c6068",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_performance_group_password",
    "args": "p_password text, p_current_password text",
    "definition_md5": "47ea6e071d37591da9830f240e1219aa",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_user_access_permissions",
    "args": "p_user_id uuid, p_permissions page_permission[], p_workspace_access jsonb, p_granted_by text, p_performance_manager boolean",
    "definition_md5": "1aa74f293e268384080e45ba21c4fa57",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "start_direct_chat",
    "args": "p_other_user_id uuid",
    "definition_md5": "4e19c25b763484e917a3048bf66572dd",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "sync_performance_review_org_manager",
    "args": "",
    "definition_md5": "181266303418c2e440c4270dffc52dd9",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_system_user_id",
    "args": "",
    "definition_md5": "04399e2b7e0467167cfd4a0f2da417db",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can",
    "args": "action text",
    "definition_md5": "db290932876baa72c62430bc583958c6",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can_access_space",
    "args": "target_space_id uuid, action text",
    "definition_md5": "bab2d209e497d83c29d0248c6a5f72f4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can_manage_storage_object",
    "args": "object_name text",
    "definition_md5": "13dc2d1312eadb5d1771ddaa50927383",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "update_system_user_admin_profile",
    "args": "p_user_id uuid, p_username text, p_password_hash text, p_role text, p_status text, p_display_name text",
    "definition_md5": "91c8262e67c32fa1773d52711e15ffa5",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  }
]'::jsonb;
BEGIN
 -- Any new/changed function that directly references system_users is a stop,
 -- including functions outside exposed schemas. Metadata allowlisting is NOT
 -- a replacement for reviewing private/dynamic sources; the release gate remains.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema')
   AND p.prosrc ~* '\msystem_users\M'
   AND p.oid NOT IN (coalesce(to_regprocedure('workspace.list_system_user_profiles()'),0::oid),
    coalesce(to_regprocedure('workspace.load_pcb_designer_legacy_workspace()'),0::oid))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e
    WHERE e->>'schema'=n.nspname AND e->>'name'=p.proname
     AND e->>'args'=pg_get_function_identity_arguments(p.oid)
     AND e->>'definition_md5'=md5(pg_get_functiondef(p.oid))
     AND e->'acl'=to_jsonb(ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)))) THEN
  RAISE EXCEPTION 'Legacy PCB read surface: unknown or changed system_users function';
 END IF;
 -- A view/materialized view may read a column under its owner's identity.
 -- Reject even an identity-only new dependency until its scope is reviewed.
 IF EXISTS(WITH RECURSIVE dependents(oid) AS (
  SELECT 'workspace.system_users'::regclass::oid
  UNION SELECT r.ev_class FROM dependents d JOIN pg_depend dep ON dep.refobjid=d.oid
   AND dep.refclassid='pg_class'::regclass JOIN pg_rewrite r ON r.oid=dep.objid
   AND dep.classid='pg_rewrite'::regclass
 ) SELECT 1 FROM dependents d JOIN pg_class c ON c.oid=d.oid
   WHERE c.relkind IN ('v','m') AND c.oid<>'workspace.system_users'::regclass) THEN
  RAISE EXCEPTION 'Legacy PCB read surface: unreviewed dependent view or materialized view';
 END IF;
END;
$legacy_read_surface$;
CREATE TEMP TABLE legacy_pcb_before_acl ON COMMIT DROP AS
 SELECT c.relacl::text AS relation_acl,a.attname,a.attacl::text AS column_acl
 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE c.oid='workspace.system_users'::regclass AND a.attnum>0 AND NOT a.attisdropped;
REVOKE SELECT(permissions) ON workspace.system_users FROM authenticated;
DO $raw_column_postflight$
DECLARE target oid:='workspace.system_users'::regclass;
BEGIN
 IF has_column_privilege('authenticated',target,'permissions','select')
  OR has_column_privilege('anon',target,'permissions','select') THEN
  RAISE EXCEPTION 'Legacy PCB enforcement: raw permissions still readable';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
  JOIN pg_temp.legacy_pcb_before_acl b ON b.attname=a.attname
  WHERE c.oid=target AND (c.relacl::text IS DISTINCT FROM b.relation_acl
   OR (a.attname<>'permissions' AND a.attacl::text IS DISTINCT FROM b.column_acl))) THEN
  RAISE EXCEPTION 'Legacy PCB enforcement: unrelated table/column grants changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute a, LATERAL aclexplode(a.attacl) acl
  WHERE a.attrelid=target AND a.attname='permissions' AND acl.grantee IN (0,'anon'::regrole,'authenticated'::regrole)) THEN
  RAISE EXCEPTION 'Legacy PCB enforcement: unexpected remaining browser column grant';
 END IF;
END;
$raw_column_postflight$;
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
DO $preflight$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.current_system_user_id()') AND md5(pg_get_functiondef(p.oid))='ab7dcd6483326e5ba97480e54c4a289e' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at current_system_user_id'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.acquire_pcb_designer_project_lock(uuid,text,text,text,integer)') AND md5(pg_get_functiondef(p.oid))='79a9d13c088e503a9c8658222ca3d611' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at acquire_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.delete_pcb_designer_project_locked(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='eacd1b11f642cfbe7a99148085610450' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at delete_pcb_designer_project_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.list_pcb_designer_model_assets(uuid)') AND md5(pg_get_functiondef(p.oid))='00cbfb987e1ebc1fd52f7c1b6c6f31c1' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at list_pcb_designer_model_assets'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_model_asset(uuid,text)') AND md5(pg_get_functiondef(p.oid))='d501033b71b49134522c5cd377cec0b9' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_project_lock(uuid,text)') AND md5(pg_get_functiondef(p.oid))='f6a0e6c6e0bf3a4db56702f86fce5eee' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace(uuid)') AND md5(pg_get_functiondef(p.oid))='10ad95ff35662de30f23873ba2e5d7fe' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.load_pcb_designer_workspace_shared(uuid)') AND md5(pg_get_functiondef(p.oid))='715560809078e631886810264d68d704' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at load_pcb_designer_workspace_shared'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.release_pcb_designer_project_lock(uuid,text,text)') AND md5(pg_get_functiondef(p.oid))='6e9ced322200cce2e64f850ac3ab034b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at release_pcb_designer_project_lock'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_model_asset(uuid,text,jsonb,text)') AND md5(pg_get_functiondef(p.oid))='73946309b1a685c2f7c85e0d6f12e829' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_model_asset'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='aa958078a56c205b4a3707afd0795a9b' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_locked(uuid,text,text,jsonb)') AND md5(pg_get_functiondef(p.oid))='6d9168d17709b75c19c69b4475899a2c' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_locked'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('workspace.save_pcb_designer_workspace_shared(uuid,jsonb)') AND md5(pg_get_functiondef(p.oid))='cf2f4a873566142d01186fc07da94d8d' AND pg_get_userbyid(p.proowner)='postgres' AND ARRAY(SELECT x::text FROM unnest(p.proacl) x ORDER BY x::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]) THEN RAISE EXCEPTION 'Preflight failed: function definition, owner or ACL drift at save_pcb_designer_workspace_shared'; END IF;
 IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Preflight failed: API role inheritance'; END IF;
END $preflight$;
DO $legacy_read_surface$
DECLARE expected jsonb := '[
  {
    "schema": "circuit_change_private",
    "name": "record_event",
    "args": "p_item workspace.circuit_change_items, p_type text, p_note text, p_actor uuid",
    "definition_md5": "857e7d720f48d42474c3cc00d3addcdb",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "comparison_feedback_private",
    "name": "create_draft",
    "args": "p_id uuid, p_reporter_id uuid, p_title text, p_description text, p_category text, p_tab text, p_project text, p_context jsonb, p_images jsonb",
    "definition_md5": "417e6c41bb3f0896bbec7a86d27372c2",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "comparison_feedback_private",
    "name": "is_admin",
    "args": "",
    "definition_md5": "531f4e2f4df584d00d4669fc42d9b029",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "maintenance_private",
    "name": "account_access",
    "args": "p_id uuid, p_edit boolean",
    "definition_md5": "8050c502c19a816c82ca6b0c61a4a08d",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "maintenance_private",
    "name": "audit_fault",
    "args": "",
    "definition_md5": "be4a8735536d56323013fdb77aa88f7e",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "authenticate_user",
    "args": "username_input text, password_input text",
    "definition_md5": "0ba66b8eb20265ef66d2d1d6052d0455",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "can_delete_chat_media_object",
    "args": "p_name text",
    "definition_md5": "b2da65b416fc7e9d060a772aa3be6d92",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "can_manage_system_users",
    "args": "",
    "definition_md5": "b31161ad8b74a722bfcf95d2ad6ee1df",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "clear_direct_chat_history",
    "args": "p_thread_id uuid",
    "definition_md5": "766333811552a2a49cc631bc56e8ca53",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "current_system_user_id",
    "args": "",
    "definition_md5": "caac436ac1da43904ffb4be520255d34",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "delete_direct_chat_message",
    "args": "p_message_id uuid",
    "definition_md5": "70ebd180cf6352193de370a6320b08c4",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "get_current_system_user",
    "args": "",
    "definition_md5": "f8f6a8e97747cb6e70a9c2d71f27e70f",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "list_active_collaboration_members",
    "args": "",
    "definition_md5": "90ada8bcdf5e52abac0168e6296babe8",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "list_direct_chat_threads",
    "args": "",
    "definition_md5": "931972016f7504f0845135caa6c37095",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "register_system_user",
    "args": "username_input text, password_input text, display_name_input text",
    "definition_md5": "5c927db2f81977f588fcdd6218e3a7c2",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "set_own_avatar_path",
    "args": "p_avatar_path text",
    "definition_md5": "64d660c22f3e6cf532e725a0bb47a024",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "start_direct_chat",
    "args": "p_other_user_id uuid",
    "definition_md5": "aa9684f490106e895d3e504fcb44e6c0",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "test_plan_current_system_user_id",
    "args": "",
    "definition_md5": "762de898a09ccf26a015fb4feaf79943",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "public",
    "name": "test_plan_current_user_can",
    "args": "action text",
    "definition_md5": "3869b22b4503723aee4aa67b6e50e025",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "rlc_priority_private",
    "name": "has_access",
    "args": "p_edit boolean",
    "definition_md5": "02cca055f23186b86e424fe1a9e694fc",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "supplier_directory_private",
    "name": "is_admin",
    "args": "",
    "definition_md5": "7876c66c6d95aacc5c69b0825f59d0fc",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "acquire_pcb_designer_project_lock",
    "args": "p_user_id uuid, p_project_id text, p_project_name text, p_editor_client_id text, p_lease_seconds integer",
    "definition_md5": "79a9d13c088e503a9c8658222ca3d611",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "approve_system_user",
    "args": "p_user_id uuid",
    "definition_md5": "fc6c2407be66e5a36df0b29e157b1a86",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "authorize_system_user_admin_sync",
    "args": "p_user_id uuid",
    "definition_md5": "cb31d1100a1736fe67b6abecf40a824d",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_delete_chat_media_object",
    "args": "p_name text",
    "definition_md5": "ab684aba9d3c41395e2b4a9d86af09de",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_edit_data_center_projects",
    "args": "",
    "definition_md5": "96e27bc397b7219e69bcc943ddba97a0",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_manage_performance_record",
    "args": "p_employee_id text, p_reviewer_name text, p_scopes uuid[]",
    "definition_md5": "145ce2027e8499e9df071316f1558510",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_manage_system_users",
    "args": "",
    "definition_md5": "38280a61d6835ba8dfaaff2296eac6e3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_read_department_assessment",
    "args": "p_employee uuid, p_scopes uuid[]",
    "definition_md5": "4f97a81b84c9317ce1cc8ce5add4c201",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_read_performance_section_report",
    "args": "p_chief uuid, p_director uuid, p_status text, p_scopes uuid[]",
    "definition_md5": "0a4ca51f8f925a9d49db931cba4d1887",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "can_view_data_center_projects",
    "args": "",
    "definition_md5": "273e43bc6404ede4981b3bb7546e34ee",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "canonical_performance_employee_name",
    "args": "",
    "definition_md5": "addfcd313abc1a63f40f808a3b0643a5",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "circuit_pdf_save_ai_review",
    "args": "p_series_id text, p_report jsonb, p_expected_revision integer",
    "definition_md5": "7ab4e37a0e3baa890e5beeaa761b7c95",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "circuit_pdf_set_official",
    "args": "p_series_id text, p_document_id text, p_expected_revision integer",
    "definition_md5": "ef5ede5d0e7204e72cc763b3a5162f98",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "clear_direct_chat_history",
    "args": "p_thread_id uuid",
    "definition_md5": "c5a07a0bf513bcb1093df769fab95787",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "create_system_user_admin_profile",
    "args": "p_username text, p_password_hash text, p_role text, p_status text, p_display_name text",
    "definition_md5": "04a836c896f7bda6010e00d34a6137d4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_system_user_id",
    "args": "",
    "definition_md5": "ab7dcd6483326e5ba97480e54c4a289e",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_can_workspace",
    "args": "p_workspace text, p_action text",
    "definition_md5": "7d51fd80cbe37ade6dd9362b605d2765",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_has_stored_page_permission",
    "args": "p_permission text",
    "definition_md5": "fb1eeed1e06ce9e4992cf14452d666e4",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_is_performance_employee",
    "args": "p_employee_id text",
    "definition_md5": "4620616629cadde8586a3f1d1114d1a4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "current_user_is_performance_manager",
    "args": "",
    "definition_md5": "f9fac89dafa130f6a324d96bb4d61753",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "delete_direct_chat_message",
    "args": "p_message_id uuid",
    "definition_md5": "1a3ab9b744bd08e082e0d2db9c22502f",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "delete_system_user_admin_profile",
    "args": "p_user_id uuid",
    "definition_md5": "aaa96d015fb8bca835ef7760b3cd5e99",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "ensure_performance_return_notification",
    "args": "p_review_id text",
    "definition_md5": "5b2f59ad4a0fc871635c31f5a44fc3e5",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_current_system_user",
    "args": "",
    "definition_md5": "83cedc00f39d586a734e43f5b1f8b8d8",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_assessment",
    "args": "p_review_id text, p_cycle_id text",
    "definition_md5": "de33c93a472ab118b2774f1e60a2b3ac",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_assessments",
    "args": "p_cycle_id text",
    "definition_md5": "9a7a28a0503d0c10da5d3b23f362e3ef",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_progress",
    "args": "p_cycle_id text",
    "definition_md5": "c8bc705e2bc15cdac39f02f895784d49",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_department_results",
    "args": "p_cycle_id text",
    "definition_md5": "cc4b7b54981ecdbb03c41f6fbd284ee3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_group_locks",
    "args": "",
    "definition_md5": "f2119328d58bcbce5a70b8404d00487a",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_organization",
    "args": "",
    "definition_md5": "691f81d205c1d850fd366b50f3e837f3",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_section_reports",
    "args": "p_cycle_id text",
    "definition_md5": "0bd2f5e8ee820c9fc452561fb2e3bf5b",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "get_performance_self_context",
    "args": "",
    "definition_md5": "38f90efa4b6f175403f068b1ebd41c9c",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "guard_performance_review_self_update",
    "args": "",
    "definition_md5": "fd94432e62757d435dd0bec85e0942a5",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "list_active_collaboration_members",
    "args": "",
    "definition_md5": "2f84ee913da4ec2ff05263b5ef7fd236",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "list_direct_chat_threads",
    "args": "",
    "definition_md5": "52bbb225bcc521d59f0e1855305031d8",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "load_pcb_designer_project_lock",
    "args": "p_user_id uuid, p_project_id text",
    "definition_md5": "f6a0e6c6e0bf3a4db56702f86fce5eee",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_add_note",
    "args": "p_issue_id uuid, p_message_id uuid, p_body text",
    "definition_md5": "4550da71d81a75210a17b67d2bc231c2",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_update_fault",
    "args": "p_issue_id uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb",
    "definition_md5": "19682935765ee003526270dde959eb46",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "maintenance_workspace",
    "args": "p_project_id uuid",
    "definition_md5": "91e83b9aa2143bac9b4b4649961beb31",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "pcb_designer_can_edit",
    "args": "p_user_id uuid",
    "definition_md5": "c5b602b3363c8c4102c2e69c77e0dc09",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "pcb_designer_can_view",
    "args": "p_user_id uuid",
    "definition_md5": "fc96201eb6adb11d9aca190be3c54d2c",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "register_system_user",
    "args": "username_input text, password_input text, display_name_input text",
    "definition_md5": "58ab9a62ffe147767bbc6a3ce6dda9e8",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "remove_performance_organization_member",
    "args": "p_employee_id uuid, p_expected_updated_at timestamp with time zone",
    "definition_md5": "2491d76ab40368b86aa220b85295d71a",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "resolve_performance_employee",
    "args": "p_identifier text",
    "definition_md5": "6cc38bf02c4ccb4eb93482a5f54f6f2b",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "review_performance_section_report_v2",
    "args": "p_id uuid, p_action text, p_feedback text, p_attachments jsonb, p_expected_updated_at timestamp with time zone",
    "definition_md5": "01c0458859817738d39400deba2f516e",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "save_performance_organization_member",
    "args": "p_employee_id uuid, p_manager_id uuid, p_department text, p_job_title text, p_expected_updated_at timestamp with time zone, p_performance_role text, p_org_level text, p_section text",
    "definition_md5": "6447aa629ef36258ee2c0b988cb46406",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "save_performance_section_report",
    "args": "p_cycle_id text, p_summary text, p_submit boolean, p_expected_updated_at timestamp with time zone",
    "definition_md5": "10227e4e0bfbde048fbfae8ea1d95e2b",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "search_maintenance_knowledge",
    "args": "p_query text, p_project_ids uuid[], p_limit integer, p_workspace text",
    "definition_md5": "abc82e6b802901322fd7f2a40c3ca5b2",
    "acl": [
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_own_avatar_path",
    "args": "p_avatar_path text",
    "definition_md5": "aa5e6eff52935d4e1cb898f3c39c6068",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_performance_group_password",
    "args": "p_password text, p_current_password text",
    "definition_md5": "47ea6e071d37591da9830f240e1219aa",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "set_user_access_permissions",
    "args": "p_user_id uuid, p_permissions page_permission[], p_workspace_access jsonb, p_granted_by text, p_performance_manager boolean",
    "definition_md5": "1aa74f293e268384080e45ba21c4fa57",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "start_direct_chat",
    "args": "p_other_user_id uuid",
    "definition_md5": "4e19c25b763484e917a3048bf66572dd",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "sync_performance_review_org_manager",
    "args": "",
    "definition_md5": "181266303418c2e440c4270dffc52dd9",
    "acl": [
      "postgres=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_system_user_id",
    "args": "",
    "definition_md5": "04399e2b7e0467167cfd4a0f2da417db",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can",
    "args": "action text",
    "definition_md5": "db290932876baa72c62430bc583958c6",
    "acl": [
      "=X/postgres",
      "anon=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can_access_space",
    "args": "target_space_id uuid, action text",
    "definition_md5": "bab2d209e497d83c29d0248c6a5f72f4",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "test_plan_current_user_can_manage_storage_object",
    "args": "object_name text",
    "definition_md5": "13dc2d1312eadb5d1771ddaa50927383",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres"
    ]
  },
  {
    "schema": "workspace",
    "name": "update_system_user_admin_profile",
    "args": "p_user_id uuid, p_username text, p_password_hash text, p_role text, p_status text, p_display_name text",
    "definition_md5": "91c8262e67c32fa1773d52711e15ffa5",
    "acl": [
      "authenticated=X/postgres",
      "postgres=X/postgres"
    ]
  }
]'::jsonb;
BEGIN
 -- Any new/changed function that directly references system_users is a stop,
 -- including functions outside exposed schemas. Metadata allowlisting is NOT
 -- a replacement for reviewing private/dynamic sources; the release gate remains.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema')
   AND p.prosrc ~* '\msystem_users\M'
   AND p.oid NOT IN (coalesce(to_regprocedure('workspace.list_system_user_profiles()'),0::oid),
    coalesce(to_regprocedure('workspace.load_pcb_designer_legacy_workspace()'),0::oid))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) e
    WHERE e->>'schema'=n.nspname AND e->>'name'=p.proname
     AND e->>'args'=pg_get_function_identity_arguments(p.oid)
     AND e->>'definition_md5'=md5(pg_get_functiondef(p.oid))
     AND e->'acl'=to_jsonb(ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)))) THEN
  RAISE EXCEPTION 'Legacy PCB read surface: unknown or changed system_users function';
 END IF;
 -- A view/materialized view may read a column under its owner's identity.
 -- Reject even an identity-only new dependency until its scope is reviewed.
 IF EXISTS(WITH RECURSIVE dependents(oid) AS (
  SELECT 'workspace.system_users'::regclass::oid
  UNION SELECT r.ev_class FROM dependents d JOIN pg_depend dep ON dep.refobjid=d.oid
   AND dep.refclassid='pg_class'::regclass JOIN pg_rewrite r ON r.oid=dep.objid
   AND dep.classid='pg_rewrite'::regclass
 ) SELECT 1 FROM dependents d JOIN pg_class c ON c.oid=d.oid
   WHERE c.relkind IN ('v','m') AND c.oid<>'workspace.system_users'::regclass) THEN
  RAISE EXCEPTION 'Legacy PCB read surface: unreviewed dependent view or materialized view';
 END IF;
END;
$legacy_read_surface$;
NOTIFY pgrst, 'reload schema';
COMMIT;
