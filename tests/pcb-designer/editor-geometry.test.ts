import assert from "node:assert/strict";
import test from "node:test";

const geometryModule = await import(
  new URL("../../src/components/pcb-designer/core/geometry.ts", import.meta.url).href
);

test("clientPointToBoard converts viewport coordinates through the SVG viewBox", () => {
  assert.equal(typeof geometryModule.clientPointToBoard, "function");
  assert.deepEqual(
    geometryModule.clientPointToBoard(
      { x: 250, y: 150 },
      { left: 50, top: 50, width: 400, height: 200 },
      { x: 10, y: 20, width: 100, height: 50 },
    ),
    { x: 60, y: 45 },
  );
});

test("snapPoint snaps both axes unless bypassed with Alt", () => {
  assert.equal(typeof geometryModule.snapPoint, "function");
  assert.deepEqual(geometryModule.snapPoint({ x: 2.6, y: 4.4 }, 1, false), { x: 3, y: 4 });
  assert.deepEqual(geometryModule.snapPoint({ x: 2.6, y: 4.4 }, 1, true), { x: 2.6, y: 4.4 });
});

test("findPlacement can prefer a drop point while returning the nearest legal grid point", () => {
  const candidate = {
    id: "library-r",
    name: "Resistor",
    type: "Resistor",
    manufacturer: "Acme",
    partNumber: "R1",
    width: 2,
    height: 2,
    maxHeight: 1,
    color: "#fff",
    source: "custom" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    instanceId: "R1",
    reference: "R1",
    x: 0,
    y: 0,
    rotation: 0,
    layer: "top" as const,
    locked: false,
  };
  const project = {
    schemaVersion: 1 as const,
    id: "project-1",
    name: "Geometry test",
    description: "",
    status: "draft" as const,
    board: { width: 20, height: 20, gridSize: 2, showGrid: true, snapToGrid: true, background: "#000" },
    components: [{ ...candidate, instanceId: "R2", reference: "R2", x: 14, y: 14 }],
    keepouts: [],
    measurements: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  assert.deepEqual(
    geometryModule.findPlacement(project, candidate, { x: 14, y: 14 }),
    { x: 14, y: 10 },
  );
});
