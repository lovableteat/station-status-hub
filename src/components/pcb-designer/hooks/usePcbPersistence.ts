import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  syncPcbRemote,
  type PcbPersistenceStatus,
  type PcbRemoteClient,
} from "../core/remoteSync.ts";
import { getPcbBrowserStorage, PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import { pcbRecoveryClient } from "../core/recoveryClient.ts";
import type { PcbSaveState } from "../types.ts";
import { objectRevision, sameProjectScope } from "../core/workspaceRevision.ts";

const EMPTY_ITEMS = [];
const EMPTY_INDEX = {};

function sharedScope(state: PcbSaveState | null): string {
  return [state?.library ?? EMPTY_ITEMS, state?.templates ?? EMPTY_ITEMS, state?.modelAssets ?? EMPTY_INDEX,
    state?.remoteDeletions ?? EMPTY_INDEX].map(objectRevision).join("\n");
}

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
  initialConfirmedState?: PcbSaveState;
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
  saveError: string | null;
  dirtyProjectIds: string[];
  isProjectDirty: (projectId: string) => boolean;
  confirmedState: PcbSaveState | null;
  acceptRecoveryBaseline: (state: PcbSaveState) => void;
  confirmDiscard: (projectId: string) => void;
  flushRecovery: () => void;
}

/** Saves only on explicit user action; remote writes are serialized in click order. */
export function usePcbPersistence({
  state,
  storage,
  remoteClient,
  allowRemoteSync = false,
  editor,
  initialSavedRevision,
  initialConfirmedState,
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
  const savedRevisionRef = useRef(savedRevision);
  const updateSavedRevision = useCallback((revision: string) => {
    savedRevisionRef.current = revision;
    setSavedRevision(revision);
  }, []);
  const [status, setStatus] = useState<PcbPersistenceStatus>(client ? "synced" : "local");
  const [lastSavedEditor, setLastSavedEditor] = useState<string | null>(null);
  const [lastSavedProjectId, setLastSavedProjectId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmedState, setConfirmedState] = useState<PcbSaveState | null>(() => initialConfirmedState
    ?? (initialSavedRevision !== undefined && initialSavedRevision !== state.updatedAt ? null : state));
  const confirmedRef = useRef(confirmedState);
  const setConfirmed = useCallback((next: PcbSaveState | null) => {
    confirmedRef.current = next;
    setConfirmedState(next);
  }, []);

  stateRef.current = state;
  repositoryRef.current = repository;
  const isProjectDirty = useCallback((id: string) => !sameProjectScope(
    stateRef.current.projects.find(project => project.id === id), confirmedRef.current?.projects.find(project => project.id === id),
    stateRef.current.pendingPlacementsByProject?.[id] ?? EMPTY_ITEMS, confirmedRef.current?.pendingPlacementsByProject?.[id] ?? EMPTY_ITEMS), []);
  const dirtyProjectIds = useMemo(() => state.projects.filter(project => isProjectDirty(project.id)).map(project => project.id),
    [state.projects, state.pendingPlacementsByProject, confirmedState?.projects, confirmedState?.pendingPlacementsByProject, isProjectDirty]);
  const currentSharedScope = useMemo(() => sharedScope(state), [state.library, state.templates, state.modelAssets, state.remoteDeletions]);
  const confirmedSharedScope = useMemo(() => sharedScope(confirmedState),
    [confirmedState?.library, confirmedState?.templates, confirmedState?.modelAssets, confirmedState?.remoteDeletions]);
  const hasUnsavedChanges = state.updatedAt !== savedRevision || dirtyProjectIds.length > 0 || currentSharedScope !== confirmedSharedScope;
  const ownerId = editor?.userId ?? "local";
  const recoverySavedRef = useRef(true);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveryDirtyRef = useRef(hasUnsavedChanges);
  recoveryDirtyRef.current = hasUnsavedChanges;
  const flushRecovery = useCallback(() => {
    if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
    const current = repositoryRef.current;
    if (recoveryDirtyRef.current) {
      current.stageRecovery(ownerId, stateRef.current, savedRevisionRef.current, recoveryClientId, confirmedRef.current ?? undefined);
      recoverySavedRef.current = current.flushRecovery(ownerId, recoveryClientId);
    } else {
      current.clearRecovery(ownerId, recoveryClientId);
      recoverySavedRef.current = true;
    }
  }, [ownerId, recoveryClientId]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      repository.stageRecovery(ownerId, state, savedRevision, recoveryClientId, confirmedState ?? undefined);
      recoverySavedRef.current = false;
      recoveryTimerRef.current = window.setTimeout(flushRecovery, 400);
    } else {
      repository.clearRecovery(ownerId, recoveryClientId);
      recoverySavedRef.current = true;
    }
    return () => {
      if (recoveryTimerRef.current !== null) window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    };
  }, [hasUnsavedChanges, ownerId, recoveryClientId, repository, savedRevision, state, confirmedState, flushRecovery]);

  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") flushRecovery(); };
    window.addEventListener("pagehide", flushRecovery);
    window.addEventListener("beforeunload", flushRecovery);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      flushRecovery();
      window.removeEventListener("pagehide", flushRecovery);
      window.removeEventListener("beforeunload", flushRecovery);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [flushRecovery]);

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
      flushRecovery();
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
  }, [hasUnsavedChanges, flushRecovery]);

  const markDirty = useCallback(() => { updateSavedRevision(""); setConfirmed(null); }, [setConfirmed, updateSavedRevision]);
  const markClean = useCallback((revision?: string) => {
    updateSavedRevision(revision ?? stateRef.current.updatedAt);
    setConfirmed(stateRef.current);
  }, [setConfirmed, updateSavedRevision]);

  const acceptRecoveryBaseline = useCallback((remote: PcbSaveState) => {
    if (confirmedRef.current) return;
    setConfirmed(remote);
  }, [setConfirmed]);

  const confirmProject = useCallback((snapshot: PcbSaveState, includeShared: boolean) => {
    const previous = confirmedRef.current;
    const id = snapshot.activeProjectId;
    const next = { ...(includeShared ? snapshot : previous ?? snapshot) };
    next.projects = [...(previous?.projects.filter(project => project.id !== id) ?? []), ...snapshot.projects.filter(project => project.id === id)];
    next.activeProjectId = next.projects.some(project => project.id === id) ? id : next.projects[0]?.id ?? null;
    next.pendingPlacementsByProject = { ...previous?.pendingPlacementsByProject, [id!]: snapshot.pendingPlacementsByProject?.[id!] ?? EMPTY_ITEMS };
    if (!next.projects.some(project => project.id === id)) delete next.pendingPlacementsByProject[id!];
    setConfirmed(next);
    updateSavedRevision(snapshot.updatedAt);
  }, [setConfirmed, updateSavedRevision]);
  const confirmDiscard = useCallback((projectId: string) => {
    confirmProject({ ...stateRef.current, activeProjectId: projectId }, false);
  }, [confirmProject]);

  const saveNow = useCallback(async () => {
    flushRecovery();
    setSaveError(null);
    const snapshot = { ...stateRef.current };
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
    const localSaved = repositoryRef.current.save(snapshot, ownerId) !== null;
    const fail = (reason: string) => {
      recoverySavedRef.current = repositoryRef.current.saveRecovery(ownerId, stateRef.current, savedRevision, recoveryClientId, confirmedRef.current ?? undefined, true);
      setSaveError(`${reason}${localSaved || recoverySavedRef.current
        ? "修改已保留在此瀏覽器，請稍後重試。"
        : "瀏覽器也無法寫入草稿；修改只留在目前頁面的記憶體，請勿關閉或重新整理。"}`);
      setStatus("unsaved");
      return false;
    };

    if (!client && remoteClient) {
      // Cloud access/lease is unavailable. This is a recovery copy, not a local-mode save.
      return fail("目前沒有雲端連線或這塊板子的編輯權。" );
    }

    if (!client) {
      if (!localSaved) return fail("本機儲存失敗。" );
      setConfirmed(stateRef.current);
      updateSavedRevision(snapshot.updatedAt);
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
        confirmProject(snapshot, true);
        setLastSavedEditor(editorLabel);
        setLastSavedProjectId(activeProjectId);
        setStatus("synced");
      } else {
        fail("雲端儲存未完成，請確認網路與編輯權。" );
      }
    }
    return saved;
  }, [client, editor, ownerId, recoveryClientId, remoteClient, savedRevision, confirmProject, setConfirmed, flushRecovery, updateSavedRevision]);

  return {
    hasUnsavedChanges,
    markClean,
    markDirty,
    saveNow,
    status: status === "saving" ? "saving" : hasUnsavedChanges ? "unsaved" : status,
    lastSavedEditor,
    lastSavedProjectId,
    saveError,
    dirtyProjectIds,
    isProjectDirty,
    confirmedState,
    acceptRecoveryBaseline,
    confirmDiscard,
    flushRecovery,
  };
}
