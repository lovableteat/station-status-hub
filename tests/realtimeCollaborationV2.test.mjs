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
    /if \(sessionResult\.status !== "fulfilled"\) \{([\s\S]*?)\n\s*\}\n\n\s*if \(sessionResult\.value\.error\)/,
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
