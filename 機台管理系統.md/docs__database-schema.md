> 集中副本；原始路徑：`docs/database-schema.md`；程式參考基準：`0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Database schema layout

2026-10-20 documentation update: this file keeps the original schema-move history below. For the current code-backed entity and persistence map, see [系統架構與資料邏輯](./docs__%E7%B3%BB%E7%B5%B1%E6%9E%B6%E6%A7%8B%E8%88%87%E8%B3%87%E6%96%99%E9%82%8F%E8%BC%AF.md) and [跨電腦重建與交接](./docs__%E8%B7%A8%E9%9B%BB%E8%85%A6%E9%87%8D%E5%BB%BA%E8%88%87%E4%BA%A4%E6%8E%A5.md). No production schema query or blank-database rebuild was performed for this documentation update.

Application data lives in the exposed `workspace` schema. Supabase-managed `auth`, `storage`, and `realtime` schemas remain unchanged.

The migration [`20260822120000_archive_workspace_schema.sql`](https://github.com/lovableteat/station-status-hub/blob/0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd/supabase/migrations/20260822120000_archive_workspace_schema.sql) moves existing application tables without resetting data, preserves RLS/policies/triggers, and exposes workspace copies of the application RPC functions.

## Table archive groups

| Workspace domain | Table families |
| --- | --- |
| Identity and administration | `system_users`, `user_roles`, `engineers`, `user_page_permissions`, `system_settings`, `login_audit`, `users` |
| Maintenance and test tracking | `test_*`, `station_*`, `troubleshooting_records`, `command_library`, `code_snippets`, `tools_management`, `dashboard_item_exclusions` |
| Material and BOM | `material_bom_*` |
| Data Center | `data_center_projects`, `circuit_*` |
| PCB Designer | `pcb_designer_*`, `component_*`, `custom_components`, `manufacturers` |
| Collaboration and notifications | `chat_*`, `notification_*`, `user_notifications`, `user_mentions`, `announcements` |
| AI and API management | `api_keys`, `ai_workspace_conversations`, `ai_model_usage_events`, `ai_model_usage_tracking_state` |
| File library | `test_plan_spaces`, `test_plan_folders`, `test_plan_files`, account/storage cleanup queues |
| Comparison feedback | `comparison_feedback` and private feedback Storage; AutoCheck engineering inputs/results/replies remain browser-local, not in this table |
| Performance | `performance_reviews`, `performance_org_members`, group protection/unlocks/attempts, `performance_section_reports`, `performance_submission_receipts`, `performance_self_assessment_backups` (some newer tables are migration-defined rather than fully represented in generated TypeScript types) |
| Shared legacy/application tables | `bugs`, `bug_attachments`, `issues`, `issue_attachments`, `projects`, `project_*`, `tasks`, `task_status`, `columns`, `hyperlinks`, `export_logs`, `production_*`, `ui_table_preferences`, `keep_alive_check` |

## Hosted Supabase setup

The migration grants `anon`, `authenticated`, and `service_role` access to the schema and its tables; RLS remains the data access boundary. On 2026-08-22, the migration was applied to hosted project `rfppeuzuoxtqkpbwehbq` and `workspace` was added under **Exposed schemas**. The local Supabase CLI configuration includes this schema for local development.

Production schema selection is controlled by the GitHub variable `VITE_SUPABASE_SCHEMA`; Edge Functions use the Supabase secret `APP_DB_SCHEMA`. Both are set to `workspace` after the hosted migration has been verified. The keep-alive workflow independently uses the GitHub variable `SUPABASE_DB_SCHEMA` for its REST profile.

Do not move or recreate `auth`, `storage`, or `realtime` objects. New application migrations must create or move tables into `workspace` and must keep their RLS, grants, realtime publication membership, and function search paths aligned with this document.

## Production migration procedure

The current production login, expired OAuth recovery, safe single-file fallback for migration-history mismatches, verification, and logout procedure is maintained in [`supabase-production-migration-runbook.md`](./docs__supabase-production-migration-runbook.md). GitHub Pages deployment does not apply database migrations.

On 2026-09-20, [`20260920120000_complete_performance_feedback_workflow.sql`](https://github.com/lovableteat/station-status-hub/blob/0b0dee080f02ceb8d58b38744fabe3b5d5f4bcfd/supabase/migrations/20260920120000_complete_performance_feedback_workflow.sql) was applied directly to the linked production project after the normal dry-run was blocked by pre-existing remote/local migration-history differences. The migration is transaction-wrapped and idempotent. Remote checks confirmed its columns, RPC, trigger, and attachment validator. This direct single-file execution did not reconcile migration history; any history cleanup remains a separate planned operation and must not be performed ad hoc during a feature deployment.
