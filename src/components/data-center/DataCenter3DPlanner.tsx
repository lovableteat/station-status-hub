import { memo, Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";

import type {
  ImportedStepModel,
  RackDevice,
  RackPlan,
  RackStatus,
} from "./dataCenterTypes";

interface DataCenter3DPlannerProps {
  racks: RackPlan[];
  selectedRackId: string;
  onSelectRack: (rackId: string) => void;
  importedModel?: ImportedStepModel | null;
}

const RACK_CENTER_Y = 1.08;
const RACK_FRAME_WIDTH = 0.76;
const RACK_FRAME_HEIGHT = 2.12;
const RACK_FRAME_DEPTH = 1.16;
const RACK_BODY_WIDTH = 0.7;
const RACK_BODY_HEIGHT = 2.06;
const RACK_BODY_DEPTH = 1.08;
const RACK_BASE_WIDTH = 0.94;
const RACK_BASE_HEIGHT = 0.07;
const RACK_BASE_DEPTH = 1.3;
const DEVICE_MAP_WIDTH = 0.58;
const DEVICE_MAP_HEIGHT = 1.82;
const DEVICE_MAP_Z = 0.558;

function getRackTone(status: RackStatus) {
  switch (status) {
    case "allocated":
      return {
        frame: "#18b8d9",
        fill: "#0e2a39",
      };
    case "reserved":
      return {
        frame: "#f5c15d",
        fill: "#2b2417",
      };
    case "available":
      return {
        frame: "#7dd3fc",
        fill: "#14263f",
      };
    case "blocked":
      return {
        frame: "#e879f9",
        fill: "#2c1835",
      };
    default:
      return {
        frame: "#94a3b8",
        fill: "#132031",
      };
  }
}

function getRackStatusLabel(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "已配置";
    case "reserved":
      return "預留";
    case "available":
      return "可用";
    case "blocked":
      return "阻塞";
    default:
      return status;
  }
}

function getDeviceTone(device: RackDevice) {
  const typeColor: Record<RackDevice["type"], string> = {
    "compute-tray": "#2dd4bf",
    "switch-tray": "#38bdf8",
    "tor-switch": "#f59e0b",
    psu: "#f472b6",
    management: "#a78bfa",
    "storage-tray": "#22c55e",
  };

  const healthEmissive: Record<RackDevice["health"], string> = {
    healthy: "#0b6a5f",
    warning: "#7c5a07",
    critical: "#7f1d1d",
    offline: "#334155",
  };

  return {
    color: typeColor[device.type],
    emissive: healthEmissive[device.health],
  };
}

function getImportedScale(model: ImportedStepModel) {
  const widthRatio =
    model.dimensions.widthMm > 0
      ? model.calibratedDimensions.widthMm / model.dimensions.widthMm
      : 1;
  const depthRatio =
    model.dimensions.depthMm > 0
      ? model.calibratedDimensions.depthMm / model.dimensions.depthMm
      : 1;
  const heightRatio =
    model.dimensions.heightMm > 0
      ? model.calibratedDimensions.heightMm / model.dimensions.heightMm
      : 1;

  return [widthRatio * 0.001, depthRatio * 0.001, heightRatio * 0.001] as const;
}

function getImportedBounds(model: ImportedStepModel) {
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  model.parts.forEach((part) => {
    const positions = part.position;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];

      if (x < min.x) min.x = x;
      if (y < min.y) min.y = y;
      if (z < min.z) min.z = z;

      if (x > max.x) max.x = x;
      if (y > max.y) max.y = y;
      if (z > max.z) max.z = z;
    }
  });

  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return {
      centerX: 0,
      centerY: 0,
      minZ: 0,
    };
  }

  return {
    centerX: (min.x + max.x) / 2,
    centerY: (min.y + max.y) / 2,
    minZ: min.z,
  };
}

const ImportedStepAssembly = memo(function ImportedStepAssembly({
  model,
}: {
  model: ImportedStepModel;
}) {
  const parts = useMemo(
    () =>
      model.parts.map((part) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.position, 3));
        if (part.normal) {
          geometry.setAttribute("normal", new THREE.BufferAttribute(part.normal, 3));
        }
        geometry.setIndex(new THREE.BufferAttribute(part.index, 1));
        geometry.computeBoundingSphere();

        return {
          id: part.id,
          name: part.name,
          color: part.color,
          geometry,
        };
      }),
    [model.parts]
  );

  useEffect(
    () => () => {
      parts.forEach((part) => {
        part.geometry.dispose();
      });
    },
    [parts]
  );

  const bounds = useMemo(() => getImportedBounds(model), [model]);
  const scale = useMemo(() => getImportedScale(model), [model]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={scale}>
      <group position={[-bounds.centerX, -bounds.centerY, -bounds.minZ]}>
        {parts.map((part) => (
          <mesh key={part.id} geometry={part.geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={
                part.color
                  ? new THREE.Color(part.color[0], part.color[1], part.color[2]).getHex()
                  : "#9fb6d4"
              }
              metalness={0.22}
              roughness={0.54}
              envMapIntensity={0.6}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
});

const RackLabel = memo(function RackLabel({
  rack,
  isSelected,
}: {
  rack: RackPlan;
  isSelected: boolean;
}) {
  return (
    <Html position={[0, RACK_FRAME_HEIGHT / 2 + 0.28, 0]} center distanceFactor={11} transform={false}>
      <div
        className={cn(
          "pointer-events-none min-w-[136px] rounded-2xl border px-3 py-2 text-center shadow-[0_16px_36px_-24px_hsl(196_90%_55%/0.62)] backdrop-blur-md",
          isSelected
            ? "border-cyan-300/55 bg-slate-950/88 text-cyan-50"
            : "border-slate-300/12 bg-slate-950/78 text-slate-100"
        )}
      >
        <div className="text-sm font-bold tracking-[0.02em]">{rack.cabinet}</div>
        <div className="mt-1 text-[11px] font-semibold text-slate-300">
          {getRackStatusLabel(rack.status)} / {rack.devices.length} 台
        </div>
      </div>
    </Html>
  );
});

const RackFloorLabel = memo(function RackFloorLabel({
  rack,
  isSelected,
}: {
  rack: RackPlan;
  isSelected: boolean;
}) {
  return (
    <Text
      position={[0, -RACK_CENTER_Y + 0.04, 0.78]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.12}
      letterSpacing={0.02}
      color={isSelected ? "#d8fbff" : "#89bff2"}
      outlineWidth={0.006}
      outlineColor="#05111c"
      anchorX="center"
      anchorY="middle"
    >
      {rack.cabinet}
    </Text>
  );
});

const RackDeviceMap = memo(function RackDeviceMap({
  rack,
  isSelected,
}: {
  rack: RackPlan;
  isSelected: boolean;
}) {
  const unitHeight = DEVICE_MAP_HEIGHT / Math.max(rack.capacityU, 1);

  return (
    <group position={[0, 0, DEVICE_MAP_Z]}>
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[DEVICE_MAP_WIDTH, DEVICE_MAP_HEIGHT]} />
        <meshStandardMaterial
          color={isSelected ? "#0d2239" : "#071321"}
          transparent
          opacity={0.94}
          roughness={0.32}
          metalness={0.16}
        />
      </mesh>

      {rack.devices.map((device) => {
        const { color, emissive } = getDeviceTone(device);
        const height = Math.max(unitHeight * device.slotSpan - 0.012, unitHeight * 0.72);
        const y = -DEVICE_MAP_HEIGHT / 2 + unitHeight * (device.slotStart - 1 + device.slotSpan / 2);

        return (
          <mesh key={device.id} position={[0, y, 0.012]}>
            <boxGeometry args={[DEVICE_MAP_WIDTH - 0.05, height, 0.03]} />
            <meshStandardMaterial
              color={color}
              emissive={emissive}
              emissiveIntensity={isSelected ? 0.72 : 0.45}
              roughness={0.36}
              metalness={0.24}
            />
          </mesh>
        );
      })}
    </group>
  );
});

const RackShell = memo(function RackShell({
  rack,
  isSelected,
  onSelect,
}: {
  rack: RackPlan;
  isSelected: boolean;
  onSelect: (rackId: string) => void;
}) {
  const tone = getRackTone(rack.status);
  const frameGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(RACK_FRAME_WIDTH, RACK_FRAME_HEIGHT, RACK_FRAME_DEPTH)),
    []
  );
  const baseGeometry = useMemo(
    () => new THREE.BoxGeometry(RACK_BASE_WIDTH, RACK_BASE_HEIGHT, RACK_BASE_DEPTH),
    []
  );
  const topGeometry = useMemo(() => new THREE.BoxGeometry(0.78, 0.08, 1.12), []);
  const sideRailGeometry = useMemo(() => new THREE.BoxGeometry(0.03, 2.04, 0.04), []);

  useEffect(
    () => () => {
      frameGeometry.dispose();
      baseGeometry.dispose();
      topGeometry.dispose();
      sideRailGeometry.dispose();
    },
    [baseGeometry, frameGeometry, sideRailGeometry, topGeometry]
  );

  return (
    <group
      position={[rack.positionX, RACK_CENTER_Y, rack.positionZ]}
      rotation={[0, (rack.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(rack.id);
      }}
    >
      <mesh geometry={baseGeometry} position={[0, -1.05, 0]} receiveShadow>
        <meshStandardMaterial
          color={isSelected ? "#164e63" : "#0f1b2f"}
          emissive={isSelected ? "#0f4c81" : "#000000"}
          emissiveIntensity={isSelected ? 0.22 : 0}
          metalness={0.12}
          roughness={0.88}
        />
      </mesh>

      <mesh castShadow receiveShadow>
        <boxGeometry args={[RACK_BODY_WIDTH, RACK_BODY_HEIGHT, RACK_BODY_DEPTH]} />
        <meshStandardMaterial
          color={tone.fill}
          transparent
          opacity={isSelected ? 0.52 : 0.32}
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      <mesh geometry={topGeometry} position={[0, 1.01, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          color={isSelected ? "#17314c" : "#101b2b"}
          emissive={isSelected ? "#0f4c81" : "#000000"}
          emissiveIntensity={isSelected ? 0.16 : 0}
          metalness={0.24}
          roughness={0.52}
        />
      </mesh>

      {[
        [-0.31, 0, -0.5],
        [0.31, 0, -0.5],
        [-0.31, 0, 0.5],
        [0.31, 0, 0.5],
      ].map(([x, y, z], index) => (
        <mesh key={index} geometry={sideRailGeometry} position={[x, y, z]} castShadow>
          <meshStandardMaterial
            color={isSelected ? "#daf9ff" : tone.frame}
            emissive={isSelected ? "#155e75" : "#000000"}
            emissiveIntensity={isSelected ? 0.34 : 0}
            metalness={0.48}
            roughness={0.28}
          />
        </mesh>
      ))}

      <lineSegments geometry={frameGeometry}>
        <lineBasicMaterial color={isSelected ? "#c7f9ff" : tone.frame} />
      </lineSegments>

      <mesh position={[0, 0, 0.52]}>
        <planeGeometry args={[0.64, 1.92]} />
        <meshStandardMaterial
          color={isSelected ? "#12243a" : "#09121f"}
          emissive={isSelected ? "#134a8d" : "#000000"}
          emissiveIntensity={isSelected ? 0.22 : 0}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>

      <RackDeviceMap rack={rack} isSelected={isSelected} />
      <RackLabel rack={rack} isSelected={isSelected} />
      <RackFloorLabel rack={rack} isSelected={isSelected} />
    </group>
  );
});

const ImportedRack = memo(function ImportedRack({
  rack,
  isSelected,
  importedModel,
  onSelect,
}: {
  rack: RackPlan;
  isSelected: boolean;
  importedModel: ImportedStepModel;
  onSelect: (rackId: string) => void;
}) {
  const tone = getRackTone(rack.status);
  const footprint = useMemo(() => new THREE.BoxGeometry(1.02, 0.08, 1.36), []);
  const cage = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.86, 2.26, 1.26)), []);

  useEffect(
    () => () => {
      footprint.dispose();
      cage.dispose();
    },
    [cage, footprint]
  );

  return (
    <group
      position={[rack.positionX, 0, rack.positionZ]}
      rotation={[0, (rack.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(rack.id);
      }}
    >
      <mesh geometry={footprint} position={[0, 0.04, 0]} receiveShadow>
        <meshStandardMaterial
          color={isSelected ? "#0f3850" : "#121c2f"}
          emissive={isSelected ? "#155e75" : "#000000"}
          emissiveIntensity={isSelected ? 0.2 : 0}
          metalness={0.14}
          roughness={0.84}
        />
      </mesh>

      <group position={[0, 0.02, 0]}>
        <ImportedStepAssembly model={importedModel} />
      </group>

      <group position={[0, 1.12, 0]}>
        <lineSegments geometry={cage}>
          <lineBasicMaterial color={isSelected ? "#e0fbff" : tone.frame} />
        </lineSegments>
      </group>

      <RackLabel rack={rack} isSelected={isSelected} />
      <RackFloorLabel rack={rack} isSelected={isSelected} />
    </group>
  );
});

function PlannerScene({
  racks,
  selectedRackId,
  importedModel,
  onSelectRack,
}: DataCenter3DPlannerProps) {
  return (
    <>
      <color attach="background" args={["#08111d"]} />
      <fog attach="fog" args={["#08111d", 14, 28]} />

      <ambientLight intensity={0.72} />
      <hemisphereLight intensity={0.48} color="#d7f6ff" groundColor="#08111d" />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[8, 12, 5]}
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <pointLight intensity={0.34} position={[-7, 5, -6]} color="#4dd4ff" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#0a1422" roughness={0.96} metalness={0.08} />
      </mesh>

      <gridHelper args={[24, 24, "#2b6cb0", "#122235"]} position={[0, 0.01, 0]} />

      <Text
        position={[-10.2, 0.04, -10.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.22}
        color="#4cc9f0"
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#03111d"
      >
        FRONT / 機櫃正面
      </Text>

      {racks.map((rack) => {
        const isSelected = rack.id === selectedRackId;

        if (isSelected && importedModel) {
          return (
            <ImportedRack
              key={rack.id}
              rack={rack}
              isSelected={isSelected}
              importedModel={importedModel}
              onSelect={onSelectRack}
            />
          );
        }

        return (
          <RackShell
            key={rack.id}
            rack={rack}
            isSelected={isSelected}
            onSelect={onSelectRack}
          />
        );
      })}
    </>
  );
}

export function DataCenter3DPlanner(props: DataCenter3DPlannerProps) {
  const selectedRack = useMemo(
    () => props.racks.find((rack) => rack.id === props.selectedRackId) ?? props.racks[0],
    [props.racks, props.selectedRackId]
  );

  return (
    <div className="relative h-[640px] overflow-hidden rounded-[30px] border border-cyan-300/12 bg-[radial-gradient(circle_at_top,hsl(210_60%_18%),hsl(223_48%_8%)_68%)] shadow-[0_28px_80px_-56px_hsl(197_92%_55%/0.48)]">
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-cyan-300/30 bg-slate-950/72 px-3 py-1 text-[11px] font-semibold text-cyan-100 backdrop-blur-md">
          3D 機櫃總覽
        </div>
        <div className="rounded-full border border-slate-300/12 bg-slate-950/72 px-3 py-1 text-[11px] text-slate-200 backdrop-blur-md">
          色塊 = 已裝設備 / 外框 = 機櫃
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-3xl border border-slate-300/12 bg-slate-950/72 px-4 py-3 backdrop-blur-md">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Status Legend</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
          {[
            { color: "#18b8d9", label: "已配置" },
            { color: "#f5c15d", label: "預留" },
            { color: "#7dd3fc", label: "可用" },
            { color: "#e879f9", label: "阻塞" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedRack ? (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-3xl border border-cyan-300/18 bg-slate-950/74 px-4 py-3 text-right backdrop-blur-md">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">目前選取</div>
          <div className="mt-2 text-lg font-bold text-slate-50">{selectedRack.cabinet}</div>
          <div className="mt-1 text-xs text-slate-300">
            {getRackStatusLabel(selectedRack.status)} / {selectedRack.devices.length} 台設備
          </div>
          <div className="mt-1 text-xs text-slate-400">
            X {selectedRack.positionX.toFixed(1)} / Z {selectedRack.positionZ.toFixed(1)} / {selectedRack.aisle}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-full border border-slate-300/12 bg-slate-950/72 px-4 py-2 text-xs text-slate-200 backdrop-blur-md">
        拖曳旋轉 / 滾輪縮放 / 點機櫃看詳情
      </div>

      <Canvas shadows camera={{ position: [8.2, 6.8, 9.8], fov: 34 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <PlannerScene {...props} />
          <OrbitControls
            makeDefault
            enablePan
            enableZoom
            minDistance={5.5}
            maxDistance={20}
            maxPolarAngle={Math.PI / 2.08}
            target={[0, 1.2, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
