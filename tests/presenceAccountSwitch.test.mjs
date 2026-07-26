import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPresenceKey,
  isCurrentPresenceSession,
  selectLatestOnlineUsers,
} from "../src/hooks/presenceSession.mjs";

const providerSource = await readFile(
  new URL("../src/hooks/useUserPresence.ts", import.meta.url),
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

test("the provider shares one topic while guarding per-tab identities", () => {
  assert.match(providerSource, /supabase\.channel\("user_presence"/);
  assert.match(providerSource, /createPresenceKey/);
  assert.match(providerSource, /presenceGenerationRef/);
  assert.match(providerSource, /channel\s*\.untrack\(\)/);
  assert.match(providerSource, /supabase\.removeChannel\(channel\)/);
  assert.doesNotMatch(providerSource, /user_presence:\$\{user\.userId\}/);
});
