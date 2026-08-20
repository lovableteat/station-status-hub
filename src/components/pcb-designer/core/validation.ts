import type {
  PcbModelAssetMetadata,
  PcbBoard,
  PcbBoardLayerColors,
  PcbProject,
  PcbSaveState,
  PcbVisibleLayer,
} from "../types.ts";
import {
  DEFAULT_PCB_BOTTOM_LAYER_COLOR,
  DEFAULT_PCB_TOP_LAYER_COLOR,
} from "../defaults.ts";

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
  const layerColors = value.layerColors;
  const hasValidLayerColors = layerColors === undefined || (
    isRecord(layerColors)
    && isNonEmptyString(layerColors.top)
    && isNonEmptyString(layerColors.bottom)
  );
  const cuts = value.cuts;
  const hasValidCuts = cuts === undefined || (
    Array.isArray(cuts)
    && cuts.length <= 39
    && cuts.every((cut) => isRecord(cut)
      && isNonEmptyString(cut.id)
      && (cut.orientation === "vertical" || cut.orientation === "horizontal")
      && isFiniteNumber(cut.position)
      && cut.position > 0
      && ((cut.orientation === "vertical" && cut.position < Number(value.width))
        || (cut.orientation === "horizontal" && cut.position < Number(value.height))))
    && new Set(cuts.map((cut) => cut.id)).size === cuts.length
  );
  return isFiniteNumber(value.width) && value.width >= 20 && value.width <= 1000
    && isFiniteNumber(value.height) && value.height >= 20 && value.height <= 1000
    && isFiniteNumber(value.gridSize) && value.gridSize >= 0.1 && value.gridSize <= 50
    && typeof value.showGrid === "boolean"
    && typeof value.snapToGrid === "boolean"
    && isNonEmptyString(value.background)
    && hasValidLayerColors
    && hasValidCuts;
}

function normalizeBoardLayerColors(layerColors: unknown): PcbBoardLayerColors {
  const record = isRecord(layerColors) ? layerColors : {};
  return {
    top: isNonEmptyString(record.top) ? record.top : DEFAULT_PCB_TOP_LAYER_COLOR,
    bottom: isNonEmptyString(record.bottom) ? record.bottom : DEFAULT_PCB_BOTTOM_LAYER_COLOR,
  };
}

function normalizeBoard(board: PcbBoard | RecordValue): PcbBoard {
  const width = Number(board.width);
  const height = Number(board.height);
  const cuts = Array.isArray(board.cuts)
    ? board.cuts
      .filter((cut): cut is RecordValue => isRecord(cut))
      .map((cut, index) => ({
        id: isNonEmptyString(cut.id) ? cut.id : `cut-${index + 1}`,
        orientation: cut.orientation === "horizontal" ? "horizontal" as const : "vertical" as const,
        position: Number(cut.position),
      }))
      .filter((cut) => Number.isFinite(cut.position)
        && cut.position > 0
        && (cut.orientation === "vertical" ? cut.position < width : cut.position < height))
    : [];
  return {
    width,
    height,
    gridSize: Number(board.gridSize),
    showGrid: Boolean(board.showGrid),
    snapToGrid: Boolean(board.snapToGrid),
    background: isNonEmptyString(board.background) ? board.background : "#0f766e",
    layerColors: normalizeBoardLayerColors(board.layerColors),
    ...(Array.isArray(board.cuts) ? { cuts } : {}),
  };
}

export function normalizePcbSaveState(state: PcbSaveState): PcbSaveState {
  const cloned = structuredClone(state);
  const modelAssets = Object.fromEntries(
    Object.entries(cloned.modelAssets ?? {}).filter(([, asset]) => isModelAssetMetadata(asset)),
  ) as PcbSaveState["modelAssets"];
  const projects = cloned.projects.map((project) => ({
    ...project,
    board: normalizeBoard(project.board),
    components: project.components.map((component) => {
      const normalized = {
        ...component,
        shape: component.shape === "circle" ? "circle" as const : "rectangle" as const,
      };
      if (!component.modelAssetId || modelAssets?.[component.modelAssetId]) return normalized;
      const { modelAssetId: _removed, ...withoutAsset } = normalized;
      return withoutAsset;
    }),
    keepouts: project.keepouts.map((keepout) => ({
      ...keepout,
      rotation: Number.isFinite(keepout.rotation) ? ((keepout.rotation! % 360) + 360) % 360 : 0,
    })),
  }));
  const templates = cloned.templates.map((template) => ({
    ...template,
    project: {
      ...template.project,
      board: normalizeBoard(template.project.board),
    },
  }));
  return {
    ...cloned,
    projects,
    templates,
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
    && (value.shape === undefined || value.shape === "rectangle" || value.shape === "circle")
    && (value.layer === "top" || value.layer === "bottom")
    && typeof value.locked === "boolean"
    && (value.modelAssetId === undefined || isNonEmptyString(value.modelAssetId));
}

function validateKeepout(value: unknown): value is RecordValue {
  if (!isRecord(value)) return false;
  return hasStrings(value, ["id", "name", "color"])
    && hasFiniteNumbers(value, ["x", "y", "width", "height"])
    && isPositiveFiniteNumber(value.width) && isPositiveFiniteNumber(value.height)
    && (value.rotation === undefined || (isFiniteNumber(value.rotation) && value.rotation >= 0 && value.rotation < 360));
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

  return {
    ok: true,
    value: structuredClone({
      ...value,
      board: normalizeBoard(value.board),
    }) as unknown as PcbProject,
  };
}
