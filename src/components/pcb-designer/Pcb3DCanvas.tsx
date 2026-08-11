import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Box3, BufferGeometry, Color, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { Focus, MousePointer2 } from "lucide-react";

import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import { PcbSoftware3DCanvas } from "./PcbSoftware3DCanvas.tsx";
import { detectWebglSupport } from "./core/webgl.ts";
import {
  getDefaultPcbModelAssetStore,
  isPcbModelAsset,
  mapPcbModelPartToComponentSpace,
} from "./core/modelAssets.ts";
import {
  getPcbComponentViewState,
  getPcb3DComponentTransform,
  getPcbSelectionIds,
} from "./core/viewSync.ts";
import type { PcbModelAsset, PcbModelAssetPart, PcbSelection, PcbVisibleLayer } from "./types.ts";

function safeColor(value: string, fallback: string) {
  try {
    return new Color(value);
  } catch {
    return new Color(fallback);
  }
}

export function Pcb3DCanvasSafe({
  workspace,
  visibleLayer = workspace.visibleLayer,
  selectedObjects = workspace.selectedObjects,
}: {
  workspace: PcbWorkspaceApi;
  visibleLayer?: PcbVisibleLayer;
  selectedObjects?: readonly string[];
}) {
  const size = Math.max(workspace.activeProject.board.width, workspace.activeProject.board.height, 40);
  const [webglState, setWebglState] = useState<"checking" | "available" | "unavailable">("checking");

  useEffect(() => {
    setWebglState(detectWebglSupport() ? "available" : "unavailable");
  }, []);

  const softwareFallback = (
    <PcbSoftware3DCanvas
      workspace={workspace}
      visibleLayer={visibleLayer}
      selectedObjects={selectedObjects}
    />
  );

  return (
    <div
      className="pcb-3d-host"
      data-testid="pcb-3d-canvas-host"
      data-pcb-board-color={workspace.activeProject.board.background}
      data-pcb-top-color={workspace.activeProject.board.layerColors.top}
      data-pcb-bottom-color={workspace.activeProject.board.layerColors.bottom}
    >
      {webglState === "checking" ? (
        <div className="pcb-3d-loading">正在檢查 3D 圖形加速…</div>
      ) : webglState === "unavailable" ? softwareFallback : (
        <Pcb3DErrorBoundary fallback={softwareFallback}>
          <Canvas
            fallback={softwareFallback}
            frameloop="demand"
            dpr={[1, 1.25]}
            camera={{ position: [size * 0.82, size * 0.72, size * 0.92], fov: 42, near: 0.1, far: size * 25 }}
            gl={{ antialias: false, powerPreference: "default", failIfMajorPerformanceCaveat: false }}
            onPointerMissed={() => {
              workspace.selectObject(null);
              workspace.clearObjectSelection();
            }}
          >
            <Scene
              workspace={workspace}
              visibleLayer={visibleLayer}
              selectedObjects={selectedObjects}
            />
          </Canvas>
          <div className="pcb-3d-help">
            <MousePointer2 aria-hidden="true" />
            左鍵選取・右鍵平移・滾輪縮放・點選元件查看屬性
          </div>
        </Pcb3DErrorBoundary>
      )}
    </div>
  );
}

function CameraControls({ boardWidth, boardHeight }: { boardWidth: number; boardHeight: number }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const reset = useCallback(() => {
    const size = Math.max(boardWidth, boardHeight, 40);
    camera.position.set(size * 0.82, size * 0.72, size * 0.92);
    camera.near = 0.1;
    camera.far = size * 25;
    camera.updateProjectionMatrix();
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
    invalidate();
  }, [boardHeight, boardWidth, camera, invalidate]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={Math.max(boardWidth, boardHeight) * 0.2}
        maxDistance={Math.max(boardWidth, boardHeight) * 8}
      />
      <Html fullscreen style={{ pointerEvents: "none" }}>
        <button type="button" className="pcb-3d-reset" onClick={reset} style={{ pointerEvents: "auto" }}>
          <Focus aria-hidden="true" />
          重設視角
        </button>
      </Html>
    </>
  );
}

interface Pcb3DErrorBoundaryState {
  error: Error | null;
}

class Pcb3DErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, Pcb3DErrorBoundaryState> {
  state: Pcb3DErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): Pcb3DErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("PCB 3D view failed:", error);
  }

  render() {
    if (this.state.error) return this.props.fallback;

    return this.props.children;
  }
}

function ModelPartMesh({
  part,
  positions,
  color,
}: {
  part: PcbModelAssetPart;
  positions: number[];
  color: string;
}) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setIndex(new Uint32BufferAttribute(part.index, 1));
    next.computeVertexNormals();
    return next;
  }, [part.index, positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={safeColor(color, "#6bc7d9")} roughness={0.48} metalness={0.12} />
    </mesh>
  );
}

function StoredModelMeshes({ asset, component }: { asset: PcbModelAsset; component: PcbWorkspaceApi["activeProject"]["components"][number] }) {
  return (
    <group data-model-renderer="buffer-geometry">
      {asset.parts.map((part) => (
        <ModelPartMesh
          key={part.id}
          part={part}
          positions={mapPcbModelPartToComponentSpace(part, asset, component)}
          color={component.color}
        />
      ))}
    </group>
  );
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

function Scene({
  workspace,
  visibleLayer,
  selectedObjects,
}: {
  workspace: PcbWorkspaceApi;
  visibleLayer: PcbVisibleLayer;
  selectedObjects: readonly string[];
}) {
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
    void Promise.all(ids.map(async (id) => [id, await store.get(id)] as const))
      .then((entries) => {
        if (!active) return;
        setModelAssets(Object.fromEntries(entries.map(([id, asset]) => [id, asset && isPcbModelAsset(asset) ? asset : null])));
      });
    return () => {
      active = false;
    };
  }, [modelAssetKey]);
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
  const selectedIds = useMemo(
    () => new Set(selectionIds),
    [selectionIds],
  );
  const boardThickness = 1.6;
  const boardSideColor = safeColor(project.board.background, "#247c67");
  const boardTopColor = safeColor(project.board.layerColors.top, "#58a99e");
  const boardBottomColor = safeColor(project.board.layerColors.bottom, "#4259ce");
  const sceneBounds = useMemo(() => {
    const height = Math.max(
      12,
      ...project.components.map((component) => component.maxHeight),
    );
    return new Box3(
      new Vector3(-project.board.width / 2, -height, -project.board.height / 2),
      new Vector3(project.board.width / 2, height, project.board.height / 2),
    );
  }, [project]);

  const selectObject = useCallback((
    selection: { kind: "component" | "keepout"; id: string } | null,
    additive = false,
  ) => {
    if (!selection) {
      workspace.selectObject(null);
      workspace.clearObjectSelection();
      return;
    }
    if (additive) {
      workspace.toggleObjectSelection(selection.id);
    } else {
      workspace.selectObject(selection);
      workspace.clearObjectSelection();
    }
  }, [workspace]);

  return (
    <>
      <color attach="background" args={["#071421"]} />
      <fog attach="fog" args={["#071421", Math.max(project.board.width, project.board.height) * 2.3, Math.max(project.board.width, project.board.height) * 7]} />
      <ambientLight intensity={1.7} />
      <hemisphereLight args={["#bcefff", "#071421", 1.35]} />
      <directionalLight position={[80, 120, 60]} intensity={2.2} />
      <directionalLight position={[-60, 45, -80]} intensity={0.8} color="#63cbe9" />

      {project.board.showGrid && (
        <gridHelper
          args={[
            Math.max(project.board.width, project.board.height) * 2,
            Math.min(100, Math.max(8, Math.round(Math.max(project.board.width, project.board.height) / project.board.gridSize))),
            "#356985",
            "#19334a",
          ]}
          position={[0, -1.45, 0]}
        />
      )}

      <mesh
        position={[0, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          selectObject(null);
        }}
      >
        <boxGeometry args={[project.board.width, boardThickness, project.board.height]} />
        <meshStandardMaterial attach="material-0" color={boardSideColor} roughness={0.58} metalness={0.08} />
        <meshStandardMaterial attach="material-1" color={boardSideColor} roughness={0.58} metalness={0.08} />
        <meshStandardMaterial attach="material-2" color={boardTopColor} roughness={0.58} metalness={0.08} />
        <meshStandardMaterial attach="material-3" color={boardBottomColor} roughness={0.58} metalness={0.08} />
        <meshStandardMaterial attach="material-4" color={boardSideColor} roughness={0.58} metalness={0.08} />
        <meshStandardMaterial attach="material-5" color={boardSideColor} roughness={0.58} metalness={0.08} />
        <Edges color="#7de7e8" threshold={20} />
      </mesh>

      {project.keepouts.map((keepout) => {
        const selected = selectedIds.has(keepout.id);
        return (
          <mesh
            key={keepout.id}
            position={[
              keepout.x + keepout.width / 2 - project.board.width / 2,
              boardThickness / 2 + 0.22,
              project.board.height / 2 - keepout.y - keepout.height / 2,
            ]}
            onClick={(event) => {
              event.stopPropagation();
              selectObject(
                { kind: "keepout", id: keepout.id },
                event.nativeEvent.ctrlKey || event.nativeEvent.metaKey,
              );
            }}
          >
            <boxGeometry args={[keepout.width, 0.34, keepout.height]} />
            <meshStandardMaterial color={safeColor(keepout.color, "#ef8354")} transparent opacity={selected ? 0.68 : 0.34} />
            <Edges color={selected ? "#fff3bf" : "#f2a56d"} />
          </mesh>
        );
      })}

      {componentViewStates
        .filter(({ viewState }) => viewState.visible)
        .map(({ component, viewState }) => {
        const selected = viewState.selected;
        const transform = getPcb3DComponentTransform(component, project.board);
        const yOffset = boardThickness / 2 + component.maxHeight / 2;
        const modelAsset = component.modelAssetId ? modelAssets[component.modelAssetId] : null;
        const useProceduralFallback = !modelAsset;
        const proceduralFallback = useProceduralFallback;
        return (
          <group
            key={component.instanceId}
            position={transform.position}
            rotation={transform.rotation}
            data-pcb-coordinate={`${viewState.coordinate.x},${viewState.coordinate.y}`}
            data-pcb-rotation={String(viewState.rotation)}
            data-pcb-layer={viewState.layer}
            data-pcb-selected={viewState.selected ? "true" : "false"}
          >
            <group
              position={[0, yOffset, 0]}
              onClick={(event) => {
                event.stopPropagation();
                selectObject(
                  { kind: "component", id: component.instanceId },
                  event.nativeEvent.ctrlKey || event.nativeEvent.metaKey,
                );
              }}
            >
              {proceduralFallback ? (
                <mesh>
                  <boxGeometry args={[component.width, component.maxHeight, component.height]} />
                  <meshStandardMaterial
                    color={safeColor(component.color, "#6bc7d9")}
                    roughness={0.48}
                    metalness={component.type.toLocaleLowerCase().includes("connector") ? 0.5 : 0.12}
                    emissive={selected ? "#174e58" : "#000000"}
                  />
                  <Edges color={selected ? "#f8fafc" : "#214b60"} threshold={18} />
                </mesh>
              ) : <StoredModelMeshes asset={modelAsset} component={component} />}
            </group>
            {component.modelAssetId && useProceduralFallback && (
              <Html center position={[0, component.maxHeight / 2 + 2, 0]} distanceFactor={80}>
                <span className="pcb-3d-fallback-hint" role="status">3D 模型無法載入，使用程序化外觀</span>
              </Html>
            )}
            {selected && (
              <Html center position={[0, component.maxHeight / 2 + 4, 0]} distanceFactor={80}>
                <span className="pcb-3d-label">{component.reference}</span>
              </Html>
            )}
          </group>
        );
      })}

      <CameraControls boardWidth={sceneBounds.max.x - sceneBounds.min.x} boardHeight={sceneBounds.max.z - sceneBounds.min.z} />
    </>
  );
}

export function Pcb3DCanvas({
  workspace,
  visibleLayer = workspace.visibleLayer,
  selectedObjects = workspace.selectedObjects,
}: {
  workspace: PcbWorkspaceApi;
  visibleLayer?: PcbVisibleLayer;
  selectedObjects?: readonly string[];
}) {
  const size = Math.max(workspace.activeProject.board.width, workspace.activeProject.board.height, 40);
  const softwareFallback = (
    <PcbSoftware3DCanvas
      workspace={workspace}
      visibleLayer={visibleLayer}
      selectedObjects={selectedObjects}
    />
  );

  return (
    <div
      className="pcb-3d-host"
      data-testid="pcb-3d-canvas-host"
      data-pcb-board-color={workspace.activeProject.board.background}
      data-pcb-top-color={workspace.activeProject.board.layerColors.top}
      data-pcb-bottom-color={workspace.activeProject.board.layerColors.bottom}
    >
      <Pcb3DErrorBoundary fallback={softwareFallback}>
        <Canvas
          fallback={softwareFallback}
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [size * 0.82, size * 0.72, size * 0.92], fov: 42, near: 0.1, far: size * 25 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onPointerMissed={() => {
            workspace.selectObject(null);
            workspace.clearObjectSelection();
          }}
        >
          <Scene
            workspace={workspace}
            visibleLayer={visibleLayer}
            selectedObjects={selectedObjects}
          />
        </Canvas>
      </Pcb3DErrorBoundary>
      <div className="pcb-3d-help">
        <MousePointer2 aria-hidden="true" />
        左鍵旋轉 · 右鍵平移 · 滾輪縮放 · 點選元件查看屬性
      </div>
    </div>
  );
}
