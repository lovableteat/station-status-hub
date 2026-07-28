import { useEffect, useMemo, useRef, useState } from "react";
import {
  PcbRemoteSyncCoordinator,
  syncPcbRemote,
  type PcbPersistenceStatus,
  type PcbRemoteClient,
} from "../core/remoteSync.ts";
import { PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import type { PcbSaveState } from "../types.ts";

export type { PcbPersistenceStatus, PcbRemoteClient } from "../core/remoteSync.ts";

export interface UsePcbPersistenceOptions {
  state: PcbSaveState;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
  allowRemoteSync?: boolean;
}

export const PCB_LOCAL_SAVE_DELAY_MS = 900;
export const PCB_REMOTE_SAVE_DELAY_MS = 2400;

const localOnlyStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
};

function browserStorage(): StorageLike {
  if (typeof window === "undefined") return localOnlyStorage;
  try {
    return window.localStorage;
  } catch {
    return localOnlyStorage;
  }
}

/** Persists editor state locally first; unavailable Supabase remains a non-fatal local draft. */
export function usePcbPersistence({
  state,
  storage,
  remoteClient,
  allowRemoteSync = false,
}: UsePcbPersistenceOptions): PcbPersistenceStatus {
  const repository = useMemo(() => new PcbLocalRepository(storage ?? browserStorage()), [storage]);
  const client = allowRemoteSync ? remoteClient ?? null : null;
  const stateRef = useRef(state);
  const repositoryRef = useRef(repository);
  const coordinatorRef = useRef<PcbRemoteSyncCoordinator | null>(null);
  const [status, setStatus] = useState<PcbPersistenceStatus>("local");

  stateRef.current = state;
  repositoryRef.current = repository;

  useEffect(() => {
    const persistBeforeUnload = () => {
      repositoryRef.current.save(stateRef.current);
    };
    window.addEventListener("beforeunload", persistBeforeUnload);
    return () => window.removeEventListener("beforeunload", persistBeforeUnload);
  }, []);

  useEffect(() => {
    const coordinator = new PcbRemoteSyncCoordinator(
      (next) => client ? syncPcbRemote(client, next) : Promise.resolve(false),
      setStatus,
    );
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, [client]);

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    const generation = coordinator?.reserve();
    const localTimer = window.setTimeout(() => {
      repository.save(state);
      if (!client) setStatus("local");
    }, PCB_LOCAL_SAVE_DELAY_MS);
    const remoteTimer = client
      ? window.setTimeout(() => {
        if (coordinator && generation !== undefined) {
          setStatus("saving");
          coordinator.commit(generation, state);
        }
      }, PCB_REMOTE_SAVE_DELAY_MS)
      : null;

    return () => {
      window.clearTimeout(localTimer);
      if (remoteTimer !== null) window.clearTimeout(remoteTimer);
    };
  }, [client, repository, state]);

  return status;
}
