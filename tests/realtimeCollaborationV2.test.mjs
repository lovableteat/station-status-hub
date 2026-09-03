import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authenticated account migration preserves legacy IDs and fallback login", async () => {
  const [migration, loginCompatibilityMigration, context, loginFunction] = await Promise.all([
    readSource("supabase/migrations/20260729120000_realtime_collaboration_v2.sql"),
    readSource("supabase/migrations/20260729143000_authenticate_user_nullable_safe.sql"),
    readSource("src/components/auth/UserContext.tsx"),
    readSource("supabase/functions/account-login/index.ts"),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS auth_user_id uuid/i);
  assert.match(migration, /current_system_user_id\(\)/i);
  assert.doesNotMatch(migration, /WITH\s+current_user\s+AS/i);
  assert.doesNotMatch(migration, /DROP TABLE public\.system_users/i);
  assert.match(loginCompatibilityMigration, /user_record\.id IS NOT NULL/);
  assert.doesNotMatch(loginCompatibilityMigration, /user_record IS NOT NULL/);
  assert.doesNotMatch(migration, /DROP FUNCTION.*authenticate_user/i);
  assert.match(migration, /created_by uuid REFERENCES public\.system_users\(id\) ON DELETE SET NULL/i);
  assert.match(migration, /sender_id uuid REFERENCES public\.system_users\(id\) ON DELETE SET NULL/i);
  assert.match(context, /supabase\.functions\.invoke<AccountLoginPayload>\("account-login"/);
  assert.match(context, /await supabase\.realtime\.setAuth\(session\.access_token\)/);
  assert.match(context, /Legacy deployment path/);
  assert.match(context, /REALTIME_COLLABORATION_V2_ENABLED/);
  assert.match(context, /supabase\.rpc\("authenticate_user"/);
  assert.match(loginFunction, /admin\.auth\.admin\.createUser/);
  assert.match(loginFunction, /auth\.signInWithPassword/);
  assert.match(loginFunction, /auth\.station-status\.example\.com/);
  assert.doesNotMatch(loginFunction, /station-status\.local/);
});

test("session profile restore keeps the Supabase RPC method bound to its client", async () => {
  const context = await readSource("src/components/auth/UserContext.tsx");

  assert.doesNotMatch(
    context,
    /const\s+rpc\s*=\s*supabase\.rpc\s+as\b/,
    "extracting rpc loses the Supabase client `this.rest` binding",
  );
  assert.match(
    context,
    /supabase\.rpc\.bind\(supabase\)/,
    "profile restore must call a bound Supabase RPC method",
  );
});

test("realtime presence uses a current Supabase protocol client", async () => {
  const packageJson = JSON.parse(await readSource("package.json"));
  const declaredVersion = packageJson.dependencies?.["@supabase/supabase-js"] ?? "";
  const match = declaredVersion.match(/(\d+)\.(\d+)\.(\d+)/);

  assert.ok(match, "Supabase client dependency must declare a semantic version");
  const [, major, minor] = match.map(Number);
  assert.ok(
    major > 2 || (major === 2 && minor >= 100),
    `Supabase ${declaredVersion} is too old for the deployed Realtime v2 protocol`,
  );
});

test("stale cached sessions use the same login page before private providers mount", async () => {
  const [context, app, index, loginPage] = await Promise.all([
    readSource("src/components/auth/UserContext.tsx"),
    readSource("src/App.tsx"),
    readSource("src/pages/Index.tsx"),
    readSource("src/components/auth/LoginPage.tsx"),
  ]);

  assert.match(context, /requiresRealtimeUpgrade: boolean/);
  assert.match(context, /useState\(!demoUser\)/);
  assert.match(context, /runSessionBootstrapWithDeadline/);
  assert.match(
    context,
    /runSessionBootstrapWithDeadline\(\s*\(\) => supabase\.auth\.getSession\(\)/,
  );
  assert.match(
    context,
    /await supabase\.auth\.setSession\(/,
  );
  assert.doesNotMatch(
    context,
    /runSessionBootstrapWithDeadline\(\s*\(\) =>\s*supabase\.auth\.setSession\(/,
    "setSession must not continue as an untracked late operation after an application timeout",
  );
  assert.match(
    context,
    /runSessionBootstrapWithDeadline\(\s*\(\) => userFromSession\(session\)/,
  );
  assert.match(
    context,
    /supabase\.auth\.getUser\(session\.access_token\)/,
    "metadata fallback must be re-fetched from the Auth server",
  );
  assert.doesNotMatch(
    context,
    /let authenticatedUser = userFromMetadata\(session\)/,
    "browser-stored session metadata must not bypass server profile verification",
  );
  assert.match(context, /sessionResult\.status !== "fulfilled"/);
  const bootstrapFailureBlock = context.match(
    /if \(sessionResult\.status !== "fulfilled"\) \{([\s\S]*?)\r?\n\s*\}\r?\n\r?\n\s*if \(sessionResult\.value\.error\)/,
  )?.[1];
  assert.match(
    bootstrapFailureBlock ?? "",
    /setUser\(null\)[\s\S]*?setSessionMode\("signed-out"\)[\s\S]*?storeUser\(null\)/,
    "an unverified cached identity must be cleared when session bootstrap fails",
  );
  assert.doesNotMatch(context, /await authorizeRealtime\(/);
  assert.match(
    context,
    /REALTIME_COLLABORATION_V2_ENABLED\s*&&\s*user !== null\s*&&\s*sessionMode === "legacy"/,
  );
  assert.match(context, /if \(REALTIME_COLLABORATION_V2_ENABLED\) \{[\s\S]*throw normalizeThrownError/);
  assert.match(context, /Legacy deployment path/);

  assert.match(app, /function ApplicationSessionGate/);
  assert.match(app, /requiresRealtimeUpgrade/);
  assert.doesNotMatch(app, /RealtimeSessionUpgradePage/);
  assert.match(
    app,
    /if \(requiresRealtimeUpgrade \|\| !isLoggedIn\) \{\s*return <LoginPage \/>;\s*\}/,
    "signed-out and legacy-session states must render one shared login page",
  );
  assert.match(
    app,
    /<ApplicationSessionGate>[\s\S]*<UserPresenceProvider>[\s\S]*<\/UserPresenceProvider>[\s\S]*<\/ApplicationSessionGate>/,
  );
  assert.doesNotMatch(
    index,
    /LoginPage|if \(!isLoggedIn\)|if \(isInitializing\)/,
    "the application session gate must be the only owner of the login screen",
  );

  assert.match(loginPage, /useState\(\(\) => user\?\.username \?\? ""\)/);
  assert.match(loginPage, /requiresRealtimeUpgrade/);
  assert.match(loginPage, /重新驗證後即可恢復完整功能/);
  assert.match(loginPage, /autoComplete="current-password"/);
  assert.doesNotMatch(loginPage, /localStorage|sessionStorage/);
});

test("presence reports real sync state without fake users or page refreshes", async () => {
  const [source, workspaceSource, realtimePolicy] = await Promise.all([
    readSource("src/hooks/useUserPresence.ts"),
    readSource("src/components/pcb-designer/hooks/usePcbProjectPresence.ts"),
    readSource("supabase/migrations/20260729150000_realtime_authorization_direct_identity.sql"),
  ]);

  assert.match(source, /"subscribed"/);
  assert.match(source, /"tracking"/);
  assert.match(source, /"synced"/);
  assert.match(source, /response !== "ok"/);
  assert.match(source, /containsSession/);
  assert.match(source, /await supabase\.realtime\.setAuth\(accessToken\)/);
  assert.match(source, /LEGACY_PRESENCE_TOPIC = "user_presence"/);
  assert.doesNotMatch(source, /visibleOnlineUsers/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /location\.reload|window\.location\.assign/);
  assert.match(workspaceSource, /presence:workspace:pcb:/);
  assert.match(workspaceSource, /private: isRealtimeAuthenticated/);
  assert.match(workspaceSource, /pcb_project_presence:/);
  assert.match(realtimePolicy, /users\.auth_user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(realtimePolicy, /users\.status = 'active'/);
  assert.match(realtimePolicy, /extension IN \('broadcast', 'presence'\)/);
});

test("admin account lifecycle updates system and Auth identities as one operation", async () => {
  const [adminFunction, adminPanel, userEditor, accountSync] = await Promise.all([
    readSource("supabase/functions/account-admin-sync/index.ts"),
    readSource("src/components/admin/AdminPanel.tsx"),
    readSource("src/components/admin/UserEditDialog.tsx"),
    readSource("src/components/admin/authAccountSync.ts"),
  ]);

  assert.match(adminFunction, /"create" \| "update" \| "sync" \| "delete"/);
  assert.match(adminFunction, /synchronizeAuthIdentity/);
  assert.match(adminFunction, /password_hash: target\.password_hash/);
  assert.match(adminFunction, /admin\.auth\.admin\.deleteUser/);
  assert.match(adminFunction, /auth\.station-status\.example\.com/);
  assert.match(adminPanel, /action: "create"/);
  assert.match(adminPanel, /action: "update"/);
  assert.match(adminPanel, /action: "delete"/);
  assert.match(adminPanel, /isRealtimeAuthenticated/);
  assert.match(adminPanel, /rejectUnauthenticatedAccountMutation/);
  assert.match(adminPanel, /newUser\.password\.length < 6/);
  assert.match(adminPanel, /minLength=\{6\}/);
  assert.match(adminPanel, /即時身分已連結/);
  assert.match(userEditor, /mutateAuthAccount\(userId/);
  assert.doesNotMatch(adminPanel, /await syncAuthAccount/);
  assert.match(accountSync, /supabase\.auth\.getSession\(\)/);
  assert.match(accountSync, /readFunctionError/);
});

test("direct messages are member-only, incremental, retryable, and idempotent", async () => {
  const [migration, deletionMigration, hook] = await Promise.all([
    readSource("supabase/migrations/20260729120000_realtime_collaboration_v2.sql"),
    readSource("supabase/migrations/20260809120000_direct_chat_message_deletion.sql"),
    readSource("src/hooks/useDirectMessages.ts"),
  ]);

  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /public\.is_chat_member\(thread_id\)/i);
  assert.match(migration, /sender_id = public\.current_system_user_id\(\)/i);
  assert.match(migration, /UNIQUE \(sender_id, client_id\)/i);
  assert.match(migration, /realtime\.broadcast_changes/i);
  assert.match(migration, /chat-inbox:/i);
  assert.match(deletionMigration, /delete_direct_chat_message/i);
  assert.match(deletionMigration, /v_role NOT IN \('admin', 'super_admin'\)/i);
  assert.match(hook, /deleteMessage/);
  assert.match(hook, /deleted_at/);
  assert.match(hook, /channel\(`chat-inbox:/);
  assert.match(hook, /delivery: "sending"/);
  assert.match(hook, /delivery: "failed"/);
  assert.match(hook, /retryMessage/);
  assert.match(hook, /TYPING_THROTTLE_MS = 500/);
  assert.doesNotMatch(hook, /location\.reload|window\.location\.assign|setInterval/);
});

test("direct conversation clearing is private to the current member and enforced by RLS", async () => {
  const migration = await readSource(
    "supabase/migrations/20260809150000_clear_direct_chat_history.sql",
  ).catch(() => "");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.chat_history_clears/i);
  assert.match(migration, /cleared_at timestamptz NOT NULL/i);
  assert.doesNotMatch(migration, /ALTER TABLE public\.chat_members[\s\S]*ADD COLUMN IF NOT EXISTS cleared_at/i);
  assert.match(migration, /clear_direct_chat_history\s*\(p_thread_id uuid\)/i);
  assert.match(migration, /threads\.kind = 'direct'/i);
  assert.match(migration, /members\.user_id = v_user_id/i);
  assert.match(
    migration,
    /INSERT INTO public\.chat_history_clears[\s\S]*ON CONFLICT \(thread_id, user_id\)[\s\S]*cleared_at = excluded\.cleared_at/i,
  );
  assert.match(
    migration,
    /chat_messages\.created_at > coalesce\([\s\S]*clears\.cleared_at[\s\S]*'-infinity'::timestamptz\)/i,
    "message RLS must prevent cleared history from being queried directly",
  );
  assert.match(migration, /LEFT JOIN public\.chat_history_clears AS own_clear/i);
  assert.match(migration, /latest_messages\.created_at > own_clear\.cleared_at/i);
  assert.match(migration, /unread\.created_at > own_clear\.cleared_at/i);
  assert.match(migration, /own_clear\.cleared_at IS NULL OR latest\.id IS NOT NULL/i);
  assert.match(
    migration,
    /'chat-inbox:' \|\| NEW\.user_id::text[\s\S]*AFTER INSERT OR UPDATE ON public\.chat_history_clears/i,
    "clearing must notify only the clearing member's inbox",
  );
  assert.match(migration, /CREATE POLICY "Users can read their own chat history clears"/i);
  assert.match(migration, /user_id = public\.current_system_user_id\(\)/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.broadcast_chat_message_change\(\)[\s\S]*realtime\.send\(/i);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.broadcast_chat_message_change\(\)[\s\S]*realtime\.broadcast_changes\(/i,
    "message broadcasts must not expose full database rows",
  );
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.clear_direct_chat_history\(uuid\) TO authenticated/i);
});

test("conversation rows can clear all locally visible messages without affecting the other member", async () => {
  const [hook, panel] = await Promise.all([
    readSource("src/hooks/useDirectMessages.ts"),
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
  ]);

  assert.match(hook, /const clearDirectChat = useCallback/);
  assert.match(hook, /database\.rpc\("clear_direct_chat_history"/);
  assert.match(hook, /p_thread_id: threadId/);
  assert.match(hook, /setThreads\(\(current\) => current\.filter\(\(thread\) => thread\.threadId !== threadId\)\)/);
  assert.match(hook, /對話刪除失敗，請稍後再試。/);
  assert.match(hook, /station-direct-chat-cleared/);
  assert.match(hook, /loadVisibleMessage\(recordId\)/);
  assert.match(hook, /replaceVisibleDirectMessages/);
  assert.doesNotMatch(hook, /mergeMessages\(current, \[mapMessage\(record\)\]\)/);
  assert.match(hook, /return \{ threads, unreadCount, loading, error, reload, startDirectChat, clearDirectChat \}/);

  assert.match(panel, /const \[deletingThreadIds, setDeletingThreadIds\] = useState<Set<string>>/);
  assert.match(panel, /aria-label=\{`刪除與 \$\{displayName\} 的對話`\}/);
  assert.match(panel, /這只會清除目前聊天列表中的顯示內容，刪除後無法復原。/);
  assert.match(panel, /await clearDirectChat\(thread\.threadId\)/);
  assert.match(panel, /deletingThreadIds\.has\(thread\.threadId\)/);
  assert.match(panel, /setPendingDirectThread/);
  assert.match(panel, /deleting \? <LoaderCircle[^>]*animate-spin[^>]*\/> : <Trash2/s);
  assert.match(panel, /<div[^>]*data-direct-thread-row="true"[^>]*>[\s\S]*?<button[\s\S]*?<\/button>[\s\S]*?<button/s);
  assert.match(panel, /data-density="compact"/);
  assert.match(panel, /h-\[66px\]/);
  assert.match(panel, /\[contain-intrinsic-size:66px\]/);
  assert.match(panel, /\[content-visibility:auto\]/);
  assert.match(panel, /data-direct-messages-toolbar="compact"/);
  assert.doesNotMatch(panel, /rounded-\[26px\]|line-clamp-2/);
});

test("direct-message state replacement purges cleared sent rows and tracks concurrent clears", async () => {
  const state = await import("../src/components/collaboration/directMessageState.mjs").catch(() => ({}));
  assert.equal(typeof state.replaceVisibleDirectMessages, "function");
  assert.equal(typeof state.setPendingDirectThread, "function");

  const current = [
    { id: "old-sent", clientId: "old", createdAt: "2026-08-01T00:00:00Z", delivery: "sent" },
    { id: "optimistic", clientId: "new", createdAt: "2026-08-09T00:00:00Z", delivery: "sending" },
  ];
  assert.deepEqual(
    state.replaceVisibleDirectMessages(current, []),
    [current[1]],
    "an authoritative empty RLS result must purge previously sent history while preserving an optimistic send",
  );
  assert.deepEqual(
    state.replaceVisibleDirectMessages(current, [
      { id: "latest", clientId: "latest", createdAt: "2026-08-08T00:00:00Z", delivery: "sent" },
    ]).map((message) => message.id),
    ["old-sent", "latest", "optimistic"],
    "a normal latest-page refresh must preserve older pages and optimistic sends",
  );
  assert.deepEqual(
    state.replaceVisibleDirectMessages(current, [
      { id: "latest", clientId: "latest", createdAt: "2026-08-08T00:00:00Z", delivery: "sent" },
    ], "2026-08-07T00:00:00Z").map((message) => message.id),
    ["latest", "optimistic"],
    "a personal clear cutoff must purge only sent rows at or before the cutoff",
  );

  let pending = state.setPendingDirectThread(new Set(), "thread-a", true);
  pending = state.setPendingDirectThread(pending, "thread-b", true);
  pending = state.setPendingDirectThread(pending, "thread-a", false);
  assert.deepEqual([...pending], ["thread-b"]);
});

test("direct chat media storage is private, member-scoped, and created atomically", async () => {
  const migration = await readSource(
    "supabase/migrations/20260809170000_direct_chat_media.sql",
  ).catch(() => "");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.chat_message_attachments/i);
  assert.match(migration, /media_kind text NOT NULL CHECK \(media_kind IN \('image', 'video'\)\)/i);
  assert.match(migration, /ALTER TABLE public\.chat_message_attachments ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /INSERT INTO storage\.buckets[\s\S]*'chat-media'[\s\S]*false[\s\S]*52428800/i);
  for (const mimeType of [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime",
  ]) {
    assert.match(migration, new RegExp(mimeType.replace("/", "\\/"), "i"));
  }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.can_read_chat_media_object\(p_name text\)/i);
  assert.match(migration, /messages\.created_at > coalesce\([\s\S]*clears\.cleared_at/i);
  assert.match(migration, /CREATE POLICY "Chat members can read visible media"[\s\S]*ON storage\.objects FOR SELECT/i);
  assert.match(migration, /CREATE POLICY "Chat members can upload media"[\s\S]*ON storage\.objects FOR INSERT/i);
  assert.match(migration, /CREATE POLICY "Senders and admins can delete media"[\s\S]*ON storage\.objects FOR DELETE/i);
  assert.match(migration, /send_direct_chat_message\([\s\S]*p_attachments jsonb/i);
  assert.match(migration, /jsonb_array_length\(v_attachments\) > 4/i);
  assert.match(migration, /char_length\(v_body\) = 0 AND jsonb_array_length\(v_attachments\) = 0/i);
  assert.match(migration, /FROM storage\.objects[\s\S]*bucket_id = 'chat-media'/i);
  assert.match(migration, /ON CONFLICT \(sender_id, client_id\) DO NOTHING/i);
  assert.doesNotMatch(migration, /SET body = excluded\.body/i);
  assert.match(migration, /REVOKE INSERT ON public\.chat_messages FROM authenticated/i);
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.delete_direct_chat_message\(uuid\)/i);
  assert.match(migration, /jsonb_build_object\([\s\S]*'storage_paths'/i);
  assert.match(migration, /傳送了照片|傳送了影片|個附件/);
});

test("direct chat attachment paths avoid ambiguous boolean and integer operators", async () => {
  const migration = await readSource(
    "supabase/migrations/20260813060000_fix_direct_chat_media_path_validation.sql",
  );

  assert.match(
    migration,
    /left\(v_storage_path, char_length\(v_expected_prefix\)\) <> v_expected_prefix/i,
  );
  assert.match(migration, /strpos\(v_storage_path, '\.\.'\) > 0/i);
  assert.doesNotMatch(
    migration,
    /NOT LIKE v_expected_prefix \|\| position\('\.\.' IN v_storage_path\) > 0/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.send_direct_chat_message\(uuid, uuid, text, jsonb\)/i,
  );
});

test("direct chat media helpers validate limits, create safe paths, and label previews", async () => {
  const media = await import("../src/components/collaboration/directMessageMedia.mjs").catch(() => ({}));
  assert.equal(typeof media.validateDirectMessageFiles, "function");
  assert.equal(typeof media.createDirectMessageMediaPath, "function");
  assert.equal(typeof media.getDirectMessagePreviewLabel, "function");
  assert.equal(typeof media.getDirectMessageClipboardImageFiles, "function");
  assert.equal(typeof media.createDirectMessageClipboardFileName, "function");

  const image = { name: "board photo.PNG", size: 1024, type: "image/png" };
  const video = { name: "rack.mov", size: 2048, type: "video/quicktime" };
  assert.deepEqual(media.validateDirectMessageFiles([image, video]), {
    error: null,
    files: [image, video],
  });
  assert.match(
    media.createDirectMessageMediaPath("thread", "user", "client", image, 0),
    /^thread\/user\/client\/0\.png$/,
  );
  assert.equal(media.getDirectMessagePreviewLabel("", [{ mediaKind: "image" }]), "傳送了照片");
  assert.equal(media.getDirectMessagePreviewLabel("", [{ mediaKind: "video" }]), "傳送了影片");
  assert.equal(
    media.getDirectMessagePreviewLabel("", [{ mediaKind: "image" }, { mediaKind: "image" }]),
    "傳送了 2 個附件",
  );
  assert.equal(media.getDirectMessagePreviewLabel("說明", [{ mediaKind: "image" }]), "說明");

  const clipboardItems = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => image },
    { kind: "file", type: "application/pdf", getAsFile: () => ({ name: "notes.pdf" }) },
  ];
  assert.deepEqual(media.getDirectMessageClipboardImageFiles(clipboardItems), [image]);
  assert.equal(
    media.createDirectMessageClipboardFileName(image, 0, new Date("2026-08-13T08:53:00Z")),
    "clipboard-20260813-085300-1.png",
  );

  assert.match(media.validateDirectMessageFiles(new Array(5).fill(image)).error, /最多只能選擇 4 個/);
  assert.match(media.validateDirectMessageFiles([
    { name: "bad.pdf", size: 10, type: "application/pdf" },
  ]).error, /支援圖片、影片、PowerPoint/);
  assert.match(media.validateDirectMessageFiles([
    { ...image, size: 12 * 1024 * 1024 + 1 },
  ]).error, /照片.*12 MB/);
  assert.match(media.validateDirectMessageFiles([
    { ...video, size: 50 * 1024 * 1024 + 1 },
  ]).error, /影片.*50 MB/);
});

test("direct message hook uploads private media and resolves signed attachment URLs", async () => {
  const [hook, panel] = await Promise.all([
    readSource("src/hooks/useDirectMessages.ts"),
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
  ]);

  assert.match(hook, /interface DirectMessageAttachment/);
  assert.match(hook, /attachments: DirectMessageAttachment\[\]/);
  assert.match(hook, /CHAT_MEDIA_BUCKET = "chat-media"/);
  assert.match(hook, /chat_message_attachments\s*\(/);
  assert.match(hook, /createSignedUrls\(/);
  assert.match(hook, /sendMessage = useCallback\([\s\S]*files: File\[\] = \[\]/);
  assert.match(hook, /\.storage\.from\(CHAT_MEDIA_BUCKET\)\.upload\(/);
  assert.match(hook, /database\.rpc\("send_direct_chat_message"/);
  assert.match(hook, /p_attachments:/);
  assert.match(hook, /remove\(uploadedPaths\)/);
  assert.match(hook, /storage_paths/);

  assert.match(panel, /type="file"/);
  assert.match(panel, /accept=\{CHAT_MEDIA_ACCEPT\}/);
  assert.match(panel, /multiple/);
  assert.match(panel, /aria-label="加入附件"/);
  assert.match(panel, /ImagePlus/);
  assert.match(panel, /selectedMediaFiles/);
  assert.match(panel, /URL\.createObjectURL/);
  assert.match(panel, /URL\.revokeObjectURL/);
  assert.match(panel, /訊息傳送中/);
  assert.match(panel, /await sendMessage\(body, selectedMediaFiles\.map/);
  assert.match(panel, /onPaste=\{handleComposerPaste\}/);
  assert.match(panel, /getDirectMessageClipboardImageFiles\(event\.clipboardData\.items\)/);
  assert.match(panel, /Ctrl\+V 貼上截圖/);
  assert.match(panel, /<img[\s\S]*attachment\.url/);
  assert.match(panel, /<video[\s\S]*controls[\s\S]*preload="metadata"/);
  assert.match(panel, /parsed\.body \? [\s\S]*parsed\.body/);
});

test("direct chat exposes modern search, pinning, drafts, replies, emoji and media preview workflows", async () => {
  const [panel, center, experience] = await Promise.all([
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
    readSource("src/components/collaboration/CollaborationCenter.tsx"),
    readSource("src/components/collaboration/directMessageExperience.mjs"),
  ]);

  assert.match(panel, /type ThreadFilter = "all" \| "unread" \| "pinned"/);
  assert.match(panel, /station-chat-preferences/);
  assert.match(panel, /草稿 ·/);
  assert.match(panel, /搜尋此對話的文字或檔名/);
  assert.match(panel, /sortDirectThreads\(searchedThreads, pinnedThreadIds\)/);
  assert.match(panel, /formatDirectMessageReply\(messageBody, replyingTo\)/);
  assert.match(panel, /aria-label="回覆訊息"/);
  assert.match(panel, /aria-label="複製訊息"/);
  assert.match(panel, /QUICK_EMOJI\.map/);
  assert.match(panel, /Enter 送出 · Shift \+ Enter 換行/);
  assert.match(panel, /setPreviewAttachment\(attachment\)/);
  assert.match(panel, /aria-label="下載原始檔案"/);
  assert.match(panel, /formatDirectMessageDay\(message\.createdAt\)/);
  assert.match(center, /w-\[min\(430px,calc\(100vw-1rem\)\)\]/);
  assert.match(experience, /export function parseDirectMessageBody/);
  assert.match(experience, /export function directMessageMatchesQuery/);
  assert.match(experience, /export function sortDirectThreads/);
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
