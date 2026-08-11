import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SOFTWARE_VIEW,
  SOFTWARE_RENDER_ORDER,
  compareSoftwareRenderDepth,
  createSoftwareBoxVertices,
  createSoftwareCamera,
  projectSoftwarePoint,
  sampleTriangleOffsets,
  transformPcbComponentPoint,
} from "../../src/components/pcb-designer/core/software3d.ts";

const board = { width: 100, height: 80 };
const viewport = { width: 1200, height: 700 };

test("projects the PCB origin into a finite software 3D viewport", () => {
  const camera = createSoftwareCamera(board, viewport, DEFAULT_SOFTWARE_VIEW);
  const projected = projectSoftwarePoint({ x: 0, y: 0, z: 0 }, camera);

  assert.equal(projected.visible, true);
  assert.equal(Number.isFinite(projected.x), true);
  assert.equal(Number.isFinite(projected.y), true);
  assert.ok(projected.x > 0 && projected.x < viewport.width);
  assert.ok(projected.y > 0 && projected.y < viewport.height);
});

test("places top and bottom components on opposite sides of the PCB", () => {
  const component = {
    x: 10,
    y: 12,
    width: 8,
    height: 6,
    maxHeight: 4,
    rotation: 0,
    layer: "top" as const,
  };
  const top = transformPcbComponentPoint({ x: 0, y: 0, z: 0 }, component, board);
  const bottom = transformPcbComponentPoint(
    { x: 0, y: 0, z: 0 },
    { ...component, layer: "bottom" },
    board,
  );

  assert.ok(top.y > 0);
  assert.ok(bottom.y < 0);
  assert.equal(Math.abs(top.y), Math.abs(bottom.y));
});

test("creates complete boxes and bounds sampled model triangles", () => {
  assert.equal(createSoftwareBoxVertices(10, 4, 8).length, 8);
  assert.equal(sampleTriangleOffsets(30, 20).length, 10);
  assert.ok(sampleTriangleOffsets(30_000, 80).length <= 80);
  assert.deepEqual(sampleTriangleOffsets(0, 80), []);
});

test("draws the board and grid before components regardless of camera depth", () => {
  const shapes = [
    { id: "near-board", depth: 10, renderOrder: SOFTWARE_RENDER_ORDER.board },
    { id: "far-component", depth: 200, renderOrder: SOFTWARE_RENDER_ORDER.object },
    { id: "grid", depth: 150, renderOrder: SOFTWARE_RENDER_ORDER.grid },
    { id: "near-component", depth: 20, renderOrder: SOFTWARE_RENDER_ORDER.object },
  ].sort(compareSoftwareRenderDepth);

  assert.deepEqual(shapes.map((shape) => shape.id), [
    "near-board",
    "grid",
    "far-component",
    "near-component",
  ]);
});
