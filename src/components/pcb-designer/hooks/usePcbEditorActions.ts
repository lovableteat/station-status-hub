import { useCallback, useEffect, useRef, type Dispatch } from "react";
import {
  createKeepout as createKeepoutRecord,
  createMeasurement as createMeasurementRecord,
  editSelectedObject,
  moveComponent as moveComponentRecord,
  moveKeepout as moveKeepoutRecord,
  normalizeRotation,
  placeLibraryComponent as placeComponentRecord,
  selectionCenter,
  type MoveResult,
  type KeepoutMoveResult,
  type PlacementResult,
} from "../core/editor.ts";
import type {
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

export function usePcbEditorActions(
  state: PcbWorkspaceState,
  dispatch: Dispatch<PcbWorkspaceAction>,
) {
  const toolBeforeSpaceRef = useRef<PcbTool | null>(null);
  const placeLibraryComponent = useCallback(
    (
      componentId: string,
      preferred?: PcbPoint,
      options?: { exact?: boolean; bypassSnap?: boolean },
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
      if (keepout.width <= 0 || keepout.height <= 0) return false;
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
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => applySelectionEdit({ type: "nudge", dx, dy }),
    [applySelectionEdit],
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      const key = event.key.toLocaleLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === "z") {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? "history/redo" : "history/undo" });
          return;
        } else if (key === "y") {
          event.preventDefault();
          dispatch({ type: "history/redo" });
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "selection/set", selection: null });
        dispatch({ type: "tool/set", tool: "select" });
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key === " " && !event.repeat) {
        event.preventDefault();
        toolBeforeSpaceRef.current = state.tool;
        dispatch({ type: "tool/set", tool: "pan" });
        return;
      }
      if (key === "v" || key === "h") {
        event.preventDefault();
        dispatch({ type: "tool/set", tool: key === "v" ? "select" : "pan" });
        return;
      }
      if ((key === "m" || key === "k") && state.canEdit && !state.documentLocked) {
        event.preventDefault();
        dispatch({ type: "tool/set", tool: key === "m" ? "measure" : "keepout" });
        return;
      }
      if (key === "r") {
        event.preventDefault();
        rotateSelected();
        return;
      }
      if (key === "f" || key === "0") {
        event.preventDefault();
        dispatch({ type: "view/reset" });
        return;
      }
      if (key === "+" || key === "=" || key === "-") {
        event.preventDefault();
        dispatch({
          type: "zoom/set",
          zoom: state.zoom + (key === "-" ? -25 : 25),
        });
        return;
      }
      if ((key === "t" || key === "b") && state.canEdit && !state.documentLocked) {
        event.preventDefault();
        dispatch({ type: "layer/set", layer: key === "t" ? "top" : "bottom" });
        return;
      }
      if (key === "l") {
        event.preventDefault();
        dispatch({ type: "document/toggle-lock" });
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
          : state.activeProject.board.gridSize;
      nudgeSelected(direction.x * step, direction.y * step);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " " || toolBeforeSpaceRef.current === null) return;
      event.preventDefault();
      const previousTool = toolBeforeSpaceRef.current;
      toolBeforeSpaceRef.current = null;
      dispatch({ type: "tool/set", tool: previousTool });
    };
    const restoreToolAfterBlur = () => {
      if (toolBeforeSpaceRef.current === null) return;
      const previousTool = toolBeforeSpaceRef.current;
      toolBeforeSpaceRef.current = null;
      dispatch({ type: "tool/set", tool: previousTool });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", restoreToolAfterBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", restoreToolAfterBlur);
    };
  }, [
    deleteSelected,
    dispatch,
    nudgeSelected,
    rotateSelected,
    state.activeProject.board.gridSize,
    state.canEdit,
    state.documentLocked,
    state.tool,
    state.zoom,
  ]);

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
    selectObject,
    setViewCenter,
    resetView,
    moveComponent,
    moveKeepout,
    updateBoard,
    updateComponent,
    updateKeepout,
    updateMeasurement,
    createKeepout,
    createMeasurement,
    deleteSelected,
    rotateSelected,
    toggleSelectedLock,
    nudgeSelected,
    centerDrcIssue,
  };
}
