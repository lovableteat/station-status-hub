import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutomaticAisle,
  createFreeAisle,
  getAisleResizeHandles,
  getFriendlyAislePosition,
  resizeAisleFromHandle,
  updateAisleFromFriendlyPosition,
} from "../src/components/data-center/facilityAisles.mjs";

const facility = {
  width: 20,
  depth: 10,
  aisles: [],
};

const models = {
  rack: {
    dimensions: {
      widthMm: 600,
      depthMm: 1200,
    },
  },
};

const racks = [
  {
    id: "rack-a",
    modelId: "rack",
    positionX: -3,
    positionZ: 0,
    rotation: 0,
  },
  {
    id: "rack-b",
    modelId: "rack",
    positionX: 3,
    positionZ: 0,
    rotation: 0,
  },
];

test("automatic aisles span selected rack footprints with one meter end clearance", () => {
  const aisle = createAutomaticAisle({
    kind: "cold",
    orientation: "horizontal",
    racks,
    models,
    facility,
  });

  assert.equal(aisle.kind, "cold");
  assert.equal(aisle.rotation, 0);
  assert.equal(aisle.x, 0);
  assert.equal(aisle.z, 0);
  assert.equal(aisle.width, 8.5);
  assert.equal(aisle.depth, 2.1);
});

test("automatic vertical aisles follow rack depth footprints", () => {
  const aisle = createAutomaticAisle({
    kind: "hot",
    orientation: "vertical",
    racks: [
      { ...racks[0], positionX: 2, positionZ: -2.5 },
      { ...racks[1], positionX: 2, positionZ: 2.5 },
    ],
    models,
    facility,
  });

  assert.equal(aisle.rotation, 90);
  assert.equal(aisle.x, 2);
  assert.equal(aisle.z, 0);
  assert.equal(aisle.width, 8.25);
  assert.equal(aisle.depth, 1.15);
});

test("free aisles start centered at a safe visible length", () => {
  const aisle = createFreeAisle({
    kind: "hot",
    orientation: "vertical",
    facility: { width: 8, depth: 3, aisles: [] },
  });

  assert.equal(aisle.x, 0);
  assert.equal(aisle.z, 0);
  assert.equal(aisle.width, 3);
  assert.equal(aisle.depth, 1.15);
  assert.equal(aisle.rotation, 90);
});

test("friendly positions do not require center based X and Z knowledge", () => {
  const aisle = {
    x: 0,
    z: 0,
    width: 4,
    depth: 2,
    rotation: 0,
  };

  assert.deepEqual(getFriendlyAislePosition(aisle, facility), {
    left: 8,
    top: 4,
  });

  assert.deepEqual(
    updateAisleFromFriendlyPosition(aisle, facility, { left: 3, top: 2 }),
    {
      x: -5,
      z: -2,
    },
  );
});

test("resize handles and dragging preserve the opposite aisle edge", () => {
  const aisle = {
    id: "aisle-a",
    x: 0,
    z: 0,
    width: 4,
    depth: 2,
    rotation: 0,
  };

  assert.deepEqual(getAisleResizeHandles(aisle), [
    { id: "start", x: -2, z: 0 },
    { id: "end", x: 2, z: 0 },
    { id: "near", x: 0, z: -1 },
    { id: "far", x: 0, z: 1 },
  ]);

  assert.deepEqual(
    resizeAisleFromHandle(aisle, "end", { x: 4, z: 0 }),
    {
      ...aisle,
      x: 1,
      width: 6,
    },
  );
  assert.deepEqual(
    resizeAisleFromHandle(aisle, "near", { x: 0, z: -2 }),
    {
      ...aisle,
      z: -0.5,
      depth: 3,
    },
  );

  assert.deepEqual(
    resizeAisleFromHandle(aisle, "end", { x: -1.62, z: 0 }),
    {
      ...aisle,
      x: -1.8,
      width: 0.4,
    },
  );
  assert.deepEqual(
    resizeAisleFromHandle(aisle, "near", { x: 0, z: 0.82 }),
    {
      ...aisle,
      z: 0.875,
      depth: 0.25,
    },
  );
});

test("resize handles rotate with vertical aisles", () => {
  const handles = getAisleResizeHandles({
    x: 0,
    z: 0,
    width: 4,
    depth: 2,
    rotation: 90,
  });

  assert.deepEqual(handles, [
    { id: "start", x: 0, z: -2 },
    { id: "end", x: 0, z: 2 },
    { id: "near", x: 1, z: 0 },
    { id: "far", x: -1, z: 0 },
  ]);
});
