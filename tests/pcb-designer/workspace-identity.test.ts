import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { createWorkspaceState, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import type { PcbWorkspaceAction } from "../../src/components/pcb-designer/core/workspaceTypes.ts";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freeze(nested);
  }
  return value;
}

function seed() {
  const projects = Array.from({ length: 26 }, (_, index) => {
    const project = createBlankProject(`Synthetic ${index}`);
    project.components = Array.from({ length: 150 }, (_, component) => ({
      ...BUILT_IN_COMPONENTS[0], instanceId: `${index}-${component}`, reference: `U${component + 1}`,
      x: 10 + component, y: 20, rotation: 0, layer: "top" as const, locked: false,
    }));
    return project;
  });
  return createWorkspaceState({ projects, activeProjectId: projects[0].id,
    templates: structuredClone(BUILT_IN_TEMPLATES), library: [], updatedAt: projects[0].updatedAt }, true);
}

test("editing one board reuses every untouched board and pending queue without mutating frozen input", () => {
  const initial = freeze(seed());
  const updated = reduceWorkspaceState(initial, { type: "project/commit", update: {
    ...initial.activeProject, components: initial.activeProject.components.map((part, index) => index ? part : { ...part, x: 31 }),
  } });
  assert.notEqual(updated.activeProject, initial.activeProject);
  assert.equal(updated.activeProject, updated.data.projects[0]);
  for (let index = 1; index < initial.data.projects.length; index++) assert.equal(updated.data.projects[index], initial.data.projects[index]);
  assert.equal(updated.pendingPlacements, initial.pendingPlacements);
  assert.equal(initial.activeProject.components[0].x, 10);
  const undone = reduceWorkspaceState(freeze(updated), { type: "history/undo" });
  const redone = reduceWorkspaceState(freeze(undone), { type: "history/redo" });
  assert.equal(undone.data.projects[1], initial.data.projects[1]);
  assert.equal(redone.data.projects[1], initial.data.projects[1]);
  assert.equal(redone.activeProject.components[0].x, 31);
});

test("board management preserves unrelated project identities and view-only actions preserve the active record", () => {
  const initial = freeze(seed());
  const second = initial.data.projects[1];
  const actions: PcbWorkspaceAction[] = [
    { type: "project/create", input: { name: "New synthetic" } },
    { type: "project/duplicate", projectId: initial.activeProject.id },
    { type: "project/import", project: initial.activeProject },
    { type: "template/apply", templateId: initial.data.templates[0].id },
    { type: "project/rename", projectId: second.id, name: "Other renamed" },
    { type: "project/delete", projectId: initial.activeProject.id },
  ];
  for (const action of actions) {
    const next = reduceWorkspaceState(initial, action);
    const untouched = initial.data.projects[2];
    assert.equal(next.data.projects.find(project => project.id === untouched.id), untouched, action.type);
  }
  const catalogChange = reduceWorkspaceState(initial, { type: "template/save", input: { name: "Synthetic", category: "Test", description: "Synthetic" } });
  assert.equal(catalogChange.activeProject, initial.activeProject);
  assert.equal(catalogChange.drcIssues, initial.drcIssues);
  assert.equal(reduceWorkspaceState(initial, { type: "persistence/touch" }).activeProject, initial.activeProject);
  const remote = structuredClone(initial.data);
  remote.projects[1].description = "Remote synthetic edit";
  const hydrated = reduceWorkspaceState(initial, { type: "persistence/hydrate", data: remote });
  assert.equal(hydrated.activeProject, initial.activeProject);
  assert.equal(hydrated.data.projects[2], initial.data.projects[2]);
  assert.notEqual(hydrated.data.projects[1], initial.data.projects[1]);
});
