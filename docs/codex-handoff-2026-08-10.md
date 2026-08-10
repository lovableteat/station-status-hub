# Bringup project handoff - 2026-08-10

## How to continue

Open this file in a new Codex task and continue directly from the repository state. Inspect the current files and Git status before editing. Do not ask the user to repeat the history recorded here.

## Project baseline

- Repository: `C:\Users\pega_user\Desktop\bringup\station-status-hub`
- Branch: `main`
- Remote: `origin/main`
- Remote commit at handoff: `0c71c6b fix: recover material BOM cloud sync`
- Production site: `https://lovableteat.github.io/station-status-hub/`
- Material request page: `https://lovableteat.github.io/station-status-hub/?workspace=station-status&module=material-request`

## Non-negotiable rules

1. Preserve all existing website functions, data, permissions, IDs, and user workflows. A fix is not complete if it breaks another finished feature.
2. Never reset, revert, delete, or overwrite unrelated user changes. The worktree contains intentional local and generated files.
3. Stage and commit only files that belong to the current task. Do not commit temporary folders, generated model files, Supabase temporary files, or unrelated lock/workspace files.
4. Every completed change must be committed and pushed to remote `main`. A local commit is not delivery.
5. Run focused tests, lint, and the production build before pushing. After pushing, verify the remote commit and wait for GitHub Pages before checking the production site.
6. Realtime updates must never reload the whole page, replace the route key, or call `window.location.reload()`. Update only the affected state.
7. Do not report success from local code alone. Verify the deployed behavior whenever the task affects the website UI.

## Priority A: fix the bottom-right chat bar

### User requirement

The collapsed `聊天室` launcher must attach to the exact bottom-right corner of the browser. The right side currently leaves visible empty space.

- Use a fixed bottom-right position with no right or bottom gap.
- Do not reserve page width or alter the width of tables and page content.
- Keep chat collapsed by default. The user must click the bar before chat content appears.
- Preserve the early-Facebook-style corner chat behavior.
- Show an unread numeric badge when messages are waiting.
- Do not show message text in an automatic preview toast.
- Opening and closing chat must not reload the page.
- Check desktop and narrow viewport alignment.

### Relevant files

- `src/components/collaboration/CollaborationCenter.tsx`
- `src/components/collaboration/DirectMessagesPanel.tsx`
- `tests/globalCollaborationCenter.test.mjs`

The floating launcher and panel are in `CollaborationCenter.tsx`. Search for:

- `DirectMessageLauncher`
- `data-floating-direct-messages`
- `aria-label="聊天室"`
- `aria-controls="direct-messages-panel"`

The latest screenshot showing the unwanted right gap is:

`C:\Users\PEGA_U~1\AppData\Local\Temp\codex-clipboard-1f78279b-d2e6-4394-803f-bb2bc2451257.png`

Related history that may help explain the current implementation:

- `1cc0c13 fix: keep direct messages collapsed in chat bar`
- `5a85844 fix: collapse direct messages into chat bar`
- `bdb1562 fix: keep direct messages in corner panel`

Older preview-card specifications are superseded by the current requirement. The closed state is a corner bar only, with no automatic message preview.

### Acceptance checks

- Closed launcher touches the viewport's right and bottom edges.
- No blank strip remains to its right or below it.
- Page content keeps its full width.
- Chat content appears only after clicking the launcher.
- Unread count is visible without exposing message content.
- Existing collaboration, presence, notifications, and direct-message functions still work.

## Priority B: finish the incomplete material BOM recovery

Two local source files contain an unfinished fix and must not be lost:

- `src/components/material-requests/materialBomStorage.ts`
- `src/components/material-requests/materialBomSyncPolicy.ts`

These changes are currently uncommitted. Preserve them and complete the work before committing the BOM fix.

### Confirmed root cause

The production material page can show `雲端同步異常`, remain on `正在切換 BOM`, disable controls, and display only a small partial set of groups.

1. A partial remote record page was treated as a fully loaded BOM.
2. The partial row count overwrote the remote workspace `record_count`, making an incomplete set appear complete.
3. Client-side grouping, filtering, searching, and pagination require the complete record set.
4. Concurrent asynchronous loads share one busy state, so a stale request can clear or replace the state of the latest request.

### Existing unfinished changes

`materialBomStorage.ts` now keeps a partial workspace as not fully loaded and no longer replaces `record_count` with the partial page length.

`materialBomSyncPolicy.ts` now contains:

```ts
export function isLatestBomWorkspaceLoad(completedRequestId: number, latestRequestId: number) {
  return completedRequestId === latestRequestId;
}
```

### Remaining implementation

Complete the fix in these files:

- `src/components/material-requests/MaterialRequestPage.tsx`
- `src/components/material-requests/materialBomStorage.ts`
- `src/components/material-requests/materialBomSyncPolicy.ts`
- `tests/materialBomEgressPolicy.test.mjs`

Required behavior:

- Import and use `isLatestBomWorkspaceLoad` in the page.
- Track workspace loads with a monotonically increasing request ID.
- Only the latest request may clear the current loading state.
- Mark a workspace as `full` only when all remote records were actually loaded.
- Active BOM loads, retries, initial loads, latest reloads, and export snapshots must request the complete record set.
- Remove obsolete partial hydration behavior that can expose incomplete groups.
- Apply search, grouping, filtering, and pagination only after the full record set is available.
- A temporary network failure must show a retryable state without permanently disabling the entire page or reloading it.

### BOM verification

Run:

```powershell
node --test tests/materialBomEgressPolicy.test.mjs
pnpm exec eslint src/components/material-requests/MaterialRequestPage.tsx src/components/material-requests/materialBomStorage.ts src/components/material-requests/materialBomSyncPolicy.ts
pnpm build
```

Tests must cover:

- Active BOM requests complete records.
- Partial records do not overwrite the remote total count.
- Only the latest load request can clear the busy state.

Production acceptance:

- No permanent `雲端同步異常` banner.
- No permanent `正在切換 BOM` state.
- The selected HPM BOM shows approximately 1,027 main groups and 6,606 vendor rows.
- Upload, add, manage, search, filter, paginate, and export controls remain usable.

## Current worktree warning

At handoff, only these two tracked files are intentionally modified for the unfinished BOM fix:

```text
M src/components/material-requests/materialBomStorage.ts
M src/components/material-requests/materialBomSyncPolicy.ts
```

There are many unrelated untracked files, including `.preview-current/`, `supabase/.temp/`, `tmp/`, model `.glb` files, and local pnpm workspace files. Do not add them to a commit unless the user explicitly assigns a task that requires them.

## Delivery checklist

For each completed task:

1. Review the scoped diff and confirm no unrelated files are staged.
2. Run the relevant tests, lint, and `pnpm build`.
3. Commit the scoped files on `main`.
4. Push with `git push origin main`.
5. Confirm the remote `main` SHA matches the local commit.
6. Wait for GitHub Pages deployment and verify the production page.
7. Report the commit SHA, remote push result, tests, build, and deployed behavior.
