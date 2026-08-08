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

function seedLegacyStateWithoutTask1Fields(): PcbSaveState {
  const state = seedState();
  delete (state as Partial<PcbSaveState> & Record<string, unknown>).visibleLayer;
  delete (state as Partial<PcbSaveState> & Record<string, unknown>).selectedObjects;
  delete (state as Partial<PcbSaveState> & Record<string, unknown>).modelAssets;
  return state;
}

function seedStateWithSelectedComponent(): PcbSaveState {
  const state = seedState();
  state.projects[0].components = [
    {
      ...structuredClone(BUILT_IN_COMPONENTS[3]),
      instanceId: "component-a",
      reference: "R1",
      x: 10,
      y: 10,
      rotation: 0,
      layer: "top",
      locked: false,
    },
  ];
  return state;
}

function seedStateWithLayeredComponents(): PcbSaveState {
  const state = seedState();
  state.projects[0].components = [
    {
      ...structuredClone(BUILT_IN_COMPONENTS[3]),
      instanceId: "top-component",
      reference: "R1",
      x: 10,
      y: 10,
      rotation: 0,
      layer: "top",
      locked: false,
    },
    {
      ...structuredClone(BUILT_IN_COMPONENTS[4]),
      instanceId: "bottom-component",
      reference: "C1",
      x: 30,
      y: 30,
      rotation: 0,
      layer: "bottom",
      locked: false,
    },
  ];
  return state;
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
  assert.deepEqual(created.viewCenter, { x: 60, y: 45 });
  assert.equal(created.selection, null);

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

test("selection and canvas view actions remain available while the document is locked", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const locked = reduceWorkspaceState(initial, { type: "document/toggle-lock" });
  const selected = reduceWorkspaceState(locked, {
    type: "selection/set",
    selection: { kind: "keepout", id: "keepout-1" },
  });
  const centered = reduceWorkspaceState(selected, {
    type: "view/center",
    center: { x: 25, y: 30 },
  });
  const zoomed = reduceWorkspaceState(centered, { type: "zoom/set", zoom: 250 });
  const reset = reduceWorkspaceState(zoomed, { type: "view/reset" });

  assert.deepEqual(selected.selection, { kind: "keepout", id: "keepout-1" });
  assert.deepEqual(centered.viewCenter, { x: 25, y: 30 });
  assert.equal(zoomed.zoom, 250);
  assert.equal(reset.zoom, 100);
  assert.deepEqual(reset.viewCenter, {
    x: initial.activeProject.board.width / 2,
    y: initial.activeProject.board.height / 2,
  });
});

test("hydrates legacy PCB state with all-layer view and empty model metadata", async () => {
  const { createWorkspaceState } = await loadWorkspaceModule();
  const state = createWorkspaceState(seedLegacyStateWithoutTask1Fields(), true);

  assert.equal(state.visibleLayer, "all");
  assert.deepEqual(state.selectedObjects, []);
  assert.deepEqual(state.data.modelAssets, {});
});

test("active placement layer and remote hydration are real workspace state", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const bottom = reduceWorkspaceState(initial, {
    type: "layer/set",
    layer: "bottom",
  });
  const remote = seedState();
  remote.projects[0].name = "Remote project";
  const hydrated = reduceWorkspaceState(bottom, {
    type: "persistence/hydrate",
    data: remote,
  });

  assert.equal(bottom.activeLayer, "bottom");
  assert.equal(hydrated.activeProject.name, "Remote project");
  assert.equal(hydrated.canEdit, true);
});

test("selection duplicate creates a copy and undo restores both selection state and document state", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedStateWithSelectedComponent(), true);
  const selected = reduceWorkspaceState(initial, {
    type: "selection/set",
    selection: { kind: "component", id: "component-a" },
  });
  const duplicated = reduceWorkspaceState(selected, {
    type: "selection/duplicate",
  } as never);

  assert.equal(duplicated.activeProject.components.length, 2);
  assert.equal(duplicated.selectedObjects.length, 1);
  assert.notEqual(duplicated.selectedObjects[0], "component-a");
  assert.equal(duplicated.selection?.kind, "component");
  assert.notEqual(duplicated.selection?.id, "component-a");

  const undone = reduceWorkspaceState(duplicated, { type: "history/undo" });

  assert.equal(undone.activeProject.components.length, 1);
  assert.deepEqual(undone.selection, { kind: "component", id: "component-a" });
  assert.deepEqual(undone.selectedObjects, []);
});

test("Ctrl/Cmd selection accumulates objects and removes the toggled primary", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedStateWithLayeredComponents(), true);
  const first = reduceWorkspaceState(initial, {
    type: "selection/set",
    selection: { kind: "component", id: "top-component" },
  });
  const grouped = reduceWorkspaceState(first, {
    type: "selection/toggle",
    objectId: "bottom-component",
  });

  assert.deepEqual(grouped.selectedObjects, ["top-component", "bottom-component"]);
  assert.deepEqual(grouped.selection, { kind: "component", id: "bottom-component" });

  const removed = reduceWorkspaceState(grouped, {
    type: "selection/toggle",
    objectId: "bottom-component",
  });
  assert.deepEqual(removed.selectedObjects, ["top-component"]);
  assert.deepEqual(removed.selection, { kind: "component", id: "top-component" });
});

test("visible-layer changes prune hidden component selections", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedStateWithLayeredComponents(), true);
  const first = reduceWorkspaceState(initial, {
    type: "selection/set",
    selection: { kind: "component", id: "top-component" },
  });
  const grouped = reduceWorkspaceState(first, {
    type: "selection/toggle",
    objectId: "bottom-component",
  });
  const bottomOnly = reduceWorkspaceState(grouped, {
    type: "view/layer",
    layer: "bottom",
  });

  assert.deepEqual(bottomOnly.selectedObjects, ["bottom-component"]);
  assert.deepEqual(bottomOnly.selection, { kind: "component", id: "bottom-component" });
});

test("one BOM placement transaction restores both the component and queue through undo and redo", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const pending = {
    name: "Header", type: "Connector", manufacturer: "", partNumber: "",
    width: 10, height: 3, maxHeight: 5, color: "#fff", quantity: 1, reference: "J1",
  };
  const imported = reduceWorkspaceState(initial, { type: "bom/import", items: [pending] });
  const component = {
    ...imported.data.library.find((item) => item.name === "Header")!,
    instanceId: "placed-j1", reference: "J1", x: 20, y: 20,
    rotation: 0, layer: "top" as const, locked: false,
  };
  const placed = reduceWorkspaceState(imported, {
    type: "project/commit-with-bom",
    update: { ...imported.activeProject, components: [component] },
    pendingPlacements: [],
  });

  assert.equal(placed.activeProject.components.length, 1);
  assert.equal(placed.pendingPlacements.length, 0);
  const undone = reduceWorkspaceState(placed, { type: "history/undo" });
  assert.equal(undone.activeProject.components.length, 0);
  assert.deepEqual(undone.pendingPlacements, [pending]);
  const redone = reduceWorkspaceState(undone, { type: "history/redo" });
  assert.equal(redone.activeProject.components.length, 1);
  assert.equal(redone.pendingPlacements.length, 0);
});

test("auto-place can remove the whole BOM queue in one undoable transaction", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const items = [
    { name: "A", type: "IC", manufacturer: "", partNumber: "", width: 2, height: 2, maxHeight: 1, color: "#fff", quantity: 1, reference: "U1" },
    { name: "B", type: "IC", manufacturer: "", partNumber: "", width: 3, height: 2, maxHeight: 1, color: "#fff", quantity: 1, reference: "U2" },
  ];
  const imported = reduceWorkspaceState(initial, { type: "bom/import", items });
  const placed = reduceWorkspaceState(imported, {
    type: "project/commit-with-bom",
    update: {
      ...imported.activeProject,
      components: imported.data.library.filter((item) => item.name === "A" || item.name === "B").map((item, index) => ({
        ...item, instanceId: `placed-${index}`, reference: `U${index + 1}`,
        x: 20 + index * 10, y: 20, rotation: 0, layer: "top" as const, locked: false,
      })),
    },
    pendingPlacements: [],
  });

  const undone = reduceWorkspaceState(placed, { type: "history/undo" });
  assert.equal(undone.activeProject.components.length, 0);
  assert.deepEqual(undone.pendingPlacements, items);
  const redone = reduceWorkspaceState(undone, { type: "history/redo" });
  assert.equal(redone.activeProject.components.length, 2);
  assert.equal(redone.pendingPlacements.length, 0);
});

test("reload then edit and undo preserves the persisted BOM queue", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const data = seedState();
  const projectId = data.activeProjectId!;
  const pending = {
    name: "Reloaded", type: "IC", manufacturer: "", partNumber: "",
    width: 2, height: 2, maxHeight: 1, color: "#fff", quantity: 1, reference: "U1",
  };
  data.pendingPlacementsByProject = { [projectId]: [pending] };
  const reloaded = createWorkspaceState(data, true);
  const edited = reduceWorkspaceState(reloaded, {
    type: "project/commit",
    update: {
      ...reloaded.activeProject,
      board: { ...reloaded.activeProject.board, width: 140 },
    },
  });

  const undone = reduceWorkspaceState(edited, { type: "history/undo" });

  assert.equal(undone.activeProject.board.width, 100);
  assert.deepEqual(undone.pendingPlacements, [pending]);
});

test("rejects programmatic BOM imports that exceed the placement budget", async () => {
  const { createWorkspaceState, reduceWorkspaceState } = await loadWorkspaceModule();
  const initial = createWorkspaceState(seedState(), true);
  const oversized = {
    name: "Oversized",
    type: "IC",
    manufacturer: "",
    partNumber: "",
    width: 2,
    height: 2,
    maxHeight: 1,
    color: "#fff",
    quantity: 5_001,
    reference: "U1",
  };

  assert.equal(
    reduceWorkspaceState(initial, { type: "bom/import", items: [oversized] }),
    initial,
  );
});
