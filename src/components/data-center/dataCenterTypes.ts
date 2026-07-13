export type RackStatus = "allocated" | "reserved" | "available" | "blocked";

export type RackDeviceType =
  | "compute-tray"
  | "switch-tray"
  | "tor-switch"
  | "psu"
  | "management"
  | "storage-tray";

export type RackDeviceHealth = "healthy" | "warning" | "critical" | "offline";

export type DeploymentStepStatus = "done" | "active" | "pending";

export type MaintenanceStatus = "open" | "in-progress" | "done";

export type DataCenterLayer = "overview" | "health" | "power" | "network" | "cooling";

export type CameraPreset = "overview" | "top" | "front" | "focus";

export type FacilityAisleKind = "cold" | "hot";

export type ModelUpAxis = "x" | "y" | "z";

export type DataCenterAssetKind = "rack" | "l10";

export interface RackDevice {
  id: string;
  name: string;
  type: RackDeviceType;
  health: RackDeviceHealth;
  slotStart: number;
  slotSpan: number;
  serial: string;
  assetTag: string;
  model: string;
  role: string;
  network: string;
  powerFeed: string;
  bmc: string;
  redfish: string;
  note: string;
}

export interface DeploymentStep {
  id: string;
  title: string;
  owner: string;
  status: DeploymentStepStatus;
}

export interface MaintenanceRecord {
  id: string;
  title: string;
  owner: string;
  status: MaintenanceStatus;
  updatedAt: string;
  detail: string;
}

export interface RackPlan {
  id: string;
  zone: string;
  row: string;
  cabinet: string;
  status: RackStatus;
  modelId: string;
  l10ModelId: string;
  l10Count: number;
  powerKw: number;
  coolingKw: number;
  temperatureC: number;
  utilizationPercent: number;
  uplinks: number;
  owner: string;
  positionX: number;
  positionZ: number;
  rotation: number;
  capacityU: number;
  coordinates: string;
  aisle: string;
  devices: RackDevice[];
  sop: string[];
  deploymentSteps: DeploymentStep[];
  maintenance: MaintenanceRecord[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface SitePlan {
  id: string;
  label: string;
  country: string;
  phase: string;
  targetDate: string;
  powerBudgetKw: number;
  coolingBudgetKw: number;
  networkReady: string;
  siteManager: string;
  racks: RackPlan[];
  checklist: ChecklistItem[];
}

export interface FacilityAislePlan {
  id: string;
  label: string;
  kind: FacilityAisleKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
}

export interface PowerFeedPlan {
  id: string;
  label: string;
  x: number;
  z: number;
  color: string;
  enabled: boolean;
}

export interface FacilityPlan {
  width: number;
  depth: number;
  wallHeight: number;
  showWalls: boolean;
  showGrid: boolean;
  aisles: FacilityAislePlan[];
  powerFeeds: PowerFeedPlan[];
}

export const DEFAULT_FACILITY_PLAN: FacilityPlan = {
  width: 18,
  depth: 13,
  wallHeight: 3.4,
  showWalls: true,
  showGrid: true,
  aisles: [
    { id: "cold-main", label: "冷通道 A", kind: "cold", x: 0, z: 0, width: 14.2, depth: 2.1, rotation: 0 },
    { id: "hot-a", label: "熱通道 A", kind: "hot", x: 0, z: -3.65, width: 14.2, depth: 1.15, rotation: 0 },
    { id: "hot-b", label: "熱通道 B", kind: "hot", x: 0, z: 3.65, width: 14.2, depth: 1.15, rotation: 0 },
  ],
  powerFeeds: [
    { id: "power-a", label: "PDU A", x: -7, z: -5.5, color: "#f59e0b", enabled: true },
    { id: "power-b", label: "PDU B", x: 7, z: 5.5, color: "#60a5fa", enabled: true },
  ],
};

export interface ImportedStepPart {
  id: string;
  name: string;
  color?: [number, number, number];
  position: Float32Array;
  normal?: Float32Array;
  index: Uint32Array;
}

export interface ImportedStepDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export interface ImportedStepBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ImportedStepModel {
  id: string;
  fileName: string;
  importedAt: string;
  sourceUnit: "millimeter";
  upAxis: ModelUpAxis;
  bounds: ImportedStepBounds;
  parts: ImportedStepPart[];
  dimensions: ImportedStepDimensions;
  calibratedDimensions: ImportedStepDimensions;
}

export interface RackModelDefinition {
  id: string;
  kind: DataCenterAssetKind;
  manufacturer: string;
  name: string;
  revision: string;
  source: "builtin-glb" | "uploaded-glb" | "step" | "procedural";
  dimensions: ImportedStepDimensions;
  upAxis: ModelUpAxis;
  assetUrl?: string;
  sourceFileName?: string;
  stepModel?: ImportedStepModel;
  rackUnits?: number;
  isPlaceholder?: boolean;
  isCalibrated: boolean;
}
