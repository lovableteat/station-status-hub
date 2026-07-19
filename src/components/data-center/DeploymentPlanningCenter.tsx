import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Activity,
  AlertTriangle,
  Box,
  Boxes,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Cpu,
  Eye,
  EyeOff,
  FileBox,
  Focus,
  HardDrive,
  Layers3,
  LayoutDashboard,
  Menu,
  Minus,
  Move3d,
  Network,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PencilRuler,
  Plus,
  RotateCw,
  Search,
  Server,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Upload,
  Wifi,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { DataCenter3DPlanner } from "./DataCenter3DPlanner";
import {
  BUILT_IN_RACK_MODELS,
  INITIAL_SITE_PLANS,
  createRackFromModel,
} from "./dataCenterSeed";
import { DEFAULT_FACILITY_PLAN } from "./dataCenterTypes";
import {
  convertStepToGlb,
  type ModelConversionProgress,
} from "./modelConversionWorker";
import type {
  CameraPreset,
  DataCenterAssetKind,
  DataCenterLayer,
  FacilityAisleKind,
  FacilityPlan,
  ImportedStepDimensions,
  RackDevice,
  RackDeviceHealth,
  RackModelDefinition,
  RackPlan,
  RackStatus,
  SitePlan,
} from "./dataCenterTypes";

const LAYOUT_STORAGE_KEY = "data-center-digital-twin-layout-v2";
const FACILITY_STORAGE_KEY = "data-center-digital-twin-facility-v1";

const STATUS_LABELS: Record<RackStatus, string> = {
  allocated: "運行中",
  reserved: "預留",
  available: "可配置",
  blocked: "受阻",
};

const HEALTH_LABELS: Record<RackDeviceHealth, string> = {
  healthy: "正常",
  warning: "注意",
  critical: "異常",
  offline: "離線",
};

const HEALTH_ORDER: Record<RackDeviceHealth, number> = {
  healthy: 0,
  warning: 1,
  offline: 2,
  critical: 3,
};

const LAYER_OPTIONS: Array<{
  id: DataCenterLayer;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}> = [
  { id: "overview", label: "營運總覽", description: "機櫃配置與狀態", icon: LayoutDashboard, color: "#38bdf8" },
  { id: "health", label: "健康狀態", description: "異常、警告與離線", icon: Activity, color: "#34d399" },
  { id: "power", label: "電力路徑", description: "PDU A/B 與負載", icon: Zap, color: "#fbbf24" },
  { id: "network", label: "網路拓撲", description: "Fabric 與 uplink", icon: Network, color: "#22d3ee" },
  { id: "cooling", label: "冷卻分布", description: "冷通道與溫度", icon: Snowflake, color: "#60a5fa" },
];

function readInitialSites() {
  if (typeof window === "undefined") return INITIAL_SITE_PLANS;

  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return INITIAL_SITE_PLANS;
    const parsed = JSON.parse(raw) as SitePlan[];
    const valid =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (site) =>
          Array.isArray(site.racks) &&
          site.racks.every(
            (rack) =>
              typeof rack.modelId === "string" &&
              typeof rack.temperatureC === "number" &&
              typeof rack.utilizationPercent === "number"
          )
      );

    if (!valid) return INITIAL_SITE_PLANS;

    return parsed.map((site) => ({
      ...site,
      racks: site.racks.map((rack) => ({
        ...rack,
        modelId:
          BUILT_IN_RACK_MODELS[rack.modelId]?.kind === "rack" ? rack.modelId : "generic-42u",
        l10ModelId:
          BUILT_IN_RACK_MODELS[rack.l10ModelId]?.kind === "l10"
            ? rack.l10ModelId
            : "l10-placeholder",
        l10Count:
          typeof rack.l10Count === "number"
            ? Math.max(0, Math.min(8, Math.round(rack.l10Count)))
            : rack.status === "available"
              ? 0
              : 4,
      })),
    }));
  } catch {
    return INITIAL_SITE_PLANS;
  }
}

function cloneDefaultFacilityPlan(): FacilityPlan {
  return {
    ...DEFAULT_FACILITY_PLAN,
    aisles: DEFAULT_FACILITY_PLAN.aisles.map((aisle) => ({ ...aisle })),
    powerFeeds: DEFAULT_FACILITY_PLAN.powerFeeds.map((feed) => ({ ...feed })),
  };
}

function readInitialFacilityPlans(): Record<string, FacilityPlan> {
  const defaults = Object.fromEntries(
    INITIAL_SITE_PLANS.map((site) => [site.id, cloneDefaultFacilityPlan()])
  );
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(FACILITY_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, FacilityPlan>;
    if (!parsed || typeof parsed !== "object") return defaults;

    return Object.fromEntries(
      Object.entries(parsed).map(([siteId, plan]) => {
        const base = cloneDefaultFacilityPlan();
        if (!plan || typeof plan !== "object") return [siteId, base];
        return [
          siteId,
          {
            ...base,
            ...plan,
            width: Number.isFinite(plan.width) ? Math.max(8, plan.width) : base.width,
            depth: Number.isFinite(plan.depth) ? Math.max(8, plan.depth) : base.depth,
            wallHeight: Number.isFinite(plan.wallHeight) ? Math.max(2.4, plan.wallHeight) : base.wallHeight,
            aisles: Array.isArray(plan.aisles) ? plan.aisles : base.aisles,
            powerFeeds: Array.isArray(plan.powerFeeds) ? plan.powerFeeds : base.powerFeeds,
          },
        ];
      })
    );
  } catch {
    return defaults;
  }
}

function getRackHealth(rack: RackPlan): RackDeviceHealth {
  return rack.devices.reduce<RackDeviceHealth>((worst, device) => {
    return HEALTH_ORDER[device.health] > HEALTH_ORDER[worst] ? device.health : worst;
  }, "healthy");
}

function getHealthTone(health: RackDeviceHealth) {
  const tones: Record<RackDeviceHealth, string> = {
    healthy: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/30 bg-amber-400/12 text-amber-100",
    critical: "border-rose-300/35 bg-rose-400/14 text-rose-100",
    offline: "border-slate-300/20 bg-slate-400/10 text-slate-200",
  };
  return tones[health];
}

function getStatusTone(status: RackStatus) {
  const tones: Record<RackStatus, string> = {
    allocated: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
    reserved: "border-amber-300/25 bg-amber-400/10 text-amber-100",
    available: "border-blue-300/25 bg-blue-400/10 text-blue-100",
    blocked: "border-rose-300/30 bg-rose-400/12 text-rose-100",
  };
  return tones[status];
}

function formatDimensions(dimensions: ImportedStepDimensions) {
  return `${dimensions.widthMm.toLocaleString()} × ${dimensions.depthMm.toLocaleString()} × ${dimensions.heightMm.toLocaleString()} mm`;
}

function getL10Capacity(rack: RackPlan, model: RackModelDefinition) {
  const estimatedRackUnits = model.rackUnits ?? Math.max(1, Math.ceil(model.dimensions.heightMm / 44.45));
  const availableRackUnits = Math.max(0, rack.capacityU - 8);
  return Math.max(1, Math.floor(availableRackUnits / estimatedRackUnits));
}

function getDeviceIcon(type: RackDevice["type"]): LucideIcon {
  const icons: Record<RackDevice["type"], LucideIcon> = {
    "compute-tray": Cpu,
    "switch-tray": Network,
    "tor-switch": Wifi,
    psu: Zap,
    management: CircleGauge,
    "storage-tray": HardDrive,
  };
  return icons[type];
}

function IconTooltipButton({
  label,
  icon: Icon,
  active,
  onClick,
  className,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
            active
              ? "border-blue-300/50 bg-blue-500/20 text-blue-50 shadow-[0_12px_30px_-18px_rgba(59,130,246,0.95)]"
              : "border-[#214669] bg-[#10283d] text-blue-100 hover:border-blue-300/45 hover:bg-[#16324b] hover:text-white",
            className
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="border-[#214669] bg-[#081c2d] text-slate-100">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface SceneNavigatorProps {
  sites: SitePlan[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
  racks: RackPlan[];
  models: Record<string, RackModelDefinition>;
  selectedRackId: string;
  onRackSelect: (rackId: string) => void;
  activeLayer: DataCenterLayer;
  onLayerChange: (layer: DataCenterLayer) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function SceneNavigator({
  sites,
  selectedSiteId,
  onSiteChange,
  racks,
  models,
  selectedRackId,
  onRackSelect,
  activeLayer,
  onLayerChange,
  searchTerm,
  onSearchChange,
  collapsed = false,
  onToggleCollapse,
}: SceneNavigatorProps) {
  const filteredRacks = racks.filter((rack) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    const model = models[rack.modelId];
    return [rack.cabinet, rack.owner, rack.zone, rack.row, model?.manufacturer, model?.name]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 bg-[#081c2d] py-3">
        {onToggleCollapse ? (
          <IconTooltipButton label="展開場景導覽" icon={PanelLeftOpen} onClick={onToggleCollapse} />
        ) : null}
        <div className="my-1 h-px w-8 bg-[#214669]" />
        {LAYER_OPTIONS.map((layer) => (
          <IconTooltipButton
            key={layer.id}
            label={layer.label}
            icon={layer.icon}
            active={activeLayer === layer.id}
            onClick={() => onLayerChange(layer.id)}
          />
        ))}
        <div className="my-1 h-px w-8 bg-[#214669]" />
        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[#214669] bg-[#10283d] text-blue-100">
          <Boxes className="h-[18px] w-[18px]" />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-[#081c2d] bg-blue-400 px-1 text-[9px] font-black text-[#071421]">
            {racks.length}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#081c2d]">
      <div className="flex min-h-[82px] shrink-0 items-center justify-between border-b border-[#163653] px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-blue-300/30 bg-blue-400/15 text-blue-100">
            <Layers3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-black tracking-[-0.02em] text-white">場景導覽</div>
            <p className="mt-1 truncate text-[11px] font-semibold text-blue-200/65">站點、圖層與機櫃</p>
          </div>
        </div>
        {onToggleCollapse ? (
          <IconTooltipButton
            label="收合場景導覽"
            icon={PanelLeftClose}
            onClick={onToggleCollapse}
            className="h-9 w-9"
          />
        ) : null}
      </div>

      <div className="shrink-0 space-y-3 border-b border-[#163653] px-4 py-4">
        <label className="block">
          <span className="mb-2 block text-[11px] font-black tracking-[0.08em] text-blue-200/70">目前站點</span>
          <Select value={selectedSiteId} onValueChange={onSiteChange}>
            <SelectTrigger className="h-11 rounded-xl border-[#214669] bg-[#10283d] px-3 text-sm font-semibold text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[#214669] bg-[#081c2d] text-slate-100">
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="relative block">
          <span className="sr-only">搜尋機櫃</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200/50" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜尋機櫃或廠牌"
            className="h-11 rounded-xl border-[#214669] bg-[#10283d] pl-10 text-sm text-white placeholder:text-slate-400"
          />
        </label>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-3.5">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-black text-white">顯示圖層</span>
              <span className="rounded-full bg-blue-400/10 px-2 py-1 text-[10px] font-bold text-blue-200">{LAYER_OPTIONS.length} 個</span>
            </div>
            <div className="space-y-1">
              {LAYER_OPTIONS.map((layer) => {
                const Icon = layer.icon;
                const selected = activeLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => onLayerChange(layer.id)}
                    className={cn(
                      "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
                      selected
                        ? "border-blue-300/45 bg-blue-500/20 text-white shadow-[0_12px_26px_-22px_rgba(59,130,246,0.9)]"
                        : "border-transparent bg-[#10283d]/55 text-slate-300 hover:border-[#2b5274] hover:bg-[#10283d]"
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", selected ? "border-blue-200/35 bg-blue-300/15 text-blue-100" : "border-[#214669] bg-[#081c2d] text-blue-200/75")}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{layer.label}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">{layer.description}</span>
                    </span>
                    {selected ? <Check className="h-3.5 w-3.5 text-blue-100" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-3.5">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-black text-white">機櫃清單</span>
              <Badge className="border-0 bg-blue-400/10 text-[10px] font-bold text-blue-200 shadow-none">
                {filteredRacks.length} / {racks.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {filteredRacks.map((rack) => {
                const health = getRackHealth(rack);
                const selected = rack.id === selectedRackId;
                const model = models[rack.modelId] ?? models["generic-42u"];
                return (
                  <button
                    key={rack.id}
                    type="button"
                    onClick={() => onRackSelect(rack.id)}
                    className={cn(
                      "w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
                      selected
                        ? "border-blue-300/45 bg-blue-500/18 shadow-[0_14px_34px_-24px_rgba(59,130,246,0.95)]"
                        : "border-[#163653] bg-[#081c2d]/75 hover:border-[#2b5274] hover:bg-[#10283d]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-bold text-slate-50">{rack.cabinet}</span>
                      <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold", getHealthTone(health))}>
                        {HEALTH_LABELS[health]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
                      <span>{rack.row} Row</span>
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span>{rack.l10Count}× L10</span>
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span className="truncate">{model.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

interface RackInspectorProps {
  rack: RackPlan;
  model: RackModelDefinition;
  l10Model: RackModelDefinition;
  l10Capacity: number;
  canEdit: boolean;
  layoutEditing: boolean;
  onLayoutEditingChange: (value: boolean) => void;
  onFocus: () => void;
  onOpenModels: () => void;
  onOpenL10Models: () => void;
  onL10CountChange: (count: number) => void;
  onNudge: (x: number, z: number) => void;
  onRotate: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function RackInspector({
  rack,
  model,
  l10Model,
  l10Capacity,
  canEdit,
  layoutEditing,
  onLayoutEditingChange,
  onFocus,
  onOpenModels,
  onOpenL10Models,
  onL10CountChange,
  onNudge,
  onRotate,
  collapsed = false,
  onToggleCollapse,
}: RackInspectorProps) {
  const health = getRackHealth(rack);
  const sortedDevices = [...rack.devices].sort((left, right) => right.slotStart - left.slotStart);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 bg-[#081c2d] py-3">
        {onToggleCollapse ? (
          <IconTooltipButton label="展開機櫃詳情" icon={PanelRightOpen} onClick={onToggleCollapse} />
        ) : null}
        <div className="my-1 h-px w-8 bg-[#214669]" />
        <IconTooltipButton label="聚焦機櫃" icon={Focus} onClick={onFocus} />
        <IconTooltipButton label="模型與尺寸" icon={Box} onClick={onOpenModels} />
        <IconTooltipButton label="櫃內 L10 1U 機台" icon={Cpu} onClick={onOpenL10Models} />
        {canEdit ? (
          <IconTooltipButton
            label={layoutEditing ? "結束編排" : "編排機櫃"}
            icon={Move3d}
            active={layoutEditing}
            onClick={() => onLayoutEditingChange(!layoutEditing)}
          />
        ) : null}
        <div className="mt-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-[#214669] bg-[#10283d]">
          <span className={cn("h-2.5 w-2.5 rounded-full", health === "healthy" ? "bg-emerald-400" : health === "critical" ? "bg-rose-400" : "bg-amber-400")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#081c2d]">
      <div className="flex min-h-[82px] shrink-0 items-center justify-between border-b border-[#163653] px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-blue-300/30 bg-blue-400/15 text-blue-100">
            <Server className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-black tracking-[-0.02em] text-white">機櫃詳情</div>
            <p className="mt-1 truncate text-[11px] font-semibold text-blue-200/65">狀態、設備與配置</p>
          </div>
        </div>
        {onToggleCollapse ? (
          <IconTooltipButton
            label="收合機櫃詳情"
            icon={PanelRightClose}
            onClick={onToggleCollapse}
            className="h-9 w-9"
          />
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-black tracking-[-0.03em] text-white">{rack.cabinet}</div>
                <div className="mt-1 text-sm text-slate-300">{rack.zone} · Row {rack.row}</div>
              </div>
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold", getHealthTone(health))}>
                {HEALTH_LABELS[health]}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "POWER", value: `${rack.powerKw} kW`, icon: Zap },
                { label: "TEMP", value: `${rack.temperatureC}°C`, icon: Thermometer },
                { label: "LOAD", value: `${rack.utilizationPercent}%`, icon: CircleGauge },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="rounded-xl border border-[#163653] bg-[#081c2d] p-2.5">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-200/80">
                      <Icon className="h-3 w-3" />
                      {metric.label}
                    </div>
                    <div className="mt-1.5 text-sm font-bold tabular-nums text-white">{metric.value}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-3.5">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-200">L11 機櫃外型</span>
              {model.isCalibrated ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> 已校正
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onOpenModels}
              className="w-full cursor-pointer rounded-xl border border-[#163653] bg-[#081c2d] p-3 text-left transition-colors hover:border-blue-300/40 hover:bg-[#10283d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/25 bg-blue-400/12 text-blue-100">
                  <Box className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{model.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-300">{model.manufacturer} · {model.revision}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-3 rounded-lg bg-[#10283d] px-2.5 py-2 text-[11px] tabular-nums text-blue-100/90">
                {formatDimensions(model.dimensions)}
              </div>
            </button>
          </section>

          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Cpu className="h-4 w-4 text-blue-300" />
                  櫃內 L10 1U 機台
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  {l10Model.name} · 每座 L11 機櫃最多 {l10Capacity} 台
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenL10Models}
                className="h-9 cursor-pointer rounded-lg border border-[#214669] bg-[#10283d] px-3 text-xs font-bold text-blue-100 hover:border-blue-300/40 hover:bg-[#16324b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
              >
                更換模型
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[#163653] bg-[#081c2d] px-3 py-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-300">目前數量</div>
                <div className="mt-0.5 text-2xl font-black tabular-nums text-white">
                  {rack.l10Count}
                  <span className="ml-1 text-sm font-semibold text-slate-400">/ {l10Capacity}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="減少一台 L10 1U 機台"
                  disabled={!canEdit || rack.l10Count <= 0}
                  onClick={() => onL10CountChange(rack.l10Count - 1)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[#214669] bg-[#10283d] text-slate-100 hover:border-blue-300/40 hover:bg-[#16324b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="增加一台 L10 1U 機台"
                  disabled={!canEdit || rack.l10Count >= l10Capacity}
                  onClick={() => onL10CountChange(rack.l10Count + 1)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-blue-950 disabled:text-blue-100/45"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`已安裝 ${rack.l10Count} 台 L10 1U 機台`}>
              {Array.from({ length: l10Capacity }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-2.5 min-w-5 flex-1 rounded-full",
                    index < rack.l10Count ? "bg-blue-400" : "bg-[#163653]"
                  )}
                />
              ))}
            </div>
            {l10Model.isPlaceholder ? (
              <p className="mt-3 text-[11px] leading-5 text-amber-100/85">
                目前使用 1U 暫代外型；收到正式 L10 STEP／GLB 後，在型錄匯入即可替換櫃內機台。
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-5 text-cyan-100/80">
              L10 只會安裝在目前的 L11 機櫃內，不會取代或獨立變成機櫃。
            </p>
          </section>

          <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-3.5">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-200">其他設備</span>
              <Badge className="border-0 bg-blue-400/10 text-[10px] text-blue-200 shadow-none">
                {rack.devices.length} devices
              </Badge>
            </div>
            <div className="space-y-1.5">
              {sortedDevices.map((device) => {
                const Icon = getDeviceIcon(device.type);
                return (
                  <div key={device.id} className="flex items-center gap-3 rounded-xl border border-[#163653] bg-[#081c2d] px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10283d] text-blue-100/75">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">{device.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">U{device.slotStart} · {device.assetTag}</div>
                    </div>
                    <span className={cn("h-2 w-2 rounded-full", device.health === "healthy" ? "bg-emerald-400" : device.health === "critical" ? "bg-rose-400" : device.health === "offline" ? "bg-slate-500" : "bg-amber-400")} />
                  </div>
                );
              })}
            </div>
          </section>

          {rack.maintenance.length ? (
            <section className="rounded-2xl border border-rose-300/22 bg-rose-400/[0.08] p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-100">
                <AlertTriangle className="h-4 w-4" />
                {rack.maintenance[0].title}
              </div>
              <p className="mt-2 text-xs leading-5 text-rose-100/80">{rack.maintenance[0].detail}</p>
            </section>
          ) : null}

          {canEdit ? (
            <section className="rounded-[20px] border border-[#1d4262] bg-[#0c2235] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <PencilRuler className="h-4 w-4 text-blue-300" />
                    編排模式
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">以 250mm 網格移動，比例不變形</p>
                </div>
                <button
                  type="button"
                  aria-pressed={layoutEditing}
                  onClick={() => onLayoutEditingChange(!layoutEditing)}
                  className={cn(
                    "relative h-7 w-12 cursor-pointer rounded-full border transition-colors",
                    layoutEditing ? "border-blue-300/50 bg-blue-500/35" : "border-[#214669] bg-[#10283d]"
                  )}
                >
                  <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform", layoutEditing ? "translate-x-5" : "translate-x-1")} />
                  <span className="sr-only">切換編排模式</span>
                </button>
              </div>

              {layoutEditing ? (
                <div className="mt-3 space-y-2 border-t border-[#163653] pt-3">
                  <div className="grid grid-cols-3 gap-2">
                    <span />
                    <Button type="button" variant="outline" size="sm" onClick={() => onNudge(0, -0.25)} className="h-9 border-white/12 bg-black/20 text-slate-200 hover:bg-white/[0.07]">Z−</Button>
                    <span />
                    <Button type="button" variant="outline" size="sm" onClick={() => onNudge(-0.25, 0)} className="h-9 border-white/12 bg-black/20 text-slate-200 hover:bg-white/[0.07]">X−</Button>
                    <Button type="button" variant="outline" size="sm" onClick={onRotate} className="h-9 border-cyan-300/20 bg-cyan-400/8 text-cyan-100 hover:bg-cyan-400/15"><RotateCw className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onNudge(0.25, 0)} className="h-9 border-white/12 bg-black/20 text-slate-200 hover:bg-white/[0.07]">X＋</Button>
                    <span />
                    <Button type="button" variant="outline" size="sm" onClick={() => onNudge(0, 0.25)} className="h-9 border-white/12 bg-black/20 text-slate-200 hover:bg-white/[0.07]">Z＋</Button>
                    <span />
                  </div>
                  <div className="text-center text-[11px] tabular-nums text-slate-400">
                    X {rack.positionX.toFixed(2)}m · Z {rack.positionZ.toFixed(2)}m · {rack.rotation}°
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </ScrollArea>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#163653] bg-[#081c2d] p-4">
        <Button type="button" variant="outline" onClick={onFocus} className="h-11 rounded-xl border-blue-300/30 bg-blue-500/15 text-sm font-bold text-blue-50 hover:bg-blue-500/25">
          <Focus className="mr-2 h-4 w-4" /> 聚焦
        </Button>
        <Button type="button" variant="outline" onClick={onOpenModels} className="h-11 rounded-xl border-[#214669] bg-[#10283d] text-sm font-bold text-blue-100 hover:bg-[#16324b]">
          <Box className="mr-2 h-4 w-4" /> 模型
        </Button>
      </div>
    </div>
  );
}

interface ModelLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Record<string, RackModelDefinition>;
  selectedRack: RackPlan;
  canEdit: boolean;
  isImporting: boolean;
  importError: string;
  importProgress: ModelConversionProgress | null;
  manufacturer: string;
  modelName: string;
  revision: string;
  dimensions: ImportedStepDimensions;
  catalogKind: DataCenterAssetKind;
  importKind: DataCenterAssetKind;
  selectedModelId: string;
  onManufacturerChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
  onRevisionChange: (value: string) => void;
  onDimensionsChange: (dimensions: ImportedStepDimensions) => void;
  onCatalogKindChange: (kind: DataCenterAssetKind) => void;
  onImportKindChange: (kind: DataCenterAssetKind) => void;
  onSelectedModelChange: (modelId: string) => void;
  onChooseFile: () => void;
  onCancelImport: () => void;
  onAssignModel: () => void;
  onAssignL10Model: () => void;
  onAddRack: () => void;
}

function ModelLibrary({
  open,
  onOpenChange,
  models,
  selectedRack,
  canEdit,
  isImporting,
  importError,
  importProgress,
  manufacturer,
  modelName,
  revision,
  dimensions,
  catalogKind,
  importKind,
  selectedModelId,
  onManufacturerChange,
  onModelNameChange,
  onRevisionChange,
  onDimensionsChange,
  onCatalogKindChange,
  onImportKindChange,
  onSelectedModelChange,
  onChooseFile,
  onCancelImport,
  onAssignModel,
  onAssignL10Model,
  onAddRack,
}: ModelLibraryProps) {
  const [view, setView] = useState<"browse" | "import">("browse");
  const catalogModels = Object.values(models).filter((model) => model.kind === catalogKind);
  const selectedModel =
    catalogModels.find((model) => model.id === selectedModelId) ?? catalogModels[0];
  const rackModelCount = Object.values(models).filter((model) => model.kind === "rack").length;
  const l10ModelCount = Object.values(models).filter((model) => model.kind === "l10").length;

  const selectCatalogKind = (kind: DataCenterAssetKind) => {
    onCatalogKindChange(kind);
    const assignedModelId = kind === "rack" ? selectedRack.modelId : selectedRack.l10ModelId;
    const nextModel =
      models[assignedModelId]?.kind === kind
        ? models[assignedModelId]
        : Object.values(models).find((model) => model.kind === kind);
    if (nextModel) onSelectedModelChange(nextModel.id);
  };

  const selectedIsAssigned = selectedModel
    ? catalogKind === "rack"
      ? selectedRack.modelId === selectedModel.id
      : selectedRack.l10ModelId === selectedModel.id
    : false;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setView("browse");
      }}
    >
      <SheetContent className="flex w-[min(96vw,760px)] flex-col border-l border-cyan-300/18 bg-[linear-gradient(180deg,#081725,#040a11)] p-0 text-slate-100 sm:max-w-[760px]">
        <SheetHeader className="shrink-0 border-b border-white/10 px-6 py-5 pr-14 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/12 text-cyan-200">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-2xl font-black tracking-[-0.025em] text-white">模型型錄</SheetTitle>
              <SheetDescription className="mt-1 text-sm leading-5 text-slate-300">
                為 {selectedRack.cabinet} 選擇 L11 機櫃外型或櫃內 L10 1U 機台。
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex shrink-0 gap-2 border-b border-white/10 px-6 py-3" role="tablist" aria-label="模型型錄工作模式">
          {([
            ["browse", "瀏覽與套用"],
            ["import", "匯入新模型"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                "h-10 cursor-pointer rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                view === id
                  ? "bg-cyan-300 text-cyan-950"
                  : "bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            {view === "browse" ? (
            <section>
              <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1.5" role="tablist" aria-label="模型種類">
                {([
                  ["rack", `L11 機櫃 ${rackModelCount}`],
                  ["l10", `L10 1U 機台 ${l10ModelCount}`],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={catalogKind === kind}
                    onClick={() => selectCatalogKind(kind)}
                    className={cn(
                      "h-11 cursor-pointer rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                      catalogKind === kind
                        ? "bg-[#173347] text-cyan-50"
                        : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {catalogKind === "rack" ? "選擇 L11 機櫃外型" : "選擇 L10 1U 機台"}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {catalogKind === "rack"
                      ? "選取後可套用至目前機櫃，或放入一座新的 L11 機櫃。"
                      : "L10 只會安裝在目前的 L11 機櫃內；替換模型時會保留機台數量。"}
                  </p>
                </div>
                <Badge className="border-cyan-300/18 bg-cyan-400/8 text-[11px] text-cyan-50 shadow-none">
                  {catalogModels.length} 個模型
                </Badge>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                {catalogModels.map((model) => {
                  const selected = model.id === selectedModel?.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => onSelectedModelChange(model.id)}
                      className={cn(
                        "w-full cursor-pointer border-b border-white/8 px-4 py-4 text-left transition-colors duration-200 last:border-b-0",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                        selected
                          ? "bg-[#123249]"
                          : "bg-white/[0.02] hover:bg-white/[0.055]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", selected ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-black/20 text-cyan-100/45")}>
                          {model.source === "step" ? <FileBox className="h-5 w-5" /> : <Box className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-bold text-white">{model.name}</span>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              model.isPlaceholder
                                ? "bg-amber-300/15 text-amber-100"
                                : model.isCalibrated
                                  ? "bg-emerald-300/12 text-emerald-100"
                                  : "bg-slate-300/10 text-slate-200"
                            )}>
                              {model.isPlaceholder ? "暫代" : model.isCalibrated ? "已校正" : "待校正"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-300">{model.manufacturer} · {model.revision}</div>
                          <div className="mt-2 text-xs tabular-nums text-cyan-100/85">{formatDimensions(model.dimensions)}</div>
                        </div>
                        <span className={cn("mt-1 flex h-5 w-5 items-center justify-center rounded-full border", selected ? "border-cyan-300 bg-cyan-400 text-cyan-950" : "border-white/20 text-transparent")}>
                          <Check className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedModel ? (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-white">已選擇 {selectedModel.name}</span>
                    <span className="text-xs text-slate-300">
                      {selectedIsAssigned ? `目前已套用至 ${selectedRack.cabinet}` : `準備套用至 ${selectedRack.cabinet}`}
                    </span>
                  </div>
                  {catalogKind === "rack" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="button" disabled={!canEdit || selectedIsAssigned} onClick={onAssignModel} className="h-12 rounded-xl bg-cyan-300 text-sm font-bold text-cyan-950 hover:bg-cyan-200 disabled:bg-cyan-950 disabled:text-cyan-100/45">
                        <Check className="mr-2 h-4 w-4" /> 套用至 {selectedRack.cabinet}
                      </Button>
                      <Button type="button" disabled={!canEdit} onClick={onAddRack} variant="outline" className="h-12 rounded-xl border-cyan-300/22 bg-cyan-400/8 text-sm text-cyan-50 hover:bg-cyan-400/14">
                        <PackagePlus className="mr-2 h-4 w-4" /> 以此新增機櫃
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" disabled={!canEdit || selectedIsAssigned} onClick={onAssignL10Model} className="h-12 w-full rounded-xl bg-cyan-300 text-sm font-bold text-cyan-950 hover:bg-cyan-200 disabled:bg-cyan-950 disabled:text-cyan-100/45">
                      <Cpu className="mr-2 h-4 w-4" /> 套用為櫃內 L10
                    </Button>
                  )}
                </div>
              ) : null}
            </section>
            ) : (
            <div className="space-y-5">
            <section className={cn(!canEdit && "opacity-55")}>
              <div className="mb-3">
                <h3 className="text-lg font-bold text-white">匯入新模型</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  支援 GLB 與 STEP/STP；STEP/STP 會在背景自動轉為 GLB，不設固定檔案大小上限。
                </p>
              </div>

              <fieldset className="mb-5">
                <legend className="mb-2 text-sm font-semibold text-slate-200">這是什麼模型？</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["rack", "L11 機櫃外型", Server],
                    ["l10", "L10 1U 機台", Cpu],
                  ] as const).map(([kind, label, Icon]) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={importKind === kind}
                      onClick={() => onImportKindChange(kind)}
                      className={cn(
                        "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                        importKind === kind
                          ? "border-cyan-300/45 bg-cyan-300/15 text-cyan-50"
                          : "border-white/10 bg-white/[0.025] text-slate-300 hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-semibold text-slate-200">廠牌</span>
                  <Input value={manufacturer} disabled={!canEdit} onChange={(event) => onManufacturerChange(event.target.value)} className="h-11 border-white/12 bg-black/25 text-sm text-white" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-semibold text-slate-200">型號</span>
                  <Input value={modelName} disabled={!canEdit} onChange={(event) => onModelNameChange(event.target.value)} className="h-11 border-white/12 bg-black/25 text-sm text-white" />
                </label>
              </div>

              <label className="mt-3 block space-y-1.5">
                <span className="text-sm font-semibold text-slate-200">版本</span>
                <Input value={revision} disabled={!canEdit} onChange={(event) => onRevisionChange(event.target.value)} className="h-11 border-white/12 bg-black/25 text-sm text-white" />
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {([
                  ["widthMm", "寬 mm"],
                  ["depthMm", "深 mm"],
                  ["heightMm", "高 mm"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300">{label}</span>
                    <Input
                      type="number"
                      min={1}
                      value={dimensions[key]}
                      disabled={!canEdit}
                      onChange={(event) => onDimensionsChange({ ...dimensions, [key]: Math.max(1, Number(event.target.value) || 1) })}
                      className="h-11 border-white/12 bg-black/25 px-2 text-sm tabular-nums text-white"
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                disabled={!canEdit}
                onClick={isImporting ? onCancelImport : onChooseFile}
                className="mt-4 flex min-h-20 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-cyan-300/35 bg-cyan-400/[0.045] px-4 text-center transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {isImporting ? (
                    <>
                      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-400/10 text-rose-100">
                        <X className="h-4 w-4" />
                      </span>
                      <span className="mt-2 block text-sm font-bold text-cyan-50">
                        {importProgress?.label || "正在準備模型轉換"}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-rose-200">取消轉換</span>
                    </>
                  ) : (
                    <>
                      <Upload className="mx-auto h-5 w-5 text-cyan-200" />
                      <span className="mt-2 block text-sm font-bold text-white">選擇 GLB / STEP / STP</span>
                      <span className="mt-1 block text-xs text-slate-300">選擇後自動轉換並加入型錄</span>
                    </>
                  )}
                </span>
              </button>

              {isImporting ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#10263a]" aria-label="模型轉換進行中">
                  <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-300 motion-reduce:animate-none" />
                </div>
              ) : null}

              <div className="mt-3 rounded-xl bg-blue-400/[0.08] px-4 py-3 text-xs leading-5 text-blue-100/85">
                大型 STEP 會在背景解析，畫面仍可操作；完成後自動校正 Y 軸、讀取毫米尺寸並產生 GLB。
              </div>

              {importError ? (
                <div role="alert" className="mt-3 rounded-xl border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">
                  {importError}
                </div>
              ) : null}
            </section>

            <section className="rounded-xl bg-emerald-400/[0.07] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
                <div>
                  <div className="text-sm font-bold text-emerald-50">比例規則</div>
                  <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                    場景世界單位固定為公尺，模型資料固定保存毫米；座標原點統一放在機櫃底部中心，旋轉只使用 Y 軸。
                  </p>
                </div>
              </div>
            </section>
            </div>
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-white/10 bg-black/20 px-6 py-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>{view === "browse" && selectedModel ? `目前選取：${selectedModel.name}` : `準備匯入：${importKind === "rack" ? "L11 機櫃外型" : "L10 1U 機台"}`}</span>
            {view === "browse" && selectedModel ? <span className="hidden tabular-nums sm:inline">{formatDimensions(selectedModel.dimensions)}</span> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useDesktopDataCenterLayout() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncLayout = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  return isDesktop;
}

export function DeploymentPlanningCenter() {
  const { toast } = useToast();
  const { canEditModule } = usePermissions();
  const canEdit = canEditModule("data");
  const isDesktopLayout = useDesktopDataCenterLayout();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedUrlsRef = useRef<string[]>([]);
  const importAbortRef = useRef<AbortController | null>(null);

  const [sites, setSites] = useState<SitePlan[]>(readInitialSites);
  const [facilityPlans, setFacilityPlans] = useState<Record<string, FacilityPlan>>(readInitialFacilityPlans);
  const [models, setModels] = useState<Record<string, RackModelDefinition>>(BUILT_IN_RACK_MODELS);
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0].id);
  const [selectedRackId, setSelectedRackId] = useState(sites[0].racks[0].id);
  const [activeLayer, setActiveLayer] = useState<DataCenterLayer>("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [showSceneTools, setShowSceneTools] = useState(false);
  const [showRackDetails, setShowRackDetails] = useState(false);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 640px)").matches
  );
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const [cameraRequestId, setCameraRequestId] = useState(0);
  const [facilityPlannerOpen, setFacilityPlannerOpen] = useState(false);
  const [modelLibraryOpen, setModelLibraryOpen] = useState(false);
  const [catalogKind, setCatalogKind] = useState<DataCenterAssetKind>("rack");
  const [importKind, setImportKind] = useState<DataCenterAssetKind>("rack");
  const [selectedModelId, setSelectedModelId] = useState("nv-mgx-rack-v1-2-rev7");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importProgress, setImportProgress] = useState<ModelConversionProgress | null>(null);
  const [manufacturer, setManufacturer] = useState("New Vendor");
  const [modelName, setModelName] = useState("Rack Model");
  const [revision, setRevision] = useState("Rev.A");
  const [importDimensions, setImportDimensions] = useState<ImportedStepDimensions>({
    widthMm: 600,
    depthMm: 1200,
    heightMm: 2200,
  });

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? sites[0],
    [selectedSiteId, sites]
  );
  const selectedRack = useMemo(
    () => selectedSite.racks.find((rack) => rack.id === selectedRackId) ?? selectedSite.racks[0],
    [selectedRackId, selectedSite]
  );
  const requestedRackModel = models[selectedRack.modelId];
  const selectedModel =
    requestedRackModel?.kind === "rack" ? requestedRackModel : models["generic-42u"];
  const requestedL10Model = models[selectedRack.l10ModelId];
  const selectedL10Model =
    requestedL10Model?.kind === "l10" ? requestedL10Model : models["l10-placeholder"];
  const selectedL10Capacity = getL10Capacity(selectedRack, selectedL10Model);
  const selectedFacility = facilityPlans[selectedSiteId] ?? cloneDefaultFacilityPlan();

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(sites));
  }, [sites]);

  useEffect(() => {
    window.localStorage.setItem(FACILITY_STORAGE_KEY, JSON.stringify(facilityPlans));
  }, [facilityPlans]);

  useEffect(() => {
    if (!facilityPlans[selectedSiteId]) {
      setFacilityPlans((current) => ({ ...current, [selectedSiteId]: cloneDefaultFacilityPlan() }));
    }
  }, [facilityPlans, selectedSiteId]);

  useEffect(
    () => () => {
      importAbortRef.current?.abort();
      uploadedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(() => {
    if (!selectedSite.racks.some((rack) => rack.id === selectedRackId)) {
      setSelectedRackId(selectedSite.racks[0]?.id ?? "");
    }
  }, [selectedRackId, selectedSite]);

  const totalPower = selectedSite.racks.reduce((sum, rack) => sum + rack.powerKw, 0);
  const totalL10 = selectedSite.racks.reduce((sum, rack) => sum + rack.l10Count, 0);
  const alertCount = selectedSite.racks.filter((rack) => getRackHealth(rack) !== "healthy").length;
  const activeLayerOption = LAYER_OPTIONS.find((layer) => layer.id === activeLayer) ?? LAYER_OPTIONS[0];

  const requestCamera = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setCameraRequestId((value) => value + 1);
  };

  const openModelLibrary = (kind: DataCenterAssetKind) => {
    setCatalogKind(kind);
    setSelectedModelId(kind === "rack" ? selectedRack.modelId : selectedRack.l10ModelId);
    setModelLibraryOpen(true);
  };

  const handleImportKindChange = (kind: DataCenterAssetKind) => {
    setImportKind(kind);
    setModelName(kind === "rack" ? "Rack Model" : "Equipment Model");
    setImportDimensions(
      kind === "rack"
        ? { widthMm: 600, depthMm: 1200, heightMm: 2200 }
        : { widthMm: 560, depthMm: 780, heightMm: 160 }
    );
    setImportError("");
  };

  const handleRackSelect = (rackId: string) => {
    setSelectedRackId(rackId);
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
    requestCamera("focus");
  };

  const handleSiteChange = (siteId: string) => {
    const site = sites.find((item) => item.id === siteId);
    setSelectedSiteId(siteId);
    setSelectedRackId(site?.racks[0]?.id ?? "");
    setSearchTerm("");
    requestCamera("overview");
  };

  const updateSelectedRack = (updater: (rack: RackPlan) => RackPlan) => {
    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId
          ? {
              ...site,
              racks: site.racks.map((rack) => (rack.id === selectedRackId ? updater(rack) : rack)),
            }
          : site
      )
    );
  };

  const updateFacility = (updater: (facility: FacilityPlan) => FacilityPlan) => {
    setFacilityPlans((current) => ({
      ...current,
      [selectedSiteId]: updater(current[selectedSiteId] ?? cloneDefaultFacilityPlan()),
    }));
  };

  const updateFacilityNumber = (field: "width" | "depth", value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    updateFacility((facility) => ({ ...facility, [field]: next }));
  };

  const addAisle = (kind: FacilityAisleKind) => {
    const index = selectedFacility.aisles.filter((aisle) => aisle.kind === kind).length + 1;
    updateFacility((facility) => ({
      ...facility,
      aisles: [
        ...facility.aisles,
        {
          id: `${kind}-${crypto.randomUUID()}`,
          label: `${kind === "cold" ? "冷通道" : "熱通道"} ${index}`,
          kind,
          x: 0,
          z: 0,
          width: Math.max(4, facility.width - 3.8),
          depth: kind === "cold" ? 2.1 : 1.15,
          rotation: 0,
        },
      ],
    }));
  };

  const removeAisle = (aisleId: string) => {
    updateFacility((facility) => ({
      ...facility,
      aisles: facility.aisles.filter((aisle) => aisle.id !== aisleId),
    }));
  };

  const updateAisle = (aisleId: string, updater: (aisle: FacilityPlan["aisles"][number]) => FacilityPlan["aisles"][number]) => {
    updateFacility((facility) => ({
      ...facility,
      aisles: facility.aisles.map((aisle) => (aisle.id === aisleId ? updater(aisle) : aisle)),
    }));
  };

  const updatePowerFeed = (feedId: string, updater: (feed: FacilityPlan["powerFeeds"][number]) => FacilityPlan["powerFeeds"][number]) => {
    updateFacility((facility) => ({
      ...facility,
      powerFeeds: facility.powerFeeds.map((feed) => (feed.id === feedId ? updater(feed) : feed)),
    }));
  };

  const addPowerFeed = () => {
    const index = selectedFacility.powerFeeds.length + 1;
    updateFacility((facility) => ({
      ...facility,
      powerFeeds: [
        ...facility.powerFeeds,
        {
          id: `power-${crypto.randomUUID()}`,
          label: `PDU ${String.fromCharCode(64 + index)}`,
          x: 0,
          z: 0,
          color: "#a78bfa",
          enabled: true,
        },
      ],
    }));
  };

  const removePowerFeed = (feedId: string) => {
    updateFacility((facility) => ({
      ...facility,
      powerFeeds: facility.powerFeeds.filter((feed) => feed.id !== feedId),
    }));
  };

  const getFootprint = (rack: RackPlan) => {
    const definition = models[rack.modelId] ?? models["generic-42u"];
    const rotated = Math.abs(rack.rotation % 180) === 90;
    return {
      width: (rotated ? definition.dimensions.depthMm : definition.dimensions.widthMm) / 1000,
      depth: (rotated ? definition.dimensions.widthMm : definition.dimensions.depthMm) / 1000,
    };
  };

  const moveSelectedRack = (deltaX: number, deltaZ: number) => {
    if (!canEdit || !layoutEditing) return;

    const nextX = Math.max(-7.4, Math.min(7.4, selectedRack.positionX + deltaX));
    const nextZ = Math.max(-5.5, Math.min(5.5, selectedRack.positionZ + deltaZ));
    const footprint = getFootprint(selectedRack);
    const collision = selectedSite.racks.some((rack) => {
      if (rack.id === selectedRack.id) return false;
      const other = getFootprint(rack);
      return (
        Math.abs(nextX - rack.positionX) < (footprint.width + other.width) / 2 + 0.16 &&
        Math.abs(nextZ - rack.positionZ) < (footprint.depth + other.depth) / 2 + 0.16
      );
    });

    if (collision) {
      toast({
        title: "位置有碰撞",
        description: "機櫃實際尺寸已重疊，請改用其他網格位置。",
        variant: "destructive",
      });
      return;
    }

    updateSelectedRack((rack) => ({ ...rack, positionX: nextX, positionZ: nextZ }));
  };

  const rotateSelectedRack = () => {
    if (!canEdit || !layoutEditing) return;
    updateSelectedRack((rack) => ({ ...rack, rotation: (rack.rotation + 90) % 360 }));
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["glb", "stp", "step"].includes(extension)) {
      setImportError("僅支援 .glb、.stp 與 .step 模型檔。");
      return;
    }

    const controller = new AbortController();
    importAbortRef.current?.abort();
    importAbortRef.current = controller;
    try {
      setIsImporting(true);
      setImportError("");
      const id = `uploaded-${crypto.randomUUID()}`;
      let definition: RackModelDefinition;

      if (extension === "glb") {
        setImportProgress({ stage: "loading-glb", label: `載入 ${file.name}` });
        const assetUrl = URL.createObjectURL(file);
        uploadedUrlsRef.current.push(assetUrl);
        definition = {
          id,
          kind: importKind,
          manufacturer: manufacturer.trim() || "Imported Vendor",
          name: modelName.trim() || file.name.replace(/\.glb$/i, ""),
          revision: revision.trim() || "Imported",
          source: "uploaded-glb",
          assetUrl,
          sourceFileName: file.name,
          dimensions: importDimensions,
          upAxis: "y",
          rackUnits:
            importKind === "l10" ? Math.max(1, Math.ceil(importDimensions.heightMm / 44.45)) : undefined,
          isCalibrated: true,
        };
      } else {
        const converted = await convertStepToGlb(file, setImportProgress, controller.signal);
        const assetUrl = URL.createObjectURL(
          new Blob([converted.glb], { type: "model/gltf-binary" })
        );
        uploadedUrlsRef.current.push(assetUrl);
        definition = {
          id,
          kind: importKind,
          manufacturer: manufacturer.trim() || "Imported Vendor",
          name: modelName.trim() || file.name.replace(/\.(stp|step)$/i, ""),
          revision: revision.trim() || "Imported",
          source: "uploaded-glb",
          assetUrl,
          sourceFileName: file.name,
          dimensions: converted.dimensions,
          upAxis: converted.upAxis,
          rackUnits:
            importKind === "l10" ? Math.max(1, Math.ceil(converted.dimensions.heightMm / 44.45)) : undefined,
          isCalibrated: true,
        };
        setImportDimensions(converted.dimensions);
      }

      setModels((current) => ({ ...current, [id]: definition }));
      setCatalogKind(importKind);
      setSelectedModelId(id);
      toast({
        title: "模型已加入型錄",
        description: `${definition.manufacturer} ${definition.name} 已按實際尺寸建立。`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setImportError("模型轉換已取消，可重新選擇檔案。");
        return;
      }
      const message = error instanceof Error ? error.message : "模型匯入失敗。";
      setImportError(message);
      toast({ title: "模型匯入失敗", description: message, variant: "destructive" });
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const cancelModelImport = () => {
    importAbortRef.current?.abort();
  };

  const assignSelectedModel = () => {
    if (!canEdit || models[selectedModelId]?.kind !== "rack") return;
    updateSelectedRack((rack) => ({ ...rack, modelId: selectedModelId }));
    toast({
      title: "L11 機櫃外型已更新",
      description: `${selectedRack.cabinet} 已套用 ${models[selectedModelId].name}。`,
    });
  };

  const assignSelectedL10Model = () => {
    const definition = models[selectedModelId];
    if (!canEdit || definition?.kind !== "l10") return;

    updateSelectedRack((rack) => ({
      ...rack,
      l10ModelId: selectedModelId,
      l10Count: Math.min(rack.l10Count, getL10Capacity(rack, definition)),
    }));
    toast({
      title: "櫃內 L10 機台已更新",
      description: `${selectedRack.cabinet} 內的 ${selectedRack.l10Count} 台 L10 已套用 ${definition.name}。`,
    });
  };

  const changeSelectedRackL10Count = (count: number) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => ({
      ...rack,
      l10Count: Math.max(0, Math.min(getL10Capacity(rack, selectedL10Model), Math.round(count))),
    }));
  };

  const addRackFromSelectedModel = () => {
    if (!canEdit || models[selectedModelId]?.kind !== "rack") return;
    const definition = models[selectedModelId];
    const baseRack = createRackFromModel(definition, selectedSite);
    const slot = selectedSite.racks.length;
    const nextRack = {
      ...baseRack,
      positionX: ((slot % 5) - 2) * 1.7,
      positionZ: 4.75 + Math.floor(slot / 5) * 1.5,
    };

    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId ? { ...site, racks: [...site.racks, nextRack] } : site
      )
    );
    setSelectedRackId(nextRack.id);
    setLayoutEditing(true);
    setModelLibraryOpen(false);
    requestCamera("focus");
    toast({
      title: "新機櫃已放入場景",
      description: `${nextRack.cabinet} 使用 ${definition.name}，可在編排模式調整位置。`,
    });
  };

  const navigatorProps: SceneNavigatorProps = {
    sites,
    selectedSiteId,
    onSiteChange: handleSiteChange,
    racks: selectedSite.racks,
    models,
    selectedRackId,
    onRackSelect: handleRackSelect,
    activeLayer,
    onLayerChange: setActiveLayer,
    searchTerm,
    onSearchChange: setSearchTerm,
  };

  const inspectorProps: RackInspectorProps = {
    rack: selectedRack,
    model: selectedModel,
    l10Model: selectedL10Model,
    l10Capacity: selectedL10Capacity,
    canEdit,
    layoutEditing,
    onLayoutEditingChange: setLayoutEditing,
    onFocus: () => requestCamera("focus"),
    onOpenModels: () => openModelLibrary("rack"),
    onOpenL10Models: () => openModelLibrary("l10"),
    onL10CountChange: changeSelectedRackL10Count,
    onNudge: moveSelectedRack,
    onRotate: rotateSelectedRack,
  };

  const desktopGridClass = leftCollapsed
    ? rightCollapsed
      ? "lg:grid-cols-[68px_minmax(0,1fr)_68px]"
      : "lg:grid-cols-[68px_minmax(0,1fr)_360px]"
    : rightCollapsed
      ? "lg:grid-cols-[304px_minmax(0,1fr)_68px]"
      : "lg:grid-cols-[304px_minmax(0,1fr)_360px]";

  const compactDesktopGridClass = showSceneTools && showRackDetails
    ? desktopGridClass
    : showSceneTools
      ? leftCollapsed
        ? "lg:grid-cols-[68px_minmax(0,1fr)]"
        : "lg:grid-cols-[304px_minmax(0,1fr)]"
      : showRackDetails
        ? rightCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)_68px]"
          : "lg:grid-cols-[minmax(0,1fr)_360px]"
        : "lg:grid-cols-[minmax(0,1fr)]";

  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden overscroll-none bg-[#02060b] text-slate-100">
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.stp,.step"
          className="hidden"
          onChange={handleImportFile}
        />

        <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-cyan-300/14 bg-[linear-gradient(90deg,#071420,#081928_48%,#07131e)] px-3 py-2 sm:flex-wrap sm:gap-3 sm:px-5 sm:py-3 lg:h-[82px] lg:flex-nowrap lg:px-6 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-300/15 text-cyan-100 sm:h-11 sm:w-11">
              <Boxes className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#071420] bg-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-black tracking-[-0.025em] text-white sm:text-[22px]">Data Center Digital Twin</h1>
                <Badge className="hidden border-emerald-300/20 bg-emerald-400/10 text-[10px] font-bold text-emerald-100 shadow-none sm:inline-flex">LIVE</Badge>
              </div>
              <p className="mt-1 hidden truncate text-[11px] font-semibold text-cyan-100/70 sm:block">Physical rack operations · millimeter calibrated</p>
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 xl:flex">
            {[
              { label: "L11 機櫃", value: selectedSite.racks.length, icon: Server, color: "text-cyan-200" },
              { label: "櫃內 L10", value: totalL10, icon: Cpu, color: "text-cyan-200" },
              { label: "ALERTS", value: alertCount, icon: AlertTriangle, color: alertCount ? "text-amber-200" : "text-emerald-200" },
              { label: "POWER", value: `${totalPower.toFixed(1)} kW`, icon: Zap, color: "text-amber-200" },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="flex h-11 min-w-[100px] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
                  <Icon className={cn("h-4 w-4", metric.color)} />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400">{metric.label}</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-white">{metric.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                openModelLibrary("rack");
              }}
              className="h-11 rounded-xl border-cyan-300/22 bg-cyan-400/8 px-4 text-sm font-bold text-cyan-50 hover:bg-cyan-400/15"
            >
              <Box className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">模型型錄</span>
              <span className="sm:hidden">模型</span>
            </Button>
            {canEdit ? (
              <Button
                type="button"
                onClick={() => setLayoutEditing((value) => !value)}
                className={cn(
                  "h-11 rounded-xl px-4 text-sm font-bold",
                  layoutEditing
                    ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                    : "bg-cyan-400 text-cyan-950 hover:bg-cyan-300"
                )}
              >
                <Move3d className="mr-2 h-4 w-4" />
                {layoutEditing ? "編排中" : "編排場景"}
              </Button>
            ) : null}
          </div>
        </header>

        {isDesktopLayout ? (
        <div className={cn("grid min-h-0 flex-1 gap-3 bg-[#02060b] p-3 transition-[grid-template-columns] duration-300 ease-out", compactDesktopGridClass)}>
          {showSceneTools ? <aside className="min-w-0 overflow-hidden rounded-[24px] border border-[#163653] bg-[#081c2d] shadow-[0_24px_70px_rgba(2,8,23,0.42)]">
            <SceneNavigator {...navigatorProps} collapsed={leftCollapsed} onToggleCollapse={() => setLeftCollapsed((value) => !value)} />
          </aside> : null}

          <main className="relative min-w-0 overflow-hidden rounded-[24px] border border-[#10283d] bg-black shadow-[0_24px_70px_rgba(2,8,23,0.36)]">
            <DataCenter3DPlanner
              racks={selectedSite.racks}
              models={models}
              selectedRackId={selectedRackId}
              activeLayer={activeLayer}
              showLabels={showLabels}
              cameraPreset={cameraPreset}
              cameraRequestId={cameraRequestId}
              facility={selectedFacility}
              onSelectRack={handleRackSelect}
            />

            <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-32px)] flex-wrap items-center gap-2">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-black/72 px-3 shadow-xl backdrop-blur-xl">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${activeLayerOption.color}1f`, color: activeLayerOption.color }}>
                  <activeLayerOption.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs font-bold text-white">{activeLayerOption.label}</div>
                  <div className="text-[10px] text-slate-300">{activeLayerOption.description}</div>
                </div>
              </div>

              {layoutEditing ? (
                <div className="flex h-11 items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/12 px-3 text-xs font-bold text-amber-100 backdrop-blur-xl">
                  <Move3d className="h-4 w-4" /> 250mm 編排網格
                </div>
              ) : null}
            </div>

            <div className="absolute right-4 top-4 z-20 flex max-w-[calc(100%-32px)] flex-wrap items-center justify-end gap-1.5 rounded-xl border border-white/12 bg-black/72 p-1.5 shadow-xl backdrop-blur-xl">
              <IconTooltipButton
                label={showSceneTools ? "關閉場景工具" : "開啟場景工具"}
                icon={showSceneTools ? PanelLeftClose : PanelLeftOpen}
                onClick={() => {
                  setShowSceneTools((value) => !value);
                  setLeftCollapsed(false);
                }}
                className="h-9 w-9"
              />
              <IconTooltipButton
                label={showRackDetails ? "關閉機櫃詳情" : "開啟機櫃詳情"}
                icon={showRackDetails ? PanelRightClose : PanelRightOpen}
                onClick={() => {
                  setShowRackDetails((value) => !value);
                  setRightCollapsed(false);
                }}
                className="h-9 w-9"
              />
              <div className="mx-0.5 h-6 w-px bg-white/10" />
              <IconTooltipButton
                label="廠房規劃"
                icon={PencilRuler}
                onClick={() => setFacilityPlannerOpen(true)}
                className="h-9 w-9"
                active={facilityPlannerOpen}
              />
              <IconTooltipButton
                label="冷熱通道"
                icon={Snowflake}
                onClick={() => setActiveLayer("cooling")}
                className="h-9 w-9"
                active={activeLayer === "cooling"}
              />
              <IconTooltipButton
                label="電力佈線"
                icon={Cable}
                onClick={() => setActiveLayer("power")}
                className="h-9 w-9"
                active={activeLayer === "power"}
              />
              <div className="mx-0.5 h-6 w-px bg-white/10" />
              {([
                ["overview", Boxes, "斜角總覽"],
                ["top", LayoutDashboard, "俯視"],
                ["front", Menu, "正視"],
                ["focus", Focus, "聚焦選取"],
              ] as Array<[CameraPreset, LucideIcon, string]>).map(([preset, Icon, label]) => (
                <Tooltip key={preset}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={label}
                      onClick={() => requestCamera(preset)}
                      className={cn(
                        "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white",
                        cameraPreset === preset && "bg-cyan-400/16 text-cyan-100"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="border-white/10 bg-[#07131f] text-slate-100">{label}</TooltipContent>
                </Tooltip>
              ))}
              <div className="mx-0.5 h-6 w-px bg-white/10" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={showLabels ? "隱藏浮動資訊" : "顯示浮動資訊"}
                    onClick={() => setShowLabels((value) => !value)}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="border-white/10 bg-[#07131f] text-slate-100">浮動資訊卡</TooltipContent>
              </Tooltip>
            </div>

            <div className="absolute bottom-4 left-4 z-20 hidden items-center gap-3 rounded-xl border border-white/10 bg-black/72 px-3 py-2 text-[11px] text-slate-300 backdrop-blur-xl sm:flex">
              <span className="flex items-center gap-1.5 font-semibold text-sky-100">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> 冷通道
              </span>
              <span className="flex items-center gap-1.5 font-semibold text-orange-100">
                <span className="h-2 w-2 rounded-full bg-orange-400" /> 熱通道
              </span>
              <span className="h-4 w-px bg-white/15" />
              {activeLayer === "health" ? (
                <>
                  {(["healthy", "warning", "critical", "offline"] as RackDeviceHealth[]).map((health) => (
                    <span key={health} className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", health === "healthy" ? "bg-emerald-400" : health === "warning" ? "bg-amber-400" : health === "critical" ? "bg-rose-400" : "bg-slate-500")} />
                      {HEALTH_LABELS[health]}
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeLayerOption.color }} />
                  {activeLayerOption.description}
                </>
              )}
            </div>
          </main>

          {showRackDetails ? <aside className="min-w-0 overflow-hidden rounded-[24px] border border-[#163653] bg-[#081c2d] shadow-[0_24px_70px_rgba(2,8,23,0.42)]">
            <RackInspector {...inspectorProps} collapsed={rightCollapsed} onToggleCollapse={() => setRightCollapsed((value) => !value)} />
          </aside> : null}
        </div>
        ) : (
        <div className="relative flex min-h-0 flex-1 bg-black">
          <DataCenter3DPlanner
            racks={selectedSite.racks}
            models={models}
            selectedRackId={selectedRackId}
            activeLayer={activeLayer}
            showLabels={showLabels}
            cameraPreset={cameraPreset}
            cameraRequestId={cameraRequestId}
            facility={selectedFacility}
            onSelectRack={handleRackSelect}
          />
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-xl border border-white/12 bg-black/72 px-3 py-2 shadow-xl backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeLayerOption.color }} />
            <span className="truncate text-xs font-bold text-white">{activeLayerOption.label}</span>
          </div>

          <div
            data-testid="data-center-touch-help"
            className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-200/20 bg-[#06111d]/88 px-3 py-1.5 text-[11px] font-semibold text-cyan-50 shadow-xl backdrop-blur-xl"
            style={{ bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.5rem)" }}
          >
            單指旋轉 · 雙指縮放／平移
          </div>

          <nav
            data-testid="data-center-mobile-dock"
            aria-label="Data-center 手機操作"
            className="absolute inset-x-3 z-30 flex items-stretch gap-1 rounded-2xl border border-cyan-200/20 bg-[#06111d]/94 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
            style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {[
              {
                id: "scene",
                label: "場景",
                icon: Layers3,
                onClick: () => setMobileLeftOpen(true),
              },
              {
                id: "details",
                label: "詳情",
                icon: PanelRightOpen,
                onClick: () => setMobileRightOpen(true),
              },
              {
                id: "models",
                label: "模型",
                icon: Box,
                onClick: () => openModelLibrary("rack"),
              },
              {
                id: "focus",
                label: "聚焦",
                icon: Focus,
                onClick: () => requestCamera("focus"),
              },
              ...(canEdit
                ? [
                    {
                      id: "layout",
                      label: layoutEditing ? "完成" : "編排",
                      icon: layoutEditing ? Check : Move3d,
                      onClick: () => setLayoutEditing((value) => !value),
                    },
                  ]
                : []),
            ].map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  data-action={action.id}
                  aria-label={action.label}
                  onClick={action.onClick}
                  className={cn(
                    "flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold text-cyan-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200",
                    action.id === "layout" && layoutEditing
                      ? "bg-amber-300 text-amber-950"
                      : "hover:bg-cyan-300/12 active:bg-cyan-300/20"
                  )}
                >
                  <ActionIcon className="h-[18px] w-[18px]" />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        )}

        <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}>
          <SheetContent side="left" className="h-[100dvh] w-[min(90vw,340px)] border-r border-[#163653] bg-[#081c2d] p-0 text-slate-100 sm:max-w-[340px]">
            <SceneNavigator {...navigatorProps} />
          </SheetContent>
        </Sheet>

        <Sheet open={mobileRightOpen} onOpenChange={setMobileRightOpen}>
          <SheetContent side="right" className="h-[100dvh] w-[min(92vw,370px)] border-l border-[#163653] bg-[#081c2d] p-0 text-slate-100 sm:max-w-[370px]">
            <RackInspector {...inspectorProps} />
          </SheetContent>
        </Sheet>

        <Sheet open={facilityPlannerOpen} onOpenChange={setFacilityPlannerOpen}>
          <SheetContent side="right" className="w-[min(94vw,480px)] border-l border-cyan-300/20 bg-[#071522] p-0 text-slate-100 sm:max-w-[480px]">
            <SheetHeader className="border-b border-white/10 px-6 py-5 text-left">
              <SheetTitle className="flex items-center gap-2 text-white">
                <PencilRuler className="h-5 w-5 text-cyan-300" />
                廠房與佈線規劃
              </SheetTitle>
              <SheetDescription className="text-slate-400">
                設定廠房邊界、冷熱通道與 PDU 饋線，變更會自動保存在目前廠區。
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(100dvh-112px)]">
              <div className="space-y-5 px-6 py-5">
                <section className="rounded-2xl border border-cyan-300/15 bg-[#0b2234] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-white">廠房尺寸</h2>
                      <p className="mt-1 text-[11px] text-slate-400">單位：公尺。尺寸會同步套用到開放式地板與網格。</p>
                    </div>
                    <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold text-cyan-200">{selectedSite.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["width", "寬度"],
                      ["depth", "深度"],
                    ] as Array<["width" | "depth", string]>).map(([field, label]) => (
                      <label key={field} className="space-y-1.5">
                        <span className="block text-[11px] font-bold text-slate-400">{label}</span>
                        <Input
                          type="number"
                          min={8}
                          step="0.1"
                          value={selectedFacility[field]}
                          disabled={!canEdit}
                          onChange={(event) => updateFacilityNumber(field, event.target.value)}
                          className="h-10 border-white/12 bg-black/25 px-2 text-sm text-white"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-4">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedFacility.showGrid}
                        disabled={!canEdit}
                        onChange={(event) => updateFacility((facility) => ({ ...facility, showGrid: event.target.checked }))}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      顯示網格
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-sky-300/15 bg-[#0b2234] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-white">冷熱通道</h2>
                      <p className="mt-1 text-[11px] text-slate-400">可調整位置、寬度、深度與方向。</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => addAisle("cold")} className="h-8 border-sky-300/20 bg-sky-400/10 px-2.5 text-[11px] text-sky-100 hover:bg-sky-400/20">
                        <Snowflake className="mr-1 h-3.5 w-3.5" />冷
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => addAisle("hot")} className="h-8 border-orange-300/20 bg-orange-400/10 px-2.5 text-[11px] text-orange-100 hover:bg-orange-400/20">
                        <Thermometer className="mr-1 h-3.5 w-3.5" />熱
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {selectedFacility.aisles.map((aisle) => (
                      <div key={aisle.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full", aisle.kind === "cold" ? "bg-sky-400" : "bg-orange-400")} />
                            <Input
                              value={aisle.label}
                              disabled={!canEdit}
                              onChange={(event) => updateAisle(aisle.id, (current) => ({ ...current, label: event.target.value }))}
                              className="h-8 w-32 border-white/10 bg-black/20 px-2 text-xs font-bold text-white"
                            />
                          </div>
                          <Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => removeAisle(aisle.id)} className="h-8 px-2 text-xs text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                            移除
                          </Button>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          {([
                            ["x", "X"],
                            ["z", "Z"],
                            ["width", "寬"],
                            ["depth", "深"],
                            ["rotation", "角度"],
                          ] as Array<["x" | "z" | "width" | "depth" | "rotation", string]>).map(([field, label]) => (
                            <label key={field} className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-500">{label}</span>
                              <Input
                                type="number"
                                step="0.1"
                                value={aisle[field]}
                                disabled={!canEdit}
                                onChange={(event) => updateAisle(aisle.id, (current) => ({ ...current, [field]: Number(event.target.value) }))}
                                className="h-8 border-white/10 bg-black/20 px-1.5 text-[11px] text-white"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-amber-300/15 bg-[#0b2234] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-black text-white">電力佈線</h2>
                      <p className="mt-1 text-[11px] text-slate-400">電力圖層會從啟用的饋線連到所有機櫃。</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={addPowerFeed} className="h-8 border-amber-300/20 bg-amber-400/10 px-2.5 text-[11px] text-amber-100 hover:bg-amber-400/20">
                      <Plus className="mr-1 h-3.5 w-3.5" />饋線
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {selectedFacility.powerFeeds.map((feed) => (
                      <div key={feed.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input type="color" value={feed.color} disabled={!canEdit} onChange={(event) => updatePowerFeed(feed.id, (current) => ({ ...current, color: event.target.value }))} className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
                            <Input
                              value={feed.label}
                              disabled={!canEdit}
                              onChange={(event) => updatePowerFeed(feed.id, (current) => ({ ...current, label: event.target.value }))}
                              className="h-8 w-28 border-white/10 bg-black/20 px-2 text-xs font-bold text-white"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                              <input type="checkbox" checked={feed.enabled} disabled={!canEdit} onChange={(event) => updatePowerFeed(feed.id, (current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-amber-400" />
                              啟用
                            </label>
                            <Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => removePowerFeed(feed.id)} className="h-8 px-2 text-xs text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                              移除
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(["x", "z"] as const).map((field) => (
                            <label key={field} className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-500">位置 {field.toUpperCase()}</span>
                              <Input type="number" step="0.1" value={feed[field]} disabled={!canEdit} onChange={(event) => updatePowerFeed(feed.id, (current) => ({ ...current, [field]: Number(event.target.value) }))} className="h-8 border-white/10 bg-black/20 px-2 text-[11px] text-white" />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <ModelLibrary
          open={modelLibraryOpen}
          onOpenChange={setModelLibraryOpen}
          models={models}
          selectedRack={selectedRack}
          canEdit={canEdit}
          isImporting={isImporting}
          importError={importError}
          importProgress={importProgress}
          manufacturer={manufacturer}
          modelName={modelName}
          revision={revision}
          dimensions={importDimensions}
          catalogKind={catalogKind}
          importKind={importKind}
          selectedModelId={selectedModelId}
          onManufacturerChange={setManufacturer}
          onModelNameChange={setModelName}
          onRevisionChange={setRevision}
          onDimensionsChange={setImportDimensions}
          onCatalogKindChange={setCatalogKind}
          onImportKindChange={handleImportKindChange}
          onSelectedModelChange={setSelectedModelId}
          onChooseFile={() => fileInputRef.current?.click()}
          onCancelImport={cancelModelImport}
          onAssignModel={assignSelectedModel}
          onAssignL10Model={assignSelectedL10Model}
          onAddRack={addRackFromSelectedModel}
        />
      </div>
    </TooltipProvider>
  );
}
