import { useCallback, useEffect, useMemo, useReducer } from "react";
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
  PcbProject,
  PcbTemplate,
  PcbTool,
} from "../types.ts";
import { usePcbEditorActions } from "./usePcbEditorActions.ts";
import {
  usePcbPersistence,
  type PcbRemoteClient,
} from "./usePcbPersistence.ts";

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
  const persistenceStatus = usePcbPersistence({
    state: state.data,
    storage,
    remoteClient,
    allowRemoteSync: canEdit && Boolean(remoteClient),
  });
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
      repository.save(state.data);
      dispatch({ type: "project/open", projectId });
    },
    [repository, state.data],
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
  const saveNow = useCallback(() => {
    repository.save(state.data);
    dispatch({ type: "persistence/touch" });
  }, [repository, state.data]);

  return {
    ...state,
    ...editor,
    persistenceStatus,
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
    setZoom,
    setRightTab,
    runDrc,
    saveNow,
  };
}

export type PcbWorkspaceApi = ReturnType<typeof usePcbWorkspace>;
export type { ImportedComponent, PcbLibraryComponent, PcbProject, PcbTemplate };
