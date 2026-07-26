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
