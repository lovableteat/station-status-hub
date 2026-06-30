import { memo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { RackPlan, RackStatus } from "./dataCenterTypes";

interface DataCenter3DPlannerProps {
  racks: RackPlan[];
  selectedRackId: string;
  onSelectRack: (rackId: string) => void;
}

function getRackColor(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "#2dd4bf";
    case "reserved":
      return "#f59e0b";
    case "available":
      return "#60a5fa";
    case "blocked":
      return "#fb7185";
    default:
      return "#94a3b8";
  }
}

const CabinetBlock = memo(function CabinetBlock({
  rack,
  isSelected,
  onSelect,
}: {
  rack: RackPlan;
  isSelected: boolean;
  onSelect: (rackId: string) => void;
}) {
  return (
    <group
      position={[rack.positionX, 1.05, rack.positionZ]}
      rotation={[0, (rack.rotation * Math.PI) / 180, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(rack.id);
      }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.15, 2.1, 1.15]} />
        <meshStandardMaterial
          color={isSelected ? "#f8fafc" : getRackColor(rack.status)}
          emissive={isSelected ? "#2563eb" : "#000000"}
          emissiveIntensity={isSelected ? 0.35 : 0}
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>

      <mesh position={[0, 1.16, 0]}>
        <boxGeometry args={[1.05, 0.08, 1.05]} />
        <meshStandardMaterial color={isSelected ? "#93c5fd" : "#111827"} />
      </mesh>

      <mesh position={[0, 0, 0.6]}>
        <boxGeometry args={[0.85, 1.8, 0.03]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.25} />
      </mesh>
    </group>
  );
});

function PlannerScene({
  racks,
  selectedRackId,
  onSelectRack,
}: DataCenter3DPlannerProps) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        castShadow
        intensity={1.2}
        position={[9, 12, 8]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight intensity={0.4} position={[-8, 6, -8]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <gridHelper args={[18, 18, "#315184", "#1b2a45"]} position={[0, 0.02, 0]} />

      <mesh position={[0, 0.2, -8.7]}>
        <boxGeometry args={[18, 0.4, 0.25]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[-8.7, 0.2, 0]}>
        <boxGeometry args={[0.25, 0.4, 18]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {racks.map((rack) => (
        <CabinetBlock
          key={rack.id}
          rack={rack}
          isSelected={rack.id === selectedRackId}
          onSelect={onSelectRack}
        />
      ))}
    </>
  );
}

export function DataCenter3DPlanner(props: DataCenter3DPlannerProps) {
  return (
    <div className="h-[420px] overflow-hidden rounded-[24px] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(217_56%_16%),hsl(222_42%_10%)_70%)]">
      <Canvas
        shadows
        camera={{ position: [8, 8, 8], fov: 42 }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <PlannerScene {...props} />
          <OrbitControls
            makeDefault
            enablePan
            enableZoom
            minDistance={6}
            maxDistance={18}
            maxPolarAngle={Math.PI / 2.1}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
