const DEFAULT_VERTICAL_FOV_DEGREES = 36;
const MINIMUM_OVERVIEW_DISTANCE_METERS = 5.5;
const MINIMUM_ORBIT_DISTANCE_METERS = 1.55;
const OVERVIEW_LABEL_CLEARANCE_METERS = 0.45;
const OVERVIEW_PADDING_FACTOR = 1.14;

const OVERVIEW_DIRECTION = (() => {
  const direction = [0.72, 0.52, 0.82];
  const length = Math.hypot(...direction);
  return direction.map((value) => value / length);
})();

function toFinitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getRotatedFootprint(item) {
  const normalizedRotation =
    ((Number.isFinite(item.rotationDegrees) ? item.rotationDegrees : 0) % 180 + 180) % 180;
  const swapsAxes = normalizedRotation >= 45 && normalizedRotation < 135;
  const width = toFinitePositive(item.widthMeters, 0.7);
  const depth = toFinitePositive(item.depthMeters, 1.1);

  return swapsAxes
    ? { width: depth, depth: width }
    : { width, depth };
}

/**
 * Returns a camera frame based on the visible rack group, not on the facility
 * floor. A large but mostly empty facility therefore keeps its racks readable.
 */
export function getRackOverviewFrame(items, verticalFovDegrees = DEFAULT_VERTICAL_FOV_DEGREES) {
  if (!Array.isArray(items) || items.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxHeight = 0;

  for (const item of items) {
    const positionX = Number.isFinite(item.positionX) ? item.positionX : 0;
    const positionZ = Number.isFinite(item.positionZ) ? item.positionZ : 0;
    const footprint = getRotatedFootprint(item);
    const height = toFinitePositive(item.heightMeters, 2.2);

    minX = Math.min(minX, positionX - footprint.width / 2);
    maxX = Math.max(maxX, positionX + footprint.width / 2);
    minZ = Math.min(minZ, positionZ - footprint.depth / 2);
    maxZ = Math.max(maxZ, positionZ + footprint.depth / 2);
    maxHeight = Math.max(maxHeight, height);
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const targetY = maxHeight / 2;
  const halfWidth = Math.max((maxX - minX) / 2, 0.35);
  const halfDepth = Math.max((maxZ - minZ) / 2, 0.55);
  const halfHeight = maxHeight / 2 + OVERVIEW_LABEL_CLEARANCE_METERS;
  const radius = Math.hypot(halfWidth, halfHeight, halfDepth);
  const fovRadians =
    (toFinitePositive(verticalFovDegrees, DEFAULT_VERTICAL_FOV_DEGREES) * Math.PI) / 180;
  const fitDistance = radius / Math.tan(fovRadians / 2);
  const distance = Math.max(
    MINIMUM_OVERVIEW_DISTANCE_METERS,
    fitDistance * OVERVIEW_PADDING_FACTOR,
  );
  const target = [centerX, targetY, centerZ];
  const position = [
    centerX + OVERVIEW_DIRECTION[0] * distance,
    targetY + OVERVIEW_DIRECTION[1] * distance,
    centerZ + OVERVIEW_DIRECTION[2] * distance,
  ];

  return { position, target, distance };
}

/**
 * Keeps OrbitControls outside the selected rack's bounding sphere while still
 * allowing close equipment inspection.
 */
export function getSafeOrbitDistance(dimensions) {
  const width = toFinitePositive(dimensions?.widthMeters, 0.7);
  const height = toFinitePositive(dimensions?.heightMeters, 2.2);
  const depth = toFinitePositive(dimensions?.depthMeters, 1.1);
  const rackRadius = Math.hypot(width, height, depth) / 2;

  return Math.max(MINIMUM_ORBIT_DISTANCE_METERS, rackRadius * 1.12);
}
