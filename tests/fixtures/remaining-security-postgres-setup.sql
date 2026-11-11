set check_function_bodies = off;
-- Synthetic only. No production rows or credentials.
create role anon; create role authenticated; create role service_role bypassrls;
create schema workspace; create schema auth; create schema storage;
grant usage on schema workspace, auth, storage, public to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table workspace.ai_model_usage_events (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.ai_model_usage_events enable row level security;
create policy fixture_permissive on workspace.ai_model_usage_events for all to public using (true) with check (true);
create table workspace.ai_model_usage_tracking_state (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.ai_model_usage_tracking_state enable row level security;
create policy fixture_permissive on workspace.ai_model_usage_tracking_state for all to public using (true) with check (true);
create table workspace.ai_workspace_conversations (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.ai_workspace_conversations enable row level security;
create policy fixture_permissive on workspace.ai_workspace_conversations for all to public using (true) with check (true);
create table workspace.announcements (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.announcements enable row level security;
create policy fixture_permissive on workspace.announcements for all to public using (true) with check (true);
create table workspace.api_keys (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.api_keys enable row level security;
create policy fixture_permissive on workspace.api_keys for all to public using (true) with check (true);
create table workspace.bug_attachments (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.bug_attachments enable row level security;
create policy fixture_permissive on workspace.bug_attachments for all to public using (true) with check (true);
create table workspace.bugs (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.bugs enable row level security;
create policy fixture_permissive on workspace.bugs for all to public using (true) with check (true);
create table workspace.chat_history_clears (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_history_clears enable row level security;
create policy fixture_permissive on workspace.chat_history_clears for all to public using (true) with check (true);
create table workspace.chat_members (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_members enable row level security;
create policy fixture_permissive on workspace.chat_members for all to public using (true) with check (true);
create table workspace.chat_message_attachments (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_message_attachments enable row level security;
create policy fixture_permissive on workspace.chat_message_attachments for all to public using (true) with check (true);
create table workspace.chat_messages (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_messages enable row level security;
create policy fixture_permissive on workspace.chat_messages for all to public using (true) with check (true);
create table workspace.chat_read_receipts (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_read_receipts enable row level security;
create policy fixture_permissive on workspace.chat_read_receipts for all to public using (true) with check (true);
create table workspace.chat_threads (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.chat_threads enable row level security;
create policy fixture_permissive on workspace.chat_threads for all to public using (true) with check (true);
create table workspace.circuit_change_events (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_change_events enable row level security;
create policy fixture_permissive on workspace.circuit_change_events for all to public using (true) with check (true);
create table workspace.circuit_change_items (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_change_items enable row level security;
create policy fixture_permissive on workspace.circuit_change_items for all to public using (true) with check (true);
create table workspace.circuit_change_sets (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_change_sets enable row level security;
create policy fixture_permissive on workspace.circuit_change_sets for all to public using (true) with check (true);
create table workspace.circuit_components (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_components enable row level security;
create policy fixture_permissive on workspace.circuit_components for all to public using (true) with check (true);
create table workspace.circuit_pdf_ai_review_history (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_pdf_ai_review_history enable row level security;
create policy fixture_permissive on workspace.circuit_pdf_ai_review_history for all to public using (true) with check (true);
create table workspace.circuit_pdf_ai_reviews (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_pdf_ai_reviews enable row level security;
create policy fixture_permissive on workspace.circuit_pdf_ai_reviews for all to public using (true) with check (true);
create table workspace.circuit_pdf_official (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_pdf_official enable row level security;
create policy fixture_permissive on workspace.circuit_pdf_official for all to public using (true) with check (true);
create table workspace.circuit_pdf_official_history (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_pdf_official_history enable row level security;
create policy fixture_permissive on workspace.circuit_pdf_official_history for all to public using (true) with check (true);
create table workspace.circuit_projects (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.circuit_projects enable row level security;
create policy fixture_permissive on workspace.circuit_projects for all to public using (true) with check (true);
create table workspace.code_snippets (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.code_snippets enable row level security;
create policy fixture_permissive on workspace.code_snippets for all to public using (true) with check (true);
create table workspace.columns (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.columns enable row level security;
create policy fixture_permissive on workspace.columns for all to public using (true) with check (true);
create table workspace.command_library (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.command_library enable row level security;
create policy fixture_permissive on workspace.command_library for all to public using (true) with check (true);
create table workspace.company_supplier_contacts (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.company_supplier_contacts enable row level security;
create policy fixture_permissive on workspace.company_supplier_contacts for all to public using (true) with check (true);
create table workspace.comparison_feedback (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.comparison_feedback enable row level security;
create policy fixture_permissive on workspace.comparison_feedback for all to public using (true) with check (true);
create table workspace.component_categories (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.component_categories enable row level security;
create policy fixture_permissive on workspace.component_categories for all to public using (true) with check (true);
create table workspace.component_specs (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.component_specs enable row level security;
create policy fixture_permissive on workspace.component_specs for all to public using (true) with check (true);
create table workspace.custom_components (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.custom_components enable row level security;
create policy fixture_permissive on workspace.custom_components for all to public using (true) with check (true);
create table workspace.daily_production_stats (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.daily_production_stats enable row level security;
create policy fixture_permissive on workspace.daily_production_stats for all to public using (true) with check (true);
create table workspace.dashboard_item_exclusions (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.dashboard_item_exclusions enable row level security;
create policy fixture_permissive on workspace.dashboard_item_exclusions for all to public using (true) with check (true);
create table workspace.data_center_projects (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.data_center_projects enable row level security;
create policy fixture_permissive on workspace.data_center_projects for all to public using (true) with check (true);
create table workspace.data_center_work_reports (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.data_center_work_reports enable row level security;
create policy fixture_permissive on workspace.data_center_work_reports for all to public using (true) with check (true);
create table workspace.drivers_and_tools (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.drivers_and_tools enable row level security;
create policy fixture_permissive on workspace.drivers_and_tools for all to public using (true) with check (true);
create table workspace.engineers (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.engineers enable row level security;
create policy fixture_permissive on workspace.engineers for all to public using (true) with check (true);
create table workspace.export_logs (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.export_logs enable row level security;
create policy fixture_permissive on workspace.export_logs for all to public using (true) with check (true);
create table workspace.hyperlinks (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.hyperlinks enable row level security;
create policy fixture_permissive on workspace.hyperlinks for all to public using (true) with check (true);
create table workspace.issue_attachments (id uuid primary key default gen_random_uuid(), issue_id uuid);
alter table workspace.issue_attachments enable row level security;
create policy fixture_permissive on workspace.issue_attachments for all to public using (true) with check (true);
create table workspace.issues (id uuid primary key, system_id uuid);
alter table workspace.issues enable row level security;
create policy fixture_permissive on workspace.issues for all to public using (true) with check (true);
create table workspace.keep_alive_check (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.keep_alive_check enable row level security;
create policy fixture_permissive on workspace.keep_alive_check for all to public using (true) with check (true);
create table workspace.login_audit (id uuid primary key default gen_random_uuid(), user_id uuid, note text);
alter table workspace.login_audit enable row level security;
create policy fixture_permissive on workspace.login_audit for all to public using (true) with check (true);
create table workspace.maintenance_messages (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.maintenance_messages enable row level security;
create policy fixture_permissive on workspace.maintenance_messages for all to public using (true) with check (true);
create table workspace.manufacturers (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.manufacturers enable row level security;
create policy fixture_permissive on workspace.manufacturers for all to public using (true) with check (true);
create table workspace.material_bom_records (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.material_bom_records enable row level security;
create policy fixture_permissive on workspace.material_bom_records for all to public using (true) with check (true);
create table workspace.material_bom_workspaces (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.material_bom_workspaces enable row level security;
create policy fixture_permissive on workspace.material_bom_workspaces for all to public using (true) with check (true);
create table workspace.material_personal_marks (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.material_personal_marks enable row level security;
create policy fixture_permissive on workspace.material_personal_marks for all to public using (true) with check (true);
create table workspace.notification_analytics (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.notification_analytics enable row level security;
create policy fixture_permissive on workspace.notification_analytics for all to public using (true) with check (true);
create table workspace.notification_conversations (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.notification_conversations enable row level security;
create policy fixture_permissive on workspace.notification_conversations for all to public using (true) with check (true);
create table workspace.notification_preferences (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.notification_preferences enable row level security;
create policy fixture_permissive on workspace.notification_preferences for all to public using (true) with check (true);
create table workspace.notification_replies (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.notification_replies enable row level security;
create policy fixture_permissive on workspace.notification_replies for all to public using (true) with check (true);
create table workspace.notification_templates (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.notification_templates enable row level security;
create policy fixture_permissive on workspace.notification_templates for all to public using (true) with check (true);
create table workspace.pcb_designer_model_assets (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.pcb_designer_model_assets enable row level security;
create policy fixture_permissive on workspace.pcb_designer_model_assets for all to public using (true) with check (true);
create table workspace.pcb_designer_project_locks (project_id text primary key, editor_user_id uuid, editor_client_id text, lease_expires_at timestamptz, heartbeat_at timestamptz, project_name text);
alter table workspace.pcb_designer_project_locks enable row level security;
create policy fixture_permissive on workspace.pcb_designer_project_locks for all to public using (true) with check (true);
create table workspace.pcb_designer_shared_library (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.pcb_designer_shared_library enable row level security;
create policy fixture_permissive on workspace.pcb_designer_shared_library for all to public using (true) with check (true);
create table workspace.pcb_designer_shared_projects (id text primary key, payload jsonb, project_updated_at timestamptz, updated_by uuid, deleted_at timestamptz);
alter table workspace.pcb_designer_shared_projects enable row level security;
create policy fixture_permissive on workspace.pcb_designer_shared_projects for all to public using (true) with check (true);
create table workspace.pcb_designer_workspaces (owner_id uuid primary key, payload jsonb);
alter table workspace.pcb_designer_workspaces enable row level security;
create policy fixture_permissive on workspace.pcb_designer_workspaces for all to public using (true) with check (true);
create table workspace.performance_group_attempts (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_group_attempts enable row level security;
create policy fixture_permissive on workspace.performance_group_attempts for all to public using (true) with check (true);
create table workspace.performance_group_secrets (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_group_secrets enable row level security;
create policy fixture_permissive on workspace.performance_group_secrets for all to public using (true) with check (true);
create table workspace.performance_group_unlocks (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_group_unlocks enable row level security;
create policy fixture_permissive on workspace.performance_group_unlocks for all to public using (true) with check (true);
create table workspace.performance_org_members (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_org_members enable row level security;
create policy fixture_permissive on workspace.performance_org_members for all to public using (true) with check (true);
create table workspace.performance_org_removed_members (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_org_removed_members enable row level security;
create policy fixture_permissive on workspace.performance_org_removed_members for all to public using (true) with check (true);
create table workspace.performance_reviews (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_reviews enable row level security;
create policy fixture_permissive on workspace.performance_reviews for all to public using (true) with check (true);
create table workspace.performance_section_reports (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_section_reports enable row level security;
create policy fixture_permissive on workspace.performance_section_reports for all to public using (true) with check (true);
create table workspace.performance_self_assessment_backups (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_self_assessment_backups enable row level security;
create policy fixture_permissive on workspace.performance_self_assessment_backups for all to public using (true) with check (true);
create table workspace.performance_submission_receipts (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.performance_submission_receipts enable row level security;
create policy fixture_permissive on workspace.performance_submission_receipts for all to public using (true) with check (true);
create table workspace.production_metrics (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.production_metrics enable row level security;
create policy fixture_permissive on workspace.production_metrics for all to public using (true) with check (true);
create table workspace.production_targets (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.production_targets enable row level security;
create policy fixture_permissive on workspace.production_targets for all to public using (true) with check (true);
create table workspace.project_tasks (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.project_tasks enable row level security;
create policy fixture_permissive on workspace.project_tasks for all to public using (true) with check (true);
create table workspace.project_templates (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.project_templates enable row level security;
create policy fixture_permissive on workspace.project_templates for all to public using (true) with check (true);
create table workspace.projects (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.projects enable row level security;
create policy fixture_permissive on workspace.projects for all to public using (true) with check (true);
create table workspace.rlc_priority_rules (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.rlc_priority_rules enable row level security;
create policy fixture_permissive on workspace.rlc_priority_rules for all to public using (true) with check (true);
create table workspace.station_contents (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.station_contents enable row level security;
create policy fixture_permissive on workspace.station_contents for all to public using (true) with check (true);
create table workspace.station_time_analytics (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.station_time_analytics enable row level security;
create policy fixture_permissive on workspace.station_time_analytics for all to public using (true) with check (true);
create table workspace.station_time_records (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.station_time_records enable row level security;
create policy fixture_permissive on workspace.station_time_records for all to public using (true) with check (true);
create table workspace.station_time_settings (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.station_time_settings enable row level security;
create policy fixture_permissive on workspace.station_time_settings for all to public using (true) with check (true);
create table workspace.stations (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.stations enable row level security;
create policy fixture_permissive on workspace.stations for all to public using (true) with check (true);
create table workspace.supplier_contacts (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.supplier_contacts enable row level security;
create policy fixture_permissive on workspace.supplier_contacts for all to public using (true) with check (true);
create table workspace.system_settings (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.system_settings enable row level security;
create policy fixture_permissive on workspace.system_settings for all to public using (true) with check (true);
create table workspace.system_units (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.system_units enable row level security;
create policy fixture_permissive on workspace.system_units for all to public using (true) with check (true);
create table workspace.system_users (id uuid primary key, auth_user_id uuid, status text, role text, username text, display_name text, permissions jsonb);
alter table workspace.system_users enable row level security;
create policy fixture_permissive on workspace.system_users for all to public using (true) with check (true);
create table workspace.systems (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.systems enable row level security;
create policy fixture_permissive on workspace.systems for all to public using (true) with check (true);
create table workspace.task_status (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.task_status enable row level security;
create policy fixture_permissive on workspace.task_status for all to public using (true) with check (true);
create table workspace.tasks (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.tasks enable row level security;
create policy fixture_permissive on workspace.tasks for all to public using (true) with check (true);
create table workspace.test_export_logs (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_export_logs enable row level security;
create policy fixture_permissive on workspace.test_export_logs for all to public using (true) with check (true);
create table workspace.test_flow_items (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_flow_items enable row level security;
create policy fixture_permissive on workspace.test_flow_items for all to public using (true) with check (true);
create table workspace.test_flow_stations (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_flow_stations enable row level security;
create policy fixture_permissive on workspace.test_flow_stations for all to public using (true) with check (true);
create table workspace.test_flow_versions (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_flow_versions enable row level security;
create policy fixture_permissive on workspace.test_flow_versions for all to public using (true) with check (true);
create table workspace.test_items (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_items enable row level security;
create policy fixture_permissive on workspace.test_items for all to public using (true) with check (true);
create table workspace.test_plan_account_cleanup_queue (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_plan_account_cleanup_queue enable row level security;
create policy fixture_permissive on workspace.test_plan_account_cleanup_queue for all to public using (true) with check (true);
create table workspace.test_plan_files (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_plan_files enable row level security;
create policy fixture_permissive on workspace.test_plan_files for all to public using (true) with check (true);
create table workspace.test_plan_folders (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_plan_folders enable row level security;
create policy fixture_permissive on workspace.test_plan_folders for all to public using (true) with check (true);
create table workspace.test_plan_spaces (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_plan_spaces enable row level security;
create policy fixture_permissive on workspace.test_plan_spaces for all to public using (true) with check (true);
create table workspace.test_plan_storage_cleanup_queue (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_plan_storage_cleanup_queue enable row level security;
create policy fixture_permissive on workspace.test_plan_storage_cleanup_queue for all to public using (true) with check (true);
create table workspace.test_progress (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.test_progress enable row level security;
create policy fixture_permissive on workspace.test_progress for all to public using (true) with check (true);
create table workspace.test_progress_audit (id uuid primary key default gen_random_uuid(), system_id uuid);
alter table workspace.test_progress_audit enable row level security;
create policy fixture_permissive on workspace.test_progress_audit for all to public using (true) with check (true);
create table workspace.test_project_address_fields (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_address_fields enable row level security;
create policy fixture_permissive on workspace.test_project_address_fields for all to public using (true) with check (true);
create table workspace.test_project_code_assignments (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_code_assignments enable row level security;
create policy fixture_permissive on workspace.test_project_code_assignments for all to public using (true) with check (true);
create table workspace.test_project_command_assignments (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_command_assignments enable row level security;
create policy fixture_permissive on workspace.test_project_command_assignments for all to public using (true) with check (true);
create table workspace.test_project_software_fields (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_software_fields enable row level security;
create policy fixture_permissive on workspace.test_project_software_fields for all to public using (true) with check (true);
create table workspace.test_project_system_fields (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_system_fields enable row level security;
create policy fixture_permissive on workspace.test_project_system_fields for all to public using (true) with check (true);
create table workspace.test_project_tool_assignments (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_project_tool_assignments enable row level security;
create policy fixture_permissive on workspace.test_project_tool_assignments for all to public using (true) with check (true);
create table workspace.test_projects (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_projects enable row level security;
create policy fixture_permissive on workspace.test_projects for all to public using (true) with check (true);
create table workspace.test_stations (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_stations enable row level security;
create policy fixture_permissive on workspace.test_stations for all to public using (true) with check (true);
create table workspace.test_system_address_values (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_system_address_values enable row level security;
create policy fixture_permissive on workspace.test_system_address_values for all to public using (true) with check (true);
create table workspace.test_system_field_values (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_system_field_values enable row level security;
create policy fixture_permissive on workspace.test_system_field_values for all to public using (true) with check (true);
create table workspace.test_system_software_values (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.test_system_software_values enable row level security;
create policy fixture_permissive on workspace.test_system_software_values for all to public using (true) with check (true);
create table workspace.test_systems (id uuid primary key, status text);
alter table workspace.test_systems enable row level security;
create policy fixture_permissive on workspace.test_systems for all to public using (true) with check (true);
create table workspace.tools_management (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.tools_management enable row level security;
create policy fixture_permissive on workspace.tools_management for all to public using (true) with check (true);
create table workspace.troubleshooting_records (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.troubleshooting_records enable row level security;
create policy fixture_permissive on workspace.troubleshooting_records for all to public using (true) with check (true);
create table workspace.ui_table_preferences (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.ui_table_preferences enable row level security;
create policy fixture_permissive on workspace.ui_table_preferences for all to public using (true) with check (true);
create table workspace.user_mentions (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.user_mentions enable row level security;
create policy fixture_permissive on workspace.user_mentions for all to public using (true) with check (true);
create table workspace.user_notifications (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.user_notifications enable row level security;
create policy fixture_permissive on workspace.user_notifications for all to public using (true) with check (true);
create table workspace.user_page_permissions (id uuid primary key default gen_random_uuid(), user_id uuid, permission text);
alter table workspace.user_page_permissions enable row level security;
create policy fixture_permissive on workspace.user_page_permissions for all to public using (true) with check (true);
create table workspace.user_roles (id uuid primary key default gen_random_uuid(), note text);
alter table workspace.user_roles enable row level security;
create policy fixture_permissive on workspace.user_roles for all to public using (true) with check (true);
create table workspace.users (id uuid primary key default gen_random_uuid(), password_hash text);
alter table workspace.users enable row level security;
create policy fixture_permissive on workspace.users for all to public using (true) with check (true);
grant all on all tables in schema workspace to anon, authenticated, service_role;
create table storage.buckets (id text primary key, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, note text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create policy "Allow anonymous access to issue-attachments bucket" on storage.objects for all to public using (bucket_id = 'issue-attachments') with check (bucket_id = 'issue-attachments');
create policy "Allow public downloads" on storage.objects for select to public using (bucket_id = 'task-attachments');
create policy "Allow public uploads" on storage.objects for insert to public with check (bucket_id = 'task-attachments');
create policy "Allow public updates" on storage.objects for update to public using (bucket_id = 'task-attachments') with check (bucket_id = 'task-attachments');
create policy "Allow public deletes" on storage.objects for delete to public using (bucket_id = 'task-attachments');
create policy unrelated_bucket on storage.objects for all to public using (bucket_id = 'unrelated') with check (bucket_id = 'unrelated');
insert into storage.buckets values ('issue-attachments', true), ('task-attachments', true), ('unrelated', true);
insert into storage.objects (bucket_id, name, note) values ('issue-attachments', 'legacy/image.png', 'unchanged'), ('task-attachments','general-assets/global/manual.pdf','unchanged'), ('unrelated','retained.txt','unchanged');
CREATE OR REPLACE FUNCTION public.current_system_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'auth', 'storage', 'realtime', 'extensions', 'pg_temp'
AS $function$
  SELECT id
  FROM workspace.system_users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.delete_test_system(p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'auth', 'storage', 'realtime', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  -- Verify the system exists
  SELECT EXISTS(
    SELECT 1 FROM workspace.test_systems WHERE id = p_system_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'no_data_found';
  END IF;

  -- 清理station_time_analytics表（如果存在）
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
    DELETE FROM workspace.station_time_analytics WHERE system_id = p_system_id;
  END IF;

  -- 1) Issues and attachments linked to this system
  DELETE FROM workspace.issue_attachments ia
  USING workspace.issues i
  WHERE ia.issue_id = i.id
    AND i.system_id = p_system_id;

  DELETE FROM workspace.issues i
  WHERE i.system_id = p_system_id;

  -- 2) Dashboard exclusions
  DELETE FROM workspace.dashboard_item_exclusions die
  WHERE die.system_id = p_system_id;

  -- 3) Test progress audit and records
  DELETE FROM workspace.test_progress_audit tpa
  WHERE tpa.system_id = p_system_id;

  DELETE FROM workspace.test_progress tp
  WHERE tp.system_id = p_system_id;

  -- 4) Station timing records/settings
  DELETE FROM workspace.station_time_records str
  WHERE str.system_id = p_system_id;

  DELETE FROM workspace.station_time_settings sts
  WHERE sts.system_id = p_system_id;

  -- 5) Finally delete the system itself
  DELETE FROM workspace.test_systems ts
  WHERE ts.id = p_system_id;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_project_revision(p_payload jsonb, p_fallback timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN COALESCE(NULLIF(p_payload ->> 'updatedAt', '')::timestamptz, p_fallback);
EXCEPTION WHEN OTHERS THEN
  RETURN p_fallback;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_system_users()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select workspace.can_manage_system_users();
$function$;

CREATE OR REPLACE FUNCTION workspace.delete_test_system(p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  -- Verify the system exists
  SELECT EXISTS(
    SELECT 1 FROM workspace.test_systems WHERE id = p_system_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'System % not found', p_system_id USING ERRCODE = 'no_data_found';
  END IF;

  -- 清理station_time_analytics表（如果存在）
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'station_time_analytics') THEN
    DELETE FROM workspace.station_time_analytics WHERE system_id = p_system_id;
  END IF;

  -- 1) Issues and attachments linked to this system
  DELETE FROM workspace.issue_attachments ia
  USING workspace.issues i
  WHERE ia.issue_id = i.id
    AND i.system_id = p_system_id;

  DELETE FROM workspace.issues i
  WHERE i.system_id = p_system_id;

  -- 2) Dashboard exclusions
  DELETE FROM workspace.dashboard_item_exclusions die
  WHERE die.system_id = p_system_id;

  -- 3) Test progress audit and records
  DELETE FROM workspace.test_progress_audit tpa
  WHERE tpa.system_id = p_system_id;

  DELETE FROM workspace.test_progress tp
  WHERE tp.system_id = p_system_id;

  -- 4) Station timing records/settings
  DELETE FROM workspace.station_time_records str
  WHERE str.system_id = p_system_id;

  DELETE FROM workspace.station_time_settings sts
  WHERE sts.system_id = p_system_id;

  -- 5) Finally delete the system itself
  DELETE FROM workspace.test_systems ts
  WHERE ts.id = p_system_id;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.current_system_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT id
  FROM workspace.system_users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION workspace.current_user_can_workspace(p_workspace text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user workspace.system_users%rowtype;
  v_level text;
  v_permissions text[];
begin
  select users.*
  into v_user
  from workspace.system_users as users
  where users.auth_user_id = (select auth.uid())
    and users.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;

  if v_user.role in ('admin', 'super_admin') then
    return true;
  end if;

  if coalesce(v_user.permissions, '{}'::jsonb) #> '{workspaceAccess}' ? p_workspace then
    v_level := coalesce(
      v_user.permissions #>> array['workspaceAccess', p_workspace],
      'none'
    );
    return case
      when p_action = 'edit' then v_level = 'edit'
      else v_level in ('view', 'edit')
    end;
  end if;

  v_permissions := case
    when p_workspace = 'station-status' and p_action = 'edit' then array[
      'dashboard_edit', 'test_tracker_edit', 'flow_info_edit',
      'issues_edit', 'production_edit', 'tools_edit'
    ]
    when p_workspace = 'station-status' then array[
      'dashboard_view', 'dashboard_edit',
      'test_tracker_view', 'test_tracker_edit',
      'flow_info_view', 'flow_info_edit',
      'issues_view', 'issues_edit',
      'production_view', 'production_edit',
      'tools_view', 'tools_edit'
    ]
    when p_workspace = 'ai-chat' and p_action = 'edit' then
      array['comparison_edit', 'api_management_edit']
    when p_workspace = 'ai-chat' then array[
      'comparison_view', 'comparison_edit',
      'api_management_view', 'api_management_edit'
    ]
    when p_workspace = 'performance' and p_action = 'edit' then
      array['performance_edit']
    when p_workspace = 'performance' then
      array['performance_view', 'performance_edit']
    else array[]::text[]
  end;

  return exists (
    select 1
    from workspace.user_page_permissions as page_permissions
    where page_permissions.user_id = v_user.id
      and page_permissions.permission::text = any(v_permissions)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_view(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) IN ('view', 'edit')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION workspace.pcb_designer_can_edit(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM workspace.system_users AS account
    WHERE account.id = p_user_id
      AND account.status = 'active'
      AND (
        account.role IN ('admin', 'super_admin')
        OR COALESCE(
          account.permissions #>> '{workspaceAccess,pcb-designer}',
          'none'
        ) = 'edit'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION workspace.load_pcb_designer_workspace(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  personal_payload jsonb;
  shared_projects jsonb;
  deleted_project_ids jsonb;
  shared_revision timestamptz;
  personal_revision timestamptz;
  combined_revision timestamptz;
  active_project_id text;
  result jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_view(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace access denied';
  END IF;

  SELECT account_workspace.payload
  INTO personal_payload
  FROM workspace.pcb_designer_workspaces AS account_workspace
  WHERE account_workspace.owner_id = p_user_id;

  personal_payload := COALESCE(
    personal_payload,
    jsonb_build_object(
      'projects', '[]'::jsonb,
      'templates', '[]'::jsonb,
      'library', '[]'::jsonb,
      'activeProjectId', NULL,
      'modelAssets', '{}'::jsonb,
      'pendingPlacementsByProject', '{}'::jsonb,
      'remoteDeletions', jsonb_build_object(
        'projects', '[]'::jsonb,
        'templates', '[]'::jsonb,
        'library', '[]'::jsonb
      ),
      'updatedAt', '1970-01-01T00:00:00.000Z'
    )
  );

  SELECT
    COALESCE(
      jsonb_agg(shared.payload ORDER BY shared.project_updated_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NULL),
      '[]'::jsonb
    ),
    COALESCE(
      jsonb_agg(to_jsonb(shared.id) ORDER BY shared.deleted_at DESC, shared.id)
        FILTER (WHERE shared.deleted_at IS NOT NULL),
      '[]'::jsonb
    ),
    MAX(COALESCE(shared.deleted_at, shared.project_updated_at))
  INTO shared_projects, deleted_project_ids, shared_revision
  FROM workspace.pcb_designer_shared_projects AS shared;

  active_project_id := personal_payload ->> 'activeProjectId';
  IF active_project_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(shared_projects) AS project(payload)
    WHERE project.payload ->> 'id' = active_project_id
  ) THEN
    active_project_id := shared_projects -> 0 ->> 'id';
  END IF;

  personal_revision := workspace.pcb_designer_project_revision(
    personal_payload,
    '1970-01-01 00:00:00+00'::timestamptz
  );
  combined_revision := GREATEST(
    personal_revision,
    COALESCE(shared_revision, '1970-01-01 00:00:00+00'::timestamptz)
  );

  result := jsonb_set(personal_payload, '{projects}', shared_projects, true);
  result := jsonb_set(
    result,
    '{activeProjectId}',
    COALESCE(to_jsonb(active_project_id), 'null'::jsonb),
    true
  );
  result := jsonb_set(
    result,
    '{remoteDeletions}',
    COALESCE(result -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', deleted_project_ids),
    true
  );
  result := jsonb_set(result, '{updatedAt}', to_jsonb(combined_revision::text), true);
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace(p_user_id uuid, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  project_payload jsonb;
  project_id text;
  project_revision timestamptz;
  deleted_project_id text;
  personal_payload jsonb;
BEGIN
  IF NOT workspace.pcb_designer_can_edit(p_user_id) THEN
    RAISE EXCEPTION 'PCB workspace edit access denied';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_typeof(p_payload -> 'projects') <> 'array'
    OR jsonb_typeof(p_payload -> 'templates') <> 'array'
    OR jsonb_typeof(p_payload -> 'library') <> 'array'
    OR octet_length(p_payload::text) > 20 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Invalid or oversized PCB workspace payload';
  END IF;

  FOR deleted_project_id IN
    SELECT deleted_id
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(p_payload #> '{remoteDeletions,projects}') = 'array'
          THEN p_payload #> '{remoteDeletions,projects}'
        ELSE '[]'::jsonb
      END
    ) AS deleted(deleted_id)
    WHERE NULLIF(deleted_id, '') IS NOT NULL
  LOOP
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by, deleted_at
    )
    VALUES (deleted_project_id, NULL, NULL, p_user_id, clock_timestamp())
    ON CONFLICT (id) DO UPDATE
    SET
      payload = NULL,
      project_updated_at = NULL,
      updated_by = EXCLUDED.updated_by,
      deleted_at = EXCLUDED.deleted_at;
  END LOOP;

  FOR project_payload IN
    SELECT project.value
    FROM jsonb_array_elements(p_payload -> 'projects') AS project(value)
  LOOP
    project_id := NULLIF(project_payload ->> 'id', '');
    IF project_id IS NULL OR jsonb_typeof(project_payload) <> 'object' THEN
      RAISE EXCEPTION 'Invalid PCB project payload';
    END IF;
    project_revision := workspace.pcb_designer_project_revision(
      project_payload,
      clock_timestamp()
    );
    INSERT INTO workspace.pcb_designer_shared_projects (
      id, payload, project_updated_at, updated_by
    )
    VALUES (project_id, project_payload, project_revision, p_user_id)
    ON CONFLICT (id) DO UPDATE
    SET
      payload = EXCLUDED.payload,
      project_updated_at = EXCLUDED.project_updated_at,
      updated_by = EXCLUDED.updated_by,
      deleted_at = NULL
    WHERE workspace.pcb_designer_shared_projects.deleted_at IS NULL
      AND workspace.pcb_designer_shared_projects.project_updated_at <= EXCLUDED.project_updated_at;
  END LOOP;

  personal_payload := jsonb_set(p_payload, '{projects}', '[]'::jsonb, true);
  personal_payload := jsonb_set(
    personal_payload,
    '{remoteDeletions}',
    COALESCE(personal_payload -> 'remoteDeletions', '{}'::jsonb)
      || jsonb_build_object('projects', '[]'::jsonb),
    true
  );
  INSERT INTO workspace.pcb_designer_workspaces (owner_id, payload)
  VALUES (p_user_id, personal_payload)
  ON CONFLICT (owner_id) DO UPDATE
  SET payload = EXCLUDED.payload;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.release_pcb_designer_project_lock(p_user_id uuid, p_project_id text, p_editor_client_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  released boolean;
BEGIN
  WITH removed AS (
    DELETE FROM workspace.pcb_designer_project_locks
    WHERE project_id = p_project_id
      AND editor_user_id = p_user_id
      AND editor_client_id = p_editor_client_id
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM removed) INTO released;
  RETURN released;
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.save_pcb_designer_workspace_locked(p_user_id uuid, p_project_id text, p_editor_client_id text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workspace', 'public', 'pg_temp'
AS $function$
DECLARE
  active_project jsonb;
  scoped_payload jsonb;
  scoped_deletions jsonb;
BEGIN
  IF p_payload ->> 'activeProjectId' IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'PCB active project does not match edit lock';
  END IF;

  PERFORM 1
  FROM workspace.pcb_designer_project_locks AS project_lock
  WHERE project_lock.project_id = p_project_id
    AND project_lock.editor_user_id = p_user_id
    AND project_lock.editor_client_id = p_editor_client_id
    AND project_lock.lease_expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PCB project edit lock required';
  END IF;

  SELECT project_item.value
  INTO active_project
  FROM jsonb_array_elements(COALESCE(p_payload -> 'projects', '[]'::jsonb)) AS project_item(value)
  WHERE project_item.value ->> 'id' = p_project_id
  LIMIT 1;

  IF active_project IS NULL THEN
    RAISE EXCEPTION 'PCB locked project is missing from payload';
  END IF;

  scoped_payload := jsonb_set(p_payload, '{projects}', jsonb_build_array(active_project), true);
  scoped_deletions := COALESCE(scoped_payload -> 'remoteDeletions', '{}'::jsonb)
    || jsonb_build_object('projects', '[]'::jsonb);
  scoped_payload := jsonb_set(scoped_payload, '{remoteDeletions}', scoped_deletions, true);

  UPDATE workspace.pcb_designer_project_locks
  SET
    heartbeat_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + interval '30 seconds'
  WHERE project_id = p_project_id;

  PERFORM workspace.save_pcb_designer_workspace_shared(p_user_id, scoped_payload);
END;
$function$;

CREATE OR REPLACE FUNCTION workspace.current_user_has_stored_page_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and case
        when not (coalesce(account.permissions, '{}'::jsonb) ? 'pagePermissions')
        then exists (select 1 from workspace.user_page_permissions legacy
          where legacy.user_id = account.id and legacy.permission::text = p_permission)
        when jsonb_typeof(account.permissions -> 'pagePermissions') = 'array'
        then (account.permissions -> 'pagePermissions') @> jsonb_build_array(p_permission)
        else false
      end
  );
$function$;

CREATE OR REPLACE FUNCTION workspace.can_manage_system_users()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from workspace.system_users account
    where account.auth_user_id = auth.uid() and account.status = 'active'
      and (account.role in ('admin', 'super_admin') or (
        case
          when not (coalesce(account.permissions, '{}'::jsonb) ? 'workspaceAccess')
            or (
              jsonb_typeof(account.permissions -> 'workspaceAccess') = 'object'
              and not ((account.permissions -> 'workspaceAccess') ? 'user-management')
            )
          then true
          when jsonb_typeof(account.permissions -> 'workspaceAccess') = 'object'
          then coalesce(account.permissions #>> '{workspaceAccess,user-management}', '') = 'edit'
          else false
        end
        and workspace.current_user_has_stored_page_permission('admin_edit')
      ))
  );
$function$;


create function workspace.save_pcb_designer_workspace_shared(p_user_id uuid,p_payload jsonb) returns void language sql security definer as $$ select workspace.save_pcb_designer_workspace(p_user_id,p_payload); $$;
create function public.authenticate_user(username_input text,password_input text) returns boolean language sql security definer as $$ select false; $$;
create function workspace.authenticate_user(username_input text,password_input text) returns boolean language sql security definer as $$ select false; $$;
create function public.register_system_user(username_input text,password_input text,display_name_input text) returns boolean language sql security definer as $$ select false; $$;
create function workspace.register_system_user(username_input text,password_input text,display_name_input text) returns boolean language sql security definer as $$ select false; $$;
create function public.database_healthcheck() returns boolean language sql as $$ select true; $$;
create function public.cleanup_old_notifications() returns void language sql security definer as $$ select; $$;
create function workspace.cleanup_old_notifications() returns void language sql security definer as $$ select; $$;
create function public.calculate_daily_production_stats() returns void language sql security definer as $$ select; $$;
create function workspace.calculate_daily_production_stats() returns void language sql security definer as $$ select; $$;
grant execute on all functions in schema workspace, public to anon, authenticated, service_role;
-- Exercise legacy column privileges too.
grant select (note) on workspace.tasks to anon;
insert into workspace.system_users (id,auth_user_id,status,role,username,display_name,permissions) values ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active','admin','fixture-1','Fixture 1','{"workspaceAccess":{"station-status":"edit","pcb-designer":"edit"}}');
insert into workspace.login_audit (user_id,note) values ('00000000-0000-4000-8000-000000000001','fixture audit unchanged');
insert into workspace.system_users (id,auth_user_id,status,role,username,display_name,permissions) values ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','active','engineer','fixture-2','Fixture 2','{"workspaceAccess":{"station-status":"edit","pcb-designer":"edit"}}');
insert into workspace.login_audit (user_id,note) values ('00000000-0000-4000-8000-000000000002','fixture audit unchanged');
insert into workspace.system_users (id,auth_user_id,status,role,username,display_name,permissions) values ('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','active','engineer','fixture-3','Fixture 3','{"workspaceAccess":{"station-status":"view","pcb-designer":"view"}}');
insert into workspace.login_audit (user_id,note) values ('00000000-0000-4000-8000-000000000003','fixture audit unchanged');
insert into workspace.system_users (id,auth_user_id,status,role,username,display_name,permissions) values ('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','active','engineer','fixture-4','Fixture 4','{"workspaceAccess":{"station-status":"none","pcb-designer":"none"}}');
insert into workspace.login_audit (user_id,note) values ('00000000-0000-4000-8000-000000000004','fixture audit unchanged');
insert into workspace.system_users (id,auth_user_id,status,role,username,display_name,permissions) values ('00000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005','disabled','engineer','fixture-5','Fixture 5','{"workspaceAccess":{"station-status":"edit","pcb-designer":"edit"}}');
insert into workspace.login_audit (user_id,note) values ('00000000-0000-4000-8000-000000000005','fixture audit unchanged');
insert into workspace.tasks (note) values ('existing row unchanged');
insert into workspace.users (password_hash) values ('fixture-not-a-password-hash');
insert into workspace.user_roles(note) values ('existing role unchanged');
insert into workspace.pcb_designer_project_locks (project_id,editor_user_id,editor_client_id,lease_expires_at) values ('fixture-project','00000000-0000-4000-8000-000000000002','fixture-editor',now()+interval '1 hour');

set check_function_bodies = on;
