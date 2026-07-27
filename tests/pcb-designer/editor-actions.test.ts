import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";

const editorModule = await import(
  new URL("../../src/components/pcb-designer/core/editor.ts", import.meta.url).href,
).catch(() => ({}));
const recordsModule = await import(
  new URL("../../src/components/pcb-designer/core/workspaceRecords.ts", import.meta.url).href,
).catch(() => ({}));

test("placeLibraryComponent adds one legal center-nearest instance without mutating inputs", () => {
  assert.equal(typeof editorModule.placeLibraryComponent, "function");
  const project = createBlankProject("Placement");
  const library = structuredClone(BUILT_IN_COMPONENTS[3]);
  const before = structuredClone({ project, library });

  const result = editorModule.placeLibraryComponent(project, library);

  assert.equal(result.ok, true);
  assert.equal(result.project.components.length, 1);
  assert.equal(result.component.reference, "R1");
  assert.deepEqual({ project, library }, before);
});

test("placement records the selected board layer", () => {
  const project = createBlankProject("Bottom placement");
  const result = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    undefined,
    undefined,
    { layer: "bottom" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.component.layer, "bottom");
  assert.equal(result.project.components[0].layer, "bottom");
});

test("failed placement is truthful and leaves project identity and component count untouched", () => {
  assert.equal(typeof editorModule.placeLibraryComponent, "function");
  const project = createBlankProject("Too small");
  project.board.width = 1;
  project.board.height = 1;
  const result = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[0]);

  assert.deepEqual(result, {
    ok: false,
    reason: "找不到可合法放置此元件的位置。",
  });
  assert.equal(project.components.length, 0);
});

test("placement reports a safety-limit result without losing the source project", () => {
  const project = createBlankProject("Search limit");
  const result = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    undefined,
    undefined,
    { maxChecks: 0 },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "search-limit");
  assert.match(result.reason, /項目仍保留/);
  assert.equal(project.components.length, 0);
});

test("moveComponent snaps normally, bypasses snap with Alt, and refuses locked objects", () => {
  assert.equal(typeof editorModule.moveComponent, "function");
  const project = createBlankProject("Move");
  const placed = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[3]);
  assert.equal(placed.ok, true);

  const snapped = editorModule.moveComponent(placed.project, placed.component.instanceId, { x: 18.8, y: 21.7 }, false);
  assert.equal(snapped.ok, true);
  assert.deepEqual(
    { x: snapped.project.components[0].x, y: snapped.project.components[0].y },
    { x: 19, y: 22 },
  );

  const unsnapped = editorModule.moveComponent(snapped.project, placed.component.instanceId, { x: 18.8, y: 21.7 }, true);
  assert.equal(unsnapped.ok, true);
  assert.deepEqual(
    { x: unsnapped.project.components[0].x, y: unsnapped.project.components[0].y },
    { x: 18.8, y: 21.7 },
  );

  const lockedProject = {
    ...unsnapped.project,
    components: unsnapped.project.components.map((component: { locked: boolean }) => ({ ...component, locked: true })),
  };
  assert.equal(
    editorModule.moveComponent(lockedProject, placed.component.instanceId, { x: 30, y: 30 }, false).ok,
    false,
  );
});

test("releasing a component without moving it is a successful no-op", () => {
  const project = createBlankProject("No-op move");
  const placed = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[3]);
  assert.equal(placed.ok, true);

  const result = editorModule.moveComponent(
    placed.project,
    placed.component.instanceId,
    { x: placed.component.x, y: placed.component.y },
    false,
  );

  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.project, placed.project);
});

test("component moves may keep an intentional DRC violation for later review", () => {
  const project = createBlankProject("Draft violation");
  const placed = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[3]);
  assert.equal(placed.ok, true);

  const result = editorModule.moveComponent(
    placed.project,
    placed.component.instanceId,
    { x: -3, y: placed.component.y },
    true,
  );

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.project.components[0].x, -3);
});

test("selection actions rotate, lock, delete, and nudge the selected component", () => {
  assert.equal(typeof editorModule.editSelectedObject, "function");
  const project = createBlankProject("Actions");
  const placed = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[3]);
  assert.equal(placed.ok, true);
  const selection = { kind: "component" as const, id: placed.component.instanceId };

  const rotated = editorModule.editSelectedObject(placed.project, selection, { type: "rotate" });
  assert.equal(rotated.components[0].rotation, 90);
  const locked = editorModule.editSelectedObject(rotated, selection, { type: "toggle-lock" });
  assert.equal(locked.components[0].locked, true);
  const unlocked = editorModule.editSelectedObject(locked, selection, { type: "toggle-lock" });
  const nudged = editorModule.editSelectedObject(unlocked, selection, { type: "nudge", dx: 2, dy: -1 });
  assert.deepEqual(
    { x: nudged.components[0].x, y: nudged.components[0].y },
    { x: placed.component.x + 2, y: placed.component.y - 1 },
  );
  const deleted = editorModule.editSelectedObject(nudged, selection, { type: "delete" });
  assert.equal(deleted.components.length, 0);
});

test("locked components can only be unlocked, not edited, rotated, nudged, or deleted", () => {
  const project = createBlankProject("Locked actions");
  const placed = editorModule.placeLibraryComponent(project, BUILT_IN_COMPONENTS[3]);
  assert.equal(placed.ok, true);
  const selection = { kind: "component" as const, id: placed.component.instanceId };
  const locked = editorModule.editSelectedObject(
    placed.project,
    selection,
    { type: "toggle-lock" },
  );

  for (const action of [
    { type: "rotate" as const },
    { type: "delete" as const },
    { type: "nudge" as const, dx: 1, dy: 1 },
  ]) {
    assert.equal(editorModule.editSelectedObject(locked, selection, action), locked);
  }

  const unlocked = editorModule.editSelectedObject(
    locked,
    selection,
    { type: "toggle-lock" },
  );
  assert.equal(unlocked.components[0].locked, false);
});

test("moveKeepout previews a snapped origin and returns one committed document", () => {
  assert.equal(typeof editorModule.createKeepout, "function");
  assert.equal(typeof editorModule.moveKeepout, "function");
  const project = createBlankProject("Keepout move");
  const created = editorModule.createKeepout(project, { x: 2, y: 2 }, { x: 8, y: 7 });
  assert.ok(created);

  const moved = editorModule.moveKeepout(
    created.project,
    created.keepout.id,
    { x: 12.7, y: 15.2 },
    false,
  );

  assert.equal(moved.ok, true);
  assert.equal(moved.changed, true);
  assert.deepEqual(
    { x: moved.project.keepouts[0].x, y: moved.project.keepouts[0].y },
    { x: 13, y: 15 },
  );
});

test("BOM identity falls back to normalized name and dimensions when no part number exists", () => {
  assert.equal(typeof recordsModule.libraryIdentity, "function");
  const first = {
    name: " Header ",
    type: "Connector",
    manufacturer: "",
    partNumber: "",
    width: 10,
    height: 3,
    maxHeight: 5,
    color: "#fff",
  };
  const matching = { ...first, name: "header" };
  const different = { ...first, width: 8 };

  assert.equal(recordsModule.libraryIdentity(first), recordsModule.libraryIdentity(matching));
  assert.notEqual(recordsModule.libraryIdentity(first), recordsModule.libraryIdentity(different));
});

test("placing at a preferred point preserves fractional coordinates when grid snapping is off", () => {
  const project = createBlankProject("Unsnapped placement");
  project.board.snapToGrid = false;

  const result = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    { x: 18.8, y: 21.7 },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    { x: result.component.x, y: result.component.y },
    { x: 18.8, y: 21.7 },
  );
});

test("normalizes edited rotation values to the 0–359 degree range", () => {
  assert.equal(editorModule.normalizeRotation(450), 90);
  assert.equal(editorModule.normalizeRotation(-90), 270);
});
