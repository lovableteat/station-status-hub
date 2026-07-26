export interface PcbBoard {
  width: number;
  height: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  background: string;
}

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
  source: "built-in" | "custom" | "bom";
  createdAt: string;
}

export interface PcbPlacedComponent extends PcbLibraryComponent {
  instanceId: string;
  reference: string;
  x: number;
  y: number;
  rotation: number;
  layer: "top" | "bottom";
  locked: boolean;
}

export interface PcbKeepout {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
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
  code: "BOARD_BOUNDARY" | "COMPONENT_COLLISION" | "KEEPOUT_COLLISION";
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

export type PcbTool = "select" | "pan" | "measure" | "keepout";

export interface PcbSaveState {
  projects: PcbProject[];
  templates: PcbTemplate[];
  library: PcbLibraryComponent[];
  activeProjectId: string | null;
  updatedAt: string;
}
