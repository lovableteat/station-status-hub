-- Read-only, bounded preflight for the permission-boundary rollout.
-- Run against the intended project and archive the complete output privately.
-- This is the scoped recovery capture for the exact SQL1→SQL2→SQL3 write set.
-- It is not a full database backup and contains no row-level secrets.
begin transaction read only;

select current_database() as database_name,
       current_user as executor,
       current_setting('server_version') as server_version,
       now() as captured_at;

select version, name
from supabase_migrations.schema_migrations
where version >= '20261001203000'
order by version;

select n.nspname as schema_name,
       c.relname as relation_name,
       pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'workspace'
  and c.relname in ('system_users', 'user_page_permissions')
order by c.relname;

select n.nspname as schema_name,
       c.relname as relation_name,
       a.attnum,
       a.attname as column_name,
       a.attacl
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'workspace'
  and c.relname in ('system_users', 'user_page_permissions')
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attnum;

select schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd,
       qual,
       with_check
from pg_policies
where schemaname = 'workspace'
  and tablename in ('system_users', 'user_page_permissions')
order by tablename, policyname;

select n.nspname as schema_name,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proacl,
       md5(pg_get_functiondef(p.oid)) as definition_md5,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'workspace')
  and p.proname in (
    'set_user_access_permissions',
    'can_manage_system_users',
    'can_view_data_center_projects',
    'can_edit_data_center_projects',
    'can_manage_performance_record',
    'can_read_performance_section_report',
    'current_system_user_id',
    'current_user_has_stored_page_permission',
    'approve_system_user',
    'create_system_user_admin_profile',
    'update_system_user_admin_profile',
    'delete_system_user_admin_profile',
    'authorize_system_user_admin_sync'
  )
order by p.proname, n.nspname, identity_arguments;

select source_ns.nspname as source_schema,
       source_proc.proname as source_function,
       pg_get_function_identity_arguments(source_proc.oid) as source_arguments,
       referenced_ns.nspname as referenced_schema,
       referenced_proc.proname as referenced_function,
       pg_get_function_identity_arguments(referenced_proc.oid) as referenced_arguments
from pg_depend dependency
join pg_proc source_proc on source_proc.oid = dependency.objid
join pg_namespace source_ns on source_ns.oid = source_proc.pronamespace
join pg_proc referenced_proc on referenced_proc.oid = dependency.refobjid
join pg_namespace referenced_ns on referenced_ns.oid = referenced_proc.pronamespace
where source_ns.nspname in ('public', 'workspace')
  and dependency.classid = 'pg_proc'::regclass
  and dependency.refclassid = 'pg_proc'::regclass
  and source_proc.proname in (
    'set_user_access_permissions',
    'can_manage_system_users',
    'can_view_data_center_projects',
    'can_edit_data_center_projects',
    'can_manage_performance_record',
    'can_read_performance_section_report',
    'current_system_user_id',
    'current_user_has_stored_page_permission',
    'approve_system_user',
    'create_system_user_admin_profile',
    'update_system_user_admin_profile',
    'delete_system_user_admin_profile',
    'authorize_system_user_admin_sync'
  )
order by source_schema, source_function, source_arguments,
         referenced_schema, referenced_function, referenced_arguments;

select status, role, count(*) as account_count
from workspace.system_users
group by status, role
order by status, role;

select permission, count(*) as assignment_count
from workspace.user_page_permissions
group by permission
order by permission;

select count(*) as system_user_count
from workspace.system_users;

select count(*) as page_permission_assignment_count,
       count(distinct user_id) as users_with_legacy_assignments
from workspace.user_page_permissions;

rollback;
