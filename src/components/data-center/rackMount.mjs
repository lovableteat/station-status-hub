export const RACK_UNIT_HEIGHT_METERS = 0.04445;
export const STANDARD_19_INCH_RAIL_WIDTH_METERS = 0.4826;

export function getAssignedModuleCount({ currentCount, capacity }) {
  const normalizedCapacity = Math.max(0, Math.floor(Number(capacity) || 0));
  if (normalizedCapacity === 0) return 0;

  const normalizedCurrentCount = Math.max(0, Math.floor(Number(currentCount) || 0));
  return Math.min(Math.max(1, normalizedCurrentCount), normalizedCapacity);
}

export function getDefaultRackL10Assignment({
  rackModelId,
  models,
  firstUsableU = 3,
}) {
  const compatibleModels = Object.values(models ?? {})
    .filter((model) => {
      if (!model || model.kind !== "l10") return false;
      if (!Array.isArray(model.compatibleRackModelIds)) return true;
      return model.compatibleRackModelIds.includes(rackModelId);
    })
    .sort((left, right) => {
      const leftScore = (left.isPlaceholder ? 0 : 2) + (left.isCalibrated ? 1 : 0);
      const rightScore = (right.isPlaceholder ? 0 : 2) + (right.isCalibrated ? 1 : 0);
      return rightScore - leftScore;
    });
  const selectedModel = compatibleModels[0];

  return {
    l10ModelId: selectedModel?.id ?? "l10-placeholder",
    l10Count: selectedModel ? 1 : 0,
    l10StartU: Math.max(1, Math.round(Number(firstUsableU) || 1)),
  };
}

function positiveMeters(valueMm, label) {
  const value = Number(valueMm) / 1000;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive millimeter value.`);
  }
  return value;
}

export function getRackUnitSelection({
  capacityU,
  rackUnits = 1,
  moduleCount = 0,
  startU,
  reservedBottomU = 2,
  reservedTopU = 2,
}) {
  const normalizedCapacityU = Math.max(1, Math.floor(Number(capacityU) || 1));
  const normalizedRackUnits = Math.max(1, Math.floor(Number(rackUnits) || 1));
  const requestedCount = Math.max(0, Math.floor(Number(moduleCount) || 0));
  const reservedBottom = Math.max(0, Math.floor(Number(reservedBottomU) || 0));
  const reservedTop = Math.max(0, Math.floor(Number(reservedTopU) || 0));
  const firstUsableU = Math.min(normalizedCapacityU, reservedBottom + 1);
  const lastUsableU = Math.max(firstUsableU - 1, normalizedCapacityU - reservedTop);
  const maxStartU = Math.max(firstUsableU, lastUsableU - normalizedRackUnits + 1);
  const requestedStartU = Math.round(Number(startU) || firstUsableU);
  const normalizedStartU = Math.min(maxStartU, Math.max(firstUsableU, requestedStartU));
  const availableU = Math.max(0, lastUsableU - normalizedStartU + 1);
  const maxVisible = Math.floor(availableU / normalizedRackUnits);
  const visibleCount = Math.min(requestedCount, maxVisible);
  const requiredU = Math.max(1, requestedCount) * normalizedRackUnits;
  const maxStartUForCount = Math.max(firstUsableU, lastUsableU - requiredU + 1);
  const endU = visibleCount
    ? normalizedStartU + visibleCount * normalizedRackUnits - 1
    : normalizedStartU - 1;

  return {
    rackUnits: normalizedRackUnits,
    startU: normalizedStartU,
    endU,
    firstUsableU,
    lastUsableU,
    maxStartU,
    maxStartUForCount,
    maxVisible,
    visibleCount,
  };
}

export function getRackUnitMountLayout({
  rackDimensions,
  capacityU,
  moduleDimensions,
  rackUnits = 1,
  moduleCount,
  startU,
  reservedBottomU = 2,
  reservedTopU = 2,
  sideClearanceMm = 35,
  frontClearanceMm = 65,
  railOpeningWidthMm = STANDARD_19_INCH_RAIL_WIDTH_METERS * 1000,
}) {
  const rackWidth = positiveMeters(rackDimensions.widthMm, "Rack width");
  const rackDepth = positiveMeters(rackDimensions.depthMm, "Rack depth");
  const rackHeight = positiveMeters(rackDimensions.heightMm, "Rack height");
  const moduleWidth = positiveMeters(moduleDimensions.widthMm, "Module width");
  const moduleDepth = positiveMeters(moduleDimensions.depthMm, "Module depth");
  const moduleHeight = positiveMeters(moduleDimensions.heightMm, "Module height");
  const normalizedCapacityU = Math.max(1, Math.floor(Number(capacityU) || 1));
  const normalizedRackUnits = Math.max(1, Math.floor(Number(rackUnits) || 1));
  const railOpeningWidth = positiveMeters(railOpeningWidthMm, "Rail opening width");
  const cabinetInteriorWidth = Math.max(0.05, rackWidth - (sideClearanceMm / 1000) * 2);
  const usableWidth = Math.min(cabinetInteriorWidth, railOpeningWidth);
  const usableDepth = Math.max(0.05, rackDepth - (frontClearanceMm / 1000) * 2);
  const slotHeight = normalizedRackUnits * RACK_UNIT_HEIGHT_METERS;
  const fitScale = Math.min(
    1,
    usableWidth / moduleWidth,
    usableDepth / moduleDepth,
    slotHeight / moduleHeight,
  );
  const fittedWidth = moduleWidth * fitScale;
  const fittedHeight = moduleHeight * fitScale;
  const fittedDepth = moduleDepth * fitScale;
  const railFieldHeight = normalizedCapacityU * RACK_UNIT_HEIGHT_METERS;
  const railBottom = Math.max(0.08, (rackHeight - railFieldHeight) / 2);
  const selection = getRackUnitSelection({
    capacityU: normalizedCapacityU,
    rackUnits: normalizedRackUnits,
    moduleCount,
    startU,
    reservedBottomU,
    reservedTopU,
  });
  const { startU: normalizedStartU, visibleCount } = selection;
  const frontFaceZ = rackDepth / 2 - frontClearanceMm / 1000;
  const centerZ = frontFaceZ - fittedDepth / 2;
  return {
    fitScale,
    fittedWidth,
    fittedHeight,
    fittedDepth,
    railOpeningWidth,
    ...selection,
    positions: Array.from({ length: visibleCount }, (_, index) => ({
      rackUnit: normalizedStartU + index * normalizedRackUnits,
      y:
        railBottom
        + (normalizedStartU - 1 + index * normalizedRackUnits) * RACK_UNIT_HEIGHT_METERS
        + (slotHeight - fittedHeight) / 2,
      z: centerZ,
    })),
  };
}
