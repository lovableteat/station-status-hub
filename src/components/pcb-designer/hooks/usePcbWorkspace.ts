import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PcbLocalRepository, type StorageLike } from "../core/storage.ts";
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
import { loadPcbRemote, mergePcbRemoteState } from "../core/remoteSync.ts";
import { usePcbProjectLock } from "./usePcbProjectLock.ts";

export interface UsePcbWorkspaceOptions {
  canEdit: boolean;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
  editor?: PcbEditorIdentity | null;
  clientId?: string;
}

function browserStorage(): StorageLike {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => undefined };
  }
  return window.localStorage;
}

export function usePcbWorkspace({
  canEdit,
  storage,
  remoteClient,
  editor: editorIdentity,
  clientId = "pcb-local-client",
}: UsePcbWorkspaceOptions) {
  const repository = useMemo(
    () => new PcbLocalRepository(storage ?? browserStorage()),
    [storage],
  );
  const [state, dispatch] = useReducer(
    reduceWorkspaceState,
    undefined,
    () => createWorkspaceState(repository.load(), canEdit && !remoteClient),
  );
  const stateRef = useRef(state.data);
  const viewStateRef = useRef(state);
  const [remoteReady, setRemoteReady] = useState(!remoteClient);
  const hydratedCleanRevisionRef = useRef<string | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const refreshRemoteRef = useRef<() => Promise<void>>(async () => undefined);
  stateRef.current = state.data;
  viewStateRef.current = state;

  const projectLock = usePcbProjectLock({
    client: remoteClient ?? null,
    clientId,
    permissionCanEdit: canEdit,
    projectId: state.activeProject.id,
    projectName: state.activeProject.name,
  });
  const effectiveCanEdit = canEdit && projectLock.canEdit;

  const persistence = usePcbPersistence({
    state: state.data,
    storage,
    remoteClient,
    allowRemoteSync: effectiveCanEdit && Boolean(remoteClient) && remoteReady,
    editor: editorIdentity,
  });
  const { markClean } = persistence;
  hasUnsavedChangesRef.current = persistence.hasUnsavedChanges;

  useEffect(() => {
    let active = true;
    let loading = false;
    if (!remoteClient) {
      setRemoteReady(true);
      return () => {
        active = false;
      };
    }

    setRemoteReady(false);
    const refreshRemote = async (initial: boolean) => {
      if (!active || loading || (!initial && hasUnsavedChangesRef.current)) return;
      loading = true;
      const remoteState = await loadPcbRemote(remoteClient);
      loading = false;
      if (!active) return;
      const localState = stateRef.current;
      const localView = viewStateRef.current;
      if (remoteState) {
        const mergedState = mergePcbRemoteState(localState, remoteState);
        if (JSON.stringify(mergedState) !== JSON.stringify(localState)) {
          repository.save(mergedState);
          hydratedCleanRevisionRef.current = mergedState.updatedAt;
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
        } else if (initial) {
          markClean(localState.updatedAt);
        }
      } else if (initial) {
        markClean(localState.updatedAt);
      }
      if (initial) setRemoteReady(true);
    };
    const refreshOnFocus = () => void refreshRemote(false);
    refreshRemoteRef.current = () => refreshRemote(false);
    void refreshRemote(true);
    const refreshTimer = window.setInterval(() => void refreshRemote(false), 8_000);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      refreshRemoteRef.current = async () => undefined;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [markClean, remoteClient, repository]);

  useEffect(() => {
    if (hydratedCleanRevisionRef.current !== state.data.updatedAt) return;
    markClean(state.data.updatedAt);
    hydratedCleanRevisionRef.current = null;
  }, [markClean, state.data.updatedAt]);

  const editor = usePcbEditorActions(state, dispatch);
  const refreshRemoteNow = useCallback(() => refreshRemoteRef.current(), []);

  useEffect(() => {
    dispatch({ type: "permission/set", canEdit: effectiveCanEdit });
  }, [effectiveCanEdit]);

  const createProject = useCallback(
    (input: NewProjectInput) => dispatch({ type: "project/create", input }),
    [],
  );
  const openProject = useCallback(
    (projectId: string) => {
      dispatch({ type: "project/open", projectId });
    },
    [],
  );
  const renameProject = useCallback(
    (projectId: string, name: string) =>
      dispatch({ type: "project/rename", projectId, name }),
    [],
  );
  const duplicateProject = useCallback(
    (projectId: string) => dispatch({ type: "project/duplicate", projectId }),
    [],
  );
  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!effectiveCanEdit || projectId !== stateRef.current.activeProjectId) return false;
      if (remoteClient?.deleteProject && !await remoteClient.deleteProject(projectId)) return false;
      dispatch({ type: "project/delete", projectId });
      return true;
    },
    [effectiveCanEdit, remoteClient],
  );
  const importProject = useCallback(
    (project: PcbProject) => dispatch({ type: "project/import", project }),
    [],
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
  const updateProjectSettings = useCallback(
    (project: PcbProject) => {
      if (project.id === state.activeProject.id) commitProject(project);
      else dispatch({ type: "project/rename", projectId: project.id, name: project.name });
    },
    [commitProject, state.activeProject.id],
  );

  const applyTemplate = useCallback(
    (templateId: string) => dispatch({ type: "template/apply", templateId }),
    [],
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
  const assignModelAsset = useCallback(
    (componentId: string, metadata: PcbModelAssetMetadata) => {
      const component = state.activeProject.components.find((item) => item.instanceId === componentId);
      if (!effectiveCanEdit || state.documentLocked || !component || component.locked) return false;
      dispatch({ type: "model/assign", componentId, metadata });
      return true;
    },
    [effectiveCanEdit, state.activeProject.components, state.documentLocked],
  );
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
  const saveNow = persistence.saveNow;

  return {
    ...state,
    ...editor,
    visibleLayer: state.visibleLayer,
    selectedObjects: state.selectedObjects,
    persistenceStatus: persistence.status,
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
    importBom,
    removePendingPlacement,
    undo,
    redo,
    toggleDocumentLock,
    setTool,
    setActiveLayer,
    setVisibleLayer,
    assignModelAsset,
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
