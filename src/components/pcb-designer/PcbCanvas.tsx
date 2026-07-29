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
  getRotatedRectangleCorners,
  snapPoint,
} from "./core/geometry.ts";
import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import type { PcbPlacedComponent, PcbPoint } from "./types.ts";

export const PCB_LIBRARY_DRAG_TYPE = "application/x-pcb-library-component";

interface CanvasSize {
  width: number;
  height: number;
}

interface PcbCanvasProps {
  workspace: PcbWorkspaceApi;
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
    offset: PcbPoint;
    preview: PcbPoint;
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

function selectionBounds(workspace: PcbWorkspaceApi, preview?: PcbPoint) {
  if (!workspace.selection || !workspace.selectedObject) return null;
  if (workspace.selection.kind === "component") {
    const component = workspace.selectedObject as PcbPlacedComponent;
    const center = preview ?? { x: component.x, y: component.y };
    const points = getRotatedRectangleCorners({ ...component, ...center });
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }
  if (workspace.selection.kind === "keepout") {
    const keepout = workspace.selectedObject as { x: number; y: number; width: number; height: number };
    return {
      x: preview?.x ?? keepout.x,
      y: preview?.y ?? keepout.y,
      width: keepout.width,
      height: keepout.height,
    };
  }
  const measurement = workspace.selectedObject as { x1: number; y1: number; x2: number; y2: number };
  return {
    x: Math.min(measurement.x1, measurement.x2),
    y: Math.min(measurement.y1, measurement.y2),
    width: Math.abs(measurement.x2 - measurement.x1),
    height: Math.abs(measurement.y2 - measurement.y1),
  };
}

export function PcbCanvas({
  workspace,
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

  const previewComponent = interaction?.kind === "component" ? interaction : null;
  const previewSelection = interaction?.kind === "component"
    ? { id: interaction.instanceId, point: interaction.preview }
    : interaction?.kind === "keepout-move"
      ? { id: interaction.id, point: interaction.preview }
      : null;
  const selectedBounds = selectionBounds(
    workspace,
    previewSelection && workspace.selection?.id === previewSelection.id
      ? previewSelection.point
      : undefined,
  );
  const gridSize = project.board.gridSize;
  const strokeWidth = Math.max(project.board.width, project.board.height) / 700;
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
      workspace.selectObject(selection);
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
        workspace.selectObject({ kind: "component", id: result.component.instanceId });
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
      workspace.selectObject(null);
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
    event.stopPropagation();
    if (event.button !== 0) return;
    workspace.selectObject({ kind: "component", id: component.instanceId });
    const svg = svgRef.current;
    if (!svg || workspace.tool !== "select" || !workspace.canMutate || component.locked) return;
    const point = pointForEvent(svg, event.clientX, event.clientY);
    svg.setPointerCapture(event.pointerId);
    setInteraction({
      kind: "component",
      pointerId: event.pointerId,
      instanceId: component.instanceId,
      offset: { x: point.x - component.x, y: point.y - component.y },
      preview: { x: component.x, y: component.y },
      bypassSnap: event.altKey,
    });
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
      setInteraction({
        ...interaction,
        bypassSnap,
        preview: project.board.snapToGrid
          ? snapPoint({ x, y }, gridSize, bypassSnap)
          : { x, y },
      });
    } else if (interaction.kind === "keepout-move") {
      const bypassSnap = event.altKey;
      const x = point.x - interaction.offset.x;
      const y = point.y - interaction.offset.y;
      setInteraction({
        ...interaction,
        bypassSnap,
        preview: project.board.snapToGrid
          ? snapPoint({ x, y }, gridSize, bypassSnap)
          : { x, y },
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
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (interaction.kind === "component") {
      const result = workspace.moveComponent(
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
      workspace.selectObject({ kind: "component", id: result.component.instanceId });
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
            x="0"
            y="0"
            width={project.board.width}
            height={project.board.height}
            rx={Math.min(2, project.board.gridSize)}
            fill={project.board.background}
            fillOpacity="0.76"
            stroke="#7ee8f5"
            strokeWidth={strokeWidth}
          />
          <circle cx="0" cy="0" r={strokeWidth * 2.2} fill="#e2f9fb" aria-label="原點" />
        </g>

        <g data-layer="keepouts">
          {project.keepouts.map((keepout) => {
            const preview = interaction?.kind === "keepout-move" && interaction.id === keepout.id
              ? interaction.preview
              : keepout;
            return (
              <rect
              key={keepout.id}
              x={preview.x}
              y={preview.y}
              width={keepout.width}
              height={keepout.height}
              fill={keepout.color}
              fillOpacity="0.18"
              stroke={keepout.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeWidth * 4} ${strokeWidth * 2}`}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                if (workspace.tool === "pan" || event.button === 1) return;
                event.stopPropagation();
                if (event.button !== 0) return;
                workspace.selectObject({ kind: "keepout", id: keepout.id });
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
          {project.measurements.map((measurement) => (
            <g
              key={measurement.id}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => {
                if (workspace.tool === "pan" || event.button === 1) return;
                event.stopPropagation();
                if (event.button !== 0) return;
                workspace.selectObject({ kind: "measurement", id: measurement.id });
              }}
              onKeyDown={(event) =>
                selectWithKeyboard(event, { kind: "measurement", id: measurement.id })}
              aria-label="測量線"
            >
              <line
                x1={measurement.x1}
                y1={measurement.y1}
                x2={measurement.x2}
                y2={measurement.y2}
                stroke={measurement.color}
                strokeWidth={strokeWidth * 1.5}
              />
              <circle cx={measurement.x1} cy={measurement.y1} r={strokeWidth * 2} fill={measurement.color} />
              <circle cx={measurement.x2} cy={measurement.y2} r={strokeWidth * 2} fill={measurement.color} />
              <text
                x={(measurement.x1 + measurement.x2) / 2}
                y={(measurement.y1 + measurement.y2) / 2 - strokeWidth * 3}
                className="pcb-svg-label"
                fontSize={strokeWidth * 7}
                textAnchor="middle"
              >
                {Math.hypot(measurement.x2 - measurement.x1, measurement.y2 - measurement.y1).toFixed(2)} mm
              </text>
            </g>
          ))}
        </g>

        <g data-layer="components">
          {project.components.map((component) => {
            const preview = previewComponent?.instanceId === component.instanceId
              ? previewComponent.preview
              : component;
            return (
              <g
                key={component.instanceId}
                transform={`translate(${preview.x} ${preview.y}) rotate(${component.rotation})`}
                className={component.locked ? "is-locked" : undefined}
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
                  stroke={workspace.selection?.kind === "component" && workspace.selection.id === component.instanceId
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
              {[
                [selectedBounds.x, selectedBounds.y],
                [selectedBounds.x + selectedBounds.width, selectedBounds.y],
                [selectedBounds.x, selectedBounds.y + selectedBounds.height],
                [selectedBounds.x + selectedBounds.width, selectedBounds.y + selectedBounds.height],
              ].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r={strokeWidth * 2.1} fill="#f8fafc" pointerEvents="none" />
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
      <div className="pcb-canvas-hud" data-export-hidden>
        <span>{placementLibraryComponent ? "放置元件" : workspace.tool === "select" ? "選取" : workspace.tool === "pan" ? "平移" : workspace.tool === "measure" ? "測量" : "禁制區"}</span>
        <span>Alt 暫停吸附</span>
        <span className="font-mono">
          X {cursorPoint?.x.toFixed(2) ?? "—"} · Y {cursorPoint?.y.toFixed(2) ?? "—"}
        </span>
        <span className="font-mono">{workspace.zoom}%</span>
      </div>
    </main>
  );
}
