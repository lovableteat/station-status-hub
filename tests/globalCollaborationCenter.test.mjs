import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the workspace keeps direct messages exclusively in the bottom-right floating panel", async () => {
  const [indexSource, headerSource, centerSource, indicatorSource] = await Promise.all([
    readSource("src/pages/Index.tsx"),
    readSource("src/components/layout/MainWorkspaceHeader.tsx"),
    readSource("src/components/collaboration/CollaborationCenter.tsx"),
    readSource("src/components/common/OnlineUsersIndicator.tsx"),
  ]);

  assert.match(indexSource, /<CollaborationCenter\s*\/>/);
  assert.doesNotMatch(indexSource, /<RealtimeNotifications\s*\/>/);
  assert.match(headerSource, /<OnlineUsersIndicator\s*\/>/);
  assert.match(indicatorSource, /open-global-collaboration/);
  assert.doesNotMatch(indicatorSource, /<Popover/);
  assert.match(centerSource, /value="notifications"/);
  assert.match(centerSource, /value="online"/);
  assert.doesNotMatch(centerSource, /value="messages"/);
  assert.equal(centerSource.match(/<DirectMessagesPanel/g)?.length, 1);
  assert.match(centerSource, /data-floating-direct-messages/);
  assert.match(centerSource, /aria-label="聊天室"/);
  assert.match(centerSource, /function DirectMessageLauncher/);
  assert.match(centerSource, /data-chat-launcher="compact-button"/);
  assert.match(centerSource, /pointer-events-auto relative ml-auto flex h-14 w-14/);
  assert.match(centerSource, /sm:min-w-\[132px\]/);
  assert.match(centerSource, /聊天室/);
  assert.match(centerSource, /title="開啟聊天室"/);
  assert.doesNotMatch(centerSource, /w-\[min\(310px,100%\)\]/);
  assert.match(centerSource, /aria-expanded=\{false\}/);
  assert.match(centerSource, /aria-controls="direct-messages-panel"/);
  assert.match(centerSource, /data-chat-dock="detached"/);
  assert.match(centerSource, /pointer-events-none fixed bottom-\[calc\(5\.25rem\+env\(safe-area-inset-bottom\)\)\] right-2/);
  assert.match(centerSource, /fixed inset-0 flex h-\[100dvh\] w-screen/);
  assert.match(centerSource, /sm:absolute sm:inset-auto sm:bottom-0 sm:right-0/);
  assert.match(centerSource, /sm:bottom-5 sm:right-5/);
  assert.match(centerSource, /data-chat-surface="detached-card"/);
  assert.match(centerSource, /rounded-\[24px\]/);
  assert.match(centerSource, /bg-\[#071421\]/);
  assert.match(centerSource, /bg-\[linear-gradient\(120deg,#17627a/);
  assert.doesNotMatch(centerSource, /absolute bottom-11 right-0/);
  assert.doesNotMatch(centerSource, /fixed bottom-0 right-0/);
  assert.match(centerSource, /visible pointer-events-auto translate-y-0 scale-100 opacity-100/);
  assert.match(centerSource, /invisible pointer-events-none translate-y-3 scale-\[0\.98\] opacity-0/);
  assert.match(centerSource, /選擇聯絡人開始私訊/);
  assert.doesNotMatch(centerSource, /latestThread/);
  assert.doesNotMatch(centerSource, /lastMessageBody/);
  assert.match(centerSource, /unreadCount > 0/);
  assert.match(centerSource, /bg-rose-500/);
  assert.match(centerSource, /onUnreadCountChange=\{setDirectMessageUnreadCount\}/);
  assert.match(centerSource, /<DirectMessageLauncher/);
  assert.match(centerSource, /\{!messageFloatOpen \? \(/);
  assert.match(centerSource, /onOpen=\{\(\) => setMessageFloatOpen\(true\)\}/);
  assert.match(centerSource, /setMessageFloatOpen\(true\);\s*setOpen\(false\)/);
  assert.doesNotMatch(centerSource, /open && activeTab === "messages"/);
  assert.doesNotMatch(centerSource, /開啟浮動訊息[\s\S]{0,260}rounded-full/);
  assert.match(centerSource, /open-global-collaboration/);
  assert.match(centerSource, /data-collaboration-content-frame="true"/);
  assert.match(centerSource, /absolute inset-0 mt-0 min-h-0 overflow-hidden data-\[state=active\]:flex/);
  assert.match(centerSource, /全部標為已讀/);
  assert.match(centerSource, /清除全部已讀/);
  assert.match(centerSource, /dismiss_user_notification/);
  assert.match(centerSource, /dismiss_read_user_notifications/);
  assert.match(centerSource, /已讀後可刪除/);
  assert.match(centerSource, /list_active_collaboration_members/);
  assert.match(centerSource, /帳號目錄共/);
  assert.match(centerSource, /目前離線/);
  assert.match(centerSource, /帳號目錄載入失敗/);
  assert.match(centerSource, /directoryMembers/);
  assert.match(centerSource, /私訊 \$\{memberName\}/);
  assert.doesNotMatch(centerSource, /目前只有您在線上/);
});

test("unread admin announcements open once and require explicit acknowledgement", async () => {
  const source = await readSource("src/components/collaboration/CollaborationCenter.tsx");

  assert.match(source, /notification_type === "admin_announcement"/);
  assert.match(source, /autoAnnouncementShownRef/);
  assert.match(source, /重要公告/);
  assert.match(source, /我知道了，標為已讀/);
  assert.match(source, /markAsRead\(activeAnnouncement\)/);
  assert.doesNotMatch(source, /setActiveAnnouncement\([^)]*\)[\s\S]{0,160}markAsRead/);
});

test("floating chat exposes the full member directory including offline contacts", async () => {
  const [center, panel] = await Promise.all([
    readSource("src/components/collaboration/CollaborationCenter.tsx"),
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
  ]);

  assert.match(center, /contacts=\{collaborationMembers/);
  assert.match(center, /contactsLoading=\{directoryLoading\}/);
  assert.match(panel, /interface DirectMessageContact/);
  assert.match(panel, /離線 · 可留言/);
  assert.match(panel, /即使離線也能先留言/);
  assert.match(panel, /startDirectChat\(contact\.userId\)/);
});

test("the header keeps one collaboration entry point through online presence", async () => {
  const source = await readSource("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(source, /<OnlineUsersIndicator\s*\/>/);
  assert.doesNotMatch(source, /BellRing/);
  assert.doesNotMatch(source, /notificationUnreadCount/);
});

test("presence exposes all users, other users and connection state", async () => {
  const [source, sessionSource] = await Promise.all([
    readSource("src/hooks/useUserPresence.ts"),
    readSource("src/hooks/presenceSession.mjs"),
  ]);

  assert.match(source, /allOnlineUsers/);
  assert.match(source, /otherOnlineUsersCount/);
  assert.match(source, /connectionStatus/);
  assert.match(source, /connectionState/);
  assert.match(source, /firstRosterSynced/);
  assert.doesNotMatch(source, /setInterval/);
  assert.match(sessionSource, /new Map/);
});

test("admin can send announcements and inspect live users from one panel", async () => {
  const [adminSource, panelSource] = await Promise.all([
    readSource("src/components/admin/AdminPanel.tsx"),
    readSource("src/components/collaboration/AdminCollaborationPanel.tsx"),
  ]);

  assert.match(adminSource, /value="collaboration"/);
  assert.match(adminSource, /<AdminCollaborationPanel/);
  assert.match(panelSource, /send_admin_announcement/);
  assert.match(panelSource, /isMissingAnnouncementRpc/);
  assert.match(panelSource, /from\("user_notifications"\)\.insert/);
  assert.match(panelSource, /全體啟用帳號/);
  assert.match(panelSource, /搜尋姓名、帳號或角色/);
  assert.match(panelSource, /全選結果/);
  assert.match(panelSource, /查看完整內容/);
  assert.match(panelSource, /發送紀錄/);
  assert.match(panelSource, /在線位置/);
});

test("recipients can dismiss only their own read notifications without deleting audit history", async () => {
  const migration = await readSource(
    "supabase/migrations/20260731150000_secure_notification_dismissal.sql",
  );

  assert.match(migration, /dismiss_user_notification/i);
  assert.match(migration, /dismiss_read_user_notifications/i);
  assert.match(migration, /recipient_id = v_system_user_id/i);
  assert.match(migration, /is_read = true/i);
  assert.match(migration, /archived_at = now\(\)/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.user_notifications/i);
});

test("admin announcements are inserted server-side with role and recipient checks", async () => {
  const migration = await readSource(
    "supabase/migrations/20260723090000_global_collaboration_center.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.send_admin_announcement/i);
  assert.match(migration, /role IN \('admin', 'super_admin'\)/i);
  assert.match(migration, /status = 'active'/i);
  assert.match(migration, /INSERT INTO public\.user_notifications/i);
  assert.match(migration, /admin_announcement/i);
});

test("collaboration directory exposes active accounts without exposing sensitive account data", async () => {
  const migration = await readSource(
    "supabase/migrations/20260804110000_list_active_collaboration_members.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.list_active_collaboration_members/i);
  assert.match(migration, /auth\.uid\(\) IS NOT NULL/i);
  assert.match(migration, /account\.status = 'active'/i);
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated, service_role/i);
  assert.doesNotMatch(migration, /password_hash/i);
  assert.doesNotMatch(migration, /permissions/i);
});
