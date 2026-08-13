import type { PcbSaveState } from "../types.ts";
import { isPcbSaveState, refreshBuiltInCatalog } from "./storage.ts";
import type { PcbRemoteClient } from "./remoteSync.ts";

type DatabaseError = { code?: string; message?: string } | null;
type DatabaseResult<T> = Promise<{ data: T; error: DatabaseError }>;

interface SystemUserRecord {
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
  select: (columns: "permissions") => SystemUserFilter;
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

/**
 * Uses the dedicated RPC when the migration is available. The RPC combines the
 * site-wide shared project catalog with this account's templates and library.
 * The permissions JSON fallback remains for installations that have not yet
 * applied the workspace migrations.
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

      const fallback = await database
        .from("system_users")
        .select("permissions")
        .eq("id", userId)
        .maybeSingle();
      if (fallback.error || !fallback.data) return null;
      return parseRemoteState(
        asRecord(fallback.data.permissions)[PCB_REMOTE_FALLBACK_KEY],
      );
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
