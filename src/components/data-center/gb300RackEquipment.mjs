import {
  RACK_UNIT_HEIGHT_METERS,
  getRackUnitMountLayout,
} from "./rackMount.mjs";

export const GB300_RACK_MODEL_ID = "nv-mgx-rack-v1-2-rev7";
export const GB300_CAPACITY_U = 48;

export const GB300_RACK_ANATOMY = Object.freeze([
  {
    id: "tor-switch-zone",
    kind: "tor-switch-zone",
    name: "OOB 1GbE Management Switches",
    rackUnitStart: 45,
    rackUnitSpan: 2,
  },
  {
    id: "cable-management",
    kind: "cable-management",
    name: "Cable Management",
    rackUnitStart: 44,
    rackUnitSpan: 1,
  },
  {
    id: "upper-power-shelf-zone",
    kind: "power-shelf-zone",
    name: "Upper Power Shelves",
    rackUnitStart: 39,
    rackUnitSpan: 3,
  },
  {
    id: "upper-l10-zone",
    kind: "compute-zone",
    name: "Upper L10 Compute Zone",
    rackUnitStart: 28,
    rackUnitSpan: 10,
    usesExistingL10: true,
  },
  {
    id: "switch-tray-zone",
    kind: "switch-tray-zone",
    name: "Switch Trays",
    rackUnitStart: 19,
    rackUnitSpan: 8,
  },
  {
    id: "lower-l10-zone",
    kind: "compute-zone",
    name: "Lower L10 Compute Zone",
    rackUnitStart: 11,
    rackUnitSpan: 8,
    usesExistingL10: true,
  },
  {
    id: "lower-power-shelf-zone",
    kind: "power-shelf-zone",
    name: "Lower Power Shelves",
    rackUnitStart: 7,
    rackUnitSpan: 3,
  },
  {
    id: "cdu-zone",
    kind: "cdu-zone",
    name: "In-rack CDU",
    rackUnitStart: 3,
    rackUnitSpan: 4,
  },
]);

const SERVICE_DEVICE_SPECS = Object.freeze({
  "switch-tray": Object.freeze({
    type: "switch-tray",
    kind: "switch-tray",
    label: "Switch Tray",
    slotSpan: 1,
    model: "GB300 Switch Tray",
    role: "NVLink Switch Tray",
    network: "NVLink / OOB",
    assetPrefix: "SWT",
  }),
  psu: Object.freeze({
    type: "psu",
    kind: "power-shelf",
    label: "Power Shelf",
    slotSpan: 1,
    model: "GB300 4-module Power Shelf",
    role: "Power Shelf",
    network: "PMC / RJ45",
    assetPrefix: "PWR",
  }),
  cdu: Object.freeze({
    type: "cdu",
    kind: "cdu",
    label: "In-rack CDU",
    slotSpan: 4,
    model: "GB300 In-rack CDU",
    role: "Cooling Distribution Unit",
    network: "BMC / Redfish",
    assetPrefix: "CDU",
  }),
  "tor-switch": Object.freeze({
    type: "tor-switch",
    kind: "tor-switch",
    label: "ToR Switch SN2201",
    slotSpan: 1,
    model: "SN2201",
    role: "OOB 1GbE Management Switch",
    network: "48 × 1GbE / 4 × uplink",
    assetPrefix: "TOR",
  }),
});

const VALID_HEALTH = new Set(["healthy", "warning", "critical", "offline"]);
const OFF = "#111827";
const L10_COMPUTE_ZONES = [
  { startU: 11, endU: 18 },
  { startU: 28, endU: 37 },
];

// Measured from the rendered GB300 L10 GLB after the same uniform fit used by
// DataCenter3DPlanner. The full asset envelope includes articulated pink
// handles; service equipment aligns to the visible metal chassis instead.
const GB300_L10_VISIBLE_CHASSIS = Object.freeze({
  widthRatio: 0.8853068078279753,
  depthRatio: 0.820951652668341,
  frontInsetRatio: 0.09141876962895569,
});

function getHealth(device) {
  return VALID_HEALTH.has(device?.health) ? device.health : "healthy";
}

function isLegacyCdu(device) {
  return (
    device?.type === "management"
    && (
      /cdu|cooling distribution/i.test(
        `${String(device?.name ?? "")} ${String(device?.model ?? "")} ${String(device?.role ?? "")}`,
      )
      || Number(device?.slotStart ?? 0) <= 2
    )
  );
}

function getServiceType(device) {
  if (isLegacyCdu(device)) return "cdu";
  return SERVICE_DEVICE_SPECS[device?.type]?.type ?? null;
}

function getLegacyMigrationStart(device, serviceType) {
  const slotStart = Math.max(1, Math.floor(Number(device?.slotStart) || 1));
  const slotSpan = Math.max(1, Math.floor(Number(device?.slotSpan) || 1));

  if (serviceType === "tor-switch" && slotSpan > 1 && slotStart === 41) return 45;
  if (serviceType === "psu" && slotSpan > 1 && slotStart >= 30) return 39;
  if (serviceType === "psu" && slotSpan > 1 && slotStart < 20) return 7;
  if (serviceType === "switch-tray" && slotSpan > 1 && slotStart === 18) return 19;
  if (serviceType === "cdu" && slotSpan !== 4 && slotStart <= 2) return 3;
  return slotStart;
}

function getLegacyDeviceCount(device, spec) {
  if (spec.type === "cdu") return 1;
  return Math.max(
    1,
    Math.ceil(Math.max(1, Number(device?.slotSpan) || spec.slotSpan) / spec.slotSpan),
  );
}

function fillDeviceMetadata(device, rackId, spec, index, id) {
  const displayIndex = String(index + 1).padStart(2, "0");
  return {
    ...device,
    id,
    name:
      index === 0 && getLegacyDeviceCount(device, spec) === 1
        ? String(device?.name || spec.label)
        : `${spec.label} ${displayIndex}`,
    type: spec.type,
    health: getHealth(device),
    serial:
      String(device?.serial || "")
      || `SN-${String(rackId).toUpperCase()}-${spec.assetPrefix}-${displayIndex}`,
    assetTag:
      String(device?.assetTag || "")
      || `GB300-${spec.assetPrefix}-${displayIndex}`,
    model: String(device?.model || spec.model),
    role: String(device?.role || spec.role),
    network: String(device?.network || spec.network),
    powerFeed: String(device?.powerFeed || "PDU-A/B"),
    bmc: String(device?.bmc || ""),
    redfish: String(device?.redfish || "Enabled"),
    note: String(device?.note || "GB300 rack equipment"),
  };
}

export function getGb300ServiceDeviceSpec(type) {
  return SERVICE_DEVICE_SPECS[type] ?? null;
}

export function createGb300RackDevice({
  rackId,
  type,
  slotStart,
  id,
  index = 0,
  health = "healthy",
}) {
  const spec = getGb300ServiceDeviceSpec(type);
  if (!spec) {
    throw new Error(`Unsupported GB300 rack device type: ${String(type)}`);
  }
  const uniqueSuffix =
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const deviceId = id ?? `${rackId}-${spec.assetPrefix.toLowerCase()}-${uniqueSuffix}`;
  return {
    ...fillDeviceMetadata({ health }, rackId, spec, index, deviceId),
    slotStart: Math.max(1, Math.floor(Number(slotStart) || 1)),
    slotSpan: spec.slotSpan,
  };
}

export function createGb300ReferenceRackDevices(rackId, health = "healthy") {
  const normalizedHealth = VALID_HEALTH.has(health) ? health : "healthy";
  const definitions = [
    ...[45, 46].map((slotStart, index) => ({
      type: "tor-switch",
      slotStart,
      name: `ToR Switch SN2201 ${String(index + 1).padStart(2, "0")}`,
    })),
    ...[39, 40, 41].map((slotStart, index) => ({
      type: "psu",
      slotStart,
      name: `Upper Power Shelf ${String(index + 1).padStart(2, "0")}`,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      type: "switch-tray",
      slotStart: 19 + index,
      name: `Switch Tray ${String(index + 1).padStart(2, "0")}`,
    })),
    ...[7, 8, 9].map((slotStart, index) => ({
      type: "psu",
      slotStart,
      name: `Lower Power Shelf ${String(index + 1).padStart(2, "0")}`,
    })),
    {
      type: "cdu",
      slotStart: 3,
      name: "In-rack CDU",
    },
  ];

  return definitions.map((definition, index) => ({
    ...createGb300RackDevice({
      rackId,
      id: `${rackId}-gb300-equipment-${index + 1}`,
      type: definition.type,
      slotStart: definition.slotStart,
      index,
      health: normalizedHealth,
    }),
    name: definition.name,
  }));
}

/**
 * Converts the old grouped service blocks into independently editable physical
 * devices once. Already normalized devices keep the U selected by the operator.
 */
export function normalizeGb300RackDevices(
  rackId,
  devices = [],
  { ensureReferenceDefaults = false } = {},
) {
  const normalizedDevices = Array.isArray(devices) ? devices.filter(Boolean) : [];
  if (ensureReferenceDefaults) {
    const nonServiceDevices = normalizedDevices.filter(
      (device) => !getServiceType(device),
    );
    const serviceHealth =
      normalizedDevices
        .filter((device) => getServiceType(device))
        .map(getHealth)
        .sort(
          (left, right) =>
            ["healthy", "warning", "offline", "critical"].indexOf(right)
            - ["healthy", "warning", "offline", "critical"].indexOf(left),
        )[0]
      ?? "healthy";
    return [
      ...createGb300ReferenceRackDevices(rackId, serviceHealth),
      ...nonServiceDevices,
    ];
  }
  const result = [];

  normalizedDevices.forEach((device) => {
    const serviceType = getServiceType(device);
    const spec = getGb300ServiceDeviceSpec(serviceType);
    if (!spec) {
      result.push(device);
      return;
    }

    const count = getLegacyDeviceCount(device, spec);
    const firstSlot = getLegacyMigrationStart(device, serviceType);
    for (let index = 0; index < count; index += 1) {
      const id = count === 1 ? device.id : `${device.id}-${index + 1}`;
      result.push({
        ...fillDeviceMetadata(device, rackId, spec, index, id),
        slotStart: firstSlot + index * spec.slotSpan,
        slotSpan: spec.slotSpan,
      });
    }
  });

  return result.filter(
    (device, index, list) =>
      list.findIndex((candidate) => candidate.id === device.id) === index,
  );
}

function createResolvedEquipment(device, kindOverride) {
  const serviceType = getServiceType(device);
  const spec = getGb300ServiceDeviceSpec(serviceType);
  if (!spec) return null;
  return {
    id: device.id,
    kind: kindOverride ?? spec.kind,
    name: device.name || spec.label,
    rackUnitStart: Math.max(1, Math.floor(Number(device.slotStart) || 1)),
    rackUnitSpan: spec.slotSpan,
    sourceDeviceId: device.id,
    health: getHealth(device),
    model: device.model || spec.model,
    role: device.role || spec.role,
    assetTag: device.assetTag || "GB300-INTEGRATED",
  };
}

function groupContiguousTorSwitches(items) {
  const sorted = [...items].sort(
    (left, right) => left.rackUnitStart - right.rackUnitStart,
  );
  const groups = [];
  for (const item of sorted) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (previous && item.rackUnitStart === previous.rackUnitStart + 1) {
      group.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

export function resolveGb300RackEquipment(devices = []) {
  const resolved = (Array.isArray(devices) ? devices : [])
    .map((device) => createResolvedEquipment(device))
    .filter(Boolean);
  const torSwitches = resolved.filter((item) => item.kind === "tor-switch");
  const cableManagers = groupContiguousTorSwitches(torSwitches)
    .filter((group) => group[0].rackUnitStart > 1)
    .map((group) => {
      const bottomSwitch = group[0];
      return {
        ...bottomSwitch,
        id: `${bottomSwitch.id}-cable-management`,
        kind: "cable-management",
        name: "Cable Management",
        rackUnitStart: bottomSwitch.rackUnitStart - 1,
        rackUnitSpan: 1,
        model: "1U Cable Management",
        role: "ToR cable routing",
        assetTag: `${bottomSwitch.assetTag}-CABLE`,
      };
    });

  return [...resolved, ...cableManagers].sort(
    (left, right) =>
      left.rackUnitStart - right.rackUnitStart
      || left.id.localeCompare(right.id),
  );
}

function addClaim(claims, rackUnit, occupant) {
  const occupants = claims.get(rackUnit) ?? [];
  occupants.push(occupant);
  claims.set(rackUnit, occupants);
}

export function validateGb300RackEquipmentLayout({
  capacityU = GB300_CAPACITY_U,
  devices = [],
  l10Slots = [],
  l10RackUnits = 1,
}) {
  const normalizedCapacity = Math.max(1, Math.floor(Number(capacityU) || GB300_CAPACITY_U));
  const normalizedL10RackUnits = Math.max(1, Math.floor(Number(l10RackUnits) || 1));
  const claims = new Map();
  const errors = [];
  const serviceEquipment = resolveGb300RackEquipment(devices);
  const torGroups = groupContiguousTorSwitches(
    serviceEquipment.filter((item) => item.kind === "tor-switch"),
  );

  torGroups
    .filter((group) => group[0].rackUnitStart <= 1)
    .forEach(() => {
      errors.push("ToR Switch 下方必須保留 1U Cable Management，不能安裝在 U1。");
    });

  for (const item of serviceEquipment) {
    const start = item.rackUnitStart;
    const end = start + item.rackUnitSpan - 1;
    if (start < 1 || end > normalizedCapacity) {
      errors.push(
        `${item.name} 的 U${start}${end === start ? "" : `–U${end}`} 超出 1–${normalizedCapacity}U。`,
      );
      continue;
    }
    for (let rackUnit = start; rackUnit <= end; rackUnit += 1) {
      addClaim(claims, rackUnit, {
        id: item.id,
        sourceDeviceId: item.sourceDeviceId,
        kind: item.kind,
        name: item.name,
      });
    }
  }

  for (const rawSlot of Array.isArray(l10Slots) ? l10Slots : []) {
    const slot = Math.floor(Number(rawSlot) || 0);
    const end = slot + normalizedL10RackUnits - 1;
    if (slot < 1 || end > normalizedCapacity) {
      errors.push(`L10 的 U${slot}–U${end} 超出 1–${normalizedCapacity}U。`);
      continue;
    }
    for (let rackUnit = slot; rackUnit <= end; rackUnit += 1) {
      addClaim(claims, rackUnit, {
        id: `l10-${slot}`,
        sourceDeviceId: null,
        kind: "l10",
        name: `L10 U${slot}`,
      });
    }
  }

  const conflicts = [...claims.entries()]
    .filter(([, occupants]) => {
      const unique = new Set(occupants.map((occupant) => occupant.id));
      return unique.size > 1;
    })
    .map(([rackUnit, occupants]) => ({ rackUnit, occupants }))
    .sort((left, right) => left.rackUnit - right.rackUnit);

  conflicts.forEach((conflict) => {
    errors.push(
      `U${conflict.rackUnit} 發生重疊：${conflict.occupants.map((item) => item.name).join("、")}。`,
    );
  });

  return {
    valid: errors.length === 0,
    conflicts,
    errors,
    occupiedRackUnits: [...claims.keys()].sort((left, right) => left - right),
  };
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
  capacityU = GB300_CAPACITY_U,
  l10Dimensions = {
    widthMm: 482.1,
    depthMm: 912.3,
    heightMm: 43.8,
  },
  l10RackUnits = 1,
}) {
  const rackHeight = Math.max(0.1, Number(rackDimensions?.heightMm) / 1000 || 0);
  const railFieldHeight =
    Math.max(1, Number(capacityU) || GB300_CAPACITY_U) * RACK_UNIT_HEIGHT_METERS;
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
    unitHeight: RACK_UNIT_HEIGHT_METERS,
  };
}

export function getGb300LedState(kind, health) {
  const normalizedHealth = VALID_HEALTH.has(health) ? health : "healthy";
  const base = {
    pwr: "#34d399",
    fault: "#1f2937",
    pmc: "#34d399",
    psu: Array(4).fill("#34d399"),
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
      psu: ["#34d399", "#f59e0b", "#34d399", "#f59e0b"],
      nvl:
        kind === "switch-tray"
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
      psu: ["#ef4444", "#f59e0b", "#ef4444", "#ef4444"],
      nvl:
        kind === "switch-tray"
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
      psu: Array(4).fill(OFF),
      nvl: kind === "switch-tray" ? Array(4).fill(OFF) : [],
      rj45Link: OFF,
      rj45Activity: OFF,
    };
  }

  return base;
}
