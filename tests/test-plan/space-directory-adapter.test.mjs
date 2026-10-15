import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const adapterUrl = new URL("../../src/components/test-plan/core/supabaseAdapter.ts", import.meta.url);
const errorsUrl = new URL("../../src/components/test-plan/core/errors.ts", import.meta.url);

function loadAdapter(run) {
  const calls = [];
  function query(entity, method) {
    const state = { entity, method, filters: {}, orders: [], from: 0, to: 499 };
    const builder = {
      select() { return builder; },
      eq(column, value) { state.filters[column] = value; return builder; },
      order(column) { state.orders.push(column); return builder; },
      range(from, to) { state.from = from; state.to = to; return builder; },
      then(resolve, reject) {
        const snapshot = structuredClone(state);
        calls.push(snapshot);
        return Promise.resolve().then(() => run(snapshot)).then(resolve, reject);
      },
    };
    return builder;
  }
  const client = {
    from(table) { return query(table, "select"); },
    rpc(name) { return query(name, "rpc"); },
  };
  function load(url) {
    const module = { exports: {} };
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = name => {
      if (name === "@/integrations/supabase/client") return { supabase: client, SUPABASE_URL: "https://example.invalid" };
      if (name === "./errors") return load(errorsUrl);
      throw new Error(`Unexpected adapter dependency: ${name}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console }, { filename: fileURLToPath(url) })(require, module, module.exports);
    return module.exports;
  }
  return { adapter: load(adapterUrl).createSupabaseTestPlanAdapter(), calls };
}

const stamp = "2026-10-14T00:00:00Z";
function space(owner, extra = {}) {
  return { id: `space-${owner}`, owner_id: owner, project_id: null, is_personal: true, name: `Stale ${owner}`, description: "@old-login", color: "#5fae94", created_at: stamp, updated_at: stamp, ...extra };
}
function member(owner, displayName = `Current ${owner}`, username = `login-${owner}`) {
  return { user_id: owner, display_name: displayName, username, role: "engineer", avatar_path: null };
}
function rows(spaces, members) {
  return request => {
    const source = request.entity === "test_plan_spaces" ? spaces : members;
    const scoped = request.filters.project_id ? source.filter(row => row.project_id === request.filters.project_id) : source;
    return { data: scoped.slice(request.from, request.to + 1), error: null };
  };
}

test("personal-space labels come from the current account directory while stable identity and metadata are retained", async () => {
  const original = space("owner", { project_id: "old-project", color: "#aabbcc" });
  const { adapter, calls } = loadAdapter(rows([original], [member("owner", "  新姓名  ", "new-login")]));
  const result = await adapter.listSpaces();
  assert.equal(result.length, 1);
  const row = result[0];
  assert.equal(row.name, "新姓名");
  assert.equal(row.description, "@new-login");
  assert.equal(row.id, original.id);
  assert.equal(row.ownerId, original.owner_id);
  assert.equal(row.ownerRole, "engineer");
  assert.equal(row.projectId, original.project_id);
  assert.equal(row.color, original.color);
  assert.equal(row.isPersonal, true);
  assert.equal(row.createdAt, stamp);
  assert.equal(row.updatedAt, stamp);
  assert.equal(original.name, "Stale owner");
  assert.ok(calls.every(call => call.method === "select" || call.method === "rpc"));
  assert.deepEqual(calls.map(call => call.entity), ["test_plan_spaces", "list_active_collaboration_members"]);
});

test("owner roles come from the account directory even when administrators rename themselves or other accounts use administrator names", async () => {
  const directory = [
    { ...member("admin", "一般姓名", "renamed-admin"), role: "admin" },
    { ...member("super", "工程同仁", "another-login"), role: "super_admin" },
    member("engineer", "管理員", "super_admin"),
    member("ordinary", "Administrator", "admin"),
  ];
  const stored = directory.map(account => space(account.user_id));
  const { adapter, calls } = loadAdapter(rows(stored, directory));
  const result = await adapter.listSpaces();
  assert.deepEqual(Array.from(result, row => [row.ownerId, row.name, row.ownerRole]), [
    ["admin", "一般姓名", "admin"],
    ["super", "工程同仁", "super_admin"],
    ["engineer", "管理員", "engineer"],
    ["ordinary", "Administrator", "engineer"],
  ]);
  directory[0].display_name = "新管理姓名";
  directory[1].display_name = "";
  const renamed = await adapter.listSpaces();
  assert.equal(renamed[0].name, "新管理姓名");
  assert.equal(renamed[0].ownerRole, "admin");
  assert.equal(renamed[1].name, "another-login");
  assert.equal(renamed[1].ownerRole, "super_admin");
  assert.deepEqual(calls.map(call => call.entity), [
    "test_plan_spaces", "list_active_collaboration_members",
    "test_plan_spaces", "list_active_collaboration_members",
  ]);
});

test("same display names remain distinct accounts and blank display names fall back to username", async () => {
  const { adapter } = loadAdapter(rows([space("a"), space("b"), space("c")], [member("a", "同名", "alice"), member("b", "同名", "bob"), member("c", "   ", "carol")]));
  const result = await adapter.listSpaces();
  assert.deepEqual(Array.from(result, row => [row.id, row.name, row.description]), [
    ["space-a", "同名", "@alice"],
    ["space-b", "同名", "@bob"],
    ["space-c", "carol", "@carol"],
  ]);
});

test("inactive, deleted and unlisted owners are excluded without rewriting or deleting their spaces", async () => {
  const stored = [space("active"), space("inactive"), space("deleted")];
  const snapshot = structuredClone(stored);
  const { adapter, calls } = loadAdapter(rows(stored, [member("active"), member("account-with-no-space")]));
  const result = await adapter.listSpaces();
  assert.deepEqual(Array.from(result, row => row.ownerId), ["active"]);
  assert.deepEqual(stored, snapshot);
  assert.ok(!calls.some(call => call.method === "delete" || call.method === "update"));
});

test("space and directory pagination each read every 500-row page and retain the original project filter", async () => {
  const stored = Array.from({ length: 1001 }, (_, index) => space(`u${index}`, { project_id: "selected-project" }));
  const directory = stored.map(row => member(row.owner_id));
  const { adapter, calls } = loadAdapter(rows(stored, directory));
  const result = await adapter.listSpaces("selected-project");
  assert.equal(result.length, 1001);
  assert.equal(result[1000].name, "Current u1000");
  assert.equal(new Set(Array.from(result, row => row.id)).size, 1001);
  for (const entity of ["test_plan_spaces", "list_active_collaboration_members"]) {
    const pages = calls.filter(call => call.entity === entity);
    assert.deepEqual(pages.map(call => [call.from, call.to]), [[0, 499], [500, 999], [1000, 1499]]);
    assert.ok(pages.every(call => call.to - call.from + 1 === 500));
  }
  assert.ok(calls.filter(call => call.entity === "test_plan_spaces").every(call => call.filters.project_id === "selected-project" && call.filters.is_personal === true));
  assert.ok(calls.filter(call => call.entity === "list_active_collaboration_members").every(call => call.method === "rpc" && call.orders.includes("user_id") && Object.keys(call.filters).length === 0));
});

test("a failure in any directory page rejects the load instead of returning stale or partial identities", async () => {
  const directory = Array.from({ length: 500 }, (_, index) => member(`u${index}`));
  const { adapter } = loadAdapter(request => {
    if (request.entity === "test_plan_spaces") return { data: [space("u0")], error: null };
    return request.from === 0 ? { data: directory, error: null } : { data: null, error: { message: "directory unavailable" } };
  });
  await assert.rejects(adapter.listSpaces(), /directory unavailable/);
});

test("space read errors and authorization errors propagate without a fallback roster", async () => {
  const first = loadAdapter(() => ({ data: null, error: { message: "space unavailable" } }));
  await assert.rejects(first.adapter.listSpaces(), /space unavailable/);
  assert.equal(first.calls.length, 1);
  const second = loadAdapter(request => request.entity === "test_plan_spaces"
    ? { data: [space("owner")], error: null }
    : { data: null, error: { code: "42501", message: "permission denied" } });
  await assert.rejects(second.adapter.listSpaces(), /權限/);
});
