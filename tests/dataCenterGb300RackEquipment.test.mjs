import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  GB300_RACK_ANATOMY,
  getGb300DefaultL10Slots,
  getGb300EquipmentMountLayout,
  getGb300LedState,
  normalizeGb300RackDevices,
  resolveGb300RackEquipment,
} from "../src/components/data-center/gb300RackEquipment.mjs";
import { getRackUnitMountLayout } from "../src/components/data-center/rackMount.mjs";

const legacyDevices = [
  {
    id: "rack-switch-2",
    name: "Switch Tray 02",
    type: "switch-tray",
    health: "healthy",
    slotStart: 38,
    slotSpan: 2,
  },
  {
    id: "rack-power-5",
    name: "Power Shelf 05",
    type: "psu",
    health: "warning",
    slotStart: 2,
    slotSpan: 4,
  },
];

test("GB300 anatomy adds missing service equipment and only references the existing L10 compute model", () => {
  assert.deepEqual(
    GB300_RACK_ANATOMY.map(({ id, kind, usesExistingL10 }) => ({
      id,
      kind,
      usesExistingL10: Boolean(usesExistingL10),
    })),
    [
      { id: "upper-power-shelf", kind: "power-shelf", usesExistingL10: false },
      { id: "upper-l10-zone", kind: "compute-zone", usesExistingL10: true },
      { id: "switch-tray-bank", kind: "switch-tray", usesExistingL10: false },
      { id: "lower-l10-zone", kind: "compute-zone", usesExistingL10: true },
      { id: "lower-power-shelf", kind: "power-shelf", usesExistingL10: false },
      { id: "rack-cdu", kind: "cdu", usesExistingL10: false },
    ],
  );
  assert.equal(
    GB300_RACK_ANATOMY.filter((item) => item.kind === "compute-zone").every(
      (item) => item.usesExistingL10,
    ),
    true,
  );
});

test("legacy racks resolve deterministic clickable equipment without destructive migration", () => {
  const equipment = resolveGb300RackEquipment(legacyDevices);

  assert.deepEqual(
    equipment.map(({ id, rackUnitStart, rackUnitSpan }) => ({
      id,
      rackUnitStart,
      rackUnitSpan,
    })),
    [
      { id: "upper-power-shelf", rackUnitStart: 38, rackUnitSpan: 3 },
      { id: "switch-tray-bank", rackUnitStart: 18, rackUnitSpan: 8 },
      { id: "lower-power-shelf", rackUnitStart: 3, rackUnitSpan: 3 },
      { id: "rack-cdu", rackUnitStart: 1, rackUnitSpan: 2 },
    ],
  );
  assert.equal(equipment[0].sourceDeviceId, "rack-power-5");
  assert.equal(equipment[2].sourceDeviceId, "rack-power-5");
  assert.equal(equipment[3].sourceDeviceId, "rack-power-5");
  assert.equal(equipment[0].health, "warning");
});

test("explicit GB300 devices keep independent upper and lower Power Shelf status", () => {
  const equipment = resolveGb300RackEquipment([
    {
      id: "upper",
      name: "Upper Power Shelf",
      type: "psu",
      health: "critical",
      slotStart: 38,
      slotSpan: 3,
    },
    {
      id: "lower",
      name: "Lower Power Shelf",
      type: "psu",
      health: "healthy",
      slotStart: 3,
      slotSpan: 3,
    },
    {
      id: "switch",
      name: "Switch Tray Bank",
      type: "switch-tray",
      health: "warning",
      slotStart: 18,
      slotSpan: 8,
    },
    {
      id: "cdu",
      name: "In-rack CDU",
      type: "management",
      health: "offline",
      slotStart: 1,
      slotSpan: 2,
    },
  ]);

  assert.deepEqual(
    equipment.map(({ id, sourceDeviceId, health }) => ({ id, sourceDeviceId, health })),
    [
      { id: "upper-power-shelf", sourceDeviceId: "upper", health: "critical" },
      { id: "switch-tray-bank", sourceDeviceId: "switch", health: "warning" },
      { id: "lower-power-shelf", sourceDeviceId: "lower", health: "healthy" },
      { id: "rack-cdu", sourceDeviceId: "cdu", health: "offline" },
    ],
  );
});

test("legacy GB300 rack data gains independent service device records without touching compute trays", () => {
  const compute = {
    id: "rack-compute-3",
    name: "Compute Tray 03",
    type: "compute-tray",
    health: "healthy",
    slotStart: 27,
    slotSpan: 8,
  };
  const normalized = normalizeGb300RackDevices("rack", [...legacyDevices, compute]);
  const serviceDevices = normalized.filter((device) =>
    ["psu", "switch-tray", "management"].includes(device.type),
  );

  assert.deepEqual(
    serviceDevices.map(({ id, name, type, slotStart, slotSpan }) => ({
      id,
      name,
      type,
      slotStart,
      slotSpan,
    })),
    [
      {
        id: "rack-gb300-upper-power",
        name: "Upper Power Shelf",
        type: "psu",
        slotStart: 38,
        slotSpan: 3,
      },
      {
        id: "rack-switch-2",
        name: "Switch Tray Bank",
        type: "switch-tray",
        slotStart: 18,
        slotSpan: 8,
      },
      {
        id: "rack-power-5",
        name: "Lower Power Shelf",
        type: "psu",
        slotStart: 3,
        slotSpan: 3,
      },
      {
        id: "rack-gb300-cdu",
        name: "In-rack CDU",
        type: "management",
        slotStart: 1,
        slotSpan: 2,
      },
    ],
  );
  assert.equal(normalized.find((device) => device.id === compute.id), compute);
  assert.equal(new Set(normalized.map((device) => device.id)).size, normalized.length);
});

test("legacy L10 placement uses the existing upper and lower compute zones without equipment overlap", () => {
  assert.deepEqual(
    getGb300DefaultL10Slots({ moduleCount: 8, rackUnits: 1 }),
    [6, 7, 8, 9, 10, 11, 12, 13],
  );
  assert.deepEqual(
    getGb300DefaultL10Slots({ moduleCount: 15, rackUnits: 1 }),
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 26, 27, 28],
  );
  assert.deepEqual(
    getGb300DefaultL10Slots({ moduleCount: 4, rackUnits: 2 }),
    [6, 8, 10, 12],
  );
});

test("Power Shelf and Switch Tray share the exact L10 rail width and front plane", () => {
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
    capacityU: 42,
    moduleDimensions: l10Dimensions,
    rackUnits: 1,
    moduleCount: 1,
  });
  const layout = getGb300EquipmentMountLayout({
    rackDimensions,
    capacityU: 42,
    l10Dimensions,
    l10RackUnits: 1,
  });
  const l10FrontFaceZ =
    l10Layout.positions[0].z + l10Layout.fittedDepth / 2;

  assert.equal(layout.width, l10Layout.fittedWidth);
  assert.equal(layout.depth, l10Layout.fittedDepth);
  assert.equal(layout.centerZ, l10Layout.positions[0].z);
  assert.equal(layout.frontFaceZ, l10FrontFaceZ);
  assert.equal(layout.centerZ + layout.depth / 2, l10FrontFaceZ);
  assert.ok(layout.frontFaceZ < rackDimensions.depthMm / 2000);
});

test("Power Shelf and Switch Tray LEDs expose healthy, warning, critical, and offline states", () => {
  assert.deepEqual(getGb300LedState("power-shelf", "healthy"), {
    pwr: "#34d399",
    fault: "#1f2937",
    pmc: "#34d399",
    psu: ["#34d399", "#34d399", "#34d399", "#34d399", "#34d399", "#34d399"],
    nvl: [],
    rj45Link: "#f59e0b",
    rj45Activity: "#34d399",
  });
  assert.deepEqual(getGb300LedState("switch-tray", "warning").nvl, [
    "#f59e0b",
    "#34d399",
    "#f59e0b",
    "#34d399",
  ]);
  assert.equal(getGb300LedState("switch-tray", "critical").pwr, "#ef4444");
  assert.equal(getGb300LedState("switch-tray", "critical").rj45Activity, "#ef4444");
  assert.deepEqual(getGb300LedState("power-shelf", "offline").psu, [
    "#111827",
    "#111827",
    "#111827",
    "#111827",
    "#111827",
    "#111827",
  ]);
});

test("the GB300 equipment overlay stays separate from the existing L10 renderer", async () => {
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
  assert.match(plannerSource, /definition\.id === GB300_RACK_MODEL_ID/);
  assert.match(
    plannerSource,
    /<GB300RackEquipment3D[\s\S]*?l10Dimensions=\{l10Definition\.dimensions\}[\s\S]*?l10RackUnits=\{l10Definition\.rackUnits \?\? 1\}/,
  );
  assert.match(overlaySource, /getGb300EquipmentMountLayout\(\{[\s\S]*?l10Dimensions,[\s\S]*?l10RackUnits,/);
  assert.doesNotMatch(overlaySource, /RackL10Modules|carlo-next-l10|compute-tray/i);
  assert.match(overlaySource, /PowerShelf3D/);
  assert.match(overlaySource, /SwitchTrayBank3D/);
  assert.match(overlaySource, /RackCdu3D/);
});

test("equipment status editing updates real rack devices and the seed has independent assemblies", async () => {
  const workspaceSource = await readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  );
  const plannerSource = await readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  );
  const seedSource = await readFile(
    new URL("../src/components/data-center/dataCenterSeed.ts", import.meta.url),
    "utf8",
  );

  assert.match(plannerSource, /onUpdateRackDeviceHealth/);
  assert.match(workspaceSource, /handleRackDeviceHealthChange/);
  assert.match(workspaceSource, /device\.id === deviceId/);
  assert.match(workspaceSource, /normalizeGb300RackDevices\(rack\.id, rack\.devices\)/);
  assert.match(seedSource, /"Upper Power Shelf"/);
  assert.match(seedSource, /"Lower Power Shelf"/);
  assert.match(seedSource, /"In-rack CDU"/);
});
