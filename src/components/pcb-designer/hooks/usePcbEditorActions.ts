import { useCallback, useEffect, useRef, type Dispatch } from "react";
import { toast } from "@/hooks/use-toast";
import {
  arrangeComponents as arrangeComponentsRecord,
  createKeepout as createKeepoutRecord,
  createMeasurement as createMeasurementRecord,
  duplicateKeepout as duplicateKeepoutRecord,
  editSelectedObject,
  moveComponent as moveComponentRecord,
  moveComponents as moveComponentsRecord,
  moveKeepout as moveKeepoutRecord,
  moveObjects as moveObjectsRecord,
  normalizeRotation,
  placeLibraryComponent as placeComponentRecord,
  selectionCenter,
  type GroupMoveResult,
  type KeepoutDuplicateResult,
  type MoveResult,
  type ObjectGroupMoveResult,
  type KeepoutMoveResult,
  type PcbPlacementOptions,
  type PlacementResult,
} from "../core/editor.ts";
import type {
  PcbComponentArrangement,
  PcbKeepout,
  PcbMeasurement,
  PcbPlacedComponent,
  PcbPoint,
  PcbProject,
  PcbSelection,
  PcbTool,
} from "../types.ts";
import type {
  PcbWorkspaceAction,
  PcbWorkspaceState,
} from "../core/workspaceTypes.ts";
import { libraryIdentity } from "../core/workspaceRecords.ts";
import { isValidBoard } from "../core/validation.ts";

export const MAX_AUTO_PLACE_ITEMS = 50;
export const MAX_AUTO_PLACE_COLLISION_TESTS = 1_000_000;

const ARRANGEMENT_LABELS: Record<PcbComponentArrangement, string> = {
  "align-left": "靠左對齊",
  "align-horizontal-center": "水平置中",
  "align-right": "靠右對齊",
  "align-top": "靠上對齊",
  "align-vertical-center": "垂直置中",
  "align-bottom": "靠下對齊",
  "distribute-horizontal": "水平均分",
  "distribute-vertical": "垂直均分",
};

const ARRANGEMENT_SHORTCUTS: Record<string, PcbComponentArrangement> = {
  l: "align-left",
  c: "align-horizontal-center",
  r: "align-right",
  t: "align-top",
  m: "align-vertical-center",
  b: "align-bottom",
  h: "distribute-horizontal",
  v: "distribute-vertical",
};

export function usePcbEditorActions(
  state: PcbWorkspaceState,
  dispatch: Dispatch<PcbWorkspaceAction>,
) {
  const toolBeforeSpaceRef = useRef<PcbTool | null>(null);
  const placeLibraryComponent = useCallback(
    (
      componentId: string,
      preferred?: PcbPoint,
      options?: Omit<PcbPlacementOptions, "layer">,
    ): PlacementResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法放置元件。" };
      }
      const component = state.data.library.find((item) => item.id === componentId);
      if (!component) return { ok: false, reason: "找不到元件庫項目。" };
      const result = placeComponentRecord(
        state.activeProject,
        component,
        preferred,
        undefined,
        { layer: state.activeLayer, ...options },
      );
      if (result.ok) dispatch({ type: "project/commit", update: result.project });
      return result;
    },
    [dispatch, state.activeLayer, state.activeProject, state.canEdit, state.data.library, state.documentLocked],
  );

  const placePendingPlacement = useCallback(
    (index: number, preferred?: PcbPoint): PlacementResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法放置元件。" };
      }
      const pending = state.pendingPlacements[index];
      if (!pending) return { ok: false, reason: "找不到待放置 BOM 項目。" };
      const component = state.data.library.find((item) =>
        libraryIdentity(item) === libraryIdentity(pending));
      if (!component) return { ok: false, reason: "BOM 項目尚未建立對應元件庫資料。" };
      const result = placeComponentRecord(
        state.activeProject,
        component,
        preferred,
        pending.reference,
        { layer: state.activeLayer },
      );
      if (result.ok) {
        dispatch({
          type: "project/commit-with-bom",
          update: result.project,
          pendingPlacements: state.pendingPlacements.filter((_, itemIndex) => itemIndex !== index),
        });
      }
      return result;
    },
    [
      dispatch,
      state.activeProject,
      state.activeLayer,
      state.canEdit,
      state.data.library,
      state.documentLocked,
      state.pendingPlacements,
    ],
  );

  const autoPlacePending = useCallback(() => {
    if (!state.canEdit || state.documentLocked) {
      return {
        placed: 0,
        failed: state.pendingPlacements.length,
        deferred: 0,
        limited: false,
      };
    }
    let project = state.activeProject;
    const placedIndexes: number[] = [];
    const batch = state.pendingPlacements.slice(0, MAX_AUTO_PLACE_ITEMS);
    const worstCaseObstacles = Math.max(
      1,
      project.components.length + project.keepouts.length + batch.length,
    );
    const checksPerItem = Math.max(
      1,
      Math.floor(
        MAX_AUTO_PLACE_COLLISION_TESTS
        / Math.max(1, batch.length * worstCaseObstacles),
      ),
    );
    let attempted = 0;
    let limited = false;
    for (let index = 0; index < batch.length; index += 1) {
      const pending = batch[index];
      attempted += 1;
      const component = state.data.library.find((item) =>
        libraryIdentity(item) === libraryIdentity(pending));
      if (!component) continue;
      const result = placeComponentRecord(
        project,
        component,
        undefined,
        pending.reference,
        { maxChecks: checksPerItem, layer: state.activeLayer },
      );
      if (result.ok) {
        project = result.project;
        placedIndexes.push(index);
      } else if ("code" in result && result.code === "search-limit") {
        limited = true;
        break;
      }
    }
    if (placedIndexes.length) {
      const placed = new Set(placedIndexes);
      const deferredPlacements = state.pendingPlacements.slice(attempted);
      const attemptedFailures = batch
        .slice(0, attempted)
        .filter((_, index) => !placed.has(index));
      dispatch({
        type: "project/commit-with-bom",
        update: project,
        pendingPlacements: [
          ...deferredPlacements,
          ...attemptedFailures,
        ],
      });
    } else if (attempted < state.pendingPlacements.length) {
      dispatch({
        type: "project/commit-with-bom",
        update: project,
        pendingPlacements: [
          ...state.pendingPlacements.slice(attempted),
          ...batch.slice(0, attempted),
        ],
      });
    }
    return {
      placed: placedIndexes.length,
      failed: attempted - placedIndexes.length,
      deferred: state.pendingPlacements.length - attempted,
      limited,
    };
  }, [
    dispatch,
    state.activeProject,
    state.activeLayer,
    state.canEdit,
    state.data.library,
    state.documentLocked,
    state.pendingPlacements,
  ]);

  const selectObject = useCallback(
    (selection: PcbSelection | null) => dispatch({ type: "selection/set", selection }),
    [dispatch],
  );
  const setViewCenter = useCallback(
    (center: PcbPoint) => dispatch({ type: "view/center", center }),
    [dispatch],
  );
  const resetView = useCallback(() => dispatch({ type: "view/reset" }), [dispatch]);
  const moveComponent = useCallback(
    (instanceId: string, point: PcbPoint, bypassSnap = false): MoveResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法移動元件。" };
      }
      const result = moveComponentRecord(state.activeProject, instanceId, point, bypassSnap);
      if (result.ok && result.changed) dispatch({ type: "project/commit", update: result.project });
      return result;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const moveComponents = useCallback(
    (
      instanceIds: readonly string[],
      delta: PcbPoint,
      bypassSnap = false,
    ): GroupMoveResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法群組移動元件。" };
      }
      const result = moveComponentsRecord(state.activeProject, instanceIds, delta, bypassSnap);
      if (result.ok && result.changed) {
        dispatch({ type: "project/commit", update: result.project });
      }
      return result;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const moveObjects = useCallback(
    (
      objectIds: readonly string[],
      delta: PcbPoint,
      bypassSnap = false,
    ): ObjectGroupMoveResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法移動選取群組。" };
      }
      const result = moveObjectsRecord(state.activeProject, objectIds, delta, bypassSnap);
      if (result.ok && result.changed) {
        dispatch({ type: "project/commit", update: result.project });
      }
      return result;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const arrangeSelectedComponents = useCallback(
    (arrangement: PcbComponentArrangement) => {
      if (!state.canEdit || state.documentLocked) {
        toast({
          title: "目前無法調整元件",
          description: "文件已鎖定或目前為唯讀。",
          variant: "destructive",
        });
        return false;
      }
      const selectedIds = new Set([
        ...state.selectedObjects,
        ...(state.selection?.kind === "component" ? [state.selection.id] : []),
      ]);
      const componentIds = state.activeProject.components
        .filter((component) => selectedIds.has(component.instanceId))
        .map((component) => component.instanceId);
      const result = arrangeComponentsRecord(state.activeProject, componentIds, arrangement);
      if (!result.ok) {
        toast({
          title: `無法${ARRANGEMENT_LABELS[arrangement]}`,
          description: result.reason,
          variant: "destructive",
        });
        return false;
      }
      if (!result.changed) {
        toast({
          title: `已${ARRANGEMENT_LABELS[arrangement]}`,
          description: "選取的元件目前已位於目標位置。",
        });
        return true;
      }
      dispatch({ type: "project/commit", update: result.project });
      toast({
        title: `已${ARRANGEMENT_LABELS[arrangement]}`,
        description: `已調整 ${result.components.length} 個元件，可按 Ctrl+Z 復原。`,
      });
      return true;
    },
    [
      dispatch,
      state.activeProject,
      state.canEdit,
      state.documentLocked,
      state.selectedObjects,
      state.selection,
    ],
  );
  const moveKeepout = useCallback(
    (id: string, point: PcbPoint, bypassSnap = false): KeepoutMoveResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法移動禁制區。" };
      }
      const result = moveKeepoutRecord(state.activeProject, id, point, bypassSnap);
      if (result.ok && result.changed) dispatch({ type: "project/commit", update: result.project });
      return result;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const duplicateKeepout = useCallback(
    (id: string, offset: PcbPoint): KeepoutDuplicateResult => {
      if (!state.canEdit || state.documentLocked) {
        return { ok: false, reason: "文件已鎖定或目前為唯讀，無法複製禁制區。" };
      }
      const result = duplicateKeepoutRecord(state.activeProject, id, offset);
      if (result.ok) {
        dispatch({ type: "project/commit", update: result.project });
        dispatch({ type: "selection/set", selection: { kind: "keepout", id: result.keepout.id } });
      }
      return result;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const updateBoard = useCallback(
    (patch: Partial<PcbProject["board"]>) => {
      if (!state.canEdit || state.documentLocked) return false;
      const board = { ...state.activeProject.board, ...patch };
      if (!isValidBoard(board)) return false;
      dispatch({ type: "project/commit", update: { ...state.activeProject, board } });
      return true;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const updateComponent = useCallback(
    (instanceId: string, patch: Partial<PcbPlacedComponent>) => {
      if (!state.canEdit || state.documentLocked) return false;
      const source = state.activeProject.components.find((item) => item.instanceId === instanceId);
      if (!source || source.locked) return false;
      const candidate = {
        ...source,
        ...patch,
        ...(patch.rotation === undefined ? {} : { rotation: normalizeRotation(patch.rotation) }),
      };
      if (![candidate.width, candidate.height, candidate.maxHeight, candidate.x, candidate.y, candidate.rotation].every(Number.isFinite)) return false;
      if (candidate.width <= 0 || candidate.height <= 0 || candidate.maxHeight <= 0) return false;
      if (JSON.stringify(candidate) === JSON.stringify(source)) return false;
      dispatch({
        type: "project/commit",
        update: {
          ...state.activeProject,
          components: state.activeProject.components.map((item) =>
            item.instanceId === instanceId ? candidate : item),
        },
      });
      return true;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const updateKeepout = useCallback(
    (id: string, patch: Partial<PcbKeepout>) => {
      if (!state.canEdit || state.documentLocked) return false;
      const source = state.activeProject.keepouts.find((item) => item.id === id);
      if (!source) return false;
      const keepout = { ...source, ...patch };
      if (![keepout.x, keepout.y, keepout.width, keepout.height, keepout.rotation ?? 0].every(Number.isFinite)) return false;
      if (keepout.width <= 0 || keepout.height <= 0) return false;
      keepout.rotation = normalizeRotation(keepout.rotation ?? 0);
      if (
        keepout.x < 0
        || keepout.y < 0
        || keepout.x + keepout.width > state.activeProject.board.width
        || keepout.y + keepout.height > state.activeProject.board.height
      ) return false;
      if (JSON.stringify(keepout) === JSON.stringify(source)) return false;
      dispatch({
        type: "project/commit",
        update: {
          ...state.activeProject,
          keepouts: state.activeProject.keepouts.map((item) => item.id === id ? keepout : item),
        },
      });
      return true;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const updateMeasurement = useCallback(
    (id: string, patch: Partial<PcbMeasurement>) => {
      if (!state.canEdit || state.documentLocked) return false;
      const source = state.activeProject.measurements.find((item) => item.id === id);
      if (!source) return false;
      const measurement = { ...source, ...patch };
      if (![measurement.x1, measurement.y1, measurement.x2, measurement.y2].every(Number.isFinite)) return false;
      if (
        measurement.x1 < 0
        || measurement.y1 < 0
        || measurement.x2 < 0
        || measurement.y2 < 0
        || measurement.x1 > state.activeProject.board.width
        || measurement.x2 > state.activeProject.board.width
        || measurement.y1 > state.activeProject.board.height
        || measurement.y2 > state.activeProject.board.height
      ) return false;
      if (Math.hypot(measurement.x2 - measurement.x1, measurement.y2 - measurement.y1) < 0.01) return false;
      if (JSON.stringify(measurement) === JSON.stringify(source)) return false;
      dispatch({
        type: "project/commit",
        update: {
          ...state.activeProject,
          measurements: state.activeProject.measurements.map((item) =>
            item.id === id ? measurement : item),
        },
      });
      return true;
    },
    [dispatch, state.activeProject, state.canEdit, state.documentLocked],
  );
  const createKeepout = useCallback((start: PcbPoint, end: PcbPoint) => {
    if (!state.canEdit || state.documentLocked) return null;
    const result = createKeepoutRecord(state.activeProject, start, end);
    if (result) {
      dispatch({ type: "project/commit", update: result.project });
      dispatch({ type: "selection/set", selection: { kind: "keepout", id: result.keepout.id } });
    }
    return result;
  }, [dispatch, state.activeProject, state.canEdit, state.documentLocked]);
  const createMeasurement = useCallback((start: PcbPoint, end: PcbPoint) => {
    if (!state.canEdit || state.documentLocked) return null;
    const result = createMeasurementRecord(state.activeProject, start, end);
    if (result) {
      dispatch({ type: "project/commit", update: result.project });
      dispatch({ type: "selection/set", selection: { kind: "measurement", id: result.measurement.id } });
    }
    return result;
  }, [dispatch, state.activeProject, state.canEdit, state.documentLocked]);

  const applySelectionEdit = useCallback((action: Parameters<typeof editSelectedObject>[2]) => {
    if (!state.canEdit || state.documentLocked) return false;
    const project = editSelectedObject(state.activeProject, state.selection, action);
    if (JSON.stringify(project) === JSON.stringify(state.activeProject)) return false;
    dispatch({ type: "project/commit", update: project });
    if (action.type === "delete") dispatch({ type: "selection/set", selection: null });
    return true;
  }, [dispatch, state.activeProject, state.canEdit, state.documentLocked, state.selection]);
  const deleteSelected = useCallback(() => applySelectionEdit({ type: "delete" }), [applySelectionEdit]);
  const rotateSelected = useCallback(() => applySelectionEdit({ type: "rotate" }), [applySelectionEdit]);
  const toggleSelectedLock = useCallback(() => applySelectionEdit({ type: "toggle-lock" }), [applySelectionEdit]);
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    const selectedIds = new Set([
      ...state.selectedObjects,
      ...(state.selection ? [state.selection.id] : []),
    ]);
    const movableIds = [
      ...state.activeProject.components
        .filter((component) => selectedIds.has(component.instanceId))
        .map((component) => component.instanceId),
      ...state.activeProject.keepouts
        .filter((keepout) => selectedIds.has(keepout.id))
        .map((keepout) => keepout.id),
    ];
    if (movableIds.length > 1) {
      const result = moveObjects(movableIds, { x: dx, y: dy }, true);
      if (!result.ok) {
        toast({
          title: "無法移動選取群組",
          description: result.reason,
          variant: "destructive",
        });
        return false;
      }
      return result.changed;
    }
    return applySelectionEdit({ type: "nudge", dx, dy });
  }, [applySelectionEdit, moveObjects, state.activeProject.components, state.activeProject.keepouts, state.selectedObjects, state.selection]);
  const duplicateSelected = useCallback((objectIds?: string[]) => {
    if (!state.canEdit || state.documentLocked) return false;
    const requestedIds = objectIds !== undefined
      ? objectIds
      : [...new Set([
        ...state.selectedObjects,
        ...(state.selection ? [state.selection.id] : []),
      ])];
    const duplicableIds = requestedIds.filter((objectId) => (
      state.activeProject.components.some((component) => component.instanceId === objectId)
      || state.activeProject.keepouts.some((keepout) => keepout.id === objectId)
    ));
    if (!duplicableIds.length) return false;
    dispatch({ type: "selection/duplicate", objectIds: duplicableIds });
    return true;
  }, [
    dispatch,
    state.activeProject,
    state.canEdit,
    state.documentLocked,
    state.selectedObjects,
    state.selection,
  ]);
  const copiedObjectIdsRef = useRef<string[]>([]);
  const copySelected = useCallback(() => {
    const selectedIds = [...new Set([
      ...state.selectedObjects,
      ...(state.selection ? [state.selection.id] : []),
    ])].filter((objectId) => (
      state.activeProject.components.some((component) => component.instanceId === objectId)
      || state.activeProject.keepouts.some((keepout) => keepout.id === objectId)
    ));
    copiedObjectIdsRef.current = selectedIds;
    return selectedIds.length > 0;
  }, [state.activeProject.components, state.activeProject.keepouts, state.selectedObjects, state.selection]);
  const pasteCopied = useCallback(
    () => duplicateSelected(copiedObjectIdsRef.current),
    [duplicateSelected],
  );
  const centerDrcIssue = useCallback((issueId: string) => {
    const issue = state.drcIssues.find((item) => item.id === issueId);
    if (!issue) return;
    const objectId = issue.objectIds.find((id) =>
      state.activeProject.components.some((item) => item.instanceId === id)
      || state.activeProject.keepouts.some((item) => item.id === id)
      || state.activeProject.measurements.some((item) => item.id === id));
    if (!objectId) return;
    const selection: PcbSelection = state.activeProject.components.some((item) => item.instanceId === objectId)
      ? { kind: "component", id: objectId }
      : state.activeProject.keepouts.some((item) => item.id === objectId)
        ? { kind: "keepout", id: objectId }
        : { kind: "measurement", id: objectId };
    const center = selectionCenter(state.activeProject, selection);
    dispatch({ type: "selection/set", selection });
    if (center) {
      dispatch({ type: "view/center", center });
      dispatch({ type: "zoom/set", zoom: 150 });
    }
  }, [dispatch, state.activeProject, state.drcIssues]);

  const shortcutRef = useRef({
    activeProject: state.activeProject,
    arrangeSelectedComponents,
    canEdit: state.canEdit,
    copySelected,
    deleteSelected,
    dispatch,
    duplicateSelected,
    documentLocked: state.documentLocked,
    nudgeSelected,
    pasteCopied,
    rotateSelected,
    tool: state.tool,
    zoom: state.zoom,
  });
  shortcutRef.current = {
    activeProject: state.activeProject,
    arrangeSelectedComponents,
    canEdit: state.canEdit,
    copySelected,
    deleteSelected,
    dispatch,
    duplicateSelected,
    documentLocked: state.documentLocked,
    nudgeSelected,
    pasteCopied,
    rotateSelected,
    tool: state.tool,
    zoom: state.zoom,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      const shortcuts = shortcutRef.current;
      const key = event.key.toLocaleLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === "z") {
          event.preventDefault();
          shortcuts.dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" });
          return;
        } else if (key === "y") {
          event.preventDefault();
          shortcuts.dispatch({ type: "history/redo" });
          return;
        } else if (key === "d") {
          event.preventDefault();
          shortcuts.duplicateSelected();
          return;
        } else if (key === "c") {
          event.preventDefault();
          if (shortcuts.copySelected()) {
            toast({ title: "已複製選取物件", description: "按 Ctrl+V 可貼上整組布局。" });
          } else {
            toast({ title: "沒有可複製的物件", description: "請先框選零件或禁制區。", variant: "destructive" });
          }
          return;
        } else if (key === "v") {
          event.preventDefault();
          if (shortcuts.pasteCopied()) {
            toast({ title: "已貼上整組布局", description: "副本已保持選取，可繼續調整。" });
          } else {
            toast({ title: "目前沒有可貼上的內容", description: "請先按 Ctrl+C 複製零件或禁制區。", variant: "destructive" });
          }
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const arrangement = ARRANGEMENT_SHORTCUTS[key];
        if (arrangement) {
          event.preventDefault();
          shortcuts.arrangeSelectedComponents(arrangement);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        shortcuts.dispatch({ type: "selection/set", selection: null });
        shortcuts.dispatch({ type: "tool/set", tool: "select" });
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        shortcuts.deleteSelected();
        return;
      }
      if (event.key === " " && !event.repeat) {
        if (target?.closest("button, a, [role='button'], [role='menu'], [role='dialog']")) return;
        event.preventDefault();
        toolBeforeSpaceRef.current = shortcuts.tool;
        shortcuts.dispatch({ type: "tool/set", tool: "pan" });
        return;
      }
      if (key === "v" || key === "h") {
        event.preventDefault();
        shortcuts.dispatch({ type: "tool/set", tool: key === "v" ? "select" : "pan" });
        return;
      }
      if ((key === "m" || key === "k") && shortcuts.canEdit && !shortcuts.documentLocked) {
        event.preventDefault();
        shortcuts.dispatch({ type: "tool/set", tool: key === "m" ? "measure" : "keepout" });
        return;
      }
      if (key === "r") {
        event.preventDefault();
        shortcuts.rotateSelected();
        return;
      }
      if (key === "f" || key === "0") {
        event.preventDefault();
        shortcuts.dispatch({ type: "view/reset" });
        return;
      }
      if (key === "+" || key === "=" || key === "-") {
        event.preventDefault();
        shortcuts.dispatch({
          type: "zoom/set",
          zoom: shortcuts.zoom + (key === "-" ? -25 : 25),
        });
        return;
      }
      if ((key === "t" || key === "b") && shortcuts.canEdit && !shortcuts.documentLocked) {
        event.preventDefault();
        shortcuts.dispatch({ type: "layer/set", layer: key === "t" ? "top" : "bottom" });
        return;
      }
      if (key === "l") {
        event.preventDefault();
        shortcuts.dispatch({ type: "document/toggle-lock" });
        return;
      }
      const directions: Record<string, PcbPoint> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey
        ? 0.1
        : (event.ctrlKey || event.metaKey)
          ? 10
          : shortcuts.activeProject.board.gridSize;
      shortcuts.nudgeSelected(direction.x * step, direction.y * step);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " " || toolBeforeSpaceRef.current === null) return;
      event.preventDefault();
      const previousTool = toolBeforeSpaceRef.current;
      toolBeforeSpaceRef.current = null;
      shortcutRef.current.dispatch({ type: "tool/set", tool: previousTool });
    };
    const restoreToolAfterBlur = () => {
      if (toolBeforeSpaceRef.current === null) return;
      const previousTool = toolBeforeSpaceRef.current;
      toolBeforeSpaceRef.current = null;
      shortcutRef.current.dispatch({ type: "tool/set", tool: previousTool });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", restoreToolAfterBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", restoreToolAfterBlur);
    };
  }, []);

  const selectedObject = state.selection?.kind === "component"
    ? state.activeProject.components.find((item) => item.instanceId === state.selection?.id) ?? null
    : state.selection?.kind === "keepout"
      ? state.activeProject.keepouts.find((item) => item.id === state.selection?.id) ?? null
      : state.selection?.kind === "measurement"
        ? state.activeProject.measurements.find((item) => item.id === state.selection?.id) ?? null
        : null;

  return {
    canMutate: state.canEdit && !state.documentLocked,
    selectedObject,
    placeLibraryComponent,
    placePendingPlacement,
    autoPlacePending,
    arrangeSelectedComponents,
    selectObject,
    setViewCenter,
    resetView,
    moveComponent,
    moveComponents,
    moveObjects,
    moveKeepout,
    duplicateKeepout,
    updateBoard,
    updateComponent,
    updateKeepout,
    updateMeasurement,
    createKeepout,
    createMeasurement,
    copySelected,
    duplicateSelected,
    deleteSelected,
    rotateSelected,
    toggleSelectedLock,
    nudgeSelected,
    pasteCopied,
    centerDrcIssue,
  };
}
