import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Box, Focus, MousePointer2 } from "lucide-react";

import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import {
  getDefaultPcbModelAssetStore,
  isPcbModelAsset,
  mapPcbModelPartToComponentSpace,
} from "./core/modelAssets.ts";
import {
  DEFAULT_SOFTWARE_VIEW,
  MAX_SOFTWARE_MODEL_TRIANGLES,
  SOFTWARE_RENDER_ORDER,
  compareSoftwareRenderDepth,
  createSoftwareBoxVertices,
  createSoftwareCamera,
  getSoftwareFaceNormal,
  getSoftwareLayerRenderOrder,
  getSoftwareLightLevel,
  projectSoftwarePoint,
  sampleTriangleOffsets,
  transformPcbComponentPoint,
  type SoftwarePoint3,
  type SoftwareProjectedPoint,
  type SoftwareViewState,
} from "./core/software3d.ts";
import {
  getPcbComponentViewState,
  getPcbSelectionIds,
} from "./core/viewSync.ts";
import type { PcbModelAsset, PcbSelection, PcbVisibleLayer } from "./types.ts";

const BOARD_THICKNESS = 1.6;
const BOX_FACES = [
  [4, 5, 6, 7],
  [0, 3, 2, 1],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
] as const;

interface ScenePolygon {
  kind: "polygon";
  points: SoftwareProjectedPoint[];
  depth: number;
  renderOrder: number;
  fill: string;
  stroke: string;
  alpha: number;
  lineWidth: number;
}

interface SceneLine {
  kind: "line";
  points: [SoftwareProjectedPoint, SoftwareProjectedPoint];
  depth: number;
  renderOrder: number;
  stroke: string;
  alpha: number;
  lineWidth: number;
}

type SceneShape = ScenePolygon | SceneLine;

interface HitTarget {
  kind: "component" | "keepout";
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  depth: number;
  selected: boolean;
  label?: string;
}

interface PointerDragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: "orbit" | "pan";
  moved: boolean;
}

interface CachedModelPart {
  part: PcbModelAsset["parts"][number];
  positions: number[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string, fallback = "#6bc7d9"): [number, number, number] {
  const source = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return [
    Number.parseInt(source.slice(1, 3), 16),
    Number.parseInt(source.slice(3, 5), 16),
    Number.parseInt(source.slice(5, 7), 16),
  ];
}

function shadeColor(value: string, level: number): string {
  const [red, green, blue] = parseHexColor(value);
  return `rgb(${Math.round(clamp(red * level, 0, 255))} ${Math.round(clamp(green * level, 0, 255))} ${Math.round(clamp(blue * level, 0, 255))})`;
}

function partColor(asset: PcbModelAsset, partId: string, fallback: string): string {
  const color = asset.metadata.parts.find((part) => part.id === partId)?.color;
  if (!color) return fallback;
  return `#${color.map((channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function projectedArea(points: readonly SoftwareProjectedPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function getProjectedBounds(points: readonly SoftwareProjectedPoint[]) {
  const visible = points.filter((point) => point.visible);
  if (!visible.length) return null;
  return {
    left: Math.min(...visible.map((point) => point.x)),
    top: Math.min(...visible.map((point) => point.y)),
    right: Math.max(...visible.map((point) => point.x)),
    bottom: Math.max(...visible.map((point) => point.y)),
    depth: visible.reduce((total, point) => total + point.depth, 0) / visible.length,
  };
}

function getSelectionById(objectId: string, workspace: PcbWorkspaceApi): PcbSelection | null {
  if (workspace.activeProject.components.some((component) => component.instanceId === objectId)) {
    return { kind: "component", id: objectId };
  }
  if (workspace.activeProject.keepouts.some((keepout) => keepout.id === objectId)) {
    return { kind: "keepout", id: objectId };
  }
  if (workspace.activeProject.measurements.some((measurement) => measurement.id === objectId)) {
    return { kind: "measurement", id: objectId };
  }
  return null;
}

export function PcbSoftware3DCanvas({
  workspace,
  visibleLayer = workspace.visibleLayer,
  selectedObjects = workspace.selectedObjects,
  reason = "WebGL 未啟用，已自動切換相容 3D。",
}: {
  workspace: PcbWorkspaceApi;
  visibleLayer?: PcbVisibleLayer;
  selectedObjects?: readonly string[];
  reason?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const [view, setView] = useState<SoftwareViewState>(DEFAULT_SOFTWARE_VIEW);
  const [viewport, setViewport] = useState({ width: 1, height: 1, dpr: 1 });
  const project = workspace.activeProject;
  const modelAssetIds = useMemo(
    () => [...new Set(project.components.map((component) => component.modelAssetId).filter(Boolean))] as string[],
    [project.components],
  );
  const modelAssetKey = modelAssetIds.join("|");
  const [modelAssets, setModelAssets] = useState<Record<string, PcbModelAsset | null>>({});

  useEffect(() => {
    let active = true;
    const store = getDefaultPcbModelAssetStore();
    const ids = modelAssetKey ? modelAssetKey.split("|") : [];
    void Promise.all(ids.map(async (id) => [id, await store.get(id)] as const)).then((entries) => {
      if (!active) return;
      setModelAssets(Object.fromEntries(entries.map(([id, asset]) => [id, asset && isPcbModelAsset(asset) ? asset : null])));
    });
    return () => {
      active = false;
    };
  }, [modelAssetKey]);

  const mappedModelParts = useMemo(() => {
    const mapped: Record<string, CachedModelPart[]> = {};
    project.components.forEach((component) => {
      const asset = component.modelAssetId ? modelAssets[component.modelAssetId] : null;
      if (!asset) return;
      mapped[component.instanceId] = asset.parts.map((part) => ({
        part,
        positions: mapPcbModelPartToComponentSpace(part, asset, component),
      }));
    });
    return mapped;
  }, [modelAssets, project.components]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateSize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      setViewport((current) => current.width === width && current.height === height && current.dpr === dpr
        ? current
        : { width, height, dpr });
    };
    updateSize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSize);
    observer?.observe(host);
    window.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const selectedSelections = useMemo(
    () => selectedObjects
      .map((objectId) => getSelectionById(objectId, workspace))
      .filter((selection): selection is PcbSelection => selection !== null),
    [selectedObjects, workspace],
  );
  const selectionIds = useMemo(
    () => getPcbSelectionIds(workspace.selection, selectedSelections),
    [selectedSelections, workspace.selection],
  );
  const selectedIds = useMemo(() => new Set(selectionIds), [selectionIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 1 || viewport.height <= 1) return;
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const backdrop = context.createRadialGradient(
      viewport.width * 0.52,
      viewport.height * 0.46,
      20,
      viewport.width * 0.52,
      viewport.height * 0.46,
      Math.max(viewport.width, viewport.height) * 0.7,
    );
    backdrop.addColorStop(0, "#10283b");
    backdrop.addColorStop(0.48, "#091a29");
    backdrop.addColorStop(1, "#06111d");
    context.fillStyle = backdrop;
    context.fillRect(0, 0, viewport.width, viewport.height);

    const camera = createSoftwareCamera(project.board, viewport, view);
    const shapes: SceneShape[] = [];
    const hits: HitTarget[] = [];
    const labels: Array<{ x: number; y: number; text: string }> = [];

    const addPolygon = (
      worldPoints: SoftwarePoint3[],
      fill: string,
      stroke: string,
      renderOrder: number,
      alpha = 1,
      lineWidth = 0.7,
    ) => {
      const points = worldPoints.map((point) => projectSoftwarePoint(point, camera));
      if (points.some((point) => !point.visible) || projectedArea(points) < 0.08) return;
      shapes.push({
        kind: "polygon",
        points,
        depth: points.reduce((total, point) => total + point.depth, 0) / points.length,
        renderOrder,
        fill,
        stroke,
        alpha,
        lineWidth,
      });
    };

    const addBox = (
      worldVertices: SoftwarePoint3[],
      color: string,
      stroke: string,
      renderOrder: number,
      alpha = 1,
      lineWidth = 0.7,
    ) => {
      BOX_FACES.forEach((face) => {
        const worldPoints = face.map((index) => worldVertices[index]);
        const normal = getSoftwareFaceNormal(worldPoints[0], worldPoints[1], worldPoints[2]);
        addPolygon(worldPoints, shadeColor(color, getSoftwareLightLevel(normal)), stroke, renderOrder, alpha, lineWidth);
      });
    };

    const boardSurfaceColor = visibleLayer === "all"
      ? project.board.background
      : visibleLayer === "top"
        ? project.board.layerColors.top
        : project.board.layerColors.bottom;
    addBox(
      createSoftwareBoxVertices(project.board.width, BOARD_THICKNESS, project.board.height),
      boardSurfaceColor,
      "#7de7e8",
      SOFTWARE_RENDER_ORDER.board,
      1,
      1.05,
    );

    if (project.board.showGrid) {
      const gridStep = Math.max(project.board.gridSize, Math.ceil(Math.max(project.board.width, project.board.height) / 80));
      const gridLayers: Array<"top" | "bottom"> = visibleLayer === "all"
        ? ["top", "bottom"]
        : [visibleLayer];
      gridLayers.forEach((gridLayer) => {
        const gridY = (BOARD_THICKNESS / 2 + 0.015) * (gridLayer === "top" ? 1 : -1);
        const gridRenderOrder = getSoftwareLayerRenderOrder(gridLayer, camera.eye.y, "surface");
        for (let x = -project.board.width / 2; x <= project.board.width / 2 + 0.001; x += gridStep) {
          const points = [
            projectSoftwarePoint({ x, y: gridY, z: -project.board.height / 2 }, camera),
            projectSoftwarePoint({ x, y: gridY, z: project.board.height / 2 }, camera),
          ] as [SoftwareProjectedPoint, SoftwareProjectedPoint];
          if (points.every((point) => point.visible)) {
            shapes.push({ kind: "line", points, depth: (points[0].depth + points[1].depth) / 2, renderOrder: gridRenderOrder, stroke: "#70b9c7", alpha: 0.17, lineWidth: 0.55 });
          }
        }
        for (let z = -project.board.height / 2; z <= project.board.height / 2 + 0.001; z += gridStep) {
          const points = [
            projectSoftwarePoint({ x: -project.board.width / 2, y: gridY, z }, camera),
            projectSoftwarePoint({ x: project.board.width / 2, y: gridY, z }, camera),
          ] as [SoftwareProjectedPoint, SoftwareProjectedPoint];
          if (points.every((point) => point.visible)) {
            shapes.push({ kind: "line", points, depth: (points[0].depth + points[1].depth) / 2, renderOrder: gridRenderOrder, stroke: "#70b9c7", alpha: 0.17, lineWidth: 0.55 });
          }
        }
      });
    }

    project.keepouts.forEach((keepout) => {
      const selected = selectedIds.has(keepout.id);
      const renderOrder = getSoftwareLayerRenderOrder("top", camera.eye.y);
      const isNearSide = renderOrder > SOFTWARE_RENDER_ORDER.board;
      const centerX = keepout.x + keepout.width / 2 - project.board.width / 2;
      const centerZ = project.board.height / 2 - keepout.y - keepout.height / 2;
      const worldVertices = createSoftwareBoxVertices(keepout.width, 0.36, keepout.height).map((point) => ({
        x: centerX + point.x,
        y: BOARD_THICKNESS / 2 + 0.2 + point.y,
        z: centerZ + point.z,
      }));
      addBox(worldVertices, keepout.color || "#ef8354", selected ? "#fff3bf" : "#f2a56d", renderOrder, selected ? 0.7 : 0.38, selected ? 1.5 : 0.7);
      const bounds = getProjectedBounds(worldVertices.map((point) => projectSoftwarePoint(point, camera)));
      if (bounds && isNearSide) hits.push({ kind: "keepout", id: keepout.id, ...bounds, selected });
    });

    const visibleComponents = project.components
      .map((component) => ({
        component,
        viewState: getPcbComponentViewState(component, visibleLayer, selectionIds),
      }))
      .filter(({ viewState }) => viewState.visible);
    const modelComponentCount = Math.max(1, visibleComponents.filter(({ component }) => component.modelAssetId && modelAssets[component.modelAssetId]).length);
    const modelBudget = Math.max(320, Math.floor(MAX_SOFTWARE_MODEL_TRIANGLES / modelComponentCount));

    visibleComponents.forEach(({ component, viewState }) => {
      const selected = viewState.selected;
      const renderOrder = getSoftwareLayerRenderOrder(component.layer, camera.eye.y);
      const isNearSide = renderOrder > SOFTWARE_RENDER_ORDER.board;
      const localBounds = createSoftwareBoxVertices(component.width, component.maxHeight, component.height);
      const worldBounds = localBounds.map((point) => transformPcbComponentPoint(point, component, project.board, BOARD_THICKNESS));
      const projectedBounds = getProjectedBounds(worldBounds.map((point) => projectSoftwarePoint(point, camera)));
      if (projectedBounds && isNearSide) {
        hits.push({
          kind: "component",
          id: component.instanceId,
          ...projectedBounds,
          selected,
          label: component.reference,
        });
      }

      const asset = component.modelAssetId ? modelAssets[component.modelAssetId] : null;
      const cachedParts = mappedModelParts[component.instanceId];
      if (!asset || !cachedParts) {
        addBox(worldBounds, component.color, selected ? "#f8fafc" : "#214b60", renderOrder, 1, selected ? 1.5 : 0.7);
      } else {
        const totalTriangles = Math.max(1, cachedParts.reduce((total, { part }) => total + Math.floor(part.index.length / 3), 0));
        cachedParts.forEach(({ part, positions }) => {
          const partTriangleCount = Math.floor(part.index.length / 3);
          const partBudget = Math.max(1, Math.floor(modelBudget * (partTriangleCount / totalTriangles)));
          const color = partColor(asset, part.id, component.color);
          sampleTriangleOffsets(part.index.length, partBudget).forEach((offset) => {
            const worldPoints = [0, 1, 2].map((corner) => {
              const vertexIndex = part.index[offset + corner] * 3;
              return transformPcbComponentPoint({
                x: positions[vertexIndex],
                y: positions[vertexIndex + 1],
                z: positions[vertexIndex + 2],
              }, component, project.board, BOARD_THICKNESS);
            });
            const normal = getSoftwareFaceNormal(worldPoints[0], worldPoints[1], worldPoints[2]);
            addPolygon(
              worldPoints,
              shadeColor(color, getSoftwareLightLevel(normal)),
              selected ? "#f8fafc" : shadeColor(color, 0.58),
              renderOrder,
              1,
              selected ? 0.95 : 0.2,
            );
          });
        });
      }

      if (selected && projectedBounds && isNearSide) {
        labels.push({
          x: (projectedBounds.left + projectedBounds.right) / 2,
          y: projectedBounds.top - 10,
          text: component.reference,
        });
      }
    });

    shapes.sort(compareSoftwareRenderDepth);
    shapes.forEach((shape) => {
      context.save();
      context.globalAlpha = shape.alpha;
      context.strokeStyle = shape.stroke;
      context.lineWidth = shape.lineWidth;
      context.beginPath();
      context.moveTo(shape.points[0].x, shape.points[0].y);
      if (shape.kind === "polygon") {
        for (let index = 1; index < shape.points.length; index += 1) {
          context.lineTo(shape.points[index].x, shape.points[index].y);
        }
        context.closePath();
        context.fillStyle = shape.fill;
        context.fill();
      } else {
        context.lineTo(shape.points[1].x, shape.points[1].y);
      }
      context.stroke();
      context.restore();
    });

    hits.filter((target) => target.selected).forEach((target) => {
      context.save();
      context.strokeStyle = "#dffaff";
      context.lineWidth = 1.5;
      context.setLineDash([5, 4]);
      context.shadowColor = "#22d3ee";
      context.shadowBlur = 10;
      context.strokeRect(
        target.left - 4,
        target.top - 4,
        target.right - target.left + 8,
        target.bottom - target.top + 8,
      );
      context.restore();
    });

    labels.forEach((label) => {
      context.save();
      context.font = "700 11px 'Segoe UI', sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      const width = context.measureText(label.text).width + 14;
      context.fillStyle = "rgb(8 24 39 / 92%)";
      context.strokeStyle = "#4b819e";
      context.lineWidth = 1;
      context.beginPath();
      if (typeof context.roundRect === "function") {
        context.roundRect(label.x - width / 2, label.y - 10, width, 20, 6);
      } else {
        context.rect(label.x - width / 2, label.y - 10, width, 20);
      }
      context.fill();
      context.stroke();
      context.fillStyle = "#effcff";
      context.fillText(label.text, label.x, label.y);
      context.restore();
    });

    hitTargetsRef.current = hits.sort((left, right) => left.depth - right.depth);
  }, [mappedModelParts, modelAssets, project, selectedIds, selectionIds, view, viewport, visibleLayer]);

  const resetView = useCallback(() => setView(DEFAULT_SOFTWARE_VIEW), []);

  const selectAt = useCallback((x: number, y: number, additive: boolean) => {
    const target = hitTargetsRef.current.find((candidate) =>
      x >= candidate.left - 5 && x <= candidate.right + 5
      && y >= candidate.top - 5 && y <= candidate.bottom + 5);
    if (!target) {
      workspace.selectObject(null);
      workspace.clearObjectSelection();
      return;
    }
    if (additive) {
      workspace.toggleObjectSelection(target.id);
    } else {
      workspace.selectObject({ kind: target.kind, id: target.id });
      workspace.clearObjectSelection();
    }
  }, [workspace]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      mode: event.button === 2 || event.shiftKey ? "pan" : "orbit",
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    if (drag.mode === "pan") {
      setView((current) => ({ ...current, panX: current.panX + deltaX, panY: current.panY + deltaY }));
    } else {
      setView((current) => ({
        ...current,
        yaw: current.yaw - deltaX * 0.008,
        pitch: clamp(current.pitch + deltaY * 0.006, -1.25, 1.25),
      }));
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag.moved && event.button === 0) {
      const bounds = event.currentTarget.getBoundingClientRect();
      selectAt(event.clientX - bounds.left, event.clientY - bounds.top, event.ctrlKey || event.metaKey);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0012);
    setView((current) => ({ ...current, zoom: clamp(current.zoom * factor, 0.45, 3.4) }));
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      resetView();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setView((current) => ({ ...current, zoom: clamp(current.zoom * 1.12, 0.45, 3.4) }));
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setView((current) => ({ ...current, zoom: clamp(current.zoom / 1.12, 0.45, 3.4) }));
      return;
    }
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [0.08, 0],
      ArrowRight: [-0.08, 0],
      ArrowUp: [0, -0.06],
      ArrowDown: [0, 0.06],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    setView((current) => ({
      ...current,
      yaw: current.yaw + direction[0],
      pitch: clamp(current.pitch + direction[1], -1.25, 1.25),
    }));
  };

  const loadedModelCount = Object.values(modelAssets).filter(Boolean).length;

  return (
    <div
      ref={hostRef}
      className="pcb-software-3d"
      data-testid="pcb-software-3d"
      data-renderer="software-canvas"
      data-loaded-models={loadedModelCount}
    >
      <canvas
        ref={canvasRef}
        role="application"
        tabIndex={0}
        aria-label="PCB 相容 3D 檢視；可拖曳旋轉、右鍵平移、滾輪縮放並點選元件"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerDragRef.current = null;
        }}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      />
      <div className="pcb-software-3d-badge" role="status" title={reason}>
        <Box aria-hidden="true" />
        <span>
          <strong>相容 3D</strong>
          <small>免 WebGL</small>
        </span>
      </div>
      <button type="button" className="pcb-3d-reset" onClick={resetView}>
        <Focus aria-hidden="true" />
        重設視角
      </button>
      <div className="pcb-3d-help">
        <MousePointer2 aria-hidden="true" />
        拖曳旋轉 · 右鍵平移 · 滾輪縮放 · 點選元件
      </div>
      <span className="sr-only" aria-live="polite">{reason}</span>
    </div>
  );
}
