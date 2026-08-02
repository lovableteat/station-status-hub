# Maintenance RAG Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, permission-checked maintenance-data source to the AI query workspace with current-project defaults, multi/all-project scope, hybrid retrieval, and clickable citations.

**Architecture:** A Supabase `security definer` RPC composes normalized knowledge chunks directly from maintenance tables and ranks them with exact, substring, token and trigram signals. Focused client modules manage project scope, build one-request-only AI context, preserve citation metadata on assistant messages, and render deterministic links back to the original maintenance records.

**Tech Stack:** React, TypeScript, Supabase PostgreSQL/RPC, pg_trgm, Node test runner, Vite.

## Global Constraints

- Do not add an embedding service, vector index or extra AI request.
- The default source scope is the active maintenance project; users may select multiple or all projects.
- Retrieval requires both `ai-chat` and `station-status` access and an approved, enabled account.
- Retrieval failure must stop the provider request; zero results must produce a local no-evidence answer.
- Visible user messages and saved conversation text must not contain hidden retrieval context.
- Every maintenance answer must render the actual retrieved source cards even when the model omits inline markers.
- Citation URLs must include the source project and route to the corresponding maintenance module.
- All production edits follow failing-test-first TDD.

---

### Task 1: Live maintenance knowledge RPC

**Files:**
- Create: `tests/maintenanceKnowledgeMigration.test.mjs`
- Create: `supabase/migrations/20260803120000_add_maintenance_knowledge_search.sql`

**Interfaces:**
- Consumes: `public.current_system_user_id()`, `system_users`, maintenance project/system/flow/progress/issues/asset tables.
- Produces: `public.search_maintenance_knowledge(p_query text, p_project_ids uuid[], p_limit integer default 16)` returning `chunk_id`, `source_type`, `source_id`, `project_id`, `project_name`, `title`, `content`, `source_label`, `module`, `route_params`, `updated_at`, and `rank`.

- [ ] **Step 1: Write a failing migration contract test**

  Assert that the migration creates `pg_trgm`, a `security definer` RPC, explicit dual-workspace permission checks, query/project/limit validation, all six source categories, trigram plus exact-code ranking, and JSON route parameters.

- [ ] **Step 2: Run the test and observe RED**

  Run: `node --test tests/maintenanceKnowledgeMigration.test.mjs`

  Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Implement the SQL migration**

  Create the normalized CTE union for `project`, `machine`, `station`, `progress`, `issue`, and `asset`; constrain requested projects, rank against the normalized query, clamp the result to 1–20 rows, revoke public execution, and grant execution to `authenticated`.

- [ ] **Step 4: Run the migration contract test**

  Run: `node --test tests/maintenanceKnowledgeMigration.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit the RPC**

  Run: `git add tests/maintenanceKnowledgeMigration.test.mjs supabase/migrations/20260803120000_add_maintenance_knowledge_search.sql && git commit -m "feat: add live maintenance knowledge search"`

### Task 2: Project-scope and citation domain helpers

**Files:**
- Create: `tests/maintenanceKnowledge.test.mjs`
- Create: `src/components/api-management/maintenanceKnowledge.ts`

**Interfaces:**
- Produces: `MaintenanceProjectOption`, `MaintenanceCitation`, `MaintenanceScopeState`, `createMaintenanceScope`, `toggleMaintenanceProject`, `selectAllMaintenanceProjects`, `selectCurrentMaintenanceProject`, `buildMaintenanceContext`, `buildMaintenanceSourceHref`, and `searchMaintenanceKnowledge`.
- Consumes: Supabase client RPC result from Task 1.

- [ ] **Step 1: Write failing helper tests**

  Cover active-project defaulting, preserving explicit multi-selection, select-all and clear, `[M1]` context numbering, HTML-safe bounded excerpts, project-aware module URLs for every source type, RPC input shape, and RPC error propagation.

- [ ] **Step 2: Run the helper tests and observe RED**

  Run: `node --test tests/maintenanceKnowledge.test.mjs`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure helpers and the RPC adapter**

  Keep state transitions pure, use `URLSearchParams` for citation URLs, clamp excerpts and context size, map snake_case RPC rows to typed citations, and throw actionable retrieval errors.

- [ ] **Step 4: Run the helper tests**

  Run: `node --test tests/maintenanceKnowledge.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit the helper layer**

  Run: `git add tests/maintenanceKnowledge.test.mjs src/components/api-management/maintenanceKnowledge.ts && git commit -m "feat: add maintenance query source helpers"`

### Task 3: Source selector and deterministic citation UI

**Files:**
- Create: `tests/maintenanceSourceUi.test.mjs`
- Create: `src/components/api-management/MaintenanceSourceSelector.tsx`
- Create: `src/components/api-management/MaintenanceCitationList.tsx`

**Interfaces:**
- `MaintenanceSourceSelector` consumes project options, current project ID, enabled state, selected IDs and state-change callbacks.
- `MaintenanceCitationList` consumes `MaintenanceCitation[]` and renders accessible project-aware links.

- [ ] **Step 1: Write a failing UI contract test**

  Assert the selector exposes current/all/clear operations and per-project checkboxes, and citation cards include type, title, project, excerpt and an anchor using `buildMaintenanceSourceHref`.

- [ ] **Step 2: Run the UI contract test and observe RED**

  Run: `node --test tests/maintenanceSourceUi.test.mjs`

  Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement the two focused components**

  Match the existing query workspace spacing and color tokens, keep the selector compact and keyboard accessible, indicate current project and selected count, and render every retrieved citation independent of model marker quality.

- [ ] **Step 4: Run the UI contract test**

  Run: `node --test tests/maintenanceSourceUi.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit the source UI**

  Run: `git add tests/maintenanceSourceUi.test.mjs src/components/api-management/MaintenanceSourceSelector.tsx src/components/api-management/MaintenanceCitationList.tsx && git commit -m "feat: add maintenance source selection and citations"`

### Task 4: Ground provider requests and persist citation metadata

**Files:**
- Create: `tests/apiChatMaintenanceSource.test.mjs`
- Modify: `src/components/api-management/ApiChatWorkspacePage.tsx`
- Modify: `src/components/api-management/ApiChatConsole.tsx`

**Interfaces:**
- Consumes: project list/current project from `useTestProject()`, helpers and components from Tasks 2–3.
- Extends: `ChatMessage` with optional `citations: MaintenanceCitation[]`.
- Produces: one-request-only maintenance context passed to `runProviderRequest` without modifying the visible/saved user message.

- [ ] **Step 1: Write a failing integration contract test**

  Assert the workspace passes active/all projects, the console renders the selector, retrieves before provider execution, aborts on RPC error, creates a local no-evidence response on empty results, adds hidden system context only to the provider history, stores citations on the assistant message, and renders `MaintenanceCitationList`.

- [ ] **Step 2: Run the integration contract test and observe RED**

  Run: `node --test tests/apiChatMaintenanceSource.test.mjs`

  Expected: FAIL because the query workspace is not connected to maintenance retrieval.

- [ ] **Step 3: Wire project context into the console**

  Read `allProjects`, `activeProjectId` and current project from `useTestProject()`, map non-archived projects into options, and pass them into `ApiChatConsole` only for the data-query workspace.

- [ ] **Step 4: Ground the request flow**

  Retrieve selected projects before provider invocation, append an ephemeral system message containing numbered snippets, prevent ungrounded fallbacks on failure, create a local assistant response when there are no matches, and attach compact citation metadata to successful assistant messages.

- [ ] **Step 5: Preserve and render citations**

  Make conversation load/save tolerate old messages without citations, validate restored citation objects, and render the deterministic citation list directly below the associated assistant response.

- [ ] **Step 6: Run the integration and related chat tests**

  Run: `node --test tests/apiChatMaintenanceSource.test.mjs tests/apiChat*.test.mjs tests/aiProvider*.test.mjs tests/workspacePermissions.test.mjs`

  Expected: PASS.

- [ ] **Step 7: Commit the grounded chat flow**

  Run: `git add tests/apiChatMaintenanceSource.test.mjs src/components/api-management/ApiChatWorkspacePage.tsx src/components/api-management/ApiChatConsole.tsx && git commit -m "feat: ground AI queries in maintenance data"`

### Task 5: Apply migration and run real end-to-end verification

**Files:**
- Modify only if verification finds a defect: files created or modified in Tasks 1–4.

**Interfaces:**
- Consumes: linked Supabase project and local Vite application.
- Produces: verified live RPC, successful build, browser evidence for source scope and citation navigation.

- [ ] **Step 1: Run all focused automated tests**

  Run: `node --test tests/maintenanceKnowledgeMigration.test.mjs tests/maintenanceKnowledge.test.mjs tests/maintenanceSourceUi.test.mjs tests/apiChatMaintenanceSource.test.mjs tests/apiChat*.test.mjs tests/aiProvider*.test.mjs tests/workspacePermissions.test.mjs`

  Expected: PASS.

- [ ] **Step 2: Build production assets**

  Run: `npm run build`

  Expected: exit code 0 with no TypeScript or Vite build error.

- [ ] **Step 3: Apply and probe the migration**

  Apply `20260803120000_add_maintenance_knowledge_search.sql` to the linked Supabase project, sign in with a real approved account, call the RPC for the active project with an exact machine code and an issue keyword, and confirm the returned project IDs, rankings and route parameters match live records.

- [ ] **Step 4: Run real browser flows**

  Start the local app, sign in, open the data query workspace, verify current-project default, select multiple projects and all projects, submit an exact machine query and an issue query, confirm the visible answer has source cards, and click citations back to the correct project/module/record. Confirm the browser console has no new errors.

- [ ] **Step 5: Fix any verified defect using a new failing regression test**

  Add the smallest failing test that reproduces the issue, observe RED, patch production code, and rerun Steps 1–4 until green.

- [ ] **Step 6: Commit verification fixes if any**

  Run: `git add <only feature-related files> && git commit -m "fix: harden maintenance query retrieval"`

### Task 6: Safely integrate and push main

**Files:**
- No product files unless conflict resolution is required.

**Interfaces:**
- Consumes: verified feature branch and the latest `origin/main`.
- Produces: a fast-forward-safe update on GitHub `main` without overwriting another machine's work.

- [ ] **Step 1: Fetch and compare remote main**

  Run: `git fetch origin main && git log --left-right --cherry-pick --oneline HEAD...origin/main`

  Expected: any remote-only commits are identified before integration.

- [ ] **Step 2: Integrate remote changes without force**

  If remote advanced, rebase the feature branch onto `origin/main`, resolve only feature-related conflicts, and rerun Task 5 Steps 1–2.

- [ ] **Step 3: Push the verified commit to main**

  Run: `git push origin HEAD:main`

  Expected: a normal non-force push succeeds.

