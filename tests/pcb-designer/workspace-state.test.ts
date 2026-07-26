import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const moduleUrl = new URL(
  "../../src/components/pcb-designer/core/workspace.ts",
  import.meta.url,
);

async function loadWorkspaceModule() {
  await assert.doesNotReject(
    access(moduleUrl),
    "workspace state module should exist",
  );
  return import(moduleUrl.href);
}

function seedState(): PcbSaveState {
  const project = createBlankProject("Original");
  return {
    projects: [project],
    templates: structuredClone(BUILT_IN_TEMPLATES),
    library: structuredClone(BUILT_IN_COMPONENTS),
    activeProjectId: project.id,
    updatedAt: project.updatedAt,
  };
}

test("project CRUD keeps an active project and duplicates with fresh identity", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const created = reduceWorkspaceState(initial, {
    type: "project/create",
    input: { name: "Control board", description: "Main", width: 120, height: 90 },
  });
  const createdProject = created.data.projects.find((item) => item.name === "Control board");

  assert.ok(createdProject);
  assert.equal(created.data.activeProjectId, createdProject.id);

  const renamed = reduceWorkspaceState(created, {
    type: "project/rename",
    projectId: createdProject.id,
    name: "Control board v2",
  });
  const duplicated = reduceWorkspaceState(renamed, {
    type: "project/duplicate",
    projectId: createdProject.id,
  });
  const copy = duplicated.data.projects.find((item) => item.name === "Control board v2 複本");

  assert.ok(copy);
  assert.notEqual(copy.id, createdProject.id);

  const deleted = reduceWorkspaceState(duplicated, {
    type: "project/delete",
    projectId: copy.id,
  });
  assert.equal(deleted.data.projects.some((item) => item.id === copy.id), false);
  assert.ok(deleted.data.activeProjectId);
});

test("templates create new projects while built-ins cannot be renamed or deleted", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const builtIn = initial.data.templates[0];
  const applied = reduceWorkspaceState(initial, {
    type: "template/apply",
    templateId: builtIn.id,
  });

  assert.equal(applied.data.projects.length, 2);
  assert.notEqual(applied.data.activeProjectId, initial.data.activeProjectId);

  const renamed = reduceWorkspaceState(applied, {
    type: "template/rename",
    templateId: builtIn.id,
    name: "Forbidden",
  });
  const deleted = reduceWorkspaceState(renamed, {
    type: "template/delete",
    templateId: builtIn.id,
  });
  assert.equal(deleted.data.templates.find((item) => item.id === builtIn.id)?.name, builtIn.name);
});

test("library CRUD preserves built-ins and import upserts duplicate part numbers", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const builtIn = initial.data.library[0];
  const protectedDelete = reduceWorkspaceState(initial, {
    type: "library/delete",
    componentId: builtIn.id,
  });
  assert.equal(protectedDelete.data.library.some((item) => item.id === builtIn.id), true);

  const imported = reduceWorkspaceState(protectedDelete, {
    type: "library/import",
    components: [
      {
        name: "Controller",
        type: "IC",
        manufacturer: "Acme",
        partNumber: "A-1",
        width: 4,
        height: 4,
        maxHeight: 1,
        color: "#123456",
      },
      {
        name: "Controller revised",
        type: "IC",
        manufacturer: "Acme",
        partNumber: "A-1",
        width: 5,
        height: 4,
        maxHeight: 1,
        color: "#123456",
      },
    ],
  });
  const matches = imported.data.library.filter(
    (item) => item.manufacturer === "Acme" && item.partNumber === "A-1",
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Controller revised");
});

test("commit, undo and redo refresh project history and DRC", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const committed = reduceWorkspaceState(initial, {
    type: "project/commit",
    update: {
      ...initial.activeProject,
      board: { ...initial.activeProject.board, width: 140 },
    },
  });

  assert.equal(committed.activeProject.board.width, 140);
  assert.equal(committed.canUndo, true);

  const undone = reduceWorkspaceState(committed, { type: "history/undo" });
  assert.equal(undone.activeProject.board.width, 100);
  assert.equal(undone.canRedo, true);

  const redone = reduceWorkspaceState(undone, { type: "history/redo" });
  assert.equal(redone.activeProject.board.width, 140);
  assert.deepEqual(redone.drcIssues, []);
});

test("view-only and document lock reject every mutation but allow navigation state", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const data = seedState();
  const readOnly = createWorkspaceState(data, false);
  const rejected = reduceWorkspaceState(readOnly, {
    type: "project/rename",
    projectId: data.projects[0].id,
    name: "Should not change",
  });
  assert.equal(rejected.activeProject.name, "Original");

  const editable = createWorkspaceState(data, true);
  const locked = reduceWorkspaceState(editable, { type: "document/toggle-lock" });
  const lockedMutation = reduceWorkspaceState(locked, {
    type: "project/rename",
    projectId: data.projects[0].id,
    name: "Should not change",
  });
  const panned = reduceWorkspaceState(lockedMutation, {
    type: "tool/set",
    tool: "pan",
  });

  assert.equal(lockedMutation.activeProject.name, "Original");
  assert.equal(panned.tool, "pan");
});

test("BOM pending placements persist per project instead of leaking across project switches", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const withBom = reduceWorkspaceState(initial, {
    type: "bom/import",
    items: [{
      name: "Resistor",
      type: "Resistor",
      manufacturer: "Acme",
      partNumber: "R-1",
      width: 1.6,
      height: 0.8,
      maxHeight: 0.5,
      color: "#fff",
      quantity: 2,
      reference: "R1",
    }],
  });
  const firstProjectId = withBom.activeProject.id;
  assert.equal(withBom.data.pendingPlacementsByProject?.[firstProjectId]?.length, 2);

  const created = reduceWorkspaceState(withBom, {
    type: "project/create",
    input: { name: "Second" },
  });
  assert.deepEqual(created.pendingPlacements, []);

  const reopened = reduceWorkspaceState(created, {
    type: "project/open",
    projectId: firstProjectId,
  });
  assert.equal(reopened.pendingPlacements.length, 2);
});
