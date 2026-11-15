import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { createWorkspaceState, reduceWorkspaceState, type PcbWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";

function seed() {
  const a = createBlankProject("測試板 A");
  const b = createBlankProject("測試板 B");
  a.components = [{ ...structuredClone(BUILT_IN_COMPONENTS[0]), instanceId: "a-part", reference: "U1", x: 20, y: 20, rotation: 0, layer: "top", locked: false }];
  const data: PcbSaveState = {
    projects: [a, b], templates: [], library: structuredClone(BUILT_IN_COMPONENTS),
    activeProjectId: a.id, updatedAt: a.updatedAt,
  };
  return createWorkspaceState(data, true);
}

function preserveView(state: PcbWorkspaceState) {
  return {
    activeProjectId: state.activeProject.id, zoom: state.zoom, viewCenter: state.viewCenter,
    activeLayer: state.activeLayer, visibleLayer: state.visibleLayer, rightTab: state.rightTab,
    selection: state.selection, selectedObjects: state.selectedObjects,
  };
}

test("hydration retaining A's view cannot reuse the remote active B's DRC cache", () => {
  const initial = seed();
  const state = reduceWorkspaceState(initial, { type: "project/commit", update: {
    ...initial.activeProject, components: initial.activeProject.components.map(component => ({ ...component, x: -100 })),
  } });
  assert.ok(state.drcIssues.length > 0);
  const remote = { ...state.data, activeProjectId: state.data.projects[1].id };
  const hydrated = reduceWorkspaceState(state, { type: "persistence/hydrate", data: remote, preserveView: preserveView(state) });
  assert.equal(hydrated.activeProject.id, state.activeProject.id);
  assert.deepEqual(hydrated.drcIssues, state.drcIssues);
});

test("background hydration keeps unchanged board history and document lock, resetting only changed boards", () => {
  const initial = seed();
  const aId = initial.activeProject.id;
  const bId = initial.data.projects[1].id;
  let state = reduceWorkspaceState(initial, { type: "project/rename", projectId: aId, name: "測試板 A 修改" });
  state = reduceWorkspaceState(state, { type: "project/open", projectId: bId });
  state = reduceWorkspaceState(state, { type: "project/rename", projectId: bId, name: "測試板 B 修改" });
  state = reduceWorkspaceState(state, { type: "project/open", projectId: aId });
  state = reduceWorkspaceState(state, { type: "selection/set", selection: { kind: "component", id: "a-part" } });
  state = reduceWorkspaceState(state, { type: "document/toggle-lock" });
  const remote = structuredClone(state.data);
  remote.projects.find(project => project.id === bId)!.description = "遠端修改";
  const hydrated = reduceWorkspaceState(state, { type: "persistence/hydrate", data: remote, preserveView: preserveView(state) });
  assert.deepEqual(hydrated.historyByProject[aId], state.historyByProject[aId]);
  assert.deepEqual(hydrated.pendingHistoryByProject[aId], state.pendingHistoryByProject[aId]);
  assert.equal(hydrated.historyByProject[bId].undo.length, 0);
  assert.equal(hydrated.documentLocked, true);
  assert.deepEqual(hydrated.selection, state.selection);
  const unlocked = reduceWorkspaceState(hydrated, { type: "document/toggle-lock" });
  const undone = reduceWorkspaceState(unlocked, { type: "history/undo" });
  assert.equal(undone.activeProject.name, initial.activeProject.name);
});

test("save metadata and JSON key ordering do not erase a board's undo", () => {
  let state = seed();
  state = reduceWorkspaceState(state, { type: "bom/import", items: [{ ...BUILT_IN_COMPONENTS[0], reference: "U2", quantity: 1 }] });
  state = reduceWorkspaceState(state, { type: "project/rename", projectId: state.activeProject.id, name: "測試板 A 修改" });
  const remote = structuredClone(state.data);
  remote.pendingPlacementsByProject![state.activeProject.id] = remote.pendingPlacementsByProject![state.activeProject.id]
    .map(item => Object.fromEntries(Object.entries(item).reverse()) as typeof item);
  remote.projects[0] = {
    ...Object.fromEntries(Object.entries(remote.projects[0]).reverse()),
    updatedAt: "2099-01-01T00:00:00.000Z", lastEditedBy: "測試使用者", lastEditedById: "test-actor",
  } as typeof remote.projects[0];
  const hydrated = reduceWorkspaceState(state, { type: "persistence/hydrate", data: remote, preserveView: preserveView(state) });
  assert.deepEqual(hydrated.historyByProject[state.activeProject.id].undo, state.historyByProject[state.activeProject.id].undo);
  assert.equal(hydrated.historyByProject[state.activeProject.id].current.updatedAt, remote.projects[0].updatedAt);
  assert.equal(hydrated.canUndo, true);
});

test("changed active board resets its history while retaining the user's document lock", () => {
  let state = seed();
  state = reduceWorkspaceState(state, { type: "project/rename", projectId: state.activeProject.id, name: "測試板 A 修改" });
  state = reduceWorkspaceState(state, { type: "document/toggle-lock" });
  const remote = structuredClone(state.data);
  remote.projects[0].description = "另一使用者更新";
  const hydrated = reduceWorkspaceState(state, { type: "persistence/hydrate", data: remote, preserveView: preserveView(state) });
  assert.equal(hydrated.canUndo, false);
  assert.equal(hydrated.documentLocked, true);
});

test("transition busy blocks queued edits and board changes without withdrawing sync permission", () => {
  const initial = seed();
  const busy = reduceWorkspaceState(initial, { type: "transition/set-busy", busy: true });
  assert.equal(busy.canEdit, true);
  assert.equal(busy.transitionBusy, true);
  for (const action of [
    { type: "project/commit" as const, update: { ...busy.activeProject, name: "不得套用" } },
    { type: "project/open" as const, projectId: busy.data.projects[1].id },
    { type: "document/toggle-lock" as const },
    { type: "persistence/hydrate" as const, data: initial.data },
  ]) assert.equal(reduceWorkspaceState(busy, action), busy);
  const zoomed = reduceWorkspaceState(busy, { type: "zoom/set", zoom: 150 });
  assert.equal(zoomed.zoom, 150);
  const released = reduceWorkspaceState(busy, { type: "transition/set-busy", busy: false });
  assert.equal(reduceWorkspaceState(released, { type: "project/open", projectId: initial.data.projects[1].id }).activeProject.id, initial.data.projects[1].id);
});

test("discard restores only the active board and its queue, even after lease loss", () => {
  const initial = seed();
  const baseline = initial.activeProject;
  const otherId = initial.data.projects[1].id;
  let state = reduceWorkspaceState(initial, { type: "project/open", projectId: otherId });
  state = reduceWorkspaceState(state, { type: "project/rename", projectId: otherId, name: "測試板 B 未儲存" });
  state = reduceWorkspaceState(state, { type: "project/open", projectId: baseline.id });
  state = reduceWorkspaceState(state, { type: "project/rename", projectId: baseline.id, name: "測試板 A 未儲存" });
  state = reduceWorkspaceState(state, { type: "bom/import", items: [{ ...BUILT_IN_COMPONENTS[0], reference: "U2", quantity: 1 }] });
  state = reduceWorkspaceState(state, { type: "selection/set", selection: { kind: "component", id: "a-part" } });
  state = reduceWorkspaceState(state, { type: "permission/set", canEdit: false });
  state = reduceWorkspaceState(state, { type: "transition/set-busy", busy: true });
  const discarded = reduceWorkspaceState(state, { type: "project/discard", project: baseline, pendingPlacements: [] });
  assert.equal(discarded.activeProject.name, baseline.name);
  assert.ok(discarded.activeProject.updatedAt > state.activeProject.updatedAt);
  assert.deepEqual(discarded.pendingPlacements, []);
  assert.equal(discarded.canUndo, false);
  assert.equal(discarded.canRedo, false);
  assert.equal(discarded.selection, null);
  assert.deepEqual(discarded.selectedObjects, []);
  assert.deepEqual(discarded.data.projects.find(project => project.id === otherId), state.data.projects.find(project => project.id === otherId));
  assert.deepEqual(discarded.historyByProject[otherId], state.historyByProject[otherId]);
  assert.deepEqual(discarded.data.library, state.data.library);
  assert.equal(discarded.canEdit, false);
  assert.equal(reduceWorkspaceState(state, { type: "project/discard", project: state.data.projects[1], pendingPlacements: [] }), state);
});
