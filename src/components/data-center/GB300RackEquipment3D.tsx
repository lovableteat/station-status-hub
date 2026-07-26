import { memo, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";

import type {
  ImportedStepDimensions,
  RackDeviceHealth,
  RackPlan,
} from "./dataCenterTypes";
import {
  getGb300EquipmentMountLayout,
  getGb300LedState,
  resolveGb300RackEquipment,
} from "./gb300RackEquipment.mjs";
import { RACK_UNIT_HEIGHT_METERS } from "./rackMount.mjs";

export interface Gb300EquipmentSelection {
  id: string;
  kind: "power-shelf" | "switch-tray" | "cdu";
  name: string;
  rackUnitStart: number;
  rackUnitSpan: number;
  sourceDeviceId: string | null;
  health: RackDeviceHealth;
  model: string;
  role: string;
  assetTag: string;
}

interface EquipmentPartProps {
  equipment: Gb300EquipmentSelection;
  width: number;
  depth: number;
  selected: boolean;
  lowDetail: boolean;
  onSelect: (equipment: Gb300EquipmentSelection) => void;
}

function Led({ color, position }: { color: string; position: [number, number, number] }) {
  const isOff = color === "#111827" || color === "#1f2937";
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.006, 10, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isOff ? 0.05 : 2.8}
        roughness={0.28}
      />
    </mesh>
  );
}

function Port({
  position,
  width = 0.025,
  height = 0.018,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, 0.009]} />
        <meshStandardMaterial color="#020617" metalness={0.2} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <boxGeometry args={[width * 0.62, height * 0.48, 0.003]} />
        <meshStandardMaterial color="#334155" metalness={0.72} roughness={0.38} />
      </mesh>
    </group>
  );
}

function Fan({
  position,
  radius,
  lowDetail,
}: {
  position: [number, number, number];
  radius: number;
  lowDetail: boolean;
}) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[radius, radius, 0.012, lowDetail ? 12 : 24]} />
        <meshStandardMaterial color="#111827" metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.007, 0]}>
        <cylinderGeometry args={[radius * 0.23, radius * 0.23, 0.015, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.72} roughness={0.36} />
      </mesh>
      {!lowDetail
        ? Array.from({ length: 5 }, (_, index) => (
            <mesh
              key={index}
              position={[Math.cos(index * 1.256) * radius * 0.45, 0.009, Math.sin(index * 1.256) * radius * 0.45]}
              rotation={[0, -index * 1.256, 0]}
            >
              <boxGeometry args={[radius * 0.55, 0.006, radius * 0.18]} />
              <meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.44} />
            </mesh>
          ))
        : null}
    </group>
  );
}

function EquipmentHitTarget({
  width,
  height,
  depth,
  selected,
  equipment,
  onSelect,
}: {
  width: number;
  height: number;
  depth: number;
  selected: boolean;
  equipment: Gb300EquipmentSelection;
  onSelect: (equipment: Gb300EquipmentSelection) => void;
}) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(equipment);
  };
  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "default";
  };

  return (
    <mesh
      position={[0, 0, depth * 0.08]}
      onClick={handleClick}
      onPointerDown={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <boxGeometry args={[width + 0.025, height + 0.012, depth + 0.025]} />
      <meshBasicMaterial
        color="#67e8f9"
        transparent
        opacity={selected ? 0.09 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}

const PowerShelf3D = memo(function PowerShelf3D({
  equipment,
  width,
  depth,
  selected,
  lowDetail,
  onSelect,
}: EquipmentPartProps) {
  const height = equipment.rackUnitSpan * RACK_UNIT_HEIGHT_METERS * 0.94;
  const leds = getGb300LedState("power-shelf", equipment.health);
  const serviceWidth = width * 0.19;
  const psuFieldWidth = width - serviceWidth - 0.035;
  const psuWidth = psuFieldWidth / 6 - 0.006;
  const startX = -width / 2 + serviceWidth + psuWidth / 2 + 0.022;
  const frontZ = depth / 2 + 0.008;

  return (
    <group name={equipment.id}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={selected ? "#173348" : "#151c24"}
          emissive={selected ? "#22d3ee" : "#000000"}
          emissiveIntensity={selected ? 0.22 : 0}
          metalness={0.72}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[-width / 2 + serviceWidth / 2 + 0.01, 0, frontZ]}>
        <boxGeometry args={[serviceWidth, height * 0.78, 0.018]} />
        <meshStandardMaterial color="#202a35" metalness={0.68} roughness={0.4} />
      </mesh>
      <Led color={leds.pmc} position={[-width / 2 + 0.028, height * 0.22, frontZ + 0.014]} />
      <Led color={leds.rj45Link} position={[-width / 2 + 0.047, height * 0.22, frontZ + 0.014]} />
      <Port position={[-width / 2 + serviceWidth / 2 + 0.008, -height * 0.15, frontZ + 0.014]} width={0.032} />
      {Array.from({ length: 6 }, (_, index) => {
        const x = startX + index * (psuWidth + 0.006);
        return (
          <group key={index} position={[x, 0, frontZ]}>
            <mesh>
              <boxGeometry args={[psuWidth, height * 0.82, 0.02]} />
              <meshStandardMaterial color="#27313c" metalness={0.68} roughness={0.4} />
            </mesh>
            <Fan
              position={[0, 0, 0.017]}
              radius={Math.min(psuWidth * 0.3, height * 0.22)}
              lowDetail={lowDetail}
            />
            <Led color={leds.psu[index]} position={[psuWidth * 0.3, height * 0.3, 0.018]} />
          </group>
        );
      })}
      <EquipmentHitTarget
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        equipment={equipment}
        onSelect={onSelect}
      />
    </group>
  );
});

const SwitchTrayBank3D = memo(function SwitchTrayBank3D({
  equipment,
  width,
  depth,
  selected,
  lowDetail,
  onSelect,
}: EquipmentPartProps) {
  const height = equipment.rackUnitSpan * RACK_UNIT_HEIGHT_METERS * 0.97;
  const rowCount = lowDetail ? 3 : 4;
  const rowHeight = height / rowCount - 0.008;
  const leds = getGb300LedState("switch-tray", equipment.health);
  const frontZ = depth / 2 + 0.008;

  return (
    <group name={equipment.id}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={selected ? "#173348" : "#101821"}
          emissive={selected ? "#22d3ee" : "#000000"}
          emissiveIntensity={selected ? 0.2 : 0}
          metalness={0.7}
          roughness={0.36}
        />
      </mesh>
      {Array.from({ length: rowCount }, (_, rowIndex) => {
        const rowY = height / 2 - rowHeight / 2 - rowIndex * (rowHeight + 0.008) - 0.004;
        return (
          <group key={rowIndex} position={[0, rowY, frontZ]}>
            <mesh>
              <boxGeometry args={[width * 0.96, rowHeight, 0.018]} />
              <meshStandardMaterial color="#1e2935" metalness={0.66} roughness={0.42} />
            </mesh>
            <Led color={leds.pwr} position={[-width * 0.42, rowHeight * 0.22, 0.016]} />
            <Led color={leds.fault} position={[-width * 0.38, rowHeight * 0.22, 0.016]} />
            {leds.nvl.map((color, index) => (
              <Led
                key={index}
                color={color}
                position={[-width * 0.3 + index * 0.021, rowHeight * 0.22, 0.016]}
              />
            ))}
            <Port position={[-width * 0.4, -rowHeight * 0.2, 0.014]} />
            {(lowDetail ? [0, 1] : [0, 1, 2, 3]).map((portIndex) => (
              <group key={portIndex}>
                <Port
                  position={[-width * 0.15 + portIndex * 0.075, -rowHeight * 0.12, 0.014]}
                  width={0.045}
                  height={0.022}
                />
                <Led
                  color={leds.rj45Link}
                  position={[-width * 0.165 + portIndex * 0.075, rowHeight * 0.18, 0.017]}
                />
                <Led
                  color={leds.rj45Activity}
                  position={[-width * 0.135 + portIndex * 0.075, rowHeight * 0.18, 0.017]}
                />
              </group>
            ))}
          </group>
        );
      })}
      <EquipmentHitTarget
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        equipment={equipment}
        onSelect={onSelect}
      />
    </group>
  );
});

const RackCdu3D = memo(function RackCdu3D({
  equipment,
  width,
  depth,
  selected,
  lowDetail,
  onSelect,
}: EquipmentPartProps) {
  const height = equipment.rackUnitSpan * RACK_UNIT_HEIGHT_METERS * 1.18;
  const leds = getGb300LedState("cdu", equipment.health);
  const frontZ = depth / 2 + 0.009;

  return (
    <group name={equipment.id}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={selected ? "#173348" : "#151b22"}
          emissive={selected ? "#22d3ee" : "#000000"}
          emissiveIntensity={selected ? 0.22 : 0}
          metalness={0.68}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[-width * 0.17, 0, frontZ]}>
        <boxGeometry args={[width * 0.42, height * 0.7, 0.018]} />
        <meshStandardMaterial color="#0f1720" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[-width * 0.17, 0, frontZ + 0.012]}>
        <boxGeometry args={[width * 0.22, height * 0.34, 0.008]} />
        <meshStandardMaterial
          color="#083344"
          emissive="#22d3ee"
          emissiveIntensity={equipment.health === "offline" ? 0 : 0.55}
          roughness={0.3}
        />
      </mesh>
      <Fan
        position={[width * 0.27, 0, frontZ + 0.006]}
        radius={Math.min(height * 0.27, width * 0.09)}
        lowDetail={lowDetail}
      />
      <Led color={leds.pwr} position={[-width * 0.38, height * 0.28, frontZ + 0.016]} />
      <EquipmentHitTarget
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        equipment={equipment}
        onSelect={onSelect}
      />
    </group>
  );
});

export const GB300RackEquipment3D = memo(function GB300RackEquipment3D({
  rack,
  rackDimensions,
  selectedEquipmentId,
  lowDetail,
  onSelectEquipment,
}: {
  rack: RackPlan;
  rackDimensions: ImportedStepDimensions;
  selectedEquipmentId: string | null;
  lowDetail: boolean;
  onSelectEquipment: (equipment: Gb300EquipmentSelection) => void;
}) {
  const equipment = useMemo(
    () => resolveGb300RackEquipment(rack.devices) as Gb300EquipmentSelection[],
    [rack.devices],
  );
  const { railBottom, width, depth, centerZ } = getGb300EquipmentMountLayout({
    rackDimensions,
    capacityU: rack.capacityU,
  });

  return (
    <group name={`${rack.id}-gb300-rack-equipment`}>
      {equipment.map((item) => {
        const centerY =
          railBottom
          + (item.rackUnitStart - 1) * RACK_UNIT_HEIGHT_METERS
          + (item.rackUnitSpan * RACK_UNIT_HEIGHT_METERS) / 2;
        const commonProps: EquipmentPartProps = {
          equipment: item,
          width,
          depth,
          selected: selectedEquipmentId === item.id,
          lowDetail,
          onSelect: onSelectEquipment,
        };

        return (
          <group
            key={item.id}
            position={[0, centerY, centerZ]}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectEquipment(item);
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "default";
            }}
          >
            {item.kind === "power-shelf" ? (
              <PowerShelf3D {...commonProps} />
            ) : item.kind === "switch-tray" ? (
              <SwitchTrayBank3D {...commonProps} />
            ) : (
              <RackCdu3D {...commonProps} />
            )}
          </group>
        );
      })}
    </group>
  );
});
