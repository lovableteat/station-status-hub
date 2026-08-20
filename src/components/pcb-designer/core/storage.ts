import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../defaults.ts";
import type { PcbProject, PcbSaveState } from "../types.ts";
import { normalizePcbSaveState, parseProjectJson } from "./validation.ts";

export const PCB_STORAGE_KEY = "work-platform:pcb-designer:v1";
const PAYLOAD_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface PersistedPayload {
  version: typeof PAYLOAD_VERSION;
  state: PcbSaveState;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function timestamp(): string {
  return new Date().toISOString();
}

function createSeedState(): PcbSaveState {
  const project = createBlankProject();
  return {
    projects: [project],
    templates: clone(BUILT_IN_TEMPLATES),
    library: clone(BUILT_IN_COMPONENTS),
    activeProjectId: project.id,
    modelAssets: {},
    pendingPlacementsByProject: {},
    remoteDeletions: { projects: [], templates: [], library: [] },
    updatedAt: timestamp(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isModelAssetMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["id", "fileName", "createdAt", "updatedAt"].every((field) => isNonEmptyString(value[field]));
}

function isModelAssetsIndex(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isModelAssetMetadata);
}

function hasUniqueIds(values: Record<string, unknown>[]): boolean {
  const ids = values.map((value) => value.id);
  return ids.every(isNonEmptyString) && new Set(ids).size === ids.length;
}

function isTemplate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isNonEmptyString(value.category)
    && typeof value.description === "string"
    && typeof value.isBuiltIn === "boolean"
    && isNonEmptyString(value.createdAt)
    && isNonEmptyString(value.updatedAt)
    && parseProjectJson(value.project).ok;
}

function isLibraryComponent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["id", "name", "type", "color", "createdAt"].every(
    (field) => isNonEmptyString(value[field]),
  )
    && typeof value.manufacturer === "string"
    && typeof value.partNumber === "string"
    && isPositiveFiniteNumber(value.width)
    && isPositiveFiniteNumber(value.height)
    && isPositiveFiniteNumber(value.maxHeight)
    && (value.source === "built-in" || value.source === "custom" || value.source === "bom")
    && (value.shape === undefined || value.shape === "rectangle" || value.shape === "circle");
}

function isPendingPlacement(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ["name", "type", "manufacturer", "partNumber", "color", "reference"].every(
    (field) => typeof value[field] === "string",
  )
    && isPositiveFiniteNumber(value.width)
    && isPositiveFiniteNumber(value.height)
    && isPositiveFiniteNumber(value.maxHeight)
    && isPositiveFiniteNumber(value.quantity)
    && Number.isInteger(value.quantity);
}

export function isPcbSaveState(value: unknown): value is PcbSaveState {
  if (!isRecord(value)) return false;
  const { projects, templates, library, activeProjectId, updatedAt, modelAssets } = value;
  if (!Array.isArray(projects) || !Array.isArray(templates) || !Array.isArray(library) || !isNonEmptyString(updatedAt)) {
    return false;
  }
  if (!projects.every((project) => parseProjectJson(project).ok) || !templates.every(isTemplate) || !library.every(isLibraryComponent)) {
    return false;
  }
  const projectRecords = projects as Record<string, unknown>[];
  const templateRecords = templates as Record<string, unknown>[];
  const libraryRecords = library as Record<string, unknown>[];
  const pending = value.pendingPlacementsByProject;
  const pendingIsValid = pending === undefined || (
    isRecord(pending)
    && Object.entries(pending).every(([projectId, placements]) =>
      projectRecords.some((project) => project.id === projectId)
      && Array.isArray(placements)
      && placements.every(isPendingPlacement))
  );
  const deletions = value.remoteDeletions;
  const deletionsAreValid = deletions === undefined || (
    isRecord(deletions)
    && ["projects", "templates", "library"].every((key) =>
      Array.isArray(deletions[key])
      && (deletions[key] as unknown[]).every(isNonEmptyString))
  );
  const modelAssetsAreValid = modelAssets === undefined || isModelAssetsIndex(modelAssets);
  return hasUniqueIds(projectRecords)
    && hasUniqueIds(templateRecords)
    && hasUniqueIds(libraryRecords)
    && pendingIsValid
    && deletionsAreValid
    && modelAssetsAreValid
    && (activeProjectId === null || (isNonEmptyString(activeProjectId) && projectRecords.some((project) => project.id === activeProjectId)));
}

export function refreshBuiltInCatalog(state: PcbSaveState): PcbSaveState {
  const builtInTemplateIds = new Set(BUILT_IN_TEMPLATES.map((item) => item.id));
  const builtInComponentIds = new Set(BUILT_IN_COMPONENTS.map((item) => item.id));
  return {
    ...clone(state),
    templates: [
      ...clone(BUILT_IN_TEMPLATES),
      ...state.templates
        .filter((item) => !item.isBuiltIn && !builtInTemplateIds.has(item.id))
        .map(clone),
    ],
    library: [
      ...clone(BUILT_IN_COMPONENTS),
      ...state.library
        .filter((item) => item.source !== "built-in" && !builtInComponentIds.has(item.id))
        .map(clone),
    ],
  };
}

export class PcbLocalRepository {
  private readonly storage: StorageLike;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  load(): PcbSaveState {
    try {
      const raw = this.storage.getItem(PCB_STORAGE_KEY);
      if (!raw) return this.seed();
      const payload = JSON.parse(raw) as Partial<PersistedPayload>;
      if (payload.version === PAYLOAD_VERSION && isPcbSaveState(payload.state)) {
        return normalizePcbSaveState(refreshBuiltInCatalog({
          ...clone(payload.state),
          pendingPlacementsByProject: clone(payload.state.pendingPlacementsByProject ?? {}),
          remoteDeletions: clone(payload.state.remoteDeletions ?? {
            projects: [], templates: [], library: [],
          }),
        }));
      }
    } catch {
      // A broken browser draft must never prevent the editor from rendering.
    }
    return this.seed();
  }

  save(state: PcbSaveState): PcbSaveState {
    const next = normalizePcbSaveState({ ...clone(state), updatedAt: timestamp() });
    try {
      this.storage.setItem(PCB_STORAGE_KEY, JSON.stringify({ version: PAYLOAD_VERSION, state: next }));
    } catch {
      // localStorage can be unavailable (private browsing/quota); retain in-memory state.
    }
    return next;
  }

  upsertProject(state: PcbSaveState, project: PcbProject): PcbSaveState {
    const replacement = clone(project);
    const exists = state.projects.some((item) => item.id === replacement.id);
    return {
      ...clone(state),
      projects: exists
        ? state.projects.map((item) => item.id === replacement.id ? replacement : clone(item))
        : [...state.projects.map(clone), replacement],
      updatedAt: timestamp(),
    };
  }

  deleteProject(state: PcbSaveState, projectId: string): PcbSaveState {
    const projects = state.projects.filter((project) => project.id !== projectId).map(clone);
    const activeProjectId = state.activeProjectId === projectId
      ? (projects[0]?.id ?? null)
      : state.activeProjectId;
    const pendingPlacementsByProject = clone(state.pendingPlacementsByProject ?? {});
    delete pendingPlacementsByProject[projectId];
    return {
      ...clone(state),
      projects,
      activeProjectId,
      pendingPlacementsByProject,
      remoteDeletions: {
        projects: [...new Set([...(state.remoteDeletions?.projects ?? []), projectId])],
        templates: clone(state.remoteDeletions?.templates ?? []),
        library: clone(state.remoteDeletions?.library ?? []),
      },
      updatedAt: timestamp(),
    };
  }

  setActiveProjectId(state: PcbSaveState, projectId: string | null): PcbSaveState {
    const activeProjectId = projectId && state.projects.some((project) => project.id === projectId)
      ? projectId
      : null;
    return { ...clone(state), activeProjectId, updatedAt: timestamp() };
  }

  private seed(): PcbSaveState {
    const state = createSeedState();
    return this.save(state);
  }
}
