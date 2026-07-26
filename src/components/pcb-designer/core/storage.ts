import { BUILT_IN_COMPONENTS, BUILT_IN_TEMPLATES, createBlankProject } from "../defaults.ts";
import type { PcbProject, PcbSaveState } from "../types.ts";

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
    updatedAt: timestamp(),
  };
}

function isState(value: unknown): value is PcbSaveState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PcbSaveState>;
  return Array.isArray(state.projects)
    && Array.isArray(state.templates)
    && Array.isArray(state.library)
    && typeof state.updatedAt === "string"
    && (typeof state.activeProjectId === "string" || state.activeProjectId === null);
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
      if (payload.version === PAYLOAD_VERSION && isState(payload.state)) return clone(payload.state);
    } catch {
      // A broken browser draft must never prevent the editor from rendering.
    }
    return this.seed();
  }

  save(state: PcbSaveState): PcbSaveState {
    const next = { ...clone(state), updatedAt: timestamp() };
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
    return { ...clone(state), projects, activeProjectId, updatedAt: timestamp() };
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
