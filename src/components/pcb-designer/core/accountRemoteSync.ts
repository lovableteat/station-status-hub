import type { PcbSaveState } from "../types.ts";
import { isPcbSaveState, refreshBuiltInCatalog } from "./storage.ts";
import type { PcbRemoteClient } from "./remoteSync.ts";

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
    name: "load_pcb_designer_workspace" | "save_pcb_designer_workspace",
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
 * while retaining the current account's templates, library and active project.
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

  for (const { state } of snapshots) {
    for (const project of state.projects) {
      if (deletedProjects.has(project.id)) continue;
      const current = projectMap.get(project.id);
      if (!current || revision(project.updatedAt) > revision(current.updatedAt)) {
        projectMap.set(project.id, structuredClone(project));
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
): PcbRemoteClient {
  return {
    load: async () => {
      const primary = await database.rpc("load_pcb_designer_workspace", {
        p_user_id: userId,
      });
      if (!primary.error) {
        const state = parseRemoteState(primary.data);
        if (state) return state;
      }

      const sharedFallback = await database
        .from("system_users")
        .select("id,permissions");
      if (!sharedFallback.error && sharedFallback.data) {
        return mergePcbFallbackWorkspaces(sharedFallback.data, userId);
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
      const primary = await database.rpc("save_pcb_designer_workspace", {
        p_user_id: userId,
        p_payload: state,
      });
      if (!primary.error) return true;

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
  };
}

export function isDatabaseUserId(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
