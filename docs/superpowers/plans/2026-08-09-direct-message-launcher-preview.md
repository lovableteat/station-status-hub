# Direct Message Launcher Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the lower-right message launcher into a rectangular card that shows the latest direct-message preview and unread count.

**Architecture:** Add a focused closed-state launcher component inside `CollaborationCenter.tsx`. It consumes the existing `useDirectMessageThreads()` summary hook and unmounts when the full floating message panel opens, preventing duplicate closed/open subscriptions.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, existing direct-message hooks, Node test runner.

## Global Constraints

- Preserve the existing floating panel and click behavior.
- Closed launcher size is 320px by 64px, bounded by the mobile viewport.
- Preview text must truncate rather than resize the card.
- Do not add a new API or database query.

---

### Task 1: Rectangular message preview launcher

**Files:**
- Modify: `tests/globalCollaborationCenter.test.mjs`
- Modify: `src/components/collaboration/CollaborationCenter.tsx`

**Interfaces:**
- Consumes: `useDirectMessageThreads(): { threads, unreadCount, loading, ... }`.
- Produces: `DirectMessageLauncher({ onOpen }): JSX.Element`.

- [x] **Step 1: Write the failing regression test**

Add assertions requiring `DirectMessageLauncher`, `useDirectMessageThreads`, a `h-16 w-[min(320px,calc(100vw-2rem))]` launcher, `lastMessageBody`, the empty-state copy, and an unread badge.

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/globalCollaborationCenter.test.mjs`

Expected: FAIL because the compact button has no preview component or thread data.

- [x] **Step 3: Implement the launcher**

Import `useDirectMessageThreads`, derive the newest thread from the returned ordered summaries, and render:

```tsx
function DirectMessageLauncher({ onOpen }: { onOpen: () => void }) {
  const { threads, unreadCount, loading } = useDirectMessageThreads();
  const latestThread = threads[0] ?? null;
  return (
    <button type="button" onClick={onOpen} className="h-16 w-[min(320px,calc(100vw-2rem))] rounded-xl">
      {/* icon, conversation name, lastMessageBody or empty state, unread badge */}
    </button>
  );
}
```

Replace only the closed-state compact button with `<DirectMessageLauncher onOpen={() => setMessageFloatOpen(true)} />`.

- [x] **Step 4: Verify behavior**

Run:

```powershell
node --test tests/globalCollaborationCenter.test.mjs
npx.cmd eslint src/components/collaboration/CollaborationCenter.tsx tests/globalCollaborationCenter.test.mjs
npm.cmd run build
```

Expected: targeted test and lint pass; production build exits 0.

- [ ] **Step 5: Browser and deployment verification**

Confirm the closed launcher is a rectangular preview card, opens the existing panel, remains viewport-safe, and produces no console errors. Commit and push to `origin/main`, then confirm the GitHub Pages workflow succeeds.
