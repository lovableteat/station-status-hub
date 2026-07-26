import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GB300_CAPACITY_U,
  GB300_RACK_ANATOMY,
  createGb300RackDevice,
  getGb300DefaultL10Slots,
  getGb300EquipmentMountLayout,
  getGb300LedState,
  getGb300ServiceDeviceSpec,
  normalizeGb300RackDevices,
  resolveGb300RackEquipment,
  validateGb300RackEquipmentLayout,
} from "../src/components/data-center/gb300RackEquipment.mjs";
import { getRackUnitMountLayout } from "../src/components/data-center/rackMount.mjs";

const legacyDevices = [
  {
    id: "rack-tor-1",
    name: "TOR Switch Bank",
    type: "tor-switch",
    health: "healthy",
    slotStart: 41,
    slotSpan: 2,
  },
  {
    id: "rack-upper-power",
    name: "Upper Power Shelf",
    type: "psu",
    health: "warning",
    slotStart: 38,
    slotSpan: 3,
  },
  {
    id: "rack-switch",
    name: "Switch Tray Bank",
    type: "switch-tray",
    health: "healthy",
    slotStart: 18,
    slotSpan: 8,
  },
  {
    id: "rack-lower-power",
    name: "Lower Power Shelf",
    type: "psu",
    health: "healthy",
    slotStart: 3,
    slotSpan: 3,
  },
  {
    id: "rack-cdu",
    name: "In-rack CDU",
    type: "management",
    health: "offline",
    slotStart: 1,
    slotSpan: 2,
  },
];

test("GB300 follows the supplied 48U rack elevation", () => {
  assert.equal(GB300_CAPACITY_U, 48);
  assert.deepEqual(
    GB300_RACK_ANATOMY.map(({ kind, rackUnitStart, rackUnitSpan }) => ({
      kind,
      rackUnitStart,
      rackUnitSpan,
    })),
    [
      { kind: "tor-switch-zone", rackUnitStart: 45, rackUnitSpan: 2 },
      { kind: "cable-management", rackUnitStart: 44, rackUnitSpan: 1 },
      { kind: "power-shelf-zone", rackUnitStart: 39, rackUnitSpan: 3 },
      { kind: "compute-zone", rackUnitStart: 28, rackUnitSpan: 10 },
      { kind: "switch-tray-zone", rackUnitStart: 19, rackUnitSpan: 8 },
      { kind: "compute-zone", rackUnitStart: 11, rackUnitSpan: 8 },
      { kind: "power-shelf-zone", rackUnitStart: 7, rackUnitSpan: 3 },
      { kind: "cdu-zone", rackUnitStart: 3, rackUnitSpan: 4 },
    ],
  );
});

test("fixed service equipment footprints match the supplied rack references", () => {
  assert.equal(getGb300ServiceDeviceSpec("switch-tray").slotSpan, 1);
  assert.equal(getGb300ServiceDeviceSpec("psu").slotSpan, 1);
  assert.equal(getGb300ServiceDeviceSpec("cdu").slotSpan, 4);
  assert.equal(getGb300ServiceDeviceSpec("tor-switch").slotSpan, 1);
  assert.equal(getGb300ServiceDeviceSpec("tor-switch").model, "SN2201");
});

test("legacy service banks migrate into independently movable physical devices", () => {
  const compute = {
    id: "rack-compute-3",
    name: "Compute Tray 03",
    type: "compute-tray",
    health: "healthy",
    slotStart: 27,
    slotSpan: 1,
  };
  const normalized = normalizeGb300RackDevices("rack", [...legacyDevices, compute]);
  const serviceDevices = normalized.filter((device) =>
    ["psu", "switch-tray", "cdu", "tor-switch"].includes(device.type),
  );

  assert.deepEqual(
    serviceDevices
      .filter((device) => device.type === "tor-switch")
      .map((device) => [device.slotStart, device.slotSpan]),
    [[45, 1], [46, 1]],
  );
  assert.deepEqual(
    serviceDevices
      .filter((device) => device.type === "psu")
      .map((device) => [device.slotStart, device.slotSpan]),
    [[39, 1], [40, 1], [41, 1], [7, 1], [8, 1], [9, 1]],
  );
  assert.deepEqual(
    serviceDevices
      .filter((device) => device.type === "switch-tray")
      .map((device) => [device.slotStart, device.slotSpan]),
    Array.from({ length: 8 }, (_, index) => [19 + index, 1]),
  );
  assert.deepEqual(
    serviceDevices
      .filter((device) => device.type === "cdu")
      .map((device) => [device.slotStart, device.slotSpan]),
    [[3, 4]],
  );
  assert.equal(normalized.find((device) => device.id === compute.id), compute);
  assert.equal(new Set(normalized.map((device) => device.id)).size, normalized.length);
});

test("already normalized equipment keeps the U selected by the operator", () => {
  const devices = [
    createGb300RackDevice({
      rackId: "rack",
      type: "switch-tray",
      slotStart: 32,
    }),
    createGb300RackDevice({
      rackId: "rack",
      type: "psu",
      slotStart: 12,
    }),
    createGb300RackDevice({
      rackId: "rack",
      type: "cdu",
      slotStart: 20,
    }),
  ];

  assert.deepEqual(
    normalizeGb300RackDevices("rack", devices).map(({ type, slotStart, slotSpan }) => ({
      type,
      slotStart,
      slotSpan,
    })),
    [
      { type: "switch-tray", slotStart: 32, slotSpan: 1 },
      { type: "psu", slotStart: 12, slotSpan: 1 },
      { type: "cdu", slotStart: 20, slotSpan: 4 },
    ],
  );
});

test("pre-versioned saved racks receive the complete supplied reference equipment exactly once", () => {
  const migrated = normalizeGb300RackDevices(
    "rack",
    [
      {
        id: "old-power",
        name: "Power Shelf",
        type: "psu",
        health: "warning",
        slotStart: 2,
        slotSpan: 4,
      },
    ],
    { ensureReferenceDefaults: true },
  );

  assert.equal(migrated.filter((device) => device.type === "tor-switch").length, 2);
  assert.equal(migrated.filter((device) => device.type === "psu").length, 6);
  assert.equal(migrated.filter((device) => device.type === "switch-tray").length, 8);
  assert.equal(migrated.filter((device) => device.type === "cdu").length, 1);
  assert.deepEqual(
    migrated
      .filter((device) => device.type === "psu")
      .map((device) => device.slotStart),
    [39, 40, 41, 7, 8, 9],
  );
  assert.equal(migrated.every((device) => device.health === "warning"), true);
});

test("renderer resolves every configured device and one cable manager below a ToR stack", () => {
  const devices = normalizeGb300RackDevices("rack", legacyDevices);
  const equipment = resolveGb300RackEquipment(devices);

  assert.equal(equipment.filter((item) => item.kind === "power-shelf").length, 6);
  assert.equal(equipment.filter((item) => item.kind === "switch-tray").length, 8);
  assert.equal(equipment.filter((item) => item.kind === "cdu").length, 1);
  assert.equal(equipment.filter((item) => item.kind === "tor-switch").length, 2);
  assert.deepEqual(
    equipment
      .filter((item) => item.kind === "tor-switch")
      .map((item) => [item.rackUnitStart, item.rackUnitSpan]),
    [[45, 1], [46, 1]],
  );
  assert.deepEqual(
    equipment
      .filter((item) => item.kind === "cable-management")
      .map((item) => [item.rackUnitStart, item.rackUnitSpan]),
    [[44, 1]],
  );
  assert.equal(equipment.every((item) => item.sourceDeviceId), true);
});

test("placement validation rejects rack bounds, L10 overlap, equipment overlap, and ToR cable overlap", () => {
  const power = createGb300RackDevice({
    rackId: "rack",
    type: "psu",
    slotStart: 39,
  });
  const cdu = createGb300RackDevice({
    rackId: "rack",
    type: "cdu",
    slotStart: 3,
  });
  const tor = createGb300RackDevice({
    rackId: "rack",
    type: "tor-switch",
    slotStart: 45,
  });

  assert.equal(
    validateGb300RackEquipmentLayout({
      capacityU: 48,
      devices: [power, cdu, tor],
      l10Slots: [11, 12],
      l10RackUnits: 1,
    }).valid,
    true,
  );
  assert.equal(
    validateGb300RackEquipmentLayout({
      capacityU: 48,
      devices: [{ ...cdu, slotStart: 46 }],
      l10Slots: [],
      l10RackUnits: 1,
    }).valid,
    false,
  );
  assert.equal(
    validateGb300RackEquipmentLayout({
      capacityU: 48,
      devices: [{ ...power, slotStart: 11 }],
      l10Slots: [11],
      l10RackUnits: 1,
    }).valid,
    false,
  );
  assert.equal(
    validateGb300RackEquipmentLayout({
      capacityU: 48,
      devices: [power, { ...cdu, slotStart: 38 }],
      l10Slots: [],
      l10RackUnits: 1,
    }).valid,
    false,
  );
  assert.equal(
    validateGb300RackEquipmentLayout({
      capacityU: 48,
      devices: [{ ...tor, slotStart: 1 }],
      l10Slots: [],
      l10RackUnits: 1,
    }).valid,
    false,
  );
});

test("GB300 default L10 positions follow the lower and upper compute zones in the supplied image", () => {
  assert.deepEqual(
    getGb300DefaultL10Slots({ moduleCount: 8, rackUnits: 1 }),
    [11, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.deepEqual(
    getGb300DefaultL10Slots({ moduleCount: 12, rackUnits: 1 }),
    [11, 12, 13, 14, 15, 16, 17, 18, 28, 29, 30, 31],
  );
});

test("all service equipment uses the same visible chassis width, depth, front face, and U pitch as L10", () => {
  const rackDimensions = {
    widthMm: 708.8,
    depthMm: 1072.2,
    heightMm: 2308.315,
  };
  const l10Dimensions = {
    widthMm: 482.1,
    depthMm: 912.3,
    heightMm: 43.8,
  };
  const l10Layout = getRackUnitMountLayout({
    rackDimensions,
    capacityU: 48,
    moduleDimensions: l10Dimensions,
    rackUnits: 1,
    moduleCount: 1,
  });
  const layout = getGb300EquipmentMountLayout({
    rackDimensions,
    capacityU: 48,
    l10Dimensions,
    l10RackUnits: 1,
  });
  const l10FrontFaceZ =
    l10Layout.positions[0].z + l10Layout.fittedDepth / 2;

  assert.equal(layout.width, l10Layout.fittedWidth * 0.8853068078279753);
  assert.equal(layout.depth, l10Layout.fittedDepth * 0.820951652668341);
  assert.equal(
    layout.frontFaceZ,
    l10FrontFaceZ - l10Layout.fittedDepth * 0.09141876962895569,
  );
  assert.equal(layout.unitHeight, 0.04445);
});

test("Power Shelf exposes four PSU modules and status LEDs", () => {
  assert.deepEqual(getGb300LedState("power-shelf", "healthy").psu, [
    "#34d399",
    "#34d399",
    "#34d399",
    "#34d399",
  ]);
  assert.equal(getGb300LedState("switch-tray", "critical").pwr, "#ef4444");
  assert.deepEqual(getGb300LedState("power-shelf", "offline").psu, [
    "#111827",
    "#111827",
    "#111827",
    "#111827",
  ]);
});

test("the equipment overlay contains independent 3D renderers for every required model", async () => {
  const plannerSource = await readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  );
  const overlaySource = await readFile(
    new URL("../src/components/data-center/GB300RackEquipment3D.tsx", import.meta.url),
    "utf8",
  );

  assert.match(plannerSource, /<RackL10Modules[\s\S]*?\/>/);
  assert.match(plannerSource, /<GB300RackEquipment3D[\s\S]*?\/>/);
  assert.match(overlaySource, /PowerShelf3D/);
  assert.match(overlaySource, /SwitchTray3D/);
  assert.match(overlaySource, /RackCdu3D/);
  assert.match(overlaySource, /TorSwitch3D/);
  assert.match(overlaySource, /CableManagement3D/);
  assert.doesNotMatch(overlaySource, /SwitchTrayBank3D/);
  assert.match(overlaySource, /equipment\.rackUnitSpan \* RACK_UNIT_HEIGHT_METERS/);
});

test("rack inspector exposes add, move, and delete callbacks for service equipment", async () => {
  const workspaceSource = await readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /onRackDeviceAdd/);
  assert.match(workspaceSource, /onRackDeviceMove/);
  assert.match(workspaceSource, /onRackDeviceRemove/);
  assert.match(workspaceSource, /validateGb300RackEquipmentLayout/);
  assert.match(workspaceSource, /48U/);
});
