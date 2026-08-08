import type {
  PcbModelAssetMetadata,
  PcbProject,
  PcbSaveState,
  PcbVisibleLayer,
} from "../types.ts";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasStrings(value: RecordValue, fields: readonly string[]): boolean {
  return fields.every((field) => isNonEmptyString(value[field]));
}

function hasFiniteNumbers(value: RecordValue, fields: readonly string[]): boolean {
  return fields.every((field) => isFiniteNumber(value[field]));
}

function isPositiveFiniteNumber(value: unknown): boolean {
  return isFiniteNumber(value) && value > 0;
}

export function isPcbVisibleLayer(value: unknown): value is PcbVisibleLayer {
  return value === "all" || value === "top" || value === "bottom";
}

function isModelAssetMetadata(value: unknown): value is PcbModelAssetMetadata {
  if (!isRecord(value)) return false;
  const legacy = isNonEmptyString(value.id)
    && isNonEmptyString(value.fileName)
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt);
  if (!legacy) return false;
  if (value.schemaVersion === undefined) return true;
  return value.schemaVersion === 1
    && isRecord(value.dimensions)
    && hasFiniteNumbers(value.dimensions, ["widthMm", "depthMm", "heightMm"])
    && isRecord(value.calibratedDimensions)
    && hasFiniteNumbers(value.calibratedDimensions, ["widthMm", "depthMm", "heightMm"])
    && (value.upAxis === "x" || value.upAxis === "y" || value.upAxis === "z")
    && isRecord(value.bounds)
    && Array.isArray(value.bounds.min)
    && value.bounds.min.length === 3
    && value.bounds.min.every(isFiniteNumber)
    && Array.isArray(value.bounds.max)
    && value.bounds.max.length === 3
    && value.bounds.max.every(isFiniteNumber)
    && Array.isArray(value.parts)
    && value.parts.every((part) => {
      if (!isRecord(part)) return false;
      return isNonEmptyString(part.id)
        && isNonEmptyString(part.name)
        && Number.isInteger(part.vertexCount)
        && part.vertexCount >= 0
        && Number.isInteger(part.indexCount)
        && part.indexCount >= 0;
    });
}

function uniqueIds(items: RecordValue[], key: string): boolean {
  const ids = items.map((item) => item[key]);
  return ids.every(isNonEmptyString) && new Set(ids).size === ids.length;
}

function isModelAssetsIndex(value: unknown): value is Record<string, PcbModelAssetMetadata> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isModelAssetMetadata);
}

export function isValidBoard(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.width) && value.width >= 20 && value.width <= 1000
    && isFiniteNumber(value.height) && value.height >= 20 && value.height <= 1000
    && isFiniteNumber(value.gridSize) && value.gridSize >= 0.1 && value.gridSize <= 50
    && typeof value.showGrid === "boolean"
    && typeof value.snapToGrid === "boolean"
    && isNonEmptyString(value.background);
}

export function normalizePcbSaveState(state: PcbSaveState): PcbSaveState {
  const cloned = structuredClone(state);
  const modelAssets = Object.fromEntries(
    Object.entries(cloned.modelAssets ?? {}).filter(([, asset]) => isModelAssetMetadata(asset)),
  ) as PcbSaveState["modelAssets"];
  const projects = cloned.projects.map((project) => ({
    ...project,
    components: project.components.map((component) => {
      if (!component.modelAssetId || modelAssets?.[component.modelAssetId]) return component;
      const { modelAssetId: _removed, ...withoutAsset } = component;
      return withoutAsset;
    }),
  }));
  return {
    ...cloned,
    projects,
    modelAssets: structuredClone(modelAssets ?? {}),
    pendingPlacementsByProject: structuredClone(cloned.pendingPlacementsByProject ?? {}),
    remoteDeletions: structuredClone(cloned.remoteDeletions ?? {
      projects: [],
      templates: [],
      library: [],
    }),
  };
}

function validateComponent(value: unknown): value is RecordValue {
  if (!isRecord(value)) return false;
  return hasStrings(value, ["id", "name", "type", "color", "createdAt", "instanceId", "reference"])
    && typeof value.manufacturer === "string"
    && typeof value.partNumber === "string"
    && hasFiniteNumbers(value, ["width", "height", "maxHeight", "x", "y"])
    && isFiniteNumber(value.rotation)
    && isPositiveFiniteNumber(value.width) && isPositiveFiniteNumber(value.height) && isPositiveFiniteNumber(value.maxHeight)
    && value.rotation >= 0 && value.rotation < 360
    && (value.source === "built-in" || value.source === "custom" || value.source === "bom")
    && (value.layer === "top" || value.layer === "bottom")
    && typeof value.locked === "boolean"
    && (value.modelAssetId === undefined || isNonEmptyString(value.modelAssetId));
}

function validateKeepout(value: unknown): value is RecordValue {
  if (!isRecord(value)) return false;
  return hasStrings(value, ["id", "name", "color"])
    && hasFiniteNumbers(value, ["x", "y", "width", "height"])
    && isPositiveFiniteNumber(value.width) && isPositiveFiniteNumber(value.height);
}

function validateMeasurement(value: unknown): value is RecordValue {
  return isRecord(value)
    && hasStrings(value, ["id", "color"])
    && hasFiniteNumbers(value, ["x1", "y1", "x2", "y2"]);
}

function parseInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  return JSON.parse(input) as unknown;
}

export function parseProjectJson(input: unknown): ParseResult<PcbProject> {
  let value: unknown;
  try {
    value = parseInput(input);
  } catch {
    return { ok: false, error: "Project JSON is invalid." };
  }

  if (!isRecord(value)) return { ok: false, error: "Project must be an object." };
  if (value.schemaVersion !== 1) return { ok: false, error: "Unsupported schema version." };
  if (!hasStrings(value, ["id", "name", "createdAt", "updatedAt"]) || typeof value.description !== "string") {
    return { ok: false, error: "Project contains required strings that are missing." };
  }
  if (value.createdBy !== undefined && !isNonEmptyString(value.createdBy)) return { ok: false, error: "createdBy must be a string." };
  if (value.status !== "draft" && value.status !== "review" && value.status !== "approved") return { ok: false, error: "Project status is invalid." };
  if (!isValidBoard(value.board)) return { ok: false, error: "Board is invalid." };
  if (!Array.isArray(value.components) || !Array.isArray(value.keepouts) || !Array.isArray(value.measurements)) {
    return { ok: false, error: "Project collections must be arrays." };
  }
  if (!value.components.every(validateComponent) || !uniqueIds(value.components, "instanceId")) return { ok: false, error: "Components are invalid." };
  if (!value.keepouts.every(validateKeepout) || !uniqueIds(value.keepouts, "id")) return { ok: false, error: "Keepouts are invalid." };
  if (!value.measurements.every(validateMeasurement) || !uniqueIds(value.measurements, "id")) return { ok: false, error: "Measurements are invalid." };

  return { ok: true, value: structuredClone(value) as unknown as PcbProject };
}
