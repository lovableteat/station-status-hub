import assert from "node:assert/strict";
import test from "node:test";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { createWorkspaceState, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import type { PcbProject, PcbSaveState } from "../../src/components/pcb-designer/types.ts";

function seed() {
  const project = createBlankProject("測試板 A");
  project.updatedAt = "2099-01-01T00:00:00.000Z";
  const data: PcbSaveState = {
    projects: [project], templates: [], library: [],
    activeProjectId: project.id, updatedAt: project.updatedAt,
  };
  return createWorkspaceState(data, true);
}

test("undo and redo save fresh revisions accepted by the cloud <= rule", () => {
  let state = seed();
  let cloud: PcbProject = structuredClone(state.activeProject);
  const save = () => {
    const incoming = state.activeProject;
    if (cloud.updatedAt <= incoming.updatedAt) cloud = structuredClone(incoming);
    assert.deepEqual(cloud, incoming, "the server must not silently ignore a restored snapshot");
  };
  const originalName = state.activeProject.name;
  state = reduceWorkspaceState(state, {
    type: "project/rename", projectId: state.activeProject.id, name: "測試板 A 已修改",
  });
  assert.ok(state.activeProject.updatedAt > cloud.updatedAt);
  save();
  const editedRevision = cloud.updatedAt;
  state = reduceWorkspaceState(state, { type: "history/undo" });
  assert.equal(state.activeProject.name, originalName);
  assert.ok(state.activeProject.updatedAt > editedRevision);
  assert.equal(state.historyByProject[state.activeProject.id].current.updatedAt, state.activeProject.updatedAt);
  save();
  const undoRevision = cloud.updatedAt;
  state = reduceWorkspaceState(state, { type: "history/redo" });
  assert.equal(state.activeProject.name, "測試板 A 已修改");
  assert.ok(state.activeProject.updatedAt > undoRevision);
  save();
  assert.equal(createWorkspaceState({ ...state.data, projects: [cloud] }, true).activeProject.name, cloud.name);
});

test("committing an old snapshot stamps after the current revision even with a clock behind it", () => {
  const initial = seed();
  const changed = reduceWorkspaceState(initial, {
    type: "project/commit", update: { ...initial.activeProject, description: "已修改" },
  });
  const restored = reduceWorkspaceState(changed, { type: "project/commit", update: initial.activeProject });
  assert.equal(restored.activeProject.description, initial.activeProject.description);
  assert.equal(Date.parse(changed.activeProject.updatedAt), Date.parse(initial.activeProject.updatedAt) + 1);
  assert.equal(Date.parse(restored.activeProject.updatedAt), Date.parse(changed.activeProject.updatedAt) + 1);
});

test("renaming an inactive board updates its revision and the workspace revision", () => {
  const initial = seed();
  const second = createBlankProject("測試板 B");
  second.updatedAt = "2099-02-01T00:00:00.000Z";
  const state = createWorkspaceState({ ...initial.data, projects: [...initial.data.projects, second] }, true);
  const changed = reduceWorkspaceState(state, { type: "project/rename", projectId: second.id, name: "測試板 B 已修改" });
  const updated = changed.data.projects.find(project => project.id === second.id)!;
  assert.equal(Date.parse(updated.updatedAt), Date.parse(second.updatedAt) + 1);
  assert.equal(changed.data.updatedAt, updated.updatedAt);
  assert.deepEqual(changed.activeProject, state.activeProject);
});
