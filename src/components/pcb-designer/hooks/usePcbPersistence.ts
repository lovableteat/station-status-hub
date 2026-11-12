import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  syncPcbRemote,
  type PcbPersistenceStatus,
  type PcbRemoteClient,
} from "../core/remoteSync.ts";
import { getPcbBrowserStorage, PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import { pcbRecoveryClient } from "../core/recoveryClient.ts";
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
  initialSavedRevision?: string;
  recoveryClientId?: string;
}

export interface PcbPersistenceControl {
  hasUnsavedChanges: boolean;
  markClean: (revision?: string) => void;
  markDirty: () => void;
  saveNow: () => Promise<boolean>;
  status: PcbPersistenceStatus;
  lastSavedEditor: string | null;
  lastSavedProjectId: string | null;
}

/** Saves only on explicit user action; remote writes are serialized in click order. */
export function usePcbPersistence({
  state,
  storage,
  remoteClient,
  allowRemoteSync = false,
  editor,
  initialSavedRevision,
  recoveryClientId = pcbRecoveryClient(),
}: UsePcbPersistenceOptions): PcbPersistenceControl {
  const repository = useMemo(() => new PcbLocalRepository(storage ?? getPcbBrowserStorage()), [storage]);
  const client = allowRemoteSync ? remoteClient ?? null : null;
  const stateRef = useRef(state);
  const syncPermissionRef = useRef({ client, remoteClient, generation: 0 });
  if (syncPermissionRef.current.client !== client || syncPermissionRef.current.remoteClient !== remoteClient) {
    syncPermissionRef.current = { client, remoteClient, generation: syncPermissionRef.current.generation + 1 };
  }
  const repositoryRef = useRef(repository);
  const activeRef = useRef(true);
  const requestRef = useRef(0);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const [savedRevision, setSavedRevision] = useState(initialSavedRevision ?? state.updatedAt);
  const [status, setStatus] = useState<PcbPersistenceStatus>(client ? "synced" : "local");
  const [lastSavedEditor, setLastSavedEditor] = useState<string | null>(null);
  const [lastSavedProjectId, setLastSavedProjectId] = useState<string | null>(null);

  stateRef.current = state;
  repositoryRef.current = repository;
  const hasUnsavedChanges = state.updatedAt !== savedRevision;
  const ownerId = editor?.userId ?? "local";
  const recoverySavedRef = useRef(true);

  useEffect(() => {
    if (hasUnsavedChanges) {
      recoverySavedRef.current = repository.saveRecovery(ownerId, state, savedRevision, recoveryClientId);
    } else {
      repository.clearRecovery(ownerId, recoveryClientId);
      recoverySavedRef.current = true;
    }
  }, [hasUnsavedChanges, ownerId, recoveryClientId, repository, savedRevision, state]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    setStatus(client ? "synced" : remoteClient ? "unsaved" : "local");
  }, [client, remoteClient]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    const guardNavigation = (event: Event) => {
      const message = recoverySavedRef.current
        ? "PCB 有尚未儲存的修改。草稿會保留在此裝置，返回後可繼續編輯。確定離開？"
        : "PCB 有尚未儲存的修改，且此裝置無法保留草稿。離開會遺失修改，確定離開？";
      if (!window.confirm(message)) event.preventDefault();
    };
    window.addEventListener("workspace-before-navigate", guardNavigation);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("workspace-before-navigate", guardNavigation);
    };
  }, [hasUnsavedChanges]);

  const markDirty = useCallback(() => setSavedRevision(""), []);
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
    repositoryRef.current.save(snapshot, ownerId);

    if (!client && remoteClient) {
      // Cloud access/lease is unavailable. This is a recovery copy, not a local-mode save.
      repositoryRef.current.saveRecovery(ownerId, snapshot, savedRevision, recoveryClientId);
      setStatus("unsaved");
      return false;
    }

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
    const syncGeneration = syncPermissionRef.current.generation;
    const stillAllowed = () => syncPermissionRef.current.client === client
      && syncPermissionRef.current.generation === syncGeneration;
    const syncIfStillAllowed = () => {
      if (!stillAllowed()) return false;
      return syncPcbRemote(client, snapshot);
    };
    const remoteSave = saveQueueRef.current.then(syncIfStillAllowed, syncIfStillAllowed);
    saveQueueRef.current = remoteSave;
    const saved = await remoteSave && stillAllowed();
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
  }, [client, editor, ownerId, recoveryClientId, remoteClient, savedRevision]);

  return {
    hasUnsavedChanges,
    markClean,
    markDirty,
    saveNow,
    status: status === "saving" ? "saving" : hasUnsavedChanges ? "unsaved" : status,
    lastSavedEditor,
    lastSavedProjectId,
  };
}
