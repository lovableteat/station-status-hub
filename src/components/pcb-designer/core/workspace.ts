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
  return {
    ...state,
    data,
    activeProject: clone(activeProject),
    historyByProject: {
      ...state.historyByProject,
      [activeProject.id]: history,
    },
    drcIssues: runDrc(activeProject),
    pendingPlacements: clone(pendingPlacements),
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
  };
}

export function createWorkspaceState(
  data: PcbSaveState,
  canEdit: boolean,
): PcbWorkspaceState {
  const safeData = clone(data);
  safeData.pendingPlacementsByProject ??= {};
  safeData.remoteDeletions ??= { projects: [], templates: [], library: [] };
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
    pendingPlacements: [],
    canEdit,
    documentLocked: false,
    tool: "select",
    zoom: 100,
    rightTab: "board",
  });
}

function replaceProject(
  state: PcbWorkspaceState,
  project: PcbProject,
  push = true,
): PcbWorkspaceState {
  const update = { ...clone(project), updatedAt: timestamp() };
  const previousHistory = state.historyByProject[update.id]
    ?? createHistoryState(state.activeProject);
  const history = push
    ? pushHistory(previousHistory, update)
    : createHistoryState(update);
  return materialize({
    ...state,
    data: {
      ...state.data,
      projects: state.data.projects.map((item) =>
        item.id === update.id ? update : clone(item),
      ),
      updatedAt: update.updatedAt,
    },
    historyByProject: {
      ...state.historyByProject,
      [update.id]: history,
    },
  });
}

function isMutation(action: PcbWorkspaceAction): boolean {
  return ![
    "project/open",
    "tool/set",
    "zoom/set",
    "panel/right",
    "permission/set",
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
        data: { ...state.data, activeProjectId: action.projectId },
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
      const historyByProject = { ...state.historyByProject };
      delete historyByProject[action.projectId];
      const pendingPlacementsByProject = {
        ...(state.data.pendingPlacementsByProject ?? {}),
      };
      delete pendingPlacementsByProject[action.projectId];
      return materialize({
        ...state,
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
      });
    }
    case "project/import": {
      const project = withProjectIdentity(action.project);
      return materialize({
        ...state,
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
    case "template/apply": {
      const template = state.data.templates.find((item) => item.id === action.templateId);
      if (!template) return state;
      const project = withProjectIdentity(template.project, `${template.name} 專案`);
      return materialize({
        ...state,
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
      const pendingPlacements = action.items.flatMap((item) =>
        Array.from({ length: item.quantity }, () => clone(item)),
      );
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: upsertImportedComponents(state.data.library, action.items, "bom"),
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [state.activeProject.id]: [
              ...(state.data.pendingPlacementsByProject?.[state.activeProject.id] ?? []).map(clone),
              ...pendingPlacements,
            ],
          },
          updatedAt: timestamp(),
        },
      });
    }
    case "bom/remove":
      return materialize({
        ...state,
        data: {
          ...state.data,
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [state.activeProject.id]: state.pendingPlacements.filter(
              (_, index) => index !== action.index,
            ).map(clone),
          },
          updatedAt: timestamp(),
        },
      });
    case "history/undo":
    case "history/redo": {
      const history = state.historyByProject[state.activeProject.id];
      if (!history) return state;
      const nextHistory = action.type === "history/undo"
        ? undoHistory(history)
        : redoHistory(history);
      const project = clone(nextHistory.current);
      return materialize({
        ...state,
        data: {
          ...state.data,
          projects: state.data.projects.map((item) =>
            item.id === project.id ? project : clone(item),
          ),
          updatedAt: timestamp(),
        },
        historyByProject: {
          ...state.historyByProject,
          [state.activeProject.id]: nextHistory,
        },
      });
    }
    case "document/toggle-lock":
      return state.canEdit ? { ...state, documentLocked: !state.documentLocked } : state;
    case "tool/set":
      return { ...state, tool: action.tool };
    case "zoom/set":
      return { ...state, zoom: Math.min(400, Math.max(25, action.zoom)) };
    case "panel/right":
      return { ...state, rightTab: action.tab };
    case "permission/set":
      return { ...state, canEdit: action.canEdit };
    case "persistence/touch":
      return materialize({
        ...state,
        data: { ...state.data, updatedAt: timestamp() },
      });
    case "drc/run":
      return { ...state, drcIssues: runDrc(state.activeProject), rightTab: "drc" };
  }
}
