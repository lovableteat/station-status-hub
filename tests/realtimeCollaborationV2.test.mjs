import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authenticated account migration preserves legacy IDs and fallback login", async () => {
  const [migration, context, loginFunction] = await Promise.all([
    readSource("supabase/migrations/20260729120000_realtime_collaboration_v2.sql"),
    readSource("src/components/auth/UserContext.tsx"),
    readSource("supabase/functions/account-login/index.ts"),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS auth_user_id uuid/i);
  assert.match(migration, /current_system_user_id\(\)/i);
  assert.doesNotMatch(migration, /DROP TABLE public\.system_users/i);
  assert.doesNotMatch(migration, /DROP FUNCTION.*authenticate_user/i);
  assert.match(migration, /created_by uuid REFERENCES public\.system_users\(id\) ON DELETE SET NULL/i);
  assert.match(migration, /sender_id uuid REFERENCES public\.system_users\(id\) ON DELETE SET NULL/i);
  assert.match(context, /supabase\.functions\.invoke<AccountLoginPayload>\("account-login"/);
  assert.match(context, /Compatibility path/);
  assert.match(context, /REALTIME_COLLABORATION_V2_ENABLED/);
  assert.match(context, /supabase\.rpc\("authenticate_user"/);
  assert.match(loginFunction, /admin\.auth\.admin\.createUser/);
  assert.match(loginFunction, /auth\.signInWithPassword/);
});

test("presence reports real sync state without fake users or page refreshes", async () => {
  const [source, workspaceSource] = await Promise.all([
    readSource("src/hooks/useUserPresence.ts"),
    readSource("src/components/pcb-designer/hooks/usePcbProjectPresence.ts"),
  ]);

  assert.match(source, /"subscribed"/);
  assert.match(source, /"tracking"/);
  assert.match(source, /"synced"/);
  assert.match(source, /response !== "ok"/);
  assert.match(source, /containsSession/);
  assert.match(source, /LEGACY_PRESENCE_TOPIC = "user_presence"/);
  assert.doesNotMatch(source, /visibleOnlineUsers/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /location\.reload|window\.location\.assign/);
  assert.match(workspaceSource, /presence:workspace:pcb:/);
  assert.match(workspaceSource, /private: isRealtimeAuthenticated/);
  assert.match(workspaceSource, /pcb_project_presence:/);
});

test("direct messages are member-only, incremental, retryable, and idempotent", async () => {
  const [migration, hook] = await Promise.all([
    readSource("supabase/migrations/20260729120000_realtime_collaboration_v2.sql"),
    readSource("src/hooks/useDirectMessages.ts"),
  ]);

  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /public\.is_chat_member\(thread_id\)/i);
  assert.match(migration, /sender_id = public\.current_system_user_id\(\)/i);
  assert.match(migration, /UNIQUE \(sender_id, client_id\)/i);
  assert.match(migration, /realtime\.broadcast_changes/i);
  assert.match(migration, /chat-inbox:/i);
  assert.match(hook, /channel\(`chat-inbox:/);
  assert.match(hook, /delivery: "sending"/);
  assert.match(hook, /delivery: "failed"/);
  assert.match(hook, /retryMessage/);
  assert.match(hook, /TYPING_THROTTLE_MS = 500/);
  assert.doesNotMatch(hook, /location\.reload|window\.location\.assign|setInterval/);
});

test("collaboration changes never replace the current page", async () => {
  const sources = await Promise.all([
    readSource("src/components/auth/UserContext.tsx"),
    readSource("src/hooks/useUserPresence.ts"),
    readSource("src/hooks/useDirectMessages.ts"),
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
  ]);
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /window\.location\.reload|location\.reload|document\.location/);
  assert.doesNotMatch(combined, /setInterval/);
});
