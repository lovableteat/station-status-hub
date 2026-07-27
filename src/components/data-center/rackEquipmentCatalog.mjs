export const EQUIPMENT_CATEGORY_OPTIONS = [
  { id: "all", label: "全部設備" },
  { id: "compute", label: "運算" },
  { id: "network", label: "網路" },
  { id: "storage", label: "儲存" },
  { id: "power", label: "電力" },
  { id: "cooling", label: "冷卻" },
  { id: "management", label: "管理" },
  { id: "other", label: "其他" },
];

export function getEquipmentCategory(model) {
  return model?.equipmentCategory ?? "compute";
}

export function getEquipmentCategoryLabel(category) {
  return (
    EQUIPMENT_CATEGORY_OPTIONS.find((option) => option.id === category)?.label ??
    "其他"
  );
}

export function getEquipmentDeviceType(category) {
  switch (category) {
    case "network":
      return "tor-switch";
    case "storage":
      return "storage-tray";
    case "power":
      return "psu";
    case "cooling":
      return "cdu";
    case "management":
      return "management";
    case "compute":
      return "compute-tray";
    default:
      return "cable-management";
  }
}

function getOccupiedRackUnits({ rack, ignoredDeviceId }) {
  const occupied = new Set();
  for (const device of rack?.devices ?? []) {
    if (device.id === ignoredDeviceId) continue;
    const span = Math.max(1, Math.round(Number(device.slotSpan) || 1));
    for (let index = 0; index < span; index += 1) {
      occupied.add(Number(device.slotStart) + index);
    }
  }
  return occupied;
}

export function getAvailableCatalogEquipmentUnits({
  rack,
  model,
  primarySlots = [],
  primaryRackUnits = 1,
  ignoredDeviceId,
  reservedBottomU = 2,
  reservedTopU = 2,
}) {
  if (!rack || !model || model.kind !== "l10") return [];
  const span = Math.max(1, Math.round(Number(model.rackUnits) || 1));
  const firstU = Math.max(1, Math.round(Number(reservedBottomU) || 0) + 1);
  const lastU = Math.max(firstU - 1, rack.capacityU - Math.max(0, reservedTopU));
  const occupied = getOccupiedRackUnits({ rack, ignoredDeviceId });
  const primarySpan = Math.max(1, Math.round(Number(primaryRackUnits) || 1));
  for (const slot of primarySlots ?? []) {
    for (let index = 0; index < primarySpan; index += 1) {
      occupied.add(Number(slot) + index);
    }
  }

  const units = [];
  for (let startU = firstU; startU + span - 1 <= lastU; startU += 1) {
    let available = true;
    for (let index = 0; index < span; index += 1) {
      if (occupied.has(startU + index)) {
        available = false;
        break;
      }
    }
    if (available) units.push(startU);
  }
  return units;
}
