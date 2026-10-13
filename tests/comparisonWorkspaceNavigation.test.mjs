import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const index = await read("src/pages/Index.tsx");
const ast = ts.createSourceFile("Index.tsx", index, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function initialWorkspace(search) {
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "getInitialWorkspace");
  assert.ok(declaration, "workspace query parser must exist");
  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(`${compiled}\ngetInitialWorkspace()`, {
    window: { location: { search } }, URLSearchParams,
    stationModuleItems: ["dashboard", "test-tracker", "flow-info", "issues", "tools"].map((id) => ({ id })),
  });
}

test("comparison shared links survive refresh while unknown workspace ids remain rejected", () => {
  assert.equal(initialWorkspace("?workspace=comparison"), "comparison");
  assert.equal(initialWorkspace("?workspace=comparison&module=comparison&compareStatus=open"), "comparison");
  assert.equal(initialWorkspace("?module=comparison"), "comparison");
  assert.equal(initialWorkspace("?workspace=unregistered"), null);
  assert.equal(initialWorkspace("?workspace=station-status&module=test-plan"), "file-uploads");
});

test("leaving comparison clears its filters while preserving project context and navigation cancellation", () => {
  const declarations = ast.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "pushWorkspaceLocation"
      || ts.isVariableStatement(node) && node.declarationList.declarations.some((entry) => entry.name.getText(ast) === "MODULE_QUERY_KEYS"),
  );
  assert.equal(declarations.length, 2);
  const compiled = ts.transpileModule(declarations.map((node) => node.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const filterKeys = ["comparisonTab", "compareSearch", "compareStatus", "compareOwner", "compareSeverity", "compareCategory", "comparePage", "librarySearch", "librarySigned", "feedbackSearch", "feedbackStatus", "feedbackOwner", "feedbackCategory"];
  const url = new URL("https://example.test/?workspace=comparison&module=comparison&project=fixture");
  for (const key of filterKeys) url.searchParams.set(key, "active");
  let destination, allowed = true;
  const context = vm.createContext({
    window: { location: { href: url.href }, dispatchEvent: () => allowed }, URL, Event,
    pushWorkspaceHistory: (nextUrl) => { destination = nextUrl; },
  });
  vm.runInContext(compiled, context);
  assert.equal(vm.runInContext('pushWorkspaceLocation("station-status", "dashboard")', context), true);
  assert.equal(destination.searchParams.get("project"), "fixture");
  assert.equal(destination.searchParams.get("workspace"), "station-status");
  assert.equal(destination.searchParams.get("module"), "dashboard");
  for (const key of filterKeys) assert.equal(destination.searchParams.has(key), false, `${key} must not leak into the next workspace`);
  destination = undefined;
  allowed = false;
  assert.equal(vm.runInContext('pushWorkspaceLocation("station-status", "dashboard")', context), false);
  assert.equal(destination, undefined);
});

test("comparison entry and page inherit the exact AI workspace permission boundary", () => {
  assert.match(index, /const ComparisonWorkspace = React\.lazy\(\(\) =>\s*import\("@\/components\/comparison\/ComparisonWorkspace"\)\s*\)/);
  assert.match(index, /"comparison":\s*"comparison"/);
  assert.match(index, /id: "file-uploads"[\s\S]*?id: "comparison"[\s\S]*?label: "比對系統"[\s\S]*?visible: canViewModule\("ai-chat"\)/);
  assert.match(index, /case "comparison":[\s\S]{0,160}<PermissionGuard module="ai-chat">[\s\S]{0,120}<ComparisonWorkspace/);
});

test("homepage AutoCheck and the requested previews use the shared repair illustration style", async () => {
  const [dock, preview, permissions] = await Promise.all([
    read("src/components/layout/MobileWorkspaceDock.tsx"),
    read("src/components/layout/WorkspacePreview.tsx"),
    read("src/components/admin/UserPermissionsDialog.tsx"),
  ]);
  assert.match(dock, /SECONDARY_WORKSPACES = \[[\s\S]*?id: "comparison", label: "比對系統"/);
  assert.match(dock, /SECONDARY_WORKSPACES\.filter\(\(item\) => availableIds\.has\(item.id\)\)/);
  assert.match(index, /title: id === "comparison" \? "AutoCheck" : label/);
  for (const name of ["pcb", "analysis", "performance", "comparison"]) assert.match(preview, new RegExp(`assets/workspace/${name}(?:-v2)?\\.webp`));
  assert.match(preview, /workspace-preview--artwork/);
  assert.doesNotMatch(preview, /PcbWorkspacePreview|preview-ai-sources|preview-performance-categories/);
  assert.match(permissions, /「比對系統」沿用 AI 問答權限/);
});

test("comparison presence and filter audit use the public workspace label", async () => {
  const [collaboration, administration, audit] = await Promise.all([
    read("src/components/collaboration/CollaborationCenter.tsx"),
    read("src/components/collaboration/AdminCollaborationPanel.tsx"),
    read("docs/filter-ui-audit.md"),
  ]);
  assert.match(collaboration, /comparison:\s*"比對系統"/);
  assert.match(administration, /comparison:\s*"比對系統"/);
  assert.match(audit, /ComparisonWorkspace\.tsx/);
});
