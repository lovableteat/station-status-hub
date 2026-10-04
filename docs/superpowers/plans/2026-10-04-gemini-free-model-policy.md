# Gemini Free Model Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gemini 3.5 Flash-Lite the new default, expose three approved free-project models with honest quota copy, and prevent automatic cross-model fallback.

**Architecture:** Keep the model policy in `aiProviderCatalog.ts` as the shared source for model IDs and quota annotations. Reuse it in the existing API-key dialog and chat console, while preserving the current permissions-metadata persistence path and filtering retry candidates by exact model.

**Tech Stack:** React 18, TypeScript, Radix Select, Node test runner, ESLint, Vite.

## Global Constraints

- Do not migrate existing saved `gemini-2.5-flash` metadata.
- Do not add database schema, Google IAM, OAuth, service-account credentials, paid-tier activation, or quota purchases.
- Display project limits as sourced from the user's 2026-10-04 Google AI Studio free-project screenshot.
- Never present a local or per-key count as exact Google project remaining quota.
- Do not automatically fall back to a different model.
- Do not merge or deploy the draft PR.

---

### Task 1: Gemini policy catalog

**Files:**
- Modify: `src/components/api-management/aiProviderCatalog.ts`
- Test: `tests/aiProviderCatalog.test.mjs`

**Interfaces:**
- Produces: `GEMINI_DEFAULT_MODEL`, `GEMINI_FREE_MODEL_PROFILES`, `getGeminiFreeModelProfile(model)`, and `getGeminiFreeModelOptions(discoveredModels)`.
- Consumes: Existing Gemini provider preset and dynamic Models API response.

- [ ] **Step 1: Write failing catalog tests**

Assert the default is `gemini-3.5-flash-lite`, the three profiles have the approved RPM/TPM/RPD values and source date, and discovered models are filtered and ordered by the approved profile order.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `node --test tests/aiProviderCatalog.test.mjs`

Expected: FAIL because the policy exports and new default do not exist.

- [ ] **Step 3: Implement the minimal policy catalog**

Add immutable profile data and small lookup/filter helpers, then use `GEMINI_DEFAULT_MODEL` in the Gemini provider preset.

- [ ] **Step 4: Re-run the focused test**

Run: `node --test tests/aiProviderCatalog.test.mjs`

Expected: PASS.

### Task 2: Operable model selection and honest quota notice

**Files:**
- Modify: `src/components/api-management/CreateApiKeyDialog.tsx`
- Modify: `src/components/api-management/ApiChatConsole.tsx`
- Test: `tests/apiKeyDialogExperience.test.mjs`
- Test: `tests/apiChatModelControl.test.mjs`

**Interfaces:**
- Consumes: Catalog policy exports from Task 1.
- Produces: A three-option Gemini selector, quota/source/reset copy, and exact-model retry filtering.

- [ ] **Step 1: Write failing UI contract tests**

Assert that the dialog maps the three policy profiles into `SelectItem` controls, displays `未同步 Google` and the project-sharing warning, and that the chat candidate filter requires exact model equality.

- [ ] **Step 2: Run the focused tests and verify expected failures**

Run: `node --test tests/apiKeyDialogExperience.test.mjs tests/apiChatModelControl.test.mjs`

Expected: FAIL because the annotated selector, quota copy, and exact-model filter are absent.

- [ ] **Step 3: Implement the selector and notices**

For Gemini, render the approved profiles as the model options and preserve non-Gemini dynamic discovery. Keep the current form submit and `buildApiKeyPermissions` path unchanged. In the chat console, use the new default for blank metadata, show the selected profile notice, and reject candidate keys whose model differs from the current model.

- [ ] **Step 4: Re-run the focused tests**

Run: `node --test tests/apiKeyDialogExperience.test.mjs tests/apiChatModelControl.test.mjs`

Expected: PASS.

### Task 3: Verification and draft PR

**Files:**
- Verify only the files listed above and generated documentation.

**Interfaces:**
- Consumes: Completed implementation and tests.
- Produces: Verified branch and draft pull request without merge or deployment.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript and production build verification**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 3: Run scoped lint**

Run: `npx eslint src/components/api-management/aiProviderCatalog.ts src/components/api-management/CreateApiKeyDialog.tsx src/components/api-management/ApiChatConsole.tsx`

Expected: exit 0, or report only pre-existing findings without unrelated cleanup.

- [ ] **Step 4: Review diff and create commits**

Confirm only the approved files changed, then commit the design/plan and implementation separately where practical.

- [ ] **Step 5: Push the branch and open a draft PR**

Push `codex/gemini-free-model-policy` and create a draft PR targeting `main`. Do not merge or deploy.

