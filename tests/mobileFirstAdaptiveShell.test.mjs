import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the shared handset shell reserves safe chrome for every workspace", async () => {
  const [index, styles, header, dock, html] = await Promise.all([
    read("src/pages/Index.tsx"),
    read("src/index.css"),
    read("src/components/layout/MainWorkspaceHeader.tsx"),
    read("src/components/layout/MobileWorkspaceDock.tsx"),
    read("index.html"),
  ]);

  assert.match(html, /interactive-widget=resizes-content/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(styles, /--mobile-header-height:\s*52px/);
  assert.match(styles, /--mobile-dock-height:\s*56px/);
  assert.match(styles, /--mobile-shell-bottom:/);
  assert.match(styles, /font-size:\s*16px/);
  assert.match(index, /data-mobile-workspace-main="true"/);
  assert.match(index, /availableItems=\{workspaceItems\}/);
  assert.doesNotMatch(index, /activeWorkspace !== "data-center" && activeWorkspace !== "pcb-designer"/);
  assert.match(header, /data-mobile-app-header="true"/);
  assert.match(header, /lg:w-fit lg:max-w-full lg:justify-self-center/);
  assert.match(dock, /data-mobile-more-sheet="true"/);
  assert.match(dock, /更多/);
  assert.match(dock, /grid-cols-5/);
});

test("chat uses one compact rectangular launcher above the shared dock", async () => {
  const source = await read("src/components/collaboration/CollaborationCenter.tsx");

  assert.match(source, /data-chat-launcher="compact-rectangle"/);
  assert.match(source, /var\(--mobile-shell-bottom\)/);
  assert.match(source, /h-11/);
  assert.match(source, /rounded-xl/);
});

test("PCB and Data Center prioritize their canvases on phones", async () => {
  const [pcb, pcbStyles, dataCenter] = await Promise.all([
    read("src/components/pcb-designer/PcbDesignerWorkspace.tsx"),
    read("src/components/pcb-designer/pcb-designer.css"),
    read("src/components/data-center/DeploymentPlanningCenter.tsx"),
  ]);

  assert.match(pcb, /data-mobile-pcb-command-bar="true"/);
  assert.doesNotMatch(pcb, /建議使用桌面進行精細佈局/);
  assert.match(pcbStyles, /--mobile-shell-bottom/);
  assert.match(dataCenter, /data-mobile-data-center-controls="true"/);
  assert.doesNotMatch(dataCenter, /data-testid="data-center-mobile-dock"/);
});

test("administration and maintenance expose compact phone summaries", async () => {
  const [admin, scope, metrics] = await Promise.all([
    read("src/components/admin/AdminPanel.tsx"),
    read("src/components/test-projects/ProjectScopeBar.tsx"),
    read("src/components/maintenance/MaintenanceMetricStrip.tsx"),
  ]);

  assert.match(admin, /data-mobile-user-summary="true"/);
  assert.match(admin, /data-mobile-user-last-login="true"/);
  assert.match(scope, /data-mobile-project-primary-actions="true"/);
  assert.match(metrics, /data-mobile-metric-strip="true"/);
  assert.match(metrics, /snap-x/);
});

test("material and AI keep only primary phone controls above content", async () => {
  const [material, ai] = await Promise.all([
    read("src/components/material-requests/MaterialRequestPage.tsx"),
    read("src/components/api-management/ApiChatConsole.tsx"),
  ]);

  assert.match(material, /data-mobile-material-primary-controls="true"/);
  assert.match(material, /data-mobile-material-tools="true"/);
  assert.match(material, /overflow-x-auto/);
  assert.match(ai, /data-mobile-ai-command-bar="true"/);
  assert.match(ai, /data-mobile-ai-empty-state="true"/);
  assert.match(ai, /data-mobile-ai-composer="true"/);
});
