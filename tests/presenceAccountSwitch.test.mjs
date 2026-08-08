import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as presenceSession from "../src/hooks/presenceSession.mjs";

const {
  createPresenceKey,
  getOrCreatePresenceDeviceId,
  isCurrentPresenceSession,
  selectOnlineAccounts,
  selectOnlinePresenceSessions,
  selectLatestOnlineUsers,
} = presenceSession;

const providerSource = await readFile(
  new URL("../src/hooks/useUserPresence.ts", import.meta.url),
  "utf8",
);
const collaborationSource = await readFile(
  new URL("../src/components/collaboration/CollaborationCenter.tsx", import.meta.url),
  "utf8",
);
const authClientSource = await readFile(
  new URL("../src/integrations/supabase/client.ts", import.meta.url),
  "utf8",
);
const userContextSource = await readFile(
  new URL("../src/components/auth/UserContext.tsx", import.meta.url),
  "utf8",
);

test("presence keys distinguish tabs without isolating accounts", () => {
  assert.equal(createPresenceKey("user-a", "tab-1"), "user-a:tab-1");
  assert.equal(createPresenceKey("user-a", "tab-2"), "user-a:tab-2");
  assert.notEqual(
    createPresenceKey("user-a", "tab-1"),
    createPresenceKey("user-b", "tab-1"),
  );
});

test("presence device identity persists across tabs on one browser", () => {
  assert.equal(
    typeof getOrCreatePresenceDeviceId,
    "function",
    "presence needs a stable per-browser device identity",
  );

  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  const first = getOrCreatePresenceDeviceId(storage);
  const second = getOrCreatePresenceDeviceId(storage);

  assert.equal(first, second);
  assert.ok(first.length > 0);
  assert.equal(values.size, 1);
});

test("online roster keeps separate devices even when they use the same account", () => {
  assert.equal(
    typeof selectOnlinePresenceSessions,
    "function",
    "the UI roster must select device sessions instead of collapsing by account",
  );

  const sessions = selectOnlinePresenceSessions({
    "user-a:device-1": [
      {
        userId: "user-a",
        username: "alpha",
        displayName: "Alpha",
        role: "operator",
        sessionId: "device-1",
        timestamp: 100,
      },
      {
        userId: "user-a",
        username: "alpha",
        displayName: "Alpha",
        role: "operator",
        sessionId: "device-1",
        timestamp: 200,
      },
    ],
    "user-a:device-2": [
      {
        userId: "user-a",
        username: "alpha",
        displayName: "Alpha",
        role: "operator",
        sessionId: "device-2",
        timestamp: 150,
      },
    ],
    "user-b:device-3": [
      {
        userId: "user-b",
        username: "beta",
        displayName: "Beta",
        role: "admin",
        sessionId: "device-3",
        timestamp: 125,
      },
    ],
    "user-c:device-4": [
      {
        userId: "user-c",
        username: "gamma",
        displayName: "Gamma",
        role: "viewer",
        timestamp: 175,
      },
    ],
  });

  assert.equal(sessions.length, 4);
  assert.deepEqual(
    sessions.map((session) => session.sessionId).sort(),
    ["device-1", "device-2", "device-3", "device-4"],
  );
  assert.equal(
    sessions.find((session) => session.sessionId === "device-1")?.timestamp,
    200,
  );
});

test("online sessions are grouped by account without losing the connection count", () => {
  const accounts = selectOnlineAccounts([
    { userId: "user-a", sessionId: "tab-1", displayName: "Alpha", timestamp: 100 },
    { userId: "user-a", sessionId: "tab-2", displayName: "Alpha", timestamp: 200 },
    { userId: "user-b", sessionId: "tab-3", displayName: "Beta", timestamp: 150 },
  ]);

  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].userId, "user-a");
  assert.equal(accounts[0].sessionCount, 2);
  assert.equal(accounts[0].sessionId, "tab-2");
  assert.equal(accounts[1].sessionCount, 1);
});

test("latest roster entry wins for the same account", () => {
  const users = selectLatestOnlineUsers({
    "user-a:tab-1": [
      {
        userId: "user-a",
        username: "alpha",
        displayName: "Alpha",
        role: "operator",
        lastSeen: "2026-07-26T01:00:00.000Z",
        timestamp: 100,
      },
    ],
    "user-a:tab-2": [
      {
        userId: "user-a",
        username: "alpha",
        displayName: "Alpha",
        role: "operator",
        lastSeen: "2026-07-26T02:00:00.000Z",
        timestamp: 200,
      },
    ],
    "user-b:tab-1": [
      {
        userId: "user-b",
        username: "beta",
        displayName: "Beta",
        role: "admin",
        lastSeen: "2026-07-26T01:30:00.000Z",
        timestamp: 150,
      },
    ],
  });

  assert.equal(users.length, 2);
  assert.equal(users[0].userId, "user-a");
  assert.equal(users[0].lastSeen, "2026-07-26T02:00:00.000Z");
  assert.equal(users[1].userId, "user-b");
});

test("stale account callbacks are rejected after an account switch", () => {
  assert.equal(isCurrentPresenceSession(4, 4, "user-b", "user-b"), true);
  assert.equal(isCurrentPresenceSession(5, 4, "user-b", "user-b"), false);
  assert.equal(isCurrentPresenceSession(4, 4, "user-b", "user-a"), false);
});

test("shared-topic account switches finish removing the old channel before creating the replacement", async () => {
  assert.equal(
    typeof presenceSession.createPresenceTransitionQueue,
    "function",
    "presence transitions need one serialized queue",
  );

  const transitions = presenceSession.createPresenceTransitionQueue();
  const oldChannel = { id: "old", topic: "presence:global" };
  const newChannel = { id: "new", topic: "presence:global" };
  let channels = [oldChannel];
  let finishOldRemoval;
  const oldRemovalGate = new Promise((resolve) => {
    finishOldRemoval = resolve;
  });

  const removeOld = transitions.enqueue(async () => {
    await oldRemovalGate;
    // Supabase Realtime removes every channel with the same topic.
    channels = channels.filter((channel) => channel.topic !== oldChannel.topic);
  });
  const createReplacement = transitions.enqueue(async () => {
    channels.push(newChannel);
  });

  await Promise.resolve();
  assert.deepEqual(channels, [oldChannel]);

  finishOldRemoval();
  await Promise.all([removeOld, createReplacement]);
  assert.deepEqual(channels, [newChannel]);
});

test("the provider shares one topic while guarding per-tab identities", () => {
  assert.match(providerSource, /GLOBAL_PRESENCE_TOPIC = "presence:global"/);
  assert.match(providerSource, /LEGACY_PRESENCE_TOPIC = "user_presence"/);
  assert.match(providerSource, /private: isRealtimeAuthenticated/);
  assert.match(providerSource, /createPresenceKey/);
  assert.match(providerSource, /createPresenceSessionId/);
  assert.match(providerSource, /selectOnlinePresenceSessions/);
  assert.match(providerSource, /selectOnlineAccounts/);
  assert.match(providerSource, /totalOnlineSessions/);
  assert.match(providerSource, /currentSessionId/);
  assert.match(providerSource, /presenceGenerationRef/);
  assert.match(providerSource, /createPresenceTransitionQueue/);
  assert.match(providerSource, /(?:presenceTransitionsRef\.current|transitions)\.enqueue/);
  assert.match(providerSource, /channel\s*\.untrack\(\)/);
  assert.match(providerSource, /supabase\.removeChannel\([^)]*channel\)/i);
  assert.doesNotMatch(providerSource, /setInterval/);
  assert.doesNotMatch(providerSource, /Keep the signed-in\s+user visible immediately/);
});

test("collaboration roster combines account directory data with live session counts", () => {
  assert.match(collaborationSource, /onlineAccounts/);
  assert.match(collaborationSource, /sessionCount/);
  assert.match(collaborationSource, /同帳號.*個連線/);
  assert.match(collaborationSource, /totalOnlineSessions/);
  assert.match(collaborationSource, /list_active_collaboration_members/);
  assert.match(collaborationSource, /目前離線/);
});

test("authentication is isolated per browser tab while surviving a refresh", () => {
  assert.match(authClientSource, /window\.sessionStorage/);
  assert.match(authClientSource, /storageKey: authStorageKey/);
  assert.match(authClientSource, /previousSession/);
  assert.doesNotMatch(authClientSource, /storage:\s*localStorage/);
  assert.match(userContextSource, /window\.sessionStorage\.getItem\("user"\)/);
  assert.doesNotMatch(userContextSource, /window\.localStorage\.getItem\("user"\)/);
});
