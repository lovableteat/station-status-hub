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
const accountRemoteSource = await read(
  "src/components/pcb-designer/core/accountRemoteSync.ts",
);
const completeStorageMigrationSource = await read(
  "supabase/migrations/20260727123000_complete_pcb_designer_workspace.sql",
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
  const canvas3dSource = await read(
    "src/components/pcb-designer/Pcb3DCanvas.tsx",
  );

  assert.match(workspaceSource, /data-testid=["']pcb-project-bar["']/);
  assert.match(leftRailSource, /data-testid=["']pcb-left-rail["']/);
  assert.match(canvasSource, /data-testid=["']pcb-canvas-host["']/);
  assert.match(inspectorSource, /data-testid=["']pcb-inspector["']/);
  assert.match(workspaceSource, /PcbToolbar/);
  assert.match(workspaceSource, /PcbDialogs/);
  assert.match(workspaceSource, /Pcb3DCanvas/);
  assert.match(canvas3dSource, /OrbitControls/);
  assert.match(leftRailSource, /projects[\s\S]*templates[\s\S]*library[\s\S]*bom/i);
  assert.match(leftRailSource, /statusFilter[\s\S]*sourceFilter/);
  assert.match(toolbarSource, /undo[\s\S]*redo[\s\S]*exportPng/i);
  assert.doesNotMatch(toolbarSource, /onNew:\s*\(\)\s*=>\s*void/);
  assert.doesNotMatch(toolbarSource, /label=["']新增專案["']/);
  assert.doesNotMatch(workspaceSource, /onNew=\{\(\) => setDialog\(\{ kind: ["']new-project["'] \}\)\}/);
  assert.match(workspaceSource, /onNewProject=\{\(\) => setDialog\(\{ kind: ["']new-project["'] \}\)\}/);
  assert.match(dialogsSource, /import-preview/i);
  assert.match(stylesSource, /#06111f/i);
  assert.match(stylesSource, /@media \(max-width: 1279px\)[\s\S]*pcb-left-drawer[\s\S]*position:\s*absolute/i);
  assert.match(stylesSource, /@media \(max-width: 767px\)[\s\S]*pcb-mobile-advisory/i);
  assert.match(stylesSource, /\.pcb-toolbar\s*\{[\s\S]{0,220}overflow-x:\s*auto/);
  assert.match(stylesSource, /\.pcb-layer-switch,[\s\S]{0,80}\.pcb-visible-layer-switch\s*\{[\s\S]{0,240}flex:\s*0 0 auto/);
  assert.match(workspaceSource, /建議使用桌面進行精細佈局/);

  const combined = [
    workspaceSource,
    leftRailSource,
    toolbarSource,
    dialogsSource,
    canvasSource,
    canvas3dSource,
    inspectorSource,
    stylesSource,
  ].join("\n");
  assert.doesNotMatch(combined, /\b(?:DataCenter|source-login)\b/i);
  assert.match(stylesSource, /\.pcb-toolbar[\s\S]*overflow-x:\s*auto/);
});

test("wires BOM import previews with typed summaries and caps visible errors at 100", async () => {
  const dialogsSource = await read(
    "src/components/pcb-designer/PcbDialogs.tsx",
  );

  assert.match(
    dialogsSource,
    /kind:\s*["']import-preview["'][\s\S]*importKind:\s*["']library["']\s*\|\s*["']bom["']/,
  );
  assert.match(dialogsSource, /totalCount:\s*number/);
  assert.match(dialogsSource, /placementCount\?:\s*number/);
  assert.match(dialogsSource, /dialog\.errors\.slice\(0,\s*100\)/);
  assert.match(dialogsSource, /dialog\.errors\.length\s*-\s*100/);
  assert.match(dialogsSource, /待放置清單/);
  assert.match(dialogsSource, /不會直接放到畫布/);
  assert.match(dialogsSource, /dialog\.importKind === ["']library["'][\s\S]*匯入元件庫/);
  assert.match(dialogsSource, /dialog\.importKind === ["']bom["'][\s\S]*建立待放置項目/);
});

test("passes BOM preview metadata from the workspace through a typed object API", () => {
  assert.match(
    workspaceSource,
    /type ImportPreviewInput = \{[\s\S]*title: string;[\s\S]*importKind: ["']library["'] \| ["']bom["'];[\s\S]*validCount: number;[\s\S]*totalCount: number;[\s\S]*errors: TabularImportError\[];[\s\S]*placementCount\?: number;[\s\S]*onCommit: \(\) => void;[\s\S]*\}/,
  );
  assert.match(
    workspaceSource,
    /const previewImport = \(input: ImportPreviewInput\) => setDialog\(\{[\s\S]*kind: ["']import-preview["'][\s\S]*\.\.\.input[\s\S]*\}\);/,
  );
  assert.match(
    workspaceSource,
    /previewImport\(\s*\{[\s\S]*title:\s*["']元件庫匯入預覽["'][\s\S]*importKind:\s*["']library["'][\s\S]*validCount:\s*result\.valid\.length[\s\S]*totalCount:\s*result\.valid\.length \+ result\.errors\.length[\s\S]*errors:\s*result\.errors[\s\S]*onCommit:\s*\(\)\s*=>\s*\{/,
  );
  assert.match(
    workspaceSource,
    /previewImport\(\s*\{[\s\S]*title:\s*["']BOM 匯入預覽["'][\s\S]*importKind:\s*["']bom["'][\s\S]*validCount:\s*result\.valid\.length[\s\S]*totalCount:\s*result\.valid\.length \+ result\.errors\.length[\s\S]*errors:\s*result\.errors[\s\S]*placementCount:\s*result\.placementCount[\s\S]*onCommit:\s*\(\)\s*=>\s*\{/,
  );
  assert.doesNotMatch(workspaceSource, /validCountOrKind|errorsOrValidCount|onCommitOrTotalCount|importKindOrErrors|placementCountOrCommit/);
  assert.doesNotMatch(workspaceSource, /\sas\s+TabularImportError\[]/);
  assert.doesNotMatch(workspaceSource, /\sas\s+\(\)\s*=>\s*void/);
  assert.match(workspaceSource, /workspace\.importBom\(result\.valid\)/);
  assert.match(workspaceSource, /workspace\.uploadLibraryComponents\(result\.valid\)/);
});

test("preserves the pre-task project and component form copy while extending import preview", async () => {
  const dialogsSource = await read(
    "src/components/pcb-designer/PcbDialogs.tsx",
  );

  assert.match(dialogsSource, /板框尺寸必須介於 20 到 1000 mm。/);
  assert.match(dialogsSource, /尺寸與最大高度必須是大於 0 的數值。/);
  assert.match(dialogsSource, /請填寫必要欄位後再儲存變更。/);
  assert.match(dialogsSource, /NumberField label=["']寬度 \(mm\)["']/);
  assert.match(dialogsSource, /NumberField label=["']高度 \(mm\)["']/);
});

test("keeps visible-layer filtering and grouped selection in sync across the PCB workspace", async () => {
  const toolbarSource = await read(
    "src/components/pcb-designer/PcbToolbar.tsx",
  );
  const canvasSource = await read(
    "src/components/pcb-designer/PcbCanvas.tsx",
  );
  const canvas3dSource = await read(
    "src/components/pcb-designer/Pcb3DCanvas.tsx",
  );
  const inspectorSource = await read(
    "src/components/pcb-designer/PcbInspector.tsx",
  );

  assert.match(workspaceSource, /visibleLayer=\{workspace\.visibleLayer\}/);
  assert.match(workspaceSource, /selectedObjects=\{workspace\.selectedObjects\}/);
  assert.match(workspaceSource, /onVisibleLayerChange=\{workspace\.setVisibleLayer\}/);
  assert.match(toolbarSource, /pcb-visible-layer-switch/);
  assert.match(canvasSource, /workspace\.visibleLayer/);
  assert.match(canvasSource, /workspace\.moveComponents/);
  assert.match(canvasSource, /workspace\.toggleObjectSelection/);
  assert.match(canvas3dSource, /visibleLayer/);
  assert.match(canvas3dSource, /workspace\.selectedObjects/);
  assert.match(inspectorSource, /workspace\.duplicateSelected/);
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

test("keeps legacy row storage owner-scoped while enabling account workspace sync", () => {
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
  assert.match(workspaceSource, /createPcbAccountRemoteClient/);
  assert.match(workspaceSource, /isDatabaseUserId\(user\?\.userId\)/);
  assert.match(accountRemoteSource, /load_pcb_designer_workspace/);
  assert.match(accountRemoteSource, /save_pcb_designer_workspace/);
  assert.match(accountRemoteSource, /PCB_REMOTE_FALLBACK_KEY\s*=\s*["']pcbDesignerWorkspace["']/);
  assert.match(accountRemoteSource, /from\(["']system_users["']\)/);
});

test("ships a complete custom-login PCB workspace migration and legacy permission fallback", () => {
  assert.match(
    completeStorageMigrationSource,
    /CREATE TABLE IF NOT EXISTS public\.pcb_designer_workspaces/i,
  );
  assert.match(
    completeStorageMigrationSource,
    /owner_id uuid PRIMARY KEY REFERENCES public\.system_users\(id\)/i,
  );
  assert.match(completeStorageMigrationSource, /SECURITY DEFINER/i);
  assert.match(completeStorageMigrationSource, /octet_length\(p_payload::text\) > 5 \* 1024 \* 1024/i);
  assert.match(completeStorageMigrationSource, /permissions -> 'pcbDesignerWorkspace'/i);
  assert.match(completeStorageMigrationSource, /NOTIFY pgrst, 'reload schema'/i);
  assert.match(dialogSource, /legacyPermissions/);
  assert.match(dialogSource, /permission\.startsWith\(["']pcb_designer_["']\)/);
  assert.match(dialogSource, /legacyWorkspaceIds\s*=\s*new Set\(\[/);
  assert.match(dialogSource, /legacyWorkspaceIds\.has\(workspaceId\)/);
  assert.match(dialogSource, /\.update\(\{[\s\S]*workspaceAccess/);
});
