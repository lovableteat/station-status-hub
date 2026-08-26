import type { ReactNode } from "react";

import type { TrackerLinkedIssue } from "../../testTrackerPresentation";

export interface TrackerSystem {
  assigned_engineer?: string | null;
  current_station?: string | null;
  id: string;
  overall_progress?: number | null;
  serial_number?: string | null;
  status?: string | null;
  system_name: string;
}

export interface TrackerStation {
  id: string;
  station_name: string;
  station_order: number;
}

export interface TrackerItem {
  id: string;
  station_id: string;
}

export interface TrackerProgress {
  item_id: string;
  station_id: string;
  status?: string | null;
  system_id: string;
}

export interface TestProgressTableProps {
  columnStorageKey: string;
  headerControls?: ReactNode;
  items: TrackerItem[];
  linkedIssues: TrackerLinkedIssue[];
  onCloneSystem: (system: TrackerSystem) => void;
  onEditSystemData: (systemId: string) => void;
  onSelectStation: (systemId: string, stationId: string) => void;
  onSelectSystem: (systemId: string) => void;
  onSystemUpdate: () => void;
  progress: TrackerProgress[];
  stations: TrackerStation[];
  systems: TrackerSystem[];
}
