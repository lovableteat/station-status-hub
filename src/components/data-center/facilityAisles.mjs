const MIN_AISLE_SIZE_METERS = 0.25;
const AISLE_RESIZE_STEP_METERS = 0.05;

function snapQuarter(value) {
  const snapped = Math.round(Number(value) * 4) / 4;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function roundCoordinate(value) {
  const rounded = Math.round(Number(value) * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function snapResize(value) {
  return roundCoordinate(
    Math.round(Number(value) / AISLE_RESIZE_STEP_METERS)
      * AISLE_RESIZE_STEP_METERS,
  );
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

function getAisleLabel(kind, facility) {
  const existingCount = (facility?.aisles ?? []).filter(
    (aisle) => aisle.kind === kind,
  ).length;
  return `${kind === "cold" ? "冷通道" : "熱通道"} ${existingCount + 1}`;
}

function getAisleDepth(kind) {
  return kind === "cold" ? 2.1 : 1.15;
}

function getRackFootprint(rack, models) {
  const model = models?.[rack?.modelId] ?? models?.["generic-42u"];
  const widthMm = Number(model?.dimensions?.widthMm) || 600;
  const depthMm = Number(model?.dimensions?.depthMm) || 1200;
  const rotated = Math.abs(Number(rack?.rotation) % 180) === 90;
  return {
    width: (rotated ? depthMm : widthMm) / 1000,
    depth: (rotated ? widthMm : depthMm) / 1000,
  };
}

function makeAisleId(kind) {
  const suffix =
    globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${kind}-${suffix}`;
}

export function createFreeAisle({ kind, orientation, facility }) {
  const horizontal = orientation === "horizontal";
  const availableLength = horizontal ? facility.width : facility.depth;
  return {
    id: makeAisleId(kind),
    label: getAisleLabel(kind, facility),
    kind,
    x: 0,
    z: 0,
    width: snapQuarter(
      Math.max(
        MIN_AISLE_SIZE_METERS,
        Math.min(4, Number(availableLength) || 4),
      ),
    ),
    depth: getAisleDepth(kind),
    rotation: horizontal ? 0 : 90,
  };
}

export function createAutomaticAisle({
  kind,
  orientation,
  racks,
  models,
  facility,
}) {
  if (!Array.isArray(racks) || racks.length === 0) {
    return createFreeAisle({ kind, orientation, facility });
  }

  const horizontal = orientation === "horizontal";
  let minAxis = Number.POSITIVE_INFINITY;
  let maxAxis = Number.NEGATIVE_INFINITY;
  let crossTotal = 0;

  for (const rack of racks) {
    const footprint = getRackFootprint(rack, models);
    const axisPosition = horizontal ? rack.positionX : rack.positionZ;
    const axisSize = horizontal ? footprint.width : footprint.depth;
    const crossPosition = horizontal ? rack.positionZ : rack.positionX;
    minAxis = Math.min(minAxis, axisPosition - axisSize / 2);
    maxAxis = Math.max(maxAxis, axisPosition + axisSize / 2);
    crossTotal += crossPosition;
  }

  const facilityAxisSize = horizontal ? facility.width : facility.depth;
  const facilityCrossSize = horizontal ? facility.depth : facility.width;
  const aisleDepth = getAisleDepth(kind);
  const desiredLength = maxAxis - minAxis + 2;
  const length = snapQuarter(
    Math.max(
      MIN_AISLE_SIZE_METERS,
      Math.min(desiredLength, facilityAxisSize),
    ),
  );
  const axisCenter = clamp(
    (minAxis + maxAxis) / 2,
    -facilityAxisSize / 2 + length / 2,
    facilityAxisSize / 2 - length / 2,
  );
  const crossCenter = clamp(
    crossTotal / racks.length,
    -facilityCrossSize / 2 + aisleDepth / 2,
    facilityCrossSize / 2 - aisleDepth / 2,
  );

  return {
    id: makeAisleId(kind),
    label: getAisleLabel(kind, facility),
    kind,
    x: snapQuarter(horizontal ? axisCenter : crossCenter),
    z: snapQuarter(horizontal ? crossCenter : axisCenter),
    width: length,
    depth: aisleDepth,
    rotation: horizontal ? 0 : 90,
  };
}

function getAisleAxes(aisle) {
  const radians = (Number(aisle.rotation) * Math.PI) / 180;
  return {
    axis: {
      x: Math.cos(radians),
      z: Math.sin(radians),
    },
    cross: {
      x: -Math.sin(radians),
      z: Math.cos(radians),
    },
  };
}

function makeHandle(id, x, z) {
  return {
    id,
    x: roundCoordinate(x),
    z: roundCoordinate(z),
  };
}

export function getAisleResizeHandles(aisle) {
  const { axis, cross } = getAisleAxes(aisle);
  const halfWidth = aisle.width / 2;
  const halfDepth = aisle.depth / 2;
  return [
    makeHandle(
      "start",
      aisle.x - axis.x * halfWidth,
      aisle.z - axis.z * halfWidth,
    ),
    makeHandle(
      "end",
      aisle.x + axis.x * halfWidth,
      aisle.z + axis.z * halfWidth,
    ),
    makeHandle(
      "near",
      aisle.x - cross.x * halfDepth,
      aisle.z - cross.z * halfDepth,
    ),
    makeHandle(
      "far",
      aisle.x + cross.x * halfDepth,
      aisle.z + cross.z * halfDepth,
    ),
  ];
}

export function getAislePath(aisle) {
  if (Array.isArray(aisle?.path) && aisle.path.length >= 2) {
    return aisle.path.map((point) => ({
      x: roundCoordinate(point.x),
      z: roundCoordinate(point.z),
    }));
  }

  const { axis } = getAisleAxes(aisle);
  const halfWidth = Number(aisle.width) / 2;
  return [
    makeHandle(
      "start",
      Number(aisle.x) - axis.x * halfWidth,
      Number(aisle.z) - axis.z * halfWidth,
    ),
    makeHandle(
      "end",
      Number(aisle.x) + axis.x * halfWidth,
      Number(aisle.z) + axis.z * halfWidth,
    ),
  ].map(({ x, z }) => ({ x, z }));
}

export function getAisleSegments(aisle) {
  const path = getAislePath(aisle);
  return path.slice(0, -1).map((start, index) => {
    const end = path[index + 1];
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    return {
      id: `${aisle.id}-segment-${index}`,
      start,
      end,
      x: roundCoordinate((start.x + end.x) / 2),
      z: roundCoordinate((start.z + end.z) / 2),
      width: roundCoordinate(Math.hypot(deltaX, deltaZ)),
      depth: Number(aisle.depth),
      rotation: (Math.atan2(deltaZ, deltaX) * 180) / Math.PI,
    };
  }).filter((segment) => segment.width >= MIN_AISLE_SIZE_METERS);
}

function applyAislePathGeometry(aisle, path) {
  const normalizedPath = path.map((point) => ({
    x: roundCoordinate(point.x),
    z: roundCoordinate(point.z),
  }));
  const x = roundCoordinate(
    normalizedPath.reduce((sum, point) => sum + point.x, 0)
      / normalizedPath.length,
  );
  const z = roundCoordinate(
    normalizedPath.reduce((sum, point) => sum + point.z, 0)
      / normalizedPath.length,
  );
  const totalLength = normalizedPath.slice(0, -1).reduce(
    (sum, start, index) => {
      const end = normalizedPath[index + 1];
      return sum + Math.hypot(end.x - start.x, end.z - start.z);
    },
    0,
  );

  return {
    ...aisle,
    x,
    z,
    width: roundCoordinate(
      Math.max(MIN_AISLE_SIZE_METERS, totalLength),
    ),
    path: normalizedPath,
  };
}

export function addAisleTurn(aisle) {
  const path = getAislePath(aisle);
  const start = path[path.length - 2];
  const end = path[path.length - 1];
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const length = Math.max(MIN_AISLE_SIZE_METERS, Math.hypot(deltaX, deltaZ));
  const turnLength = Math.max(1.5, Number(aisle.depth) * 1.5);
  const directionX = deltaX / length;
  const directionZ = deltaZ / length;
  const corner = path.length === 2
    ? {
        x: roundCoordinate((start.x + end.x) / 2),
        z: roundCoordinate((start.z + end.z) / 2),
      }
    : { ...end };
  const nextEnd = {
    x: roundCoordinate(corner.x - directionZ * turnLength),
    z: roundCoordinate(corner.z + directionX * turnLength),
  };
  const nextPath = path.length === 2
    ? [start, corner, nextEnd]
    : [...path, nextEnd];

  return applyAislePathGeometry(aisle, nextPath);
}

export function updateAislePathPoint(aisle, pointIndex, point) {
  const path = getAislePath(aisle);
  if (pointIndex < 0 || pointIndex >= path.length) return aisle;
  path[pointIndex] = {
    x: snapResize(point.x),
    z: snapResize(point.z),
  };
  return applyAislePathGeometry(aisle, path);
}

export function moveAislePath(aisle, x, z) {
  const nextX = roundCoordinate(x);
  const nextZ = roundCoordinate(z);
  if (!Array.isArray(aisle?.path) || aisle.path.length < 2) {
    return { ...aisle, x: nextX, z: nextZ };
  }
  const deltaX = nextX - Number(aisle.x);
  const deltaZ = nextZ - Number(aisle.z);
  return {
    ...aisle,
    x: nextX,
    z: nextZ,
    path: aisle.path.map((point) => ({
      x: roundCoordinate(point.x + deltaX),
      z: roundCoordinate(point.z + deltaZ),
    })),
  };
}

export function rotateAislePath(aisle, degrees = 90) {
  if (!Array.isArray(aisle?.path) || aisle.path.length < 2) {
    return {
      ...aisle,
      rotation: (Number(aisle.rotation) + degrees) % 360,
    };
  }
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    ...aisle,
    rotation: (Number(aisle.rotation) + degrees) % 360,
    path: aisle.path.map((point) => {
      const deltaX = point.x - Number(aisle.x);
      const deltaZ = point.z - Number(aisle.z);
      return {
        x: roundCoordinate(Number(aisle.x) + deltaX * cosine - deltaZ * sine),
        z: roundCoordinate(Number(aisle.z) + deltaX * sine + deltaZ * cosine),
      };
    }),
  };
}

export function straightenAisle(aisle) {
  const path = getAislePath(aisle);
  const start = path[0];
  const end = path[path.length - 1];
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  return {
    ...aisle,
    x: roundCoordinate((start.x + end.x) / 2),
    z: roundCoordinate((start.z + end.z) / 2),
    width: roundCoordinate(Math.max(MIN_AISLE_SIZE_METERS, Math.hypot(deltaX, deltaZ))),
    rotation: roundCoordinate((Math.atan2(deltaZ, deltaX) * 180) / Math.PI),
    path: undefined,
  };
}

function dot(point, vector) {
  return point.x * vector.x + point.z * vector.z;
}

export function resizeAisleFromHandle(aisle, handle, point) {
  const handles = Object.fromEntries(
    getAisleResizeHandles(aisle).map((item) => [item.id, item]),
  );
  const { axis, cross } = getAisleAxes(aisle);

  if (handle === "start" || handle === "end") {
    const opposite = handle === "start" ? handles.end : handles.start;
    const direction = handle === "start" ? -1 : 1;
    const signedDistance =
      dot(
        {
          x: point.x - opposite.x,
          z: point.z - opposite.z,
        },
        axis,
      ) * direction;
    const width = snapResize(
      Math.max(MIN_AISLE_SIZE_METERS, signedDistance),
    );
    return {
      ...aisle,
      x: roundCoordinate(opposite.x + axis.x * direction * width / 2),
      z: roundCoordinate(opposite.z + axis.z * direction * width / 2),
      width,
    };
  }

  const opposite = handle === "near" ? handles.far : handles.near;
  const direction = handle === "near" ? -1 : 1;
  const signedDistance =
    dot(
      {
        x: point.x - opposite.x,
        z: point.z - opposite.z,
      },
      cross,
    ) * direction;
  const depth = snapResize(
    Math.max(MIN_AISLE_SIZE_METERS, signedDistance),
  );
  return {
    ...aisle,
    x: roundCoordinate(opposite.x + cross.x * direction * depth / 2),
    z: roundCoordinate(opposite.z + cross.z * direction * depth / 2),
    depth,
  };
}

function getRotatedFootprint(aisle) {
  const rotated = Math.abs(Number(aisle.rotation) % 180) === 90;
  return {
    width: rotated ? aisle.depth : aisle.width,
    depth: rotated ? aisle.width : aisle.depth,
  };
}

function getAisleBounds(aisle) {
  if (Array.isArray(aisle?.path) && aisle.path.length >= 2) {
    const halfDepth = Number(aisle.depth) / 2;
    return {
      left: Math.min(...aisle.path.map((point) => Number(point.x))) - halfDepth,
      right: Math.max(...aisle.path.map((point) => Number(point.x))) + halfDepth,
      top: Math.min(...aisle.path.map((point) => Number(point.z))) - halfDepth,
      bottom: Math.max(...aisle.path.map((point) => Number(point.z))) + halfDepth,
    };
  }
  const footprint = getRotatedFootprint(aisle);
  return {
    left: Number(aisle.x) - footprint.width / 2,
    right: Number(aisle.x) + footprint.width / 2,
    top: Number(aisle.z) - footprint.depth / 2,
    bottom: Number(aisle.z) + footprint.depth / 2,
  };
}

export function getFriendlyAislePosition(aisle, facility) {
  const bounds = getAisleBounds(aisle);
  return {
    left: snapQuarter(
      bounds.left + facility.width / 2,
    ),
    top: snapQuarter(
      bounds.top + facility.depth / 2,
    ),
  };
}

export function updateAisleFromFriendlyPosition(
  aisle,
  facility,
  { left, top },
) {
  if (Array.isArray(aisle?.path) && aisle.path.length >= 2) {
    const bounds = getAisleBounds(aisle);
    const currentLeft = bounds.left + facility.width / 2;
    const currentTop = bounds.top + facility.depth / 2;
    const deltaX = Number(left) - currentLeft;
    const deltaZ = Number(top) - currentTop;
    return moveAislePath(
      aisle,
      Number(aisle.x) + deltaX,
      Number(aisle.z) + deltaZ,
    );
  }
  const footprint = getRotatedFootprint(aisle);
  return {
    x: snapQuarter(
      Number(left) - facility.width / 2 + footprint.width / 2,
    ),
    z: snapQuarter(
      Number(top) - facility.depth / 2 + footprint.depth / 2,
    ),
  };
}
