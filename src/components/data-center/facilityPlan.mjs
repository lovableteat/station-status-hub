export const MIN_FACILITY_DIMENSION_METERS = 1;

function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}

export function parseFacilityDimension(value, fallback = MIN_FACILITY_DIMENSION_METERS) {
  const numeric =
    typeof value === "string" && value.trim() === ""
      ? Number.NaN
      : Number(value);
  const fallbackNumeric = Number(fallback);
  const fallbackValue =
    Number.isFinite(fallbackNumeric) && fallbackNumeric >= MIN_FACILITY_DIMENSION_METERS
      ? roundToTenth(fallbackNumeric)
      : MIN_FACILITY_DIMENSION_METERS;

  if (!Number.isFinite(numeric) || numeric < MIN_FACILITY_DIMENSION_METERS) {
    return {
      valid: false,
      value: fallbackValue,
      message: "請輸入大於或等於 1 公尺的有限數值。",
    };
  }

  return {
    valid: true,
    value: roundToTenth(numeric),
    message: "",
  };
}

export function normalizeFacilityDimension(value, fallback = MIN_FACILITY_DIMENSION_METERS) {
  return parseFacilityDimension(value, fallback).value;
}

export function getFacilityAreaSquareMeters(facility) {
  return Math.round(
    normalizeFacilityDimension(facility?.width)
      * normalizeFacilityDimension(facility?.depth)
      * 10,
  ) / 10;
}

function isOutsideAxis(value, facilityHalfExtent, itemHalfExtent = 0) {
  return (
    value - itemHalfExtent < -facilityHalfExtent
    || value + itemHalfExtent > facilityHalfExtent
  );
}

function getRackFootprint(rack, models) {
  const model = models?.[rack?.modelId] ?? models?.["generic-42u"];
  const widthMm = Number(model?.dimensions?.widthMm);
  const depthMm = Number(model?.dimensions?.depthMm);
  if (!Number.isFinite(widthMm) || !Number.isFinite(depthMm)) {
    return { width: 0, depth: 0 };
  }

  const rotated = Math.abs(Number(rack?.rotation) % 180) === 90;
  return {
    width: (rotated ? depthMm : widthMm) / 1000,
    depth: (rotated ? widthMm : depthMm) / 1000,
  };
}

export function getFacilityOverflowItems({ facility, racks = [], models = {} }) {
  const width = normalizeFacilityDimension(facility?.width);
  const depth = normalizeFacilityDimension(facility?.depth);
  const overflow = [];

  for (const rack of racks) {
    const footprint = getRackFootprint(rack, models);
    if (
      isOutsideAxis(Number(rack.positionX), width / 2, footprint.width / 2)
      || isOutsideAxis(Number(rack.positionZ), depth / 2, footprint.depth / 2)
    ) {
      overflow.push({
        kind: "rack",
        id: rack.id,
        label: rack.cabinet || rack.id,
      });
    }
  }

  for (const aisle of facility?.aisles ?? []) {
    const rotated = Math.abs(Number(aisle.rotation) % 180) === 90;
    const aisleWidth = rotated ? Number(aisle.depth) : Number(aisle.width);
    const aisleDepth = rotated ? Number(aisle.width) : Number(aisle.depth);
    if (
      isOutsideAxis(Number(aisle.x), width / 2, aisleWidth / 2)
      || isOutsideAxis(Number(aisle.z), depth / 2, aisleDepth / 2)
    ) {
      overflow.push({
        kind: "aisle",
        id: aisle.id,
        label: aisle.label || aisle.id,
      });
    }
  }

  for (const feed of facility?.powerFeeds ?? []) {
    if (
      isOutsideAxis(Number(feed.x), width / 2)
      || isOutsideAxis(Number(feed.z), depth / 2)
    ) {
      overflow.push({
        kind: "power",
        id: feed.id,
        label: feed.label || feed.id,
      });
    }
  }

  return overflow;
}
