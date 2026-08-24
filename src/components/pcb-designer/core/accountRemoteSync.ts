import type { PcbSaveState } from "../types.ts";
import { isPcbSaveState, refreshBuiltInCatalog } from "./storage.ts";
import type {
  PcbProjectLock,
  PcbProjectLockResult,
  PcbRemoteClient,
} from "./remoteSync.ts";

type DatabaseError = { code?: string; message?: string } | null;
type DatabaseResult<T> = Promise<{ data: T; error: DatabaseError }>;

interface SystemUserRecord {
  id: string;
  permissions: unknown;
}

interface SystemUserQuery {
  maybeSingle: () => DatabaseResult<SystemUserRecord | null>;
}

interface SystemUserFilter {
  eq: (column: "id", value: string) => SystemUserQuery;
}

interface SystemUserUpdateFilter {
  eq: (column: "id", value: string) => DatabaseResult<unknown>;
}

interface SystemUserTable {
  select(columns: "permissions"): SystemUserFilter;
  select(columns: "id,permissions"): DatabaseResult<SystemUserRecord[]>;
  update: (values: { permissions: Record<string, unknown> }) => SystemUserUpdateFilter;
}

export interface PcbAccountDatabase {
  rpc: (
    name:
      | "load_pcb_designer_workspace_shared"
      | "save_pcb_designer_workspace_shared"
      | "save_pcb_designer_workspace_locked"
      | "load_pcb_designer_workspace"
      | "save_pcb_designer_workspace"
      | "acquire_pcb_designer_project_lock"
      | "load_pcb_designer_project_lock"
      | "release_pcb_designer_project_lock"
      | "delete_pcb_designer_project_locked",
    args: Record<string, unknown>,
  ) => DatabaseResult<unknown>;
  from: (table: "system_users") => SystemUserTable;
}

export const PCB_REMOTE_FALLBACK_KEY = "pcbDesignerWorkspace";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseRemoteState(value: unknown): PcbSaveState | null {
  return isPcbSaveState(value) ? refreshBuiltInCatalog(value) : null;
}

function isMissingRpc(error: DatabaseError): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST202"
    || message.includes("could not find the function")
    || message.includes("does not exist");
}

function parseProjectLock(value: unknown): PcbProjectLockResult | null {
  const payload = asRecord(value);
  if (typeof payload.available !== "boolean" || typeof payload.acquired !== "boolean") {
    return null;
  }
  const lockValue = payload.lock;
  if (lockValue === null || lockValue === undefined) {
    return { available: payload.available, acquired: payload.acquired, lock: null };
  }
  const lock = asRecord(lockValue);
  const required = [
    "projectId",
    "projectName",
    "editorUserId",
    "editorClientId",
    "editorUsername",
    "editorDisplayName",
    "heartbeatAt",
    "leaseExpiresAt",
  ] as const;
  if (!required.every((key) => typeof lock[key] === "string")) return null;
  return {
    available: payload.available,
    acquired: payload.acquired,
    lock: lock as unknown as PcbProjectLock,
  };
}

const LEGACY_LOCK_RESULT: PcbProjectLockResult = {
  available: false,
  acquired: true,
  lock: null,
};

function revision(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function stateFromPermissions(permissions: unknown): PcbSaveState | null {
  return parseRemoteState(asRecord(permissions)[PCB_REMOTE_FALLBACK_KEY]);
}

/**
 * Older deployments store one workspace snapshot in each account's permission
 * document. Treat those snapshots as replicas of one team project catalog,
 * while retaining the current account's templates and active project. Custom
 * library records are merged here too for older installations without the
 * shared-library RPC migration.
 */
export function mergePcbFallbackWorkspaces(
  records: SystemUserRecord[],
  userId: string,
): PcbSaveState | null {
  const snapshots = records
    .map((record) => ({ id: record.id, state: stateFromPermissions(record.permissions) }))
    .filter((entry): entry is { id: string; state: PcbSaveState } => Boolean(entry.state));
  if (!snapshots.length) return null;

  const ownState = snapshots.find((entry) => entry.id === userId)?.state;
  const accountState = structuredClone(ownState ?? {
    ...snapshots[0].state,
    templates: [],
    library: [],
    modelAssets: {},
    pendingPlacementsByProject: {},
    remoteDeletions: { projects: [], templates: [], library: [] },
  });
  const deletedProjects = new Set(
    snapshots.flatMap(({ state }) => state.remoteDeletions?.projects ?? []),
  );
  const projectMap = new Map<string, PcbSaveState["projects"][number]>();
  const libraryMap = new Map<string, {
    component: PcbSaveState["library"][number];
    updatedAt: string;
  }>();
  const deletedLibrary = new Set(
    snapshots.flatMap(({ state }) => state.remoteDeletions?.library ?? []),
  );

  for (const { state } of snapshots) {
    for (const project of state.projects) {
      if (deletedProjects.has(project.id)) continue;
      const current = projectMap.get(project.id);
      if (!current || revision(project.updatedAt) > revision(current.updatedAt)) {
        projectMap.set(project.id, structuredClone(project));
      }
    }
    for (const component of state.library) {
      if (component.source === "built-in" || deletedLibrary.has(component.id)) continue;
      const current = libraryMap.get(component.id);
      if (!current || revision(state.updatedAt) >= revision(current.updatedAt)) {
        libraryMap.set(component.id, {
          component: structuredClone(component),
          updatedAt: state.updatedAt,
        });
      }
    }
  }

  const projects = [...projectMap.values()].sort((left, right) =>
    revision(right.updatedAt) - revision(left.updatedAt) || left.id.localeCompare(right.id));
  const projectIds = new Set(projects.map((project) => project.id));
  const activeProjectId = accountState.activeProjectId
    && projectIds.has(accountState.activeProjectId)
    ? accountState.activeProjectId
    : projects[0]?.id ?? null;
  const updatedAt = snapshots.reduce(
    (latest, entry) => revision(entry.state.updatedAt) > revision(latest)
      ? entry.state.updatedAt
      : latest,
    accountState.updatedAt,
  );
  const pendingPlacementsByProject = Object.fromEntries(
    Object.entries(accountState.pendingPlacementsByProject ?? {})
      .filter(([projectId]) => projectIds.has(projectId)),
  );

  return refreshBuiltInCatalog({
    ...accountState,
    projects,
    library: [...libraryMap.values()]
      .map(({ component }) => component)
      .sort((left, right) => left.name.localeCompare(right.name)),
    activeProjectId,
    pendingPlacementsByProject,
    remoteDeletions: {
      projects: [...deletedProjects].sort(),
      templates: [...new Set(accountState.remoteDeletions?.templates ?? [])],
      library: [...new Set(accountState.remoteDeletions?.library ?? [])],
    },
    updatedAt,
  });
}

/**
 * Uses the dedicated RPC when the migration is available. The RPC combines the
 * site-wide shared project catalog with this account's templates and library.
 * The permissions JSON fallback remains for installations that have not yet
 * applied the workspace migrations. That fallback merges every account's
 * snapshot so projects are still shared site-wide.
 */
export function createPcbAccountRemoteClient(
  database: PcbAccountDatabase,
  userId: string,
  clientId = `pcb-client-${userId}`,
): PcbRemoteClient {
  return {
    load: async () => {
      const primary = await database.rpc("load_pcb_designer_workspace_shared", {
        p_user_id: userId,
      });
      if (!primary.error) {
        const state = parseRemoteState(primary.data);
        if (state) return state;
      }

      const legacy = await database.rpc("load_pcb_designer_workspace", {
        p_user_id: userId,
      });
      const sharedFallback = await database
        .from("system_users")
        .select("id,permissions");
      const fallbackState = !sharedFallback.error && sharedFallback.data
        ? mergePcbFallbackWorkspaces(sharedFallback.data, userId)
        : null;
      if (!legacy.error) {
        const state = parseRemoteState(legacy.data);
        if (state) {
          if (!fallbackState) return state;
          return refreshBuiltInCatalog({
            ...state,
            library: fallbackState.library,
            remoteDeletions: {
              ...state.remoteDeletions,
              library: [...new Set([
                ...(state.remoteDeletions?.library ?? []),
                ...(fallbackState.remoteDeletions?.library ?? []),
              ])],
            },
          });
        }
      }
      if (!sharedFallback.error && sharedFallback.data) {
        return fallbackState;
      }

      const ownFallback = await database
        .from("system_users")
        .select("permissions")
        .eq("id", userId)
        .maybeSingle();
      if (ownFallback.error || !ownFallback.data) return null;
      return stateFromPermissions(ownFallback.data.permissions);
    },
    save: async (state) => {
      const locked = await database.rpc("save_pcb_designer_workspace_locked", {
        p_user_id: userId,
        p_payload: state,
        p_project_id: state.activeProjectId,
        p_editor_client_id: clientId,
      });
      if (!locked.error) return true;
      // A lock rejection must never fall through to an unlocked legacy write.
      if (!isMissingRpc(locked.error)) return false;

      const primary = await database.rpc("save_pcb_designer_workspace_shared", {
        p_user_id: userId,
        p_payload: state,
      });
      if (!primary.error) return true;

      const legacy = await database.rpc("save_pcb_designer_workspace", {
        p_user_id: userId,
        p_payload: state,
      });
      if (!legacy.error) return true;

      const table = database.from("system_users");
      const current = await table
        .select("permissions")
        .eq("id", userId)
        .maybeSingle();
      if (current.error || !current.data) return false;

      const permissions = asRecord(current.data.permissions);
      permissions[PCB_REMOTE_FALLBACK_KEY] = structuredClone(state);
      const updated = await table.update({ permissions }).eq("id", userId);
      return !updated.error;
    },
    acquireProjectLock: async ({ projectId, projectName }) => {
      const result = await database.rpc("acquire_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
        p_project_name: projectName,
        p_editor_client_id: clientId,
        p_lease_seconds: 30,
      });
      if (isMissingRpc(result.error)) return LEGACY_LOCK_RESULT;
      if (result.error) return { available: true, acquired: false, lock: null };
      return parseProjectLock(result.data)
        ?? { available: true, acquired: false, lock: null };
    },
    loadProjectLock: async (projectId) => {
      const result = await database.rpc("load_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
      });
      if (isMissingRpc(result.error)) return LEGACY_LOCK_RESULT;
      if (result.error) return { available: true, acquired: false, lock: null };
      return parseProjectLock(result.data)
        ?? { available: true, acquired: false, lock: null };
    },
    releaseProjectLock: async (projectId) => {
      const result = await database.rpc("release_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
        p_editor_client_id: clientId,
      });
      return isMissingRpc(result.error) || !result.error;
    },
    deleteProject: async (projectId) => {
      const result = await database.rpc("delete_pcb_designer_project_locked", {
        p_user_id: userId,
        p_project_id: projectId,
        p_editor_client_id: clientId,
      });
      return !result.error && result.data === true;
    },
  };
}

export function isDatabaseUserId(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
