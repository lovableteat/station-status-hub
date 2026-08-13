import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import { toast } from "@/hooks/use-toast";
import {
  canPlaceComponent,
  clientPointToBoard,
  getComponentCanvasGeometry,
  getComponentCanvasTransform,
  snapPoint,
} from "./core/geometry.ts";
import {
  getPcbComponentViewState,
  getPcbSelectionIds,
} from "./core/viewSync.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import type {
  PcbKeepout,
  PcbMeasurement,
  PcbPlacedComponent,
  PcbPoint,
  PcbSelection,
  PcbVisibleLayer,
} from "./types.ts";

export const PCB_LIBRARY_DRAG_TYPE = "application/x-pcb-library-component";

interface CanvasSize {
  width: number;
  height: number;
}

interface PcbRect extends PcbPoint {
  width: number;
  height: number;
}

type KeepoutResizeHandle = "nw" | "ne" | "sw" | "se";
type MeasurementEndpoint = "start" | "end";

interface PcbCanvasProps {
  workspace: PcbWorkspaceApi;
  visibleLayer?: PcbVisibleLayer;
  selectedObjects?: readonly string[];
  placementComponentId?: string | null;
  onPlacementComplete?: () => void;
  onPlacementCancel?: () => void;
}

type PointerInteraction =
  | {
    kind: "pan";
    pointerId: number;
    client: PcbPoint;
    center: PcbPoint;
  }
  | {
    kind: "component";
    pointerId: number;
    instanceId: string;
    instanceIds: string[];
    origin: PcbPoint;
    originById: Record<string, PcbPoint>;
    offset: PcbPoint;
    preview: PcbPoint;
    delta: PcbPoint;
    bypassSnap: boolean;
  }
  | {
    kind: "keepout-move";
    pointerId: number;
    id: string;
    offset: PcbPoint;
    preview: PcbPoint;
    bypassSnap: boolean;
  }
  | {
    kind: "keepout-resize";
    pointerId: number;
    id: string;
    handle: KeepoutResizeHandle;
    anchor: PcbPoint;
    preview: PcbRect;
    bypassSnap: boolean;
  }
  | {
    kind: "measurement-resize";
    pointerId: number;
    id: string;
    endpoint: MeasurementEndpoint;
    preview: PcbMeasurement;
    bypassSnap: boolean;
  }
  | {
    kind: "keepout" | "measurement";
    pointerId: number;
    start: PcbPoint;
    end: PcbPoint;
  };

function pointForEvent(svg: SVGSVGElement, clientX: number, clientY: number): PcbPoint {
  const bounds = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  return clientPointToBoard(
    { x: clientX, y: clientY },
    bounds,
    viewBox,
  );
}

function samePoint(left: PcbPoint | null, right: PcbPoint | null): boolean {
  return left?.x === right?.x && left?.y === right?.y;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function keepoutResizeAnchor(bounds: PcbRect, handle: KeepoutResizeHandle): PcbPoint {
  return {
    x: handle.endsWith("w") ? bounds.x + bounds.width : bounds.x,
    y: handle.startsWith("n") ? bounds.y + bounds.height : bounds.y,
  };
}

function resizeKeepout(
  anchor: PcbPoint,
  handle: KeepoutResizeHandle,
  target: PcbPoint,
  minimumSize: number,
  board: { width: number; height: number },
): PcbRect {
  const boundedTarget = {
    x: clamp(target.x, 0, board.width),
    y: clamp(target.y, 0, board.height),
  };
  const edgeX = handle.endsWith("w")
    ? Math.min(anchor.x - minimumSize, boundedTarget.x)
    : Math.max(anchor.x + minimumSize, boundedTarget.x);
  const edgeY = handle.startsWith("n")
    ? Math.min(anchor.y - minimumSize, boundedTarget.y)
    : Math.max(anchor.y + minimumSize, boundedTarget.y);
  return {
    x: Math.min(anchor.x, edgeX),
    y: Math.min(anchor.y, edgeY),
    width: Math.abs(edgeX - anchor.x),
    height: Math.abs(edgeY - anchor.y),
  };
}

function selectionBounds(workspace: PcbWorkspaceApi, preview?: PcbPoint) {
  if (!workspace.selection || !workspace.selectedObject) return null;
  if (workspace.selection.kind === "keepout") {
    const keepout = workspace.selectedObject as { x: number; y: number; width: number; height: number };
    return {
      x: preview?.x ?? keepout.x,
      y: preview?.y ?? keepout.y,
      width: keepout.width,
      height: keepout.height,
    };
  }
  return null;
}

function componentPoint(component: Pick<PcbPlacedComponent, "x" | "y">): PcbPoint {
  return { x: component.x, y: component.y };
}

function getSelectionById(
  objectId: string,
  project: PcbWorkspaceApi["activeProject"],
): PcbSelection | null {
  if (project.components.some((component) => component.instanceId === objectId)) {
    return { kind: "component", id: objectId };
  }
  if (project.keepouts.some((keepout) => keepout.id === objectId)) {
    return { kind: "keepout", id: objectId };
  }
  if (project.measurements.some((measurement) => measurement.id === objectId)) {
    return { kind: "measurement", id: objectId };
  }
  return null;
}

export function PcbCanvas({
  workspace,
  visibleLayer = workspace.visibleLayer,
  selectedObjects = workspace.selectedObjects,
  placementComponentId = null,
  onPlacementComplete,
  onPlacementCancel,
}: PcbCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hostRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 960, height: 640 });
  const [interaction, setInteraction] = useState<PointerInteraction | null>(null);
  const [cursorPoint, setCursorPoint] = useState<PcbPoint | null>(null);
  const [placementPoint, setPlacementPoint] = useState<PcbPoint | null>(null);
  const [placementRotation, setPlacementRotation] = useState(0);
  const previewFrameRef = useRef<number | null>(null);
  const queuedPreviewRef = useRef<{ cursor: PcbPoint; placement: PcbPoint | null } | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const queuedZoomRef = useRef(workspace.zoom);
  const project = workspace.activeProject;
  const selectedSelections = useMemo(
    () => selectedObjects
      .map((objectId) => getSelectionById(objectId, project))
      .filter((selection): selection is PcbSelection => selection !== null),
    [project, selectedObjects],
  );
  const selectionIds = useMemo(
    () => getPcbSelectionIds(workspace.selection, selectedSelections),
    [selectedSelections, workspace.selection],
  );
  const componentViewStates = useMemo(
    () => project.components.map((component) => ({
      component,
      viewState: getPcbComponentViewState(component, visibleLayer, selectionIds),
    })),
    [project.components, selectionIds, visibleLayer],
  );
  const visibleComponents = useMemo(
    () => componentViewStates.filter(({ viewState }) => viewState.visible),
    [componentViewStates],
  );
  const selectedComponentIds = useMemo(
    () => new Set(
      selectionIds.filter((objectId) =>
        project.components.some((component) => component.instanceId === objectId)),
    ),
    [project.components, selectionIds],
  );
  const placementLibraryComponent = placementComponentId
    ? workspace.data.library.find((component) => component.id === placementComponentId) ?? null
    : null;

  const clearQueuedPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    queuedPreviewRef.current = null;
    setCursorPoint(null);
    setPlacementPoint(null);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const bounds = host.getBoundingClientRect();
      if (bounds.width && bounds.height) {
        setSize((current) => current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cancelDraft = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      if (placementComponentId && event.key.toLocaleLowerCase() === "r") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPlacementRotation((current) => (current + 90) % 360);
        return;
      }
      if (event.key === "Escape") {
        setInteraction(null);
        clearQueuedPreview();
        if (placementComponentId) onPlacementCancel?.();
      }
    };
    window.addEventListener("keydown", cancelDraft, true);
    return () => window.removeEventListener("keydown", cancelDraft, true);
  }, [clearQueuedPreview, onPlacementCancel, placementComponentId]);

  useEffect(() => {
    clearQueuedPreview();
    setPlacementRotation(0);
  }, [clearQueuedPreview, placementComponentId]);

  useEffect(() => () => {
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
    if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
  }, []);

  useEffect(() => {
    if (zoomFrameRef.current === null) {
      queuedZoomRef.current = workspace.zoom;
    }
  }, [workspace.zoom]);

  const queuePointerPreview = (cursor: PcbPoint, placement: PcbPoint | null) => {
    queuedPreviewRef.current = { cursor, placement };
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const queued = queuedPreviewRef.current;
      queuedPreviewRef.current = null;
      if (!queued) return;
      setCursorPoint((current) => samePoint(current, queued.cursor) ? current : queued.cursor);
      setPlacementPoint((current) => samePoint(current, queued.placement) ? current : queued.placement);
    });
  };

  const previewPointForComponent = useCallback((component: PcbPlacedComponent) => {
    if (interaction?.kind !== "component" || !interaction.originById[component.instanceId]) {
      return componentPoint(component);
    }
    const origin = interaction.originById[component.instanceId];
    return {
      x: origin.x + interaction.delta.x,
      y: origin.y + interaction.delta.y,
    };
  }, [interaction]);

  const selectObject = useCallback((
    selection: Parameters<typeof workspace.selectObject>[0],
    additive = false,
  ) => {
    if (!selection) {
      workspace.selectObject(null);
      workspace.clearObjectSelection();
      return;
    }
    if (additive) {
      workspace.toggleObjectSelection(selection.id);
      return;
    }
    workspace.selectObject(selection);
    workspace.clearObjectSelection();
  }, [workspace]);

  const viewBox = useMemo(() => {
    const viewportAspect = size.width / Math.max(1, size.height);
    const boardAspect = project.board.width / project.board.height;
    const scale = workspace.zoom / 100;
    let width: number;
    let height: number;
    if (viewportAspect >= boardAspect) {
      height = (project.board.height * 1.16) / scale;
      width = height * viewportAspect;
    } else {
      width = (project.board.width * 1.16) / scale;
      height = width / viewportAspect;
    }
    return {
      x: workspace.viewCenter.x - width / 2,
      y: workspace.viewCenter.y - height / 2,
      width,
      height,
    };
  }, [
    project.board.height,
    project.board.width,
    size.height,
    size.width,
    workspace.viewCenter.x,
    workspace.viewCenter.y,
    workspace.zoom,
  ]);

  const selectedComponent = workspace.selection?.kind === "component"
    ? project.components.find((component) => component.instanceId === workspace.selection?.id) ?? null
    : null;
  const selectedComponentVisible = selectedComponent
    ? getPcbComponentViewState(selectedComponent, visibleLayer, selectionIds).visible
    : false;
  const selectedComponentVisual = selectedComponent && selectedComponentVisible
    ? {
      component: selectedComponent,
      geometry: getComponentCanvasGeometry(
        selectedComponent,
        previewPointForComponent(selectedComponent),
      ),
    }
    : null;
  const keepoutPreview = interaction?.kind === "keepout-move"
    ? { id: interaction.id, point: interaction.preview }
    : null;
  const selectedBounds = interaction?.kind === "keepout-resize"
    && workspace.selection?.id === interaction.id
    ? interaction.preview
    : selectionBounds(
      workspace,
      keepoutPreview && workspace.selection?.id === keepoutPreview.id
        ? keepoutPreview.point
        : undefined,
    );
  const selectedKeepout = workspace.selection?.kind === "keepout"
    ? workspace.selectedObject as PcbKeepout
    : null;
  const selectedMeasurement = workspace.selection?.kind === "measurement"
    ? workspace.selectedObject as PcbMeasurement
    : null;
  const selectedMeasurementVisual = interaction?.kind === "measurement-resize"
    && selectedMeasurement?.id === interaction.id
    ? interaction.preview
    : selectedMeasurement;
  const gridSize = project.board.gridSize;
  const strokeWidth = Math.max(project.board.width, project.board.height) / 700;
  const boardSurfaceColor = visibleLayer === "all"
    ? project.board.background
    : visibleLayer === "top"
      ? project.board.layerColors.top
      : visibleLayer === "bottom"
        ? project.board.layerColors.bottom
        : project.board.background;
  const placementPreview = useMemo(() => {
    if (!placementLibraryComponent || !placementPoint) return null;
    const component: PcbPlacedComponent = {
      ...placementLibraryComponent,
      instanceId: "placement-preview",
      reference: "預覽",
      x: placementPoint.x,
      y: placementPoint.y,
      rotation: placementRotation,
      layer: workspace.activeLayer,
      locked: false,
    };
    return {
      component,
      valid: workspace.canMutate && canPlaceComponent(project, component),
    };
  }, [placementLibraryComponent, placementPoint, placementRotation, project, workspace.activeLayer, workspace.canMutate]);
  const selectWithKeyboard = (
    event: ReactKeyboardEvent<SVGElement>,
    selection: Parameters<typeof workspace.selectObject>[0],
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      selectObject(selection);
    }
  };

  const beginPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      kind: "pan",
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      center: workspace.viewCenter,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (placementLibraryComponent && workspace.canMutate && workspace.tool !== "pan") {
      event.preventDefault();
      const rawPoint = pointForEvent(event.currentTarget, event.clientX, event.clientY);
      const point = project.board.snapToGrid
        ? snapPoint(rawPoint, gridSize, event.altKey)
        : rawPoint;
      const result = workspace.placeLibraryComponent(
        placementLibraryComponent.id,
        point,
        { exact: true, bypassSnap: event.altKey, rotation: placementRotation },
      );
      if (result.ok === true) {
        selectObject({ kind: "component", id: result.component.instanceId });
        setPlacementPoint(null);
        toast({ title: "元件已放置", description: `${result.component.reference} · ${result.component.name}` });
      } else {
        toast({ title: "此處無法放置", description: result.reason, variant: "destructive" });
      }
      return;
    }
    if (workspace.tool === "pan") {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (workspace.tool === "select") {
      selectObject(null);
      return;
    }
    if (!workspace.canMutate) return;
    const rawStart = pointForEvent(event.currentTarget, event.clientX, event.clientY);
    const start = project.board.snapToGrid
      ? snapPoint(rawStart, gridSize, event.altKey)
      : rawStart;
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      kind: workspace.tool === "measure" ? "measurement" : workspace.tool,
      pointerId: event.pointerId,
      start,
      end: start,
    });
  };

  const beginComponentDrag = (
    event: ReactPointerEvent<SVGRectElement>,
    component: PcbPlacedComponent,
  ) => {
    if (workspace.tool === "pan" || event.button === 1) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button !== 0) return;
    const additive = event.ctrlKey || event.metaKey;
    if (additive) {
      selectObject({ kind: "component", id: component.instanceId }, true);
      return;
    }

    const groupedIds = [...selectedComponentIds];
    const dragIds = groupedIds.includes(component.instanceId) && groupedIds.length > 1
      ? groupedIds
      : [component.instanceId];
    if (dragIds.length > 1) {
      workspace.selectObject({ kind: "component", id: component.instanceId });
    } else {
      selectObject({ kind: "component", id: component.instanceId });
    }
    const svg = svgRef.current;
    if (!svg || workspace.tool !== "select" || !workspace.canMutate || component.locked) return;
    const point = pointForEvent(svg, event.clientX, event.clientY);
    const originById = Object.fromEntries(
      dragIds
        .map((instanceId) => {
          const item = project.components.find((projectComponent) => projectComponent.instanceId === instanceId);
          return item ? [instanceId, componentPoint(item)] : null;
        })
        .filter((entry): entry is [string, PcbPoint] => entry !== null),
    );
    svg.setPointerCapture(event.pointerId);
    setInteraction({
      kind: "component",
      pointerId: event.pointerId,
      instanceId: component.instanceId,
      instanceIds: dragIds,
      origin: componentPoint(component),
      originById,
      offset: { x: point.x - component.x, y: point.y - component.y },
      preview: { x: component.x, y: component.y },
      delta: { x: 0, y: 0 },
      bypassSnap: event.altKey,
    });
  };

  const beginKeepoutResize = (
    event: ReactPointerEvent<SVGCircleElement>,
    handle: KeepoutResizeHandle,
  ) => {
    if (
      event.button !== 0
      || workspace.tool !== "select"
      || !workspace.canMutate
      || !selectedKeepout
      || !selectedBounds
    ) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    setInteraction({
      kind: "keepout-resize",
      pointerId: event.pointerId,
      id: selectedKeepout.id,
      handle,
      anchor: keepoutResizeAnchor(selectedBounds, handle),
      preview: selectedBounds,
      bypassSnap: event.altKey,
    });
  };

  const beginMeasurementResize = (
    event: ReactPointerEvent<SVGGElement>,
    measurement: PcbMeasurement,
    endpoint: MeasurementEndpoint,
  ) => {
    if (event.button !== 0 || workspace.tool !== "select" || !workspace.canMutate) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    selectObject({ kind: "measurement", id: measurement.id });
    svg.setPointerCapture(event.pointerId);
    setInteraction({
      kind: "measurement-resize",
      pointerId: event.pointerId,
      id: measurement.id,
      endpoint,
      preview: measurement,
      bypassSnap: event.altKey,
    });
  };

  const nudgeMeasurementEndpoint = (
    event: ReactKeyboardEvent<SVGGElement>,
    measurement: PcbMeasurement,
    endpoint: MeasurementEndpoint,
  ) => {
    const direction = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];
    if (!direction || !workspace.canMutate) return;
    event.preventDefault();
    event.stopPropagation();
    const step = project.board.snapToGrid && !event.altKey ? gridSize : 0.1;
    const current = endpoint === "start"
      ? { x: measurement.x1, y: measurement.y1 }
      : { x: measurement.x2, y: measurement.y2 };
    const next = {
      x: clamp(current.x + direction.x * step, 0, project.board.width),
      y: clamp(current.y + direction.y * step, 0, project.board.height),
    };
    workspace.updateMeasurement(measurement.id, endpoint === "start"
      ? { x1: next.x, y1: next.y }
      : { x2: next.x, y2: next.y });
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointForEvent(event.currentTarget, event.clientX, event.clientY);
    const nextPlacementPoint = placementLibraryComponent
      ? (project.board.snapToGrid ? snapPoint(point, gridSize, event.altKey) : point)
      : null;
    queuePointerPreview(point, nextPlacementPoint);
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "pan") {
      const x = interaction.center.x
        - ((event.clientX - interaction.client.x) / size.width) * viewBox.width;
      const y = interaction.center.y
        - ((event.clientY - interaction.client.y) / size.height) * viewBox.height;
      workspace.setViewCenter({ x, y });
      return;
    }
    if (interaction.kind === "component") {
      const bypassSnap = event.altKey;
      const x = point.x - interaction.offset.x;
      const y = point.y - interaction.offset.y;
      const preview = project.board.snapToGrid
        ? snapPoint({ x, y }, gridSize, bypassSnap)
        : { x, y };
      setInteraction({
        ...interaction,
        bypassSnap,
        preview,
        delta: {
          x: preview.x - interaction.origin.x,
          y: preview.y - interaction.origin.y,
        },
      });
    } else if (interaction.kind === "keepout-move") {
      const bypassSnap = event.altKey;
      const x = point.x - interaction.offset.x;
      const y = point.y - interaction.offset.y;
      const keepout = project.keepouts.find((item) => item.id === interaction.id);
      if (!keepout) return;
      const snappedPoint = project.board.snapToGrid
        ? snapPoint({ x, y }, gridSize, bypassSnap)
        : { x, y };
      setInteraction({
        ...interaction,
        bypassSnap,
        preview: {
          x: clamp(snappedPoint.x, 0, Math.max(0, project.board.width - keepout.width)),
          y: clamp(snappedPoint.y, 0, Math.max(0, project.board.height - keepout.height)),
        },
      });
    } else if (interaction.kind === "keepout-resize") {
      const bypassSnap = event.altKey;
      const snappedPoint = project.board.snapToGrid
        ? snapPoint(point, gridSize, bypassSnap)
        : point;
      setInteraction({
        ...interaction,
        bypassSnap,
        preview: resizeKeepout(
          interaction.anchor,
          interaction.handle,
          snappedPoint,
          project.board.snapToGrid && !bypassSnap ? gridSize : 0.1,
          project.board,
        ),
      });
    } else if (interaction.kind === "measurement-resize") {
      const bypassSnap = event.altKey;
      const snappedPoint = project.board.snapToGrid
        ? snapPoint(point, gridSize, bypassSnap)
        : point;
      const endpoint = {
        x: clamp(snappedPoint.x, 0, project.board.width),
        y: clamp(snappedPoint.y, 0, project.board.height),
      };
      setInteraction({
        ...interaction,
        bypassSnap,
        preview: {
          ...interaction.preview,
          ...(interaction.endpoint === "start"
            ? { x1: endpoint.x, y1: endpoint.y }
            : { x2: endpoint.x, y2: endpoint.y }),
        },
      });
    } else {
      setInteraction({
        ...interaction,
        end: project.board.snapToGrid
          ? snapPoint(point, gridSize, event.altKey)
          : point,
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (interaction.kind === "component") {
      const result = interaction.instanceIds.length > 1
        ? workspace.moveComponents(
          interaction.instanceIds,
          interaction.delta,
          interaction.bypassSnap,
        )
        : workspace.moveComponent(
          interaction.instanceId,
          interaction.preview,
          interaction.bypassSnap,
        );
      if (result.ok === false) toast({ title: "無法移動元件", description: result.reason, variant: "destructive" });
    } else if (interaction.kind === "keepout-move") {
      const result = workspace.moveKeepout(
        interaction.id,
        interaction.preview,
        interaction.bypassSnap,
      );
      if (result.ok === false) toast({ title: "無法移動禁制區", description: result.reason, variant: "destructive" });
    } else if (interaction.kind === "keepout-resize") {
      const source = project.keepouts.find((item) => item.id === interaction.id);
      const changed = source && (
        source.x !== interaction.preview.x
        || source.y !== interaction.preview.y
        || source.width !== interaction.preview.width
        || source.height !== interaction.preview.height
      );
      if (changed && !workspace.updateKeepout(interaction.id, interaction.preview)) {
        toast({ title: "無法調整禁制區", description: "請確認禁制區仍位於板框內，且寬高大於 0。", variant: "destructive" });
      }
    } else if (interaction.kind === "measurement-resize") {
      const source = project.measurements.find((item) => item.id === interaction.id);
      const changed = source && (
        source.x1 !== interaction.preview.x1
        || source.y1 !== interaction.preview.y1
        || source.x2 !== interaction.preview.x2
        || source.y2 !== interaction.preview.y2
      );
      if (changed && !workspace.updateMeasurement(interaction.id, interaction.preview)) {
        toast({
          title: "無法調整量測線",
          description: "兩個端點必須位於板框內，且不可重疊。",
          variant: "destructive",
        });
      }
    } else if (interaction.kind === "keepout") {
      workspace.createKeepout(interaction.start, interaction.end);
    } else if (interaction.kind === "measurement") {
      workspace.createMeasurement(interaction.start, interaction.end);
    }
    setInteraction(null);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    queuedZoomRef.current = Math.min(400, Math.max(
      25,
      queuedZoomRef.current + (event.deltaY < 0 ? 10 : -10),
    ));
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      workspace.setZoom(queuedZoomRef.current);
    });
  };

  const handleDrop = (event: DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (!workspace.canMutate) return;
    const componentId = event.dataTransfer.getData(PCB_LIBRARY_DRAG_TYPE);
    if (!componentId) return;
    const rawPoint = pointForEvent(event.currentTarget, event.clientX, event.clientY);
    const point = project.board.snapToGrid
      ? snapPoint(rawPoint, gridSize, event.altKey)
      : rawPoint;
    const result = workspace.placeLibraryComponent(componentId, point, {
      exact: true,
      bypassSnap: event.altKey,
    });
    if (result.ok === true) {
      selectObject({ kind: "component", id: result.component.instanceId });
      onPlacementComplete?.();
      setPlacementPoint(null);
      toast({ title: "元件已放置", description: `${result.component.reference} · ${result.component.name}` });
    } else {
      toast({ title: "無法放置元件", description: result.reason, variant: "destructive" });
    }
  };

  return (
    <main
      ref={hostRef}
      className="pcb-canvas-host"
      data-testid="pcb-canvas-host"
      aria-label="PCB 互動式佈局畫布"
    >
      <svg
        ref={svgRef}
        className="pcb-canvas"
        data-pcb-canvas
        data-pcb-board-color={project.board.background}
        data-pcb-top-color={project.board.layerColors.top}
        data-pcb-bottom-color={project.board.layerColors.bottom}
        data-tool={workspace.tool}
        data-placement-active={placementLibraryComponent ? "true" : "false"}
        role="application"
        aria-label="PCB 毫米座標 SVG 編輯器"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setInteraction(null)}
        onPointerLeave={() => {
          if (!interaction) {
            clearQueuedPreview();
          }
        }}
        onWheel={handleWheel}
        onDragOver={(event) => {
          event.preventDefault();
          const rawPoint = pointForEvent(event.currentTarget, event.clientX, event.clientY);
          queuePointerPreview(rawPoint, project.board.snapToGrid
            ? snapPoint(rawPoint, gridSize, event.altKey)
            : rawPoint);
        }}
        onDrop={handleDrop}
      >
        <defs>
          <style>{`
            .pcb-svg-label {
              fill: #f8fafc;
              paint-order: stroke;
              stroke: rgba(3, 10, 18, 0.82);
              stroke-width: ${strokeWidth * 0.75};
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              pointer-events: none;
            }
            .pcb-component-reference { font-weight: 700; }
          `}</style>
          <pattern
            id={`pcb-grid-${project.id}`}
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
              fill="none"
              stroke="#76b8ca"
              strokeOpacity="0.28"
              strokeWidth={strokeWidth * 0.45}
            />
          </pattern>
        </defs>

        <g data-layer="grid">
          <rect
            data-grid-surface
            display={project.board.showGrid ? undefined : "none"}
            x="0"
            y="0"
            width={project.board.width}
            height={project.board.height}
            fill={`url(#pcb-grid-${project.id})`}
          />
        </g>

        <g data-layer="board">
          <rect
            data-pcb-board-color={project.board.background}
            data-pcb-top-color={project.board.layerColors.top}
            data-pcb-bottom-color={project.board.layerColors.bottom}
            x="0"
            y="0"
            width={project.board.width}
            height={project.board.height}
            rx={Math.min(2, project.board.gridSize)}
            fill={boardSurfaceColor}
            fillOpacity="0.76"
            stroke="#7ee8f5"
            strokeWidth={strokeWidth}
          />
          <circle cx="0" cy="0" r={strokeWidth * 2.2} fill="#e2f9fb" aria-label="原點" />
        </g>

        <g data-layer="keepouts">
          {project.keepouts.map((keepout) => {
            const preview = interaction?.kind === "keepout-move" && interaction.id === keepout.id
              ? { ...keepout, ...interaction.preview }
              : interaction?.kind === "keepout-resize" && interaction.id === keepout.id
                ? { ...keepout, ...interaction.preview }
                : keepout;
            return (
              <rect
                key={keepout.id}
                className="pcb-keepout-object"
                x={preview.x}
                y={preview.y}
                width={preview.width}
                height={preview.height}
                fill={keepout.color}
                fillOpacity="0.18"
                stroke={keepout.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => {
                  if (workspace.tool === "pan" || event.button === 1) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.button !== 0) return;
                  const additive = event.ctrlKey || event.metaKey;
                  if (additive) {
                    selectObject({ kind: "keepout", id: keepout.id }, true);
                    return;
                  }
                  selectObject({ kind: "keepout", id: keepout.id });
                  const svg = svgRef.current;
                  if (!svg || workspace.tool !== "select" || !workspace.canMutate) return;
                  const point = pointForEvent(svg, event.clientX, event.clientY);
                  svg.setPointerCapture(event.pointerId);
                  setInteraction({
                    kind: "keepout-move",
                    pointerId: event.pointerId,
                    id: keepout.id,
                    offset: { x: point.x - keepout.x, y: point.y - keepout.y },
                    preview: { x: keepout.x, y: keepout.y },
                    bypassSnap: event.altKey,
                  });
                }}
                onKeyDown={(event) =>
                  selectWithKeyboard(event, { kind: "keepout", id: keepout.id })}
                aria-label={`禁制區 ${keepout.name}`}
              />
            );
          })}
        </g>

        <g data-layer="measurements">
          {project.measurements.map((measurement) => {
            const renderedMeasurement = interaction?.kind === "measurement-resize"
              && interaction.id === measurement.id
              ? interaction.preview
              : measurement;
            return (
              <g
              key={measurement.id}
              className="pcb-measurement-object"
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                if (workspace.tool === "pan" || event.button === 1) return;
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                selectObject(
                  { kind: "measurement", id: measurement.id },
                  event.ctrlKey || event.metaKey,
                );
              }}
              onKeyDown={(event) =>
                selectWithKeyboard(event, { kind: "measurement", id: measurement.id })}
              aria-label="測量線"
            >
              <line
                className="pcb-measurement-hit-target"
                x1={renderedMeasurement.x1}
                y1={renderedMeasurement.y1}
                x2={renderedMeasurement.x2}
                y2={renderedMeasurement.y2}
                stroke="transparent"
                strokeWidth={Math.max(strokeWidth * 10, 1)}
                pointerEvents="stroke"
              />
              <line
                x1={renderedMeasurement.x1}
                y1={renderedMeasurement.y1}
                x2={renderedMeasurement.x2}
                y2={renderedMeasurement.y2}
                stroke={renderedMeasurement.color}
                strokeWidth={strokeWidth * 1.5}
              />
              <circle cx={renderedMeasurement.x1} cy={renderedMeasurement.y1} r={strokeWidth * 2} fill={renderedMeasurement.color} />
              <circle cx={renderedMeasurement.x2} cy={renderedMeasurement.y2} r={strokeWidth * 2} fill={renderedMeasurement.color} />
              <text
                x={(renderedMeasurement.x1 + renderedMeasurement.x2) / 2}
                y={(renderedMeasurement.y1 + renderedMeasurement.y2) / 2 - strokeWidth * 3}
                className="pcb-svg-label"
                fontSize={strokeWidth * 7}
                textAnchor="middle"
              >
                {Math.hypot(
                  renderedMeasurement.x2 - renderedMeasurement.x1,
                  renderedMeasurement.y2 - renderedMeasurement.y1,
                ).toFixed(2)} mm
              </text>
            </g>
            );
          })}
        </g>

        <g data-layer="components">
          {visibleComponents.map(({ component, viewState }) => {
            const center = previewPointForComponent(component);
            const previewViewState = getPcbComponentViewState({
              instanceId: component.instanceId,
              x: center.x,
              y: center.y,
              width: component.width,
              height: component.height,
              rotation: component.rotation,
              layer: component.layer,
            }, visibleLayer, selectionIds);
            const transform = selectedComponentVisual?.component.instanceId === component.instanceId
              ? selectedComponentVisual.geometry.transform
              : getComponentCanvasTransform(component, center);
            return (
              <g
                key={component.instanceId}
                transform={transform}
                className={`pcb-component-object${component.locked ? " is-locked" : ""}`}
                data-pcb-coordinate={`${previewViewState.coordinate.x},${previewViewState.coordinate.y}`}
                data-pcb-rotation={String(viewState.rotation)}
                data-pcb-layer={viewState.layer}
                data-pcb-selected={viewState.selected ? "true" : "false"}
                role="button"
                tabIndex={0}
                onKeyDown={(event) =>
                  selectWithKeyboard(event, { kind: "component", id: component.instanceId })}
                aria-label={`元件 ${component.reference} ${component.name}`}
              >
                <rect
                  x={-component.width / 2}
                  y={-component.height / 2}
                  width={component.width}
                  height={component.height}
                  rx={Math.min(0.8, component.width / 6, component.height / 6)}
                  fill={component.color}
                  fillOpacity={component.layer === "bottom" ? 0.48 : 0.9}
                  stroke={selectedComponentIds.has(component.instanceId)
                    ? "#f8fafc"
                    : "#07111d"}
                  strokeWidth={strokeWidth}
                  onPointerDown={(event) => beginComponentDrag(event, component)}
                />
                <text
                  className="pcb-svg-label pcb-component-reference"
                  fontSize={Math.max(1.5, Math.min(component.width, component.height) * 0.34)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {component.reference}
                </text>
              </g>
            );
          })}
        </g>

        <g data-layer="selection-handles" data-export-hidden>
          {selectedComponentVisual && (
            <g
              data-selection-kind="component"
              transform={selectedComponentVisual.geometry.transform}
              pointerEvents="none"
            >
              <rect
                x={selectedComponentVisual.geometry.localBounds.x}
                y={selectedComponentVisual.geometry.localBounds.y}
                width={selectedComponentVisual.geometry.localBounds.width}
                height={selectedComponentVisual.geometry.localBounds.height}
                rx={Math.min(
                  0.8,
                  selectedComponentVisual.geometry.localBounds.width / 6,
                  selectedComponentVisual.geometry.localBounds.height / 6,
                )}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
              />
              {selectedComponentVisual.geometry.handles.map(({ x, y }, index) => (
                <circle
                  key={["nw", "ne", "sw", "se"][index]}
                  cx={x}
                  cy={y}
                  r={strokeWidth * 2.1}
                  fill="#f8fafc"
                />
              ))}
            </g>
          )}
          {selectedBounds && (
            <>
              <rect
                x={selectedBounds.x}
                y={selectedBounds.y}
                width={selectedBounds.width}
                height={selectedBounds.height}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
                pointerEvents="none"
              />
              {workspace.selection?.kind === "keepout"
                ? ([
                  { handle: "nw", x: selectedBounds.x, y: selectedBounds.y, cursor: "nwse-resize" },
                  { handle: "ne", x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y, cursor: "nesw-resize" },
                  { handle: "sw", x: selectedBounds.x, y: selectedBounds.y + selectedBounds.height, cursor: "nesw-resize" },
                  { handle: "se", x: selectedBounds.x + selectedBounds.width, y: selectedBounds.y + selectedBounds.height, cursor: "nwse-resize" },
                ] as const).map(({ handle, x, y, cursor }) => (
                  <circle
                    key={handle}
                    className="pcb-keepout-resize-handle"
                    cx={x}
                    cy={y}
                    r={strokeWidth * 3.2}
                    fill="#081827"
                    stroke="#f8fafc"
                    strokeWidth={strokeWidth}
                    style={{ cursor }}
                    onPointerDown={(event) => beginKeepoutResize(event, handle)}
                    aria-label={`調整禁制區${handle}角`}
                  />
                ))
                : [
                  [selectedBounds.x, selectedBounds.y],
                  [selectedBounds.x + selectedBounds.width, selectedBounds.y],
                  [selectedBounds.x, selectedBounds.y + selectedBounds.height],
                  [selectedBounds.x + selectedBounds.width, selectedBounds.y + selectedBounds.height],
                ].map(([x, y]) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r={strokeWidth * 2.1} fill="#f8fafc" pointerEvents="none" />
                ))}
            </>
          )}
          {selectedMeasurementVisual && (
            <>
              <line
                x1={selectedMeasurementVisual.x1}
                y1={selectedMeasurementVisual.y1}
                x2={selectedMeasurementVisual.x2}
                y2={selectedMeasurementVisual.y2}
                stroke="#f8fafc"
                strokeWidth={strokeWidth}
                strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
                pointerEvents="none"
              />
              {[
                { endpoint: "start", x: selectedMeasurementVisual.x1, y: selectedMeasurementVisual.y1 },
                { endpoint: "end", x: selectedMeasurementVisual.x2, y: selectedMeasurementVisual.y2 },
              ].map(({ endpoint, x, y }) => (
                <g
                  key={endpoint}
                  className="pcb-measurement-endpoint-control"
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => beginMeasurementResize(
                    event,
                    selectedMeasurementVisual,
                    endpoint as MeasurementEndpoint,
                  )}
                  onKeyDown={(event) => nudgeMeasurementEndpoint(
                    event,
                    selectedMeasurementVisual,
                    endpoint as MeasurementEndpoint,
                  )}
                  aria-label={`拖曳或使用方向鍵調整量測${endpoint === "start" ? "起點" : "終點"}`}
                >
                  <circle
                    className="pcb-measurement-resize-handle"
                    cx={x}
                    cy={y}
                    r={Math.max(strokeWidth * 7, 0.8)}
                    fill="transparent"
                  />
                  <circle
                    className="pcb-measurement-resize-dot"
                    cx={x}
                    cy={y}
                    r={strokeWidth * 3.2}
                    fill="#fde047"
                    stroke="#f8fafc"
                    strokeWidth={strokeWidth}
                    pointerEvents="none"
                  />
                </g>
              ))}
            </>
          )}
        </g>

        <g data-layer="tool-draft" data-export-hidden pointerEvents="none">
          {placementPreview && (
            <g
              className="pcb-placement-preview"
              data-placement-valid={placementPreview.valid ? "true" : "false"}
              transform={`translate(${placementPreview.component.x} ${placementPreview.component.y}) rotate(${placementPreview.component.rotation})`}
            >
              <rect
                x={-placementPreview.component.width / 2}
                y={-placementPreview.component.height / 2}
                width={placementPreview.component.width}
                height={placementPreview.component.height}
                rx={Math.min(0.8, placementPreview.component.width / 6, placementPreview.component.height / 6)}
                fill={placementPreview.valid ? placementPreview.component.color : "#fb7185"}
                fillOpacity="0.58"
                stroke={placementPreview.valid ? "#8df3e2" : "#fecdd3"}
                strokeWidth={strokeWidth * 1.5}
                strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 1.5}`}
              />
              <text
                className="pcb-svg-label pcb-component-reference"
                fontSize={Math.max(1.5, Math.min(placementPreview.component.width, placementPreview.component.height) * 0.3)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {placementLibraryComponent?.name}
              </text>
            </g>
          )}
          {interaction?.kind === "keepout" && (
            <rect
              x={Math.min(interaction.start.x, interaction.end.x)}
              y={Math.min(interaction.start.y, interaction.end.y)}
              width={Math.abs(interaction.end.x - interaction.start.x)}
              height={Math.abs(interaction.end.y - interaction.start.y)}
              fill="#fb7185"
              fillOpacity="0.2"
              stroke="#fda4af"
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
            />
          )}
          {interaction?.kind === "measurement" && (
            <line
              x1={interaction.start.x}
              y1={interaction.start.y}
              x2={interaction.end.x}
              y2={interaction.end.y}
              stroke="#fde047"
              strokeWidth={strokeWidth * 1.5}
              strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
            />
          )}
        </g>

        <g data-layer="drc-overlay" data-export-hidden pointerEvents="none">
          {workspace.drcIssues.flatMap((issue) => issue.objectIds.map((objectId) => {
            const component = project.components.find((item) => item.instanceId === objectId);
            if (component) {
              return (
                <g
                  key={`${issue.id}-${objectId}`}
                  transform={`translate(${component.x} ${component.y}) rotate(${component.rotation})`}
                >
                  <rect
                    x={-component.width / 2 - strokeWidth * 2}
                    y={-component.height / 2 - strokeWidth * 2}
                    width={component.width + strokeWidth * 4}
                    height={component.height + strokeWidth * 4}
                    fill="none"
                    stroke="#fb7185"
                    strokeWidth={strokeWidth * 1.5}
                  />
                </g>
              );
            }
            const keepout = project.keepouts.find((item) => item.id === objectId);
            return keepout ? (
              <rect
                key={`${issue.id}-${objectId}`}
                x={keepout.x}
                y={keepout.y}
                width={keepout.width}
                height={keepout.height}
                fill="none"
                stroke="#fb7185"
                strokeWidth={strokeWidth * 1.5}
              />
            ) : [];
          }))}
        </g>
      </svg>
      {placementLibraryComponent && (
        <div className="pcb-placement-banner" data-export-hidden>
          <span className="pcb-placement-banner-dot" style={{ backgroundColor: placementLibraryComponent.color }} />
          <strong>{placementLibraryComponent.name}</strong>
          <span>移動游標預覽，點擊可連續放置</span>
          <kbd>R</kbd>
          <span>旋轉 {placementRotation}°</span>
          <kbd>Esc</kbd>
          <span>取消</span>
        </div>
      )}
      {!placementLibraryComponent && workspace.tool === "keepout" && (
        <div className="pcb-placement-banner pcb-keepout-banner" data-export-hidden>
          <span className="pcb-placement-banner-dot" />
          <strong>建立禁制區</strong>
          <span>在板框內按住並拖曳</span>
          <kbd>K</kbd>
          <span>切換工具</span>
          <kbd>Esc</kbd>
          <span>取消</span>
        </div>
      )}
      <div className="pcb-canvas-hud" data-export-hidden>
        <span>{placementLibraryComponent ? "放置元件" : workspace.tool === "select" ? "選取" : workspace.tool === "pan" ? "平移" : workspace.tool === "measure" ? "測量" : "禁制區"}</span>
        {selectedKeepout && workspace.tool === "select" && <span>拖曳四角縮放 · Delete 刪除</span>}
        {selectedMeasurementVisual && workspace.tool === "select" && <span>拖曳亮色端點調整 · Alt 暫停吸附</span>}
        <span>Alt 暫停吸附</span>
        <span className="font-mono">
          X {cursorPoint?.x.toFixed(2) ?? "—"} · Y {cursorPoint?.y.toFixed(2) ?? "—"}
        </span>
        <span className="font-mono">{workspace.zoom}%</span>
      </div>
    </main>
  );
}
