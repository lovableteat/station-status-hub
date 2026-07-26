import {
  RACK_UNIT_HEIGHT_METERS,
  getRackUnitMountLayout,
} from "./rackMount.mjs";

export const GB300_RACK_MODEL_ID = "nv-mgx-rack-v1-2-rev7";

export const GB300_RACK_ANATOMY = Object.freeze([
  {
    id: "upper-power-shelf",
    kind: "power-shelf",
    name: "Upper Power Shelf",
    rackUnitStart: 38,
    rackUnitSpan: 3,
  },
  {
    id: "upper-l10-zone",
    kind: "compute-zone",
    name: "Upper L10 Compute Zone",
    rackUnitStart: 26,
    rackUnitSpan: 12,
    usesExistingL10: true,
  },
  {
    id: "switch-tray-bank",
    kind: "switch-tray",
    name: "Switch Tray Bank",
    rackUnitStart: 18,
    rackUnitSpan: 8,
  },
  {
    id: "lower-l10-zone",
    kind: "compute-zone",
    name: "Lower L10 Compute Zone",
    rackUnitStart: 6,
    rackUnitSpan: 12,
    usesExistingL10: true,
  },
  {
    id: "lower-power-shelf",
    kind: "power-shelf",
    name: "Lower Power Shelf",
    rackUnitStart: 3,
    rackUnitSpan: 3,
  },
  {
    id: "rack-cdu",
    kind: "cdu",
    name: "In-rack CDU",
    rackUnitStart: 1,
    rackUnitSpan: 2,
  },
]);

const DISPLAY_EQUIPMENT = GB300_RACK_ANATOMY.filter(
  (item) => item.kind !== "compute-zone",
);
const VALID_HEALTH = new Set(["healthy", "warning", "critical", "offline"]);
const OFF = "#111827";
// Measured from the rendered GB300 L10 GLB after the same uniform fit used by
// DataCenter3DPlanner. The full asset envelope includes articulated pink
// handles; service equipment must align with the visible metal chassis instead.
const GB300_L10_VISIBLE_CHASSIS = Object.freeze({
  widthRatio: 0.8853068078279753,
  depthRatio: 0.820951652668341,
  frontInsetRatio: 0.09141876962895569,
});
const L10_COMPUTE_ZONES = [
  { startU: 6, endU: 17 },
  { startU: 26, endU: 37 },
];

function getHealth(device) {
  return VALID_HEALTH.has(device?.health) ? device.health : "healthy";
}

function bySlotDescending(left, right) {
  return Number(right?.slotStart ?? 0) - Number(left?.slotStart ?? 0);
}

function isCdu(device) {
  return (
    device?.type === "management"
    && (/cdu/i.test(String(device?.name ?? "")) || Number(device?.slotStart ?? 0) <= 2)
  );
}

function createGb300DeviceFallback(rackId, idSuffix, type, name, slotStart, slotSpan) {
  return {
    id: `${rackId}-${idSuffix}`,
    name,
    type,
    health: "healthy",
    slotStart,
    slotSpan,
    serial: `SN-${String(rackId).toUpperCase()}-${idSuffix.toUpperCase()}`,
    assetTag: `GB300-${idSuffix.toUpperCase()}`,
    model:
      type === "psu"
        ? "GB300 Power Shelf"
        : type === "switch-tray"
          ? "GB300 NVLink Switch Tray"
          : "GB300 In-rack CDU",
    role: name,
    network: type === "switch-tray" ? "NVLink / Dual 100G" : "Management",
    powerFeed: "PDU-A/B",
    bmc: "",
    redfish: "Enabled",
    note: "GB300 integrated equipment",
  };
}

export function normalizeGb300RackDevices(rackId, devices = []) {
  const normalizedDevices = Array.isArray(devices) ? devices.filter(Boolean) : [];
  const powerShelves = normalizedDevices
    .filter((device) => device.type === "psu")
    .sort(bySlotDescending);
  const upperPowerSource =
    powerShelves.find((device) => Number(device.slotStart) >= 30)
    ?? powerShelves[0];
  const lowerPowerSource =
    powerShelves.find((device) => Number(device.slotStart) < 20)
    ?? powerShelves.at(-1);
  const switchSource = normalizedDevices.find((device) => device.type === "switch-tray");
  const cduSource = normalizedDevices.find(isCdu);
  const nonServiceDevices = normalizedDevices.filter(
    (device) =>
      device.type !== "psu"
      && device.type !== "switch-tray"
      && !isCdu(device),
  );
  const fallbackPower =
    lowerPowerSource
    ?? upperPowerSource
    ?? createGb300DeviceFallback(rackId, "gb300-power", "psu", "Power Shelf", 3, 3);

  const upperPower =
    upperPowerSource && upperPowerSource !== lowerPowerSource
      ? {
          ...upperPowerSource,
          name: "Upper Power Shelf",
          slotStart: 38,
          slotSpan: 3,
        }
      : {
          ...fallbackPower,
          id: `${rackId}-gb300-upper-power`,
          name: "Upper Power Shelf",
          slotStart: 38,
          slotSpan: 3,
        };
  const lowerPower = {
    ...fallbackPower,
    name: "Lower Power Shelf",
    slotStart: 3,
    slotSpan: 3,
  };
  const switchTray = {
    ...(switchSource
      ?? createGb300DeviceFallback(
        rackId,
        "gb300-switch",
        "switch-tray",
        "Switch Tray Bank",
        18,
        8,
      )),
    name: "Switch Tray Bank",
    type: "switch-tray",
    slotStart: 18,
    slotSpan: 8,
  };
  const cdu = {
    ...(cduSource ?? fallbackPower),
    id: cduSource?.id ?? `${rackId}-gb300-cdu`,
    name: "In-rack CDU",
    type: "management",
    slotStart: 1,
    slotSpan: 2,
    model: cduSource?.model ?? "GB300 In-rack CDU",
    role: "Cooling Distribution Unit",
  };

  return [upperPower, switchTray, lowerPower, cdu, ...nonServiceDevices];
}

export function resolveGb300RackEquipment(devices = []) {
  const normalizedDevices = Array.isArray(devices) ? devices.filter(Boolean) : [];
  const powerShelves = normalizedDevices
    .filter((device) => device.type === "psu")
    .sort(bySlotDescending);
  const switchTray = normalizedDevices
    .filter((device) => device.type === "switch-tray")
    .sort(bySlotDescending)[0];
  const cdu = normalizedDevices.find(isCdu);
  const broadFallback = powerShelves.at(-1) ?? switchTray ?? normalizedDevices[0];
  const sources = {
    "upper-power-shelf": powerShelves[0] ?? broadFallback,
    "switch-tray-bank": switchTray ?? powerShelves[0] ?? broadFallback,
    "lower-power-shelf": powerShelves.at(-1) ?? broadFallback,
    "rack-cdu": cdu ?? broadFallback,
  };

  return DISPLAY_EQUIPMENT.map((item) => {
    const source = sources[item.id];
    return {
      ...item,
      sourceDeviceId: source?.id ?? null,
      health: getHealth(source),
      model:
        source?.model
        ?? (item.kind === "power-shelf"
          ? "GB300 Power Shelf"
          : item.kind === "switch-tray"
            ? "GB300 NVLink Switch Tray"
            : "GB300 In-rack CDU"),
      role: source?.role ?? item.name,
      assetTag: source?.assetTag ?? "GB300-INTEGRATED",
    };
  });
}

export function getGb300DefaultL10Slots({ moduleCount, rackUnits = 1 }) {
  const requestedCount = Math.max(0, Math.floor(Number(moduleCount) || 0));
  const normalizedRackUnits = Math.max(1, Math.floor(Number(rackUnits) || 1));
  const slots = [];

  for (const zone of L10_COMPUTE_ZONES) {
    for (
      let rackUnit = zone.startU;
      rackUnit + normalizedRackUnits - 1 <= zone.endU
        && slots.length < requestedCount;
      rackUnit += normalizedRackUnits
    ) {
      slots.push(rackUnit);
    }
    if (slots.length >= requestedCount) break;
  }

  return slots;
}

export function getGb300EquipmentMountLayout({
  rackDimensions,
  capacityU = 42,
  l10Dimensions = {
    widthMm: 482.1,
    depthMm: 912.3,
    heightMm: 43.8,
  },
  l10RackUnits = 1,
}) {
  const rackHeight = Math.max(0.1, Number(rackDimensions?.heightMm) / 1000 || 0);
  const railFieldHeight = Math.max(1, Number(capacityU) || 42) * RACK_UNIT_HEIGHT_METERS;
  const l10Layout = getRackUnitMountLayout({
    rackDimensions,
    capacityU,
    moduleDimensions: l10Dimensions,
    rackUnits: l10RackUnits,
    moduleCount: 1,
  });
  const l10FrontFaceZ =
    l10Layout.positions[0].z + l10Layout.fittedDepth / 2;
  const width =
    l10Layout.fittedWidth * GB300_L10_VISIBLE_CHASSIS.widthRatio;
  const depth =
    l10Layout.fittedDepth * GB300_L10_VISIBLE_CHASSIS.depthRatio;
  const frontFaceZ =
    l10FrontFaceZ
    - l10Layout.fittedDepth * GB300_L10_VISIBLE_CHASSIS.frontInsetRatio;
  const centerZ = frontFaceZ - depth / 2;

  return {
    rackHeight,
    railBottom: Math.max(0.08, (rackHeight - railFieldHeight) / 2),
    width,
    depth,
    frontFaceZ,
    centerZ,
  };
}

export function getGb300LedState(kind, health) {
  const normalizedHealth = VALID_HEALTH.has(health) ? health : "healthy";
  const base = {
    pwr: "#34d399",
    fault: "#1f2937",
    pmc: "#34d399",
    psu: Array(6).fill("#34d399"),
    nvl: kind === "switch-tray" ? Array(4).fill("#34d399") : [],
    rj45Link: "#f59e0b",
    rj45Activity: "#34d399",
  };

  if (normalizedHealth === "warning") {
    return {
      ...base,
      pwr: "#f59e0b",
      fault: "#f59e0b",
      pmc: "#f59e0b",
      psu: ["#34d399", "#34d399", "#f59e0b", "#34d399", "#34d399", "#f59e0b"],
      nvl: kind === "switch-tray"
        ? ["#f59e0b", "#34d399", "#f59e0b", "#34d399"]
        : [],
      rj45Activity: "#a3e635",
    };
  }

  if (normalizedHealth === "critical") {
    return {
      ...base,
      pwr: "#ef4444",
      fault: "#ef4444",
      pmc: "#ef4444",
      psu: ["#ef4444", "#f59e0b", "#ef4444", "#f59e0b", "#ef4444", "#ef4444"],
      nvl: kind === "switch-tray"
        ? ["#ef4444", OFF, "#ef4444", "#f59e0b"]
        : [],
      rj45Link: "#7c2d12",
      rj45Activity: "#ef4444",
    };
  }

  if (normalizedHealth === "offline") {
    return {
      pwr: OFF,
      fault: OFF,
      pmc: OFF,
      psu: Array(6).fill(OFF),
      nvl: kind === "switch-tray" ? Array(4).fill(OFF) : [],
      rj45Link: OFF,
      rj45Activity: OFF,
    };
  }

  return base;
}
