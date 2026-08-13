import type {
  PcbDrcIssue,
  PcbLibraryComponent,
  PcbPoint,
  PcbProject,
  PcbModelAssetMetadata,
  PcbSaveState,
  PcbSelection,
  PcbVisibleLayer,
  PcbTool,
} from "../types.ts";
import type { HistoryState } from "./history.ts";
import type {
  ImportedBomItem,
  ImportedComponent,
  PendingPlacement,
} from "./tabular.ts";

export interface NewProjectInput {
  name: string;
  description?: string;
  width?: number;
  height?: number;
}

export interface TemplateInput {
  name: string;
  category: string;
  description: string;
}

export interface SelectionSnapshot {
  selection: PcbSelection | null;
  selectedObjects: string[];
}

export interface PcbWorkspaceState {
  data: PcbSaveState;
  activeProject: PcbProject;
  historyByProject: Record<string, HistoryState<PcbProject>>;
  pendingHistoryByProject: Record<string, HistoryState<PendingPlacement[]>>;
  selectionHistoryByProject: Record<string, HistoryState<SelectionSnapshot>>;
  drcIssues: PcbDrcIssue[];
  pendingPlacements: PendingPlacement[];
  canEdit: boolean;
  documentLocked: boolean;
  tool: PcbTool;
  activeLayer: "top" | "bottom";
  visibleLayer: PcbVisibleLayer;
  selectedObjects: string[];
  zoom: number;
  viewCenter: PcbPoint;
  selection: PcbSelection | null;
  rightTab: "board" | "selection" | "drc";
  canUndo: boolean;
  canRedo: boolean;
}

export type PcbWorkspaceAction =
  | { type: "project/create"; input: NewProjectInput }
  | { type: "project/open"; projectId: string }
  | { type: "project/rename"; projectId: string; name: string }
  | { type: "project/duplicate"; projectId: string }
  | { type: "project/delete"; projectId: string }
  | { type: "project/import"; project: PcbProject }
  | { type: "project/commit"; update: PcbProject }
  | { type: "model/assign"; componentId: string; metadata: PcbModelAssetMetadata }
  | { type: "project/commit-with-bom"; update: PcbProject; pendingPlacements: PendingPlacement[] }
  | { type: "template/apply"; templateId: string }
  | { type: "template/save"; input: TemplateInput }
  | { type: "template/rename"; templateId: string; name: string }
  | { type: "template/duplicate"; templateId: string }
  | { type: "template/delete"; templateId: string }
  | { type: "library/create"; component: ImportedComponent }
  | { type: "library/edit"; componentId: string; component: ImportedComponent }
  | { type: "library/duplicate"; componentId: string }
  | { type: "library/delete"; componentId: string }
  | { type: "library/import"; components: ImportedComponent[] }
  | { type: "bom/import"; items: ImportedBomItem[] }
  | { type: "bom/remove"; index: number }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | { type: "document/toggle-lock" }
  | { type: "tool/set"; tool: PcbTool }
  | { type: "layer/set"; layer: "top" | "bottom" }
  | { type: "view/layer"; layer: PcbVisibleLayer }
  | { type: "zoom/set"; zoom: number }
  | { type: "view/center"; center: PcbPoint }
  | { type: "view/reset" }
  | { type: "selection/set"; selection: PcbSelection | null }
  | { type: "selection/set-many"; objectIds: string[]; additive?: boolean }
  | { type: "selection/toggle"; objectId: string }
  | { type: "selection/duplicate"; objectIds?: string[] }
  | { type: "selection/clear-group" }
  | { type: "panel/right"; tab: PcbWorkspaceState["rightTab"] }
  | { type: "permission/set"; canEdit: boolean }
  | { type: "persistence/hydrate"; data: PcbSaveState }
  | { type: "persistence/touch" }
  | { type: "drc/run" };

export type { ImportedComponent, PcbLibraryComponent };
