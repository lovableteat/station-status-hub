import assert from "node:assert/strict";
import test from "node:test";

import {
  RACK_UNIT_HEIGHT_METERS,
  STANDARD_19_INCH_RAIL_WIDTH_METERS,
  getDefaultRackL10Assignment,
  getAssignedModuleCount,
  getRackUnitMountLayout,
} from "../src/components/data-center/rackMount.mjs";

test("GB300 L10 fits the L11 19-inch rails with one uniform scale", () => {
  const layout = getRackUnitMountLayout({
    rackDimensions: { widthMm: 708.8, depthMm: 1072.2, heightMm: 2308.315 },
    capacityU: 42,
    moduleDimensions: { widthMm: 481.5, depthMm: 889.6, heightMm: 44.5 },
    rackUnits: 1,
    moduleCount: 8,
  });

  assert.equal(RACK_UNIT_HEIGHT_METERS, 0.04445);
  assert.equal(STANDARD_19_INCH_RAIL_WIDTH_METERS, 0.4826);
  assert.equal(layout.visibleCount, 8);
  assert.ok(layout.fitScale > 0.99 && layout.fitScale <= 1);
  assert.ok(layout.fittedWidth <= STANDARD_19_INCH_RAIL_WIDTH_METERS);
  assert.equal(layout.positions.length, 8);
  assert.equal(
    Number((layout.positions[1].y - layout.positions[0].y).toFixed(5)),
    RACK_UNIT_HEIGHT_METERS,
  );
  assert.ok(layout.positions.every((position) => position.z > 0));
});

test("operators can choose the first occupied U and modules continue upward", () => {
  const layout = getRackUnitMountLayout({
    rackDimensions: { widthMm: 708.8, depthMm: 1072.2, heightMm: 2308.315 },
    capacityU: 42,
    moduleDimensions: { widthMm: 481.5, depthMm: 889.6, heightMm: 44.5 },
    rackUnits: 1,
    moduleCount: 3,
    startU: 10,
  });

  assert.equal(layout.startU, 10);
  assert.equal(layout.endU, 12);
  assert.deepEqual(layout.positions.map((position) => position.rackUnit), [10, 11, 12]);
  assert.equal(
    Number((layout.positions[1].y - layout.positions[0].y).toFixed(5)),
    RACK_UNIT_HEIGHT_METERS,
  );
});

test("rack capacity reserves top and bottom service space", () => {
  const layout = getRackUnitMountLayout({
    rackDimensions: { widthMm: 600, depthMm: 1200, heightMm: 2200 },
    capacityU: 42,
    moduleDimensions: { widthMm: 497.2, depthMm: 899.1, heightMm: 44 },
    rackUnits: 1,
    moduleCount: 99,
    reservedBottomU: 2,
    reservedTopU: 2,
  });

  assert.equal(layout.visibleCount, 38);
  assert.equal(layout.startU, 3);
  assert.equal(layout.endU, 40);
  assert.ok(layout.positions.at(-1).y < 2.2);
});

test("selected U is clamped before reserved top space and excess modules are rejected", () => {
  const layout = getRackUnitMountLayout({
    rackDimensions: { widthMm: 708.8, depthMm: 1072.2, heightMm: 2308.315 },
    capacityU: 42,
    moduleDimensions: { widthMm: 481.5, depthMm: 889.6, heightMm: 44.5 },
    rackUnits: 1,
    moduleCount: 8,
    startU: 39,
    reservedBottomU: 2,
    reservedTopU: 2,
  });

  assert.equal(layout.startU, 39);
  assert.equal(layout.visibleCount, 2);
  assert.equal(layout.endU, 40);
  assert.deepEqual(layout.positions.map((position) => position.rackUnit), [39, 40]);
});

test("applying an L10 to an empty compatible rack installs one module", () => {
  assert.equal(getAssignedModuleCount({ currentCount: 0, capacity: 38 }), 1);
});

test("applying a replacement model preserves count within rack capacity", () => {
  assert.equal(getAssignedModuleCount({ currentCount: 5, capacity: 8 }), 5);
  assert.equal(getAssignedModuleCount({ currentCount: 5, capacity: 3 }), 3);
  assert.equal(getAssignedModuleCount({ currentCount: 0, capacity: 0 }), 0);
});

test("new compatible L11 racks receive one L10 at the first usable rack unit", () => {
  assert.deepEqual(
    getDefaultRackL10Assignment({
      rackModelId: "gb300-rack",
      models: {
        placeholder: {
          id: "placeholder",
          kind: "l10",
          isPlaceholder: true,
        },
        "gb300-l10": {
          id: "gb300-l10",
          kind: "l10",
          compatibleRackModelIds: ["gb300-rack"],
          isPlaceholder: false,
          isCalibrated: true,
        },
      },
      firstUsableU: 3,
    }),
    {
      l10ModelId: "gb300-l10",
      l10Count: 1,
      l10StartU: 3,
    },
  );
});
