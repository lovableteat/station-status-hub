import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the workspace uses one collaboration center for notifications and presence", async () => {
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
  assert.match(centerSource, /open-global-collaboration/);
  assert.match(centerSource, /全部標為已讀/);
  assert.match(centerSource, /目前只有您在線上/);
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

test("the collaboration icon visibly pulses while notifications remain unread", async () => {
  const source = await readSource("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(source, /notificationUnreadCount > 0/);
  assert.match(source, /motion-safe:animate-pulse/);
  assert.match(source, /BellRing/);
  assert.match(source, /協作中心有未讀通知/);
});

test("presence exposes all users, other users and connection state", async () => {
  const source = await readSource("src/hooks/useUserPresence.ts");

  assert.match(source, /allOnlineUsers/);
  assert.match(source, /otherOnlineUsersCount/);
  assert.match(source, /connectionStatus/);
  assert.match(source, /new Map/);
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
  assert.match(panelSource, /發送紀錄/);
  assert.match(panelSource, /在線位置/);
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
