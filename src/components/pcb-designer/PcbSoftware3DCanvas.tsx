import { getBoardPolygon, getBoardHoles, pointInBoardPolygon } from "./core/boardOutline.ts";
import { getPcbModelRenderIndices } from "./core/modelProjection.ts";
import { getRenderedKeepouts } from "./core/componentKeepout.ts";
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
  getPcbModelPartColor,
  isPcbModelAsset,
  mapPcbModelPartToComponentSpace,
} from "./core/modelAssets.ts";
import { getPcbPackageAsset } from "./core/packageModels.ts";
import { usePcbPackageKit } from "./hooks/usePcbPackageKit.ts";
import {
  DEFAULT_SOFTWARE_VIEW,

  SOFTWARE_RENDER_ORDER,
  addSoftwarePieceBounds,
  compareSoftwareRenderDepth,
  createSoftwareBoxVertices,
  createSoftwareCamera,
  getSoftwareFaceNormal,
  getSoftwareCanvasResolution,

  getPcbMountY,
  getSoftwareLayerRenderOrder,
  getSoftwareLightLevel,
  createSoftwareBoardClassifier,
  isSoftwarePieceBehindBoard,
  joinSoftwarePieceBounds,
  mergeSoftwarePieceBounds,
  projectSoftwarePoint,
  splitSoftwarePolygonAtBoardSurface,

  transformPcbComponentPoint,
  type SoftwarePieceBounds,
  type SoftwarePoint3,
  type SoftwareProjectedPoint,
  type SoftwareViewState,
} from "./core/software3d.ts";
import {
  getPcbComponentViewState,
  getPcbSelectionIds,
  getPcb3DComponentTransform,
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
  holes?: ReturnType<typeof projectSoftwarePoint>[][];
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

/** A mesh face cut at the board surfaces for one camera side, with the place of its board-thickness piece. */
interface CutFace {
  near: SoftwarePoint3[];
  within: SoftwarePoint3[];
  withinPlace: "inside" | "outside" | "crossing" | null;
  beyond: SoftwarePoint3[];
}

type CameraSide = "top" | "bottom";

interface FaceCacheEntry {
  /** Layer, insertion depth and 高: what the cut depends on. */
  height: string;
  cuts: Partial<Record<CameraSide, Map<number, { near: SoftwarePoint3[]; within: SoftwarePoint3[]; beyond: SoftwarePoint3[] }>>>;
  /** Position and rotation on the board, and the board shape (compared by reference). */
  placement: string;
  board: string;
  /** Per face, the place of its board-thickness piece: 0 not known yet, 1 inside, 2 outside, 3 crossing. */
  places: Partial<Record<CameraSide, Uint8Array>>;
}

const PLACE_CODES = [null, "inside", "outside", "crossing"] as const;

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
  /** A part on the other side, clickable where its pieces poke through; parts on the camera side win. */
  poking?: boolean;
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
  /**
   * Per mapped mesh, only for faces that cross a board surface (leads through the board). Level 1: the cut at
   * the board surfaces in mounted part space, which depends on height only (layer, insertion depth, 高), not on
   * where the part sits. Level 2: one byte per face, the place of its board-thickness piece, cleared when the
   * part moves or the board shape changes. Pieces are placed on the board each frame (cheap, per-part maths).
   * Faces wholly on one side need no cut and are not stored.
   */
  const faceCacheRef = useRef(new WeakMap<object, FaceCacheEntry>());
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const [view, setView] = useState<SoftwareViewState>(DEFAULT_SOFTWARE_VIEW);
  const [viewport, setViewport] = useState(() => getSoftwareCanvasResolution(1, 1));
  const project = workspace.activeProject;
  /**
   * The board's shape as text. Every edit copies the whole project, so the board object changes even when only
   * a part moved; the caches below follow this key instead, and rebuild only when the outline or cut-outs change.
   */
  const boardShapeKey = useMemo(
    () => JSON.stringify([project.board.width, project.board.height, getBoardPolygon(project.board), getBoardHoles(project.board)]),
    [project.board],
  );
  /** Where a piece inside the board thickness sits against the board; built once per board shape. */
  const classifyWithinPiece = useMemo(() => {
    const [width, height, outline, cutOuts] = JSON.parse(boardShapeKey) as [number, number, Array<{ x: number; y: number }>, Array<Array<{ x: number; y: number }>>];
    const toPlan = (point: { x: number; y: number }) => ({ x: point.x - width / 2, z: point.y - height / 2 });
    return createSoftwareBoardClassifier([outline, ...cutOuts].map((ring) => ring.map(toPlan)), (x, z) => {
      const planPoint = { x: x + width / 2, y: z + height / 2 };
      return pointInBoardPolygon(planPoint, outline) && !cutOuts.some((ring) => pointInBoardPolygon(planPoint, ring));
    });
  }, [boardShapeKey]);
  const loadModelAsset = workspace.loadModelAsset;
  const modelAssetIds = useMemo(
    () => [...new Set(project.components.map((component) => component.modelAssetId).filter(Boolean))] as string[],
    [project.components],
  );
  const modelAssetKey = modelAssetIds.join("|");
  const [modelAssets, setModelAssets] = useState<Record<string, PcbModelAsset | null>>({});
  // Components without STEP show the Blender-built schematic package, like the WebGL view.
  const packageKit = usePcbPackageKit();

  useEffect(() => {
    let active = true;
    const store = getDefaultPcbModelAssetStore();
    const ids = modelAssetKey ? modelAssetKey.split("|") : [];
    void Promise.all(ids.map(async (id) => {
      try {
        let asset = await store.get(id).catch(() => null);
        if (!asset || !isPcbModelAsset(asset)) {
          asset = await loadModelAsset(id);
          if (asset) await store.put(asset).catch(() => undefined);
        }
        return [id, asset] as const;
      } catch {
        return [id, null] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setModelAssets(Object.fromEntries(entries.map(([id, asset]) => [id, asset && isPcbModelAsset(asset) ? asset : null])));
    });
    return () => {
      active = false;
    };
  }, [loadModelAsset, modelAssetKey]);

  // A mapped mesh depends only on the model, the size and 模型朝向, not on where the part sits. It is reused by
  // part id while those stay the same, so moving a part re-maps nothing and the cached cuts of the other parts
  // stay valid. The cache holds only the open board's parts, so switching boards cannot pile meshes up.
  const mappingCacheRef = useRef(new Map<string, { asset: unknown; size: string; parts: CachedModelPart[] }>());
  const mappedModelParts = useMemo(() => {
    const mapped: Record<string, CachedModelPart[]> = {};
    const kept = new Map<string, { asset: unknown; size: string; parts: CachedModelPart[] }>();
    project.components.forEach((component) => {
      const asset = component.modelAssetId ? modelAssets[component.modelAssetId] : getPcbPackageAsset(component, packageKit);
      if (!asset) return;
      const size = JSON.stringify([component.width, component.height, component.maxHeight, component.modelRotation ?? null]);
      const reused = mappingCacheRef.current.get(component.instanceId);
      const parts = reused && reused.asset === asset && reused.size === size ? reused.parts : asset.parts.map((part) => ({
        part: { ...part, index: getPcbModelRenderIndices(part.index, asset.metadata.upAxis) },
        positions: mapPcbModelPartToComponentSpace(part, asset, component),
      }));
      kept.set(component.instanceId, { asset, size, parts });
      mapped[component.instanceId] = parts;
    });
    mappingCacheRef.current = kept;
    return mapped;
  }, [modelAssets, packageKit, project.components]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateSize = () => {
      const bounds = host.getBoundingClientRect();
      const next = getSoftwareCanvasResolution(bounds.width, bounds.height, window.devicePixelRatio || 1);
      setViewport((current) => current.width === next.width
        && current.height === next.height
        && current.pixelWidth === next.pixelWidth
        && current.pixelHeight === next.pixelHeight
        ? current
        : next);
    };
    updateSize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateSize);
    observer?.observe(host);
    window.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("resize", updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("resize", updateSize);
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
    canvas.width = viewport.pixelWidth;
    canvas.height = viewport.pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.setTransform(viewport.scale, 0, 0, viewport.scale, 0, 0);
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
      minimumArea = 0.08,
    ) => {
      const points = worldPoints.map((point) => projectSoftwarePoint(point, camera));
      if (points.some((point) => !point.visible) || projectedArea(points) < minimumArea) return;
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

    const boardPolygon = getBoardPolygon(project.board);
    const holes = getBoardHoles(project.board);
    const world = (p: {x:number;y:number}, y:number) => ({x:p.x-project.board.width/2,y,z:p.y-project.board.height/2});
    // Fill the visible face as one compound path. Separate triangles leave
    // antialias seams and allow painter-sorted back faces to show through.
    const faceSign = camera.eye.y >= 0 ? 1 : -1;
    const projectedOuter = boardPolygon.map(p => projectSoftwarePoint(world(p,faceSign*BOARD_THICKNESS/2),camera));
    shapes.push({ kind: "polygon", points: projectedOuter,
      holes: holes.map(ring => ring.map(p => projectSoftwarePoint(world(p,faceSign*BOARD_THICKNESS/2),camera))),
      depth: projectedOuter.reduce((sum,p)=>sum+p.depth,0)/projectedOuter.length,
      renderOrder: SOFTWARE_RENDER_ORDER.board + .1,
      fill: faceSign === 1 ? project.board.layerColors.top : project.board.layerColors.bottom,
      stroke: "#7de7e8", alpha: 1, lineWidth: .7 });
    // Edge and cut-out walls are cut into short pieces and depth-sorted with the far component pieces, so a
    // part in a cut-out or in front of the board edge is not covered by a wall that is behind it.
    for (const ring of [boardPolygon, ...holes]) ring.forEach((p,i) => {
      const q=ring[(i+1)%ring.length];
      const pieces = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4));
      for (let piece = 0; piece < pieces; piece += 1) {
        const a = { x: p.x + (q.x - p.x) * piece / pieces, y: p.y + (q.y - p.y) * piece / pieces };
        const b = { x: p.x + (q.x - p.x) * (piece + 1) / pieces, y: p.y + (q.y - p.y) * (piece + 1) / pieces };
        addPolygon([world(a,.8),world(b,.8),world(b,-.8),world(a,-.8)],project.board.background,project.board.background,SOFTWARE_RENDER_ORDER.farObject,1,.7,0);
      }
    });

    if (project.board.showGrid && !project.board.outline?.length && !project.board.holes?.length) {
      const gridStep = Math.max(project.board.gridSize, Math.ceil(Math.max(project.board.width, project.board.height) / 80));
      const gridLayers: Array<"top" | "bottom"> = visibleLayer === "all"
        ? ["top", "bottom"]
        : [visibleLayer];
      gridLayers.forEach((gridLayer) => {
        const gridY = (BOARD_THICKNESS / 2 + 0.015) * (gridLayer === "top" ? 1 : -1);
        const gridColor = shadeColor(project.board.layerColors[gridLayer], 1.45);
        const gridRenderOrder = getSoftwareLayerRenderOrder(gridLayer, camera.eye.y, "surface");
        if (gridRenderOrder === SOFTWARE_RENDER_ORDER.farSurface) return;
        for (let x = -project.board.width / 2; x <= project.board.width / 2 + 0.001; x += gridStep) {
          const points = [
            projectSoftwarePoint({ x, y: gridY, z: -project.board.height / 2 }, camera),
            projectSoftwarePoint({ x, y: gridY, z: project.board.height / 2 }, camera),
          ] as [SoftwareProjectedPoint, SoftwareProjectedPoint];
          if (points.every((point) => point.visible)) {
            shapes.push({ kind: "line", points, depth: (points[0].depth + points[1].depth) / 2, renderOrder: gridRenderOrder, stroke: gridColor, alpha: 0.2, lineWidth: 0.55 });
          }
        }
        for (let z = -project.board.height / 2; z <= project.board.height / 2 + 0.001; z += gridStep) {
          const points = [
            projectSoftwarePoint({ x: -project.board.width / 2, y: gridY, z }, camera),
            projectSoftwarePoint({ x: project.board.width / 2, y: gridY, z }, camera),
          ] as [SoftwareProjectedPoint, SoftwareProjectedPoint];
          if (points.every((point) => point.visible)) {
            shapes.push({ kind: "line", points, depth: (points[0].depth + points[1].depth) / 2, renderOrder: gridRenderOrder, stroke: gridColor, alpha: 0.2, lineWidth: 0.55 });
          }
        }
      });
    }

    project.board.cuts?.forEach((cut) => {
      const isVertical = cut.orientation === "vertical";
      const worldPoints = isVertical
        ? [
          projectSoftwarePoint({ x: cut.position - project.board.width / 2, y: BOARD_THICKNESS / 2 + 0.08, z: -project.board.height / 2 }, camera),
          projectSoftwarePoint({ x: cut.position - project.board.width / 2, y: BOARD_THICKNESS / 2 + 0.08, z: project.board.height / 2 }, camera),
        ] as [SoftwareProjectedPoint, SoftwareProjectedPoint]
        : [
          projectSoftwarePoint({ x: -project.board.width / 2, y: BOARD_THICKNESS / 2 + 0.08, z: cut.position - project.board.height / 2 }, camera),
          projectSoftwarePoint({ x: project.board.width / 2, y: BOARD_THICKNESS / 2 + 0.08, z: cut.position - project.board.height / 2 }, camera),
        ] as [SoftwareProjectedPoint, SoftwareProjectedPoint];
      if (worldPoints.every((point) => point.visible)) {
        shapes.push({
          kind: "line",
          points: worldPoints,
          depth: (worldPoints[0].depth + worldPoints[1].depth) / 2,
          renderOrder: getSoftwareLayerRenderOrder("top", camera.eye.y, "surface") + 0.2,
          stroke: "#ffd166",
          alpha: 0.92,
          lineWidth: 1.8,
        });
      }
    });

    getRenderedKeepouts(project, visibleLayer).forEach((keepout) => {
      const selected = selectedIds.has(keepout.componentId ?? keepout.id);
      const renderOrder = getSoftwareLayerRenderOrder(keepout.layer ?? "top", camera.eye.y);
      const isNearSide = renderOrder > SOFTWARE_RENDER_ORDER.board;
      const centerX = keepout.x + keepout.width / 2 - project.board.width / 2;
      const centerZ = keepout.y + keepout.height / 2 - project.board.height / 2;
      const angle = -((keepout.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const worldVertices = createSoftwareBoxVertices(keepout.width, 0.36, keepout.height).map((point) => ({
        x: centerX + point.x * cos + point.z * sin,
        y: (keepout.layer === "bottom" ? -1 : 1) * (BOARD_THICKNESS / 2 + 0.2) + point.y,
        z: centerZ - point.x * sin + point.z * cos,
      }));
      addBox(worldVertices, keepout.color || "#ef8354", selected ? "#fff3bf" : "#f2a56d", renderOrder, selected ? 0.7 : 0.38, selected ? 1.5 : 0.7);
      const bounds = getProjectedBounds(worldVertices.map((point) => projectSoftwarePoint(point, camera)));
      if (bounds && isNearSide) hits.push({ kind: keepout.componentId ? "component" : "keepout", id: keepout.componentId ?? keepout.id, ...bounds, selected });
    });

    const visibleComponents = project.components
      .map((component) => ({
        component,
        viewState: getPcbComponentViewState(component, visibleLayer, selectionIds),
      }))
      .filter(({ viewState }) => viewState.visible);

    // Component faces are split at the board surface facing the camera: the near piece is drawn after the
    // board, the far piece before it, so the opaque board hides what it covers on screen and nothing else.
    // Near pieces of a part on the other side (leads poking through) also become its click area.
    const cullHiddenPieces = Math.abs(camera.eye.y) > 0.35 * Math.hypot(camera.eye.x, camera.eye.y, camera.eye.z);
    let nearPieceClusters: SoftwarePieceBounds[] = [];
    let trackNearPieces = false;
    const drawBands = (
      bands: { near: SoftwarePoint3[]; within: SoftwarePoint3[]; withinPlace: "inside" | "outside" | "crossing" | null; beyond: SoftwarePoint3[] },
      fill: string,
      stroke: string,
      alpha = 1,
      lineWidth = 0.7,
    ) => {
      const { near, within, withinPlace, beyond } = bands;
      // Far side: skipped when the board hides it from the camera (tested only when looking down more than about
      // 20°, where many pieces are hidden; in low views it costs more than it saves), otherwise drawn before the board.
      if (beyond.length && !(cullHiddenPieces && isSoftwarePieceBehindBoard(beyond, camera.eye, BOARD_THICKNESS, classifyWithinPiece))) {
        addPolygon(beyond, fill, stroke, SOFTWARE_RENDER_ORDER.farObject, alpha, lineWidth);
      }
      // Inside the board thickness: hidden by the material; in a cut-out or past the edge it is sorted with the
      // walls; across an edge it is drawn after the board, as the original renderer did, so its visible part stays.
      if (within.length) {
        if (withinPlace === "outside") addPolygon(within, fill, stroke, SOFTWARE_RENDER_ORDER.farObject, alpha, lineWidth);
        else if (withinPlace === "crossing") addPolygon(within, fill, stroke, SOFTWARE_RENDER_ORDER.nearObject, alpha, lineWidth);
      }
      if (near.length) {
        addPolygon(near, fill, stroke, SOFTWARE_RENDER_ORDER.nearObject, alpha, lineWidth);
        if (trackNearPieces) addSoftwarePieceBounds(nearPieceClusters, near.map((point) => projectSoftwarePoint(point, camera)));
      }
    };
    const cutAtBoard = (worldPoints: readonly SoftwarePoint3[]) => {
      const { near, within, beyond } = splitSoftwarePolygonAtBoardSurface(worldPoints, camera.eye.y, BOARD_THICKNESS);
      return { near, within, beyond, withinPlace: within.length ? classifyWithinPiece(within) : null };
    };
    const addComponentPolygon = (
      worldPoints: SoftwarePoint3[],
      fill: string,
      stroke: string,
      _renderOrder: number,
      alpha = 1,
      lineWidth = 0.7,
    ) => drawBands(cutAtBoard(worldPoints), fill, stroke, alpha, lineWidth);
    const cameraSide: "top" | "bottom" = camera.eye.y >= 0 ? "top" : "bottom";
    const addComponentBox = (worldVertices: SoftwarePoint3[], color: string, stroke: string, renderOrder: number, alpha = 1, lineWidth = 0.7) => {
      BOX_FACES.forEach((face) => {
        const worldPoints = face.map((index) => worldVertices[index]);
        const normal = getSoftwareFaceNormal(worldPoints[0], worldPoints[1], worldPoints[2]);
        addComponentPolygon(worldPoints, shadeColor(color, getSoftwareLightLevel(normal)), stroke, renderOrder, alpha, lineWidth);
      });
    };

    visibleComponents.forEach(({ component, viewState }) => {
      const selected = viewState.selected;
      const renderOrder = getSoftwareLayerRenderOrder(component.layer, camera.eye.y);
      const isNearSide = renderOrder > SOFTWARE_RENDER_ORDER.board;
      const localBounds = createSoftwareBoxVertices(component.width, component.maxHeight, component.height);
      const worldBounds = localBounds.map((point) => transformPcbComponentPoint(point, component, project.board, BOARD_THICKNESS));
      const projectedBounds = getProjectedBounds(worldBounds.map((point) => projectSoftwarePoint(point, camera)));
      nearPieceClusters = [];
      trackNearPieces = !isNearSide;
      if (projectedBounds && isNearSide) {
        hits.push({
          kind: "component",
          id: component.instanceId,
          ...projectedBounds,
          selected,
          label: component.reference,
        });
      }

      const asset = component.modelAssetId ? modelAssets[component.modelAssetId] : getPcbPackageAsset(component, packageKit);
      const cachedParts = mappedModelParts[component.instanceId];
      if (!asset || !cachedParts) {
        if (component.shape === "circle") {
          const segments = 32;
          const radius = Math.min(component.width, component.height) / 2;
          const top = Array.from({ length: segments }, (_, index) => {
            const angle = (index / segments) * Math.PI * 2;
            return transformPcbComponentPoint({
              x: Math.cos(angle) * radius,
              y: component.maxHeight / 2,
              z: Math.sin(angle) * radius,
            }, component, project.board, BOARD_THICKNESS);
          });
          const bottom = Array.from({ length: segments }, (_, index) => {
            const angle = (index / segments) * Math.PI * 2;
            return transformPcbComponentPoint({
              x: Math.cos(angle) * radius,
              y: -component.maxHeight / 2,
              z: Math.sin(angle) * radius,
            }, component, project.board, BOARD_THICKNESS);
          });
          addComponentPolygon(top, component.color, selected ? "#f8fafc" : "#214b60", renderOrder, 1, selected ? 1.5 : 0.7);
          addComponentPolygon([...bottom].reverse(), shadeColor(component.color, 0.72), selected ? "#f8fafc" : "#214b60", renderOrder, 1, selected ? 1.5 : 0.7);
          for (let index = 0; index < segments; index += 1) {
            const next = (index + 1) % segments;
            addComponentPolygon([top[index], top[next], bottom[next], bottom[index]], component.color, selected ? "#f8fafc" : "#214b60", renderOrder, 1, selected ? 1.5 : 0.7);
          }
        } else {
          addComponentBox(worldBounds, component.color, selected ? "#f8fafc" : "#214b60", renderOrder, 1, selected ? 1.5 : 0.7);
        }
      } else {
        // The Blender package meshes are closed and consistently wound, so their back faces can be skipped
        // (painter sorting otherwise lets hidden walls show through). STEP meshes keep every face.
        const cullBackFaces = asset.metadata.id.startsWith("package:");
        const facing = component.layer === "bottom" ? -1 : 1;
        // Placement on the board, computed once per part (the same maths as transformPcbComponentPoint).
        const placementTransform = getPcb3DComponentTransform(component, project.board);
        const cos = Math.cos(placementTransform.rotation[1]);
        const sin = Math.sin(placementTransform.rotation[1]);
        const [originX, , originZ] = placementTransform.position;
        const layerSign = component.layer === "top" ? 1 : -1;
        const mountY = getPcbMountY(component, BOARD_THICKNESS);
        const raise = (x: number, y: number, z: number): SoftwarePoint3 => ({ x, y: layerSign * y + mountY, z });
        const place = (point: SoftwarePoint3): SoftwarePoint3 => ({ x: originX + point.x * cos + point.z * sin, y: point.y, z: originZ - point.x * sin + point.z * cos });
        const placeAll = (points: SoftwarePoint3[]) => points.map(place);
        const height = [component.layer, component.insertionDepth ?? 0, component.maxHeight].join(",");
        const placement = [component.x, component.y, component.rotation].join(",");
        let entry = faceCacheRef.current.get(cachedParts);
        if (!entry || entry.height !== height) {
          entry = { height, cuts: {}, placement, board: boardShapeKey, places: {} };
          faceCacheRef.current.set(cachedParts, entry);
        } else if (entry.placement !== placement || entry.board !== boardShapeKey) {
          entry.placement = placement;
          entry.board = boardShapeKey;
          entry.places = {};
        }
        const cuts = entry.cuts[cameraSide] ?? (entry.cuts[cameraSide] = new Map());
        const faceCount = cachedParts.reduce((total, { part }) => total + Math.floor(part.index.length / 3), 0);
        const places = entry.places[cameraSide] ?? (entry.places[cameraSide] = new Uint8Array(faceCount));
        const surface = BOARD_THICKNESS / 2;
        let faceNumber = 0;
        cachedParts.forEach(({ part, positions }) => {
          const color = getPcbModelPartColor(asset, part.id, "#b7bec7");
          const stroke = shadeColor(color, selected ? 0.82 : 0.58);
          // Skipping triangles opens holes in a STEP model; draw every source face.
          for (let offset = 0; offset < part.index.length; offset += 3, faceNumber += 1) {
            const raised = [0, 1, 2].map((corner) => {
              const vertexIndex = part.index[offset + corner] * 3;
              return raise(positions[vertexIndex], positions[vertexIndex + 1], positions[vertexIndex + 2]);
            });
            const worldPoints = raised.map(place);
            const normal = getSoftwareFaceNormal(worldPoints[0], worldPoints[1], worldPoints[2]);
            if (cullBackFaces) {
              const toEye = {
                x: camera.eye.x - (worldPoints[0].x + worldPoints[1].x + worldPoints[2].x) / 3,
                y: camera.eye.y - (worldPoints[0].y + worldPoints[1].y + worldPoints[2].y) / 3,
                z: camera.eye.z - (worldPoints[0].z + worldPoints[1].z + worldPoints[2].z) / 3,
              };
              if ((normal.x * toEye.x + normal.y * toEye.y + normal.z * toEye.z) * facing < 0) continue;
            }
            const fill = shadeColor(color, getSoftwareLightLevel(normal));
            const lowest = Math.min(worldPoints[0].y, worldPoints[1].y, worldPoints[2].y);
            const highest = Math.max(worldPoints[0].y, worldPoints[1].y, worldPoints[2].y);
            const nearSide = cameraSide === "top" ? lowest >= surface : highest <= -surface;
            const farSide = cameraSide === "top" ? highest < -surface : lowest > surface;
            if (nearSide) { drawBands({ near: worldPoints, within: [], withinPlace: null, beyond: [] }, fill, stroke, 1, 0); continue; }
            if (farSide) { drawBands({ near: [], within: [], withinPlace: null, beyond: worldPoints }, fill, stroke, 1, 0); continue; }
            let cut = cuts.get(faceNumber);
            if (!cut) {
              const { near, within, beyond } = splitSoftwarePolygonAtBoardSurface(raised, camera.eye.y, BOARD_THICKNESS);
              cut = { near, within, beyond };
              cuts.set(faceNumber, cut);
            }
            let within: SoftwarePoint3[] = [];
            let withinPlace: CutFace["withinPlace"] = null;
            if (cut.within.length) {
              const code = places[faceNumber];
              if (code === 1) {
                withinPlace = "inside";
              } else {
                within = placeAll(cut.within);
                withinPlace = code ? PLACE_CODES[code] : classifyWithinPiece(within);
                if (!code) places[faceNumber] = PLACE_CODES.indexOf(withinPlace);
              }
            }
            drawBands({ near: placeAll(cut.near), within, withinPlace, beyond: placeAll(cut.beyond) }, fill, stroke, 1, 0);
          }
        });
      }

      // A part on the other side is clickable where its pieces poke through to the camera's side, one area per
      // group of pieces (two leads far apart do not cover what lies between them).
      nearPieceClusters = mergeSoftwarePieceBounds(nearPieceClusters);
      nearPieceClusters.forEach(({ left, top, right, bottom, depth }) => hits.push({ kind: "component", id: component.instanceId, left, top, right, bottom, depth, selected, label: component.reference, poking: true }));
      const pokingBounds = nearPieceClusters.length ? nearPieceClusters.reduce(joinSoftwarePieceBounds) : null;
      const labelBounds = isNearSide ? projectedBounds : pokingBounds;
      if (selected && labelBounds) {
        labels.push({
          x: (labelBounds.left + labelBounds.right) / 2,
          y: labelBounds.top - 10,
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
        for (const hole of shape.holes || []) {
          context.moveTo(hole[0].x,hole[0].y);
          hole.slice(1).forEach(p => context.lineTo(p.x,p.y));
          context.closePath();
        }
        context.fill("evenodd");
      } else {
        context.lineTo(shape.points[1].x, shape.points[1].y);
      }
      if (shape.lineWidth > 0) context.stroke();
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
  }, [boardShapeKey, classifyWithinPiece, mappedModelParts, modelAssets, packageKit, project, selectedIds, selectionIds, view, viewport, visibleLayer]);

  const face = visibleLayer === "all" ? workspace.activeLayer : visibleLayer;
  const resetView = useCallback(() => setView({ ...DEFAULT_SOFTWARE_VIEW, pitch: Math.abs(DEFAULT_SOFTWARE_VIEW.pitch) * (face === "bottom" ? -1 : 1) }), [face]);
  useEffect(() => { resetView(); }, [resetView]);

  const selectAt = useCallback((x: number, y: number, additive: boolean) => {
    const under = (candidate: HitTarget) => x >= candidate.left - 5 && x <= candidate.right + 5
      && y >= candidate.top - 5 && y <= candidate.bottom + 5;
    const target = hitTargetsRef.current.find((candidate) => !candidate.poking && under(candidate))
      ?? hitTargetsRef.current.find((candidate) => candidate.poking && under(candidate));
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
          <small>{view.pitch >= 0 ? "Top 面" : "Bottom 面"} · 免 WebGL</small>
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
