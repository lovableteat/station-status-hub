import assert from "node:assert/strict";
import test from "node:test";
import {
  deletePcbSelection,
  duplicatePcbSelection,
  getMarqueeSelectionIds,
} from "../../src/components/pcb-designer/core/selection.ts";
import type { PcbPlacedComponent, PcbProject } from "../../src/components/pcb-designer/types.ts";

const component = (overrides: Partial<PcbPlacedComponent>): PcbPlacedComponent => ({
  id: "library-r",
  name: "Resistor",
  type: "Resistor",
  manufacturer: "Acme",
  partNumber: "R1",
  width: 8,
  height: 4,
  maxHeight: 2,
  color: "#fb923c",
  source: "custom",
  createdAt: "2026-08-13T00:00:00.000Z",
  instanceId: "component",
  reference: "R1",
  x: 10,
  y: 10,
  rotation: 0,
  layer: "top",
  locked: false,
  ...overrides,
});

const project = (): PcbProject => ({
  schemaVersion: 1,
  id: "project-1",
  name: "Selection test",
  description: "",
  status: "draft",
  board: {
    width: 100,
    height: 80,
    gridSize: 1,
    showGrid: true,
    snapToGrid: true,
    background: "#0f766e",
    layerColors: { top: "#1aa39a", bottom: "#3157d5" },
  },
  components: [
    component({ instanceId: "top", reference: "R1", x: 20, y: 20, rotation: 45 }),
    component({ instanceId: "bottom", reference: "R2", x: 55, y: 20, layer: "bottom" }),
  ],
  keepouts: [{
    id: "keepout-a",
    name: "禁制區 A",
    x: 12,
    y: 38,
    width: 12,
    height: 8,
    color: "#fb7185",
  }],
  measurements: [],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
});

test("marquee selects intersecting components and keepouts while respecting visible component layers", () => {
  const board = project();

  assert.deepEqual(
    getMarqueeSelectionIds(board, { x: 10, y: 10 }, { x: 30, y: 50 }, "all"),
    ["top", "keepout-a"],
  );
  assert.deepEqual(
    getMarqueeSelectionIds(board, { x: 10, y: 10 }, { x: 30, y: 50 }, "bottom"),
    ["keepout-a"],
  );
});

test("batch deletion removes only selected objects without mutating the source", () => {
  const board = project();
  board.components[0].keepout = { top: 1, bottom: 2, left: 3, right: 4 };
  board.measurements = [{ id: "measure-a", x1: 0, y1: 0, x2: 10, y2: 10, color: "#fff" }];
  const before = structuredClone(board);
  const result = deletePcbSelection(board, ["top", "top", "keepout-a", "measure-a", "missing"]);
  assert.ok(result.ok);
  assert.equal(result.count, 3);
  assert.deepEqual(result.project.components.map(item => item.instanceId), ["bottom"]);
  assert.deepEqual(result.project.keepouts, []);
  assert.deepEqual(result.project.measurements, []);
  assert.deepEqual(board, before);
});

test("locked members block the entire batch, and empty or stale selections do nothing", () => {
  const board = project();
  board.components[1].locked = true;
  const before = structuredClone(board);
  const result = deletePcbSelection(board, ["top", "bottom", "keepout-a"]);
  assert.equal(result.ok, false);
  assert.deepEqual(board, before);
  assert.equal(deletePcbSelection(board, []).ok, false);
  assert.equal(deletePcbSelection(board, ["missing"]).ok, false);
});

test("mixed component and keepout copies preserve their relative offset", () => {
  const board = project();
  const result = duplicatePcbSelection(board, ["top", "keepout-a"]);

  assert.ok(result);
  assert.equal(result.project.components.length, 3);
  assert.equal(result.project.keepouts.length, 2);
  const copiedComponent = result.project.components.find(
    (item) => item.instanceId === result.idMap.get("top"),
  );
  const copiedKeepout = result.project.keepouts.find(
    (item) => item.id === result.idMap.get("keepout-a"),
  );
  assert.ok(copiedComponent);
  assert.ok(copiedKeepout);
  assert.equal(copiedComponent.x - 20, copiedKeepout.x - 12);
  assert.equal(copiedComponent.y - 20, copiedKeepout.y - 38);
  assert.equal(result.usedOverlapFallback, false);
});

test("whole-board selections still paste when no collision-free offset exists", () => {
  const board = project();
  board.components = [component({
    instanceId: "board-filling-component",
    reference: "U1",
    x: 50,
    y: 40,
    width: 100,
    height: 80,
  })];
  board.keepouts = [];

  const result = duplicatePcbSelection(board, ["board-filling-component"]);

  assert.ok(result);
  assert.equal(result.usedOverlapFallback, true);
  assert.equal(result.project.components.length, 2);
  assert.equal(result.project.components[1].x, 50);
  assert.equal(result.project.components[1].y, 40);
  assert.notEqual(result.project.components[1].instanceId, "board-filling-component");
  assert.notEqual(result.project.components[1].reference, "U1");
});
