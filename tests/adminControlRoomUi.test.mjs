import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin workspace exposes clear visual zones without changing user actions", async () => {
  const source = await read("../src/components/admin/AdminPanel.tsx");

  assert.match(source, /data-admin-surface="control-room"/);
  assert.match(source, /data-admin-zone="command"/);
  assert.match(source, /data-admin-zone="navigation"/);
  assert.match(source, /data-admin-zone="status-overview"/);
  assert.match(source, /data-admin-zone="filters"/);
  assert.match(source, /data-admin-zone="accounts"/);

  assert.match(source, /onClick=\{handleAddUser\}/);
  assert.match(source, /handleToggleUserStatus/);
  assert.match(source, /setPermissionsDialogOpen\(true\)/);
  assert.match(source, /onDelete=\{handleDeleteUser\}/);
});

test("admin dialogs and API console share the brighter control-room treatment", async () => {
  const permissions = await read("../src/components/admin/UserPermissionsDialog.tsx");
  const userEditor = await read("../src/components/admin/UserEditDialog.tsx");
  const apiPage = await read("../src/components/api-management/ApiManagementPage.tsx");
  const apiKeys = await read("../src/components/api-management/ApiKeyManagement.tsx");

  assert.match(permissions, /data-admin-dialog="permissions"/);
  assert.match(userEditor, /data-admin-dialog="user-editor"/);
  assert.match(apiPage, /data-admin-surface="api-control-room"/);
  assert.match(apiKeys, /data-admin-zone="api-key-status"/);
  assert.match(apiKeys, /data-admin-zone="api-key-list"/);

  assert.match(permissions, /set_user_access_permissions/);
  assert.match(userEditor, /\.from\('system_users'\)\s*\.update/);
  assert.match(apiKeys, /openCreateDialog/);
  assert.match(apiKeys, /toggleKeyStatus/);
  assert.match(apiKeys, /deleteKey/);
});
