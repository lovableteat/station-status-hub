import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatAdminUserTimestamp } from "../src/components/admin/adminUserTime.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin user timestamps format timezone-qualified timestamptz values and fall back otherwise", () => {
  assert.equal(
    formatAdminUserTimestamp("2025-01-02T03:04:05.000Z", "尚未登入"),
    "2025/01/02 11:04",
  );
  assert.equal(
    formatAdminUserTimestamp("2025-01-02 03:04:05+00:00", "尚未登入"),
    "2025/01/02 11:04",
  );
  assert.equal(formatAdminUserTimestamp(null, "尚未登入"), "尚未登入");
  assert.equal(formatAdminUserTimestamp("not-a-timestamp", "尚未登入"), "尚未登入");
  assert.equal(formatAdminUserTimestamp("2025-02-30T00:00:00.000Z", "尚未登入"), "尚未登入");
  assert.equal(formatAdminUserTimestamp("2025-01-02T03:04:05", "尚未登入"), "尚未登入");
});

test("admin account cards distinguish last login from creation time and keep permission summaries truncatable", async () => {
  const source = await read("../src/components/admin/AdminPanel.tsx");

  assert.match(source, /last_seen_at:\s*string\s*\|\s*null/);
  assert.match(source, /最後登入/);
  assert.match(source, /const lastLoginLabel = formatAdminUserTimestamp\(systemUser\.last_seen_at, "尚未登入"\)/);
  assert.match(source, /lastLoginLabel === "尚未登入" \? "text-slate-500" : "text-slate-200"/);
  assert.match(source, /<Clock3 className="h-3 w-3" aria-hidden="true"\s*\/?>\s*最後登入/s);
  assert.match(source, /建立時間/);
  assert.doesNotMatch(source, /建立時間<\/div>\s*<div[^>]*>\s*<Clock3/s);

  assert.match(source, /const permissionsSummary = `網站與工作區權限 · 建立者：\$\{creatorLabel\}`/);
  assert.match(source, /<Lock className="h-3\.5 w-3\.5 shrink-0 text-cyan-200\/75" aria-hidden="true" \/>/);
  assert.match(source, /className="min-w-0 truncate text-xs font-semibold text-slate-400"/);
  assert.match(source, /title=\{permissionsSummary\}/);
  assert.match(source, /aria-label=\{permissionsSummary\}/);
  assert.match(source, />\s*\{permissionsSummary\}\s*<\/span>/);
  assert.match(source, /className="flex min-w-0 flex-wrap justify-end gap-1\.5"/);
  assert.doesNotMatch(source, /className="[^"]*sm:shrink-0[^"]*"/);
  assert.match(source, /workspaceBadges\.length > 0 \? `\$\{workspaceBadges\.length\} 個工作區` : "未配置"/);
  assert.match(source, /data-mobile-user-summary="true"/);
  assert.match(source, /className="admin-account-summary flex flex-col gap-4[^\"]*lg:flex-row[^\"]*lg:justify-between"/);
});

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

test("admin dialogs and API console use the restrained maintenance color system", async () => {
  const permissions = await read("../src/components/admin/UserPermissionsDialog.tsx");
  const userEditor = await read("../src/components/admin/UserEditDialog.tsx");
  const apiPage = await read("../src/components/api-management/ApiManagementPage.tsx");
  const apiKeys = await read("../src/components/api-management/ApiKeyManagement.tsx");
  const apiPreview = await read("../src/components/api-management/ApiDataPreview.tsx");
  const apiDocs = await read("../src/components/api-management/ApiDocumentation.tsx");
  const apiCreateDialog = await read("../src/components/api-management/CreateApiKeyDialog.tsx");
  const styles = await read("../src/components/admin/admin-panel.css");
  const apiSurface = [apiPage, apiKeys, apiPreview, apiDocs, apiCreateDialog].join("\n");

  assert.match(permissions, /data-admin-dialog="permissions"/);
  assert.match(permissions, /data-permission-model="live-workspace-matrix"/);
  assert.match(permissions, /首頁六個實際工作區/);
  assert.match(permissions, /後台管理內頁/);
  assert.match(userEditor, /data-admin-dialog="user-editor"/);
  assert.match(apiPage, /data-admin-surface="api-control-room"/);
  assert.match(apiPage, /className="admin-api-workspace"/);
  assert.match(apiPage, /className="admin-api-hero"/);
  assert.match(apiPage, /admin-api-context-grid/);
  assert.match(apiPage, /admin-api-feature-grid/);
  assert.match(styles, /\.admin-api-workspace/);
  assert.match(styles, /\.admin-api-card/);
  assert.match(styles, /\.admin-api-primary-action/);
  assert.match(styles, /\.admin-api-table-scroll/);
  assert.match(styles, /\.admin-permissions-layout/);
  assert.match(styles, /@media \(min-width: 1800px\)/);
  assert.match(apiKeys, /admin-api-table-scroll/);
  assert.match(apiKeys, /admin-api-mobile-table-hint/);
  assert.match(permissions, /admin-permissions-dialog/);
  assert.match(permissions, /admin-permissions-scroll/);
  assert.match(permissions, /sm:grid-cols-3/);
  assert.match(apiKeys, /data-admin-zone="api-key-status"/);
  assert.match(apiKeys, /data-admin-zone="api-key-list"/);
  assert.doesNotMatch(
    apiSurface,
    /radial-gradient|bg-\[linear-gradient|bg-gradient-to-br|#17425d|#16445a|#12413f|#342c59|#443b20|violet-/,
  );

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
  assert.match(styles, /#4f8cff/i);
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

  assert.match(styles, /\.admin-shell\s*\{[^}]*min-height:\s*calc\(100dvh - 110px\);[^}]*align-items:\s*stretch;/s);
  assert.match(styles, /\.admin-sidebar\s*\{[^}]*min-height:\s*calc\(100dvh - 110px\);[^}]*max-height:\s*none;/s);
  assert.match(styles, /\.admin-sidebar nav\s*\{[^}]*flex:\s*1 1 auto;/s);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.admin-sidebar nav\s*\{[^}]*flex:\s*1;/);

  assert.match(panel, /className="flex flex-col gap-3"/);
  assert.match(panel, /value="collaboration" className="mt-0"/);
  assert.match(collaboration, /grid min-h-0 items-start gap-4/);
  assert.match(collaboration, /grid min-h-0 content-start gap-4/);
});
