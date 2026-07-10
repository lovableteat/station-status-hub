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

export type ModelUpAxis = "x" | "y" | "z";

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
  manufacturer: string;
  name: string;
  revision: string;
  source: "builtin-glb" | "uploaded-glb" | "step" | "procedural";
  dimensions: ImportedStepDimensions;
  upAxis: ModelUpAxis;
  assetUrl?: string;
  sourceFileName?: string;
  stepModel?: ImportedStepModel;
  isCalibrated: boolean;
}
