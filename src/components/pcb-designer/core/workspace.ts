import { applyProjectSettings } from "./projectSettingsDraft.ts";
import { objectRevision, projectRevision } from "./workspaceRevision.ts";
import { createBlankProject, createId } from "../defaults.ts";
import type {
  PcbProject,
  PcbSaveState,
  PcbSelection,
  PcbTemplate,
} from "../types.ts";
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
} from "./history.ts";
import { runDrc } from "./drc.ts";
import { deletePcbSelection, duplicatePcbSelection } from "./selection.ts";
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

const EMPTY_PENDING: PcbWorkspaceState["pendingPlacements"] = [];

function normalizeRightTab(value: unknown): PcbWorkspaceState["rightTab"] {
  if (value === "selection" || value === "objects") return "objects";
  if (value === "drc" || value === "checks") return "checks";
  return "board";
}

function materialize(
  state: Omit<PcbWorkspaceState, "activeProject" | "drcIssues" | "canUndo" | "canRedo"> & { activeProject?: PcbProject; drcIssues?: PcbWorkspaceState["drcIssues"] },
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
  const pendingPlacements = data.pendingPlacementsByProject?.[activeProject.id] ?? EMPTY_PENDING;
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
    // Async model imports belong to the document and placement queue they started with.
    projectGeneration: state.projectGeneration + Number(Boolean(state.activeProject && (
      state.activeProject.id !== activeProject.id || state.activeProject.updatedAt !== activeProject.updatedAt
      || (state.pendingPlacements !== pendingPlacements && objectRevision(state.pendingPlacements) !== objectRevision(pendingPlacements))
    ))),
    data,
    activeProject,
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
    drcIssues: state.activeProject === activeProject && state.drcIssues ? state.drcIssues : runDrc(activeProject),
    pendingPlacements,
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

function selectionForObject(state: PcbWorkspaceState, objectId: string): PcbSelection | null {
  if (state.activeProject.components.some((component) => component.instanceId === objectId)) {
    return { kind: "component", id: objectId };
  }
  if (state.activeProject.keepouts.some((keepout) => keepout.id === objectId)) {
    return { kind: "keepout", id: objectId };
  }
  if (state.activeProject.measurements.some((measurement) => measurement.id === objectId)) {
    return { kind: "measurement", id: objectId };
  }
  return null;
}

function isSelectionVisible(
  state: PcbWorkspaceState,
  selection: PcbSelection,
  layer: PcbWorkspaceState["visibleLayer"],
) {
  if (layer === "all" || selection.kind !== "component") return true;
  return state.activeProject.components.some(
    (component) => component.instanceId === selection.id && component.layer === layer,
  );
}

export function createWorkspaceState(
  data: PcbSaveState,
  canEdit: boolean,
): PcbWorkspaceState {
  const safeData = normalizePcbSaveState(data);
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
    projectGeneration: 0,
    canEdit,
    transitionBusy: false,
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
    rightTab: normalizeRightTab((data as PcbSaveState & { rightTab?: unknown }).rightTab),
  });
}

function nextProjectRevision(previous: string): string {
  // Cloud upserts ignore older revisions, including snapshots restored by undo.
  return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
}

function replaceProject(
  state: PcbWorkspaceState,
  project: PcbProject,
  push = true,
  pendingPlacements = state.pendingPlacements,
  selectionSnapshot = currentSelectionSnapshot(state),
): PcbWorkspaceState {
  const previous = state.data.projects.find((item) => item.id === project.id) ?? state.activeProject;
  const update = { ...clone(project), updatedAt: nextProjectRevision(previous.updatedAt) };
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
  const nextPendingPlacements = pendingPlacements === state.pendingPlacements ? pendingPlacements : clone(pendingPlacements);
  return materialize({
    ...state,
    selection: selectionSnapshot.selection ? clone(selectionSnapshot.selection) : null,
    selectedObjects: clone(selectionSnapshot.selectedObjects),
    data: {
      ...state.data,
      projects: state.data.projects.map((item) =>
        item.id === update.id ? update : item,
      ),
      pendingPlacementsByProject: {
        ...(state.data.pendingPlacementsByProject ?? {}),
        [update.id]: nextPendingPlacements,
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
    "selection/set-many",
    "selection/toggle",
    "selection/clear-group",
    "panel/right",
    "permission/set",
    "persistence/hydrate",
    "persistence/touch",
    "drc/run",
  ].includes(action.type);
}

/** Actions that change the open board's content; an approved board refuses them (防誤改, not an audit trail). */
const APPROVED_BOARD_LOCKED_ACTIONS = new Set<PcbWorkspaceAction["type"]>([
  "project/commit", "project/commit-with-bom", "selection/delete", "selection/duplicate",
  "history/undo", "history/redo", "bom/import", "bom/remove", "model/assign",
]);

/** True when the open board is 已核准 and the action would change it. Moving it back to 草稿/審核中 is allowed. */
export function isBlockedByApproval(state: Pick<PcbWorkspaceState, "activeProject">, action: PcbWorkspaceAction): boolean {
  if (state.activeProject.status !== "approved") return false;
  if (APPROVED_BOARD_LOCKED_ACTIONS.has(action.type)) return true;
  if (action.type === "project/rename") return action.projectId === state.activeProject.id;
  if (action.type === "project/settings") return action.projectId === state.activeProject.id && action.settings.status === "approved";
  return false;
}

export function reduceWorkspaceState(
  state: PcbWorkspaceState,
  action: PcbWorkspaceAction,
): PcbWorkspaceState {
  if (action.type === "transition/set-busy") return { ...state, transitionBusy: action.busy,
    projectGeneration: state.projectGeneration + Number(action.busy && !state.transitionBusy) };
  if (action.type === "project/discard") {
    if (!action.project) {
      if (action.projectId !== state.activeProject.id || state.data.projects.length < 2) return state;
      const projects = state.data.projects.filter(project => project.id !== action.projectId);
      const pendingPlacementsByProject = { ...state.data.pendingPlacementsByProject };
      const historyByProject = { ...state.historyByProject };
      const pendingHistoryByProject = { ...state.pendingHistoryByProject };
      const selectionHistoryByProject = { ...state.selectionHistoryByProject };
      delete pendingPlacementsByProject[action.projectId];
      delete historyByProject[action.projectId];
      delete pendingHistoryByProject[action.projectId];
      delete selectionHistoryByProject[action.projectId];
      return materialize({ ...state, historyByProject, pendingHistoryByProject, selectionHistoryByProject,
        selection: null, selectedObjects: [], tool: "select",
        data: { ...state.data, projects, activeProjectId: projects[0].id, pendingPlacementsByProject, updatedAt: timestamp() } });
    }
    if (action.project.id !== state.activeProject.id) return state;
    return replaceProject({ ...state, tool: "select" }, action.project, false, action.pendingPlacements, emptySelectionSnapshot());
  }
  if (action.type === "project/settings") {
    const project = state.canEdit && !state.documentLocked && !state.transitionBusy && action.projectId === state.activeProject.id
      && !isBlockedByApproval(state, action)
      ? applyProjectSettings(state.activeProject, action.baselineRevision, action.settings, action.actor) : null;
    return {
      ...(project ? replaceProject(state, project) : state),
      projectSettingsReceipt: { requestToken: action.requestToken, accepted: Boolean(project) },
    };
  }
  if (action.type === "model/assign") {
    const component = state.activeProject.components.find((item) => item.instanceId === action.componentId);
    const accepted = state.canEdit && !state.documentLocked && !state.transitionBusy
      && action.projectId === state.activeProject.id && action.generation === state.projectGeneration
      && Boolean(component && !component.locked) && !isBlockedByApproval(state, action);
    if (!accepted) return { ...state,
      modelAssignmentReceipt: { requestToken: action.requestToken, accepted: false, generation: state.projectGeneration } };
    const updated = replaceProject(state, {
      ...state.activeProject,
      components: state.activeProject.components.map((item) =>
        item.instanceId === action.componentId ? { ...item, modelAssetId: action.metadata.id } : item,
      ),
    });
    return materialize({
      ...updated,
      modelAssignmentReceipt: { requestToken: action.requestToken, accepted: true, generation: updated.projectGeneration },
      data: { ...updated.data, modelAssets: { ...updated.data.modelAssets, [action.metadata.id]: clone(action.metadata) } },
    });
  }
  if (isBlockedByApproval(state, action)) return state;
  if (state.transitionBusy && (isMutation(action) || ["project/open", "persistence/hydrate", "persistence/touch"].includes(action.type))) return state;
  if (isMutation(action) && (!state.canEdit || state.documentLocked)
    && action.type !== "document/toggle-lock") {
    return state;
  }

  switch (action.type) {
    case "project/create": {
      const project = createBlankProject(action.input.name.trim());
      project.description = action.input.description?.trim() ?? "";
      project.projectGroup = action.input.projectGroup?.trim() ?? "";
      project.revision = action.input.revision?.trim() || "1";
      project.boardFamilyId = project.id;
      if (action.input.owner) project.owner = clone(action.input.owner);
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
          projects: [...state.data.projects, project],
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
      const updatedAt = nextProjectRevision(project.updatedAt);
      return materialize({
        ...state,
        data: {
          ...state.data,
          projects: state.data.projects.map((item) =>
            item.id === project.id
              ? { ...clone(item), name, updatedAt }
              : item,
          ),
          updatedAt,
        },
      });
    }
    case "project/duplicate": {
      const project = state.data.projects.find((item) => item.id === action.projectId);
      if (!project) return state;
      const copy = withProjectIdentity(project, `${project.name} 複本`);
      if (action.newRevision) {
        copy.name = project.name;
        copy.boardFamilyId = project.boardFamilyId ?? project.id;
        copy.status = "draft";
        const used = new Set(state.data.projects.filter(p => (p.boardFamilyId ?? p.id) === copy.boardFamilyId).map(p => p.revision ?? "1"));
        const match = (project.revision || "1").match(/^(.*?)(\d+)$/);
        const prefix = match ? match[1] : `${project.revision}.`;
        let number = match ? BigInt(match[2]) + BigInt(1) : BigInt(1);
        while (used.has(`${prefix}${number}`)) number++;
        copy.revision = `${prefix}${number}`;
      } else {
        copy.boardFamilyId = copy.id;
        copy.revision = "1";
        copy.status = "draft";
      }
      const sourcePending = state.data.pendingPlacementsByProject?.[project.id] ?? [];
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: copy.board.width / 2, y: copy.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects, copy],
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
      );
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
      const project = { ...withProjectIdentity(action.project), status: "draft" as const };
      project.boardFamilyId = project.id;
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: project.board.width / 2, y: project.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects, project],
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
      const project = { ...withProjectIdentity(template.project, `${template.name} 新板子`), status: "draft" as const };
      project.boardFamilyId = project.id;
      return materialize({
        ...state,
        selection: null,
        selectedObjects: [],
        zoom: 100,
        viewCenter: { x: project.board.width / 2, y: project.board.height / 2 },
        data: {
          ...state.data,
          projects: [...state.data.projects, project],
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
          templates: [template, ...state.data.templates.map(clone)],
          updatedAt: now,
        },
      });
    }
    case "template/rename": {
      const name = action.name.trim();
      const template = state.data.templates.find((item) => item.id === action.templateId);
      if (!name || !template || template.isBuiltIn || template.name === name) return state;
      const now = timestamp();
      return materialize({
        ...state,
        data: {
          ...state.data,
          templates: state.data.templates.map((item) =>
            item.id === action.templateId
              ? { ...clone(item), name, updatedAt: now }
              : clone(item),
          ),
          updatedAt: now,
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
          templates: state.data.templates.flatMap((item) =>
            item.id === source.id ? [clone(item), copy] : [clone(item)]),
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
    case "library/import-model": {
      const component = {
        ...toLibraryComponent(action.component),
        modelAssetId: action.metadata.id,
      };
      return materialize({
        ...state,
        data: {
          ...state.data,
          library: [...state.data.library.map(clone), component],
          modelAssets: {
            ...(state.data.modelAssets ?? {}),
            [action.metadata.id]: clone(action.metadata),
          },
          updatedAt: timestamp(),
        },
      });
    }
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
      if (!history || !(action.type === "history/undo" ? history.undo : history.redo).length) return state;
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
      project.updatedAt = nextProjectRevision(state.activeProject.updatedAt);
      // 狀態 only changes through 板子設定, which records who and when; undo/redo never switches it back or forward.
      project.status = state.activeProject.status;
      if (state.activeProject.statusChange) project.statusChange = clone(state.activeProject.statusChange);
      else delete project.statusChange;
      nextHistory.current = clone(project);
      const pendingPlacements = clone(nextPendingHistory.current);
      return materialize({
        ...state,
        data: {
          ...state.data,
          projects: state.data.projects.map((item) =>
            item.id === project.id ? project : item,
          ),
          pendingPlacementsByProject: {
            ...(state.data.pendingPlacementsByProject ?? {}),
            [project.id]: pendingPlacements,
          },
          updatedAt: project.updatedAt,
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
      return state.canEdit ? { ...state, documentLocked: !state.documentLocked, projectGeneration: state.projectGeneration + 1 } : state;
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
        action.selection ? "objects" : state.rightTab,
      );
    case "selection/set-many": {
      const requestedIds = [...new Set(action.objectIds)]
        .filter((objectId) => selectionForObject(state, objectId));
      const selectedObjects = action.additive
        ? [...new Set([
          ...state.selectedObjects,
          ...(state.selection ? [state.selection.id] : []),
          ...requestedIds,
        ])]
        : requestedIds;
      const preferredId = requestedIds.at(-1)
        ?? (state.selection && selectedObjects.includes(state.selection.id) ? state.selection.id : selectedObjects[0]);
      return replaceSelectionSnapshot(
        state,
        {
          selection: preferredId ? selectionForObject(state, preferredId) : null,
          selectedObjects,
        },
        selectedObjects.length ? "objects" : state.rightTab,
      );
    }
    case "selection/toggle": {
      const currentIds = new Set([
        ...state.selectedObjects,
        ...(state.selection ? [state.selection.id] : []),
      ]);
      if (currentIds.has(action.objectId)) currentIds.delete(action.objectId);
      else currentIds.add(action.objectId);
      const selectedObjects = [...currentIds];
      const preferredId = currentIds.has(action.objectId)
        ? action.objectId
        : state.selection && currentIds.has(state.selection.id)
          ? state.selection.id
          : selectedObjects[0];
      return replaceSelectionSnapshot(state, {
        selection: preferredId ? selectionForObject(state, preferredId) : null,
        selectedObjects,
      }, selectedObjects.length ? "objects" : state.rightTab);
    }
    case "selection/delete": {
      const result = deletePcbSelection(state.activeProject, [
        ...state.selectedObjects,
        ...(state.selection ? [state.selection.id] : []),
      ]);
      if (!result.ok) return state;
      return replaceProject(state, result.project, true, state.pendingPlacements, emptySelectionSnapshot());
    }
    case "selection/duplicate": {
      const sourceIds = action.objectIds?.length
        ? action.objectIds
        : [...new Set([
          ...state.selectedObjects,
          ...(state.selection ? [state.selection.id] : []),
        ])];
      if (!sourceIds.length) return state;
      const duplicated = duplicatePcbSelection(state.activeProject, sourceIds);
      if (!duplicated) return state;
      const primarySourceId = state.selection && sourceIds.includes(state.selection.id)
        ? state.selection.id
        : sourceIds[0];
      const primaryId = duplicated.idMap.get(primarySourceId) ?? duplicated.objectIds[0];
      return replaceProject(
        state,
        duplicated.project,
        true,
        state.pendingPlacements,
        {
          selection: selectionForObject(
            { ...state, activeProject: duplicated.project },
            primaryId,
          ),
          selectedObjects: duplicated.objectIds,
        },
      );
    }
    case "selection/clear-group":
      return replaceSelectionSnapshot(state, {
        selection: state.selection ? clone(state.selection) : null,
        selectedObjects: [],
      });
    case "panel/right":
      return { ...state, rightTab: normalizeRightTab(action.tab) };
    case "permission/set":
      return { ...state, canEdit: action.canEdit, projectGeneration: state.projectGeneration + Number(state.canEdit !== action.canEdit) };
    case "persistence/hydrate": {
      // A queued hydration can supersede an accepted local settings action before
      // its receipt is observed. Resolve that token conservatively, retaining the raw draft.
      const hydrated = { ...createWorkspaceState(action.data, state.canEdit),
        modelAssignmentReceipt: state.modelAssignmentReceipt,
        projectSettingsReceipt: state.projectSettingsReceipt ? { ...state.projectSettingsReceipt, accepted: false } : undefined };
      const unchangedProjects = new Set<string>();
      for (const [index, project] of hydrated.data.projects.entries()) {
        const previous = state.data.projects.find((item) => item.id === project.id);
        const pending = hydrated.data.pendingPlacementsByProject?.[project.id] ?? EMPTY_PENDING;
        const previousPending = state.data.pendingPlacementsByProject?.[project.id] ?? EMPTY_PENDING;
        const unchanged = previous && (previous === project || projectRevision(previous, true) === projectRevision(project, true))
          && (previousPending === pending || objectRevision(previousPending) === objectRevision(pending));
        if (unchanged) unchangedProjects.add(project.id);
        if (unchanged && previous.updatedAt === project.updatedAt && previous.lastEditedBy === project.lastEditedBy
          && previous.lastEditedById === project.lastEditedById) hydrated.data.projects[index] = previous;
        if (unchanged && hydrated.data.pendingPlacementsByProject?.[project.id]) hydrated.data.pendingPlacementsByProject[project.id] = previousPending;
        hydrated.historyByProject[project.id] = unchanged && state.historyByProject[project.id]
          ? { ...state.historyByProject[project.id], current: clone(project) }
          : createHistoryState(project);
        hydrated.pendingHistoryByProject[project.id] = unchanged && state.pendingHistoryByProject[project.id]
          ? state.pendingHistoryByProject[project.id] : createHistoryState(pending);
        hydrated.selectionHistoryByProject[project.id] = unchanged && state.selectionHistoryByProject[project.id]
          ? state.selectionHistoryByProject[project.id] : createHistoryState(emptySelectionSnapshot());
      }
      hydrated.activeProject = hydrated.data.projects.find(project => project.id === hydrated.activeProject.id)!;
      if (hydrated.activeProject === state.activeProject) hydrated.drcIssues = state.drcIssues;
      const preserve = action.preserveView;
      if (!preserve) return materialize({ ...hydrated,
        projectGeneration: state.projectGeneration + Number(hydrated.activeProject.id !== state.activeProject.id || !unchangedProjects.has(hydrated.activeProject.id)),
        documentLocked: hydrated.activeProject.id === state.activeProject.id && state.documentLocked });
      const requestedProject = preserve.activeProjectId
        ? hydrated.data.projects.find((project) => project.id === preserve.activeProjectId)
        : undefined;
      const activeProject = requestedProject ?? hydrated.activeProject;
      const hydratedSelectionState = { ...hydrated, activeProject };
      const preservedObjectIds = [
        ...(Array.isArray(preserve.selectedObjects) ? preserve.selectedObjects : []),
        ...(preserve.selection ? [preserve.selection.id] : []),
      ];
      const selectedObjects = preservedObjectIds
        .filter((objectId) => selectionForObject(hydratedSelectionState, objectId))
        .filter((objectId, index, objectIds) => objectIds.indexOf(objectId) === index);
      const preservedSelection = preserve.selection && selectionForObject(hydratedSelectionState, preserve.selection.id)
        ? clone(preserve.selection)
        : null;
      const selection = preservedSelection
        ?? (selectedObjects[0] ? selectionForObject(hydratedSelectionState, selectedObjects[0]) : null);
      const selectionHistory = hydrated.selectionHistoryByProject[activeProject.id]
        ?? createHistoryState(emptySelectionSnapshot());
      return materialize({
        ...hydrated,
        activeProject,
        drcIssues: activeProject === state.activeProject ? state.drcIssues : runDrc(activeProject),
        pendingPlacements: hydrated.data.pendingPlacementsByProject?.[activeProject.id] ?? [],
        projectGeneration: state.projectGeneration + Number(activeProject.id !== state.activeProject.id || !unchangedProjects.has(activeProject.id)),
        documentLocked: activeProject.id === state.activeProject.id && state.documentLocked,
        data: { ...hydrated.data, activeProjectId: activeProject.id },
        activeLayer: preserve.activeLayer,
        visibleLayer: preserve.visibleLayer,
        rightTab: normalizeRightTab(preserve.rightTab),
        zoom: preserve.zoom,
        viewCenter: clone(preserve.viewCenter),
        selection,
        selectedObjects,
        selectionHistoryByProject: {
          ...hydrated.selectionHistoryByProject,
          [activeProject.id]: {
            ...selectionHistory,
            current: { selection: selection ? clone(selection) : null, selectedObjects: clone(selectedObjects) },
          },
        },
      });
    }
    case "persistence/touch":
      return materialize({
        ...state,
        data: { ...state.data, updatedAt: timestamp() },
      });
    case "view/layer": {
      const nextState = { ...state, visibleLayer: action.layer };
      const selectedObjects = state.selectedObjects.filter((objectId) => {
        const selection = selectionForObject(state, objectId);
        return selection ? isSelectionVisible(nextState, selection, action.layer) : false;
      });
      const selection = state.selection && isSelectionVisible(nextState, state.selection, action.layer)
        ? state.selection
        : selectedObjects[0]
          ? selectionForObject(nextState, selectedObjects[0])
          : null;
      return replaceSelectionSnapshot(nextState, { selection, selectedObjects });
    }
    case "drc/run":
      return {
        ...state,
        drcIssues: runDrc(state.activeProject),
        rightTab: "checks",
      };
  }
}
