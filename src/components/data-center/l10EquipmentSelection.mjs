export function createL10EquipmentSelection({ rack, definition, rackUnit }) {
  const normalizedRackUnit = Math.max(1, Math.round(Number(rackUnit) || 1));
  const rackUnitSpan = Math.max(1, Math.round(Number(definition.rackUnits) || 1));
  const moduleCount = Math.max(1, Math.round(Number(rack.l10Count) || 1));
  const powerKw = Math.round((Number(rack.powerKw) / moduleCount) * 10) / 10;

  return {
    id: `${rack.id}-l10-u${normalizedRackUnit}`,
    kind: "l10",
    name: definition.name,
    rackUnitStart: normalizedRackUnit,
    rackUnitSpan,
    sourceDeviceId: null,
    health: rack.l10ModuleHealth?.[String(normalizedRackUnit)] ?? "healthy",
    model: definition.name,
    role: "L10 運算模組",
    assetTag: `${rack.cabinet}-L10-U${normalizedRackUnit}`,
    powerKw,
    temperatureC: Number(rack.temperatureC),
    utilizationPercent: Number(rack.utilizationPercent),
  };
}
