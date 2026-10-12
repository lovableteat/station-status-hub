import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account menu uses ordinary rows without duplicated homepage or emphasized cards", async () => {
  const [header, index] = await Promise.all([read("src/components/layout/MainWorkspaceHeader.tsx"), read("src/pages/Index.tsx")]);
  assert.doesNotMatch(header, /onOpenWorkspaceHome|工作區首頁|emphasized|bg-indigo-300/);
  assert.doesNotMatch(index, /onOpenWorkspaceHome|emphasized: true/);
  assert.match(header, /data-platform-account-menu="true"/);
  assert.match(header, /userRoleLabel !== userName/);
});

test("public AI labels are consistent while stable routing and permissions keep ai-chat", async () => {
  for (const file of ["src/pages/Index.tsx", "src/lib/workspacePermissions.ts", "src/components/layout/WorkspaceEntrance.tsx", "src/components/layout/MobileWorkspaceDock.tsx", "src/components/collaboration/CollaborationCenter.tsx", "src/components/collaboration/AdminCollaborationPanel.tsx"]) {
    const source = await read(file);
    assert.match(source, /AI 問答/, file);
    assert.doesNotMatch(source, /資料查詢空間/, file);
    assert.match(source, /ai-chat/, file);
  }
});

test("canonical dark controls inherit the existing jade primary and focus palette", async () => {
  const css = await read("src/index.css");
  const canonical = css.slice(css.indexOf("/* Shared Apple dark foundation."), css.indexOf("html { color-scheme: dark; }"));
  for (const name of ["primary", "ring", "sidebar-primary", "sidebar-ring"]) assert.match(canonical, new RegExp(`--${name}: 171 51% 59%;`));
  assert.match(canonical, /--primary-foreground: 240 6% 7%;/);
  assert.match(css, /\[data-platform-account-menu='true'\] \[role='menuitem'\]/);
});
