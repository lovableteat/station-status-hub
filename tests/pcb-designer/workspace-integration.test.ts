import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = async (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8").catch(() => "");

const permissionsSource = await read("src/lib/workspacePermissions.ts");
const indexSource = await read("src/pages/Index.tsx");
const entranceSource = await read("src/components/layout/WorkspaceEntrance.tsx");
const dialogSource = await read("src/components/admin/UserPermissionsDialog.tsx");
const previewSource = await read(
  "src/components/pcb-designer/PcbWorkspacePreview.tsx",
);
const workspaceSource = await read(
  "src/components/pcb-designer/PcbDesignerWorkspace.tsx",
);
const permissionMigrationSource = await read(
  "supabase/migrations/20260726200000_add_pcb_designer_permissions.sql",
);
const storageMigrationSource = await read(
  "supabase/migrations/20260726193000_create_pcb_designer_tables.sql",
);
const persistenceSource = await read(
  "src/components/pcb-designer/hooks/usePcbPersistence.ts",
);
const pcbWorkspaceHookSource = await read(
  "src/components/pcb-designer/hooks/usePcbWorkspace.ts",
);
const remoteSyncSource = await read(
  "src/components/pcb-designer/core/remoteSync.ts",
);
const supabaseTypesSource = await read("src/integrations/supabase/types.ts");
const collaborationSource = await read(
  "src/components/collaboration/CollaborationCenter.tsx",
);
const adminCollaborationSource = await read(
  "src/components/collaboration/AdminCollaborationPanel.tsx",
);

test("registers PCB Designer as the sixth workspace and page-permission module", () => {
  assert.match(permissionsSource, /"pcb_designer_view"/);
  assert.match(permissionsSource, /"pcb_designer_edit"/);
  assert.match(permissionsSource, /["']pcb-designer["']/);
  assert.match(
    permissionsSource,
    /["']pcb-designer["']\s*:\s*["']PCB Designer["']/,
  );
  assert.match(
    permissionsSource,
    /["']pcb-designer["']\s*:\s*["']pcb-designer["']/,
  );
  assert.match(
    permissionsSource,
    /["']pcb-designer["']\s*:\s*["']pcb_designer["']/,
  );
  assert.match(dialogSource, /WORKSPACE_LABELS/);
});

test("keeps legacy PCB permissions working and grants admins edit fallback", async () => {
  const compiled = ts.transpileModule(permissionsSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const permissionsModule = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

  assert.equal(
    permissionsModule.canAccessModule({
      module: "pcb-designer",
      action: "view",
      role: "engineer",
      permissions: ["pcb_designer_view"],
      permissionSettings: {
        workspaceAccess: { "station-status": "view" },
      },
    }),
    true,
  );
  assert.equal(
    permissionsModule.canAccessModule({
      module: "pcb-designer",
      action: "edit",
      role: "engineer",
      permissions: ["pcb_designer_view"],
      permissionSettings: {
        workspaceAccess: { "station-status": "view" },
      },
    }),
    false,
  );
  for (const role of ["admin", "super_admin"]) {
    assert.equal(
      permissionsModule.canAccessModule({
        module: "pcb-designer",
        action: "edit",
        role,
        permissions: [],
        permissionSettings: {},
      }),
      true,
    );
  }
});

test("restores, catalogs, and renders PCB Designer through the existing navigation", () => {
  assert.match(
    indexSource,
    /import\(["']@\/components\/pcb-designer\/PcbDesignerWorkspace["']\)/,
  );
  assert.match(indexSource, /id:\s*["']pcb-designer["']\s+as const/);
  assert.match(indexSource, /label:\s*["']PCB Designer["']/);
  assert.match(indexSource, /canViewModule\(["']pcb-designer["']\)/);
  assert.match(indexSource, /workspace === ["']pcb-designer["']/);
  assert.match(indexSource, /case ["']pcb-designer["']/);
  assert.match(
    indexSource,
    /<PermissionGuard module=["']pcb-designer["']>/,
  );
  assert.match(indexSource, /<PcbDesignerWorkspace\s*\/>/);
  assert.match(
    indexSource,
    /activeWorkspace === ["']pcb-designer["'][\s\S]{0,120}h-\[100dvh\][\s\S]{0,80}overflow-hidden/,
  );
  assert.doesNotMatch(indexSource, /PcbDesignerWorkspace[\s\S]{0,500}<MainWorkspaceHeader/);
});

test("shows a balanced 3-by-2 home grid with a code-native PCB preview", () => {
  assert.match(entranceSource, /PcbWorkspacePreview/);
  assert.match(
    entranceSource,
    /workspaceId === ["']pcb-designer["'][\s\S]{0,180}<PcbWorkspacePreview\s*\/>/,
  );
  assert.match(entranceSource, /xl:grid-cols-3/);
  assert.match(previewSource, /data-testid=["']pcb-workspace-preview["']/);
  assert.match(previewSource, /PCB|circuit|board|trace/i);
  assert.doesNotMatch(previewSource, /\b(?:DataCenter|3D|Login)\b/i);
  assert.match(workspaceSource, /export function PcbDesignerWorkspace/);
});

test("replaces the loading shell with one native three-area PCB workbench", async () => {
  const leftRailSource = await read(
    "src/components/pcb-designer/PcbLeftRail.tsx",
  );
  const toolbarSource = await read(
    "src/components/pcb-designer/PcbToolbar.tsx",
  );
  const dialogsSource = await read(
    "src/components/pcb-designer/PcbDialogs.tsx",
  );
  const stylesSource = await read(
    "src/components/pcb-designer/pcb-designer.css",
  );
  const canvasSource = await read(
    "src/components/pcb-designer/PcbCanvas.tsx",
  );
  const inspectorSource = await read(
    "src/components/pcb-designer/PcbInspector.tsx",
  );

  assert.match(workspaceSource, /data-testid=["']pcb-project-bar["']/);
  assert.match(leftRailSource, /data-testid=["']pcb-left-rail["']/);
  assert.match(canvasSource, /data-testid=["']pcb-canvas-host["']/);
  assert.match(inspectorSource, /data-testid=["']pcb-inspector["']/);
  assert.match(workspaceSource, /PcbToolbar/);
  assert.match(workspaceSource, /PcbDialogs/);
  assert.match(leftRailSource, /projects[\s\S]*templates[\s\S]*library[\s\S]*bom/i);
  assert.match(leftRailSource, /statusFilter[\s\S]*sourceFilter/);
  assert.match(toolbarSource, /undo[\s\S]*redo[\s\S]*exportPng/i);
  assert.match(dialogsSource, /import-preview/i);
  assert.match(stylesSource, /#06111f/i);
  assert.match(stylesSource, /@media \(max-width: 1279px\)[\s\S]*pcb-left-drawer[\s\S]*position:\s*absolute/i);
  assert.match(stylesSource, /@media \(max-width: 767px\)[\s\S]*pcb-mobile-advisory/i);
  assert.match(workspaceSource, /建議使用桌面進行精細佈局/);

  const combined = [
    workspaceSource,
    leftRailSource,
    toolbarSource,
    dialogsSource,
    canvasSource,
    inspectorSource,
    stylesSource,
  ].join("\n");
  assert.doesNotMatch(combined, /\b(?:DataCenter|source-login|3D)\b/i);
  assert.doesNotMatch(combined, /gradient|shadow-(?:xl|2xl)/i);
});

test("persists PCB permissions through the database enum and workspace validator", () => {
  assert.match(
    permissionMigrationSource,
    /ALTER TYPE public\.page_permission\s+ADD VALUE IF NOT EXISTS 'pcb_designer_view'/i,
  );
  assert.match(
    permissionMigrationSource,
    /ALTER TYPE public\.page_permission\s+ADD VALUE IF NOT EXISTS 'pcb_designer_edit'/i,
  );
  assert.match(
    permissionMigrationSource,
    /ARRAY\[[^\]]*'station-status'[^\]]*'material-requests'[^\]]*'data-center'[^\]]*\]/i,
  );
  assert.match(
    permissionMigrationSource,
    /key NOT IN \([^)]*'pcb-designer'[^)]*\)/i,
  );
  assert.doesNotMatch(
    permissionMigrationSource,
    /\?&\s*ARRAY\[[^\]]*'pcb-designer'[^\]]*\]/i,
  );
  assert.match(supabaseTypesSource, /\|\s*"pcb_designer_view"/);
  assert.match(supabaseTypesSource, /\|\s*"pcb_designer_edit"/);
});

test("labels PCB Designer presence consistently", () => {
  for (const source of [collaborationSource, adminCollaborationSource]) {
    assert.match(
      source,
      /["']pcb-designer["']\s*:\s*["']PCB Designer["']/,
    );
  }
});

test("owner-scopes future remote PCB data without enabling sync for custom-login sessions", () => {
  assert.match(storageMigrationSource, /owner_id\s+uuid\s+not null\s+default auth\.uid\(\)/i);
  assert.match(storageMigrationSource, /primary key\s*\(owner_id,\s*id\)/i);
  assert.match(storageMigrationSource, /enable row level security/i);
  assert.match(storageMigrationSource, /auth\.uid\(\)\s*=\s*owner_id/i);
  assert.match(storageMigrationSource, /revoke all on[\s\S]*from anon/i);
  assert.doesNotMatch(
    storageMigrationSource,
    /grant select,\s*insert,\s*update,\s*delete on[\s\S]*to anon/i,
  );
  assert.match(persistenceSource, /allowRemoteSync\?: boolean/);
  assert.doesNotMatch(persistenceSource, /integrations\/supabase\/client/);
  assert.match(persistenceSource, /allowRemoteSync = false/);
  assert.match(pcbWorkspaceHookSource, /remoteClient\?: PcbRemoteClient \| null/);
  assert.match(
    pcbWorkspaceHookSource,
    /allowRemoteSync:\s*canEdit && Boolean\(remoteClient\)/,
  );
  assert.match(remoteSyncSource, /onConflict:\s*["']owner_id,id["']/);
});
