import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
}

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
export function usePcbPersistence({ state, storage, remoteClient }: UsePcbPersistenceOptions): PcbPersistenceStatus {
  const repository = useMemo(() => new PcbLocalRepository(storage ?? browserStorage()), [storage]);
  const defaultClient = supabase as unknown as PcbRemoteClient;
  const client = remoteClient === undefined ? defaultClient : remoteClient;
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
    setStatus("saving");
    const coordinator = coordinatorRef.current;
    const generation = coordinator?.reserve();
    const localTimer = window.setTimeout(() => {
      repository.save(state);
      setStatus("local");
    }, 300);
    const remoteTimer = window.setTimeout(() => {
      if (coordinator && generation !== undefined) coordinator.commit(generation, state);
    }, 900);

    return () => {
      window.clearTimeout(localTimer);
      window.clearTimeout(remoteTimer);
    };
  }, [client, repository, state]);

  return status;
}
