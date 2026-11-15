import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { createWorkspaceState, reduceWorkspaceState, type PcbWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import type { PcbModelAssetMetadata, PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const metadata: PcbModelAssetMetadata = {
  schemaVersion: 1, id: "test-model", fileName: "synthetic.step",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  dimensions: { widthMm: 10, depthMm: 8, heightMm: 2 }, calibratedDimensions: { widthMm: 10, depthMm: 8, heightMm: 2 },
  upAxis: "z", bounds: { min: [0, 0, 0], max: [10, 8, 2] }, parts: [],
};

function seed() {
  const project = createBlankProject("測試板 A");
  project.components = [{ ...structuredClone(BUILT_IN_COMPONENTS[0]), instanceId: "test-component", reference: "U1", x: 20, y: 20, rotation: 0, layer: "top", locked: false }];
  const data: PcbSaveState = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  return createWorkspaceState(data, true);
}

function assignment(state: PcbWorkspaceState) {
  return { type: "model/assign" as const, projectId: state.activeProject.id, componentId: "test-component",
    generation: state.projectGeneration, requestToken: "test-request", metadata };
}

test("model assignment reports its exact accepted generation and remains one undoable edit", () => {
  const initial = seed();
  const action = assignment(initial);
  const applied = reduceWorkspaceState(initial, action);
  assert.equal(applied.activeProject.components[0].modelAssetId, metadata.id);
  assert.deepEqual(applied.modelAssignmentReceipt, { requestToken: action.requestToken, accepted: true, generation: applied.projectGeneration });
  assert.ok(applied.projectGeneration > initial.projectGeneration);
  const undone = reduceWorkspaceState(applied, { type: "history/undo" });
  assert.equal(undone.activeProject.components[0].modelAssetId, undefined);
  assert.notEqual(undone.projectGeneration, applied.modelAssignmentReceipt!.generation);
});

test("STEP completion cannot attach to another version with the same component id or after A to B to A", () => {
  const initial = seed();
  const action = assignment(initial);
  const copy = reduceWorkspaceState(initial, { type: "project/duplicate", projectId: initial.activeProject.id, newRevision: true });
  assert.equal(copy.activeProject.components[0].instanceId, action.componentId);
  const wrongBoard = reduceWorkspaceState(copy, action);
  assert.equal(wrongBoard.modelAssignmentReceipt?.accepted, false);
  assert.equal(wrongBoard.activeProject.components[0].modelAssetId, undefined);
  const reopened = reduceWorkspaceState(copy, { type: "project/open", projectId: initial.activeProject.id });
  const late = reduceWorkspaceState(reopened, action);
  assert.equal(late.modelAssignmentReceipt?.accepted, false);
  assert.equal(late.activeProject.components[0].modelAssetId, undefined);
});

test("permission loss, document lock, cancelled switching and intervening edits invalidate STEP work", () => {
  for (const change of [
    (s: PcbWorkspaceState) => reduceWorkspaceState(reduceWorkspaceState(s, { type: "permission/set", canEdit: false }), { type: "permission/set", canEdit: true }),
    (s: PcbWorkspaceState) => reduceWorkspaceState(reduceWorkspaceState(s, { type: "document/toggle-lock" }), { type: "document/toggle-lock" }),
    (s: PcbWorkspaceState) => reduceWorkspaceState(reduceWorkspaceState(s, { type: "transition/set-busy", busy: true }), { type: "transition/set-busy", busy: false }),
    (s: PcbWorkspaceState) => reduceWorkspaceState(s, { type: "project/rename", projectId: s.activeProject.id, name: "測試板 A 修改" }),
    (s: PcbWorkspaceState) => reduceWorkspaceState(reduceWorkspaceState(s, { type: "project/commit", update: { ...s.activeProject, components: [] } }), { type: "history/undo" }),
  ]) {
    const initial = seed();
    const changed = change(initial);
    const applied = reduceWorkspaceState(changed, assignment(initial));
    assert.equal(applied.modelAssignmentReceipt?.accepted, false);
    assert.equal(applied.activeProject.components[0].modelAssetId, undefined);
  }
});

test("rejected model assignments always return a receipt without changing document data", () => {
  const initial = seed();
  for (const blocked of [
    { ...initial, canEdit: false }, { ...initial, documentLocked: true }, { ...initial, transitionBusy: true },
    { ...initial, activeProject: { ...initial.activeProject, components: [] } },
    { ...initial, activeProject: { ...initial.activeProject, components: initial.activeProject.components.map(component => ({ ...component, locked: true })) } },
  ]) {
    const rejected = reduceWorkspaceState(blocked, assignment(blocked));
    assert.deepEqual(rejected.modelAssignmentReceipt, { requestToken: "test-request", accepted: false, generation: blocked.projectGeneration });
    assert.equal(rejected.data, blocked.data);
  }
});

test("changed active hydration invalidates STEP while saved metadata and view changes do not", () => {
  const initial = seed();
  const metadataOnly = structuredClone(initial.data);
  metadataOnly.projects[0].lastEditedBy = "測試使用者";
  const refreshed = reduceWorkspaceState(initial, { type: "persistence/hydrate", data: metadataOnly });
  assert.equal(refreshed.projectGeneration, initial.projectGeneration);
  assert.equal(reduceWorkspaceState(refreshed, assignment(initial)).modelAssignmentReceipt?.accepted, true);
  const changedData = structuredClone(initial.data);
  changedData.projects[0].description = "更新內容";
  const changed = reduceWorkspaceState(initial, { type: "persistence/hydrate", data: changedData });
  assert.equal(reduceWorkspaceState(changed, assignment(initial)).modelAssignmentReceipt?.accepted, false);
  const viewed = reduceWorkspaceState(initial, { type: "zoom/set", zoom: 150 });
  assert.equal(reduceWorkspaceState(viewed, assignment(initial)).modelAssignmentReceipt?.accepted, true);
});

test("hydration preserves the active board's import generation when the remote view selected another board", () => {
  const initial = seed();
  const copy = reduceWorkspaceState(initial, { type: "project/duplicate", projectId: initial.activeProject.id });
  const active = reduceWorkspaceState(copy, { type: "project/open", projectId: initial.activeProject.id });
  const remote = { ...active.data, activeProjectId: copy.activeProject.id };
  const hydrated = reduceWorkspaceState(active, { type: "persistence/hydrate", data: remote,
    preserveView: { activeProjectId: active.activeProject.id, zoom: active.zoom, viewCenter: active.viewCenter,
      activeLayer: active.activeLayer, visibleLayer: active.visibleLayer, rightTab: active.rightTab,
      selection: active.selection, selectedObjects: active.selectedObjects } });
  assert.equal(hydrated.projectGeneration, active.projectGeneration);
  assert.equal(reduceWorkspaceState(hydrated, assignment(active)).modelAssignmentReceipt?.accepted, true);
});
