import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin workspace exposes clear visual zones without changing user actions", async () => {
  const [source, sidebar] = await Promise.all([
    read("../src/components/admin/AdminPanel.tsx"),
    read("../src/components/admin/AdminSidebar.tsx"),
  ]);

  assert.match(source, /data-admin-surface="control-room"/);
  assert.match(source, /data-admin-zone="command"/);
  assert.match(sidebar, /data-admin-zone="navigation"/);
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
  assert.match(permissions, /data-permission-model="live-workspace-matrix"/);
  assert.match(permissions, /首頁六個實際工作區/);
  assert.match(permissions, /後台管理內頁/);
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

test("admin workspace uses the maintenance visual system and a responsive sidebar instead of a decorative tab strip", async () => {
  const [panel, sidebar, styles, header, metrics] = await Promise.all([
    read("../src/components/admin/AdminPanel.tsx"),
    read("../src/components/admin/AdminSidebar.tsx"),
    read("../src/components/admin/admin-panel.css"),
    read("../src/components/maintenance/MaintenancePageHeader.tsx"),
    read("../src/components/maintenance/MaintenanceMetricStrip.tsx"),
  ]);

  assert.match(panel, /<AdminSidebar/);
  assert.match(panel, /<MaintenancePageHeader/);
  assert.match(panel, /<MaintenanceMetricStrip/);
  assert.doesNotMatch(panel, /radial-gradient|blur-3xl|bg-gradient-to-r/);

  assert.match(sidebar, /用戶管理/);
  assert.match(sidebar, /通知與在線/);
  assert.match(sidebar, /API 管理/);
  assert.match(sidebar, /收合側欄/);
  assert.match(sidebar, /aria-current/);

  assert.match(styles, /#06111f/i);
  assert.match(styles, /#071522/i);
  assert.match(styles, /#2a526f/i);
  assert.match(styles, /#67e8f9/i);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(header, /MaintenancePageHeader/);
  assert.match(metrics, /MaintenanceMetricStrip/);
});

test("admin desktop layout follows its content without leaving forced empty regions", async () => {
  const [panel, collaboration, styles] = await Promise.all([
    read("../src/components/admin/AdminPanel.tsx"),
    read("../src/components/collaboration/AdminCollaborationPanel.tsx"),
    read("../src/components/admin/admin-panel.css"),
  ]);

  assert.match(styles, /\.admin-shell\s*\{[^}]*min-height:\s*0;[^}]*align-items:\s*flex-start;/s);
  assert.match(styles, /\.admin-sidebar\s*\{[^}]*height:\s*auto;[^}]*max-height:/s);
  assert.match(styles, /\.admin-sidebar nav\s*\{[^}]*flex:\s*0 1 auto;/s);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.admin-sidebar nav\s*\{[^}]*flex:\s*1;/);

  assert.match(panel, /className="flex flex-col gap-3"/);
  assert.match(panel, /value="collaboration" className="mt-0"/);
  assert.match(collaboration, /grid min-h-0 items-start gap-4/);
  assert.match(collaboration, /grid min-h-0 content-start gap-4/);
});
