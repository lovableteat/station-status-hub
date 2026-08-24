import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  syncPcbRemote,
  type PcbPersistenceStatus,
  type PcbRemoteClient,
} from "../core/remoteSync.ts";
import { PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import type { PcbSaveState } from "../types.ts";

export type { PcbPersistenceStatus, PcbRemoteClient } from "../core/remoteSync.ts";

export interface PcbEditorIdentity {
  userId: string;
  username: string;
  displayName: string;
}

export interface UsePcbPersistenceOptions {
  state: PcbSaveState;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
  allowRemoteSync?: boolean;
  editor?: PcbEditorIdentity | null;
}

export interface PcbPersistenceControl {
  hasUnsavedChanges: boolean;
  markClean: (revision?: string) => void;
  saveNow: () => Promise<boolean>;
  status: PcbPersistenceStatus;
  lastSavedEditor: string | null;
  lastSavedProjectId: string | null;
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
  editor,
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
  const [lastSavedEditor, setLastSavedEditor] = useState<string | null>(null);
  const [lastSavedProjectId, setLastSavedProjectId] = useState<string | null>(null);

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
    const editorLabel = editor?.displayName?.trim() || editor?.username?.trim() || null;
    const activeProjectId = snapshot.activeProjectId;
    if (editorLabel && activeProjectId) {
      snapshot.projects = snapshot.projects.map((project) => project.id === activeProjectId
        ? {
          ...project,
          lastEditedBy: editorLabel,
          lastEditedById: editor.userId,
        }
        : project);
    }
    // Keep a local recovery copy immediately, but only mark the document clean
    // after the shared cloud write confirms success.
    repositoryRef.current.save(snapshot);

    if (!client) {
      setSavedRevision(snapshot.updatedAt);
      setLastSavedEditor(editorLabel);
      setLastSavedProjectId(activeProjectId);
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
      if (saved) {
        setSavedRevision(snapshot.updatedAt);
        setLastSavedEditor(editorLabel);
        setLastSavedProjectId(activeProjectId);
        setStatus("synced");
      } else {
        setStatus("unsaved");
      }
    }
    return saved;
  }, [client, editor]);

  return {
    hasUnsavedChanges,
    markClean,
    saveNow,
    status: status === "saving" ? "saving" : hasUnsavedChanges ? "unsaved" : status,
    lastSavedEditor,
    lastSavedProjectId,
  };
}
