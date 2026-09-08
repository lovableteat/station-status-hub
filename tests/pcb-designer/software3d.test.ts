import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SOFTWARE_VIEW,
  SOFTWARE_RENDER_ORDER,
  compareSoftwareRenderDepth,
  createSoftwareBoxVertices,
  createSoftwareCamera,
  getSoftwareLayerRenderOrder,
  getSoftwareCanvasResolution,
  getSoftwareProjectedHull,
  projectSoftwarePoint,
  sampleTriangleOffsets,
  transformPcbComponentPoint,
} from "../../src/components/pcb-designer/core/software3d.ts";

const board = { width: 100, height: 80 };
const viewport = { width: 1200, height: 700 };

test("pin insertion moves the model inward on either PCB face without changing its height", () => {
  for (const layer of ["top", "bottom"] as const) {
    const component = { x: 50, y: 40, width: 10, height: 6, maxHeight: 8, rotation: 0, layer, insertionDepth: 1.6 };
    const tip = transformPcbComponentPoint({ x: 0, y: -4, z: 0 }, component, board);
    const top = transformPcbComponentPoint({ x: 0, y: 4, z: 0 }, component, board);
    assert.ok(Math.abs(tip.y - (layer === "top" ? -0.8 : 0.8)) < 1e-9);
    assert.equal(Math.abs(top.y - tip.y), 8);
  }
});

test("renders compatibility 3D above CSS resolution without exceeding its pixel budget", () => {
  const standard = getSoftwareCanvasResolution(1200, 700, 1);
  assert.equal(standard.scale, 2);
  assert.equal(standard.pixelWidth, 2400);
  assert.equal(standard.pixelHeight, 1400);

  const large = getSoftwareCanvasResolution(3840, 2160, 3);
  assert.ok(large.scale >= 1);
  assert.ok(large.pixelWidth * large.pixelHeight <= 12_010_000);
});

test("builds a closed screen-space silhouette behind sampled STEP triangles", () => {
  const hull = getSoftwareProjectedHull([
    { x: 1, y: 1, depth: 3, visible: true },
    { x: 9, y: 1, depth: 3, visible: true },
    { x: 9, y: 7, depth: 2, visible: true },
    { x: 1, y: 7, depth: 2, visible: true },
    { x: 5, y: 4, depth: 1, visible: true },
    { x: -20, y: -20, depth: 1, visible: false },
  ]);
  assert.deepEqual(hull.map(({ x, y }) => [x, y]), [[1, 1], [9, 1], [9, 7], [1, 7]]);
});

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

test("uses the same component center in software 3D as the 2D editor", () => {
  const component = {
    x: 72,
    y: 24,
    width: 28,
    height: 16,
    maxHeight: 5,
    rotation: 90,
    layer: "top" as const,
  };

  const center = transformPcbComponentPoint({ x: 0, y: 0, z: 0 }, component, board);

  assert.equal(center.x, 22);
  assert.equal(center.z, -16);
});

test("creates complete boxes and bounds sampled model triangles", () => {
  assert.equal(createSoftwareBoxVertices(10, 4, 8).length, 8);
  assert.equal(sampleTriangleOffsets(30, 20).length, 10);
  assert.ok(sampleTriangleOffsets(30_000, 80).length <= 80);
  assert.deepEqual(sampleTriangleOffsets(0, 80), []);
});

test("draws the PCB between far and near layers when viewing from above", () => {
  const shapes = [
    { id: "top-component", depth: 200, renderOrder: getSoftwareLayerRenderOrder("top", 50) },
    { id: "bottom-component", depth: 10, renderOrder: getSoftwareLayerRenderOrder("bottom", 50) },
    { id: "top-grid", depth: 150, renderOrder: getSoftwareLayerRenderOrder("top", 50, "surface") },
    { id: "bottom-grid", depth: 20, renderOrder: getSoftwareLayerRenderOrder("bottom", 50, "surface") },
    { id: "board", depth: 100, renderOrder: SOFTWARE_RENDER_ORDER.board },
  ].sort(compareSoftwareRenderDepth);

  assert.deepEqual(shapes.map((shape) => shape.id), [
    "bottom-component",
    "bottom-grid",
    "board",
    "top-grid",
    "top-component",
  ]);
});

test("flips PCB occlusion order when the camera moves below the board", () => {
  const shapes = [
    { id: "top-component", depth: 10, renderOrder: getSoftwareLayerRenderOrder("top", -50) },
    { id: "bottom-component", depth: 200, renderOrder: getSoftwareLayerRenderOrder("bottom", -50) },
    { id: "top-grid", depth: 20, renderOrder: getSoftwareLayerRenderOrder("top", -50, "surface") },
    { id: "bottom-grid", depth: 150, renderOrder: getSoftwareLayerRenderOrder("bottom", -50, "surface") },
    { id: "board", depth: 100, renderOrder: SOFTWARE_RENDER_ORDER.board },
  ].sort(compareSoftwareRenderDepth);

  assert.deepEqual(shapes.map((shape) => shape.id), [
    "top-component",
    "top-grid",
    "board",
    "bottom-grid",
    "bottom-component",
  ]);
});
