# Data Center Daily Report Implementation Plan

> Execute inline in the current session under the user's continuous-execution rule; no stage-approval or subagent dispatch.

**Goal:** Add durable daily work reporting and clarify the existing Data Center interface without changing other workspaces or the palette.

**Architecture:** Keep scene storage unchanged. Store work reports in individual RLS-protected rows and use the existing Supabase client, React Query and native form controls.

**Tech Stack:** React, TypeScript, existing UI components, CSS, Supabase/Postgres.

## Global Constraints

- Only Data Center and its own persistence/types/tests/documentation change.
- Preserve shared navigation, selected charcoal/teal theme and all scene actions.
- Preserve user-owned `.claude/` and all production scene documents.
- Do not show local drafts as cloud-saved reports or suppress failed writes.

## Tasks

- [x] Add service checks before implementation. The initial run was blocked by absent QA dependencies rather than a feature assertion. Later reproduce the `toString` status-boundary failure, fix it and rerun green. Do not claim a missing-implementation red/green run.
- [x] Implement `dailyWorkReports.ts` with validation, durable receipts, separate rows and compare-and-set updates; no scene document writes.
- [x] Add and apply the CLI-created migration and table type. Verify ownership, duplicate, view-only/revoked and explicit column grants in a rolled-back real Postgres transaction. Align the local SQL filename to the connector-assigned applied version `20261007145956`; do not reapply the create-table SQL.
- [x] Implement native daily-report fields, scoped local drafts, visible URL filters/chips and cloud-save feedback. No new application dependency.
- [x] Wire desktop/mobile entries, context and scoped CSS while preserving scene/actions.
- [x] Pass 143 scoped checks, typecheck, ESLint and build. Real desktop create/edit/reload/filter/duplicate-failure verified; record the three confirmed baseline-only full-suite failures and the native-dialog browser limitation.
- [ ] Check deployed desktop/mobile geometry and preserve exact verification boundaries.
- [x] Commit `f8de59e4`, fast-forward main, push and verify successful Pages build/deploy run `37644725698`. Remove only the precisely identified QA work-report row through the connector; keep production scenes untouched.
- [ ] Finish the post-deployment authenticated live-page check after the old native-confirm browser blocker is dismissed. Do not mark responsive/physical-device checks complete without evidence.
