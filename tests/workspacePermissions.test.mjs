import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../src/lib/workspacePermissions.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const permissionsModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const { canAccessModule, synchronizeWorkspacePermissions } = permissionsModule;

const configured = (workspaceAccess) => ({ workspaceAccess });

test("station workspace edit does not override missing page permission", () => {
  const allowed = canAccessModule({
    module: "test-tracker",
    action: "view",
    role: "engineer",
    permissions: ["dashboard_view"],
    permissionSettings: configured({ "station-status": "edit" }),
  });

  assert.equal(allowed, false);
});

test("station workspace view caps detailed edit permission", () => {
  const allowed = canAccessModule({
    module: "test-tracker",
    action: "edit",
    role: "engineer",
    permissions: ["test_tracker_view", "test_tracker_edit"],
    permissionSettings: configured({ "station-status": "view" }),
  });

  assert.equal(allowed, false);
});

test("station workspace edit and detailed edit permission grant editing", () => {
  const allowed = canAccessModule({
    module: "test-tracker",
    action: "edit",
    role: "engineer",
    permissions: ["test_tracker_edit"],
    permissionSettings: configured({ "station-status": "edit" }),
  });

  assert.equal(allowed, true);
});

test("explicit material workspace denial cannot be bypassed by legacy permission", () => {
  const allowed = canAccessModule({
    module: "material-requests",
    action: "view",
    role: "engineer",
    permissions: ["data_center_view"],
    permissionSettings: configured({ "material-requests": "none" }),
  });

  assert.equal(allowed, false);
});

test("station workspace never grants backend or API management", () => {
  const base = {
    action: "view",
    role: "engineer",
    permissions: [],
    permissionSettings: configured({ "station-status": "edit" }),
  };

  assert.equal(canAccessModule({ ...base, module: "users" }), false);
  assert.equal(canAccessModule({ ...base, module: "api-management" }), false);
});

test("flow setup has an independent permission from test tracking", () => {
  const base = {
    action: "view",
    role: "engineer",
    permissionSettings: configured({ "station-status": "edit" }),
  };

  assert.equal(
    canAccessModule({
      ...base,
      module: "flow-info",
      permissions: ["test_tracker_view"],
    }),
    false
  );
  assert.equal(
    canAccessModule({
      ...base,
      module: "flow-info",
      permissions: ["flow_info_view"],
    }),
    true
  );
});

test("legacy users without workspace settings keep their page permissions", () => {
  assert.equal(
    canAccessModule({
      module: "test-tracker",
      action: "view",
      role: "engineer",
      permissions: ["test_tracker_view"],
      permissionSettings: {},
    }),
    true
  );
});

test("admins retain full access", () => {
  assert.equal(
    canAccessModule({
      module: "users",
      action: "edit",
      role: "admin",
      permissions: [],
      permissionSettings: configured({ "station-status": "none" }),
    }),
    true
  );
});

test("workspace preset synchronizes station page permissions", () => {
  const existing = ["admin_view", "test_tracker_edit"];

  assert.deepEqual(
    synchronizeWorkspacePermissions(existing, "station-status", "view").sort(),
    [
      "admin_view",
      "dashboard_view",
      "flow_info_view",
      "issues_view",
      "production_view",
      "test_tracker_view",
      "tools_view",
    ].sort()
  );
  assert.deepEqual(
    synchronizeWorkspacePermissions(existing, "station-status", "none"),
    ["admin_view"]
  );
});
