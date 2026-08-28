import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";

const editorModule = await import(
  new URL("../../src/components/pcb-designer/core/editor.ts", import.meta.url).href,
).catch(() => ({}));
const recordsModule = await import(
  new URL("../../src/components/pcb-designer/core/workspaceRecords.ts", import.meta.url).href,
).catch(() => ({}));
const editorHookSource = await readFile(
  new URL("../../src/components/pcb-designer/hooks/usePcbEditorActions.ts", import.meta.url),
  "utf8",
).catch(() => "");

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

test("placement keeps a normalized preview rotation", () => {
  const project = createBlankProject("Rotated placement");
  const result = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    undefined,
    undefined,
    { rotation: 450 },
  );

  assert.equal(result.ok, true);
  assert.equal(result.component.rotation, 90);
  assert.equal(result.project.components[0].rotation, 90);
});

test("rotates a selected keepout without changing its position or size", () => {
  const project = createBlankProject("Rotated keepout");
  project.keepouts.push({
    id: "keepout-1",
    name: "禁制區 1",
    x: 20,
    y: 20,
    width: 10,
    height: 6,
    color: "#fb7185",
    rotation: 0,
  });

  const next = editorModule.editSelectedObject(
    project,
    { kind: "keepout", id: "keepout-1" },
    { type: "rotate" },
  );

  assert.deepEqual(next.keepouts[0], {
    ...project.keepouts[0],
    rotation: 90,
  });
});

test("exact placement keeps the requested location and rejects invalid clicks instead of relocating", () => {
  const project = createBlankProject("Exact placement");
  const first = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    { x: 20.2, y: 20.2 },
    undefined,
    { exact: true },
  );

  assert.equal(first.ok, true);
  assert.deepEqual({ x: first.component.x, y: first.component.y }, { x: 20, y: 20 });

  const collision = editorModule.placeLibraryComponent(
    first.project,
    BUILT_IN_COMPONENTS[3],
    { x: 20, y: 20 },
    undefined,
    { exact: true },
  );
  assert.equal(collision.ok, false);
  assert.match(collision.reason, /重疊/);
  assert.equal(first.project.components.length, 1);

  const bypassed = editorModule.placeLibraryComponent(
    project,
    BUILT_IN_COMPONENTS[3],
    { x: 20.2, y: 20.2 },
    undefined,
    { exact: true, bypassSnap: true },
  );
  assert.equal(bypassed.ok, true);
  assert.deepEqual({ x: bypassed.component.x, y: bypassed.component.y }, { x: 20.2, y: 20.2 });
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

test("moves multiple unlocked components as one snapped transaction", () => {
  assert.equal(typeof editorModule.moveComponents, "function");
  const project = createBlankProject("Group move");
  const componentA = {
    ...structuredClone(BUILT_IN_COMPONENTS[3]),
    instanceId: "component-a",
    reference: "R1",
    x: 5,
    y: 10,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  };
  const componentB = {
    ...structuredClone(BUILT_IN_COMPONENTS[4]),
    instanceId: "component-b",
    reference: "C1",
    x: 15,
    y: 20,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  };
  project.components = [componentA, componentB];

  const result = editorModule.moveComponents(
    project,
    ["component-a", "component-b"],
    { x: 7.2, y: 4.1 },
    false,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.project.components.map(({ x, y }: { x: number; y: number }) => ({ x, y })),
    [
      { x: 12, y: 14 },
      { x: 22, y: 24 },
    ],
  );
  assert.deepEqual(
    project.components.map(({ x, y }: { x: number; y: number }) => ({ x, y })),
    [
      { x: 5, y: 10 },
      { x: 15, y: 20 },
    ],
  );
});

test("moves unlocked members while leaving locked members in a mixed group", () => {
  const project = createBlankProject("Mixed locked group move");
  const componentA = {
    ...structuredClone(BUILT_IN_COMPONENTS[3]),
    instanceId: "component-a",
    reference: "R1",
    x: 5,
    y: 10,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  };
  const componentB = {
    ...structuredClone(BUILT_IN_COMPONENTS[4]),
    instanceId: "component-b",
    reference: "C1",
    x: 30,
    y: 20,
    rotation: 0,
    layer: "top" as const,
    locked: true,
  };
  project.components = [componentA, componentB];

  const result = editorModule.moveComponents(
    project,
    ["component-a", "component-b"],
    { x: 3, y: 2 },
    false,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.project.components.map(({ instanceId, x, y }: { instanceId: string; x: number; y: number }) => ({ instanceId, x, y })),
    [
      { instanceId: "component-a", x: 8, y: 12 },
      { instanceId: "component-b", x: 30, y: 20 },
    ],
  );
});

test("moves selected components and keepouts as one rigid snapped transaction", () => {
  assert.equal(typeof editorModule.moveObjects, "function");
  const project = createBlankProject("Mixed object move");
  project.components = [{
    ...structuredClone(BUILT_IN_COMPONENTS[3]),
    instanceId: "component-a",
    reference: "R1",
    x: 20,
    y: 20,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  }];
  project.keepouts = [{
    id: "keepout-a",
    name: "禁制區 A",
    x: 40,
    y: 30,
    width: 10,
    height: 8,
    color: "#fb7185",
    rotation: 0,
  }];
  const before = structuredClone(project);

  const result = editorModule.moveObjects(
    project,
    ["component-a", "keepout-a"],
    { x: 3.2, y: 4.1 },
    false,
  );

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(
    { x: result.project.components[0].x, y: result.project.components[0].y },
    { x: 23, y: 24 },
  );
  assert.deepEqual(
    { x: result.project.keepouts[0].x, y: result.project.keepouts[0].y },
    { x: 43, y: 34 },
  );
  assert.deepEqual(project, before);
});

test("mixed object moves fail as a whole at board bounds or with a locked member", () => {
  const project = createBlankProject("Mixed move guards");
  project.components = [{
    ...structuredClone(BUILT_IN_COMPONENTS[3]),
    instanceId: "component-a",
    reference: "R1",
    x: 20,
    y: 20,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  }];
  project.keepouts = [{
    id: "keepout-a",
    name: "禁制區 A",
    x: 90,
    y: 70,
    width: 10,
    height: 10,
    color: "#fb7185",
    rotation: 0,
  }];

  const outOfBounds = editorModule.moveObjects(
    project,
    ["component-a", "keepout-a"],
    { x: 1, y: 0 },
    true,
  );
  assert.equal(outOfBounds.ok, false);
  assert.match(outOfBounds.reason, /禁制區.*超出板框/);

  project.components[0].locked = true;
  const locked = editorModule.moveObjects(
    project,
    ["component-a", "keepout-a"],
    { x: -1, y: 0 },
    true,
  );
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /鎖定元件/);
});

test("aligns components by their rotated visual edges and centers", () => {
  assert.equal(typeof editorModule.arrangeComponents, "function");
  const createProject = () => {
    const project = createBlankProject("Alignment");
    project.components = [
      {
        ...structuredClone(BUILT_IN_COMPONENTS[3]),
        instanceId: "component-a",
        reference: "R1",
        width: 10,
        height: 4,
        x: 10,
        y: 10,
        rotation: 0,
        layer: "top" as const,
        locked: false,
      },
      {
        ...structuredClone(BUILT_IN_COMPONENTS[4]),
        instanceId: "component-b",
        reference: "C1",
        width: 4,
        height: 10,
        x: 30,
        y: 25,
        rotation: 90,
        layer: "top" as const,
        locked: false,
      },
    ];
    return project;
  };
  const ids = ["component-a", "component-b"];
  const expectations = [
    ["align-left", [[10, 10], [10, 25]]],
    ["align-horizontal-center", [[20, 10], [20, 25]]],
    ["align-right", [[30, 10], [30, 25]]],
    ["align-top", [[10, 10], [30, 10]]],
    ["align-vertical-center", [[10, 17.5], [30, 17.5]]],
    ["align-bottom", [[10, 25], [30, 25]]],
  ] as const;

  for (const [arrangement, expected] of expectations) {
    const project = createProject();
    const before = structuredClone(project);
    const result = editorModule.arrangeComponents(project, ids, arrangement);
    assert.equal(result.ok, true, arrangement);
    assert.equal(result.changed, true, arrangement);
    assert.deepEqual(
      result.project.components.map(({ x, y }: { x: number; y: number }) => [x, y]),
      expected,
      arrangement,
    );
    assert.deepEqual(project, before, `${arrangement} must not mutate the source project`);
  }
});

test("distributes component gaps evenly while keeping outer components fixed", () => {
  const project = createBlankProject("Distribution");
  project.components = [
    {
      ...structuredClone(BUILT_IN_COMPONENTS[3]),
      instanceId: "component-a",
      reference: "R1",
      width: 10,
      height: 10,
      x: 10,
      y: 10,
      rotation: 0,
      layer: "top" as const,
      locked: false,
    },
    {
      ...structuredClone(BUILT_IN_COMPONENTS[4]),
      instanceId: "component-b",
      reference: "C1",
      width: 20,
      height: 20,
      x: 35,
      y: 35,
      rotation: 0,
      layer: "top" as const,
      locked: false,
    },
    {
      ...structuredClone(BUILT_IN_COMPONENTS[5]),
      instanceId: "component-c",
      reference: "L1",
      width: 10,
      height: 10,
      x: 80,
      y: 80,
      rotation: 0,
      layer: "top" as const,
      locked: false,
    },
  ];
  const ids = project.components.map((component) => component.instanceId);

  const horizontal = editorModule.arrangeComponents(project, ids, "distribute-horizontal");
  assert.equal(horizontal.ok, true);
  assert.deepEqual(horizontal.project.components.map(({ x }: { x: number }) => x), [10, 45, 80]);
  assert.deepEqual(horizontal.project.components.map(({ y }: { y: number }) => y), [10, 35, 80]);

  const vertical = editorModule.arrangeComponents(project, ids, "distribute-vertical");
  assert.equal(vertical.ok, true);
  assert.deepEqual(vertical.project.components.map(({ x }: { x: number }) => x), [10, 35, 80]);
  assert.deepEqual(vertical.project.components.map(({ y }: { y: number }) => y), [10, 45, 80]);
});

test("alignment validates selection size and refuses partial locked moves", () => {
  const project = createBlankProject("Alignment guards");
  project.components = [
    {
      ...structuredClone(BUILT_IN_COMPONENTS[3]),
      instanceId: "component-a",
      reference: "R1",
      x: 10,
      y: 10,
      rotation: 0,
      layer: "top" as const,
      locked: false,
    },
    {
      ...structuredClone(BUILT_IN_COMPONENTS[4]),
      instanceId: "component-b",
      reference: "C1",
      x: 30,
      y: 30,
      rotation: 0,
      layer: "top" as const,
      locked: true,
    },
  ];

  const one = editorModule.arrangeComponents(project, ["component-a"], "align-left");
  assert.equal(one.ok, false);
  assert.match(one.reason, /2 個/);
  const twoForDistribution = editorModule.arrangeComponents(
    project,
    ["component-a", "component-b"],
    "distribute-horizontal",
  );
  assert.equal(twoForDistribution.ok, false);
  assert.match(twoForDistribution.reason, /3 個/);
  const locked = editorModule.arrangeComponents(
    project,
    ["component-a", "component-b"],
    "align-top",
  );
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /鎖定元件/);
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

test("duplicates a keepout with a new identity and legal offset", () => {
  assert.equal(typeof editorModule.duplicateKeepout, "function");
  const project = createBlankProject("Keepout duplicate");
  const created = editorModule.createKeepout(project, { x: 12, y: 12 }, { x: 22, y: 22 });
  assert.ok(created);

  const result = editorModule.duplicateKeepout(created.project, created.keepout.id, { x: 1, y: 1 });

  assert.equal(result.ok, true);
  assert.notEqual(result.keepout.id, created.keepout.id);
  assert.equal(result.project.keepouts.length, 2);
  assert.deepEqual(
    result.project.keepouts.map(({ id, x, y }: { id: string; x: number; y: number }) => ({ id, x, y })),
    [
      { id: created.keepout.id, x: 12, y: 12 },
      { id: result.keepout.id, x: 13, y: 13 },
    ],
  );
});

test("editor hook exposes group move and duplication actions for later UI wiring", () => {
  assert.match(editorHookSource, /const moveComponents = useCallback/);
  assert.match(editorHookSource, /moveComponentsRecord/);
  assert.match(editorHookSource, /const moveObjects = useCallback/);
  assert.match(editorHookSource, /moveObjectsRecord/);
  assert.match(editorHookSource, /const duplicateKeepout = useCallback/);
  assert.match(editorHookSource, /duplicateKeepoutRecord/);
  assert.match(editorHookSource, /const duplicateSelected = useCallback/);
  assert.match(editorHookSource, /dispatch\(\{ type: "selection\/duplicate", objectIds: duplicableIds \}\)/);
  assert.match(editorHookSource, /return \{[\s\S]*moveComponents,[\s\S]*moveObjects,[\s\S]*duplicateKeepout,[\s\S]*duplicateSelected,/);
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

test("keepout movement stays inside the board and selection delete removes it", () => {
  const project = createBlankProject("Keepout bounds");
  const created = editorModule.createKeepout(project, { x: 2, y: 2 }, { x: 12, y: 10 });
  assert.ok(created);

  const moved = editorModule.moveKeepout(
    created.project,
    created.keepout.id,
    { x: project.board.width + 50, y: project.board.height + 50 },
    true,
  );
  assert.equal(moved.ok, true);
  assert.deepEqual(
    { x: moved.keepout.x, y: moved.keepout.y },
    {
      x: project.board.width - created.keepout.width,
      y: project.board.height - created.keepout.height,
    },
  );

  const deleted = editorModule.editSelectedObject(
    moved.project,
    { kind: "keepout", id: created.keepout.id },
    { type: "delete" },
  );
  assert.equal(deleted.keepouts.length, 0);
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
