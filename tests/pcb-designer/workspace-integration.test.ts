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
  assert.doesNotMatch(workspaceSource, /<button|<input|<select|<textarea/i);
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
