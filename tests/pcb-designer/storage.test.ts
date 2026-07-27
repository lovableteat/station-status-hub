import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { PCB_STORAGE_KEY, PcbLocalRepository, type StorageLike } from "../../src/components/pcb-designer/core/storage.ts";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("seeds a blank project, built-in templates, and library when storage is empty", () => {
  const repository = new PcbLocalRepository(new MemoryStorage());
  const state = repository.load();

  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].components.length, 0);
  assert.equal(state.templates.length, 4);
  assert.deepEqual(state.templates, BUILT_IN_TEMPLATES);
  assert.deepEqual(state.library, BUILT_IN_COMPONENTS);
  assert.equal(state.activeProjectId, state.projects[0].id);
});

test("round-trips a versioned save payload through the configured storage key", () => {
  const storage = new MemoryStorage();
  const repository = new PcbLocalRepository(storage);
  const state = repository.load();
  const project = { ...state.projects[0], name: "Saved PCB" };

  repository.save({ ...state, projects: [project], activeProjectId: project.id });

  assert.equal(JSON.parse(storage.getItem(PCB_STORAGE_KEY) ?? "{}").version, 1);
  assert.equal(new PcbLocalRepository(storage).load().projects[0].name, "Saved PCB");
});

test("quarantines corrupted JSON and returns a safe seeded fallback", () => {
  const storage = new MemoryStorage();
  storage.setItem(PCB_STORAGE_KEY, "{not-json");

  const state = new PcbLocalRepository(storage).load();

  assert.equal(state.projects.length, 1);
  assert.equal(JSON.parse(storage.getItem(PCB_STORAGE_KEY) ?? "{}").version, 1);
});

test("quarantines versioned payloads containing malformed records or an unknown active project", () => {
  const malformedStates = [
    { projects: [null] },
    { projects: [{ id: "broken" }] },
    { activeProjectId: "missing-project" },
    { templates: [{ id: "broken-template" }] },
    { library: [{ id: "broken-library", width: Infinity, height: 1 }] },
  ];

  for (const patch of malformedStates) {
    const storage = new MemoryStorage();
    const valid = new PcbLocalRepository(storage).load();
    storage.setItem(PCB_STORAGE_KEY, JSON.stringify({
      version: 1,
      state: { ...valid, ...patch },
    }));

    const recovered = new PcbLocalRepository(storage).load();
    assert.equal(recovered.projects.length, 1);
    assert.equal(recovered.projects[0].components.length, 0);
    assert.equal(recovered.templates.length, 4);
    assert.equal(recovered.library.length, BUILT_IN_COMPONENTS.length);
    assert.equal(recovered.activeProjectId, recovered.projects[0].id);
  }
});

test("upsert, delete, and active project updates are immutable and preserve unrelated records", () => {
  const repository = new PcbLocalRepository(new MemoryStorage());
  const initial = repository.load();
  const second = createBlankProject("Second");
  const withSecond = repository.upsertProject(initial, second);
  const revised = { ...second, name: "Revised" };
  const revisedState = repository.upsertProject(withSecond, revised);

  assert.equal(initial.projects.length, 1);
  assert.equal(revisedState.projects.length, 2);
  assert.equal(revisedState.projects.find((project) => project.id === second.id)?.name, "Revised");

  const activeState = repository.setActiveProjectId(revisedState, revisedState.projects[0].id);
  const afterDelete = repository.deleteProject(activeState, revised.id);
  assert.equal(afterDelete.projects.length, 1);
  assert.equal(afterDelete.projects[0].id, initial.projects[0].id);
  assert.equal(afterDelete.activeProjectId, initial.projects[0].id);
});

test("round-trips project-scoped BOM pending placements", () => {
  const storage = new MemoryStorage();
  const repository = new PcbLocalRepository(storage);
  const state = repository.load();
  const projectId = state.activeProjectId!;
  const pending = {
    name: "Resistor", type: "Resistor", manufacturer: "Acme", partNumber: "R-1",
    width: 1.6, height: 0.8, maxHeight: 0.5, color: "#fff",
    quantity: 1, reference: "R1",
  };

  repository.save({
    ...state,
    pendingPlacementsByProject: { [projectId]: [pending] },
  });

  assert.deepEqual(
    repository.load().pendingPlacementsByProject?.[projectId],
    [pending],
  );
});

test("repository project deletion also removes its pending placement queue", () => {
  const repository = new PcbLocalRepository(new MemoryStorage());
  const state = repository.load();
  const projectId = state.activeProjectId!;
  const withPending = {
    ...state,
    pendingPlacementsByProject: {
      [projectId]: [{
        name: "R", type: "Resistor", manufacturer: "", partNumber: "",
        width: 1, height: 1, maxHeight: 1, color: "#fff",
        quantity: 1, reference: "R1",
      }],
    },
  };

  const deleted = repository.deleteProject(withPending, projectId);

  assert.equal(deleted.pendingPlacementsByProject?.[projectId], undefined);
});

test("round-trips no-part-number library, pending, and placed BOM records", () => {
  const repository = new PcbLocalRepository(new MemoryStorage());
  const state = repository.load();
  const projectId = state.activeProjectId!;
  const library = {
    ...state.library[0],
    id: "library-no-part",
    name: "Generic header",
    manufacturer: "",
    partNumber: "",
    source: "bom" as const,
  };
  const pending = {
    name: library.name, type: library.type, manufacturer: "", partNumber: "",
    width: library.width, height: library.height, maxHeight: library.maxHeight,
    color: library.color, quantity: 1, reference: "J1",
  };
  const projects = state.projects.map((project) => project.id === projectId
    ? {
      ...project,
      components: [{
        ...library, instanceId: "placed-no-part", reference: "J1",
        x: 20, y: 20, rotation: 0, layer: "top" as const, locked: false,
      }],
    }
    : project);

  repository.save({
    ...state,
    projects,
    library: [...state.library, library],
    pendingPlacementsByProject: { [projectId]: [pending] },
  });
  const loaded = repository.load();

  assert.equal(loaded.library.some((item) => item.id === library.id), true);
  assert.equal(loaded.projects.find((item) => item.id === projectId)?.components[0].partNumber, "");
  assert.deepEqual(loaded.pendingPlacementsByProject?.[projectId], [pending]);
});

test("refreshes stale built-in templates while preserving custom catalog records", () => {
  const storage = new MemoryStorage();
  const repository = new PcbLocalRepository(storage);
  const state = repository.load();
  const customTemplate = {
    ...structuredClone(BUILT_IN_TEMPLATES[0]),
    id: "custom-template",
    name: "My template",
    isBuiltIn: false,
  };
  const customLibrary = {
    ...structuredClone(BUILT_IN_COMPONENTS[0]),
    id: "custom-component",
    name: "My component",
    source: "custom" as const,
  };

  repository.save({
    ...state,
    templates: BUILT_IN_TEMPLATES.map((template) => ({
      ...structuredClone(template),
      project: { ...structuredClone(template.project), components: [] },
    })).concat(customTemplate),
    library: [customLibrary],
  });
  const refreshed = repository.load();

  assert.ok(
    refreshed.templates.find((item) => item.id === "template-microcontroller")
      ?.project.components.length,
  );
  assert.equal(refreshed.templates.some((item) => item.id === customTemplate.id), true);
  assert.equal(refreshed.library.some((item) => item.id === customLibrary.id), true);
  assert.equal(
    refreshed.library.filter((item) => item.source === "built-in").length,
    BUILT_IN_COMPONENTS.length,
  );
});
