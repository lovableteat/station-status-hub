# Database schema layout

Application data lives in the exposed `workspace` schema. Supabase-managed `auth`, `storage`, and `realtime` schemas remain unchanged.

The migration [`20260822120000_archive_workspace_schema.sql`](../supabase/migrations/20260822120000_archive_workspace_schema.sql) moves existing application tables without resetting data, preserves RLS/policies/triggers, and exposes workspace copies of the application RPC functions.

## Table archive groups

| Workspace domain | Table families |
| --- | --- |
| Identity and administration | `system_users`, `user_roles`, `engineers`, `user_page_permissions`, `system_settings`, `login_audit`, `users` |
| Maintenance and test tracking | `test_*`, `station_*`, `troubleshooting_records`, `command_library`, `code_snippets`, `tools_management`, `dashboard_item_exclusions` |
| Material and BOM | `material_bom_*` |
| Data Center | `data_center_projects`, `circuit_*` |
| PCB Designer | `pcb_designer_*`, `component_*`, `custom_components`, `manufacturers` |
| Collaboration and notifications | `chat_*`, `notification_*`, `user_notifications`, `user_mentions`, `announcements` |
| AI and API management | `api_keys`, `ai_workspace_conversations` |
| Test Plan | `test_plan_*` |
| Performance | `performance_reviews` |
| Shared legacy/application tables | `bugs`, `bug_attachments`, `issues`, `issue_attachments`, `projects`, `project_*`, `tasks`, `task_status`, `columns`, `hyperlinks`, `export_logs`, `production_*`, `ui_table_preferences`, `keep_alive_check` |

## Hosted Supabase setup

The migration grants `anon`, `authenticated`, and `service_role` access to the schema and its tables; RLS remains the data access boundary. On 2026-08-22, the migration was applied to hosted project `rfppeuzuoxtqkpbwehbq` and `workspace` was added under **Exposed schemas**. The local Supabase CLI configuration includes this schema for local development.

Production schema selection is controlled by the GitHub variable `VITE_SUPABASE_SCHEMA`; Edge Functions use the Supabase secret `APP_DB_SCHEMA`. Both are set to `workspace` after the hosted migration has been verified. The keep-alive workflow independently uses the GitHub variable `SUPABASE_DB_SCHEMA` for its REST profile.

Do not move or recreate `auth`, `storage`, or `realtime` objects. New application migrations must create or move tables into `workspace` and must keep their RLS, grants, realtime publication membership, and function search paths aligned with this document.
