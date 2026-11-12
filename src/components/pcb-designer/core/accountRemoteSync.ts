import { parsePcbLegacyWorkspace } from "./legacyWorkspace.ts";
import { guardPcbRemoteClient, throwIfPcbAuthorizationError, type PcbSessionSource } from "./remoteAccess.ts";
import type { PcbSaveState } from "../types.ts";
import { isPcbSaveState, refreshBuiltInCatalog } from "./storage.ts";
import {
  deserializePcbModelAsset,
  isPcbModelAssetMetadata,
  serializePcbModelAsset,
} from "./modelAssets.ts";
import type { PcbModelAsset, PcbModelAssetMetadata } from "../types.ts";
import type {
  PcbProjectLock,
  PcbProjectLockResult,
  PcbRemoteClient,
  PcbRemoteLoadResult,
} from "./remoteSync.ts";

type DatabaseError = { code?: string; message?: string; status?: number } | null;
type DatabaseResult<T> = Promise<{ data: T; error: DatabaseError }>;

export interface PcbAccountDatabase {
  rpc: (
    name:
      | "load_pcb_designer_workspace_shared"
      | "save_pcb_designer_workspace_locked"
      | "load_pcb_designer_legacy_workspace"
      | "acquire_pcb_designer_project_lock"
      | "load_pcb_designer_project_lock"
      | "release_pcb_designer_project_lock"
      | "delete_pcb_designer_project_locked"
      | "save_pcb_designer_model_asset"
      | "load_pcb_designer_model_asset"
      | "list_pcb_designer_model_assets",
    args: Record<string, unknown>,
  ) => DatabaseResult<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseRemoteState(value: unknown): PcbSaveState | null {
  return isPcbSaveState(value) ? refreshBuiltInCatalog(value) : null;
}

function isMissingRpc(error: DatabaseError, rpcName: string): boolean {
  throwIfPcbAuthorizationError(error);
  // Match the requested entry point, not a missing helper invoked inside it.
  const message = error?.message ?? "";
  const target = new RegExp(`function\\s+(?:(?:"?(?:workspace|public)"?)\\.)?"?${rpcName}"?\\s*\\(`, "i");
  return target.test(message) && (
    (error?.code === "PGRST202" && /could not find the function/i.test(message))
    || (error?.code === "42883" && /does not exist/i.test(message))
  );
}

function readRemoteState(value: unknown): PcbSaveState | null {
  if (value === null) return null;
  const state = parseRemoteState(value);
  if (!state) throw new Error("Invalid PCB cloud workspace response");
  return state;
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

function parseCloudModel(value: unknown): { payloadBase64: string } | null {
  const payload = asRecord(value);
  return typeof payload.payloadBase64 === "string" && payload.payloadBase64
    ? { payloadBase64: payload.payloadBase64 }
    : null;
}

function parseCloudModelList(value: unknown): PcbModelAssetMetadata[] {
  return Array.isArray(value) ? value.filter(isPcbModelAssetMetadata) : [];
}

/** Modern cloud data is authoritative. Protected legacy recovery is read-only. */
export function createPcbAccountRemoteClient(
  database: PcbAccountDatabase,
  userId: string,
  clientId = `pcb-client-${userId}`,
  auth?: PcbSessionSource,
): PcbRemoteClient {
  const loadWithMetadata = async (): Promise<PcbRemoteLoadResult> => {
    const primary = await database.rpc("load_pcb_designer_workspace_shared", { p_user_id: userId });
    if (!primary.error) return { source: "modern", state: readRemoteState(primary.data) };
    if (!isMissingRpc(primary.error, "load_pcb_designer_workspace_shared")) throw primary.error;
    // Zero actor/owner parameters: the server derives both access and private ownership.
    const legacy = await database.rpc("load_pcb_designer_legacy_workspace", {});
    if (legacy.error) { throwIfPcbAuthorizationError(legacy.error); throw legacy.error; }
    return parsePcbLegacyWorkspace(legacy.data);
  };
  const client = guardPcbRemoteClient({
    loadWithMetadata,
    load: async () => (await loadWithMetadata()).state,
    save: async (state) => {
      const locked = await database.rpc("save_pcb_designer_workspace_locked", {
        p_user_id: userId,
        p_payload: state,
        p_project_id: state.activeProjectId,
        p_editor_client_id: clientId,
      });
      if (!locked.error) return true;
      // A lock rejection must never fall through to an unlocked legacy write.
      // Missing locked-save support also fails closed; recovery is not a write API.
      throwIfPcbAuthorizationError(locked.error);
      return false;
    },
    acquireProjectLock: async ({ projectId, projectName }) => {
      const result = await database.rpc("acquire_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
        p_project_name: projectName,
        p_editor_client_id: clientId,
        p_lease_seconds: 30,
      });
      if (result.error) throw result.error;
      return parseProjectLock(result.data)
        ?? { available: true, acquired: false, lock: null };
    },
    loadProjectLock: async (projectId) => {
      const result = await database.rpc("load_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
      });
      if (result.error) throw result.error;
      return parseProjectLock(result.data)
        ?? { available: true, acquired: false, lock: null };
    },
    releaseProjectLock: async (projectId) => {
      const result = await database.rpc("release_pcb_designer_project_lock", {
        p_user_id: userId,
        p_project_id: projectId,
        p_editor_client_id: clientId,
      });
      throwIfPcbAuthorizationError(result.error);
      return !result.error;
    },
    deleteProject: async (projectId) => {
      const result = await database.rpc("delete_pcb_designer_project_locked", {
        p_user_id: userId,
        p_project_id: projectId,
        p_editor_client_id: clientId,
      });
      throwIfPcbAuthorizationError(result.error);
      return !result.error && result.data === true;
    },
    saveModelAsset: async (asset: PcbModelAsset) => {
      try {
        const payloadBase64 = await serializePcbModelAsset(asset);
        const result = await database.rpc("save_pcb_designer_model_asset", {
          p_user_id: userId,
          p_asset_id: asset.metadata.id,
          p_metadata: asset.metadata,
          p_payload_base64: payloadBase64,
        });
        throwIfPcbAuthorizationError(result.error);
        return !result.error;
      } catch (error) {
        if (error instanceof Error && error.name === "PcbRemoteAccessError") throw error;
        return false;
      }
    },
    loadModelAsset: async (assetId: string) => {
      const result = await database.rpc("load_pcb_designer_model_asset", {
        p_user_id: userId,
        p_asset_id: assetId,
      });
      throwIfPcbAuthorizationError(result.error);
      if (result.error) return null;
      const cloud = parseCloudModel(result.data);
      if (!cloud) return null;
      try {
        return await deserializePcbModelAsset(cloud.payloadBase64);
      } catch {
        return null;
      }
    },
    listModelAssets: async () => {
      const result = await database.rpc("list_pcb_designer_model_assets", {
        p_user_id: userId,
      });
      throwIfPcbAuthorizationError(result.error);
      if (result.error) return [];
      return parseCloudModelList(result.data);
    },
  }, auth);
  // Keep the original load API while routing every caller through source/actor fencing.
  return { ...client, load: async () => (await client.loadWithMetadata!()).state };
}

export function isDatabaseUserId(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
