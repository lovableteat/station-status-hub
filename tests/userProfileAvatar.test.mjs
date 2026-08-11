import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createUserAvatarPath,
  USER_AVATAR_MAX_BYTES,
  validateUserAvatarFile,
} from "../src/components/account/userAvatarUtils.mjs";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile avatar files are small images stored under the current account", () => {
  const image = { type: "image/webp", size: 1024 };

  assert.equal(validateUserAvatarFile(image), null);
  assert.match(
    createUserAvatarPath("93a15b6b-2c6b-4de1-9af7-8140fd30903d", image, {
      now: 1786377600000,
      token: "ABCDEF12-3456-7890",
    }),
    /^93a15b6b-2c6b-4de1-9af7-8140fd30903d\/1786377600000-abcdef12-3456-7890\.webp$/,
  );
  assert.match(validateUserAvatarFile({ type: "image/gif", size: 1024 }), /JPG、PNG 或 WebP/);
  assert.match(
    validateUserAvatarFile({ type: "image/png", size: USER_AVATAR_MAX_BYTES + 1 }),
    /2 MB/,
  );
});

test("avatar storage and profile mutation are owner-scoped", async () => {
  const migration = await readSource(
    "supabase/migrations/20260811043000_user_profile_avatars.sql",
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS avatar_path text/i);
  assert.match(migration, /'user-avatars'[\s\S]*true,[\s\S]*2097152/i);
  assert.match(migration, /ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/i);
  assert.match(migration, /storage\.foldername\(name\)[\s\S]*current_system_user_id\(\)/i);
  assert.match(migration, /\[0-9\]\{10,\}-\[0-9a-f-\]\{8,\}/i);
  assert.match(migration, /FROM storage\.objects AS avatar[\s\S]*avatar\.name = v_avatar_path/i);
  assert.match(migration, /FUNCTION public\.set_own_avatar_path\(p_avatar_path text\)/i);
  assert.match(migration, /other_avatar_path text/i);
  assert.match(migration, /account\.avatar_path/i);
  assert.match(migration, /other_user\.avatar_path/i);
});

test("users can manage their own avatar from personal settings", async () => {
  const [context, dialog, index, header, loginFunction] = await Promise.all([
    readSource("src/components/auth/UserContext.tsx"),
    readSource("src/components/account/PersonalProfileDialog.tsx"),
    readSource("src/pages/Index.tsx"),
    readSource("src/components/layout/MainWorkspaceHeader.tsx"),
    readSource("supabase/functions/account-login/index.ts"),
  ]);

  assert.match(context, /updateAvatar: \(file: File \| null\)/);
  assert.match(context, /\.from\(USER_AVATAR_BUCKET\)[\s\S]*\.upload\(uploadedPath, file/);
  assert.match(context, /supabase\.rpc\("set_own_avatar_path"/);
  assert.match(context, /station-user-avatar-updated/);
  assert.match(dialog, /type="file"/);
  assert.match(dialog, /accept=\{USER_AVATAR_ACCEPT\}/);
  assert.match(dialog, /updateAvatar\(selectedFile\)/);
  assert.match(dialog, /updateAvatar\(null\)/);
  assert.match(dialog, /檔案上限 2 MB/);
  assert.match(index, /label: "個人設定"/);
  assert.match(index, /userAvatarPath=\{user\?\.avatarPath\}/);
  assert.match(header, /<UserAvatar[\s\S]*avatarPath=\{userAvatarPath\}/);
  assert.match(loginFunction, /avatar_path/);
});

test("chat headers and compact member rows resolve saved or live avatars", async () => {
  const [panel, threads, presence, center] = await Promise.all([
    readSource("src/components/collaboration/DirectMessagesPanel.tsx"),
    readSource("src/hooks/useDirectMessages.ts"),
    readSource("src/hooks/useUserPresence.ts"),
    readSource("src/components/collaboration/CollaborationCenter.tsx"),
  ]);

  assert.match(threads, /otherAvatarPath: row\.other_avatar_path \?\? null/);
  assert.match(presence, /const avatarPath = user\?\.avatarPath \?\? null/);
  assert.match(presence, /identity: \{[\s\S]*avatarPath,/);
  assert.match(panel, /selectedOnlineUser\?\.avatarPath \?\? selectedThread\.otherAvatarPath/);
  assert.match(panel, /data-density="compact"/);
  assert.match(panel, /onlineUser=\{onlineUserById\.get\(thread\.otherUserId\)\}/);
  assert.match(center, /avatarPath: member\.avatar_path/);
  assert.match(center, /onlineUser\?\.avatarPath \?\? member\.avatarPath/);
});
