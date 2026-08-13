import assert from "node:assert/strict";
import test from "node:test";
import {
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
});
