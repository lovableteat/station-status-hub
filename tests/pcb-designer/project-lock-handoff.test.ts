import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import type { PcbProjectLockResult, PcbRemoteClient } from "../../src/components/pcb-designer/core/remoteSync.ts";

const { React, act, create, loader, browser, deferred } = createRequire(import.meta.url)("../support/renderHarness.cjs");
const window = browser();
const { usePcbProjectLock } = loader({ window })("src/components/pcb-designer/hooks/usePcbProjectLock.ts");
const acquired: PcbProjectLockResult = { available: true, acquired: true, lock: null };
const props = (client: PcbRemoteClient, projectId = "A", projectName = "測試板 A") => ({
  client, clientId: "synthetic-tab", projectId, projectName, permissionCanEdit: true,
});
async function mount(initial: ReturnType<typeof props>) {
  let value: ReturnType<typeof usePcbProjectLock>;
  function Harness(input: ReturnType<typeof props>) { value = usePcbProjectLock(input); return null; }
  let root: ReturnType<typeof create>;
  await act(async () => { root = create(React.createElement(Harness, initial)); });
  return {
    get value() { return value!; },
    async render(input: ReturnType<typeof props>) { await act(async () => root.update(React.createElement(Harness, input))); },
    async close() { await act(async () => root.unmount()); },
  };
}

test("renaming keeps the current lease and the next refresh uses the new name", async () => {
  const calls: string[] = [];
  const client: PcbRemoteClient = {
    acquireProjectLock: async ({ projectId, projectName }) => { calls.push(`acquire:${projectId}:${projectName}`); return acquired; },
    releaseProjectLock: async id => { calls.push(`release:${id}`); return true; },
  };
  const hook = await mount(props(client));
  try {
    assert.equal(hook.value.canEdit, true);
    await hook.render(props(client, "A", "重新命名測試板"));
    assert.deepEqual(calls, ["acquire:A:測試板 A"]);
    assert.equal(hook.value.canEdit, true);
    await act(async () => hook.value.refresh());
    assert.deepEqual(calls, ["acquire:A:測試板 A", "acquire:A:重新命名測試板"]);
  } finally { await hook.close(); }
});

test("rapid A to B to A waits for A release and never starts the abandoned B lease", async () => {
  const release = deferred();
  const calls: string[] = [];
  const leases = new Set<string>();
  const client: PcbRemoteClient = {
    acquireProjectLock: async ({ projectId }) => { calls.push(`acquire:${projectId}`); leases.add(projectId); return acquired; },
    releaseProjectLock: async id => { calls.push(`release:${id}`); if (id === "A") await release.promise; leases.delete(id); return true; },
  };
  const hook = await mount(props(client));
  try {
    await hook.render(props(client, "B"));
    assert.equal(hook.value.canEdit, false);
    await hook.render(props(client, "A"));
    assert.equal(hook.value.canEdit, false);
    assert.deepEqual(calls, ["acquire:A", "release:A"]);
    await act(async () => release.resolve());
    assert.deepEqual(calls, ["acquire:A", "release:A", "acquire:A"]);
    assert.equal(hook.value.canEdit, true);
    assert.deepEqual([...leases], ["A"]);
  } finally { release.resolve(); await hook.close(); }
});

test("an old acquire finishing after switching is released before B acquires", async () => {
  const pending = deferred();
  const calls: string[] = [];
  const leases = new Set<string>();
  const client: PcbRemoteClient = {
    acquireProjectLock: async ({ projectId }) => {
      calls.push(`acquire:${projectId}`);
      if (projectId === "A") await pending.promise;
      leases.add(projectId); return acquired;
    },
    releaseProjectLock: async id => { calls.push(`release:${id}`); leases.delete(id); return true; },
  };
  const hook = await mount(props(client));
  try {
    assert.equal(hook.value.canEdit, false);
    await hook.render(props(client, "B"));
    assert.equal(hook.value.canEdit, false);
    await act(async () => pending.resolve());
    assert.deepEqual(calls, ["acquire:A", "release:A", "acquire:B"]);
    assert.deepEqual([...leases], ["B"]);
    assert.equal(hook.value.canEdit, true);
  } finally { pending.resolve(); await hook.close(); }
});

test("revoking edit permission fences a pending acquire and releases its late lease", async () => {
  const pending = deferred();
  const calls: string[] = [];
  const client: PcbRemoteClient = {
    acquireProjectLock: async () => { calls.push("acquire"); await pending.promise; return acquired; },
    loadProjectLock: async () => { calls.push("load"); return { ...acquired, acquired: false }; },
    releaseProjectLock: async () => { calls.push("release"); return true; },
  };
  const hook = await mount(props(client));
  try {
    await hook.render({ ...props(client), permissionCanEdit: false });
    assert.equal(hook.value.canEdit, false);
    await act(async () => pending.resolve());
    assert.deepEqual(calls, ["acquire", "release", "load"]);
    assert.equal(hook.value.canEdit, false);
    assert.equal(hook.value.status, "viewing");
  } finally { pending.resolve(); await hook.close(); }
});

test("remounting the same client waits for the previous mount's release", async () => {
  const release = deferred();
  const calls: string[] = [];
  const client: PcbRemoteClient = {
    acquireProjectLock: async () => { calls.push("acquire"); return acquired; },
    releaseProjectLock: async () => { calls.push("release"); await release.promise; return true; },
  };
  const first = await mount(props(client));
  await first.close();
  const second = await mount(props(client));
  try {
    assert.deepEqual(calls, ["acquire", "release"]);
    assert.equal(second.value.canEdit, false);
    await act(async () => release.resolve());
    assert.deepEqual(calls, ["acquire", "release", "acquire"]);
    assert.equal(second.value.canEdit, true);
  } finally { release.resolve(); await second.close(); }
});

test("a failed release does not prevent the next board from acquiring its own lease", async () => {
  const calls: string[] = [];
  const client: PcbRemoteClient = {
    acquireProjectLock: async ({ projectId }) => { calls.push(`acquire:${projectId}`); return acquired; },
    releaseProjectLock: async id => { calls.push(`release:${id}`); throw new Error("Synthetic transport error"); },
  };
  const hook = await mount(props(client));
  try {
    await hook.render(props(client, "B"));
    assert.deepEqual(calls, ["acquire:A", "release:A", "acquire:B"]);
    assert.equal(hook.value.canEdit, true);
  } finally { await hook.close(); }
});
