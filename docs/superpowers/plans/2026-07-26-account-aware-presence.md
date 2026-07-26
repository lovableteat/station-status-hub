# Account-aware Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make online-member presence update correctly across account switches while keeping different accounts visible to one another.

**Architecture:** Extract deterministic presence session helpers, then rebuild `useUserPresence` around one shared Supabase topic, per-tab keys and a connection generation guard.

**Tech Stack:** React hooks, TypeScript, Supabase Realtime Presence, Node test runner, Vite.

## Global Constraints

- Keep one shared topic so different accounts receive the same roster.
- Deduplicate multiple tabs by `userId`.
- Never let an old subscription callback track or display the previous account.
- Push item 2 independently to `main` after item 1 is deployed.

---

### Task 1: Add failing session tests

**Files:**
- Create: `src/hooks/presenceSession.ts`
- Create: `tests/presenceAccountSwitch.test.mjs`
- Modify: `src/hooks/useUserPresence.ts`

**Interfaces:**
- Produces: `createPresenceKey(userId, sessionId)`, `selectLatestOnlineUsers(state)`, `isCurrentPresenceSession(...)`.

- [ ] **Step 1: Write the test**

```js
test("presence keys distinguish tabs without isolating accounts", () => {
  assert.equal(session.createPresenceKey("user-a", "tab-1"), "user-a:tab-1");
  assert.equal(session.createPresenceKey("user-a", "tab-2"), "user-a:tab-2");
});

test("latest roster entry wins for the same account", () => {
  const users = session.selectLatestOnlineUsers({
    "user-a:tab-1": [{ userId: "user-a", lastSeen: "2026-07-26T01:00:00Z" }],
    "user-a:tab-2": [{ userId: "user-a", lastSeen: "2026-07-26T02:00:00Z" }],
  });
  assert.equal(users.length, 1);
  assert.equal(users[0].lastSeen, "2026-07-26T02:00:00Z");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/presenceAccountSwitch.test.mjs`

Expected: fails because `presenceSession.ts` has no implementation.

### Task 2: Implement shared-topic account-safe presence

**Files:**
- Modify: `src/hooks/presenceSession.ts`
- Modify: `src/hooks/useUserPresence.ts`
- Test: `tests/presenceAccountSwitch.test.mjs`

**Interfaces:**
- `selectLatestOnlineUsers` returns sorted `OnlineUser[]`.
- Provider ref stores `{ channel, generation, identity }`.

- [ ] **Step 1: Implement helpers**

```ts
export function createPresenceKey(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
}

export function isCurrentPresenceSession(
  currentGeneration: number,
  candidateGeneration: number,
  currentUserId: string | null,
  candidateUserId: string,
) {
  return currentGeneration === candidateGeneration && currentUserId === candidateUserId;
}
```

Implement roster flattening with a `Map<string, OnlineUser>` and latest `lastSeen`.

- [ ] **Step 2: Replace the per-user topic**

Use topic `user_presence` and presence key `createPresenceKey(user.userId, tabSessionIdRef.current)`.

- [ ] **Step 3: Guard callbacks**

Capture `generation` and `identity` inside the effect. Before `sync`, `subscribe` status changes or tracking, call `isCurrentPresenceSession`.

- [ ] **Step 4: Make cleanup channel-local**

Clear the provider ref only when it still points to the captured channel. Call `channel.untrack().catch(...).finally(() => supabase.removeChannel(channel))`.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/presenceAccountSwitch.test.mjs tests/globalCollaborationCenter.test.mjs tests/onlineUsersHeaderPlacement.test.mjs`

Expected: all tests pass.

### Task 3: Multi-session verification and publish item 2

**Files:**
- Verify: `src/hooks/useUserPresence.ts`
- Verify: `src/components/collaboration/CollaborationCenter.tsx`

- [ ] **Step 1: Run lint and build**

Run: `npx eslint src/hooks/useUserPresence.ts src/hooks/presenceSession.ts tests/presenceAccountSwitch.test.mjs`

Run: `npm run build`

Expected: both succeed.

- [ ] **Step 2: Browser verification**

Open two isolated browser contexts with different accounts; confirm both cards appear. In one context switch accounts; confirm the old card disappears and the new identity appears without refreshing.

- [ ] **Step 3: Publish**

Fetch `origin/main`, require zero remote-only commits, commit with `fix(presence): update roster on account switch`, push `HEAD:main`, and verify GitHub Pages.

