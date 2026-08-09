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
  kind:
    | "l10"
    | "power-shelf"
    | "switch-tray"
    | "cdu"
    | "tor-switch"
    | "cable-management";
  name: string;
  rackUnitStart: number;
  rackUnitSpan: number;
  sourceDeviceId: string | null;
  health: RackDeviceHealth;
  model: string;
  role: string;
  assetTag: string;
  powerKw?: number;
  temperatureC?: number;
  utilizationPercent?: number;
}

interface EquipmentPartProps {
  equipment: Gb300EquipmentSelection;
  width: number;
  depth: number;
  selected: boolean;
  lowDetail: boolean;
  onSelect: (equipment: Gb300EquipmentSelection) => void;
}

function getEquipmentHeight(equipment: Gb300EquipmentSelection) {
  return Math.max(
    0.012,
    equipment.rackUnitSpan * RACK_UNIT_HEIGHT_METERS - 0.0015,
  );
}

function Led({
  color,
  position,
  radius = 0.004,
}: {
  color: string;
  position: [number, number, number];
  radius?: number;
}) {
  const isOff = color === "#111827" || color === "#1f2937";
  return (
    <mesh position={position}>
      <sphereGeometry args={[radius, 10, 8]} />
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
  color = "#020617",
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  color?: string;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, 0.009]} />
        <meshStandardMaterial color={color} metalness={0.2} roughness={0.68} />
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
              position={[
                Math.cos(index * 1.256) * radius * 0.45,
                0.009,
                Math.sin(index * 1.256) * radius * 0.45,
              ]}
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

function EquipmentChassis({
  width,
  height,
  depth,
  selected,
  color,
}: {
  width: number;
  height: number;
  depth: number;
  selected: boolean;
  color: string;
}) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={selected ? "#173348" : color}
        emissive={selected ? "#22d3ee" : "#000000"}
        emissiveIntensity={selected ? 0.22 : 0}
        metalness={0.72}
        roughness={0.36}
      />
    </mesh>
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
  return (
    <mesh
      position={[0, 0, depth * 0.08]}
      onClick={handleClick}
      onPointerDown={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "default";
      }}
    >
      <boxGeometry args={[width + 0.025, height + 0.006, depth + 0.025]} />
      <meshBasicMaterial
        color="#67e8f9"
        transparent
        opacity={selected ? 0.09 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}

function CommonHitTarget(props: EquipmentPartProps & { height: number }) {
  return (
    <EquipmentHitTarget
      width={props.width}
      height={props.height}
      depth={props.depth}
      selected={props.selected}
      equipment={props.equipment}
      onSelect={props.onSelect}
    />
  );
}

const PowerShelf3D = memo(function PowerShelf3D(props: EquipmentPartProps) {
  const { equipment, width, depth, selected, lowDetail } = props;
  const height = getEquipmentHeight(equipment);
  const leds = getGb300LedState("power-shelf", equipment.health);
  const serviceWidth = width * 0.17;
  const moduleGap = 0.006;
  const moduleFieldWidth = width - serviceWidth - 0.03;
  const moduleWidth = (moduleFieldWidth - moduleGap * 3) / 4;
  const startX = -width / 2 + serviceWidth + 0.02 + moduleWidth / 2;
  const frontZ = depth / 2 + 0.008;

  return (
    <group name={equipment.id}>
      <EquipmentChassis
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        color="#151c24"
      />
      <mesh position={[-width / 2 + serviceWidth / 2 + 0.008, 0, frontZ]}>
        <boxGeometry args={[serviceWidth, height * 0.82, 0.018]} />
        <meshStandardMaterial color="#202a35" metalness={0.68} roughness={0.4} />
      </mesh>
      <Led color={leds.pmc} position={[-width / 2 + 0.025, height * 0.2, frontZ + 0.014]} />
      <Led color={leds.rj45Link} position={[-width / 2 + 0.043, height * 0.2, frontZ + 0.014]} />
      <Port
        position={[-width / 2 + serviceWidth / 2 + 0.008, -height * 0.17, frontZ + 0.014]}
        width={0.032}
      />
      {Array.from({ length: 4 }, (_, index) => {
        const x = startX + index * (moduleWidth + moduleGap);
        return (
          <group key={index} position={[x, 0, frontZ]}>
            <mesh>
              <boxGeometry args={[moduleWidth, height * 0.84, 0.02]} />
              <meshStandardMaterial color="#2b3440" metalness={0.68} roughness={0.4} />
            </mesh>
            <Fan
              position={[-moduleWidth * 0.1, 0, 0.017]}
              radius={Math.min(moduleWidth * 0.2, height * 0.24)}
              lowDetail={lowDetail}
            />
            <Led
              color={leds.psu[index]}
              position={[moduleWidth * 0.34, height * 0.27, 0.018]}
            />
          </group>
        );
      })}
      <CommonHitTarget {...props} height={height} />
    </group>
  );
});

const SwitchTray3D = memo(function SwitchTray3D(props: EquipmentPartProps) {
  const { equipment, width, depth, selected, lowDetail } = props;
  const height = getEquipmentHeight(equipment);
  const leds = getGb300LedState("switch-tray", equipment.health);
  const frontZ = depth / 2 + 0.008;

  return (
    <group name={equipment.id}>
      <EquipmentChassis
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        color="#10151c"
      />
      <mesh position={[0, 0, frontZ]}>
        <boxGeometry args={[width * 0.97, height * 0.8, 0.018]} />
        <meshStandardMaterial color="#1a222c" metalness={0.72} roughness={0.4} />
      </mesh>
      <Led color={leds.pwr} position={[-width * 0.44, height * 0.18, frontZ + 0.015]} />
      <Led color={leds.fault} position={[-width * 0.41, height * 0.18, frontZ + 0.015]} />
      {leds.nvl.map((color, index) => (
        <Led
          key={index}
          color={color}
          position={[-width * 0.33 + index * 0.021, height * 0.18, frontZ + 0.015]}
        />
      ))}
      <Port position={[-width * 0.43, -height * 0.18, frontZ + 0.014]} width={0.032} />
      {Array.from({ length: lowDetail ? 4 : 8 }, (_, index) => (
        <group key={index}>
          <Port
            position={[-width * 0.24 + index * width * 0.065, -height * 0.08, frontZ + 0.014]}
            width={width * 0.047}
            height={height * 0.28}
          />
          <Led
            color={index % 2 ? leds.rj45Activity : leds.rj45Link}
            position={[-width * 0.24 + index * width * 0.065, height * 0.21, frontZ + 0.017]}
            radius={0.003}
          />
        </group>
      ))}
      <CommonHitTarget {...props} height={height} />
    </group>
  );
});

const TorSwitch3D = memo(function TorSwitch3D(props: EquipmentPartProps) {
  const { equipment, width, depth, selected, lowDetail } = props;
  const height = getEquipmentHeight(equipment);
  const leds = getGb300LedState("tor-switch", equipment.health);
  const frontZ = depth / 2 + 0.008;
  const portCount = lowDetail ? 16 : 24;

  return (
    <group name={equipment.id}>
      <EquipmentChassis
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        color="#45423b"
      />
      <mesh position={[0, 0, frontZ]}>
        <boxGeometry args={[width * 0.97, height * 0.82, 0.018]} />
        <meshStandardMaterial color="#746f61" metalness={0.65} roughness={0.4} />
      </mesh>
      {Array.from({ length: portCount }, (_, index) => {
        const columns = portCount / 2;
        const row = index < columns ? 0 : 1;
        const column = index % columns;
        return (
          <Port
            key={index}
            position={[
              -width * 0.42 + column * (width * 0.055),
              row === 0 ? height * 0.17 : -height * 0.17,
              frontZ + 0.014,
            ]}
            width={width * 0.04}
            height={height * 0.22}
          />
        );
      })}
      {Array.from({ length: 4 }, (_, index) => (
        <Port
          key={`uplink-${index}`}
          position={[
            width * 0.23 + index * width * 0.07,
            0,
            frontZ + 0.014,
          ]}
          width={width * 0.052}
          height={height * 0.38}
          color="#171717"
        />
      ))}
      <Led color={leds.pwr} position={[width * 0.43, height * 0.18, frontZ + 0.017]} />
      <Led color={leds.rj45Activity} position={[width * 0.43, 0, frontZ + 0.017]} />
      <Led color={leds.fault} position={[width * 0.43, -height * 0.18, frontZ + 0.017]} />
      <CommonHitTarget {...props} height={height} />
    </group>
  );
});

const CableManagement3D = memo(function CableManagement3D(props: EquipmentPartProps) {
  const { equipment, width, depth, selected } = props;
  const height = getEquipmentHeight(equipment);
  const frontZ = depth / 2 + 0.01;

  return (
    <group name={equipment.id}>
      <EquipmentChassis
        width={width}
        height={height}
        depth={depth * 0.42}
        selected={selected}
        color="#111820"
      />
      <mesh position={[0, 0, frontZ - depth * 0.28]}>
        <boxGeometry args={[width * 0.97, height * 0.74, 0.026]} />
        <meshStandardMaterial color="#0b1118" metalness={0.6} roughness={0.5} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh
          key={index}
          position={[
            -width * 0.38 + index * width * 0.11,
            0,
            frontZ - depth * 0.26,
          ]}
        >
          <torusGeometry args={[height * 0.18, 0.003, 6, 12]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.42} />
        </mesh>
      ))}
      <CommonHitTarget {...props} height={height} />
    </group>
  );
});

const RackCdu3D = memo(function RackCdu3D(props: EquipmentPartProps) {
  const { equipment, width, depth, selected, lowDetail } = props;
  const height = getEquipmentHeight(equipment);
  const leds = getGb300LedState("cdu", equipment.health);
  const frontZ = depth / 2 + 0.009;

  return (
    <group name={equipment.id}>
      <EquipmentChassis
        width={width}
        height={height}
        depth={depth}
        selected={selected}
        color="#151b22"
      />
      <mesh position={[-width * 0.18, 0, frontZ]}>
        <boxGeometry args={[width * 0.46, height * 0.7, 0.018]} />
        <meshStandardMaterial color="#0f1720" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[-width * 0.18, 0, frontZ + 0.012]}>
        <boxGeometry args={[width * 0.24, height * 0.34, 0.008]} />
        <meshStandardMaterial
          color="#083344"
          emissive="#22d3ee"
          emissiveIntensity={equipment.health === "offline" ? 0 : 0.55}
          roughness={0.3}
        />
      </mesh>
      <Fan
        position={[width * 0.27, 0, frontZ + 0.006]}
        radius={Math.min(height * 0.22, width * 0.095)}
        lowDetail={lowDetail}
      />
      <Led color={leds.pwr} position={[-width * 0.4, height * 0.29, frontZ + 0.016]} />
      <CommonHitTarget {...props} height={height} />
    </group>
  );
});

export const GB300RackEquipment3D = memo(function GB300RackEquipment3D({
  rack,
  rackDimensions,
  l10Dimensions,
  l10RackUnits,
  selectedEquipmentId,
  lowDetail,
  onSelectEquipment,
}: {
  rack: RackPlan;
  rackDimensions: ImportedStepDimensions;
  l10Dimensions: ImportedStepDimensions;
  l10RackUnits: number;
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
    l10Dimensions,
    l10RackUnits,
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
          <group key={item.id} position={[0, centerY, centerZ]}>
            {item.kind === "power-shelf" ? (
              <PowerShelf3D {...commonProps} />
            ) : item.kind === "switch-tray" ? (
              <SwitchTray3D {...commonProps} />
            ) : item.kind === "tor-switch" ? (
              <TorSwitch3D {...commonProps} />
            ) : item.kind === "cable-management" ? (
              <CableManagement3D {...commonProps} />
            ) : (
              <RackCdu3D {...commonProps} />
            )}
          </group>
        );
      })}
    </group>
  );
});
