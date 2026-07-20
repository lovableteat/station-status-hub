export const MIN_FACILITY_DIMENSION_METERS = 8;
export const MAX_FACILITY_DIMENSION_METERS = 80;

export function normalizeFacilityDimension(value, fallback = MIN_FACILITY_DIMENSION_METERS) {
  const numeric = Number(value);
  const fallbackValue = Number.isFinite(Number(fallback))
    ? Number(fallback)
    : MIN_FACILITY_DIMENSION_METERS;
  const resolved = Number.isFinite(numeric) ? numeric : fallbackValue;
  return Math.min(
    MAX_FACILITY_DIMENSION_METERS,
    Math.max(MIN_FACILITY_DIMENSION_METERS, Math.round(resolved * 10) / 10),
  );
}

export function getFacilityAreaSquareMeters(facility) {
  return Math.round(
    normalizeFacilityDimension(facility?.width)
      * normalizeFacilityDimension(facility?.depth)
      * 10,
  ) / 10;
}
