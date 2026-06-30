export type RackStatus = "allocated" | "reserved" | "available" | "blocked";

export interface RackPlan {
  id: string;
  zone: string;
  row: string;
  cabinet: string;
  status: RackStatus;
  powerKw: number;
  coolingKw: number;
  uplinks: number;
  owner: string;
  positionX: number;
  positionZ: number;
  rotation: number;
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
  racks: RackPlan[];
  checklist: ChecklistItem[];
}
