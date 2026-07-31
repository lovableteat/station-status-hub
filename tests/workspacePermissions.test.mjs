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

const {
  canAccessModule,
  readWorkspaceAccess,
  synchronizeWorkspacePermissions,
} = permissionsModule;

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

test("configured station view grants Test_Plan viewing without an explicit Test_Plan row", () => {
  const base = {
    module: "test-plan",
    role: "engineer",
    permissions: [],
    permissionSettings: configured({ "station-status": "view" }),
  };

  assert.equal(canAccessModule({ ...base, action: "view" }), true);
  assert.equal(canAccessModule({ ...base, action: "edit" }), false);
});

test("configured station edit grants Test_Plan viewing and editing without explicit Test_Plan rows", () => {
  const base = {
    module: "test-plan",
    role: "engineer",
    permissions: [],
    permissionSettings: configured({ "station-status": "edit" }),
  };

  assert.equal(canAccessModule({ ...base, action: "view" }), true);
  assert.equal(canAccessModule({ ...base, action: "edit" }), true);
});

test("configured station denial defeats stale Test_Plan page permissions", () => {
  const base = {
    module: "test-plan",
    role: "engineer",
    permissions: ["test_plan_edit"],
    permissionSettings: configured({ "station-status": "none" }),
  };

  assert.equal(canAccessModule({ ...base, action: "view" }), false);
  assert.equal(canAccessModule({ ...base, action: "edit" }), false);
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

test("legacy accounts without station workspace configuration fall back to explicit Test_Plan permissions", () => {
  const base = {
    module: "test-plan",
    role: "engineer",
    permissions: ["test_plan_edit"],
    permissionSettings: {},
  };

  assert.equal(canAccessModule({ ...base, action: "view" }), true);
  assert.equal(canAccessModule({ ...base, action: "edit" }), true);
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

test("legacy accounts inherit PCB access from their Data-center workspace", () => {
  const settings = configured({ "data-center": "edit" });

  assert.equal(
    canAccessModule({
      module: "pcb-designer",
      action: "edit",
      role: "engineer",
      permissions: [],
      permissionSettings: settings,
    }),
    true,
  );
});

test("explicit PCB access overrides the legacy Data-center fallback", () => {
  const settings = configured({
    "data-center": "edit",
    "pcb-designer": "none",
  });

  assert.equal(
    canAccessModule({
      module: "pcb-designer",
      action: "view",
      role: "engineer",
      permissions: ["pcb_designer_edit"],
      permissionSettings: settings,
    }),
    false,
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
      "test_plan_view",
      "test_tracker_view",
      "tools_view",
    ].sort()
  );
  assert.deepEqual(
    synchronizeWorkspacePermissions(existing, "station-status", "none"),
    ["admin_view"]
  );
});

test("permission settings expose the same six workspaces as the home page", () => {
  const access = readWorkspaceAccess(
    {},
    ["dashboard_view", "data_center_edit", "pcb_designer_view", "admin_edit", "comparison_view"],
  );

  assert.deepEqual(Object.keys(access), [
    "station-status",
    "material-requests",
    "data-center",
    "pcb-designer",
    "user-management",
    "ai-chat",
  ]);
  assert.equal(access["station-status"], "view");
  assert.equal(access["data-center"], "edit");
  assert.equal(access["user-management"], "edit");
  assert.equal(access["ai-chat"], "view");
});

test("backend workspace level still respects its detailed page permissions", () => {
  const base = {
    role: "engineer",
    permissionSettings: configured({ "user-management": "edit" }),
  };

  assert.equal(
    canAccessModule({
      ...base,
      module: "users",
      action: "edit",
      permissions: ["api_management_edit"],
    }),
    false,
  );
  assert.equal(
    canAccessModule({
      ...base,
      module: "api-management",
      action: "edit",
      permissions: ["api_management_edit"],
    }),
    true,
  );
});

test("explicit AI workspace access is independent from API management", () => {
  const base = {
    module: "ai-chat",
    role: "engineer",
    permissions: ["api_management_edit"],
  };

  assert.equal(
    canAccessModule({
      ...base,
      action: "view",
      permissionSettings: configured({ "ai-chat": "none" }),
    }),
    false,
  );
  assert.equal(
    canAccessModule({
      ...base,
      action: "view",
      permissionSettings: configured({ "ai-chat": "view" }),
    }),
    true,
  );
});

test("legacy AI users keep access until the new workspace is explicitly configured", () => {
  assert.equal(
    canAccessModule({
      module: "ai-chat",
      action: "view",
      role: "engineer",
      permissions: ["api_management_view"],
      permissionSettings: {},
    }),
    true,
  );
});
