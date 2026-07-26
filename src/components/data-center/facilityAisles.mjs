const MIN_AISLE_SIZE_METERS = 0.5;

function snapQuarter(value) {
  const snapped = Math.round(Number(value) * 4) / 4;
  return Object.is(snapped, -0) ? 0 : snapped;
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
    x: snapQuarter(x),
    z: snapQuarter(z),
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
    const width = snapQuarter(
      Math.max(MIN_AISLE_SIZE_METERS, signedDistance),
    );
    return {
      ...aisle,
      x: snapQuarter(opposite.x + axis.x * direction * width / 2),
      z: snapQuarter(opposite.z + axis.z * direction * width / 2),
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
  const depth = snapQuarter(
    Math.max(MIN_AISLE_SIZE_METERS, signedDistance),
  );
  return {
    ...aisle,
    x: snapQuarter(opposite.x + cross.x * direction * depth / 2),
    z: snapQuarter(opposite.z + cross.z * direction * depth / 2),
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

export function getFriendlyAislePosition(aisle, facility) {
  const footprint = getRotatedFootprint(aisle);
  return {
    left: snapQuarter(
      aisle.x + facility.width / 2 - footprint.width / 2,
    ),
    top: snapQuarter(
      aisle.z + facility.depth / 2 - footprint.depth / 2,
    ),
  };
}

export function updateAisleFromFriendlyPosition(
  aisle,
  facility,
  { left, top },
) {
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
