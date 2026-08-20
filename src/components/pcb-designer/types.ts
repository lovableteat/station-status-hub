export interface PcbBoardLayerColors {
  top: string;
  bottom: string;
}

export interface PcbBoard {
  width: number;
  height: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  background: string;
  layerColors: PcbBoardLayerColors;
}

export type PcbComponentShape = "rectangle" | "circle";

export interface PcbLibraryComponent {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  partNumber: string;
  width: number;
  height: number;
  maxHeight: number;
  color: string;
  shape?: PcbComponentShape;
  source: "built-in" | "custom" | "bom";
  createdAt: string;
}

export type PcbVisibleLayer = "all" | "top" | "bottom";

export interface PcbModelAssetDimensions {
  widthMm: number;
  depthMm: number;
  heightMm: number;
}

export type PcbModelUpAxis = "x" | "y" | "z";

export interface PcbModelAssetBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface PcbModelAssetPartMetadata {
  id: string;
  name: string;
  color?: [number, number, number];
  vertexCount: number;
  indexCount: number;
}

export interface PcbModelAssetPart {
  id: string;
  position: number[];
  normal?: number[];
  index: number[];
}

export interface PcbModelAssetMetadata {
  schemaVersion: 1;
  id: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  dimensions: PcbModelAssetDimensions;
  calibratedDimensions: PcbModelAssetDimensions;
  upAxis: PcbModelUpAxis;
  bounds: PcbModelAssetBounds;
  parts: PcbModelAssetPartMetadata[];
}

export interface PcbModelAsset {
  metadata: PcbModelAssetMetadata;
  parts: PcbModelAssetPart[];
}

export interface PcbPlacedComponent extends PcbLibraryComponent {
  instanceId: string;
  reference: string;
  x: number;
  y: number;
  rotation: number;
  layer: "top" | "bottom";
  locked: boolean;
  modelAssetId?: string;
}

export interface PcbKeepout {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  rotation?: number;
}

export interface PcbMeasurement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface PcbProject {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  status: "draft" | "review" | "approved";
  board: PcbBoard;
  components: PcbPlacedComponent[];
  keepouts: PcbKeepout[];
  measurements: PcbMeasurement[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface PcbDrcIssue {
  id: string;
  code: "OUT_OF_BOUNDS" | "COMPONENT_COLLISION" | "KEEPOUT_COLLISION";
  severity: "error" | "warning";
  rule: string;
  message: string;
  objectIds: string[];
}

export interface PcbTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  project: PcbProject;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PcbPendingPlacement {
  name: string;
  type: string;
  manufacturer: string;
  partNumber: string;
  width: number;
  height: number;
  maxHeight: number;
  color: string;
  shape?: PcbComponentShape;
  quantity: number;
  reference: string;
}

export type PcbTool = "select" | "pan" | "measure" | "keepout";

export type PcbSelection =
  | { kind: "component"; id: string }
  | { kind: "keepout"; id: string }
  | { kind: "measurement"; id: string };

export interface PcbPoint {
  x: number;
  y: number;
}

export interface PcbSaveState {
  projects: PcbProject[];
  templates: PcbTemplate[];
  library: PcbLibraryComponent[];
  activeProjectId: string | null;
  modelAssets?: Record<string, PcbModelAssetMetadata>;
  pendingPlacementsByProject?: Record<string, PcbPendingPlacement[]>;
  remoteDeletions?: {
    projects: string[];
    templates: string[];
    library: string[];
  };
  updatedAt: string;
}
