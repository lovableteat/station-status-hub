import test from "node:test";
import assert from "node:assert/strict";
import {
  findPlacement,
  rectanglesOverlap,
  snapValue,
} from "../../src/components/pcb-designer/core/geometry.ts";
import type { PcbPlacedComponent, PcbProject } from "../../src/components/pcb-designer/types.ts";

const component = (overrides: Partial<PcbPlacedComponent> = {}): PcbPlacedComponent => ({
  id: "library-r",
  name: "Resistor",
  type: "Resistor",
  manufacturer: "Acme",
  partNumber: "R1",
  width: 4,
  height: 2,
  maxHeight: 1,
  color: "#fff",
  source: "custom",
  createdAt: "2026-01-01T00:00:00.000Z",
  instanceId: "R1",
  reference: "R1",
  x: 0,
  y: 0,
  rotation: 0,
  layer: "top",
  locked: false,
  ...overrides,
});

const project = (overrides: Partial<PcbProject> = {}): PcbProject => ({
  schemaVersion: 1,
  id: "project-1",
  name: "Geometry test",
  description: "",
  status: "draft",
  board: { width: 10, height: 10, gridSize: 2, showGrid: true, snapToGrid: true, background: "#000" },
  components: [],
  keepouts: [],
  measurements: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("snapValue snaps down to the nearest grid intersection", () => {
  assert.equal(snapValue(4.8, 2), 4);
});

test("rotated rectangles use SAT rather than an axis-aligned bounding box", () => {
  const horizontal = component({ x: 0, y: 0, width: 10, height: 1, rotation: 45 });
  const vertical = component({ x: 0, y: 2, width: 10, height: 1, rotation: 45 });

  assert.equal(rectanglesOverlap(horizontal, vertical), false);
});

test("findPlacement skips colliding positions and returns a snapped legal center", () => {
  const result = findPlacement(project({ components: [component({ x: 4, y: 2 })] }), component({ instanceId: "R2", reference: "R2" }));

  assert.deepEqual(result, { x: 2, y: 6 });
});

test("findPlacement does not mutate its inputs and returns null when the board is full", () => {
  const full = project({ board: { width: 4, height: 2, gridSize: 2, showGrid: true, snapToGrid: true, background: "#000" } });
  const candidate = component({ width: 4, height: 2 });
  const before = structuredClone({ full, candidate });

  assert.equal(findPlacement(full, candidate), null);
  assert.deepEqual({ full, candidate }, before);
});
