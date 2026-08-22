export const DEFAULT_TRACKER_PAGE_SIZE = 100;
export const TRACKER_PAGE_SIZE_OPTIONS = [100, 500, 1000];

export const TRACKER_HEADER_HEIGHT = 36;
export const TRACKER_MACHINE_COLUMN_BOUNDARY_CLASS = "border-r border-[#315b7b]";
export const TRACKER_ROW_HEIGHT = 76;
export const TRACKER_VIRTUAL_OVERSCAN = 4;

export type TrackerColumnKind = "machine" | "serial" | "status" | "station" | "actions";

interface TrackerColumnSpec {
  defaultWidth: number;
  maxWidth: number;
  minWidth: number;
}

const TRACKER_COLUMN_SPECS: Record<TrackerColumnKind, TrackerColumnSpec> = {
  machine: { defaultWidth: 158, minWidth: 120, maxWidth: 420 },
  serial: { defaultWidth: 116, minWidth: 96, maxWidth: 320 },
  status: { defaultWidth: 98, minWidth: 82, maxWidth: 220 },
  station: { defaultWidth: 300, minWidth: 180, maxWidth: 620 },
  actions: { defaultWidth: 220, minWidth: 208, maxWidth: 320 },
};

export function getTrackerColumnKind(columnKey: string): TrackerColumnKind {
  return columnKey.startsWith("station:")
    ? "station"
    : columnKey in TRACKER_COLUMN_SPECS
      ? columnKey as TrackerColumnKind
      : "station";
}

export function getTrackerColumnSpec(columnKey: string): TrackerColumnSpec {
  return TRACKER_COLUMN_SPECS[getTrackerColumnKind(columnKey)];
}

export function getTrackerColumnWidth(
  columnKey: string,
  storedWidths: Record<string, number> = {},
) {
  const spec = getTrackerColumnSpec(columnKey);
  const storedWidth = Number(storedWidths[columnKey]);
  const width = Number.isFinite(storedWidth) ? storedWidth : spec.defaultWidth;
  return Math.round(Math.min(spec.maxWidth, Math.max(spec.minWidth, width)));
}

export function getTrackerGridTemplate(
  columnKeys: string[],
  columnWidths: Record<string, number>,
) {
  const hasStationColumns = columnKeys.some((columnKey) => columnKey.startsWith("station:"));

  return columnKeys
    .map((columnKey) => {
      const width = getTrackerColumnWidth(columnKey, columnWidths);
      const shouldFlex = columnKey.startsWith("station:") || (!hasStationColumns && columnKey === "machine");
      return shouldFlex ? `minmax(${width}px, ${width}fr)` : `${width}px`;
    })
    .join(" ");
}

interface TrackerItemLike {
  id: string;
  station_id: string;
}

interface TrackerProgressLike {
  item_id: string;
  station_id: string;
  status?: string | null;
  system_id: string;
}

export interface TrackerLinkedIssue {
  id?: string;
  station_id: string | null;
  status?: string | null;
  system_id: string | null;
  test_item_id: string | null;
}

export function getStationProgressKey(systemId: string, stationId: string) {
  return `${systemId}\u0000${stationId}`;
}

export function createStationProgressLookup(
  items: TrackerItemLike[],
  progress: TrackerProgressLike[],
) {
  const itemIdsByStation = new Map<string, Set<string>>();
  const completedItemsBySystemStation = new Map<string, Set<string>>();

  items.forEach((item) => {
    const stationItems = itemIdsByStation.get(item.station_id) ?? new Set<string>();
    stationItems.add(item.id);
    itemIdsByStation.set(item.station_id, stationItems);
  });

  progress.forEach((entry) => {
    if (entry.status !== "Done") return;
    if (!itemIdsByStation.get(entry.station_id)?.has(entry.item_id)) return;

    const key = getStationProgressKey(entry.system_id, entry.station_id);
    const completedItems = completedItemsBySystemStation.get(key) ?? new Set<string>();
    completedItems.add(entry.item_id);
    completedItemsBySystemStation.set(key, completedItems);
  });

  const percentages = new Map<string, number>();
  completedItemsBySystemStation.forEach((completedItems, key) => {
    const stationId = key.slice(key.indexOf("\u0000") + 1);
    const totalItems = itemIdsByStation.get(stationId)?.size ?? 0;
    percentages.set(key, totalItems ? Math.round((completedItems.size / totalItems) * 100) : 0);
  });

  return percentages;
}

export function createStationBlockedLookup(
  items: TrackerItemLike[],
  progress: TrackerProgressLike[],
  linkedIssues: TrackerLinkedIssue[] = [],
) {
  const itemIdsByStation = new Map<string, Set<string>>();
  items.forEach((item) => {
    const stationItems = itemIdsByStation.get(item.station_id) ?? new Set<string>();
    stationItems.add(item.id);
    itemIdsByStation.set(item.station_id, stationItems);
  });

  const blockedItemsBySystemStation = new Map<string, Set<string>>();
  const addBlockedItem = (systemId: string, stationId: string, itemId: string) => {
    if (!itemIdsByStation.get(stationId)?.has(itemId)) return;
    const key = getStationProgressKey(systemId, stationId);
    const blockedItems = blockedItemsBySystemStation.get(key) ?? new Set<string>();
    blockedItems.add(itemId);
    blockedItemsBySystemStation.set(key, blockedItems);
  };

  progress.forEach((entry) => {
    if (!["Error", "Blocked", "異常"].includes(entry.status ?? "")) return;
    addBlockedItem(entry.system_id, entry.station_id, entry.item_id);
  });

  linkedIssues.forEach((issue) => {
    const status = (issue.status ?? "open").toLowerCase();
    if (status === "resolved" || status === "closed") return;
    if (!issue.system_id || !issue.station_id || !issue.test_item_id) return;
    addBlockedItem(issue.system_id, issue.station_id, issue.test_item_id);
  });

  return new Map(
    [...blockedItemsBySystemStation.entries()].map(([key, blockedItems]) => [key, blockedItems.size])
  );
}

export function createSystemBlockedLookup(
  items: TrackerItemLike[],
  progress: TrackerProgressLike[],
  linkedIssues: TrackerLinkedIssue[] = [],
) {
  const stationLookup = createStationBlockedLookup(items, progress, linkedIssues);
  const itemKeysBySystem = new Map<string, Set<string>>();

  stationLookup.forEach((_count, key) => {
    const [systemId, stationId] = key.split("\u0000");
    const blockedItems = itemKeysBySystem.get(systemId) ?? new Set<string>();
    const stationItemIds = new Set(
      items.filter((item) => item.station_id === stationId).map((item) => item.id),
    );

    progress.forEach((entry) => {
      if (entry.system_id !== systemId || entry.station_id !== stationId) return;
      if (!["Error", "Blocked", "異常"].includes(entry.status ?? "")) return;
      if (stationItemIds.has(entry.item_id)) blockedItems.add(`${stationId}\u0000${entry.item_id}`);
    });
    linkedIssues.forEach((issue) => {
      if (issue.system_id !== systemId || issue.station_id !== stationId || !issue.test_item_id) return;
      const status = (issue.status ?? "open").toLowerCase();
      if (status === "resolved" || status === "closed") return;
      if (stationItemIds.has(issue.test_item_id)) blockedItems.add(`${stationId}\u0000${issue.test_item_id}`);
    });
    itemKeysBySystem.set(systemId, blockedItems);
  });

  return new Map(
    Array.from(itemKeysBySystem, ([systemId, itemKeys]) => [systemId, itemKeys.size]),
  );
}

interface TrackerVirtualRangeOptions {
  headerHeight?: number;
  overscan?: number;
  rowCount: number;
  rowHeight?: number;
  scrollTop: number;
  viewportHeight: number;
}

export function getTrackerVirtualRange({
  headerHeight = TRACKER_HEADER_HEIGHT,
  overscan = TRACKER_VIRTUAL_OVERSCAN,
  rowCount,
  rowHeight = TRACKER_ROW_HEIGHT,
  scrollTop,
  viewportHeight,
}: TrackerVirtualRangeOptions) {
  const safeRowCount = Math.max(0, Math.trunc(rowCount));
  const contentScrollTop = Math.max(0, scrollTop - headerHeight);
  const firstVisible = Math.floor(contentScrollTop / rowHeight);
  const lastVisible = Math.ceil((contentScrollTop + Math.max(0, viewportHeight)) / rowHeight);

  return {
    start: Math.max(0, firstVisible - overscan),
    end: Math.min(safeRowCount, lastVisible + overscan),
  };
}
