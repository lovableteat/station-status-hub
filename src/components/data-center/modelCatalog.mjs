const EDITABLE_FIELDS = ["name", "manufacturer", "revision"];

export function isL10CompatibleWithRack(model, rackModelId) {
  if (!model || model.kind !== "l10") return false;
  if (!Array.isArray(model.compatibleRackModelIds)) return true;
  return model.compatibleRackModelIds.includes(rackModelId);
}

function normalizeDimensions(dimensions, fallback) {
  if (!dimensions || typeof dimensions !== "object") return fallback;

  const next = {
    widthMm: Number(dimensions.widthMm),
    depthMm: Number(dimensions.depthMm),
    heightMm: Number(dimensions.heightMm),
  };
  return Object.values(next).every((value) => Number.isFinite(value) && value > 0)
    ? next
    : fallback;
}

export function mergeModelCatalogOverrides(baseModels, overrides) {
  const next = { ...baseModels };
  if (!overrides || typeof overrides !== "object") return next;

  for (const [modelId, override] of Object.entries(overrides)) {
    const base = baseModels[modelId];
    if (!base || !override || typeof override !== "object") continue;

    const metadata = {};
    for (const field of EDITABLE_FIELDS) {
      const value = override[field];
      if (typeof value === "string" && value.trim()) metadata[field] = value.trim();
    }

    next[modelId] = {
      ...base,
      ...metadata,
      dimensions: normalizeDimensions(override.dimensions, base.dimensions),
    };
  }

  return next;
}

export function serializeModelCatalogOverrides(models, baseModels) {
  const overrides = {};

  for (const [modelId, model] of Object.entries(models)) {
    const base = baseModels[modelId];
    if (!base) continue;

    const changed =
      EDITABLE_FIELDS.some((field) => model[field] !== base[field]) ||
      model.dimensions.widthMm !== base.dimensions.widthMm ||
      model.dimensions.depthMm !== base.dimensions.depthMm ||
      model.dimensions.heightMm !== base.dimensions.heightMm;

    if (changed) {
      overrides[modelId] = {
        name: model.name,
        manufacturer: model.manufacturer,
        revision: model.revision,
        dimensions: { ...model.dimensions },
      };
    }
  }

  return overrides;
}
