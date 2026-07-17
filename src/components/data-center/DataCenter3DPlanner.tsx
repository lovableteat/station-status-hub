import {
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import type {
  CameraPreset,
  DataCenterLayer,
  FacilityPlan,
  ImportedStepModel,
  RackDeviceHealth,
  RackModelDefinition,
  RackPlan,
  RackStatus,
} from "./dataCenterTypes";

interface DataCenter3DPlannerProps {
  racks: RackPlan[];
  models: Record<string, RackModelDefinition>;
  selectedRackId: string;
  activeLayer: DataCenterLayer;
  showLabels: boolean;
  cameraPreset: CameraPreset;
  cameraRequestId: number;
  facility: FacilityPlan;
  onSelectRack: (rackId: string) => void;
}

const STATUS_LABELS: Record<RackStatus, string> = {
  allocated: "運行中",
  reserved: "預留",
  available: "可配置",
  blocked: "受阻",
};

const HEALTH_LABELS: Record<RackDeviceHealth, string> = {
  healthy: "正常",
  warning: "注意",
  critical: "異常",
  offline: "離線",
};

const HEALTH_ORDER: Record<RackDeviceHealth, number> = {
  healthy: 0,
  warning: 1,
  offline: 2,
  critical: 3,
};

function getRackHealth(rack: RackPlan): RackDeviceHealth {
  return rack.devices.reduce<RackDeviceHealth>((worst, device) => {
    return HEALTH_ORDER[device.health] > HEALTH_ORDER[worst] ? device.health : worst;
  }, "healthy");
}

function getStatusColor(status: RackStatus) {
  const colors: Record<RackStatus, string> = {
    allocated: "#2dd4bf",
    reserved: "#fbbf24",
    available: "#60a5fa",
    blocked: "#fb7185",
  };
  return colors[status];
}

function getLayerColor(rack: RackPlan, layer: DataCenterLayer) {
  if (layer === "health") {
    const colors: Record<RackDeviceHealth, string> = {
      healthy: "#34d399",
      warning: "#fbbf24",
      critical: "#fb7185",
      offline: "#94a3b8",
    };
    return colors[getRackHealth(rack)];
  }

  if (layer === "power") {
    return rack.powerKw >= 18 ? "#f59e0b" : rack.powerKw >= 12 ? "#facc15" : "#fde68a";
  }

  if (layer === "network") {
    return rack.uplinks >= 4 ? "#22d3ee" : "#60a5fa";
  }

  if (layer === "cooling") {
    return rack.temperatureC >= 30
      ? "#fb7185"
      : rack.temperatureC >= 26
        ? "#fbbf24"
        : "#38bdf8";
  }

  return getStatusColor(rack.status);
}

function SelectionCage({
  dimensions,
  color,
  selected,
  hovered,
}: {
  dimensions: RackModelDefinition["dimensions"];
  color: string;
  selected: boolean;
  hovered: boolean;
}) {
  const width = dimensions.widthMm / 1000;
  const depth = dimensions.depthMm / 1000;
  const height = dimensions.heightMm / 1000;
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.1, height + 0.1, depth + 0.1)),
    [depth, height, width]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!selected && !hovered) return null;

  return (
    <group position={[0, height / 2, 0]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={selected ? "#dffbff" : color} transparent opacity={0.92} />
      </lineSegments>
      <mesh>
        <boxGeometry args={[width + 0.16, height + 0.16, depth + 0.16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.055 : 0.025}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

const ProceduralRackModel = memo(function ProceduralRackModel({
  definition,
  accent,
}: {
  definition: RackModelDefinition;
  accent: string;
}) {
  const width = definition.dimensions.widthMm / 1000;
  const depth = definition.dimensions.depthMm / 1000;
  const height = definition.dimensions.heightMm / 1000;
  const post = Math.max(0.045, width * 0.075);
  const railWidth = width - post * 1.15;

  return (
    <group>
      {[-1, 1].flatMap((xSide) =>
        [-1, 1].map((zSide) => (
          <mesh
            key={`${xSide}-${zSide}`}
            position={[
              xSide * (width / 2 - post / 2),
              height / 2,
              zSide * (depth / 2 - post / 2),
            ]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[post, height, post]} />
            <meshStandardMaterial color="#273846" metalness={0.72} roughness={0.3} />
          </mesh>
        ))
      )}
      {[0.08, height - 0.08].flatMap((y) =>
        [-1, 1].map((zSide) => (
          <mesh key={`${y}-${zSide}`} position={[0, y, zSide * (depth / 2 - post / 2)]} castShadow>
            <boxGeometry args={[railWidth, post, post]} />
            <meshStandardMaterial color="#334b5d" metalness={0.68} roughness={0.34} />
          </mesh>
        ))
      )}
      {Array.from({ length: 10 }, (_, index) => {
        const y = height * 0.12 + (height * 0.74 * index) / 9;
        return (
          <mesh key={index} position={[0, y, depth / 2 - post * 0.36]}>
            <boxGeometry args={[railWidth, 0.018, post * 0.48]} />
            <meshStandardMaterial
              color={index % 3 === 0 ? accent : "#4a6070"}
              emissive={index % 3 === 0 ? accent : "#000000"}
              emissiveIntensity={index % 3 === 0 ? 0.16 : 0}
              roughness={0.4}
            />
          </mesh>
        );
      })}
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[width + 0.12, 0.07, depth + 0.12]} />
        <meshStandardMaterial color="#0a1825" metalness={0.48} roughness={0.58} />
      </mesh>
    </group>
  );
});

const GlbRackModel = memo(function GlbRackModel({
  definition,
}: {
  definition: RackModelDefinition;
}) {
  const gltf = useGLTF(definition.assetUrl ?? "") as { scene: THREE.Group };
  const prepared = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const desiredHeight = definition.dimensions.heightMm / 1000;
    const scale = size.y > 0 ? desiredHeight / size.y : 1;

    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    return {
      clone,
      position: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
      scale,
    };
  }, [definition.dimensions.heightMm, gltf.scene]);

  return (
    <group scale={prepared.scale}>
      <primitive object={prepared.clone} position={prepared.position} />
    </group>
  );
});

function getStepTransform(model: ImportedStepModel) {
  const { min, max } = model.bounds;
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const heightScale = model.dimensions.heightMm
    ? model.calibratedDimensions.heightMm / model.dimensions.heightMm
    : 1;

  if (model.upAxis === "x") {
    return {
      offset: [-min[0], -center[1], -center[2]] as [number, number, number],
      rotation: [0, 0, Math.PI / 2] as [number, number, number],
      scale: heightScale * 0.001,
    };
  }

  if (model.upAxis === "z") {
    return {
      offset: [-center[0], -center[1], -min[2]] as [number, number, number],
      rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
      scale: heightScale * 0.001,
    };
  }

  return {
    offset: [-center[0], -min[1], -center[2]] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: heightScale * 0.001,
  };
}

const StepRackModel = memo(function StepRackModel({ model }: { model: ImportedStepModel }) {
  const geometries = useMemo(
    () =>
      model.parts.map((part) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.position, 3));
        if (part.normal) {
          geometry.setAttribute("normal", new THREE.BufferAttribute(part.normal, 3));
        } else {
          geometry.computeVertexNormals();
        }
        geometry.setIndex(new THREE.BufferAttribute(part.index, 1));
        geometry.computeBoundingSphere();
        return { ...part, geometry };
      }),
    [model.parts]
  );
  const transform = useMemo(() => getStepTransform(model), [model]);

  useEffect(
    () => () => {
      geometries.forEach((part) => part.geometry.dispose());
    },
    [geometries]
  );

  return (
    <group rotation={transform.rotation} scale={transform.scale}>
      <group position={transform.offset}>
        {geometries.map((part) => (
          <mesh key={part.id} geometry={part.geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={part.color ? new THREE.Color(...part.color) : "#9cb6c9"}
              metalness={0.28}
              roughness={0.5}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
});

const PlaceholderL10Model = memo(function PlaceholderL10Model({
  definition,
  index,
}: {
  definition: RackModelDefinition;
  index: number;
}) {
  const width = definition.dimensions.widthMm / 1000;
  const depth = definition.dimensions.depthMm / 1000;
  const height = definition.dimensions.heightMm / 1000;

  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#192936" metalness={0.62} roughness={0.34} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2 + 0.004]}>
        <boxGeometry args={[width * 0.92, height * 0.72, 0.012]} />
        <meshStandardMaterial color="#0b1822" metalness={0.45} roughness={0.42} />
      </mesh>
      {[-0.24, -0.08, 0.08, 0.24].map((offset, ventIndex) => (
        <mesh key={offset} position={[width * offset, height / 2, depth / 2 + 0.012]}>
          <boxGeometry args={[width * 0.11, height * 0.42, 0.008]} />
          <meshStandardMaterial color={ventIndex === index % 4 ? "#22d3ee" : "#426073"} emissive={ventIndex === index % 4 ? "#0891b2" : "#000000"} emissiveIntensity={0.28} />
        </mesh>
      ))}
      <mesh position={[width * 0.39, height * 0.28, depth / 2 + 0.018]}>
        <sphereGeometry args={[0.008, 10, 10]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>
    </group>
  );
});

function RackL10Modules({
  rack,
  rackDefinition,
  l10Definition,
}: {
  rack: RackPlan;
  rackDefinition: RackModelDefinition;
  l10Definition: RackModelDefinition;
}) {
  const rackWidth = rackDefinition.dimensions.widthMm / 1000;
  const rackDepth = rackDefinition.dimensions.depthMm / 1000;
  const rackHeight = rackDefinition.dimensions.heightMm / 1000;
  const modelWidth = l10Definition.dimensions.widthMm / 1000;
  const modelDepth = l10Definition.dimensions.depthMm / 1000;
  const modelHeight = l10Definition.dimensions.heightMm / 1000;
  const fitScale = Math.min(1, (rackWidth * 0.9) / modelWidth, (rackDepth * 0.9) / modelDepth);
  const fittedHeight = modelHeight * fitScale;
  const verticalGap = Math.max(0.006, fittedHeight * 0.06);
  const baseY = rackHeight * 0.08;
  const maxVisible = Math.max(0, Math.floor((rackHeight * 0.84) / (fittedHeight + verticalGap)));
  const visibleCount = Math.min(rack.l10Count, maxVisible);

  if (!visibleCount || !Number.isFinite(fitScale)) return null;

  return (
    <group position={[0, baseY, 0]}>
      {Array.from({ length: visibleCount }, (_, index) => (
        <group key={`${rack.id}-l10-${index}`} position={[0, index * (fittedHeight + verticalGap), 0]} scale={fitScale}>
          <Suspense fallback={<PlaceholderL10Model definition={l10Definition} index={index} />}>
            {l10Definition.source === "step" && l10Definition.stepModel ? (
              <StepRackModel model={l10Definition.stepModel} />
            ) : l10Definition.assetUrl ? (
              <GlbRackModel definition={l10Definition} />
            ) : (
              <PlaceholderL10Model definition={l10Definition} index={index} />
            )}
          </Suspense>
        </group>
      ))}
    </group>
  );
}

function RackSceneCard({
  rack,
  definition,
  selected,
}: {
  rack: RackPlan;
  definition: RackModelDefinition;
  selected: boolean;
}) {
  const health = getRackHealth(rack);
  const color = getLayerColor(rack, "health");
  const height = definition.dimensions.heightMm / 1000;

  return (
    <Html
      position={[0, height + (selected ? 0.48 : 0.28), 0]}
      center
      zIndexRange={[30, 5]}
    >
      <div
        className={
          selected
            ? "pointer-events-none min-w-[190px] rounded-2xl border border-cyan-300/45 bg-[#06111d]/94 p-3 text-left text-white shadow-[0_20px_55px_-24px_rgba(34,211,238,0.8)] backdrop-blur-xl"
            : "pointer-events-none min-w-[122px] rounded-xl border border-white/15 bg-[#06111d]/88 px-3 py-2 text-white shadow-xl backdrop-blur-lg"
        }
      >
        <div className="flex items-center justify-between gap-3">
          <span className={selected ? "text-sm font-bold" : "text-xs font-bold"}>{rack.cabinet}</span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            {HEALTH_LABELS[health]}
          </span>
        </div>
        {selected ? (
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-300">
            <span>{rack.powerKw} kW</span>
            <span>{rack.temperatureC}°C</span>
            <span>{rack.utilizationPercent}%</span>
          </div>
        ) : null}
      </div>
    </Html>
  );
}

function RackVisual({
  rack,
  definition,
  l10Definition,
  activeLayer,
  selected,
  hovered,
  showLabel,
  onSelect,
  onHover,
}: {
  rack: RackPlan;
  definition: RackModelDefinition;
  l10Definition: RackModelDefinition;
  activeLayer: DataCenterLayer;
  selected: boolean;
  hovered: boolean;
  showLabel: boolean;
  onSelect: (rackId: string) => void;
  onHover: (rackId: string | null) => void;
}) {
  const color = getLayerColor(rack, activeLayer);
  const width = definition.dimensions.widthMm / 1000;
  const depth = definition.dimensions.depthMm / 1000;
  const height = definition.dimensions.heightMm / 1000;

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(rack.id);
    document.body.style.cursor = "pointer";
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
    document.body.style.cursor = "default";
  };

  return (
    <group
      position={[rack.positionX, 0, rack.positionZ]}
      rotation={[0, (rack.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(rack.id);
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[Math.max(width, 0.55), Math.max(height, 1.6), Math.max(depth, 0.8)]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Suspense fallback={<ProceduralRackModel definition={definition} accent={color} />}>
        {definition.source === "step" && definition.stepModel ? (
          <StepRackModel model={definition.stepModel} />
        ) : definition.assetUrl ? (
          <GlbRackModel definition={definition} />
        ) : (
          <ProceduralRackModel definition={definition} accent={color} />
        )}
      </Suspense>

      <RackL10Modules rack={rack} rackDefinition={definition} l10Definition={l10Definition} />

      <mesh position={[0, 0.018, 0]} receiveShadow>
        <boxGeometry args={[width + 0.2, 0.035, depth + 0.2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.3 : 0.12}
          transparent
          opacity={selected ? 0.8 : 0.42}
          roughness={0.75}
        />
      </mesh>

      <SelectionCage
        dimensions={definition.dimensions}
        color={color}
        selected={selected}
        hovered={hovered}
      />

      {showLabel ? <RackSceneCard rack={rack} definition={definition} selected={selected} /> : null}
    </group>
  );
}

function InfrastructureLayer({
  racks,
  activeLayer,
  facility,
}: {
  racks: RackPlan[];
  activeLayer: DataCenterLayer;
  facility: FacilityPlan;
}) {
  if (activeLayer === "network") {
    const networkHubZ = -facility.depth / 2 + 0.75;
    return (
      <group>
        <mesh position={[0, 0.15, networkHubZ]}>
          <boxGeometry args={[2.2, 0.3, 0.65]} />
          <meshStandardMaterial color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.35} />
        </mesh>
        {racks.map((rack) => (
          <Line
            key={rack.id}
            points={[
              [0, 0.22, networkHubZ],
              [rack.positionX, 0.22, rack.positionZ],
            ]}
            color="#22d3ee"
            lineWidth={1.2}
            transparent
            opacity={0.52}
          />
        ))}
      </group>
    );
  }

  if (activeLayer === "power") {
    const activeFeeds = facility.powerFeeds.filter((feed) => feed.enabled);
    return (
      <group>
        {activeFeeds.map((feed) => (
          <group key={feed.id}>
            <mesh position={[feed.x, 0.12, feed.z]}>
              <boxGeometry args={[0.42, 0.16, 0.42]} />
              <meshStandardMaterial color={feed.color} emissive={feed.color} emissiveIntensity={0.42} />
            </mesh>
            {racks.map((rack) => (
              <Line
                key={`${feed.id}-${rack.id}`}
                points={[
                  [feed.x, 0.2, feed.z],
                  [rack.positionX, 0.2, rack.positionZ],
                ]}
                color={feed.color}
                lineWidth={1.25}
                transparent
                opacity={0.62}
              />
            ))}
          </group>
        ))}
      </group>
    );
  }

  return null;
}

function ThermalAisles({ aisles, active }: { aisles: FacilityPlan["aisles"]; active: boolean }) {
  return (
    <group>
      {aisles.map((aisle) => {
        const isCold = aisle.kind === "cold";
        const color = isCold ? "#0ea5e9" : "#c2410c";
        const emissive = isCold ? "#38bdf8" : "#fb923c";
        return (
          <group key={aisle.id} position={[aisle.x, 0, aisle.z]} rotation={[0, (aisle.rotation * Math.PI) / 180, 0]}>
            <mesh position={[0, 0.026, 0]} receiveShadow>
              <boxGeometry args={[aisle.width, 0.025, aisle.depth]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={active ? 0.34 : 0.08}
                transparent
                opacity={active ? 0.48 : 0.16}
                roughness={0.78}
              />
            </mesh>
            {[-0.38, -0.13, 0.13, 0.38].map((offset, index) => (
              <mesh
                key={offset}
                position={[aisle.width * offset, 0.052, 0]}
                rotation={[-Math.PI / 2, 0, !isCold ? Math.PI : 0]}
              >
                <coneGeometry args={[0.09, 0.28, 3]} />
                <meshBasicMaterial color={emissive} transparent opacity={active ? 0.9 : index % 2 ? 0.28 : 0.45} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function FacilityShell({ activeLayer, facility }: { activeLayer: DataCenterLayer; facility: FacilityPlan }) {
  const width = Math.max(8, facility.width);
  const depth = Math.max(8, facility.depth);
  const gridSize = Math.max(width, depth);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={activeLayer === "health" ? "#0d1c19" : "#0a1824"}
          roughness={0.95}
          metalness={0.08}
        />
      </mesh>
      {facility.showGrid ? (
        <gridHelper
          args={[gridSize, Math.max(12, Math.round(gridSize * 2)), "#2d7896", "#17374d"]}
          position={[0, 0.012, 0]}
          scale={[width / gridSize, 1, depth / gridSize]}
        />
      ) : null}
    </group>
  );
}

function CameraRig({
  racks,
  selectedRackId,
  preset,
  requestId,
  facility,
}: {
  racks: RackPlan[];
  selectedRackId: string;
  preset: CameraPreset;
  requestId: number;
  facility: FacilityPlan;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const desiredPosition = useRef(new THREE.Vector3(10, 7, 11));
  const desiredTarget = useRef(new THREE.Vector3(0, 0.8, 0));
  const animating = useRef(false);

  useEffect(() => {
    const selected = racks.find((rack) => rack.id === selectedRackId);
    const span = Math.max(facility.width, facility.depth);
    if (preset === "top") {
      desiredPosition.current.set(0.01, Math.max(15, span * 1.05), 0.01);
      desiredTarget.current.set(0, 0, 0);
    } else if (preset === "front") {
      desiredPosition.current.set(0, Math.max(4.2, span * 0.34), Math.max(12.5, span * 0.92));
      desiredTarget.current.set(0, 1, 0);
    } else if (preset === "focus" && selected) {
      desiredPosition.current.set(selected.positionX + 3.5, 3.2, selected.positionZ + 4.3);
      desiredTarget.current.set(selected.positionX, 1.05, selected.positionZ);
    } else {
      desiredPosition.current.set(span * 0.72, Math.max(7, span * 0.46), span * 0.82);
      desiredTarget.current.set(0, 0.8, 0);
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      camera.position.copy(desiredPosition.current);
      controlsRef.current?.target.copy(desiredTarget.current);
      controlsRef.current?.update();
      animating.current = false;
    } else {
      animating.current = true;
    }
  }, [camera, facility.depth, facility.width, preset, racks, requestId, selectedRackId]);

  useFrame(() => {
    if (!animating.current || !controlsRef.current) return;

    camera.position.lerp(desiredPosition.current, 0.085);
    controlsRef.current.target.lerp(desiredTarget.current, 0.1);
    controlsRef.current.update();

    if (
      camera.position.distanceTo(desiredPosition.current) < 0.025 &&
      controlsRef.current.target.distanceTo(desiredTarget.current) < 0.025
    ) {
      camera.position.copy(desiredPosition.current);
      controlsRef.current.target.copy(desiredTarget.current);
      animating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enableZoom
      minDistance={2.6}
      maxDistance={Math.max(24, Math.max(facility.width, facility.depth) * 2)}
      maxPolarAngle={Math.PI / 2.02}
      target={[0, 0.8, 0]}
    />
  );
}

function PlannerScene({
  racks,
  models,
  selectedRackId,
  activeLayer,
  showLabels,
  cameraPreset,
  cameraRequestId,
  facility,
  onSelectRack,
}: DataCenter3DPlannerProps) {
  const [hoveredRackId, setHoveredRackId] = useState<string | null>(null);

  useEffect(
    () => () => {
      document.body.style.cursor = "default";
    },
    []
  );

  return (
    <>
      <color attach="background" args={["#03070c"]} />
      <fog attach="fog" args={["#03070c", 14, 28]} />
      <ambientLight intensity={0.58} />
      <hemisphereLight intensity={0.65} color="#c9f6ff" groundColor="#020409" />
      <directionalLight
        castShadow
        intensity={1.35}
        position={[7, 10, 6]}
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <pointLight intensity={0.72} position={[-7, 4, -5]} color="#22d3ee" />
      <pointLight intensity={0.45} position={[7, 3, 5]} color="#3b82f6" />

      <FacilityShell activeLayer={activeLayer} facility={facility} />
      <ThermalAisles aisles={facility.aisles} active={activeLayer === "cooling"} />
      <InfrastructureLayer racks={racks} activeLayer={activeLayer} facility={facility} />

      {racks.map((rack) => {
        const definition = models[rack.modelId] ?? models["generic-42u"];
        const l10Definition = models[rack.l10ModelId] ?? models["l10-placeholder"];
        const health = getRackHealth(rack);
        const selected = rack.id === selectedRackId;
        const hovered = rack.id === hoveredRackId;
        const showLabel = showLabels && (selected || hovered || health !== "healthy");

        return (
          <RackVisual
            key={rack.id}
            rack={rack}
            definition={definition}
            l10Definition={l10Definition}
            activeLayer={activeLayer}
            selected={selected}
            hovered={hovered}
            showLabel={showLabel}
            onSelect={onSelectRack}
            onHover={setHoveredRackId}
          />
        );
      })}

      <CameraRig
        racks={racks}
        selectedRackId={selectedRackId}
        preset={cameraPreset}
        requestId={cameraRequestId}
        facility={facility}
      />
    </>
  );
}

function ModelLoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#02060b]/72 backdrop-blur-sm">
      <div className="w-[260px] rounded-2xl border border-cyan-300/25 bg-[#07131f]/95 p-4 shadow-[0_24px_70px_-30px_rgba(34,211,238,0.75)]">
        <div className="flex items-center justify-between text-xs font-semibold text-cyan-50">
          <span>正在載入 3D 機櫃</span>
          <span className="tabular-nums text-cyan-200">{Math.round(progress)}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#0ea5e9,#22d3ee,#34d399)] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="h-1.5 flex-1 animate-pulse rounded-full bg-cyan-300/30 motion-reduce:animate-none"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DataCenter3DPlanner(props: DataCenter3DPlannerProps) {
  return (
    <div className="relative h-full min-h-[460px] overflow-hidden bg-[#03070c]">
      <ModelLoadingOverlay />
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-white/12 bg-black/70 px-4 py-2 text-[11px] font-medium text-slate-300 shadow-xl backdrop-blur-xl sm:block">
        左鍵旋轉 · 右鍵平移 · 滾輪縮放 · 點選機櫃查看資料
      </div>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [10, 7, 11], fov: 36, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <PlannerScene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
