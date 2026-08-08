import { createBlankProject, createId } from "../defaults.ts";
import type {
  PcbProject,
  PcbSaveState,
  PcbTemplate,
} from "../types.ts";
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
} from "./history.ts";
import { runDrc } from "./drc.ts";
import {
  duplicateKeepout,
  placeLibraryComponent,
} from "./editor.ts";
import {
  MAX_BOM_QUANTITY_PER_ROW,
  MAX_BOM_TOTAL_PLACEMENTS,
} from "./tabular.ts";
import { isPcbVisibleLayer, normalizePcbSaveState } from "./validation.ts";
import {
  clone,
  newestProject,
  timestamp,
  toLibraryComponent,
  upsertImportedComponents,
  withProjectIdentity,
} from "./workspaceRecords.ts";
import type {
  PcbWorkspaceAction,
  PcbWorkspaceState,
  SelectionSnapshot,
} from "./workspaceTypes.ts";
export type {
  NewProjectInput,
  PcbWorkspaceAction,
  PcbWorkspaceState,
  TemplateInput,
} from "./workspaceTypes.ts";

function materialize(
  state: Omit<PcbWorkspaceState, "activeProject" | "drcIssues" | "canUndo" | "canRedo">,
): PcbWorkspaceState {
  let data = state.data;
  let activeProject = data.projects.find(
    (project) => project.id === data.activeProjectId,
  );
  if (!activeProject) {
    activeProject = newestProject(data.projects) ?? createBlankProject();
    data = {
      ...data,
      projects: data.projects.length ? data.projects : [activeProject],
      activeProjectId: activeProject.id,
    };
  }
  const history = state.historyByProject[activeProject.id]
    ?? createHistoryState(activeProject);
  const pendingPlacements = data.pendingPlacementsByProject?.[activeProject.id] ?? [];
  const pendingHistory = state.pendingHistoryByProject[activeProject.id]
    ?? createHistoryState(pendingPlacements);
  const selectionHistory = state.selectionHistoryByProject[activeProject.id]
    ?? createHistoryState({
      selection: state.selection ? clone(state.selection) : null,
      selectedObjects: clone(Array.isArray(state.selectedObjects) ? state.selectedObjects : []),
    });
  const visibleLayer = isPcbVisibleLayer(state.visibleLayer) ? state.visibleLayer : "all";
  const selectedObjects = Array.isArray(selectionHistory.current.selectedObjects)
    ? selectionHistory.current.selectedObjects
    : [];
  return {
    ...state,
    data,
    activeProject: clone(activeProject),
    historyByProject: {
      ...state.historyByProject,
      [activeProject.id]: history,
    },
    pendingHistoryByProject: {
      ...state.pendingHistoryByProject,
      [activeProject.id]: pendingHistory,
    },
    selectionHistoryByProject: {
      ...state.selectionHistoryByProject,
      [activeProject.id]: selectionHistory,
    },
    drcIssues: runDrc(activeProject),
    pendingPlacements: clone(pendingPlacements),
    visibleLayer,
    selectedObjects: clone(selectedObjects),
    selection: selectionHistory.current.selection
      ? clone(selectionHistory.current.selection)
      : null,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
  };
}

function emptySelectionSnapshot(): SelectionSnapshot {
  return { selection: null, selectedObjects: [] };
}

function currentSelectionSnapshot(state: Pick<PcbWorkspaceState, "selection" | "selectedObjects">): SelectionSnapshot {
  return {
    selection: state.selection ? clone(state.selection) : null,
    selectedObjects: clone(state.selectedObjects),
  };
}

function replaceSelectionSnapshot(
  state: PcbWorkspaceState,
  snapshot: SelectionSnapshot,
  rightTab = state.rightTab,
): PcbWorkspaceState {
  const projectId = state.activeProject.id;
  const selectionHistory = state.selectionHistoryByProject[projectId]
    ?? createHistoryState(currentSelectionSnapshot(state));
  return {
    ...state,
    selection: snapshot.selection ? clone(snapshot.selection) : null,
    selectedObjects: clone(snapshot.selectedObjects),
    rightTab,
    selectionHistoryByProject: {
      ...state.selectionHistoryByProject,
      [projectId]: {
        current: clone(snapshot),
        undo: selectionHistory.undo.map(clone),
        redo: selectionHistory.redo.map(clone),
      },
    },
  };
}

export function createWorkspaceState(
  data: PcbSaveState,
  canEdit: boolean,
): PcbWorkspaceState {
  const safeData = normalizePcbSaveState(clone(data));
  const project = safeData.projects.find(
    (item) => item.id === safeData.activeProjectId,
  ) ?? newestProject(safeData.projects) ?? createBlankProject();
  if (!safeData.projects.length) safeData.projects = [project];
  safeData.activeProjectId = project.id;
  return materialize({
    data: safeData,
    historyByProject: {
      [project.id]: createHistoryState(project),
    },
    pendingHistoryByProject: {
      [project.id]: createHistoryState(
        safeData.pendingPlacementsByProject[project.id] ?? [],
      ),
    },
    selectionHistoryByProject: {
      [project.id]: createHistoryState(emptySelectionSnapshot()),
    },
    pendingPlacements: [],
    canEdit,
    documentLocked: false,
    tool: "select",
    activeLayer: "top",
    visibleLayer: "all",
    selectedObjects: [],
    zoom: 100,
    viewCenter: {
      x: project.board.width / 2,
      y: project.board.height / 2,
    },
    selection: null,
    rightTab: "board",
  });
}

function replaceProject(
  state: PcbWorkspaceState,
  project: PcbProject,
  push = true,
  pendingPlacements = state.pendingPlacements,
  selectionSnapshot = currentSelectionSnapshot(state),
): PcbWorkspaceState {
  const update = { ...clone(project), updatedAt: timestamp() };
  const previousHistory = state.historyByProject[update.id]
    ?? createHistoryState(state.activeProject);
  const history = push
    ? pushHistory(previousHistory, update)
    : createHistoryState(update);
  const previousPendingHistory = state.pendingHistoryByProject[update.id]
    ?? createHistoryState(state.pendingPlacements);
  const pendingHistory = push
    ? pushHistory(previousPendingHistory, pendingPlacements)
    : createHistoryState(pendingPlacements);
  const previousSelectionHistory = state.selectionHistoryByProject[update.id]
    ?? createHistoryState(currentSelectionSnapshot(state));
  const selectionHistory = push
    ? pushHistory(previousSelectionHistory, selectionSnapshot)
    : createHistoryState(selectionSnapshot);
  return materialize({
    ...state,
    selection: selectionSnapshot.selection ? clone(selectionSnapshot.selection) : null,
    selectedObjects: clone(selectionSnapshot.selectedObjects),
    data: {
      ...state.data,
      projects: state.data.projects.map((item) =>
        item.id === update.id ? update : clone(item),
      ),
      pendingPlacementsByProject: {
        ...(state.data.pendingPlacementsByProject ?? {}),
        [update.id]: clone(pendingPlacements),
      },
      updatedAt: update.updatedAt,
    },
    historyByProject: {
      ...state.historyByProject,
      [update.id]: history,
    },
    pendingHistoryByProject: {
      ...state.pendingHistoryByProject,
      [update.id]: pendingHistory,
    },
    selectionHistoryByProject: {
      ...state.selectionHistoryByProject,
      [update.id]: selectionHistory,
    },
  });
}

function isMutation(action: PcbWorkspaceAction): boolean {
  return ![
    "project/open",
    "tool/set",
    "layer/set",
    "view/layer",
    "zoom/set",
    "view/center",
    "view/reset",
    "selection/set",
    "selection/toggle",
    "selection/clear-group",
    "panel/right",
    "permission/set",
    "persistence/hydrate",
    "persistence/touch",
    "drc/run",
  ].includes(action.type);
}

export function reduceWorkspaceState(
  state: PcbWorkspaceState,
  action: PcbWorkspaceAction,
): PcbWorkspaceState {
  if (isMutation(action) && (!state.canEdit || state.documentLocked)
    && action.type !== "document/toggle-lock") {
    return state;
  }

  switch (action.type) {
    case "project/create": {
      const project = createBlankProject(action.input.name.trim());
      project.description = action.input.description?.trim() ?? "";
      if (action.input.width !== undefined) project.board.width = action.input.width;
      if (action.input.height !== undefined) project.board.height = action.input.height;
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: project.board.width / 2, y: project.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects.map(clone), project],
          activeProjectId: project.id,
          updatedAt: timestamp(),
        },
        historyByProject: {
          ...state.historyByProject,
          [project.id]: createHistoryState(project),
        },
      });
    }
    case "project/open": {
      if (!state.data.projects.some((project) => project.id === action.projectId)) {
        return state;
      }
      return materialize({
        ...state,
        zoom: 100,
        data: { ...state.data, activeProjectId: action.projectId },
        selection: null,
        selectedObjects: [],
        selectionHistoryByProject: {
          ...state.selectionHistoryByProject,
          [action.projectId]: createHistoryState(emptySelectionSnapshot()),
        },
        viewCenter: {
          x: state.data.projects.find((project) => project.id === action.projectId)!.board.width / 2,
          y: state.data.projects.find((project) => project.id === action.projectId)!.board.height / 2,
        },
      });
    }
    case "project/rename": {
      const project = state.data.projects.find((item) => item.id === action.projectId);
      const name = action.name.trim();
      if (!project || !name) return state;
      if (project.id === state.activeProject.id) {
        return replaceProject(state, { ...project, name });
      }
      return materialize({
        ...state,
        data: {
          ...state.data,
          projects: state.data.projects.map((item) =>
            item.id === project.id
              ? { ...clone(item), name, updatedAt: timestamp() }
              : clone(item),
          ),
        },
      });
    }
    case "project/duplicate": {
      const project = state.data.projects.find((item) => item.id === action.projectId);
      if (!project) return state;
      const copy = withProjectIdentity(project, `${project.name} 複本`);
      const sourcePending = state.data.pendingPlacementsByProject?.[project.id] ?? [];
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: copy.board.width / 2, y: copy.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects.map(clone), copy],
          activeProjectId: copy.id,
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [copy.id]: clone(sourcePending),
          },
          updatedAt: copy.updatedAt,
        },
        historyByProject: {
          ...state.historyByProject,
          [copy.id]: createHistoryState(copy),
        },
      });
    }
    case "project/delete": {
      let projects = state.data.projects.filter(
        (project) => project.id !== action.projectId,
      ).map(clone);
      if (projects.length === state.data.projects.length) return state;
      if (!projects.length) projects = [createBlankProject()];
      const activeProjectId = state.data.activeProjectId === action.projectId
        ? newestProject(projects)?.id ?? projects[0].id
        : state.data.activeProjectId;
      const deletedActiveProject = state.data.activeProjectId === action.projectId;
      const nextActive = projects.find((project) => project.id === activeProjectId) ?? projects[0];
      const historyByProject = { ...state.historyByProject };
      delete historyByProject[action.projectId];
      const selectionHistoryByProject = { ...state.selectionHistoryByProject };
      delete selectionHistoryByProject[action.projectId];
      const pendingPlacementsByProject = {
        ...(state.data.pendingPlacementsByProject ?? {}),
      };
      delete pendingPlacementsByProject[action.projectId];
      return materialize({
        ...state,
        selection: deletedActiveProject ? null : state.selection,
        selectedObjects: deletedActiveProject ? [] : state.selectedObjects,
        zoom: deletedActiveProject ? 100 : state.zoom,
        viewCenter: deletedActiveProject
          ? { x: nextActive.board.width / 2, y: nextActive.board.height / 2 }
          : state.viewCenter,
        data: {
          ...state.data,
          projects,
          activeProjectId,
          pendingPlacementsByProject,
          remoteDeletions: {
            projects: [...new Set([
              ...(state.data.remoteDeletions?.projects ?? []),
              action.projectId,
            ])],
            templates: clone(state.data.remoteDeletions?.templates ?? []),
            library: clone(state.data.remoteDeletions?.library ?? []),
          },
          updatedAt: timestamp(),
        },
        historyByProject,
        selectionHistoryByProject: deletedActiveProject
          ? {
            ...selectionHistoryByProject,
            [nextActive.id]: createHistoryState(emptySelectionSnapshot()),
          }
          : selectionHistoryByProject,
      });
    }
    case "project/import": {
      const project = withProjectIdentity(action.project);
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: project.board.width / 2, y: project.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects.map(clone), project],
          activeProjectId: project.id,
          updatedAt: project.updatedAt,
        },
        historyByProject: {
          ...state.historyByProject,
          [project.id]: createHistoryState(project),
        },
      });
    }
    case "project/commit":
      if (action.update.id !== state.activeProject.id) return state;
      return replaceProject(state, action.update);
    case "project/commit-with-bom":
      if (action.update.id !== state.activeProject.id) return state;
      return replaceProject(state, action.update, true, action.pendingPlacements);
    case "template/apply": {
      const template = state.data.templates.find((item) => item.id === action.templateId);
      if (!template) return state;
      const project = withProjectIdentity(template.project, `${template.name} 專案`);
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: project.board.width / 2, y: project.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects.map(clone), project],
          activeProjectId: project.id,
          updatedAt: project.updatedAt,
        },
        historyByProject: {
          ...state.historyByProject,
          [project.id]: createHistoryState(project),
        },
      });
    }
    case "template/save": {
      const now = timestamp();
      const template: PcbTemplate = {
        id: createId("template"),
        ...clone(action.input),
        project: clone(state.activeProject),
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
      };
      return materialize({
        ...state,
        data: {
          ...state.data,
          templates: [...state.data.templates.map(clone), template],
          updatedAt: now,
        },
      });
    }
    case "template/rename": {
      const name = action.name.trim();
      if (!name) return state;
      return materialize({
        ...state,
        data: {
          ...state.data,
          templates: state.data.templates.map((item) =>
            item.id === action.templateId && !item.isBuiltIn
              ? { ...clone(item), name, updatedAt: timestamp() }
              : clone(item),
          ),
        },
      });
    }
    case "template/duplicate": {
      const source = state.data.templates.find((item) => item.id === action.templateId);
      if (!source) return state;
      const now = timestamp();
      const copy: PcbTemplate = {
        ...clone(source),
        id: createId("template"),
        name: `${source.name} 複本`,
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
      };
      return materialize({
        ...state,
        data: {
          ...state.data,
          templates: [...state.data.templates.map(clone), copy],
          updatedAt: now,
        },
      });
    }
    case "template/delete": {
      const template = state.data.templates.find((item) => item.id === action.templateId);
      if (!template || template.isBuiltIn) return state;
      return materialize({
        ...state,
        data: {
          ...state.data,
          templates: state.data.templates.filter(
            (item) => item.id !== action.templateId || item.isBuiltIn,
          ).map(clone),
          remoteDeletions: {
            projects: clone(state.data.remoteDeletions?.projects ?? []),
            templates: [...new Set([
              ...(state.data.remoteDeletions?.templates ?? []),
              action.templateId,
            ])],
            library: clone(state.data.remoteDeletions?.library ?? []),
          },
          updatedAt: timestamp(),
        },
      });
    }
    case "library/create":
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: [...state.data.library.map(clone), toLibraryComponent(action.component)],
          updatedAt: timestamp(),
        },
      });
    case "library/edit":
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: state.data.library.map((item) =>
            item.id === action.componentId && item.source !== "built-in"
              ? { ...clone(item), ...clone(action.component) }
              : clone(item),
          ),
          updatedAt: timestamp(),
        },
      });
    case "library/duplicate": {
      const source = state.data.library.find((item) => item.id === action.componentId);
      if (!source) return state;
      const copy = {
        ...clone(source),
        id: createId("component"),
        name: `${source.name} 複本`,
        source: "custom" as const,
        createdAt: timestamp(),
      };
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: [...state.data.library.map(clone), copy],
          updatedAt: copy.createdAt,
        },
      });
    }
    case "library/delete": {
      const component = state.data.library.find((item) => item.id === action.componentId);
      if (!component || component.source === "built-in") return state;
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: state.data.library.filter(
            (item) => item.id !== action.componentId || item.source === "built-in",
          ).map(clone),
          remoteDeletions: {
            projects: clone(state.data.remoteDeletions?.projects ?? []),
            templates: clone(state.data.remoteDeletions?.templates ?? []),
            library: [...new Set([
              ...(state.data.remoteDeletions?.library ?? []),
              action.componentId,
            ])],
          },
          updatedAt: timestamp(),
        },
      });
    }
    case "library/import":
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: upsertImportedComponents(state.data.library, action.components, "custom"),
          updatedAt: timestamp(),
        },
      });
    case "bom/import": {
      let importCount = 0;
      for (const item of action.items) {
        if (
          !Number.isInteger(item.quantity)
          || item.quantity <= 0
          || item.quantity > MAX_BOM_QUANTITY_PER_ROW
          || importCount + item.quantity > MAX_BOM_TOTAL_PLACEMENTS
        ) {
          return state;
        }
        importCount += item.quantity;
      }
      const currentPending =
        state.data.pendingPlacementsByProject?.[state.activeProject.id]?.length ?? 0;
      if (currentPending + importCount > MAX_BOM_TOTAL_PLACEMENTS) return state;
      const pendingPlacements = action.items.flatMap((item) =>
        Array.from({ length: item.quantity }, () => clone(item)),
      );
      const nextPending = [
        ...(state.data.pendingPlacementsByProject?.[state.activeProject.id] ?? []).map(clone),
        ...pendingPlacements,
      ];
      const pendingHistory = state.pendingHistoryByProject[state.activeProject.id]
        ?? createHistoryState(state.pendingPlacements);
      const projectHistory = state.historyByProject[state.activeProject.id]
        ?? createHistoryState(state.activeProject);
      const selectionHistory = state.selectionHistoryByProject[state.activeProject.id]
        ?? createHistoryState(currentSelectionSnapshot(state));
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: upsertImportedComponents(state.data.library, action.items, "bom"),
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [state.activeProject.id]: nextPending,
          },
          updatedAt: timestamp(),
        },
        historyByProject: {
          ...state.historyByProject,
          [state.activeProject.id]: { ...projectHistory, redo: [] },
        },
        pendingHistoryByProject: {
          ...state.pendingHistoryByProject,
          [state.activeProject.id]: {
            current: clone(nextPending),
            undo: pendingHistory.undo.map(clone),
            redo: [],
          },
        },
        selectionHistoryByProject: {
          ...state.selectionHistoryByProject,
          [state.activeProject.id]: {
            current: clone(currentSelectionSnapshot(state)),
            undo: selectionHistory.undo.map(clone),
            redo: [],
          },
        },
      });
    }
    case "bom/remove": {
      const nextPending = state.pendingPlacements.filter(
        (_, index) => index !== action.index,
      ).map(clone);
      const pendingHistory = state.pendingHistoryByProject[state.activeProject.id]
        ?? createHistoryState(state.pendingPlacements);
      const projectHistory = state.historyByProject[state.activeProject.id]
        ?? createHistoryState(state.activeProject);
      const selectionHistory = state.selectionHistoryByProject[state.activeProject.id]
        ?? createHistoryState(currentSelectionSnapshot(state));
      return materialize({
        ...state,
        data: {
          ...state.data,
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [state.activeProject.id]: nextPending,
          },
          updatedAt: timestamp(),
        },
        historyByProject: {
          ...state.historyByProject,
          [state.activeProject.id]: { ...projectHistory, redo: [] },
        },
        pendingHistoryByProject: {
          ...state.pendingHistoryByProject,
          [state.activeProject.id]: {
            current: clone(nextPending),
            undo: pendingHistory.undo.map(clone),
            redo: [],
          },
        },
        selectionHistoryByProject: {
          ...state.selectionHistoryByProject,
          [state.activeProject.id]: {
            current: clone(currentSelectionSnapshot(state)),
            undo: selectionHistory.undo.map(clone),
            redo: [],
          },
        },
      });
    }
    case "history/undo":
    case "history/redo": {
      const history = state.historyByProject[state.activeProject.id];
      if (!history) return state;
      const nextHistory = action.type === "history/undo"
        ? undoHistory(history)
        : redoHistory(history);
      const pendingHistory = state.pendingHistoryByProject[state.activeProject.id]
        ?? createHistoryState(state.pendingPlacements);
      const nextPendingHistory = action.type === "history/undo"
        ? undoHistory(pendingHistory)
        : redoHistory(pendingHistory);
      const selectionHistory = state.selectionHistoryByProject[state.activeProject.id]
        ?? createHistoryState(currentSelectionSnapshot(state));
      const nextSelectionHistory = action.type === "history/undo"
        ? undoHistory(selectionHistory)
        : redoHistory(selectionHistory);
      const project = clone(nextHistory.current);
      const pendingPlacements = clone(nextPendingHistory.current);
      return materialize({
        ...state,
        data: {
          ...state.data,
          projects: state.data.projects.map((item) =>
            item.id === project.id ? project : clone(item),
          ),
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [project.id]: pendingPlacements,
          },
          updatedAt: timestamp(),
        },
        historyByProject: {
          ...state.historyByProject,
          [state.activeProject.id]: nextHistory,
        },
        pendingHistoryByProject: {
          ...state.pendingHistoryByProject,
          [state.activeProject.id]: nextPendingHistory,
        },
        selectionHistoryByProject: {
          ...state.selectionHistoryByProject,
          [state.activeProject.id]: nextSelectionHistory,
        },
      });
    }
    case "document/toggle-lock":
      return state.canEdit ? { ...state, documentLocked: !state.documentLocked } : state;
    case "tool/set":
      return { ...state, tool: action.tool };
    case "layer/set":
      return { ...state, activeLayer: action.layer };
    case "zoom/set":
      return { ...state, zoom: Math.min(400, Math.max(25, action.zoom)) };
    case "view/center":
      return { ...state, viewCenter: clone(action.center) };
    case "view/reset":
      return {
        ...state,
        zoom: 100,
        viewCenter: {
          x: state.activeProject.board.width / 2,
          y: state.activeProject.board.height / 2,
        },
      };
    case "selection/set":
      return replaceSelectionSnapshot(
        state,
        {
          selection: action.selection ? clone(action.selection) : null,
          selectedObjects: clone(state.selectedObjects),
        },
        action.selection ? "selection" : state.rightTab,
      );
    case "selection/toggle": {
      const selectedObjects = state.selectedObjects.includes(action.objectId)
        ? state.selectedObjects.filter((item) => item !== action.objectId)
        : [...state.selectedObjects, action.objectId];
      return replaceSelectionSnapshot(state, {
        selection: state.selection ? clone(state.selection) : null,
        selectedObjects,
      });
    }
    case "selection/duplicate": {
      const gridOffset = state.activeProject.board.gridSize > 0
        ? state.activeProject.board.gridSize
        : 1;
      if (state.selection?.kind === "keepout") {
        const duplicated = duplicateKeepout(
          state.activeProject,
          state.selection.id,
          { x: gridOffset, y: gridOffset },
        );
        if (!duplicated.ok) return state;
        return replaceProject(
          state,
          duplicated.project,
          true,
          state.pendingPlacements,
          {
            selection: { kind: "keepout", id: duplicated.keepout.id },
            selectedObjects: [duplicated.keepout.id],
          },
        );
      }

      const componentIds = state.selectedObjects.filter((objectId) =>
        state.activeProject.components.some((component) => component.instanceId === objectId));
      const sourceIds = componentIds.length
        ? componentIds
        : state.selection?.kind === "component"
          ? [state.selection.id]
          : [];
      if (!sourceIds.length) return state;

      const sources = sourceIds.map((instanceId) =>
        state.activeProject.components.find((component) => component.instanceId === instanceId));
      if (sources.some((component) => !component)) return state;

      let project = state.activeProject;
      const duplicatedIds: string[] = [];
      for (const source of sources) {
        const result = placeLibraryComponent(
          project,
          source!,
          { x: source!.x + gridOffset, y: source!.y + gridOffset },
          undefined,
          { layer: source!.layer, rotation: source!.rotation },
        );
        if (!result.ok) return state;
        project = result.project;
        duplicatedIds.push(result.component.instanceId);
      }

      const primarySourceId = state.selection?.kind === "component"
        ? state.selection.id
        : sourceIds[0];
      const primaryIndex = Math.max(0, sourceIds.indexOf(primarySourceId));
      return replaceProject(
        state,
        project,
        true,
        state.pendingPlacements,
        {
          selection: { kind: "component", id: duplicatedIds[primaryIndex] ?? duplicatedIds[0] },
          selectedObjects: duplicatedIds,
        },
      );
    }
    case "selection/clear-group":
      return replaceSelectionSnapshot(state, {
        selection: state.selection ? clone(state.selection) : null,
        selectedObjects: [],
      });
    case "panel/right":
      return { ...state, rightTab: action.tab };
    case "permission/set":
      return { ...state, canEdit: action.canEdit };
    case "persistence/hydrate":
      return createWorkspaceState(action.data, state.canEdit);
    case "persistence/touch":
      return materialize({
        ...state,
        data: { ...state.data, updatedAt: timestamp() },
      });
    case "view/layer":
      return { ...state, visibleLayer: action.layer };
    case "drc/run":
      return { ...state, drcIssues: runDrc(state.activeProject), rightTab: "drc" };
  }
}
