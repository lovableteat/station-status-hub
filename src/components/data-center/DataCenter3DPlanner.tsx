import { memo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type {
  RackDevice,
  RackDeviceHealth,
  RackDeviceType,
  RackPlan,
  RackStatus,
} from "./dataCenterTypes";

interface DataCenter3DPlannerProps {
  racks: RackPlan[];
  selectedRackId: string;
  selectedDeviceId?: string;
  onSelectRack: (rackId: string) => void;
}

function getRackColor(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "#22c55e";
    case "reserved":
      return "#f59e0b";
    case "available":
      return "#38bdf8";
    case "blocked":
      return "#fb7185";
    default:
      return "#94a3b8";
  }
}

function getDeviceColor(type: RackDeviceType, health: RackDeviceHealth) {
  if (health === "critical") {
    return "#fb7185";
  }

  if (health === "warning") {
    return "#f59e0b";
  }

  if (health === "offline") {
    return "#64748b";
  }

  switch (type) {
    case "compute-tray":
      return "#38bdf8";
    case "switch-tray":
      return "#818cf8";
    case "tor-switch":
      return "#a78bfa";
    case "psu":
      return "#22c55e";
    case "management":
      return "#14b8a6";
    case "storage-tray":
      return "#f97316";
    default:
      return "#94a3b8";
  }
}

function getDeviceY(slotStart: number, slotSpan: number) {
  const innerHeight = 1.9;
  const unitHeight = innerHeight / 42;
  const bottom = -innerHeight / 2;

  return bottom + (slotStart - 1) * unitHeight + (slotSpan * unitHeight) / 2;
}

function getDeviceHeight(slotSpan: number) {
  const innerHeight = 1.9;
  const unitHeight = innerHeight / 42;

  return Math.max(slotSpan * unitHeight - 0.01, 0.025);
}

const RackDevices = memo(function RackDevices({
  devices,
  selectedDeviceId,
}: {
  devices: RackDevice[];
  selectedDeviceId?: string;
}) {
  return (
    <>
      {devices.map((device) => {
        const isActive = device.id === selectedDeviceId;

        return (
          <group key={device.id} position={[0, getDeviceY(device.slotStart, device.slotSpan), 0.18]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.86, getDeviceHeight(device.slotSpan), 0.64]} />
              <meshStandardMaterial
                color={getDeviceColor(device.type, device.health)}
                emissive={isActive ? "#ffffff" : "#000000"}
                emissiveIntensity={isActive ? 0.32 : 0}
                metalness={0.45}
                roughness={0.38}
              />
            </mesh>
            <mesh position={[0, 0, 0.33]}>
              <boxGeometry args={[0.78, Math.max(getDeviceHeight(device.slotSpan) - 0.012, 0.02), 0.025]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.25} />
            </mesh>
          </group>
        );
      })}
    </>
  );
});

const CabinetBlock = memo(function CabinetBlock({
  rack,
  isSelected,
  selectedDeviceId,
  onSelect,
}: {
  rack: RackPlan;
  isSelected: boolean;
  selectedDeviceId?: string;
  onSelect: (rackId: string) => void;
}) {
  return (
    <group
      position={[rack.positionX, 1.08, rack.positionZ]}
      rotation={[0, (rack.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(rack.id);
      }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.02, 2.16, 1.02]} />
        <meshStandardMaterial
          color={isSelected ? "#dbeafe" : getRackColor(rack.status)}
          transparent
          opacity={isSelected ? 0.2 : 0.88}
          emissive={isSelected ? "#2563eb" : "#000000"}
          emissiveIntensity={isSelected ? 0.22 : 0}
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>

      <mesh position={[0, 0, 0.48]}>
        <boxGeometry args={[0.9, 2, 0.05]} />
        <meshStandardMaterial
          color="#020617"
          transparent
          opacity={isSelected ? 0.12 : 0.92}
          metalness={0.82}
          roughness={0.18}
        />
      </mesh>

      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[0.96, 0.08, 0.96]} />
        <meshStandardMaterial color={isSelected ? "#93c5fd" : "#111827"} />
      </mesh>

      {isSelected ? <RackDevices devices={rack.devices} selectedDeviceId={selectedDeviceId} /> : null}
    </group>
  );
});

function PlannerScene({
  racks,
  selectedRackId,
  selectedDeviceId,
  onSelectRack,
}: DataCenter3DPlannerProps) {
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight
        castShadow
        intensity={1.35}
        position={[9, 12, 8]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight intensity={0.35} position={[-8, 7, -8]} />
      <pointLight intensity={0.28} position={[8, 5, 6]} color="#60a5fa" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial color="#0b1220" />
      </mesh>

      <gridHelper args={[22, 22, "#315184", "#162338"]} position={[0, 0.02, 0]} />

      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[22, 0.04, 22]} />
        <meshStandardMaterial color="#0f172a" metalness={0.3} roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.08, -8.6]}>
        <boxGeometry args={[22, 0.12, 0.35]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[-8.6, 0.08, 0]}>
        <boxGeometry args={[0.35, 0.12, 22]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {racks.map((rack) => (
        <CabinetBlock
          key={rack.id}
          rack={rack}
          isSelected={rack.id === selectedRackId}
          selectedDeviceId={selectedDeviceId}
          onSelect={onSelectRack}
        />
      ))}
    </>
  );
}

export function DataCenter3DPlanner(props: DataCenter3DPlannerProps) {
  return (
    <div className="h-[560px] overflow-hidden rounded-[28px] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(216_58%_16%),hsl(223_45%_9%)_68%)]">
      <Canvas shadows camera={{ position: [8.5, 7.4, 9.5], fov: 40 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <PlannerScene {...props} />
          <OrbitControls
            makeDefault
            enablePan
            enableZoom
            minDistance={6}
            maxDistance={19}
            maxPolarAngle={Math.PI / 2.06}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
