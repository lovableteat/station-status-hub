import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  UIEvent as ReactUIEvent,
} from "react";
import { Check, Copy, MoreHorizontal, Palette, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { SegmentedProgress } from "./SegmentedProgress";
import { SystemCompleteButton } from "./SystemCompleteButton";
import { SystemEditDialog } from "./SystemEditDialog";
import { SystemDeleteButton } from "./SystemManager";
import { SystemResetDialog } from "./SystemResetDialog";
import {
  createStationProgressLookup,
  getStationProgressKey,
  getTrackerColumnSpec,
  getTrackerColumnWidth,
  getTrackerGridTemplate,
  getTrackerVirtualRange,
  TRACKER_MACHINE_COLUMN_BOUNDARY_CLASS,
  TRACKER_ROW_HEIGHT,
} from "./testTrackerPresentation";

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
  columnStorageKey: string;
  headerControls?: ReactNode;
  items: TrackerItem[];
  onCloneSystem: (system: TrackerSystem) => void;
  onEditSystemData: (systemId: string) => void;
  onSelectStation: (systemId: string, stationId: string) => void;
  onSelectSystem: (systemId: string) => void;
  onSystemUpdate: () => void;
  progress: TrackerProgress[];
  stations: TrackerStation[];
  systems: TrackerSystem[];
}

interface ColumnLayoutState {
  storageKey: string;
  widths: Record<string, number>;
}

const TRACKER_TABLE_PALETTE_STORAGE_KEY = "maintenance:test-tracker:table-palette";

const TRACKER_TABLE_PALETTES = {
  ocean: {
    label: "深海藍",
    frame: "#061321",
    surface: "#071522",
    header: "#10263a",
    headerAccent: "#102b43",
    even: "#081827",
    odd: "#091b2c",
    active: "#0c2340",
    actionEven: "#0a1d30",
    actionOdd: "#0b2034",
    actionActive: "#0d2946",
    hover: "#112b43",
    border: "#2a526f",
  },
  graphite: {
    label: "石墨灰",
    frame: "#0b1017",
    surface: "#101720",
    header: "#1a2633",
    headerAccent: "#202e3d",
    even: "#111a24",
    odd: "#151f2a",
    active: "#172b42",
    actionEven: "#172330",
    actionOdd: "#1a2836",
    actionActive: "#19334e",
    hover: "#223447",
    border: "#40556a",
  },
  teal: {
    label: "青綠",
    frame: "#041516",
    surface: "#06191b",
    header: "#0d2c31",
    headerAccent: "#10363b",
    even: "#071d20",
    odd: "#092326",
    active: "#0a3137",
    actionEven: "#0b292d",
    actionOdd: "#0d3034",
    actionActive: "#0d3a41",
    hover: "#123a3f",
    border: "#2b6469",
  },
  contrast: {
    label: "高對比",
    frame: "#02060c",
    surface: "#050b13",
    header: "#17324d",
    headerAccent: "#1b3b5b",
    even: "#07111d",
    odd: "#0c1928",
    active: "#102f54",
    actionEven: "#0c1d2f",
    actionOdd: "#10243a",
    actionActive: "#123861",
    hover: "#173b5d",
    border: "#3e7296",
  },
} as const;

type TrackerTablePaletteId = keyof typeof TRACKER_TABLE_PALETTES;

function loadStoredPalette(): TrackerTablePaletteId {
  if (typeof window === "undefined") return "ocean";

  try {
    const stored = window.localStorage.getItem(TRACKER_TABLE_PALETTE_STORAGE_KEY);
    return stored && stored in TRACKER_TABLE_PALETTES
      ? stored as TrackerTablePaletteId
      : "ocean";
  } catch {
    return "ocean";
  }
}

function persistPalette(paletteId: TrackerTablePaletteId) {
  try {
    window.localStorage.setItem(TRACKER_TABLE_PALETTE_STORAGE_KEY, paletteId);
  } catch {
    // Keep the selected palette for this session when storage is unavailable.
  }
}

function TrackerPaletteControl({
  onChange,
  value,
}: {
  onChange: (paletteId: TrackerTablePaletteId) => void;
  value: TrackerTablePaletteId;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="表格配色"
          title="表格配色"
          className="h-7 w-7 rounded-md border border-[#416985] bg-[#071522]/70 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-300/10 hover:text-cyan-50"
        >
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-xl border border-[#315b7b] bg-[#071522]/98 p-3 text-[#f3f8fc] shadow-[0_24px_70px_-28px_rgba(34,211,238,0.5)]"
      >
        <div className="flex items-start gap-2.5 border-b border-[#294b65] pb-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-100">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-sm font-bold">表格配色</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-[#91adc2]">立即套用並記住這台電腦的選擇。</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.entries(TRACKER_TABLE_PALETTES) as Array<[
            TrackerTablePaletteId,
            (typeof TRACKER_TABLE_PALETTES)[TrackerTablePaletteId],
          ]>).map(([paletteId, palette]) => {
            const selected = value === paletteId;
            return (
              <button
                key={paletteId}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(paletteId)}
                className={cn(
                  "rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                  selected
                    ? "border-cyan-300/70 bg-cyan-300/10"
                    : "border-[#294b65] bg-[#0b1b2d] hover:border-[#477593] hover:bg-[#10263a]"
                )}
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  {palette.label}
                  {selected && <Check className="h-3.5 w-3.5 text-cyan-200" />}
                </span>
                <span className="mt-2 flex overflow-hidden rounded border border-white/10">
                  {[palette.header, palette.even, palette.odd, palette.active].map((color) => (
                    <span key={color} className="h-4 flex-1" style={{ backgroundColor: color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
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

function loadStoredColumnWidths(storageKey: string) {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, Number(value)] as const)
        .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
    );
  } catch {
    return {};
  }
}

function persistColumnWidths(storageKey: string, widths: Record<string, number>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Private browsing can disable local storage; resizing still works for this session.
  }
}

function ResizableColumnHeader({
  children,
  className,
  columnKey,
  onReset,
  onResize,
  testId,
  width,
}: {
  children: ReactNode;
  className?: string;
  columnKey: string;
  onReset: (columnKey: string) => void;
  onResize: (columnKey: string, width: number) => void;
  testId?: string;
  width: number;
}) {
  const dragRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const spec = getTrackerColumnSpec(columnKey);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startWidth: width, startX: event.clientX };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    onResize(
      columnKey,
      dragRef.current.startWidth + event.clientX - dragRef.current.startX
    );
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      onReset(columnKey);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onResize(columnKey, width + direction * (event.shiftKey ? 40 : 16));
  };

  return (
    <div
      role="columnheader"
      data-testid={testId}
      className={cn("relative flex h-9 min-w-0 items-center", className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-label="調整欄位寬度"
        aria-orientation="vertical"
        aria-valuemax={spec.maxWidth}
        aria-valuemin={spec.minWidth}
        aria-valuenow={width}
        title="拖曳調整欄寬；雙擊或按 Home 還原"
        onDoubleClick={() => onReset(columnKey)}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        className="group absolute -right-1 top-0 z-40 flex h-full w-3 touch-none cursor-col-resize items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <span className="h-5 w-px rounded-full bg-[#416985] transition-colors group-hover:bg-cyan-300 group-focus-visible:bg-cyan-200" />
      </div>
    </div>
  );
}

export function TestProgressTable({
  columnStorageKey,
  headerControls,
  items,
  onCloneSystem,
  onEditSystemData,
  onSelectStation,
  onSelectSystem,
  onSystemUpdate,
  progress,
  stations,
  systems,
}: TestProgressTableProps) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  );
  const [columnLayout, setColumnLayout] = useState<ColumnLayoutState>(() => ({
    storageKey: columnStorageKey,
    widths: loadStoredColumnWidths(columnStorageKey),
  }));
  const [paletteId, setPaletteId] = useState<TrackerTablePaletteId>(loadStoredPalette);
  const [viewport, setViewport] = useState({ height: 520, scrollTop: 0 });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const latestColumnLayoutRef = useRef(columnLayout);
  latestColumnLayoutRef.current = columnLayout;

  const sortedStations = useMemo(
    () => [...stations].sort((left, right) => left.station_order - right.station_order),
    [stations]
  );
  const columnKeys = useMemo(
    () => [
      "machine",
      "serial",
      "status",
      ...sortedStations.map((station) => `station:${station.id}`),
      "actions",
    ],
    [sortedStations]
  );
  const columnWidths = useMemo(
    () => {
      const storedWidths = columnLayout.storageKey === columnStorageKey
        ? columnLayout.widths
        : {};
      return Object.fromEntries(
        columnKeys.map((columnKey) => [
          columnKey,
          getTrackerColumnWidth(columnKey, storedWidths),
        ])
      );
    },
    [columnKeys, columnLayout, columnStorageKey]
  );
  const gridColumns = getTrackerGridTemplate(columnKeys, columnWidths);
  const minWidth = columnKeys.reduce(
    (total, columnKey) => total + columnWidths[columnKey],
    24 + Math.max(0, columnKeys.length - 1) * 8
  );
  const stationProgressLookup = useMemo(
    () => createStationProgressLookup(items, progress),
    [items, progress]
  );
  const systemWindowKey = `${systems.length}:${systems[0]?.id || ""}:${systems[systems.length - 1]?.id || ""}`;
  const virtualRange = getTrackerVirtualRange({
    rowCount: systems.length,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height,
  });
  const visibleSystems = systems.slice(virtualRange.start, virtualRange.end);
  const activePalette = TRACKER_TABLE_PALETTES[paletteId];
  const paletteStyle = {
    "--tracker-table-frame": activePalette.frame,
    "--tracker-table-surface": activePalette.surface,
    "--tracker-table-header": activePalette.header,
    "--tracker-table-header-accent": activePalette.headerAccent,
    "--tracker-row-even": activePalette.even,
    "--tracker-row-odd": activePalette.odd,
    "--tracker-row-active": activePalette.active,
    "--tracker-action-even": activePalette.actionEven,
    "--tracker-action-odd": activePalette.actionOdd,
    "--tracker-action-active": activePalette.actionActive,
    "--tracker-row-hover": activePalette.hover,
    "--tracker-table-border": activePalette.border,
  } as CSSProperties & Record<`--${string}`, string>;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setColumnLayout((current) => current.storageKey === columnStorageKey
      ? current
      : {
          storageKey: columnStorageKey,
          widths: loadStoredColumnWidths(columnStorageKey),
        });
  }, [columnStorageKey]);

  useEffect(() => {
    if (columnLayout.storageKey !== columnStorageKey) return undefined;
    const timer = window.setTimeout(() => {
      persistColumnWidths(columnStorageKey, columnLayout.widths);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [columnLayout, columnStorageKey]);

  useEffect(() => {
    persistPalette(paletteId);
  }, [paletteId]);

  useEffect(() => () => {
    const latestLayout = latestColumnLayoutRef.current;
    if (latestLayout.storageKey === columnStorageKey) {
      persistColumnWidths(columnStorageKey, latestLayout.widths);
    }
  }, [columnStorageKey]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      setViewport((current) => ({ ...current, height: element.clientHeight }));
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isDesktop]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (element) element.scrollTop = 0;
    setViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [systemWindowKey]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const resizeColumn = useCallback((columnKey: string, width: number) => {
    const nextWidth = getTrackerColumnWidth(columnKey, { [columnKey]: width });
    setColumnLayout((current) => ({
      storageKey: columnStorageKey,
      widths: {
        ...(current.storageKey === columnStorageKey ? current.widths : {}),
        [columnKey]: nextWidth,
      },
    }));
  }, [columnStorageKey]);

  const resetColumn = useCallback((columnKey: string) => {
    setColumnLayout((current) => {
      const widths = current.storageKey === columnStorageKey
        ? { ...current.widths }
        : {};
      delete widths[columnKey];
      return { storageKey: columnStorageKey, widths };
    });
  }, [columnStorageKey]);

  const handleScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const height = event.currentTarget.clientHeight;
    const scrollTop = event.currentTarget.scrollTop;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      setViewport((current) => current.height === height && current.scrollTop === scrollTop
        ? current
        : { height, scrollTop });
      scrollFrameRef.current = null;
    });
  };

  const getStationPercent = (systemId: string, stationId: string) => {
    return stationProgressLookup.get(getStationProgressKey(systemId, stationId)) ?? 0;
  };

  if (!systems.length) {
    return (
      <div className="maintenance-panel flex min-h-[280px] items-center justify-center text-sm text-[#a9c0d1]">
        目前篩選條件沒有符合的機台。
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="space-y-2">
        {systems.map((system) => {
          const status = normalizeStatus(system);
          return (
            <div
              key={system.id}
              className="maintenance-panel w-full p-3 [contain-intrinsic-size:110px] [content-visibility:auto]"
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
                <Badge variant="outline" className={cn("rounded-md", statusClass(status))}>{status}</Badge>
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center gap-3 rounded-md p-1 text-left hover:bg-[#061426] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                onClick={() => onSelectSystem(system.id)}
                aria-label={`編輯 ${system.system_name} 的測試進度`}
              >
                <SegmentedProgress
                  value={system.overall_progress ?? 0}
                  className="flex-1"
                  label={`${system.system_name} 整體進度`}
                />
                <span className="font-data text-xs text-cyan-100">{system.overall_progress ?? 0}%</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      data-ui="tracker-table"
      style={paletteStyle}
      className="overflow-hidden rounded-xl border border-[var(--tracker-table-border)] bg-[var(--tracker-table-frame)] shadow-[0_18px_50px_-38px_rgba(34,211,238,0.55)]"
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="max-h-[calc(100vh-238px)] min-h-[420px] overflow-auto bg-[var(--tracker-table-surface)] [scrollbar-gutter:stable]"
      >
        <div
          role="table"
          aria-colcount={columnKeys.length}
          aria-rowcount={systems.length + 1}
          style={{ minWidth, width: "100%" }}
        >
          <div
            role="row"
            data-ui="tracker-header"
            className="sticky top-0 z-20 grid h-11 items-center gap-2 border-b border-[var(--tracker-table-border)] bg-[var(--tracker-table-header)] px-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#dcebf5] shadow-[0_8px_24px_-22px_rgba(56,189,248,0.9)]"
            style={{ gridTemplateColumns: gridColumns }}
          >
            <ResizableColumnHeader
              columnKey="machine"
              width={columnWidths.machine}
              onResize={resizeColumn}
              onReset={resetColumn}
              className={cn(
                "sticky left-0 z-30 bg-[var(--tracker-table-header)] pr-2",
                TRACKER_MACHINE_COLUMN_BOUNDARY_CLASS,
              )}
            >
              機台 ID
            </ResizableColumnHeader>
            <ResizableColumnHeader
              columnKey="serial"
              width={columnWidths.serial}
              onResize={resizeColumn}
              onReset={resetColumn}
              className="pr-2"
            >
              序號
            </ResizableColumnHeader>
            <ResizableColumnHeader
              columnKey="status"
              width={columnWidths.status}
              onResize={resizeColumn}
              onReset={resetColumn}
              className="pr-2"
            >
              狀態
            </ResizableColumnHeader>
            {sortedStations.map((station) => {
              const columnKey = `station:${station.id}`;
              return (
                <ResizableColumnHeader
                  key={station.id}
                  columnKey={columnKey}
                  width={columnWidths[columnKey]}
                  onResize={resizeColumn}
                  onReset={resetColumn}
                  className="pr-2 text-center"
                >
                  <div className="truncate" title={station.station_name}>{station.station_name}</div>
                </ResizableColumnHeader>
              );
            })}
            <ResizableColumnHeader
              columnKey="actions"
              width={columnWidths.actions}
              onResize={resizeColumn}
              onReset={resetColumn}
              testId="progress-actions-header"
              className="sticky right-0 z-50 border-l border-[var(--tracker-table-border)] bg-[var(--tracker-table-header-accent)] px-2 text-center"
            >
              <div className="flex items-center justify-center gap-1">
                <span>操作</span>
                <TrackerPaletteControl value={paletteId} onChange={setPaletteId} />
                {headerControls}
              </div>
            </ResizableColumnHeader>
          </div>

          <div
            role="rowgroup"
            className="relative"
            style={{ height: systems.length * TRACKER_ROW_HEIGHT }}
          >
            {visibleSystems.map((system, visibleIndex) => {
              const status = normalizeStatus(system);
              const absoluteIndex = virtualRange.start + visibleIndex;
              const rowSurface = status === "進行中"
                ? "var(--tracker-row-active)"
                : absoluteIndex % 2 === 0
                  ? "var(--tracker-row-even)"
                  : "var(--tracker-row-odd)";
              const actionSurface = status === "進行中"
                ? "var(--tracker-action-active)"
                : absoluteIndex % 2 === 0
                  ? "var(--tracker-action-even)"
                  : "var(--tracker-action-odd)";
              const rowStyle = {
                gridTemplateColumns: gridColumns,
                height: TRACKER_ROW_HEIGHT,
                top: absoluteIndex * TRACKER_ROW_HEIGHT,
                "--tracker-row-surface": rowSurface,
                "--tracker-action-surface": actionSurface,
              } as CSSProperties & Record<`--${string}`, string>;
              return (
                <div
                  key={system.id}
                  role="row"
                  aria-rowindex={absoluteIndex + 2}
                  data-machine-row={system.id}
                  data-ui="tracker-row"
                  className={cn(
                    "group absolute left-0 right-0 grid items-center gap-2 border-b border-[var(--tracker-table-border)] bg-[var(--tracker-row-surface)] px-3 py-2.5 text-[13px] transition-colors duration-150 hover:bg-[var(--tracker-row-hover)]",
                    status === "進行中" && "shadow-[inset_3px_0_0_#3b82f6]"
                  )}
                  style={rowStyle}
                >
                  <div
                    role="cell"
                    data-testid={`machine-cell-${system.id}`}
                    className={cn(
                      "sticky left-0 z-10 flex h-full min-w-0 items-stretch overflow-hidden border-r border-[var(--tracker-table-border)] bg-[var(--tracker-row-surface)] pr-3 group-hover:bg-[var(--tracker-row-hover)]",
                      TRACKER_MACHINE_COLUMN_BOUNDARY_CLASS
                    )}
                  >
                    <button
                      type="button"
                      className="flex h-full w-full min-w-0 flex-col items-start justify-center overflow-hidden text-left"
                      onClick={() => onEditSystemData(system.id)}
                    >
                      <div className="truncate font-semibold leading-4 text-[#f3f8fc]">{system.system_name}</div>
                      <div className="truncate text-[10px] leading-3 text-[#91adc2]">{system.assigned_engineer || "未指定"}</div>
                    </button>
                  </div>
                  <div role="cell" className="truncate font-data text-xs text-[#b9cddd]" title={system.serial_number || ""}>
                    {system.serial_number || "-"}
                  </div>
                  <div role="cell">
                    <Badge variant="outline" className={cn("w-fit rounded-full px-2 text-[10px]", statusClass(status))}>
                      {status}
                    </Badge>
                  </div>

                  {sortedStations.map((station) => {
                    const percent = getStationPercent(system.id, station.id);
                    return (
                      <div key={station.id} role="cell" className="min-w-0 px-0.5">
                        <button
                          type="button"
                          className="w-full rounded-lg border border-transparent bg-[#0a1a2a]/55 px-2 py-2 text-left transition-colors hover:border-[#315b7b] hover:bg-[#10263a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                          onClick={() => onSelectStation(system.id, station.id)}
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
                      </div>
                    );
                  })}

                  <div
                    role="cell"
                    data-testid={`progress-actions-${system.id}`}
                    data-ui="tracker-actions"
                    className={cn(
                      "sticky right-0 z-20 flex h-full items-center justify-end gap-1.5 border-l border-[var(--tracker-table-border)] bg-[var(--tracker-action-surface)] px-2 shadow-[-12px_0_22px_-22px_rgba(56,189,248,0.9)] group-hover:bg-[var(--tracker-row-hover)]"
                    )}
                  >
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`edit-progress-${system.id}`}
                      aria-label={`編輯 ${system.system_name} 的測試進度`}
                      className="h-9 gap-1.5 rounded-lg border border-cyan-300/55 bg-cyan-300/15 px-3 text-xs font-semibold text-cyan-50 hover:border-cyan-200 hover:bg-cyan-300/25 focus-visible:ring-2 focus-visible:ring-cyan-200"
                      onClick={() => onSelectSystem(system.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      編輯進度
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 shrink-0 gap-1.5 rounded-lg border border-[#315b7b] px-2.5 text-xs text-[#b9cddd] hover:border-cyan-300/60 hover:bg-[#102b48] hover:text-cyan-50"
                          aria-label={`${system.system_name} 更多操作`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span>其他功能</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        data-ui="tracker-action-menu"
                        className="w-[17.5rem] overflow-hidden rounded-2xl border border-[#315b7b] bg-[#081827]/98 p-0 text-slate-50 shadow-[0_24px_70px_-24px_rgba(14,165,233,0.55)]"
                      >
                        <div className="border-b border-[#294b65] bg-gradient-to-br from-[#102d45] to-[#0a1c2d] px-3.5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-50">機台操作</p>
                              <p className="truncate text-xs text-slate-400">{system.system_name}</p>
                            </div>
                          </div>
                        </div>

                        <div data-ui="tracker-action-menu-primary" className="space-y-2 p-2.5">
                          <SystemCompleteButton
                            systemId={system.id}
                            systemName={system.system_name}
                            stations={stations as never[]}
                            items={items as never[]}
                            onSystemUpdate={onSystemUpdate}
                            variant="menu"
                          />
                          <SystemEditDialog
                            systemId={system.id}
                            systemName={system.system_name}
                            assignedEngineer={system.assigned_engineer || ""}
                            onUpdate={onSystemUpdate}
                            variant="menu"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10 w-full justify-start rounded-xl border-cyan-300/30 bg-cyan-300/[0.08] px-3 font-semibold text-cyan-100 hover:border-cyan-200/50 hover:bg-cyan-300/15 hover:text-cyan-50"
                            onClick={() => onCloneSystem(system)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            複製為連號機台
                          </Button>
                        </div>

                        <div
                          data-ui="tracker-action-menu-danger"
                          className="border-t border-[#294b65] bg-[#07131f] px-2.5 pb-2.5 pt-2"
                        >
                          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            管理操作
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <SystemResetDialog
                              systemId={system.id}
                              systemName={system.system_name}
                              onReset={onSystemUpdate}
                              variant="menu"
                            />
                            <SystemDeleteButton
                              systemId={system.id}
                              systemName={system.system_name}
                              onSystemUpdate={onSystemUpdate}
                              variant="menu"
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
