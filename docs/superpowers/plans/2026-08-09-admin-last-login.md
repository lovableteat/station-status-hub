# Admin Last Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every system user's last successful login time in the admin roster.

**Architecture:** Reuse the existing `system_users.last_seen_at` value written by the authenticated login edge function. Add a small deterministic Taiwan-time formatter and render the value in the existing three-column account metadata row, with an explicit never-logged-in fallback.

**Tech Stack:** React 18, TypeScript, JavaScript module utility, Tailwind CSS, Node test runner.

## Global Constraints

- Do not add a database migration or infer login time from online presence.
- Use `Asia/Taipei` and a compact `YYYY/MM/DD HH:mm` display.
- Display `尚未登入` for null or invalid values.
- Preserve the existing account-card height and responsive stacking behavior.

---

### Task 1: Last-login metadata

**Files:**
- Create: `src/components/admin/adminUserTime.mjs`
- Modify: `src/components/admin/AdminPanel.tsx`
- Modify: `tests/adminControlRoomUi.test.mjs`

**Interfaces:**
- Consumes: `SystemUser.last_seen_at: string | null`.
- Produces: `formatAdminUserTimestamp(value, fallback): string` and the `最後登入` account-card field.

- [ ] **Step 1: Write the failing regression tests**

Import `formatAdminUserTimestamp` in `tests/adminControlRoomUi.test.mjs` and assert that a valid UTC timestamp formats in `Asia/Taipei`, while null and invalid values return `尚未登入`. Add source assertions for `last_seen_at`, `最後登入`, and preserving creator information.

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test tests/adminControlRoomUi.test.mjs`

Expected: FAIL because `adminUserTime.mjs` does not exist.

- [ ] **Step 3: Implement timestamp formatting and display**

Create `formatAdminUserTimestamp` using `Intl.DateTimeFormat(...).formatToParts()` with `timeZone: "Asia/Taipei"`, then update `SystemUser` and the account-card metadata row. Render:

```tsx
<div>最後登入</div>
<div>{formatAdminUserTimestamp(systemUser.last_seen_at, "尚未登入")}</div>
```

Move the existing creator label into the permissions strip so the information remains visible without adding card height.

- [ ] **Step 4: Verify GREEN and production build**

Run:

```powershell
node --test tests/adminControlRoomUi.test.mjs tests/realtimeCollaborationV2.test.mjs
npx.cmd eslint src/components/admin/AdminPanel.tsx tests/adminControlRoomUi.test.mjs
npm.cmd run build
```

Expected: tests and targeted lint pass; production build exits 0.

- [ ] **Step 5: Commit, push, and verify deployment**

Commit the implementation, push `main`, wait for the GitHub Pages workflow, and verify the deployed admin roster shows `最後登入` on every visible account card.
