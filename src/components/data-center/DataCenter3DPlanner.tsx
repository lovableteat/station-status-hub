import { memo, Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type {
  ImportedStepModel,
  RackPlan,
  RackStatus,
} from "./dataCenterTypes";

interface DataCenter3DPlannerProps {
  racks: RackPlan[];
  selectedRackId: string;
  onSelectRack: (rackId: string) => void;
  importedModel?: ImportedStepModel | null;
}

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
  const frameGeometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.76, 2.12, 1.16)), []);
  const baseGeometry = useMemo(() => new THREE.BoxGeometry(0.94, 0.07, 1.3), []);

  useEffect(
    () => () => {
      frameGeometry.dispose();
      baseGeometry.dispose();
    },
    [baseGeometry, frameGeometry]
  );

  return (
    <group
      position={[rack.positionX, 1.08, rack.positionZ]}
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
        <boxGeometry args={[0.7, 2.06, 1.08]} />
        <meshStandardMaterial
          color={tone.fill}
          transparent
          opacity={isSelected ? 0.34 : 0.18}
          metalness={0.2}
          roughness={0.72}
        />
      </mesh>

      <lineSegments geometry={frameGeometry}>
        <lineBasicMaterial color={isSelected ? "#c7f9ff" : tone.frame} />
      </lineSegments>

      <mesh position={[0, 0, 0.52]}>
        <planeGeometry args={[0.64, 1.92]} />
        <meshStandardMaterial
          color={isSelected ? "#12243a" : "#09121f"}
          emissive={isSelected ? "#134a8d" : "#000000"}
          emissiveIntensity={isSelected ? 0.18 : 0}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
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
  return (
    <div className="h-[640px] overflow-hidden rounded-[30px] border border-cyan-300/12 bg-[radial-gradient(circle_at_top,hsl(210_60%_18%),hsl(223_48%_8%)_68%)] shadow-[0_28px_80px_-56px_hsl(197_92%_55%/0.48)]">
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
