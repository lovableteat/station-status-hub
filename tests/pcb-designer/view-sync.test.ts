import assert from "node:assert/strict";
import test from "node:test";

import {
  getPcbComponentViewState,
  getPcb3DComponentTransform,
  getPcbComponentCenter,
  getPcbSelectionIds,
  isPcbLayerVisible,
} from "../../src/components/pcb-designer/core/viewSync.ts";

test("returns the 2D center from board coordinates", () => {
  assert.deepEqual(
    getPcbComponentCenter({ x: 20, y: 30, width: 10, height: 6 }),
    { x: 25, y: 33 },
  );
});

test("maps top-layer board coordinates into a deterministic 3D transform", () => {
  assert.deepEqual(
    getPcb3DComponentTransform(
      { x: 20, y: 30, width: 10, height: 6, rotation: 90, layer: "top" },
      { width: 100, height: 80 },
    ),
    {
      position: [-25, 0, 7],
      rotation: [0, -Math.PI / 2, 0],
    },
  );
});

test("adds the bottom-layer flip to the shared 3D transform", () => {
  assert.deepEqual(
    getPcb3DComponentTransform(
      { x: 20, y: 30, width: 10, height: 6, rotation: 90, layer: "bottom" },
      { width: 100, height: 80 },
    ),
    {
      position: [-25, 0, 7],
      rotation: [0, -Math.PI / 2, Math.PI],
    },
  );
});

test("returns unique selection ids including the primary selection", () => {
  assert.deepEqual(
    getPcbSelectionIds(
      { kind: "component", id: "U1" },
      [
        { kind: "component", id: "U1" },
        { kind: "component", id: "R1" },
        { kind: "keepout", id: "K1" },
      ],
    ),
    ["U1", "R1", "K1"],
  );
});

test("derives one shared component view state for 2D and 3D consumers", () => {
  const component = {
    instanceId: "U1",
    x: 20,
    y: 30,
    width: 10,
    height: 6,
    rotation: 90,
    layer: "top" as const,
  };
  const selectionIds = ["U1", "K1"];

  assert.deepEqual(
    getPcbComponentViewState(component, "top", selectionIds),
    {
      coordinate: { x: 25, y: 33 },
      rotation: 90,
      layer: "top",
      visible: true,
      selected: true,
    },
  );

  assert.deepEqual(
    getPcbComponentViewState(component, "bottom", selectionIds),
    {
      coordinate: { x: 25, y: 33 },
      rotation: 90,
      layer: "top",
      visible: false,
      selected: true,
    },
  );
});

test("shares visible-layer rules across all, top, and bottom filters", () => {
  assert.equal(isPcbLayerVisible("all", "top"), true);
  assert.equal(isPcbLayerVisible("all", "bottom"), true);
  assert.equal(isPcbLayerVisible("top", "top"), true);
  assert.equal(isPcbLayerVisible("top", "bottom"), false);
  assert.equal(isPcbLayerVisible("bottom", "top"), false);
  assert.equal(isPcbLayerVisible("bottom", "bottom"), true);
});
