import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI workspace conversations are private to the authenticated system account", async () => {
  const migration = await readSource(
    "supabase/migrations/20260731210000_private_ai_workspace_conversations.sql",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ai_workspace_conversations/i);
  assert.match(migration, /owner_id uuid NOT NULL REFERENCES public\.system_users\(id\)/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(
    migration,
    /USING \(owner_id = public\.current_system_user_id\(\)\)/i,
    "each account must only read its own conversation rows",
  );
  assert.match(migration, /REVOKE ALL ON TABLE public\.ai_workspace_conversations FROM anon/i);
  assert.match(migration, /TO authenticated/i);
  assert.match(migration, /v_owner_id <> p_owner_id/i);
  assert.match(migration, /jsonb_array_length\(p_items\) > 24/i);
});

test("AI workspace conversation history loads from account cloud storage across devices", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /\.from\("ai_workspace_conversations"\)/);
  assert.match(source, /\.eq\("owner_id", ownerId\)/);
  assert.match(source, /\.rpc\("sync_ai_workspace_conversations"/);
  assert.match(source, /p_owner_id: ownerId/);
  assert.match(source, /conversationRemoteReadyRef\.current = true/);
  assert.match(source, /setTimeout\([\s\S]*?900\)/);
  assert.match(source, /帳號雲端/);
  assert.match(source, /換電腦登入也能繼續使用/);
});

test("legacy browser-shared history is removed and cloud sync never reloads the page", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /localStorage\.removeItem\(LEGACY_SAVED_CONVERSATIONS_STORAGE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(LEGACY_SAVED_CONVERSATIONS_STORAGE_KEY\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\(LEGACY_SAVED_CONVERSATIONS_STORAGE_KEY/);
  assert.doesNotMatch(source, /window\.location\.reload|location\.reload|window\.location\.assign/);
});

test("existing team shared prompt library remains available", async () => {
  const source = await readSource("src/components/api-management/ApiChatConsole.tsx");

  assert.match(source, /\.from\("command_library"\)/);
  assert.match(source, /api-chat-shared-prompts/);
  assert.match(source, /共享提示詞庫/);
});
