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
  type PcbRemoteClient,
} from "./usePcbPersistence.ts";
import { loadPcbRemote } from "../core/remoteSync.ts";

export interface UsePcbWorkspaceOptions {
  canEdit: boolean;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
}

function browserStorage(): StorageLike {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => undefined };
  }
  return window.localStorage;
}

function isBlankSeedWorkspace(state: PcbSaveState): boolean {
  const project = state.projects[0];
  const pendingCount = Object.values(state.pendingPlacementsByProject ?? {})
    .reduce((total, items) => total + items.length, 0);
  return state.projects.length === 1
    && project?.name === "未命名 PCB 專案"
    && project.components.length === 0
    && project.keepouts.length === 0
    && project.measurements.length === 0
    && state.templates.every((template) => template.isBuiltIn)
    && state.library.every((component) => component.source === "built-in")
    && pendingCount === 0;
}

export function usePcbWorkspace({
  canEdit,
  storage,
  remoteClient,
}: UsePcbWorkspaceOptions) {
  const repository = useMemo(
    () => new PcbLocalRepository(storage ?? browserStorage()),
    [storage],
  );
  const [state, dispatch] = useReducer(
    reduceWorkspaceState,
    undefined,
    () => createWorkspaceState(repository.load(), canEdit),
  );
  const stateRef = useRef(state.data);
  const [remoteReady, setRemoteReady] = useState(!remoteClient);
  const hydratedCleanRevisionRef = useRef<string | null>(null);
  stateRef.current = state.data;

  const persistence = usePcbPersistence({
    state: state.data,
    storage,
    remoteClient,
    allowRemoteSync: canEdit && Boolean(remoteClient) && remoteReady,
  });
  const { markClean } = persistence;

  useEffect(() => {
    let active = true;
    if (!remoteClient) {
      setRemoteReady(true);
      return () => {
        active = false;
      };
    }

    setRemoteReady(false);
    void loadPcbRemote(remoteClient).then((remoteState) => {
      if (!active) return;
      const localState = stateRef.current;
      const remoteIsNewer = remoteState
        && Date.parse(remoteState.updatedAt) > Date.parse(localState.updatedAt);
      if (remoteState && (remoteIsNewer || isBlankSeedWorkspace(localState))) {
        repository.save(remoteState);
        hydratedCleanRevisionRef.current = remoteState.updatedAt;
        dispatch({ type: "persistence/hydrate", data: remoteState });
      } else {
        markClean(localState.updatedAt);
      }
      setRemoteReady(true);
    });

    return () => {
      active = false;
    };
  }, [markClean, remoteClient, repository]);

  useEffect(() => {
    if (hydratedCleanRevisionRef.current !== state.data.updatedAt) return;
    markClean(state.data.updatedAt);
    hydratedCleanRevisionRef.current = null;
  }, [markClean, state.data.updatedAt]);

  const editor = usePcbEditorActions(state, dispatch);

  useEffect(() => {
    dispatch({ type: "permission/set", canEdit });
  }, [canEdit]);

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
    (projectId: string) => dispatch({ type: "project/delete", projectId }),
    [],
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
    (componentId: string, metadata: PcbModelAssetMetadata) =>
      dispatch({ type: "model/assign", componentId, metadata }),
    [],
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
    toggleObjectSelection,
    clearObjectSelection,
    saveNow,
  };
}

export type PcbWorkspaceApi = ReturnType<typeof usePcbWorkspace>;
export type { ImportedComponent, PcbLibraryComponent, PcbProject, PcbTemplate };
