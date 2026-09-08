import { getPcbModelRenderIndices } from "./core/modelProjection.ts";
import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Edges, Html, OrbitControls } from "@react-three/drei";
import { Box3, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Shape, Vector2, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from "three";
import { getBoardPolygon } from "./core/boardOutline.ts";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { Focus, MousePointer2 } from "lucide-react";
import { getRenderedKeepouts } from "./core/componentKeepout.ts";

import type { PcbWorkspaceApi } from "./hooks/usePcbWorkspace.ts";
import { PcbSoftware3DCanvas } from "./PcbSoftware3DCanvas.tsx";
import { detectWebglSupport } from "./core/webgl.ts";
import {
  getDefaultPcbModelAssetStore,
  getPcbModelPartColor,
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
      data-pcb-outline-source={workspace.activeProject.board.outlineSource ?? "rectangle"}
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
            dpr={[1, 2]}
            shadows
            camera={{ position: [size * 0.88, size * 0.82, size * 0.96], fov: 38, near: 0.1, far: size * 25 }}
            gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
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
    camera.position.set(size * 0.88, size * 0.82, size * 0.96);
    camera.up.set(0, 1, 0);
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
  name = "",
  upAxis = "y",
}: {
  part: PcbModelAssetPart;
  positions: number[];
  color: string;
  name?: string;
  upAxis?: "x" | "y" | "z";
}) {
  const material = useMemo(() => {
    const partName = name.toLocaleLowerCase();
    const parsedColor = safeColor(color, "#6bc7d9");
    const nearlyNeutral = Math.max(parsedColor.r, parsedColor.g, parsedColor.b)
      - Math.min(parsedColor.r, parsedColor.g, parsedColor.b) < 0.14;
    const metallic = (nearlyNeutral && Math.min(parsedColor.r, parsedColor.g, parsedColor.b) > 0.45) || /(pin|lead|terminal|contact|metal|shield|screw|bolt|nut)/.test(partName);
    return {
      color: parsedColor,
      metalness: metallic ? 0.72 : 0.12,
      roughness: metallic ? 0.24 : 0.42,
      clearcoat: metallic ? 0.12 : 0.32,
    };
  }, [color, name]);
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setAttribute("position", new Float32BufferAttribute(positions, 3));
    next.setIndex(new Uint32BufferAttribute(getPcbModelRenderIndices(part.index, upAxis), 1));
    next.computeVertexNormals();
    return next;
  }, [part.index, positions, upAxis]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial {...material} side={DoubleSide} clearcoatRoughness={0.32} />
    </mesh>
  );
}

function ProceduralComponentMeshes({
  component,
  selected,
}: {
  component: PcbWorkspaceApi["activeProject"]["components"][number];
  selected: boolean;
}) {
  const descriptor = `${component.name} ${component.type} ${component.partNumber}`.toLocaleLowerCase();
  const isConnector = /(connector|header|socket|插座|連接器)/.test(descriptor);
  const isCircular = component.shape === "circle" || /(capacitor|電容|screw|螺絲|hole|孔)/.test(descriptor);
  const isChip = /(ic|mcu|cpu|qfp|qfn|bga|processor|memory|buffer|chip|晶片)/.test(descriptor);
  const bodyWidth = isChip ? component.width * 0.72 : component.width;
  const bodyDepth = isChip ? component.height * 0.72 : component.height;
  const bodyHeight = component.maxHeight * (!isCircular && (isChip || isConnector) ? 0.74 : 1);
  const bodyCenterY = (component.maxHeight - bodyHeight) / 2;
  const pinColor = "#d7d9d2";
  const pinCountX = Math.min(12, Math.max(3, Math.round(component.height / 1.2)));
  const pinCountZ = Math.min(12, Math.max(3, Math.round(component.width / 1.2)));
  const pinWidth = Math.max(0.16, Math.min(0.55, Math.min(component.width, component.height) * 0.07));
  const pinHeight = component.maxHeight - bodyHeight;
  const pinLength = Math.max(0.3, Math.min(component.width, component.height) * 0.16);
  const bodyColor = isChip
    ? "#171c1f"
    : isConnector
      ? "#e8e0cb"
      : component.color;

  if (isCircular) {
    const radius = Math.min(component.width, component.height) / 2;
    return (
      <group>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius, bodyHeight, 48]} />
          <meshPhysicalMaterial color={safeColor(bodyColor, "#adb5bd")} metalness={0.42} roughness={0.32} clearcoat={0.28} />
          <Edges color={selected ? "#ffffff" : "#5d6c73"} threshold={28} />
        </mesh>
        <mesh position={[0, bodyHeight / 2 + 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 0.18, radius * 0.28, 32]} />
          <meshStandardMaterial color="#30383d" roughness={0.48} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, bodyCenterY, 0]}>
        <boxGeometry args={[bodyWidth, bodyHeight, bodyDepth]} />
        <meshPhysicalMaterial
          color={safeColor(bodyColor, "#20262a")}
          roughness={isConnector ? 0.5 : 0.34}
          metalness={isConnector ? 0.04 : 0.12}
          clearcoat={0.26}
          emissive={selected ? "#102f38" : "#000000"}
        />
        <Edges color={selected ? "#ffffff" : isChip ? "#4b585d" : "#62737a"} threshold={24} />
      </mesh>
      {(isChip || isConnector) && Array.from({ length: pinCountX }, (_, index) => {
        const z = pinCountX === 1 ? 0 : -bodyDepth / 2 + (index / (pinCountX - 1)) * bodyDepth;
        return [-1, 1].map((side) => (
          <mesh key={`x-${side}-${index}`} castShadow position={[side * (bodyWidth / 2 + pinLength / 2), -component.maxHeight / 2 + pinHeight / 2, z]}>
            <boxGeometry args={[pinLength, pinHeight, pinWidth]} />
            <meshStandardMaterial color={pinColor} metalness={0.88} roughness={0.18} />
          </mesh>
        ));
      })}
      {isChip && Array.from({ length: pinCountZ }, (_, index) => {
        const x = pinCountZ === 1 ? 0 : -bodyWidth / 2 + (index / (pinCountZ - 1)) * bodyWidth;
        return [-1, 1].map((side) => (
          <mesh key={`z-${side}-${index}`} castShadow position={[x, -component.maxHeight / 2 + pinHeight / 2, side * (bodyDepth / 2 + pinLength / 2)]}>
            <boxGeometry args={[pinWidth, pinHeight, pinLength]} />
            <meshStandardMaterial color={pinColor} metalness={0.88} roughness={0.18} />
          </mesh>
        ));
      })}
      {isChip && (
        <mesh position={[-bodyWidth * 0.29, bodyHeight / 2 + bodyCenterY + 0.02, -bodyDepth * 0.29]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[Math.max(0.16, Math.min(bodyWidth, bodyDepth) * 0.055), 24]} />
          <meshStandardMaterial color="#d8ddd9" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

function StoredModelMeshes({ asset, component }: { asset: PcbModelAsset; component: PcbWorkspaceApi["activeProject"]["components"][number] }) {
  return (
    <group userData={{ modelRenderer: "buffer-geometry" }}>
      {asset.parts.map((part) => (
        <ModelPartMesh
          key={part.id}
          part={part}
          positions={mapPcbModelPartToComponentSpace(part, asset, component)}
          color={getPcbModelPartColor(asset, part.id, "#b7bec7")}
          name={asset.metadata.parts.find(meta => meta.id === part.id)?.name}
          upAxis={asset.metadata.upAxis}
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
  const loadModelAsset = workspace.loadModelAsset;
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
    }))
      .then((entries) => {
        if (!active) return;
        setModelAssets(Object.fromEntries(entries.map(([id, asset]) => [id, asset && isPcbModelAsset(asset) ? asset : null])));
      });
    return () => {
      active = false;
    };
  }, [loadModelAsset, modelAssetKey]);
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
  const outlineGeometry = useMemo(() => {
    if (project.board.outlineSource !== "手繪板框") return null;
    const shape = new Shape(getBoardPolygon(project.board).map(p => new Vector2(p.x - project.board.width / 2, p.y - project.board.height / 2)));
    const geometry = new ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -0.8); geometry.rotateX(Math.PI / 2);
    geometry.clearGroups();
    const normals = geometry.getAttribute("normal");
    for (let i = 0; i < normals.count; i += 3) geometry.addGroup(i, 3, normals.getY(i) > 0.5 ? 2 : normals.getY(i) < -0.5 ? 3 : 0);
    return geometry;
  }, [project.board]);
  useEffect(() => () => outlineGeometry?.dispose(), [outlineGeometry]);
  const boardSideColor = safeColor(project.board.background, "#174f3a").lerp(new Color("#153e31"), 0.42);
  const boardTopColor = safeColor(project.board.layerColors.top, "#176b46").lerp(new Color("#12633f"), 0.38);
  const boardBottomColor = safeColor(project.board.layerColors.bottom, "#164f38").lerp(new Color("#123d2f"), 0.5);
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
      <color attach="background" args={["#dfe8e3"]} />
      <fog attach="fog" args={["#dfe8e3", Math.max(project.board.width, project.board.height) * 2.5, Math.max(project.board.width, project.board.height) * 7]} />
      <ambientLight intensity={0.42} />
      <hemisphereLight args={["#f7fbff", "#6d8179", 0.86]} />
      <directionalLight
        castShadow
        position={[80, 135, 65]}
        intensity={2.75}
        color="#fff8e8"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-70, 60, -90]} intensity={0.92} color="#b8dcff" />
      <directionalLight position={[15, 35, -100]} intensity={0.5} color="#ffffff" />

      {project.board.showGrid && (
        <gridHelper
          args={[
            Math.max(project.board.width, project.board.height) * 2,
            Math.min(100, Math.max(8, Math.round(Math.max(project.board.width, project.board.height) / project.board.gridSize))),
            "#76988d",
            "#b5c8c1",
          ]}
          position={[0, -1.45, 0]}
        />
      )}

      <mesh
        position={[0, 0, 0]}
        castShadow
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          selectObject(null);
        }}
      >
        {outlineGeometry ? <primitive object={outlineGeometry} attach="geometry" /> : <boxGeometry args={[project.board.width, boardThickness, project.board.height]} />}
        <meshPhysicalMaterial attach="material-0" color={boardSideColor} roughness={0.52} metalness={0.08} clearcoat={0.2} />
        <meshPhysicalMaterial attach="material-1" color={boardSideColor} roughness={0.52} metalness={0.08} clearcoat={0.2} />
        <meshPhysicalMaterial attach="material-2" color={boardTopColor} roughness={0.46} metalness={0.06} clearcoat={0.42} clearcoatRoughness={0.4} />
        <meshPhysicalMaterial attach="material-3" color={boardBottomColor} roughness={0.5} metalness={0.06} clearcoat={0.3} />
        <meshPhysicalMaterial attach="material-4" color={boardSideColor} roughness={0.52} metalness={0.08} clearcoat={0.2} />
        <meshPhysicalMaterial attach="material-5" color={boardSideColor} roughness={0.52} metalness={0.08} clearcoat={0.2} />
        <Edges color="#8bb7a7" threshold={24} />
      </mesh>

      <ContactShadows
        key={Object.keys(modelAssets).filter(id => modelAssets[id]).join("|")}
        position={[0, -boardThickness / 2 - 0.8, 0]}
        opacity={0.34}
        scale={Math.max(project.board.width, project.board.height) * 1.9}
        blur={2.2}
        far={Math.max(25, sceneBounds.max.y * 2)}
        frames={1}
        color="#273d35"
      />

      {project.board.cuts?.map((cut) => (
        <mesh
          key={cut.id}
          renderOrder={20}
          position={cut.orientation === "vertical"
            ? [cut.position - project.board.width / 2, boardThickness / 2 + 0.09, 0]
            : [0, boardThickness / 2 + 0.09, cut.position - project.board.height / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={cut.orientation === "vertical" ? [0.24, project.board.height] : [project.board.width, 0.24]} />
          <meshBasicMaterial color="#ffd166" side={DoubleSide} transparent opacity={0.94} depthTest={false} depthWrite={false} />
        </mesh>
      ))}

      {getRenderedKeepouts(project, visibleLayer).map((keepout) => {
        const selected = selectedIds.has(keepout.componentId ?? keepout.id);
        return (
          <mesh
            key={keepout.id}
            position={[
              keepout.x + keepout.width / 2 - project.board.width / 2,
              (keepout.layer === "bottom" ? -1 : 1) * (boardThickness / 2 + 0.22),
              keepout.y + keepout.height / 2 - project.board.height / 2,
            ]}
            rotation={[0, -((keepout.rotation ?? 0) * Math.PI) / 180, 0]}
            onClick={(event) => {
              event.stopPropagation();
              selectObject(
                keepout.componentId ? { kind: "component", id: keepout.componentId } : { kind: "keepout", id: keepout.id },
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
        const yOffset = (boardThickness / 2 + component.maxHeight / 2)
          * (component.layer === "top" ? 1 : -1);
        const modelAsset = component.modelAssetId ? modelAssets[component.modelAssetId] : null;
        const useProceduralFallback = !modelAsset;
        const proceduralFallback = useProceduralFallback;
        return (
          <group
            key={component.instanceId}
            position={transform.position}
            rotation={transform.rotation}
            userData={{
              pcbCoordinate: [viewState.coordinate.x, viewState.coordinate.y],
              pcbRotation: viewState.rotation,
              pcbLayer: viewState.layer,
              pcbSelected: viewState.selected,
            }}
          >
            <group
              position={[0, yOffset, 0]}
              scale={[1, component.layer === "bottom" ? -1 : 1, 1]}
              onClick={(event) => {
                event.stopPropagation();
                selectObject(
                  { kind: "component", id: component.instanceId },
                  event.nativeEvent.ctrlKey || event.nativeEvent.metaKey,
                );
              }}
            >
              {proceduralFallback
                ? component.modelAssetId ? <mesh>
                    <boxGeometry args={[component.width, component.maxHeight, component.height]} />
                    <meshBasicMaterial color="#91a4b8" wireframe />
                  </mesh> : <ProceduralComponentMeshes component={component} selected={selected} />
                : <StoredModelMeshes asset={modelAsset} component={component} />}
            </group>
            {component.modelAssetId && useProceduralFallback && (
              <Html center position={[0, component.maxHeight / 2 + 2, 0]} distanceFactor={80}>
                <span className="pcb-3d-fallback-hint" style={{ display: "block", width: 190, whiteSpace: "normal", textAlign: "center" }} role="status">{modelAssets[component.modelAssetId] === undefined ? "正在載入 STEP 模型…" : "STEP 模型載入失敗，請重新開啟 3D 重試"}</span>
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
          dpr={[1, 2]}
          shadows
          camera={{ position: [size * 0.88, size * 0.82, size * 0.96], fov: 38, near: 0.1, far: size * 25 }}
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
