import type { PcbSaveState } from "../types.ts";
import { createBlankProject } from "../defaults.ts";

export type PcbPersistenceStatus = "local" | "saving" | "synced" | "unsaved";
export interface PcbProjectLock {
  projectId: string;
  projectName: string;
  editorUserId: string;
  editorClientId: string;
  editorUsername: string;
  editorDisplayName: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
}

export interface PcbProjectLockResult {
  available: boolean;
  acquired: boolean;
  lock: PcbProjectLock | null;
}

export interface PcbProjectLockRequest {
  projectId: string;
  projectName: string;
}

type RemoteError = { code?: string; message?: string } | null;
type RemoteTable = {
  upsert: (
    rows: unknown[],
    options: { onConflict: string; defaultToNull: boolean },
  ) => Promise<{ error: RemoteError }>;
  delete: () => {
    in: (column: "id", ids: string[]) => Promise<{ error: RemoteError }>;
  };
};

export interface PcbRemoteClient {
  load?: () => Promise<PcbSaveState | null>;
  save?: (state: PcbSaveState) => Promise<boolean>;
  acquireProjectLock?: (input: PcbProjectLockRequest) => Promise<PcbProjectLockResult>;
  loadProjectLock?: (projectId: string) => Promise<PcbProjectLockResult>;
  releaseProjectLock?: (projectId: string) => Promise<boolean>;
  deleteProject?: (projectId: string) => Promise<boolean>;
  from?: (table: "pcb_designer_projects" | "pcb_designer_templates" | "pcb_designer_library") => RemoteTable;
}

function revision(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isBlankSeedWorkspace(state: PcbSaveState): boolean {
  const project = state.projects[0];
  const defaultProjectName = createBlankProject().name;
  const pendingCount = Object.values(state.pendingPlacementsByProject ?? {})
    .reduce((total, items) => total + items.length, 0);

  return state.projects.length === 1
    && project?.name === defaultProjectName
    && project.components.length === 0
    && project.keepouts.length === 0
    && project.measurements.length === 0
    && state.templates.every((template) => template.isBuiltIn)
    && state.library.every((component) => component.source === "built-in")
    && pendingCount === 0;
}

/**
 * Shared projects are merged per project revision. Account-specific templates,
 * library items and active selection continue to follow the newest account
 * snapshot, while server tombstones always remove stale local project copies.
 */
export function mergePcbRemoteState(
  localState: PcbSaveState,
  remoteState: PcbSaveState,
): PcbSaveState {
  const localIsSeed = isBlankSeedWorkspace(localState);
  const remoteDeleted = new Set(remoteState.remoteDeletions?.projects ?? []);
  const localDeleted = new Set(localState.remoteDeletions?.projects ?? []);
  const deletedProjects = new Set([...remoteDeleted, ...localDeleted]);
  const projects = new Map(
    remoteState.projects
      .filter((project) => !deletedProjects.has(project.id))
      .map((project) => [project.id, structuredClone(project)]),
  );

  if (!localIsSeed || remoteState.projects.length === 0) {
    for (const project of localState.projects) {
      if (deletedProjects.has(project.id)) continue;
      const remoteProject = projects.get(project.id);
      if (!remoteProject || revision(project.updatedAt) > revision(remoteProject.updatedAt)) {
        projects.set(project.id, structuredClone(project));
      }
    }
  }

  const preferRemoteAccountState = localIsSeed
    || revision(remoteState.updatedAt) >= revision(localState.updatedAt);
  const accountState = preferRemoteAccountState ? remoteState : localState;
  const mergedProjects = [...projects.values()];
  // A local project selection is a view preference, not shared document content.
  // Keep it during background reconciliation so another tab/device cannot pull
  // the editor back to an older project while the user is working.
  const preferredActiveProjectId = !localIsSeed && localState.activeProjectId
    && projects.has(localState.activeProjectId)
    ? localState.activeProjectId
    : accountState.activeProjectId;
  const activeProjectId = preferredActiveProjectId
    && projects.has(preferredActiveProjectId)
    ? preferredActiveProjectId
    : mergedProjects[0]?.id ?? null;

  return {
    ...structuredClone(accountState),
    projects: mergedProjects,
    activeProjectId,
    remoteDeletions: {
      projects: [...deletedProjects],
      templates: [...new Set(accountState.remoteDeletions?.templates ?? [])],
      library: [...new Set(accountState.remoteDeletions?.library ?? [])],
    },
    updatedAt: revision(remoteState.updatedAt) >= revision(localState.updatedAt)
      ? remoteState.updatedAt
      : localState.updatedAt,
  };
}

async function reconcileTable(
  client: PcbRemoteClient,
  tableName: Parameters<PcbRemoteClient["from"]>[0],
  rows: Array<{ id: string; payload: unknown }>,
  deletedIds: string[],
): Promise<boolean> {
  if (!client.from) return false;
  const table = client.from(tableName);
  const upsert = await table.upsert(rows, {
    onConflict: "owner_id,id",
    defaultToNull: false,
  });
  if (upsert.error) return false;
  if (!deletedIds.length) return true;
  const removed = await table.delete().in("id", deletedIds);
  return !removed.error;
}

export async function syncPcbRemote(client: PcbRemoteClient, state: PcbSaveState): Promise<boolean> {
  try {
    if (client.save) return client.save(state);
    const results = await Promise.all([
      reconcileTable(client, "pcb_designer_projects", state.projects.map((project) => ({ id: project.id, payload: project })), state.remoteDeletions?.projects ?? []),
      reconcileTable(client, "pcb_designer_templates", state.templates.map((template) => ({ id: template.id, payload: template })), state.remoteDeletions?.templates ?? []),
      reconcileTable(client, "pcb_designer_library", state.library.map((component) => ({ id: component.id, payload: component })), state.remoteDeletions?.library ?? []),
    ]);
    return results.every(Boolean);
  } catch {
    return false;
  }
}

export async function loadPcbRemote(client: PcbRemoteClient): Promise<PcbSaveState | null> {
  try {
    return client.load ? await client.load() : null;
  } catch {
    return null;
  }
}

type Sync = (state: PcbSaveState) => Promise<boolean>;
type StatusListener = (status: Extract<PcbPersistenceStatus, "local" | "synced">) => void;

/** Runs remote saves in order; obsolete queued/stale completions never publish a status. */
export class PcbRemoteSyncCoordinator {
  private generation = 0;
  private active = true;
  private queue: Promise<void> = Promise.resolve();
  private readonly sync: Sync;
  private readonly onStatus: StatusListener;

  constructor(sync: Sync, onStatus: StatusListener) {
    this.sync = sync;
    this.onStatus = onStatus;
  }

  reserve(): number {
    this.generation += 1;
    return this.generation;
  }

  commit(generation: number, state: PcbSaveState): void {
    this.queue = this.queue.then(async () => {
      if (!this.active || generation !== this.generation) return;
      const saved = await this.sync(state);
      if (this.active && generation === this.generation) this.onStatus(saved ? "synced" : "local");
    });
  }

  schedule(state: PcbSaveState): void {
    this.commit(this.reserve(), state);
  }

  dispose(): void {
    this.active = false;
    this.generation += 1;
  }

  flush(): Promise<void> {
    return this.queue;
  }
}
