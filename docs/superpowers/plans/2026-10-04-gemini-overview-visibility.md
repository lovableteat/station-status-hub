# Gemini Overview Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the complete approved Gemini model policy directly on the API key management overview and connect each existing Gemini key to its saved model without changing secret access.

**Architecture:** Reuse the static Gemini profiles already exported by `aiProviderCatalog.ts`. Derive saved model assignments from the existing `apiKeys` state in `ApiKeyManagement.tsx`, render one responsive policy panel, and enrich the existing model cell. Keep all key reveal and copy behavior in the existing table.

**Tech Stack:** React, TypeScript, Tailwind-compatible classes, existing admin CSS, Node test runner.

## Global Constraints

- Do not create, duplicate, log, or transmit API keys.
- Preserve the existing mask, eye reveal, copy, test, edit, status, and delete permission boundaries.
- Never treat `usage_count` as daily usage or remaining Google quota.
- Only the three approved Gemini models may receive screenshot quota labels.
- Remaining Google quota must stay explicitly unsynced.

---

### Task 1: Add the overview regression contract

**Files:**
- Create: `tests/apiKeyOverviewExperience.test.mjs`

**Interfaces:**
- Consumes: `ApiKeyManagement.tsx` and `admin-panel.css` as UTF-8 source.
- Produces: A regression contract for the required overview and preserved key controls.

- [ ] **Step 1: Write the failing test**

```js
test("API key overview exposes Gemini policy without weakening key masking", async () => {
  const source = await read("../src/components/api-management/ApiKeyManagement.tsx");
  assert.match(source, /data-admin-zone="gemini-free-model-policy"/);
  assert.match(source, /GEMINI_FREE_MODEL_PROFILES\.map/);
  assert.match(source, /目前儲存模型/);
  assert.match(source, /剩餘額：未同步 Google/);
  assert.match(source, /累積呼叫次數，不代表每日已用或剩餘配額/);
  assert.match(source, /maskApiKey\(apiKey\.api_key, visibleKeys\.has\(apiKey\.id\)\)/);
  assert.match(source, /copyToClipboard\(apiKey\.api_key\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs`

Expected: FAIL because the overview zone and copy do not exist.

### Task 2: Render the policy and saved-model relationship

**Files:**
- Modify: `src/components/api-management/ApiKeyManagement.tsx`
- Modify: `src/components/admin/admin-panel.css`
- Test: `tests/apiKeyOverviewExperience.test.mjs`

**Interfaces:**
- Consumes: `GEMINI_DEFAULT_MODEL`, `GEMINI_FREE_MODEL_PROFILES`, `formatGeminiQuotaSummary`, and `getGeminiFreeModelProfile`.
- Produces: A responsive overview panel and enriched Gemini model cells.

- [ ] **Step 1: Import the shared Gemini policy**

```ts
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_FREE_MODEL_PROFILES,
  formatGeminiQuotaSummary,
  getGeminiFreeModelProfile,
} from "./aiProviderCatalog";
```

- [ ] **Step 2: Derive Gemini key assignments without reading new data**

```ts
const geminiAssignments = useMemo(
  () => apiKeys.flatMap((record) => {
    const metadata = normalizeApiKeyPermissions(record.permissions).metadata;
    return metadata.provider.trim().toLowerCase() === "gemini"
      ? [{ record, model: metadata.model.trim() }]
      : [];
  }),
  [apiKeys],
);
```

- [ ] **Step 3: Render the overview and enrich the model cell**

Map `GEMINI_FREE_MODEL_PROFILES`, show the formatted limit, explicit unsynced state, and matching key names. In each Gemini table row, show **Currently saved model**, the stored ID, its matching quota when approved, and the unsynced state. Leave unknown saved models unchanged and unlabeled with invented quota.

- [ ] **Step 4: Clarify Usage Count**

Replace its help text with **Cumulative call count; not daily usage or remaining quota.**

- [ ] **Step 5: Add responsive admin styles**

Add `.admin-api-gemini-policy`, `.admin-api-gemini-grid`, and model-card states using the existing restrained maintenance palette. Collapse the three-column grid at narrow widths.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node --test tests/apiKeyOverviewExperience.test.mjs`

Expected: PASS.

### Task 3: Verify and deliver

**Files:**
- Verify all modified source and test files.

- [ ] **Step 1: Run verification**

Run:

```powershell
npm test
npm run typecheck
npx eslint src/components/api-management/ApiKeyManagement.tsx
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Commit and create the PR**

```powershell
git add docs/superpowers/specs/2026-10-04-gemini-overview-visibility-design.md docs/superpowers/plans/2026-10-04-gemini-overview-visibility.md tests/apiKeyOverviewExperience.test.mjs src/components/api-management/ApiKeyManagement.tsx src/components/admin/admin-panel.css
git commit -m "fix: show Gemini quotas on API key overview"
git push -u origin codex/gemini-overview-visibility
```

- [ ] **Step 3: Merge and deploy**

Require PR checks to pass, merge with an exact head guard, watch the existing GitHub Pages workflow to success, and verify the live hashed assets contain all required policy copy.

