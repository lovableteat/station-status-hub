-- Keep Supabase-managed schemas (auth, storage, realtime) intact while
-- moving application data and RPC entry points into one exposed namespace.
create schema if not exists workspace;

grant usage on schema workspace to anon, authenticated, service_role;
grant create on schema workspace to service_role;

do $$
declare
  table_name text;
  application_tables text[] := array[
    'ai_workspace_conversations',
    'announcements',
    'api_keys',
    'bug_attachments',
    'bugs',
    'chat_history_clears',
    'chat_members',
    'chat_message_attachments',
    'chat_messages',
    'chat_read_receipts',
    'chat_threads',
    'circuit_components',
    'circuit_projects',
    'code_snippets',
    'columns',
    'command_library',
    'component_categories',
    'component_specs',
    'custom_components',
    'daily_production_stats',
    'dashboard_item_exclusions',
    'data_center_projects',
    'drivers_and_tools',
    'engineers',
    'export_logs',
    'hyperlinks',
    'issue_attachments',
    'issues',
    'keep_alive_check',
    'login_audit',
    'manufacturers',
    'material_bom_audit_logs',
    'material_bom_export_logs',
    'material_bom_records',
    'material_bom_workspaces',
    'notification_analytics',
    'notification_conversations',
    'notification_preferences',
    'notification_replies',
    'notification_templates',
    'pcb_designer_library',
    'pcb_designer_projects',
    'pcb_designer_shared_library',
    'pcb_designer_shared_projects',
    'pcb_designer_templates',
    'pcb_designer_workspaces',
    'performance_reviews',
    'production_metrics',
    'production_targets',
    'project_tasks',
    'project_templates',
    'projects',
    'station_contents',
    'station_time_analytics',
    'station_time_records',
    'station_time_settings',
    'stations',
    'system_settings',
    'system_units',
    'system_users',
    'systems',
    'task_status',
    'tasks',
    'test_export_logs',
    'test_flow_items',
    'test_flow_stations',
    'test_flow_versions',
    'test_items',
    'test_plan_account_cleanup_queue',
    'test_plan_files',
    'test_plan_folders',
    'test_plan_spaces',
    'test_plan_storage_cleanup_queue',
    'test_progress',
    'test_progress_audit',
    'test_project_address_fields',
    'test_project_code_assignments',
    'test_project_command_assignments',
    'test_project_software_fields',
    'test_project_system_fields',
    'test_project_tool_assignments',
    'test_projects',
    'test_stations',
    'test_system_address_values',
    'test_system_field_values',
    'test_system_software_values',
    'test_systems',
    'tools_management',
    'troubleshooting_records',
    'ui_table_preferences',
    'user_mentions',
    'user_notifications',
    'user_page_permissions',
    'user_roles',
    'users'
  ];
begin
  foreach table_name in array application_tables loop
    if exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relkind in ('r', 'p', 'f')
    ) then
      execute format('alter table public.%I set schema workspace', table_name);
    end if;
  end loop;
end
$$;

grant select, insert, update, delete on all tables in schema workspace to anon, authenticated, service_role;
grant usage, select, update on all sequences in schema workspace to anon, authenticated, service_role;
alter default privileges in schema workspace grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema workspace grant usage, select, update on sequences to anon, authenticated, service_role;

do $$
declare
  routine record;
  table_name text;
  definition text;
  workspace_definition text;
  routine_kind text;
  workspace_signature text;
  application_tables text[] := array[
    'ai_workspace_conversations', 'announcements', 'api_keys', 'bug_attachments', 'bugs',
    'chat_history_clears', 'chat_members', 'chat_message_attachments', 'chat_messages',
    'chat_read_receipts', 'chat_threads', 'circuit_components', 'circuit_projects',
    'code_snippets', 'columns', 'command_library', 'component_categories', 'component_specs',
    'custom_components', 'daily_production_stats', 'dashboard_item_exclusions',
    'data_center_projects', 'drivers_and_tools', 'engineers', 'export_logs', 'hyperlinks',
    'issue_attachments', 'issues', 'keep_alive_check', 'login_audit', 'manufacturers',
    'material_bom_audit_logs', 'material_bom_export_logs', 'material_bom_records',
    'material_bom_workspaces', 'notification_analytics', 'notification_conversations',
    'notification_preferences', 'notification_replies', 'notification_templates',
    'pcb_designer_library', 'pcb_designer_projects', 'pcb_designer_shared_library',
    'pcb_designer_shared_projects', 'pcb_designer_templates', 'pcb_designer_workspaces',
    'performance_reviews', 'production_metrics', 'production_targets', 'project_tasks',
    'project_templates', 'projects', 'station_contents', 'station_time_analytics',
    'station_time_records', 'station_time_settings', 'stations', 'system_settings',
    'system_units', 'system_users', 'systems', 'task_status', 'tasks', 'test_export_logs',
    'test_flow_items', 'test_flow_stations', 'test_flow_versions', 'test_items',
    'test_plan_account_cleanup_queue', 'test_plan_files', 'test_plan_folders',
    'test_plan_spaces', 'test_plan_storage_cleanup_queue', 'test_progress',
    'test_progress_audit', 'test_project_address_fields', 'test_project_code_assignments',
    'test_project_command_assignments', 'test_project_software_fields',
    'test_project_system_fields', 'test_project_tool_assignments', 'test_projects',
    'test_stations', 'test_system_address_values', 'test_system_field_values',
    'test_system_software_values', 'test_systems', 'tools_management',
    'troubleshooting_records', 'ui_table_preferences', 'user_mentions',
    'user_notifications', 'user_page_permissions', 'user_roles', 'users'
  ];
begin
  -- Keep public functions for triggers and legacy callers, but update their
  -- explicit table references and search path after the tables move.
  for routine in
    select
      proc.oid,
      proc.proname,
      proc.prokind,
      proc.oid::regprocedure as signature,
      pg_get_functiondef(proc.oid) as definition
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    join pg_language as lang on lang.oid = proc.prolang
    where namespace.nspname = 'public'
      and proc.prokind in ('f', 'p')
      and lang.lanname in ('sql', 'plpgsql')
  loop
    definition := routine.definition;
    foreach table_name in array application_tables loop
      definition := replace(definition, 'public.' || table_name, 'workspace.' || table_name);
    end loop;
    definition := replace(definition, 'CREATE FUNCTION public.', 'CREATE OR REPLACE FUNCTION public.');
    definition := replace(definition, 'CREATE PROCEDURE public.', 'CREATE OR REPLACE PROCEDURE public.');
    execute definition;

    routine_kind := case when routine.prokind = 'p' then 'PROCEDURE' else 'FUNCTION' end;
    execute format(
      'ALTER %s %s SET search_path = workspace, auth, storage, realtime, extensions, pg_temp',
      routine_kind,
      routine.signature
    );

    workspace_definition := replace(
      definition,
      routine_kind || ' public.' || routine.proname,
      routine_kind || ' workspace.' || routine.proname
    );
    execute workspace_definition;
    workspace_signature := replace(routine.signature::text, 'public.', 'workspace.');
    execute format(
      'ALTER %s %s SET search_path = workspace, auth, storage, realtime, extensions, pg_temp',
      routine_kind,
      workspace_signature
    );
  end loop;
end
$$;

grant execute on all functions in schema workspace to anon, authenticated, service_role;
notify pgrst, 'reload schema';
