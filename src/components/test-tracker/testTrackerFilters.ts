export type TrackerSort =
  | "machine-asc"
  | "machine-desc"
  | "created-desc"
  | "created-asc";

export type TrackerStatus = "未開始" | "進行中" | "已完成";

export interface TrackerSystemLike {
  assigned_engineer?: string | null;
  created_at?: string | null;
  current_station?: string | null;
  flow_version_id?: string | null;
  id: string;
  overall_progress?: number | null;
  serial_number?: string | null;
  status?: string | null;
  system_name: string;
}

export interface TrackerStationLike {
  id: string;
  station_name: string;
  station_order?: number | null;
}

export interface TrackerItemLike {
  id: string;
  station_id: string;
}

export interface TrackerProgressLike {
  completed_at?: string | null;
  id?: string;
  item_id: string;
  started_at?: string | null;
  status?: string | null;
  system_id: string;
  updated_at?: string | null;
}

export interface TrackerFilterOptions {
  engineer?: string;
  excludeCompleted?: boolean;
  flowVersionId?: string | null;
  search?: string;
  sort?: TrackerSort;
  station?: string;
  status?: "all" | TrackerStatus;
  system?: string;
}

export interface TrackerAutoFilters {
  excludeCompleted: boolean;
  station: string;
  system: string;
}

export interface TrackerBoardLane<TSystem extends TrackerSystemLike> {
  id: string;
  label: string;
  stationId: string | null;
  systems: TSystem[];
}

const machineCollator = new Intl.Collator("zh-Hant", {
  numeric: true,
  sensitivity: "base",
});

function normalizeStationName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeTrackerSystemStatus(system: TrackerSystemLike): TrackerStatus {
  if (
    system.status === "Done" ||
    system.status === "已完成" ||
    system.current_station === "已完成" ||
    system.overall_progress === 100
  ) {
    return "已完成";
  }
  if (
    system.status === "On-going" ||
    system.status === "進行中" ||
    system.status === "Error" ||
    system.status === "異常" ||
    (system.overall_progress ?? 0) > 0
  ) {
    return "進行中";
  }
  return "未開始";
}

export function parseTrackerAutoFilters(params: URLSearchParams): TrackerAutoFilters {
  return {
    excludeCompleted: params.get("excludeStatus") === "completed",
    station: params.get("station") ?? "",
    system: params.get("system") ?? "",
  };
}

function parseCreatedAt(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function progressTimestamp(progress: TrackerProgressLike) {
  return Math.max(
    parseCreatedAt(progress.updated_at),
    parseCreatedAt(progress.completed_at),
    parseCreatedAt(progress.started_at),
  );
}

export function createStationIncompleteSystemIds<TSystem extends TrackerSystemLike>(
  systems: readonly TSystem[],
  stationId: string,
  items: readonly TrackerItemLike[],
  progress: readonly TrackerProgressLike[],
) {
  const stationItems = items.filter((item) => item.station_id === stationId);
  if (!stationItems.length) return new Set<string>();

  const stationItemIds = new Set(stationItems.map((item) => item.id));
  const latestProgress = new Map<string, TrackerProgressLike>();
  progress.forEach((entry) => {
    if (!stationItemIds.has(entry.item_id)) return;
    const key = `${entry.system_id}:${entry.item_id}`;
    const current = latestProgress.get(key);
    if (!current || progressTimestamp(entry) >= progressTimestamp(current)) {
      latestProgress.set(key, entry);
    }
  });

  return new Set(
    systems
      .filter((system) => stationItems.some(
        (item) => latestProgress.get(`${system.id}:${item.id}`)?.status !== "Done",
      ))
      .map((system) => system.id),
  );
}

export function filterAndSortTrackerSystems<TSystem extends TrackerSystemLike>(
  systems: readonly TSystem[],
  options: TrackerFilterOptions = {},
) {
  const keyword = options.search?.trim().toLocaleLowerCase("zh-Hant") ?? "";
  const engineer = options.engineer && options.engineer !== "all" ? options.engineer : "";
  const station = options.station && options.station !== "all"
    ? normalizeStationName(options.station)
    : "";
  const requestedSystem = options.system?.trim() ?? "";
  const sort = options.sort ?? "machine-asc";

  return systems
    .filter((system) => {
      const status = normalizeTrackerSystemStatus(system);
      const matchesKeyword =
        !keyword ||
        system.system_name.toLocaleLowerCase("zh-Hant").includes(keyword) ||
        system.serial_number?.toLocaleLowerCase("zh-Hant").includes(keyword) ||
        system.assigned_engineer?.toLocaleLowerCase("zh-Hant").includes(keyword) ||
        system.current_station?.toLocaleLowerCase("zh-Hant").includes(keyword);
      const matchesEngineer = !engineer || system.assigned_engineer === engineer;
      const matchesStation = !station || normalizeStationName(system.current_station) === station;
      const matchesStatus = !options.status || options.status === "all" || status === options.status;
      const matchesVersion =
        !options.flowVersionId ||
        !system.flow_version_id ||
        system.flow_version_id === options.flowVersionId;
      const matchesSystem =
        !requestedSystem ||
        system.id === requestedSystem ||
        system.system_name === requestedSystem;

      return (
        matchesKeyword &&
        matchesEngineer &&
        matchesStation &&
        matchesStatus &&
        matchesVersion &&
        matchesSystem &&
        (!options.excludeCompleted || status !== "已完成")
      );
    })
    .sort((left, right) => {
      let comparison = 0;
      if (sort === "machine-asc" || sort === "machine-desc") {
        comparison = machineCollator.compare(left.system_name, right.system_name);
        if (sort === "machine-desc") comparison *= -1;
      } else {
        comparison = parseCreatedAt(left.created_at) - parseCreatedAt(right.created_at);
        if (sort === "created-desc") comparison *= -1;
      }
      return comparison || machineCollator.compare(left.id, right.id);
    });
}

export function buildTrackerBoardLanes<TSystem extends TrackerSystemLike>(
  stations: readonly TrackerStationLike[],
  systems: readonly TSystem[],
): TrackerBoardLane<TSystem>[] {
  const sortedStations = [...stations].sort(
    (left, right) =>
      (left.station_order ?? 0) - (right.station_order ?? 0) ||
      machineCollator.compare(left.station_name, right.station_name),
  );
  const stationByName = new Map(
    sortedStations.map((station) => [normalizeStationName(station.station_name), station]),
  );
  const laneById = new Map<string, TrackerBoardLane<TSystem>>();
  const waitingLane: TrackerBoardLane<TSystem> = {
    id: "waiting",
    label: "待開始",
    stationId: null,
    systems: [],
  };
  const completedLane: TrackerBoardLane<TSystem> = {
    id: "completed",
    label: "已完成",
    stationId: null,
    systems: [],
  };
  const unmatchedLane: TrackerBoardLane<TSystem> = {
    id: "unmatched",
    label: "未對應站點",
    stationId: null,
    systems: [],
  };
  const stationLanes = sortedStations.map((station) => {
    const lane: TrackerBoardLane<TSystem> = {
      id: `station:${station.id}`,
      label: station.station_name,
      stationId: station.id,
      systems: [],
    };
    laneById.set(station.id, lane);
    return lane;
  });

  systems.forEach((system) => {
    const status = normalizeTrackerSystemStatus(system);
    if (status === "已完成") {
      completedLane.systems.push(system);
      return;
    }
    const station = system.current_station
      ? stationByName.get(normalizeStationName(system.current_station))
      : undefined;
    if (station) {
      laneById.get(station.id)?.systems.push(system);
      return;
    }
    if (!system.current_station || status === "未開始") {
      waitingLane.systems.push(system);
      return;
    }
    unmatchedLane.systems.push(system);
  });

  const lanes = [waitingLane, ...stationLanes, completedLane];
  if (unmatchedLane.systems.length) lanes.push(unmatchedLane);
  return lanes;
}
