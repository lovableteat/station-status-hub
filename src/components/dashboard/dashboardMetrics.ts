export interface DashboardMetricSystem {
  id: string;
  actual_completed_at?: string | null;
  actual_started_at?: string | null;
  exclude_from_dashboard?: boolean | null;
}

export interface DashboardMetricStation {
  id: string;
  station_name: string;
  station_order: number;
}

export interface DashboardMetricItem {
  id: string;
  station_id: string;
  estimated_minutes?: number | null;
}

export interface DashboardMetricProgress {
  id?: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status?: string | null;
  progress_percent?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
}

export type DashboardSystemStatus = "active" | "completed" | "waiting";

export interface DashboardSystemMetric {
  completionAt: string | null;
  completedItems: number;
  nextStationId: string | null;
  nextStationName: string | null;
  progress: number;
  status: DashboardSystemStatus;
  systemId: string;
  totalItems: number;
}

export interface DashboardStationMetric {
  averageProgress: number;
  completedSystems: number;
  completedRecords: number;
  hours: number;
  id: string;
  incompleteSystems: number;
  itemCount: number;
  name: string;
  possibleRecords: number;
  remainingHours: number;
  remainingItems: number;
  totalSystems: number;
}

export interface DashboardDailyCompletion {
  count: number;
  date: Date;
  key: string;
  label: string;
}

interface CalculateDashboardMetricsInput<
  TSystem extends DashboardMetricSystem,
  TStation extends DashboardMetricStation,
  TItem extends DashboardMetricItem,
  TProgress extends DashboardMetricProgress,
> {
  now?: Date;
  progress: TProgress[];
  stations: TStation[];
  systems: TSystem[];
  testItems: TItem[];
}

const DEFAULT_ITEM_MINUTES = 30;
const NOT_STARTED_STATUSES = new Set(["", "not start", "not started", "not-started", "未開始"]);

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function toTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getProgressTimestamp(progress: DashboardMetricProgress) {
  return Math.max(
    toTimestamp(progress.updated_at),
    toTimestamp(progress.completed_at),
    toTimestamp(progress.started_at)
  );
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function isDone(progress?: DashboardMetricProgress) {
  return progress?.status === "Done";
}

function hasStarted(progress: DashboardMetricProgress) {
  const status = (progress.status ?? "").trim().toLocaleLowerCase();
  return (
    isDone(progress) ||
    !NOT_STARTED_STATUSES.has(status) ||
    (progress.progress_percent ?? 0) > 0 ||
    Boolean(progress.started_at) ||
    Boolean(progress.completed_at)
  );
}

function getEstimatedMinutes(item: DashboardMetricItem) {
  const value = item.estimated_minutes;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_ITEM_MINUTES;
}

export function calculateDashboardMetrics<
  TSystem extends DashboardMetricSystem,
  TStation extends DashboardMetricStation,
  TItem extends DashboardMetricItem,
  TProgress extends DashboardMetricProgress,
>({
  now = new Date(),
  progress,
  stations,
  systems,
  testItems,
}: CalculateDashboardMetricsInput<TSystem, TStation, TItem, TProgress>) {
  const includedSystems = systems.filter((system) => !system.exclude_from_dashboard);
  const includedSystemIds = new Set(includedSystems.map((system) => system.id));
  const sortedStations = [...stations].sort(
    (left, right) => left.station_order - right.station_order
  );
  const stationIds = new Set(sortedStations.map((station) => station.id));
  const activeItems = testItems.filter((item) => stationIds.has(item.station_id));
  const activeItemIds = new Set(activeItems.map((item) => item.id));
  const itemsByStation = new Map(
    sortedStations.map((station) => [
      station.id,
      activeItems.filter((item) => item.station_id === station.id),
    ])
  );

  // A reset updates an existing progress row, but if legacy duplicates exist the
  // newest row must win rather than an older completed row inflating the totals.
  const progressBySystemItem = new Map<string, TProgress>();
  progress.forEach((entry) => {
    if (!includedSystemIds.has(entry.system_id) || !activeItemIds.has(entry.item_id)) return;
    const key = `${entry.system_id}:${entry.item_id}`;
    const existing = progressBySystemItem.get(key);
    if (!existing || getProgressTimestamp(entry) >= getProgressTimestamp(existing)) {
      progressBySystemItem.set(key, entry);
    }
  });

  const progressBySystem = new Map<string, TProgress[]>();
  progressBySystemItem.forEach((entry) => {
    const entries = progressBySystem.get(entry.system_id) ?? [];
    entries.push(entry);
    progressBySystem.set(entry.system_id, entries);
  });

  const systemMetrics = includedSystems.map<DashboardSystemMetric>((system) => {
    const completedItems = activeItems.reduce(
      (count, item) =>
        count + Number(isDone(progressBySystemItem.get(`${system.id}:${item.id}`))),
      0
    );
    const isComplete = activeItems.length > 0 && completedItems === activeItems.length;
    const systemProgress = progressBySystem.get(system.id) ?? [];
    const isActive = Boolean(system.actual_started_at) || systemProgress.some(hasStarted);
    const nextStation = sortedStations.find((station) =>
      (itemsByStation.get(station.id) ?? []).some(
        (item) => !isDone(progressBySystemItem.get(`${system.id}:${item.id}`))
      )
    );

    const latestCompletedAt = isComplete
      ? systemProgress
          .filter(isDone)
          .map((entry) => entry.completed_at ?? entry.updated_at ?? null)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] ?? null
      : null;

    return {
      completionAt: isComplete ? system.actual_completed_at ?? latestCompletedAt : null,
      completedItems,
      nextStationId: nextStation?.id ?? null,
      nextStationName: nextStation?.station_name ?? null,
      progress: activeItems.length
        ? roundToOne((completedItems / activeItems.length) * 100)
        : 0,
      status: isComplete ? "completed" : isActive ? "active" : "waiting",
      systemId: system.id,
      totalItems: activeItems.length,
    };
  });
  const systemMetricById = new Map(systemMetrics.map((metric) => [metric.systemId, metric]));

  const statusCounts = systemMetrics.reduce(
    (counts, metric) => {
      counts[metric.status] += 1;
      return counts;
    },
    { active: 0, completed: 0, waiting: 0 }
  );
  const completionRate = includedSystems.length
    ? Math.round((statusCounts.completed / includedSystems.length) * 100)
    : 0;
  const portfolioProgress = includedSystems.length
    ? roundToOne(
        systemMetrics.reduce((sum, metric) => sum + metric.progress, 0) /
          includedSystems.length
      )
    : 0;

  const stationRows = sortedStations.map<DashboardStationMetric>((station) => {
    const stationItems = itemsByStation.get(station.id) ?? [];
    const totalSystems = stationItems.length ? includedSystems.length : 0;
    let completedSystems = 0;
    let incompleteSystems = 0;
    let remainingItems = 0;
    let remainingMinutes = 0;

    includedSystems.forEach((system) => {
      if (!stationItems.length) return;
      const missingItems = stationItems.filter(
        (item) => !isDone(progressBySystemItem.get(`${system.id}:${item.id}`))
      );
      if (missingItems.length) {
        incompleteSystems += 1;
      } else {
        completedSystems += 1;
      }
      remainingItems += missingItems.length;
      remainingMinutes += missingItems.reduce(
        (sum, item) => sum + getEstimatedMinutes(item),
        0
      );
    });

    const possibleRecords = includedSystems.length * stationItems.length;
    const completedRecords = Math.max(0, possibleRecords - remainingItems);
    return {
      averageProgress: possibleRecords
        ? Math.round((completedRecords / possibleRecords) * 100)
        : 0,
      completedSystems,
      completedRecords,
      hours: stationItems.reduce((sum, item) => sum + getEstimatedMinutes(item), 0) / 60,
      id: station.id,
      incompleteSystems,
      itemCount: stationItems.length,
      name: station.station_name,
      possibleRecords,
      remainingHours: remainingMinutes / 60,
      remainingItems,
      totalSystems,
    };
  });
  const totalRemainingHours = stationRows.reduce(
    (sum, station) => sum + station.remainingHours,
    0
  );
  const maxRemainingHours = Math.max(
    ...stationRows.map((station) => station.remainingHours),
    0
  );
  const bottleneckStation = stationRows.some((station) => station.remainingHours > 0)
    ? [...stationRows].sort(
        (left, right) =>
          right.remainingHours - left.remainingHours ||
          right.incompleteSystems - left.incompleteSystems ||
          right.remainingItems - left.remainingItems
      )[0]
    : null;

  const dailyCompletion: DashboardDailyCompletion[] = Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        count: 0,
        date,
        key: formatLocalDateKey(date),
        label: formatShortDate(date),
      };
    }
  );
  const dailyCompletionByKey = new Map(dailyCompletion.map((day) => [day.key, day]));
  systemMetrics.forEach((metric) => {
    if (metric.status !== "completed" || !metric.completionAt) return;
    const completionDate = new Date(metric.completionAt);
    if (Number.isNaN(completionDate.getTime())) return;
    const day = dailyCompletionByKey.get(formatLocalDateKey(completionDate));
    if (day) day.count += 1;
  });

  return {
    activeItemCount: activeItems.length,
    bottleneckStation,
    completionRate,
    dailyCompletion,
    includedSystems,
    maxRemainingHours,
    portfolioProgress,
    stationRows,
    statusCounts,
    systemMetricById,
    systemMetrics,
    totalRemainingHours,
  };
}
