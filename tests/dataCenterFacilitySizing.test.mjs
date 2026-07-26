import assert from "node:assert/strict";
import test from "node:test";

import {
  getFacilityOverflowItems,
  parseFacilityDimension,
} from "../src/components/data-center/facilityPlan.mjs";

test("facility dimensions accept finite values without a fixed maximum", () => {
  assert.deepEqual(parseFacilityDimension("1250.55", 80), {
    valid: true,
    value: 1250.6,
    message: "",
  });
  assert.equal(parseFacilityDimension("", 80).valid, false);
  assert.equal(parseFacilityDimension("Infinity", 80).valid, false);
  assert.equal(parseFacilityDimension("0", 80).valid, false);
  assert.equal(parseFacilityDimension("-4", 80).valid, false);
  assert.equal(parseFacilityDimension("0.9", 80).valid, false);
});

test("invalid facility dimensions keep the finite fallback", () => {
  const parsed = parseFacilityDimension("", 42.5);

  assert.equal(parsed.valid, false);
  assert.equal(parsed.value, 42.5);
  assert.match(parsed.message, /1/);
});

test("shrinking a facility reports overflow without changing coordinates", () => {
  const rack = {
    id: "rack-a",
    cabinet: "A01",
    modelId: "rack",
    positionX: 4.8,
    positionZ: 0,
    rotation: 0,
  };
  const facility = {
    width: 10,
    depth: 10,
    aisles: [
      {
        id: "aisle-a",
        label: "冷通道 A",
        x: 0,
        z: 4.5,
        width: 8,
        depth: 2,
        rotation: 90,
      },
    ],
    powerFeeds: [
      {
        id: "power-a",
        label: "PDU A",
        x: -5.2,
        z: 0,
      },
    ],
  };

  const result = getFacilityOverflowItems({
    facility,
    racks: [rack],
    models: {
      rack: {
        dimensions: {
          widthMm: 600,
          depthMm: 1200,
        },
      },
    },
  });

  assert.deepEqual(
    result.map(({ kind, id, label }) => ({ kind, id, label })),
    [
      { kind: "rack", id: "rack-a", label: "A01" },
      { kind: "aisle", id: "aisle-a", label: "冷通道 A" },
      { kind: "power", id: "power-a", label: "PDU A" },
    ],
  );
  assert.equal(rack.positionX, 4.8);
  assert.equal(facility.aisles[0].z, 4.5);
  assert.equal(facility.powerFeeds[0].x, -5.2);
});

test("items touching the facility boundary remain in bounds", () => {
  const result = getFacilityOverflowItems({
    facility: {
      width: 10,
      depth: 8,
      aisles: [
        {
          id: "aisle-a",
          label: "冷通道 A",
          x: 0,
          z: 3,
          width: 8,
          depth: 2,
          rotation: 0,
        },
      ],
      powerFeeds: [{ id: "power-a", label: "PDU A", x: 5, z: 4 }],
    },
    racks: [
      {
        id: "rack-a",
        cabinet: "A01",
        modelId: "rack",
        positionX: 4.7,
        positionZ: 0,
        rotation: 0,
      },
    ],
    models: {
      rack: {
        dimensions: {
          widthMm: 600,
          depthMm: 1200,
        },
      },
    },
  });

  assert.deepEqual(result, []);
});
