import type { ReactNode } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { SegmentedProgress } from "./SegmentedProgress";
import { SystemCompleteButton } from "./SystemCompleteButton";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemDeleteButton } from "./SystemManager";
import { SystemResetDialog } from "./SystemResetDialog";

interface TrackerSystem {
  assigned_engineer?: string | null;
  current_station?: string | null;
  id: string;
  overall_progress?: number | null;
  serial_number?: string | null;
  status?: string | null;
  system_name: string;
}

interface TrackerStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TrackerItem {
  id: string;
  station_id: string;
}

interface TrackerProgress {
  item_id: string;
  station_id: string;
  status?: string | null;
  system_id: string;
}

interface TestProgressTableProps {
  headerControls?: ReactNode;
  items: TrackerItem[];
  onSelectSystem: (systemId: string) => void;
  onSystemUpdate: () => void;
  progress: TrackerProgress[];
  stations: TrackerStation[];
  systems: TrackerSystem[];
}

function normalizeStatus(system: TrackerSystem) {
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
    (system.overall_progress ?? 0) > 0
  ) {
    return "進行中";
  }
  return "未開始";
}

function statusClass(status: string) {
  if (status === "已完成") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (status === "進行中") return "border-blue-300/35 bg-blue-300/10 text-blue-100";
  return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
}

export function TestProgressTable({
  headerControls,
  items,
  onSelectSystem,
  onSystemUpdate,
  progress,
  stations,
  systems,
}: TestProgressTableProps) {
  const sortedStations = [...stations].sort(
    (left, right) => left.station_order - right.station_order
  );
  const gridColumns = `158px 116px 98px repeat(${sortedStations.length}, minmax(150px, 1fr)) 82px`;
  const minWidth = 158 + 116 + 98 + sortedStations.length * 150 + 82;

  const getStationPercent = (systemId: string, stationId: string) => {
    const stationItems = items.filter((item) => item.station_id === stationId);
    if (!stationItems.length) return 0;
    const completed = stationItems.filter((item) =>
      progress.some(
        (entry) =>
          entry.system_id === systemId &&
          entry.station_id === stationId &&
          entry.item_id === item.id &&
          entry.status === "Done"
      )
    ).length;
    return Math.round((completed / stationItems.length) * 100);
  };

  if (!systems.length) {
    return (
      <div className="maintenance-panel flex min-h-[280px] items-center justify-center text-sm text-[#a9c0d1]">
        目前篩選條件沒有符合的機台。
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 lg:hidden">
        {systems.map((system) => {
          const status = normalizeStatus(system);
          return (
            <button
              key={system.id}
              type="button"
              className="maintenance-panel w-full p-3 text-left hover:border-cyan-300/50"
              onClick={() => onSelectSystem(system.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#f3f8fc]">{system.system_name}</div>
                  <div className="mt-1 truncate text-xs text-[#a9c0d1]">
                    {system.serial_number || "無序號"} · {system.assigned_engineer || "未指定"}
                  </div>
                </div>
                <Badge variant="outline" className={cn("rounded-md", statusClass(status))}>{status}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <SegmentedProgress
                  value={system.overall_progress ?? 0}
                  className="flex-1"
                  label={`${system.system_name} 整體進度`}
                />
                <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-xl bg-[#315b7b] p-px lg:block">
        <div className="max-h-[calc(100vh-238px)] min-h-[420px] overflow-auto rounded-[11px] bg-[#08182a] [scrollbar-gutter:stable]">
          <div style={{ minWidth }}>
            <div
              className="sticky top-0 z-20 grid h-9 items-center gap-2 border-b border-[#254866] bg-[#0d2137] px-3 text-[11px] font-semibold text-[#dcebf5]"
              style={{ gridTemplateColumns: gridColumns }}
            >
              <div className="sticky left-0 z-30 flex h-9 items-center bg-[#0d2137]">機台 ID</div>
              <div>序號</div>
              <div>狀態</div>
              {sortedStations.map((station) => (
                <div key={station.id} className="truncate text-center" title={station.station_name}>
                  {station.station_name}
                </div>
              ))}
              <div className="flex items-center justify-center gap-1">
                <span>操作</span>
                {headerControls}
              </div>
            </div>

            <div className="divide-y divide-[#1e3b56]/55">
              {systems.map((system) => {
                const status = normalizeStatus(system);
                return (
                  <div
                    key={system.id}
                    data-machine-row={system.id}
                    className={cn(
                      "group grid items-center gap-2 px-3 py-2.5 text-[13px] transition-colors hover:bg-[#102b48]",
                      status === "進行中" ? "bg-[#0b2443]" : "bg-[#08182a]"
                    )}
                    style={{ gridTemplateColumns: gridColumns, minHeight: 76 }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "sticky left-0 z-10 min-w-0 py-2 text-left group-hover:bg-[#102b48]",
                        status === "進行中" ? "bg-[#0b2443]" : "bg-[#08182a]"
                      )}
                      onClick={() => onSelectSystem(system.id)}
                    >
                      <div className="truncate font-semibold leading-4 text-[#f3f8fc]">{system.system_name}</div>
                      <div className="truncate text-[10px] leading-3 text-[#91adc2]">{system.assigned_engineer || "未指定"}</div>
                    </button>
                    <div className="truncate font-data text-xs text-[#b9cddd]" title={system.serial_number || ""}>
                      {system.serial_number || "-"}
                    </div>
                    <Badge variant="outline" className={cn("w-fit rounded-full px-2 text-[10px]", statusClass(status))}>
                      {status}
                    </Badge>

                    {sortedStations.map((station) => {
                      const percent = getStationPercent(system.id, station.id);
                      return (
                        <button
                          key={station.id}
                          type="button"
                          className="rounded-md px-1.5 py-2 text-left hover:bg-[#061426] focus-visible:outline-none"
                          onClick={() => onSelectSystem(system.id)}
                          aria-label={`編輯 ${system.system_name} ${station.station_name} 進度`}
                        >
                          <div className="mb-0.5 flex items-center justify-between text-[10px] leading-3 text-[#9db6c8]">
                            <span>{percent === 100 ? "完成" : percent > 0 ? "進度" : "未開始"}</span>
                            <span className="font-data text-[#d8e6f0]">{percent}%</span>
                          </div>
                          <SegmentedProgress
                            value={percent}
                            label={`${system.system_name} ${station.station_name} 進度`}
                          />
                        </button>
                      );
                    })}

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="mx-auto h-8 w-8 rounded-lg">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">{system.system_name} 操作</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-52 space-y-2 p-2">
                        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => onSelectSystem(system.id)}>
                          <Pencil className="mr-2 h-4 w-4" />編輯測試進度
                        </Button>
                        <SystemCompleteButton
                          systemId={system.id}
                          systemName={system.system_name}
                          stations={stations as never[]}
                          items={items as never[]}
                          onSystemUpdate={onSystemUpdate}
                        />
                        <SystemEditDialog
                          systemId={system.id}
                          systemName={system.system_name}
                          assignedEngineer={system.assigned_engineer || ""}
                          onUpdate={onSystemUpdate}
                        />
                        <SystemResetDialog
                          systemId={system.id}
                          systemName={system.system_name}
                          onReset={onSystemUpdate}
                        />
                        <SystemDeleteButton
                          systemId={system.id}
                          systemName={system.system_name}
                          onSystemUpdate={onSystemUpdate}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
