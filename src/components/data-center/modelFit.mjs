function finiteSpan(minimum, maximum, axis) {
  const span = Number(maximum?.[axis]) - Number(minimum?.[axis]);
  if (!Number.isFinite(span) || span <= 0) {
    throw new Error(`Model bounds must have a positive ${axis.toUpperCase()} span.`);
  }
  return span;
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Fits CAD geometry inside its physical envelope without changing its proportions.
 * Position is expressed in the unscaled child coordinate system.
 */
export function getUniformModelFit(bounds, dimensions, options = {}) {
  const width = finiteSpan(bounds.min, bounds.max, "x");
  const height = finiteSpan(bounds.min, bounds.max, "y");
  const depth = finiteSpan(bounds.min, bounds.max, "z");
  const targetWidth = Number(dimensions.widthMm) / 1000;
  const targetHeight = Number(dimensions.heightMm) / 1000;
  const targetDepth = Number(dimensions.depthMm) / 1000;

  if (![targetWidth, targetHeight, targetDepth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Physical model dimensions must be positive millimeter values.");
  }

  const uniformScale = Number(
    Math.min(
      targetWidth / width,
      targetHeight / height,
      targetDepth / depth,
    ).toFixed(6),
  );
  const centerX = (Number(bounds.min.x) + Number(bounds.max.x)) / 2;
  const centerZ = (Number(bounds.min.z) + Number(bounds.max.z)) / 2;
  const fittedDepth = depth * uniformScale;
  const availableDepth = Math.max(0, targetDepth - fittedDepth);
  const depthAlignment = options.depthAlignment ?? "center";
  const depthOffsetMeters = Number(
    (
      depthAlignment === "front"
        ? availableDepth / 2
        : depthAlignment === "back"
          ? -availableDepth / 2
          : 0
    ).toFixed(6),
  );

  return {
    uniformScale,
    scale: [uniformScale, uniformScale, uniformScale],
    depthOffsetMeters,
    position: [
      normalizeZero(-centerX),
      normalizeZero(-Number(bounds.min.y)),
      normalizeZero(-centerZ),
    ],
    fittedSizeMeters: {
      width: Number((width * uniformScale).toFixed(6)),
      height: Number((height * uniformScale).toFixed(6)),
      depth: Number(fittedDepth.toFixed(6)),
    },
  };
}
