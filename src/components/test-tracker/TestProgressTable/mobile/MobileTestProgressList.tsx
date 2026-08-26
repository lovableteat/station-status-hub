import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { SegmentedProgress } from "../../SegmentedProgress";
import type { TestProgressTableProps } from "../shared/types";
import {
  getTrackerTableStatusClass,
  normalizeTrackerTableStatus,
} from "../shared/status";
import {
  createStationBlockedLookup,
  createStationProgressLookup,
  createSystemBlockedLookup,
  getStationProgressKey,
} from "../../testTrackerPresentation";

export function MobileTestProgressList({
  items,
  linkedIssues,
  onEditSystemData,
  onSelectStation,
  onSelectSystem,
  progress,
  stations,
  systems,
}: TestProgressTableProps) {
  const sortedStations = useMemo(
    () => [...stations].sort((left, right) => left.station_order - right.station_order),
    [stations]
  );
  const stationProgressLookup = useMemo(
    () => createStationProgressLookup(items, progress),
    [items, progress]
  );
  const stationBlockedLookup = useMemo(
    () => createStationBlockedLookup(items, progress, linkedIssues),
    [items, linkedIssues, progress]
  );
  const systemBlockedLookup = useMemo(
    () => createSystemBlockedLookup(items, progress, linkedIssues),
    [items, linkedIssues, progress]
  );

  const getStationPercent = (systemId: string, stationId: string) =>
    stationProgressLookup.get(getStationProgressKey(systemId, stationId)) ?? 0;

  if (!systems.length) {
    return (
      <div className="maintenance-panel flex min-h-[180px] items-center justify-center text-sm text-[#a9c0d1]">
        目前篩選條件沒有符合的機台
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {systems.map((system) => {
        const status = normalizeTrackerTableStatus(system);
        const systemBlockedCount = systemBlockedLookup.get(system.id) ?? 0;
        const blockedStations = sortedStations.flatMap((station) => {
          const blocked = stationBlockedLookup.get(getStationProgressKey(system.id, station.id)) ?? 0;
          return blocked > 0
            ? [{ blocked, percent: getStationPercent(system.id, station.id), station }]
            : [];
        });
        return (
          <div
            key={system.id}
            className={cn(
              "maintenance-panel w-full p-3 [contain-intrinsic-size:110px] [content-visibility:auto]",
              systemBlockedCount > 0 && "border-rose-300/55 bg-rose-950/20",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md text-left hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                onClick={() => onEditSystemData(system.id)}
              >
                <div className="truncate font-semibold text-[#f3f8fc]">{system.system_name}</div>
                <div className="mt-1 truncate text-xs text-[#a9c0d1]">
                  {system.serial_number || "無序號"} · {system.assigned_engineer || "未指定"}
                </div>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {systemBlockedCount > 0 && (
                  <Badge variant="outline" className="rounded-md border-rose-300/60 bg-rose-400/15 text-rose-100">
                    Blocked {systemBlockedCount}
                  </Badge>
                )}
                <Badge variant="outline" className={cn("rounded-md", getTrackerTableStatusClass(status))}>{status}</Badge>
              </div>
            </div>
            <button
              type="button"
              className="mt-3 flex w-full items-center gap-3 rounded-md p-1 text-left hover:bg-[#061426] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              onClick={() => onSelectSystem(system.id)}
              aria-label={`編輯 ${system.system_name} 的測試進度`}
            >
              <SegmentedProgress
                value={system.overall_progress ?? 0}
                tone={systemBlockedCount ? "danger" : "auto"}
                className="flex-1"
                label={`${system.system_name} 整體進度`}
              />
              <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
            </button>
            {blockedStations.map(({ blocked, percent, station }) => (
              <button
                key={station.id}
                type="button"
                className="mt-2 w-full rounded-lg border border-rose-300/50 bg-rose-950/25 p-2 text-left"
                onClick={() => onSelectStation(system.id, station.id)}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-rose-100">{station.station_name}</span>
                  <span className="shrink-0 font-semibold text-rose-200">Blocked {blocked}</span>
                </div>
                <SegmentedProgress
                  value={percent}
                  tone="danger"
                  label={`${system.system_name} ${station.station_name} Blocked 進度`}
                />
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
