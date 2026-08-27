import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  FolderKanban,
  Gauge,
  Hourglass,
  Layers3,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { MainWorkspaceHeader } from "@/components/layout/MainWorkspaceHeader";
import { DesktopMaintenanceSidebar } from "@/components/layout/Sidebar/desktop/DesktopMaintenanceSidebar";
import { maintenanceNavigationItems } from "@/components/layout/Sidebar/shared/navigation";
import { DesktopTestProgressTable } from "@/components/test-tracker/TestProgressTable/desktop/DesktopTestProgressTable";
import type {
  TrackerItem,
  TrackerProgress,
  TrackerStation,
  TrackerSystem,
} from "@/components/test-tracker/TestProgressTable/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const workspaces = [
  { id: "workspace-home", label: "首頁" },
  { id: "station-status", label: "機台維修紀錄中心" },
  { id: "material-requests", label: "料號申請" },
  { id: "data-center", label: "Data-center" },
  { id: "pcb-designer", label: "PCB Designer" },
  { id: "user-management", label: "後台管理" },
  { id: "ai-chat", label: "資料查詢空間" },
  { id: "performance", label: "績效考核系統" },
];

const stations: TrackerStation[] = [
  { id: "station-0", station_name: "STATION 0 - 工段組裝", station_order: 0 },
  { id: "station-1", station_name: "STATION 1 - 開機", station_order: 1 },
  { id: "station-2", station_name: "STATION 2 - 功能驗證", station_order: 2 },
  { id: "station-3", station_name: "STATION 3 - 壓力測試", station_order: 3 },
  { id: "station-4", station_name: "STATION 4 - 出貨檢查", station_order: 4 },
];

const systems: TrackerSystem[] = [
  { id: "ben", system_name: "Ben", serial_number: "-", status: "未開始", assigned_engineer: "未指定", overall_progress: 0 },
  { id: "test2", system_name: "Test2", serial_number: "-", status: "進行中", assigned_engineer: "未指定", overall_progress: 40 },
  { id: "md-01", system_name: "MD-49rack_2651037300", serial_number: "265103730010", status: "進行中", assigned_engineer: "未指定", overall_progress: 62 },
  { id: "md-02", system_name: "MD-49rack_2678376800", serial_number: "267837680044", status: "進行中", assigned_engineer: "未指定", overall_progress: 68 },
  { id: "md-03", system_name: "MD-49rack_2678377300", serial_number: "267837730036", status: "進行中", assigned_engineer: "未指定", overall_progress: 74 },
  { id: "md-04", system_name: "MD-49rack_2678377500", serial_number: "267837750031", status: "進行中", assigned_engineer: "未指定", overall_progress: 78 },
  { id: "md-05", system_name: "MD-49rack_2678377900", serial_number: "267837790025", status: "進行中", assigned_engineer: "未指定", overall_progress: 82 },
  { id: "md-06", system_name: "MD-49rack_2678378200", serial_number: "267837820019", status: "已完成", assigned_engineer: "未指定", overall_progress: 100 },
];

const items: TrackerItem[] = stations.flatMap((station) =>
  Array.from({ length: 4 }, (_, index) => ({
    id: `${station.id}-item-${index}`,
    station_id: station.id,
  })),
);

const progress: TrackerProgress[] = systems.flatMap((system, systemIndex) =>
  stations.flatMap((station, stationIndex) => {
    const completed = system.status === "已完成" || stationIndex < Math.min(3, Math.floor(systemIndex / 2));
    const partial = system.status === "進行中" && stationIndex === Math.min(3, Math.floor(systemIndex / 2));
    return items
      .filter((item) => item.station_id === station.id)
      .map((item, itemIndex) => ({
        item_id: item.id,
        station_id: station.id,
        system_id: system.id,
        status: completed || (partial && itemIndex < 3) ? "Done" : partial && itemIndex === 3 ? "On-going" : "Not Start",
      }));
  }),
);

const KPI_TONES = {
  blue: {
    card: "border-blue-400/45 bg-[linear-gradient(135deg,rgba(14,48,91,0.96),rgba(7,24,46,0.98))] shadow-[0_0_22px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(147,197,253,0.12)]",
    detail: "text-blue-200/55", icon: "bg-blue-500/20 text-blue-300 shadow-[0_0_18px_rgba(59,130,246,0.42)]", label: "text-blue-100/80",
  },
  cyan: {
    card: "border-cyan-400/45 bg-[linear-gradient(135deg,rgba(7,54,70,0.96),rgba(6,27,43,0.98))] shadow-[0_0_22px_rgba(34,211,238,0.17),inset_0_1px_0_rgba(103,232,249,0.12)]",
    detail: "text-cyan-200/55", icon: "bg-cyan-400/20 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.4)]", label: "text-cyan-100/80",
  },
  emerald: {
    card: "border-emerald-400/45 bg-[linear-gradient(135deg,rgba(7,59,51,0.96),rgba(5,31,36,0.98))] shadow-[0_0_22px_rgba(52,211,153,0.17),inset_0_1px_0_rgba(110,231,183,0.12)]",
    detail: "text-emerald-200/55", icon: "bg-emerald-400/20 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.4)]", label: "text-emerald-100/80",
  },
  amber: {
    card: "border-amber-400/45 bg-[linear-gradient(135deg,rgba(65,45,12,0.96),rgba(31,28,20,0.98))] shadow-[0_0_22px_rgba(245,158,11,0.17),inset_0_1px_0_rgba(252,211,77,0.12)]",
    detail: "text-amber-200/55", icon: "bg-amber-400/20 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.4)]", label: "text-amber-100/80",
  },
  violet: {
    card: "border-violet-400/45 bg-[linear-gradient(135deg,rgba(48,38,91,0.96),rgba(20,24,50,0.98))] shadow-[0_0_22px_rgba(139,92,246,0.18),inset_0_1px_0_rgba(196,181,253,0.12)]",
    detail: "text-violet-200/55", icon: "bg-violet-400/20 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,0.42)]", label: "text-violet-100/80",
  },
} as const;

function TrackerKpi({ icon: Icon, label, tone, value, detail }: {
  icon: typeof Boxes; label: string; tone: keyof typeof KPI_TONES; value: string | number; detail: string;
}) {
  const classes = KPI_TONES[tone];
  return (
    <div className={cn("flex h-[72px] min-w-0 items-center gap-3 rounded-xl border px-3 py-2", classes.card)}>
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", classes.icon)}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0"><div className={cn("truncate text-[11px]", classes.label)}>{label}</div><div className="font-data mt-0.5 flex items-baseline gap-1 text-[23px] font-semibold leading-6 text-[#f3f8fc]">{value}</div><div className={cn("truncate text-[10px]", classes.detail)}>{detail}</div></div>
    </div>
  );
}

function ProjectCommandBar() {
  return (
    <div data-ui="project-command-bar" className="maintenance-project-bar relative z-10 flex h-14 min-h-0 items-center gap-3 rounded-lg border px-3 py-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><FolderKanban className="h-4 w-4" /></div>
      <Button variant="outline" className="h-10 w-full max-w-[310px] justify-between rounded-lg border border-cyan-200/20 bg-[#10263a] px-3 shadow-none">
        <span className="min-w-0 text-left"><span className="block truncate text-sm font-semibold text-[#f3f8fc]">Carlo-Next-(GB300)</span><span className="block truncate text-xs text-[#a9c0d1]">未設定負責人</span></span>
      </Button>
      <Badge variant="outline" className="h-8 shrink-0 rounded-lg border-emerald-300/35 bg-emerald-400/12 px-2.5 text-emerald-100">進行中</Badge>
      <div className="hidden items-center gap-1 rounded-lg border border-[#294861]/80 bg-[#071827]/70 p-1 xl:flex">
        <span className="rounded-md px-2.5 py-1 text-xs text-[#9fb8ca]">機台 <strong className="font-mono text-[#f3f8fc]">89</strong></span>
        <span className="rounded-md border-l border-[#294861]/70 px-2.5 py-1 text-xs text-[#9fb8ca]">待處理問題 <strong className="font-mono text-amber-100">9</strong></span>
        <span className="flex items-center gap-1.5 rounded-md border-l border-[#294861]/70 px-2.5 py-1 text-xs text-[#9fb8ca]"><CalendarDays className="h-3.5 w-3.5" />未設定</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button className="h-9 rounded-lg border border-cyan-300/45 bg-cyan-400/18 px-3 text-cyan-50 shadow-none"><Plus className="mr-2 h-4 w-4" />新增機台</Button>
        <Button variant="ghost" className="h-9 rounded-lg border border-violet-300/30 bg-violet-400/12 px-3 text-violet-100"><Pencil className="mr-2 h-4 w-4" />編輯專案</Button>
        <Button variant="outline" className="h-9 rounded-lg border-amber-300/30 bg-amber-400/12 px-3 text-amber-100"><Layers3 className="mr-2 h-4 w-4" />專案中心</Button>
      </div>
    </div>
  );
}

function DesktopDemo() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [activeModule, setActiveModule] = useState("test-tracker");
  const filtered = useMemo(() => systems.filter((system) => {
    const keyword = search.trim().toLowerCase();
    return (!keyword || `${system.system_name} ${system.serial_number}`.toLowerCase().includes(keyword)) && (status === "all" || system.status === status);
  }), [search, status]);

  return (
    <TooltipProvider>
      <div className="app-shell flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background">
        <MainWorkspaceHeader items={workspaces} activeItem="station-status" onSelect={() => undefined} onLogout={() => undefined} userName="Mistin" userRoleLabel="管理員" showOnlineUsers={false} />
        <main className="mobile-workspace-main flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <div className="maintenance-workspace relative h-full min-h-0 overflow-hidden">
            <div className="flex h-full min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-3">
              <ProjectCommandBar />
              <div className="relative flex min-h-0 flex-1 gap-3">
                <DesktopMaintenanceSidebar activeModule={activeModule} navigationItems={maintenanceNavigationItems} onModuleChange={setActiveModule} desktopStickyClass="top-[140px] h-full" />
                <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-xl bg-[#06111f]">
                  <div className="maintenance-page !p-2 space-y-2">
                    <div className="grid grid-cols-5 gap-2">
                      <TrackerKpi icon={Boxes} label="機台總數" value="89 台" detail="目前專案全部機台" tone="cyan" />
                      <TrackerKpi icon={Hourglass} label="未開始" value="1 台" detail="1%" tone="amber" />
                      <TrackerKpi icon={Activity} label="進行中" value="74 台" detail="83%" tone="blue" />
                      <TrackerKpi icon={CheckCircle2} label="已完成" value="14 台" detail="16%" tone="emerald" />
                      <TrackerKpi icon={Gauge} label="整體完成率" value="29.8%" detail="依所有機台平均進度" tone="violet" />
                    </div>
                    <section className="maintenance-toolbar space-y-2 p-2" aria-label="L10 測試追蹤篩選">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[230px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91adc2]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 border-[#315574] bg-[#06111f] pl-9" placeholder="搜尋機台、序號或工程師" /></div>
                        <Select defaultValue="all"><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部站點</SelectItem>{stations.map((station) => <SelectItem key={station.id} value={station.id}>{station.station_name}</SelectItem>)}</SelectContent></Select>
                        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-[135px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部狀態</SelectItem><SelectItem value="未開始">未開始</SelectItem><SelectItem value="進行中">進行中</SelectItem><SelectItem value="已完成">已完成</SelectItem></SelectContent></Select>
                        <Select defaultValue="all"><SelectTrigger className="h-9 w-[145px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部工程師</SelectItem><SelectItem value="unassigned">未指定</SelectItem></SelectContent></Select>
                        <Select defaultValue="created-desc"><SelectTrigger className="h-9 w-[175px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="created-desc">建立時間：新到舊</SelectItem><SelectItem value="machine-asc">機台 ID：小到大</SelectItem></SelectContent></Select>
                        <div className="flex h-9 items-center gap-1 rounded-lg border border-[#315574] bg-[#06111f] p-1"><Button variant="ghost" size="icon" className="h-7 w-8 rounded-md bg-[#183654] text-cyan-100"><List className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-8 rounded-md"><LayoutGrid className="h-4 w-4" /></Button></div>
                        <Badge variant="outline" className="font-data ml-auto h-8 rounded-lg border-blue-300/35 bg-blue-300/10 px-3 text-blue-100">{filtered.length} 台</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-[#254866] pt-2"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"><span className="flex items-center gap-1 text-[11px] font-semibold text-[#8fabbe]"><SlidersHorizontal className="h-3.5 w-3.5" />目前條件</span><span className="text-[11px] text-[#7895aa]">顯示全部機台</span><Button variant="ghost" size="sm" className="h-7 text-xs">清除全部</Button></div><div className="flex flex-wrap items-center gap-2 border-l border-[#254866] pl-2"><Button variant="outline" size="sm" className="h-9 rounded-lg"><Plus className="mr-2 h-4 w-4" />新增機台</Button><Button variant="outline" size="sm" className="h-9 rounded-lg"><RotateCcw className="mr-2 h-4 w-4" />重置專案</Button><Button variant="outline" size="sm" className="h-9 rounded-lg"><Download className="mr-2 h-4 w-4" />匯出報表</Button><Button variant="outline" size="sm" className="h-9 rounded-lg"><FileText className="mr-2 h-4 w-4" />PDF</Button></div></div>
                    </section>
                    <DesktopTestProgressTable columnStorageKey="desktop-demo:columns" systems={filtered} stations={stations} items={items} linkedIssues={[]} progress={progress} onCloneSystem={() => undefined} onEditSystemData={() => undefined} onSelectStation={() => undefined} onSelectSystem={() => undefined} onSystemUpdate={() => undefined} />
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1a3858] bg-[#0a1a2e] px-3 py-2 text-xs text-[#a9c0d1]"><div className="flex items-center gap-2"><span>每頁</span><Button variant="outline" size="sm" className="h-8">25 筆</Button><span className="font-data">顯示 1-{filtered.length}，共 {filtered.length} 台</span></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-8 w-8" disabled>‹</Button><span className="font-data min-w-14 text-center">1/1</span><Button variant="outline" size="icon" className="h-8 w-8" disabled>›</Button></div></div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<DesktopDemo />);
