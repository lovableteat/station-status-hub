const EDITABLE_FIELDS = ["name", "manufacturer", "revision"];
const PROTECTED_MODEL_IDS = new Set(["generic-42u", "l10-placeholder"]);

export function isL10CompatibleWithRack(model, rackModelId) {
  if (!model || model.kind !== "l10") return false;
  if (!Array.isArray(model.compatibleRackModelIds)) return true;
  return model.compatibleRackModelIds.includes(rackModelId);
}

export function selectCompatibleL10ModelId(models, rackModelId) {
  const compatibleModels = Object.values(models ?? {})
    .filter((model) => isL10CompatibleWithRack(model, rackModelId))
    .sort((left, right) => {
      const leftScore = (left.isPlaceholder ? 0 : 2) + (left.isCalibrated ? 1 : 0);
      const rightScore = (right.isPlaceholder ? 0 : 2) + (right.isCalibrated ? 1 : 0);
      return rightScore - leftScore;
    });

  return compatibleModels[0]?.id ?? null;
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

  const deletedModelIds = Array.isArray(overrides.__deletedModelIds)
    ? overrides.__deletedModelIds
    : [];
  for (const modelId of deletedModelIds) {
    if (typeof modelId === "string" && !PROTECTED_MODEL_IDS.has(modelId)) {
      delete next[modelId];
    }
  }

  for (const [modelId, override] of Object.entries(overrides)) {
    const base = baseModels[modelId];
    if (!base || !next[modelId] || !override || typeof override !== "object") continue;

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
  const deletedModelIds = Object.keys(baseModels)
    .filter((modelId) => !models[modelId] && !PROTECTED_MODEL_IDS.has(modelId))
    .sort();

  if (deletedModelIds.length > 0) {
    overrides.__deletedModelIds = deletedModelIds;
  }

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

export function removeCatalogModel({ models, sites, modelId }) {
  const model = models?.[modelId];
  if (!model) {
    return { deleted: false, reason: "missing", models, sites, affectedRackCount: 0 };
  }
  if (PROTECTED_MODEL_IDS.has(modelId)) {
    return { deleted: false, reason: "protected", models, sites, affectedRackCount: 0 };
  }

  const fallbackModel =
    model.kind === "rack"
      ? models["generic-42u"] ??
        Object.values(models).find((candidate) => candidate.kind === "rack" && candidate.id !== modelId)
      : models["l10-placeholder"] ??
        Object.values(models).find((candidate) => candidate.kind === "l10" && candidate.id !== modelId);
  if (!fallbackModel) {
    return { deleted: false, reason: "last-of-kind", models, sites, affectedRackCount: 0 };
  }

  let affectedRackCount = 0;
  const nextSites = (sites ?? []).map((site) => ({
    ...site,
    racks: (site.racks ?? []).map((rack) => {
      if (model.kind === "rack" && rack.modelId === modelId) {
        affectedRackCount += 1;
        const assignedL10 = models[rack.l10ModelId];
        return {
          ...rack,
          modelId: fallbackModel.id,
          l10ModelId: isL10CompatibleWithRack(assignedL10, fallbackModel.id)
            ? rack.l10ModelId
            : "l10-placeholder",
        };
      }
      if (model.kind === "l10" && rack.l10ModelId === modelId) {
        affectedRackCount += 1;
        return {
          ...rack,
          l10ModelId: fallbackModel.id,
        };
      }
      return rack;
    }),
  }));
  const nextModels = { ...models };
  delete nextModels[modelId];

  return {
    deleted: true,
    reason: null,
    models: nextModels,
    sites: nextSites,
    affectedRackCount,
    fallbackModelId: fallbackModel.id,
  };
}
