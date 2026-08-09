# Clear Direct Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Messenger-style action that clears one direct conversation from the current user's inbox while preserving the other participant's history.

**Architecture:** A per-member `cleared_at` cutoff controls visibility at the PostgreSQL RLS and thread-list levels. The React thread hook invokes a membership-checked RPC and optimistically removes the cleared thread; the conversation list exposes a separate accessible destructive action with confirmation and loading feedback.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, React 18, TypeScript, shadcn UI, Node test runner.

## Global Constraints

- Clearing affects only the current authenticated member and cannot expose or delete the other member's copy.
- Cleared messages must be blocked by RLS, not merely hidden in React.
- Existing single-message sender/admin deletion behavior remains unchanged.
- Do not nest a delete button inside the thread-opening button.
- All user-facing copy is Traditional Chinese.

---

### Task 1: Add the member-scoped history cutoff

**Files:**
- Create: `supabase/migrations/20260809150000_clear_direct_chat_history.sql`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Produces: `public.chat_members.cleared_at timestamptz`
- Produces: `public.clear_direct_chat_history(p_thread_id uuid) RETURNS boolean`
- Preserves: `public.list_direct_chat_threads()` return columns

- [ ] **Step 1: Write the failing migration contract test**

Add source assertions that require the new migration to define `cleared_at`, validate active membership and direct-chat kind, update only `user_id = public.current_system_user_id()`, replace the chat-message SELECT policy with the cutoff, apply the cutoff to latest/unread queries, and hide cleared threads with no newer message.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/realtimeCollaborationV2.test.mjs`

Expected: FAIL because `20260809150000_clear_direct_chat_history.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Create the column and index, then implement an idempotent security-definer function:

```sql
UPDATE public.chat_members
SET cleared_at = clock_timestamp()
WHERE thread_id = p_thread_id
  AND user_id = v_user_id;
```

Replace the message SELECT policy with a membership `EXISTS` condition that also requires `messages.created_at > members.cleared_at` when a cutoff exists. Replace `list_direct_chat_threads()` so both lateral latest-message and unread-count subqueries use `own_member.cleared_at`, and add `AND (own_member.cleared_at IS NULL OR latest.id IS NOT NULL)`.

- [ ] **Step 4: Run the migration contract test and verify GREEN**

Run: `node --test tests/realtimeCollaborationV2.test.mjs`

Expected: all collaboration tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/20260809150000_clear_direct_chat_history.sql tests/realtimeCollaborationV2.test.mjs
git commit -m "feat: add member-scoped chat history clearing"
```

### Task 2: Add the conversation delete action

**Files:**
- Modify: `src/hooks/useDirectMessages.ts`
- Modify: `src/components/collaboration/DirectMessagesPanel.tsx`
- Modify: `tests/realtimeCollaborationV2.test.mjs`

**Interfaces:**
- Consumes: `clear_direct_chat_history(p_thread_id uuid) RETURNS boolean`
- Produces: `clearDirectChat(threadId: string): Promise<boolean>` from `useDirectMessageThreads()`
- Produces: an accessible row action `刪除與 {displayName} 的所有訊息`

- [ ] **Step 1: Write the failing hook and UI contract tests**

Require the hook to call `clear_direct_chat_history`, expose `clearDirectChat`, retain the row on failure, remove it on success, and expose a clear error. Require the UI to use separate sibling buttons, an accessible destructive label, explicit current-account-only confirmation copy, a per-thread loading state, and `Trash2`/`LoaderCircle` feedback.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/realtimeCollaborationV2.test.mjs`

Expected: FAIL because the hook and row action are missing.

- [ ] **Step 3: Implement the hook**

Add a stable callback that validates authentication/thread ID, calls the RPC, sets `對話刪除失敗，請稍後再試。` on failure, and filters the successful thread from `threads`.

- [ ] **Step 4: Implement the row action**

Refactor `ThreadRow` to a non-interactive row container with sibling open and delete buttons. Add `deletingThreadId`, confirm with the participant display name and current-account-only warning, disable the action while pending, and call `clearDirectChat`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test tests/realtimeCollaborationV2.test.mjs tests/globalCollaborationCenter.test.mjs`

Expected: all focused collaboration tests pass.

- [ ] **Step 6: Run quality gates**

```powershell
npx.cmd eslint src/hooks/useDirectMessages.ts src/components/collaboration/DirectMessagesPanel.tsx tests/realtimeCollaborationV2.test.mjs
npm.cmd run build
git diff --check
```

Expected: all commands exit 0; pre-existing bundle warnings are permitted.

- [ ] **Step 7: Commit**

```powershell
git add -- src/hooks/useDirectMessages.ts src/components/collaboration/DirectMessagesPanel.tsx tests/realtimeCollaborationV2.test.mjs
git commit -m "feat: clear direct conversations from the inbox"
```

### Task 3: Deploy and verify

**Files:** No product file changes expected.

**Interfaces:**
- Consumes: committed migration and frontend implementation
- Produces: deployed Supabase RPC/RLS and GitHub Pages frontend on the same `main` revision

- [ ] **Step 1: Re-run the full focused verification**

Run the Task 2 focused tests, ESLint, build, and `git diff --check` again from the final commit.

- [ ] **Step 2: Apply the Supabase migration**

Run the repository's configured Supabase deployment command and verify the remote migration list includes `20260809150000`.

- [ ] **Step 3: Push main and wait for Pages**

```powershell
git push origin main
```

Verify local HEAD equals `refs/heads/main`, then wait for the matching `Deploy to GitHub Pages` workflow to complete successfully.

- [ ] **Step 4: Verify production**

Open the signed-in production message list. Confirm each recent conversation has a delete action, cancel leaves it intact, confirmation copy states that only the current account is cleared, and a successful test conversation clear removes its row without browser errors. Avoid deleting a user's meaningful production conversation solely for verification; use a disposable empty/test thread if available.
