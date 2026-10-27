import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { React, act, create, loader, deferred, flush } = require("../../../tests/support/renderHarness.cjs");

async function fixture(options = {}) {
  const auth = { user: { userId: "actor-a" }, sessionMode: "authenticated" };
  const permission = { edit: true, view: true };
  const writes = [];
  const hook = loader({ globals: { Error }, mocks: {
    "@/components/auth/UserContext": { useUser: () => auth },
    "@/hooks/usePermissions": { usePermissions: () => ({ canViewModule: () => permission.view, canEditModule: () => permission.edit }) },
    "./rlcPriorityStorage": { loadRlcPriorityRules: options.load ?? (async () => []), saveRlcPriorityRule: async (actor, rule) => { writes.push([actor, rule]); return options.save ? options.save(actor, rule) : { ...rule, updatedAt: "server" }; } },
  } })("src/components/material-requests/useRlcPriority.ts");
  let latest;
  function Probe(props) { latest = hook.useRlcPriority(props.projectId, props.userId, props.enabled); return null; }
  let props = { projectId: "project-a", userId: "actor-a", enabled: true }, view;
  await act(async () => { view = create(React.createElement(Probe, props)); });
  return { auth, permission, writes, view, get current() { return latest; }, update: async patch => { props = { ...props, ...patch }; await act(async () => view.update(React.createElement(Probe, props))); } };
}

test("RLC hook discards old-project reads and never shows rules across project switches", async () => {
  const old = deferred();
  const f = await fixture({ load: project => project === "project-a" ? old.promise : Promise.resolve([{ projectId: project, candidateKey: "b" }]) });
  try {
    await f.update({ projectId: "project-b" });
    await act(async () => old.resolve([{ projectId: "project-a", candidateKey: "a" }]));
    assert.equal(f.current.rules.length, 1);
    assert.equal(f.current.rules[0].projectId, "project-b");
  } finally { await act(async () => f.view.unmount()); }
});

test("RLC hook rejects stale project, read-only permission and mismatched account writes", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.current.saveRule({ projectId: "project-b" }), /專案/);
    f.permission.edit = false;
    await f.update({});
    await assert.rejects(f.current.saveRule({ projectId: "project-a" }));
    f.permission.edit = true;
    f.auth.user = { userId: "actor-b" };
    await f.update({});
    await assert.rejects(f.current.saveRule({ projectId: "project-a" }));
    assert.equal(f.writes.length, 0);
  } finally { await act(async () => f.view.unmount()); }
});

test("RLC hook keeps failed saves visible and cannot apply a completed save to another project", async () => {
  const pending = deferred();
  const f = await fixture({ save: () => pending.promise });
  try {
    let write;
    await act(async () => { write = f.current.saveRule({ projectId: "project-a", specKey: "s", candidateKey: "a" }); write.catch(() => {}); });
    await f.update({ projectId: "project-b" });
    await act(async () => pending.resolve({ projectId: "project-a", specKey: "s", candidateKey: "a" }));
    await assert.rejects(write);
    assert.equal(f.current.rules.length, 0);
    assert.equal(f.current.saving, false);
  } finally { await act(async () => f.view.unmount()); }
  const failed = await fixture({ save: async () => { throw new Error("CAS changed; reload"); } });
  try {
    await act(async () => { await assert.rejects(failed.current.saveRule({ projectId: "project-a" })); });
    assert.match(failed.current.error, /CAS changed/);
    assert.equal(failed.current.rules.length, 0);
    assert.equal(failed.current.saving, false);
  } finally { await act(async () => failed.view.unmount()); }
});
