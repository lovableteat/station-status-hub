import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";

import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress as ProgressBar } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFlowVersions } from "@/hooks/useFlowVersions";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { BulkResetDialog } from "./BulkResetDialog";
import { ExportManager } from "./ExportManager";
import { PDFExportDialog } from "./pdf/PDFExportDialog";
import { SystemManager } from "./SystemManager";
import { SystemProgressSheet } from "./SystemProgressSheet";
import { TestProgressTable } from "./TestProgressTable";

type StatusFilter = "all" | "未開始" | "進行中" | "已完成";
type TrackerView = "table" | "board";

function normalizeSystemStatus(system: {
  current_station?: string | null;
  overall_progress?: number | null;
  status?: string | null;
}) {
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

function updateTrackerViewQuery(view: TrackerView) {
  const url = new URL(window.location.href);
  url.searchParams.set("trackerView", view);
  window.history.replaceState({}, "", url);
}

export function TestTracker() {
  const {
    items,
    loadData,
    progress,
    stations,
    systems,
    updateProgress,
  } = useTestTrackerData();
  const { activeProject, activeProjectId } = useTestProject();
  const {
    activeVersion,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    versions,
  } = useFlowVersions();
  const [searchTerm, setSearchTerm] = useState("");
  const [engineerFilter, setEngineerFilter] = useState("all");
  const [stationFilter, setStationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<TrackerView>(() => {
    if (typeof window === "undefined") return "table";
    return new URLSearchParams(window.location.search).get("trackerView") === "board"
      ? "board"
      : "table";
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [pdfExporterOpen, setPdfExporterOpen] = useState(false);
  const [displayStations, setDisplayStations] = useState(stations);
  const [displayItems, setDisplayItems] = useState(items);

  useEffect(() => {
    if (!selectedVersionId || selectedVersionId === activeVersion?.id) {
      setDisplayStations(stations);
      setDisplayItems(items);
      return;
    }

    let cancelled = false;
    Promise.all([
      supabase
        .from("test_flow_stations")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("flow_version_id", selectedVersionId)
        .order("station_order"),
      supabase
        .from("test_flow_items")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("flow_version_id", selectedVersionId)
        .order("item_order"),
    ]).then(([stationResult, itemResult]) => {
      if (cancelled || stationResult.error || itemResult.error) return;
      setDisplayStations(stationResult.data ?? []);
      setDisplayItems(itemResult.data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    activeVersion?.id,
    items,
    selectedVersionId,
    stations,
  ]);

  useEffect(() => {
    setPage(1);
  }, [engineerFilter, searchTerm, selectedVersionId, stationFilter, statusFilter, view]);

  const engineers = useMemo(
    () =>
      [...new Set(
        systems
          .map((system) => system.assigned_engineer)
          .filter((engineer): engineer is string => Boolean(engineer?.trim()))
      )].sort((left, right) => left.localeCompare(right, "zh-Hant")),
    [systems]
  );

  const baseFilteredSystems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return systems.filter((system) => {
      const status = normalizeSystemStatus(system);
      const matchesKeyword =
        !keyword ||
        system.system_name?.toLowerCase().includes(keyword) ||
        system.serial_number?.toLowerCase().includes(keyword) ||
        system.assigned_engineer?.toLowerCase().includes(keyword) ||
        system.current_station?.toLowerCase().includes(keyword);
      const matchesEngineer =
        engineerFilter === "all" || system.assigned_engineer === engineerFilter;
      const matchesStation =
        stationFilter === "all" || system.current_station === stationFilter;
      const matchesVersion =
        !selectedVersionId ||
        !system.flow_version_id ||
        system.flow_version_id === selectedVersionId;

      return matchesKeyword && matchesEngineer && matchesStation && matchesVersion && status;
    });
  }, [engineerFilter, searchTerm, selectedVersionId, stationFilter, systems]);

  const statusCounts = useMemo(
    () =>
      baseFilteredSystems.reduce(
        (counts, system) => {
          counts[normalizeSystemStatus(system)] += 1;
          return counts;
        },
        { 已完成: 0, 未開始: 0, 進行中: 0 }
      ),
    [baseFilteredSystems]
  );

  const filteredSystems = useMemo(
    () =>
      statusFilter === "all"
        ? baseFilteredSystems
        : baseFilteredSystems.filter(
            (system) => normalizeSystemStatus(system) === statusFilter
          ),
    [baseFilteredSystems, statusFilter]
  );
  const pageCount = Math.max(1, Math.ceil(filteredSystems.length / pageSize));
  const pagedSystems = filteredSystems.slice((page - 1) * pageSize, page * pageSize);
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? null;
  const selectedSystemVersion = versions.find(
    (version) => version.id === selectedSystem?.flow_version_id
  );

  const changeView = (nextView: TrackerView) => {
    setView(nextView);
    updateTrackerViewQuery(nextView);
  };

  return (
    <div className="maintenance-page space-y-3">
      <MaintenancePageHeader
        icon={ClipboardList}
        title="L10 測試追蹤"
        description={`${activeProject?.name || "目前專案"} · ${filteredSystems.length} 台符合條件`}
        actions={
          <>
            <SystemManager onSystemUpdate={loadData} showDeleteAll={false} />
            <BulkResetDialog onReset={loadData} />
            <ExportManager systems={filteredSystems} stations={displayStations} progress={progress} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 rounded-lg">
                  <Download className="mr-2 h-4 w-4" />PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPdfExporterOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" />完整測試追蹤 PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="maintenance-toolbar flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a9c0d1]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value.slice(0, 100))}
            className="h-9 border-[#2a526f] bg-[#06111f] pl-9"
            placeholder="搜尋機台、序號或工程師"
          />
        </div>

        <Select value={engineerFilter} onValueChange={setEngineerFilter}>
          <SelectTrigger className="h-9 w-[145px]"><SelectValue placeholder="工程師" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工程師</SelectItem>
            {engineers.map((engineer) => <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={stationFilter} onValueChange={setStationFilter}>
          <SelectTrigger className="h-9 w-[165px]"><SelectValue placeholder="站點" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部站點</SelectItem>
            {displayStations.map((station) => <SelectItem key={station.id} value={station.station_name}>{station.station_name}</SelectItem>)}
          </SelectContent>
        </Select>

        {versions.length > 0 && selectedVersionId && (
          <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
            <SelectTrigger className="h-9 w-[118px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  {version.label || `v${version.version_number}`}{version.status === "draft" ? " 草稿" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex rounded-lg border border-[#2a526f] bg-[#06111f] p-1">
          {(["未開始", "進行中", "已完成"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter((current) => current === status ? "all" : status)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                statusFilter === status ? "bg-[#4c8dff] text-[#06111f]" : "text-[#a9c0d1] hover:bg-[#10263a] hover:text-[#f3f8fc]"
              )}
            >
              {status} <span className="font-data ml-1">{statusCounts[status]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium",
              statusFilter === "all" ? "bg-[#10263a] text-[#f3f8fc]" : "text-[#a9c0d1]"
            )}
          >
            全部 <span className="font-data ml-1">{baseFilteredSystems.length}</span>
          </button>
        </div>

        <div className="ml-auto flex rounded-lg border border-[#2a526f] bg-[#06111f] p-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-8 rounded-md", view === "table" && "bg-[#10263a] text-cyan-100")}
            onClick={() => changeView("table")}
          >
            <List className="h-4 w-4" /><span className="sr-only">表格檢視</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-8 rounded-md", view === "board" && "bg-[#10263a] text-cyan-100")}
            onClick={() => changeView("board")}
          >
            <LayoutGrid className="h-4 w-4" /><span className="sr-only">站點看板</span>
          </Button>
        </div>
      </div>

      {view === "table" ? (
        <>
          <TestProgressTable
            systems={pagedSystems}
            stations={displayStations}
            items={displayItems}
            progress={progress}
            onSelectSystem={setSelectedSystemId}
            onSystemUpdate={loadData}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-[#a9c0d1]">
            <div className="flex items-center gap-2">
              <span>每頁</span>
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                </SelectContent>
              </Select>
              <span>共 {filteredSystems.length} 台</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                <ChevronLeft className="h-4 w-4" /><span className="sr-only">上一頁</span>
              </Button>
              <span className="font-data min-w-14 text-center">{page}/{pageCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
                <ChevronRight className="h-4 w-4" /><span className="sr-only">下一頁</span>
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-[430px] gap-3 overflow-x-auto pb-2">
          {displayStations.map((station) => {
            const stationSystems = filteredSystems.filter(
              (system) => system.current_station === station.station_name
            );
            return (
              <section key={station.id} className="maintenance-panel min-w-[250px] flex-1 overflow-hidden">
                <div className="flex h-11 items-center justify-between border-b border-[#2a526f]/70 px-3">
                  <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">{station.station_name}</h2>
                  <Badge variant="outline" className="font-data rounded-md">{stationSystems.length}</Badge>
                </div>
                <div className="max-h-[calc(100vh-348px)] space-y-2 overflow-y-auto p-2">
                  {stationSystems.map((system) => (
                    <button
                      key={system.id}
                      type="button"
                      className="w-full rounded-lg border border-[#2a526f] bg-[#10263a] p-2.5 text-left hover:border-cyan-300/55"
                      onClick={() => setSelectedSystemId(system.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[#f3f8fc]">{system.system_name}</span>
                        <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[#a9c0d1]">{system.assigned_engineer || "未指定工程師"}</div>
                      <ProgressBar value={system.overall_progress ?? 0} className="mt-2 h-1.5" />
                    </button>
                  ))}
                  {!stationSystems.length && <div className="py-8 text-center text-xs text-[#a9c0d1]">目前沒有機台</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <SystemProgressSheet
        open={Boolean(selectedSystem)}
        onOpenChange={(open) => !open && setSelectedSystemId(null)}
        system={selectedSystem}
        stations={displayStations}
        items={displayItems}
        progress={progress}
        updateProgress={updateProgress}
        onUpdated={loadData}
        versionLabel={
          selectedSystemVersion?.label ||
          (selectedVersion?.id === selectedSystem?.flow_version_id
            ? selectedVersion?.label
            : null)
        }
      />

      <PDFExportDialog
        systems={filteredSystems}
        stations={displayStations}
        items={displayItems}
        progress={progress}
        isOpen={pdfExporterOpen}
        onClose={() => setPdfExporterOpen(false)}
      />
    </div>
  );
}
