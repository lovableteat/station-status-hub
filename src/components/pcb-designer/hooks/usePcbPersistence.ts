import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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

export interface PcbPersistenceControl {
  hasUnsavedChanges: boolean;
  markClean: (revision?: string) => void;
  saveNow: () => Promise<boolean>;
  status: PcbPersistenceStatus;
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

/** Saves only on explicit user action; remote writes are serialized in click order. */
export function usePcbPersistence({
  state,
  storage,
  remoteClient,
  allowRemoteSync = false,
}: UsePcbPersistenceOptions): PcbPersistenceControl {
  const repository = useMemo(() => new PcbLocalRepository(storage ?? browserStorage()), [storage]);
  const client = allowRemoteSync ? remoteClient ?? null : null;
  const stateRef = useRef(state);
  const repositoryRef = useRef(repository);
  const activeRef = useRef(true);
  const requestRef = useRef(0);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const [savedRevision, setSavedRevision] = useState(state.updatedAt);
  const [status, setStatus] = useState<PcbPersistenceStatus>(client ? "synced" : "local");

  stateRef.current = state;
  repositoryRef.current = repository;
  const hasUnsavedChanges = state.updatedAt !== savedRevision;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    setStatus(client ? "synced" : "local");
  }, [client]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const markClean = useCallback((revision?: string) => {
    setSavedRevision(revision ?? stateRef.current.updatedAt);
  }, []);

  const saveNow = useCallback(async () => {
    const snapshot = structuredClone(stateRef.current);
    repositoryRef.current.save(snapshot);
    setSavedRevision(snapshot.updatedAt);

    if (!client) {
      setStatus("local");
      return true;
    }

    const request = requestRef.current + 1;
    requestRef.current = request;
    setStatus("saving");
    const remoteSave = saveQueueRef.current.then(
      () => syncPcbRemote(client, snapshot),
      () => syncPcbRemote(client, snapshot),
    );
    saveQueueRef.current = remoteSave;
    const saved = await remoteSave;
    if (activeRef.current && request === requestRef.current) {
      setStatus(saved ? "synced" : "local");
    }
    return saved;
  }, [client]);

  return {
    hasUnsavedChanges,
    markClean,
    saveNow,
    status: hasUnsavedChanges ? "unsaved" : status,
  };
}
