import { projectSettingsRevision, type ProjectSettings } from "../core/projectSettingsDraft.ts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getPcbBrowserStorage, PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import {
  createWorkspaceState,
  reduceWorkspaceState,
  type NewProjectInput,
  type TemplateInput,
} from "../core/workspace.ts";
import type {
  ImportedBomItem,
  ImportedComponent,
} from "../core/tabular.ts";
import type {
  PcbLibraryComponent,
  PcbModelAssetMetadata,
  PcbProject,
  PcbSaveState,
  PcbTemplate,
  PcbTool,
  PcbVisibleLayer,
} from "../types.ts";
import { usePcbEditorActions } from "./usePcbEditorActions.ts";
import {
  usePcbPersistence,
  type PcbEditorIdentity,
  type PcbRemoteClient,
} from "./usePcbPersistence.ts";
import { isBlankSeedWorkspace, loadPcbRemoteResult, mergePcbRemoteState, type PcbRemoteLoadResult } from "../core/remoteSync.ts";
import { usePcbProjectLock } from "./usePcbProjectLock.ts";
import { PcbRemoteAccessError, type PcbRemoteAccessStatus } from "../core/remoteAccess.ts";
import { usePcbRemoteAccess } from "./usePcbRemoteAccess.ts";
import { pcbRecoveryClient } from "../core/recoveryClient.ts";
import type { PcbWorkspaceAction } from "../core/workspaceTypes.ts";

type ProjectTransition = { projectId: string; projectName: string; status: "saving" | "failed"; error?: string };
type ModelAssignmentTarget = { projectId: string; componentId: string; generation: number };

export interface UsePcbWorkspaceOptions {
  canEdit: boolean;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
  editor?: PcbEditorIdentity | null;
  clientId?: string;
  recoveryClientId?: string;
}

export function usePcbWorkspace({
  canEdit,
  storage,
  remoteClient,
  editor: editorIdentity,
  clientId = "pcb-local-client",
  recoveryClientId = pcbRecoveryClient(),
}: UsePcbWorkspaceOptions) {
  const remoteAccess = usePcbRemoteAccess(remoteClient);
  // A mounted draft belongs to the account that opened it. A different login
  // must never inherit this reducer's data or recovery namespace.
  const draftOwnerRef = useRef(editorIdentity ?? null);
  const ownerChanged = (draftOwnerRef.current?.userId ?? "local") !== (editorIdentity?.userId ?? "local");
  const repository = useMemo(
    () => new PcbLocalRepository(storage ?? getPcbBrowserStorage()),
    [storage],
  );
  const recovery = useMemo(() => repository.loadRecovery(draftOwnerRef.current?.userId ?? "local", recoveryClientId), [repository, recoveryClientId]);
  const [state, dispatch] = useReducer(
    reduceWorkspaceState,
    undefined,
    () => createWorkspaceState(recovery?.state ?? repository.load(draftOwnerRef.current?.userId ?? "local"), canEdit && !remoteClient),
  );
  const stateRef = useRef(state.data);
  const viewStateRef = useRef(state);
  const [remoteReady, setRemoteReady] = useState(!remoteClient);
  const [checkedLeaseProjectId, setCheckedLeaseProjectId] = useState<string | null>(null);
  const leaseReadGenerationRef = useRef(0);
  const [legacyRecovery, setLegacyRecovery] = useState<"own" | "shared-only" | null>(null);
  const modernLoadedRef = useRef(false);
  const [remoteLoadStatus, setRemoteLoadStatus] = useState<PcbRemoteAccessStatus>(remoteClient ? "checking" : "ready");
  const hydratedCleanRevisionRef = useRef<string | null>(null);
  const hydratedProjectRef = useRef<string | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const [projectTransition, setProjectTransition] = useState<ProjectTransition | null>(null);
  const transitionRef = useRef<{ action: PcbWorkspaceAction; sourceId: string; discarding?: boolean; saving?: boolean; start?: (saved: boolean) => void } | null>(null);
  const mountedRef = useRef(true);
  const discardedNewProjectRef = useRef<string | null>(null);
  const deletingProjectRef = useRef(false);
  const refreshRemoteRef = useRef<(afterAcquire?: boolean) => Promise<void>>(async () => undefined);
  stateRef.current = state.data;
  viewStateRef.current = state;

  const projectLock = usePcbProjectLock({
    client: remoteClient ?? null,
    clientId,
    permissionCanEdit: canEdit,
    enabled: !ownerChanged,
    projectId: state.activeProject.id,
    projectName: state.activeProject.name,
  });
  const cloudReady = !ownerChanged && !legacyRecovery && (!remoteClient || (remoteReady && remoteAccess.status === "ready" && remoteLoadStatus === "ready"));
  const effectiveCanEdit = canEdit && projectLock.canEdit && cloudReady
    && (!remoteClient || checkedLeaseProjectId === state.activeProject.id);

  const persistence = usePcbPersistence({
    state: state.data,
    storage,
    remoteClient,
    allowRemoteSync: effectiveCanEdit && Boolean(remoteClient) && remoteReady,
    editor: draftOwnerRef.current,
    initialSavedRevision: recovery?.savedRevision,
    initialConfirmedState: recovery?.confirmedState,
    recoveryClientId,
  });
  const { markClean, markDirty, acceptRecoveryBaseline, saveNow: savePersistedNow } = persistence;
  const persistenceRef = useRef(persistence);
  persistenceRef.current = persistence;
  const editableRef = useRef(effectiveCanEdit);
  editableRef.current = effectiveCanEdit;
  const { refresh: refreshProjectLock } = projectLock;
  hasUnsavedChangesRef.current = persistence.hasUnsavedChanges;

  useEffect(() => {
    let active = true;
    let loading = false;
    let pendingLoad: Promise<PcbRemoteLoadResult> | null = null;
    if (ownerChanged) {
      setRemoteReady(false);
      setRemoteLoadStatus("denied");
      refreshRemoteRef.current = async () => undefined;
      return () => { active = false; };
    }
    if (!remoteClient) {
      setRemoteReady(true);
      return () => {
        active = false;
      };
    }

    setRemoteReady(false);
    setRemoteLoadStatus("checking");
    let initialized = false;
    const refreshRemote = async (initial: boolean, afterAcquire = false) => {
      const leaseReadGeneration = leaseReadGenerationRef.current;
      if (!active || (!afterAcquire && (loading || (!initial && initialized && hasUnsavedChangesRef.current)))) return;
      if (afterAcquire && pendingLoad) { try { await pendingLoad; } catch { return; } }
      if (!active || (afterAcquire && leaseReadGeneration !== leaseReadGenerationRef.current)) return;
      const requestedProjectId = stateRef.current.activeProjectId;
      loading = true;
      let loaded: PcbRemoteLoadResult;
      try {
        pendingLoad = loadPcbRemoteResult(remoteClient);
        loaded = await pendingLoad;
      } catch (error) {
        if (active && (!afterAcquire || leaseReadGeneration === leaseReadGenerationRef.current)) {
          setRemoteReady(false);
          setRemoteLoadStatus(error instanceof PcbRemoteAccessError ? error.status : "error");
        }
        return;
      } finally {
        loading = false;
        pendingLoad = null;
      }
      if (!active || (afterAcquire && leaseReadGeneration !== leaseReadGenerationRef.current)) return;
      initialized = true;
      const remoteState = loaded.state;
      const recoveringLegacy = loaded.source === "legacy";
      setLegacyRecovery(loaded.source === "legacy" ? loaded.ownSnapshotPresent ? "own" : "shared-only" : null);
      setRemoteLoadStatus("ready");
      setRemoteReady(!recoveringLegacy);
      if (afterAcquire && !recoveringLegacy && requestedProjectId === stateRef.current.activeProjectId) setCheckedLeaseProjectId(requestedProjectId);
      if (!recoveringLegacy) modernLoadedRef.current = true;
      // Recheck after await: a user can edit while background refresh is pending.
      // A restored dirty recovery draft must also survive initial hydration.
      if (hasUnsavedChangesRef.current) {
        if (remoteState && !recoveringLegacy) acceptRecoveryBaseline(remoteState);
        // Refresh a newly leased clean board without replacing other recovered drafts or the shared catalog.
        if (afterAcquire && remoteState && !viewStateRef.current.transitionBusy && requestedProjectId === stateRef.current.activeProjectId
          && !persistenceRef.current.isProjectDirty(requestedProjectId!)) {
          const project = remoteState.projects.find(p => p.id === requestedProjectId);
          if (project) {
            hydratedProjectRef.current = project.id;
            dispatch({ type: "persistence/hydrate", data: { ...stateRef.current,
              projects: stateRef.current.projects.map(p => p.id === project.id ? project : p),
              pendingPlacementsByProject: { ...stateRef.current.pendingPlacementsByProject, [project.id]: remoteState.pendingPlacementsByProject?.[project.id] ?? [] },
            }, preserveView: viewStateRef.current });
          }
        }
        return;
      }
      if (viewStateRef.current.transitionBusy) return;
      const localState = stateRef.current;
      const localView = viewStateRef.current;
      if (recoveringLegacy) {
        markDirty();
        // Legacy revisions/tombstones may predate this device's modern state.
        // Only a clean, blank seed can be automatically populated from recovery.
        if (modernLoadedRef.current || !isBlankSeedWorkspace(localState)) return;
      }
      if (remoteState) {
        const mergedState = mergePcbRemoteState(localState, remoteState);
        const leasedProject = afterAcquire && requestedProjectId === localState.activeProjectId
          ? remoteState.projects.find(project => project.id === requestedProjectId) : null;
        if (leasedProject) {
          // A confirmed-clean board must follow the server even after a clock-ahead local discard.
          mergedState.projects = mergedState.projects.map(project => project.id === leasedProject.id ? leasedProject : project);
          mergedState.pendingPlacementsByProject = { ...mergedState.pendingPlacementsByProject,
            [leasedProject.id]: remoteState.pendingPlacementsByProject?.[leasedProject.id] ?? [] };
        }
        if (JSON.stringify(mergedState) !== JSON.stringify(localState)) {
          repository.save(mergedState, draftOwnerRef.current?.userId ?? "local");
          if (!recoveringLegacy) hydratedCleanRevisionRef.current = mergedState.updatedAt;
          dispatch({
            type: "persistence/hydrate",
            data: mergedState,
            preserveView: {
              activeProjectId: localState.activeProjectId,
              zoom: localView.zoom,
              viewCenter: localView.viewCenter,
              activeLayer: localView.activeLayer,
              visibleLayer: localView.visibleLayer,
              rightTab: localView.rightTab,
              selection: localView.selection,
              selectedObjects: localView.selectedObjects,
            },
          });
        } else if (initial && !recoveringLegacy) {
          markClean(localState.updatedAt);
        }
      }
      // Empty cloud data is not proof that existing local content was saved.
      // Keep its revision/recovery intact until an explicit successful save.
    };
    const refreshOnFocus = () => void refreshRemote(false);
    refreshRemoteRef.current = afterAcquire => refreshRemote(false, afterAcquire);
    void refreshRemote(true);
    const refreshTimer = window.setInterval(() => void refreshRemote(false), 8_000);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      refreshRemoteRef.current = async () => undefined;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [markClean, markDirty, acceptRecoveryBaseline, remoteClient, remoteAccess.generation, repository, ownerChanged]);

  useEffect(() => {
    if (hydratedProjectRef.current) {
      persistenceRef.current.confirmDiscard(hydratedProjectRef.current);
      hydratedProjectRef.current = null;
      return;
    }
    if (hydratedCleanRevisionRef.current !== state.data.updatedAt) return;
    markClean(state.data.updatedAt);
    hydratedCleanRevisionRef.current = null;
  }, [markClean, state.data]);

  useEffect(() => {
    leaseReadGenerationRef.current += 1;
    if (!remoteClient) return;
    setCheckedLeaseProjectId(null);
    if (projectLock.canEdit && !ownerChanged) void refreshRemoteRef.current(true);
  }, [remoteClient, projectLock.canEdit, state.activeProject.id, ownerChanged]);

  const editor = usePcbEditorActions(state, dispatch);
  const refreshRemoteNow = useCallback(() => refreshRemoteRef.current(), []);
  const retryRemote = useCallback(async () => {
    if (remoteClient?.retryAccess) remoteClient.retryAccess();
    else {
      await refreshRemoteRef.current();
      await refreshProjectLock();
    }
  }, [remoteClient, refreshProjectLock]);

  useEffect(() => {
    dispatch({ type: "permission/set", canEdit: effectiveCanEdit });
  }, [effectiveCanEdit]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; transitionRef.current = null; }; }, []);

  const finishProjectTransition = useCallback(() => {
    const pending = transitionRef.current;
    if (!pending || !mountedRef.current || viewStateRef.current.activeProject.id !== pending.sourceId) return false;
    if (pending.action.type !== "project/open" && (!editableRef.current || viewStateRef.current.documentLocked)) {
      setProjectTransition({ projectId: pending.sourceId, projectName: viewStateRef.current.activeProject.name,
        status: "failed", error: "目前沒有建立或複製板子的編輯權。內容仍保留在此瀏覽器，請恢復編輯權後重試或取消。" });
      return false;
    }
    transitionRef.current = null;
    dispatch({ type: "transition/set-busy", busy: false });
    dispatch(pending.action);
    setProjectTransition(null);
    return true;
  }, []);

  const retryProjectTransition = useCallback(async () => {
    const pending = transitionRef.current;
    if (!pending || pending.discarding || pending.saving) return false;
    pending.saving = true;
    persistenceRef.current.flushRecovery();
    const source = viewStateRef.current.activeProject;
    setProjectTransition({ projectId: source.id, projectName: source.name, status: "saving" });
    if (!persistenceRef.current.isProjectDirty(source.id)) {
      pending.saving = false;
      return finishProjectTransition();
    }
    const saved = await persistenceRef.current.saveNow();
    pending.saving = false;
    if (!mountedRef.current || transitionRef.current !== pending) return false;
    if (saved && editableRef.current && !persistenceRef.current.isProjectDirty(pending.sourceId)) return finishProjectTransition();
    setProjectTransition({ projectId: source.id, projectName: source.name, status: "failed",
      error: persistenceRef.current.saveError ?? "雲端儲存未完成，請確認網路與編輯權。修改仍保留在此瀏覽器；請勿關閉或重新整理。" });
    return false;
  }, [finishProjectTransition]);

  const requestProjectTransition = useCallback((action: PcbWorkspaceAction): Promise<boolean> => {
    if (transitionRef.current || deletingProjectRef.current || ownerChanged) return Promise.resolve(false);
    if (action.type !== "project/open" && (!editableRef.current || viewStateRef.current.documentLocked)) return Promise.resolve(false);
    const source = viewStateRef.current.activeProject;
    if (action.type === "project/open" && (action.projectId === source.id || !stateRef.current.projects.some(p => p.id === action.projectId))) return Promise.resolve(false);
    persistenceRef.current.flushRecovery();
    if (!remoteClient) {
      dispatch(action);
      return Promise.resolve(true);
    }
    transitionRef.current = { action, sourceId: source.id };
    dispatch({ type: "transition/set-busy", busy: true });
    return new Promise(resolve => { transitionRef.current!.start = resolve; });
  }, [ownerChanged, remoteClient]);

  useEffect(() => {
    const pending = transitionRef.current;
    if (!state.transitionBusy || !pending?.start) return;
    const resolve = pending.start;
    delete pending.start;
    void retryProjectTransition().then(resolve);
  }, [state.transitionBusy, retryProjectTransition]);

  const cancelProjectTransition = useCallback(() => {
    if (!transitionRef.current || projectTransition?.status === "saving") return;
    transitionRef.current = null;
    dispatch({ type: "transition/set-busy", busy: false });
    setProjectTransition(null);
  }, [projectTransition?.status]);

  const discardProjectTransition = useCallback(() => {
    const pending = transitionRef.current;
    const baseline = persistenceRef.current.confirmedState;
    const project = baseline?.projects.find(p => p.id === pending?.sourceId);
    if (!pending || !baseline || projectTransition?.status !== "failed") return false;
    if (pending.action.type !== "project/open" && !editableRef.current) return false;
    persistenceRef.current.flushRecovery();
    if (!project) {
      if (pending.action.type === "project/duplicate" && pending.action.projectId === pending.sourceId) return false;
      discardedNewProjectRef.current = pending.sourceId;
      dispatch({ type: "project/discard", project: null, projectId: pending.sourceId, pendingPlacements: [] });
      return finishProjectTransition();
    }
    pending.discarding = true;
    dispatch({ type: "project/discard", project,
      pendingPlacements: baseline.pendingPlacementsByProject?.[project.id] ?? [] });
    return true;
  }, [projectTransition?.status, finishProjectTransition]);

  useEffect(() => {
    if (discardedNewProjectRef.current) {
      persistenceRef.current.confirmDiscard(discardedNewProjectRef.current);
      discardedNewProjectRef.current = null;
    }
    const pending = transitionRef.current;
    if (!pending?.discarding) return;
    persistenceRef.current.confirmDiscard(pending.sourceId);
    finishProjectTransition();
  }, [state.data, finishProjectTransition]);

  const createProject = useCallback(
    (input: NewProjectInput) => requestProjectTransition({ type: "project/create", input }),
    [requestProjectTransition],
  );
  const openProject = useCallback(
    (projectId: string) => {
      return requestProjectTransition({ type: "project/open", projectId });
    },
    [requestProjectTransition],
  );
  const renameProject = useCallback(
    (projectId: string, name: string) =>
      dispatch({ type: "project/rename", projectId, name }),
    [],
  );
  const duplicateProject = useCallback(
    (projectId: string, newRevision = false) => requestProjectTransition({ type: "project/duplicate", projectId, newRevision }),
    [requestProjectTransition],
  );
  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!editableRef.current || viewStateRef.current.documentLocked || transitionRef.current || deletingProjectRef.current
        || projectId !== stateRef.current.activeProjectId) return false;
      deletingProjectRef.current = true;
      persistenceRef.current.flushRecovery();
      dispatch({ type: "transition/set-busy", busy: true });
      try {
        if (remoteClient?.deleteProject && !await remoteClient.deleteProject(projectId)) return false;
        if (!mountedRef.current || !editableRef.current || projectId !== stateRef.current.activeProjectId) return false;
        dispatch({ type: "transition/set-busy", busy: false });
        dispatch({ type: "project/delete", projectId });
        return true;
      } finally {
        deletingProjectRef.current = false;
        if (mountedRef.current) dispatch({ type: "transition/set-busy", busy: false });
      }
    },
    [remoteClient],
  );
  const importProject = useCallback(
    (project: PcbProject) => requestProjectTransition({ type: "project/import", project }),
    [requestProjectTransition],
  );
  const commitProject = useCallback(
    (update: PcbProject | ((project: PcbProject) => PcbProject)) => {
      const project = typeof update === "function"
        ? update(structuredClone(state.activeProject))
        : update;
      dispatch({ type: "project/commit", update: project });
    },
    [state.activeProject],
  );
  const settingsReceipt = useRef<{ requestToken: string; resolve: (applied: boolean) => void } | null>(null);
  const settingsEditable = useRef(false);
  settingsEditable.current = effectiveCanEdit && state.canEdit && !state.documentLocked && !state.transitionBusy;
  const updateProjectSettings = useCallback(
    (projectId: string, baselineRevision: string, settings: ProjectSettings): Promise<boolean> => {
      const previous = viewStateRef.current;
      if (!settingsEditable.current || projectId !== previous.activeProject.id || settingsReceipt.current) return Promise.resolve(false);
      if (projectSettingsRevision(previous.activeProject) !== baselineRevision) return Promise.resolve(false);
      const requestToken = crypto.randomUUID();
      return new Promise(resolve => {
        settingsReceipt.current = { requestToken, resolve };
        dispatch({ type: "project/settings", requestToken, projectId, baselineRevision, settings });
      });
    },
    [],
  );
  useEffect(() => {
    const receipt = settingsReceipt.current;
    if (!receipt || state.projectSettingsReceipt?.requestToken !== receipt.requestToken) return;
    settingsReceipt.current = null;
    receipt.resolve(settingsEditable.current && state.projectSettingsReceipt.accepted);
  }, [state]);
  useEffect(() => () => {
    settingsReceipt.current?.resolve(false);
    settingsReceipt.current = null;
  }, []);

  const applyTemplate = useCallback(
    (templateId: string) => requestProjectTransition({ type: "template/apply", templateId }),
    [requestProjectTransition],
  );
  const saveTemplate = useCallback(
    (input: TemplateInput) => dispatch({ type: "template/save", input }),
    [],
  );
  const renameTemplate = useCallback(
    (templateId: string, name: string) =>
      dispatch({ type: "template/rename", templateId, name }),
    [],
  );
  const duplicateTemplate = useCallback(
    (templateId: string) => dispatch({ type: "template/duplicate", templateId }),
    [],
  );
  const deleteTemplate = useCallback(
    (templateId: string) => dispatch({ type: "template/delete", templateId }),
    [],
  );

  const createLibraryComponent = useCallback(
    (component: ImportedComponent) =>
      dispatch({ type: "library/create", component }),
    [],
  );
  const editLibraryComponent = useCallback(
    (componentId: string, component: ImportedComponent) =>
      dispatch({ type: "library/edit", componentId, component }),
    [],
  );
  const duplicateLibraryComponent = useCallback(
    (componentId: string) =>
      dispatch({ type: "library/duplicate", componentId }),
    [],
  );
  const deleteLibraryComponent = useCallback(
    (componentId: string) => dispatch({ type: "library/delete", componentId }),
    [],
  );
  const uploadLibraryComponents = useCallback(
    (components: ImportedComponent[]) =>
      dispatch({ type: "library/import", components }),
    [],
  );
  const importLibraryModel = useCallback(
    (component: ImportedComponent, metadata: PcbModelAssetMetadata) =>
      dispatch({ type: "library/import-model", component, metadata }),
    [],
  );
  const importBom = useCallback(
    (items: ImportedBomItem[]) => dispatch({ type: "bom/import", items }),
    [],
  );
  const removePendingPlacement = useCallback(
    (index: number) => dispatch({ type: "bom/remove", index }),
    [],
  );

  const undo = useCallback(() => dispatch({ type: "history/undo" }), []);
  const redo = useCallback(() => dispatch({ type: "history/redo" }), []);
  const toggleDocumentLock = useCallback(
    () => dispatch({ type: "document/toggle-lock" }),
    [],
  );
  const setTool = useCallback(
    (tool: PcbTool) => dispatch({ type: "tool/set", tool }),
    [],
  );
  const setActiveLayer = useCallback(
    (layer: "top" | "bottom") => dispatch({ type: "layer/set", layer }),
    [],
  );
  const setVisibleLayer = useCallback(
    (layer: PcbVisibleLayer) => dispatch({ type: "view/layer", layer }),
    [],
  );
  const captureModelAssignment = useCallback((componentId: string): ModelAssignmentTarget | null => {
    const current = viewStateRef.current;
    const component = current.activeProject.components.find(item => item.instanceId === componentId);
    if (!mountedRef.current || !editableRef.current || current.transitionBusy || current.documentLocked || !component || component.locked) return null;
    return { projectId: current.activeProject.id, componentId, generation: current.projectGeneration };
  }, []);
  const modelReceipt = useRef<{ requestToken: string; target: ModelAssignmentTarget; resolve: (applied: boolean) => void } | null>(null);
  const assignModelAsset = useCallback((target: ModelAssignmentTarget, metadata: PcbModelAssetMetadata): Promise<boolean> => {
    const current = captureModelAssignment(target.componentId);
    if (!current || current.projectId !== target.projectId || current.generation !== target.generation || modelReceipt.current) return Promise.resolve(false);
    const requestToken = crypto.randomUUID();
    return new Promise(resolve => {
      modelReceipt.current = { requestToken, target, resolve };
      dispatch({ type: "model/assign", ...target, requestToken, metadata });
    });
  }, [captureModelAssignment]);
  useEffect(() => {
    const receipt = modelReceipt.current;
    if (!receipt || state.modelAssignmentReceipt?.requestToken !== receipt.requestToken) return;
    modelReceipt.current = null;
    receipt.resolve(state.modelAssignmentReceipt.accepted && editableRef.current
      && state.activeProject.id === receipt.target.projectId && state.modelAssignmentReceipt.generation === state.projectGeneration);
  }, [state]);
  useEffect(() => () => { modelReceipt.current?.resolve(false); modelReceipt.current = null; }, []);
  const setZoom = useCallback(
    (zoom: number) => dispatch({ type: "zoom/set", zoom }),
    [],
  );
  const setRightTab = useCallback(
    (tab: "board" | "selection" | "drc") =>
      dispatch({ type: "panel/right", tab }),
    [],
  );
  const runDrc = useCallback(() => dispatch({ type: "drc/run" }), []);
  const toggleObjectSelection = useCallback(
    (objectId: string) => dispatch({ type: "selection/toggle", objectId }),
    [],
  );
  const selectObjects = useCallback(
    (objectIds: string[], additive = false) =>
      dispatch({ type: "selection/set-many", objectIds, additive }),
    [],
  );
  const clearObjectSelection = useCallback(
    () => dispatch({ type: "selection/clear-group" }),
    [],
  );
  const saveNow = useCallback(() => ownerChanged ? Promise.resolve(false) : savePersistedNow(), [ownerChanged, savePersistedNow]);
  const loadModelAsset = useCallback(
    (assetId: string) => !ownerChanged ? remoteClient?.loadModelAsset?.(assetId) ?? Promise.resolve(null) : Promise.resolve(null),
    [ownerChanged, remoteClient],
  );

  return {
    ...state,
    ...editor,
    canEdit: effectiveCanEdit,
    canMutate: editor.canMutate && effectiveCanEdit && !state.transitionBusy,
    visibleLayer: state.visibleLayer,
    selectedObjects: state.selectedObjects,
    persistenceStatus: persistence.status,
    saveError: persistence.saveError,
    projectTransition,
    retryProjectTransition,
    cancelProjectTransition,
    discardProjectTransition,
    canDiscardProjectTransition: Boolean(persistence.confirmedState)
      && (transitionRef.current?.action.type === "project/open" || effectiveCanEdit)
      && (transitionRef.current?.action.type !== "project/duplicate" || persistence.confirmedState?.projects.some(p => p.id === projectTransition?.projectId)),
    dirtyProjectIds: persistence.dirtyProjectIds,
    remoteReady: cloudReady,
    remoteAccessStatus: ownerChanged ? "denied" : remoteAccess.status !== "ready" ? remoteAccess.status : remoteLoadStatus,
    ownerChanged,
    legacyRecovery,
    retryRemote,
    hasUnsavedChanges: persistence.hasUnsavedChanges,
    lastSavedEditor: persistence.lastSavedEditor,
    lastSavedProjectId: persistence.lastSavedProjectId,
    permissionCanEdit: canEdit,
    projectLock,
    refreshRemoteNow,
    createProject,
    openProject,
    renameProject,
    updateProjectSettings,
    duplicateProject,
    deleteProject,
    importProject,
    commitProject,
    applyTemplate,
    saveTemplate,
    renameTemplate,
    duplicateTemplate,
    deleteTemplate,
    createLibraryComponent,
    editLibraryComponent,
    duplicateLibraryComponent,
    deleteLibraryComponent,
    uploadLibraryComponents,
    importLibraryModel,
    importBom,
    removePendingPlacement,
    undo,
    redo,
    toggleDocumentLock,
    setTool,
    setActiveLayer,
    setVisibleLayer,
    assignModelAsset,
    captureModelAssignment,
    loadModelAsset,
    setZoom,
    setRightTab,
    runDrc,
    selectObjects,
    toggleObjectSelection,
    clearObjectSelection,
    saveNow,
  };
}

export type PcbWorkspaceApi = ReturnType<typeof usePcbWorkspace>;
export type { ImportedComponent, PcbLibraryComponent, PcbProject, PcbTemplate };
