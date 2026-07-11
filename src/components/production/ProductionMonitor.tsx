import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Expand,
  Factory,
  Minimize2,
  Pause,
  PlayCircle,
  Search,
  Server,
} from "lucide-react";

import { MaintenanceMetricStrip } from "@/components/maintenance/MaintenanceMetricStrip";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { cn } from "@/lib/utils";

type MonitorFilter = "all" | "active" | "completed" | "error" | "waiting";

export function ProductionMonitor() {
  const { activeProject } = useTestProject();
  const { isLoading, progress, stations, systems, testItems } = useUnifiedData();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<MonitorFilter>("all");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sortedStations = [...stations].sort(
    (left, right) => left.station_order - right.station_order
  );

  const getStationProgress = (systemId: string, stationId: string) => {
    const stationItems = testItems.filter((item) => item.station_id === stationId);
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

  const getSystemState = (systemId: string) => {
    const system = systems.find((entry) => entry.id === systemId);
    const hasError = progress.some(
      (entry) => entry.system_id === systemId && entry.status === "Error"
    );
    if (hasError) return "error" as const;
    if (
      system?.status === "Done" ||
      system?.status === "已完成" ||
      system?.overall_progress === 100
    ) {
      return "completed" as const;
    }
    if (
      system?.status === "On-going" ||
      system?.status === "進行中" ||
      (system?.overall_progress ?? 0) > 0
    ) {
      return "active" as const;
    }
    return "waiting" as const;
  };

  const filteredSystems = (() => {
    const keyword = searchTerm.trim().toLowerCase();
    return systems.filter((system) => {
      const matchesKeyword =
        !keyword ||
        system.system_name.toLowerCase().includes(keyword) ||
        system.serial_number?.toLowerCase().includes(keyword) ||
        system.assigned_engineer?.toLowerCase().includes(keyword);
      const state = getSystemState(system.id);
      return matchesKeyword && (statusFilter === "all" || statusFilter === state);
    });
  })();

  const stateCounts = systems.reduce(
    (counts, system) => {
      counts[getSystemState(system.id)] += 1;
      return counts;
    },
    { active: 0, completed: 0, error: 0, waiting: 0 }
  );
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? null;

  const getSystemLaneId = (systemId: string) => {
    const system = systems.find((entry) => entry.id === systemId);
    if (!system) return "unassigned";
    if (getSystemState(systemId) === "completed") return "completed";

    const exactStation = sortedStations.find(
      (station) => station.station_name === system.current_station
    );
    if (exactStation) return exactStation.id;

    const firstIncomplete = sortedStations.find(
      (station) => getStationProgress(systemId, station.id) < 100
    );
    return firstIncomplete?.id || sortedStations[0]?.id || "unassigned";
  };

  const lanes = sortedStations.map((station) => ({
    id: station.id,
    label: station.station_name,
    stationId: station.id as string | null,
  }));
  if (filteredSystems.some((system) => getSystemState(system.id) === "completed")) {
    lanes.push({ id: "completed", label: "已完成", stationId: null });
  }
  if (!sortedStations.length && filteredSystems.length) {
    lanes.push({ id: "unassigned", label: "未分配站點", stationId: null });
  }

  const toggleFullscreen = async () => {
    if (!rootRef.current) return;
    if (!document.fullscreenElement) {
      await rootRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const navigateToIssues = (systemName: string) => {
    const event = new CustomEvent("navigate", {
      detail: { module: "issues", params: { system: systemName } },
    });
    window.dispatchEvent(event);
  };

  if (isLoading) {
    return <div className="maintenance-page text-sm text-[#a9c0d1]">載入生產監控資料...</div>;
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "maintenance-page space-y-3",
        isFullscreen && "h-screen overflow-hidden bg-[#06111f]"
      )}
    >
      <MaintenancePageHeader
        icon={Factory}
        title="生產監控牆"
        description={`${activeProject?.name || "目前專案"} · ${sortedStations.length} 個測試站點`}
        actions={
          <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Expand className="mr-2 h-4 w-4" />}
            {isFullscreen ? "離開全螢幕" : "全螢幕"}
          </Button>
        }
      />

      <MaintenanceMetricStrip
        metrics={[
          { accent: "blue", icon: Server, label: "監控機台", value: systems.length },
          { accent: "amber", icon: PlayCircle, label: "進行中", value: stateCounts.active },
          { accent: "emerald", icon: CheckCircle2, label: "已完成", value: stateCounts.completed },
          { accent: "rose", icon: AlertTriangle, label: "異常", value: stateCounts.error },
          { accent: "cyan", icon: Pause, label: "待開始", value: stateCounts.waiting },
        ]}
      />

      <div className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))}
            className="h-9 border-[#2a526f] bg-[#06111f] pl-9"
            placeholder="搜尋機台、序號或工程師"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as MonitorFilter)}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="active">進行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="error">異常</SelectItem>
            <SelectItem value="waiting">待開始</SelectItem>
          </SelectContent>
        </Select>
        <span className="font-data px-2 text-xs text-[#a9c0d1]">{filteredSystems.length} 台</span>
      </div>

      <div className="flex min-h-[430px] gap-3 overflow-x-auto pb-2">
        {lanes.map((lane) => {
          const laneSystems = filteredSystems.filter(
            (system) => getSystemLaneId(system.id) === lane.id
          );
          return (
            <section key={lane.id} className="maintenance-panel min-w-[260px] flex-1 overflow-hidden">
              <div className="flex h-11 items-center justify-between border-b border-[#2a526f]/70 bg-[#10263a] px-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">{lane.label}</h2>
                </div>
                <Badge variant="outline" className="font-data rounded-md border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                  {laneSystems.length}
                </Badge>
              </div>
              <div className="max-h-[calc(100vh-355px)] space-y-2 overflow-y-auto p-2">
                {laneSystems.map((system) => {
                  const state = getSystemState(system.id);
                  const stationPercent = lane.stationId
                    ? getStationProgress(system.id, lane.stationId)
                    : system.overall_progress ?? 0;
                  const stateTone = {
                    active: "border-amber-300/35",
                    completed: "border-emerald-300/35",
                    error: "border-rose-300/45",
                    waiting: "border-[#2a526f]",
                  }[state];
                  return (
                    <button
                      key={system.id}
                      type="button"
                      onClick={() => setSelectedSystemId(system.id)}
                      className={cn(
                        "w-full rounded-lg border bg-[#10263a] p-2.5 text-left transition-colors hover:bg-[#15344d]",
                        stateTone
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</span>
                        <span className="font-data text-xs text-cyan-100">{stationPercent}%</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[#a9c0d1]">
                        <span className="truncate">{system.assigned_engineer || "未指定"}</span>
                        <span>{state === "error" ? "異常" : state === "completed" ? "完成" : state === "active" ? "進行中" : "待開始"}</span>
                      </div>
                      <Progress value={stationPercent} className="mt-2 h-1.5" />
                    </button>
                  );
                })}
                {!laneSystems.length && <div className="py-10 text-center text-xs text-[#a9c0d1]">此站目前沒有機台</div>}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={Boolean(selectedSystem)} onOpenChange={(open) => !open && setSelectedSystemId(null)}>
        <SheetContent className="w-full overflow-y-auto border-[#2a526f] bg-[#071522] sm:max-w-[560px]">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3 pr-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100"><Server className="h-5 w-5" /></div>
              <div>
                <SheetTitle className="text-xl text-[#f3f8fc]">{selectedSystem?.system_name}</SheetTitle>
                <SheetDescription className="mt-1 text-[#a9c0d1]">{selectedSystem?.serial_number || "無序號"} · {selectedSystem?.assigned_engineer || "未指定工程師"}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {selectedSystem && (
            <div className="mt-5 space-y-4">
              <div className="maintenance-panel-raised p-4">
                <div className="flex items-center justify-between text-sm"><span className="text-[#a9c0d1]">整體進度</span><span className="font-data text-lg text-[#f3f8fc]">{selectedSystem.overall_progress ?? 0}%</span></div>
                <Progress value={selectedSystem.overall_progress ?? 0} className="mt-2 h-2" />
              </div>
              <div className="space-y-2">
                {sortedStations.map((station, index) => {
                  const percent = getStationProgress(selectedSystem.id, station.id);
                  return (
                    <div key={station.id} className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2"><span className="font-data flex h-6 w-6 items-center justify-center rounded-md bg-[#10263a] text-xs text-cyan-100">{index + 1}</span><span className="truncate text-sm font-medium text-[#f3f8fc]">{station.station_name}</span></div>
                        <span className="font-data text-xs text-[#d8e6f0]">{percent}%</span>
                      </div>
                      <Progress value={percent} className="mt-2 h-1.5" />
                    </div>
                  );
                })}
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigateToIssues(selectedSystem.system_name)}>
                <AlertTriangle className="mr-2 h-4 w-4" />查看或回報此機台問題
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
