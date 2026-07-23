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
  Map,
  Menu,
  Minus,
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
  Trash2,
  Upload,
  Wifi,
  Wrench,
  X,
  Zap,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { DataCenter2DPlanner } from "./DataCenter2DPlanner";
import { DataCenterModelViewer } from "./DataCenterModelViewer";
import {
  BUILT_IN_RACK_MODELS,
  INITIAL_SITE_PLANS,
  createRackFromModel,
} from "./dataCenterSeed";
import { DEFAULT_FACILITY_PLAN } from "./dataCenterTypes";
import {
  isL10CompatibleWithRack,
  isProtectedCatalogModel,
  mergeModelCatalogOverrides,
  removeCatalogModel,
  serializeModelCatalogOverrides,
} from "./modelCatalog.mjs";
import {
  convertStepToGlb,
  type ModelConversionProgress,
} from "./modelConversionWorker";
import {
  getFacilityAreaSquareMeters,
  normalizeFacilityDimension,
} from "./facilityPlan.mjs";
import {
  getAssignedModuleCount,
  getDefaultRackL10Assignment,
  getRackUnitSelection,
  normalizeRackUnitSlots,
} from "./rackMount.mjs";
import type {
  CameraPreset,
  DataCenterAssetKind,
  DataCenterLayer,
  FacilityAisleKind,
  FacilityAisleOrientation,
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
const MODEL_CATALOG_STORAGE_KEY = "data-center-model-catalog-overrides-v1";
const L10_RESERVED_BOTTOM_U = 2;
const L10_RESERVED_TOP_U = 2;

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
      racks: site.racks.map((rack) => {
        const isLegacyInvalidVr200Rack = rack.modelId === "vr200-cabinet-20260715";
        const modelId =
          isLegacyInvalidVr200Rack
            ? "nv-mgx-rack-v1-2-rev7"
            : BUILT_IN_RACK_MODELS[rack.modelId]?.kind === "rack"
            ? rack.modelId
            : "generic-42u";
        const normalizedL10ModelId =
          BUILT_IN_RACK_MODELS[rack.l10ModelId]?.kind === "l10"
            ? rack.l10ModelId
            : "l10-placeholder";
        const normalizedL10Model = BUILT_IN_RACK_MODELS[normalizedL10ModelId];
        const l10MatchesRack =
          !normalizedL10Model?.compatibleRackModelIds ||
          normalizedL10Model.compatibleRackModelIds.includes(modelId);
        const capacityU = typeof rack.capacityU === "number" ? Math.max(1, Math.round(rack.capacityU)) : 42;
        const firstUsableU = Math.min(capacityU, L10_RESERVED_BOTTOM_U + 1);
        const lastUsableU = Math.max(firstUsableU, capacityU - L10_RESERVED_TOP_U);
        const l10StartU = Math.min(
          lastUsableU,
          Math.max(firstUsableU, Math.round(Number(rack.l10StartU) || firstUsableU))
        );
        const shouldInstallDefaultL10 =
          rack.cabinet.startsWith("NEW-") &&
          rack.status === "reserved" &&
          rack.l10ModelId === "l10-placeholder" &&
          rack.l10Count === 0;
        const shouldRestoreGb300L10 =
          modelId === "nv-mgx-rack-v1-2-rev7" &&
          normalizedL10ModelId === "l10-placeholder" &&
          Number(rack.l10Count) > 0;
        const defaultL10Assignment = getDefaultRackL10Assignment({
          rackModelId: modelId,
          models: BUILT_IN_RACK_MODELS,
          firstUsableU,
        });
        const normalizedL10Count =
          shouldInstallDefaultL10
            ? defaultL10Assignment.l10Count
            : typeof rack.l10Count === "number"
              ? Math.max(0, Math.min(38, Math.round(rack.l10Count)))
              : rack.status === "available"
                ? 0
                : 4;
        const resolvedL10ModelId = shouldInstallDefaultL10
          ? defaultL10Assignment.l10ModelId
          : isLegacyInvalidVr200Rack || shouldRestoreGb300L10
            ? "carlo-next-l10-20260715"
            : l10MatchesRack
              ? normalizedL10ModelId
              : "l10-placeholder";
        const rackUnits = BUILT_IN_RACK_MODELS[resolvedL10ModelId]?.rackUnits ?? 1;
        const l10Slots = normalizeRackUnitSlots({
          capacityU,
          rackUnits,
          rackUnitSlots:
            Array.isArray(rack.l10Slots) && rack.l10Slots.length > 0
              ? rack.l10Slots
              : Array.from(
                  { length: normalizedL10Count },
                  (_, index) => l10StartU + index * rackUnits,
                ),
          reservedBottomU: L10_RESERVED_BOTTOM_U,
          reservedTopU: L10_RESERVED_TOP_U,
        });

        return {
          ...rack,
          capacityU,
          modelId,
          l10ModelId: resolvedL10ModelId,
          l10Count: l10Slots.length,
          l10StartU: shouldInstallDefaultL10
            ? defaultL10Assignment.l10StartU
            : l10Slots[0] ?? l10StartU,
          l10Slots,
        };
      }),
    }));
  } catch {
    return INITIAL_SITE_PLANS;
  }
}

function readInitialModels() {
  if (typeof window === "undefined") return BUILT_IN_RACK_MODELS;

  try {
    const raw = window.localStorage.getItem(MODEL_CATALOG_STORAGE_KEY);
    return mergeModelCatalogOverrides(
      BUILT_IN_RACK_MODELS,
      raw ? JSON.parse(raw) : null
    ) as Record<string, RackModelDefinition>;
  } catch {
    return BUILT_IN_RACK_MODELS;
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
            width: normalizeFacilityDimension(plan.width, base.width),
            depth: normalizeFacilityDimension(plan.depth, base.depth),
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

function getL10RackUnits(model: RackModelDefinition) {
  return model.rackUnits ?? Math.max(1, Math.ceil(model.dimensions.heightMm / 44.45));
}

function getL10Placement(rack: RackPlan, model: RackModelDefinition, count = rack.l10Count) {
  return getRackUnitSelection({
    capacityU: rack.capacityU,
    rackUnits: getL10RackUnits(model),
    moduleCount: count,
    startU: rack.l10StartU,
    reservedBottomU: L10_RESERVED_BOTTOM_U,
    reservedTopU: L10_RESERVED_TOP_U,
  });
}

function getL10Capacity(rack: RackPlan, model: RackModelDefinition) {
  return getRackUnitSelection({
    capacityU: rack.capacityU,
    rackUnits: getL10RackUnits(model),
    moduleCount: 0,
    startU: L10_RESERVED_BOTTOM_U + 1,
    reservedBottomU: L10_RESERVED_BOTTOM_U,
    reservedTopU: L10_RESERVED_TOP_U,
  }).maxVisible;
}

function getRackL10Slots(rack: RackPlan, model: RackModelDefinition) {
  const rackUnits = getL10RackUnits(model);
  return normalizeRackUnitSlots({
    capacityU: rack.capacityU,
    rackUnits,
    rackUnitSlots:
      Array.isArray(rack.l10Slots) && rack.l10Slots.length > 0
        ? rack.l10Slots
        : Array.from(
            { length: rack.l10Count },
            (_, index) => rack.l10StartU + index * rackUnits,
          ),
    reservedBottomU: L10_RESERVED_BOTTOM_U,
    reservedTopU: L10_RESERVED_TOP_U,
  });
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
  l10FirstUsableU: number;
  l10LastUsableU: number;
  l10MaxStartU: number;
  canEdit: boolean;
  onFocus: () => void;
  onOpenModels: () => void;
  onOpenL10Models: () => void;
  onPreviewRackModel: () => void;
  onPreviewL10Model: () => void;
  onL10CountChange: (count: number) => void;
  onL10StartUChange: (startU: number) => void;
  onL10SlotToggle: (rackUnit: number) => void;
  onL10SlotsChange: (rackUnits: number[]) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function RackInspector({
  rack,
  model,
  l10Model,
  l10Capacity,
  l10FirstUsableU,
  l10LastUsableU,
  l10MaxStartU,
  canEdit,
  onFocus,
  onOpenModels,
  onOpenL10Models,
  onPreviewRackModel,
  onPreviewL10Model,
  onL10CountChange,
  onL10StartUChange,
  onL10SlotToggle,
  onL10SlotsChange,
  collapsed = false,
  onToggleCollapse,
}: RackInspectorProps) {
  const health = getRackHealth(rack);
  const sortedDevices = [...rack.devices].sort((left, right) => right.slotStart - left.slotStart);
  const l10RackUnits = getL10RackUnits(l10Model);
  const selectedL10Slots = getRackL10Slots(rack, l10Model);
  const occupiedRackUnits = new Set(
    selectedL10Slots.flatMap((slot) =>
      Array.from({ length: l10RackUnits }, (_, index) => slot + index)
    )
  );
  const railUnits = Array.from(
    { length: Math.max(0, l10LastUsableU - l10FirstUsableU + 1) },
    (_, index) => l10LastUsableU - index
  );
  const usableRackUnits = railUnits.length;

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
            <button
              type="button"
              onClick={onPreviewRackModel}
              className="mt-2 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.08] text-xs font-bold text-cyan-50 hover:border-cyan-300/45 hover:bg-cyan-400/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              <Eye className="h-4 w-4" /> 檢視 L11 細節
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
                  {l10Model.name} · 19 吋軌道 · 每台佔 {l10RackUnits}U
                </p>
                <p className="mt-1 text-[10px] leading-4 text-cyan-100/65">
                  主場景使用保留上蓋的輕量模型；開啟 L10 細節時才載入完整原始 CAD，兼顧外觀與操作流暢度。
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-2 py-1 text-[10px] font-black tabular-nums text-blue-100">
                    {rack.capacityU}U 機櫃
                  </span>
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black tabular-nums text-cyan-100">
                    {usableRackUnits} 個可用 U 位
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onPreviewL10Model}
                  className="h-9 cursor-pointer rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 text-xs font-bold text-cyan-50 hover:border-cyan-300/50 hover:bg-cyan-400/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                  <Eye className="mr-1.5 inline h-3.5 w-3.5" /> 看細節
                </button>
                <button
                  type="button"
                  onClick={onOpenL10Models}
                  className={cn(
                    "h-9 cursor-pointer rounded-lg border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2",
                    rack.l10Count === 0
                      ? "border-cyan-200 bg-cyan-300 text-[#03131f] shadow-[0_0_16px_rgba(34,211,238,0.2)] hover:bg-cyan-200 focus-visible:ring-cyan-100"
                      : "border-[#214669] bg-[#10283d] text-blue-100 hover:border-blue-300/40 hover:bg-[#16324b] focus-visible:ring-blue-300/70"
                  )}
                >
                  {rack.l10Count === 0 ? "選擇並安裝 L10" : "更換 L10 模型"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-[#163653] bg-[#081c2d] px-3 py-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-300">目前數量</div>
                <div className="mt-0.5 text-2xl font-black tabular-nums text-white">
                  {selectedL10Slots.length}
                  <span className="ml-1 text-sm font-semibold text-slate-400">/ {l10Capacity}</span>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  已選 {selectedL10Slots.length} 層，最多可安裝 {l10Capacity} 台
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="減少一台 L10 1U 機台"
                   disabled={!canEdit || selectedL10Slots.length <= 0}
                   onClick={() => onL10CountChange(selectedL10Slots.length - 1)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[#214669] bg-[#10283d] text-slate-100 hover:border-blue-300/40 hover:bg-[#16324b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="增加一台 L10 1U 機台"
                   disabled={!canEdit || selectedL10Slots.length >= l10Capacity}
                   onClick={() => onL10CountChange(selectedL10Slots.length + 1)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-blue-500 text-white hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-blue-950 disabled:text-blue-100/45"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-cyan-300/20 bg-[#071827] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-50">
                    <Layers3 className="h-4 w-4 text-cyan-300" /> 選擇安裝層位
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300">
                    點選任意可用 U 位；可分開安裝，不必連續排列
                  </p>
                </div>
                <Select
                  value={String(rack.l10StartU)}
                  onValueChange={(value) => onL10StartUChange(Number(value))}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="h-10 w-[104px] border-cyan-300/30 bg-[#10283d] font-bold text-cyan-50">
                    <SelectValue aria-label={`起始層 U${rack.l10StartU}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: Math.max(0, l10MaxStartU - l10FirstUsableU + 1) },
                      (_, index) => l10FirstUsableU + index
                    ).map((unit) => (
                      <SelectItem key={unit} value={String(unit)}>U{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#214669] bg-[#0c2235] px-3 py-2">
                <span className="text-[11px] font-semibold text-slate-300">目前佔用</span>
                <span className="text-xs font-black tabular-nums text-cyan-100">
                    {selectedL10Slots.length
                      ? selectedL10Slots.map((unit) => `U${unit}`).join("、")
                      : "尚未放置"}
                </span>
              </div>

              <div className="mt-3 rounded-xl border border-blue-300/20 bg-blue-400/[0.06] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-blue-50">快速安裝層位</div>
                    <p className="mt-1 text-[10px] leading-4 text-blue-100/65">
                      一鍵配置連續層位；仍可在下方逐層微調。
                    </p>
                  </div>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-black tabular-nums text-cyan-100">
                    可用 {l10Capacity} 層
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      onL10SlotsChange(
                        Array.from(
                          { length: l10Capacity },
                          (_, index) => l10FirstUsableU + index * l10RackUnits,
                        ),
                      )
                    }
                    className="h-9 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2 text-[11px] font-bold text-cyan-50 hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    由下往上填滿
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      onL10SlotsChange(
                        Array.from(
                          { length: l10Capacity },
                          (_, index) => l10LastUsableU - l10RackUnits + 1 - index * l10RackUnits,
                        ).sort((left, right) => left - right),
                      )
                    }
                    className="h-9 rounded-lg border border-blue-300/25 bg-blue-400/10 px-2 text-[11px] font-bold text-blue-50 hover:bg-blue-400/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    由上往下填滿
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || selectedL10Slots.length === 0}
                    onClick={() => onL10SlotsChange([])}
                    className="h-9 rounded-lg border border-rose-300/25 bg-rose-400/[0.08] px-2 text-[11px] font-bold text-rose-100 hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    清空層位
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-8 gap-1" aria-label={`${rack.capacityU}U 機櫃軌道配置`}>
                {railUnits.map((unit) => {
                  const selected = selectedL10Slots.includes(unit);
                  const occupiedByAnotherSlot =
                    occupiedRackUnits.has(unit) && !selected;
                  const lastRequiredUnit = unit + l10RackUnits - 1;
                  const fitsInsideRack = lastRequiredUnit <= l10LastUsableU;
                  const overlapsAnotherSlot = selectedL10Slots.some((slot) => {
                    if (slot === unit) return false;
                    const slotEnd = slot + l10RackUnits - 1;
                    return unit <= slotEnd && lastRequiredUnit >= slot;
                  });
                  const canToggle = canEdit && (selected || (fitsInsideRack && !overlapsAnotherSlot));
                  return (
                    <button
                      key={unit}
                      type="button"
                      title={
                        selected
                          ? `移除 U${unit} 的 L10`
                          : canToggle
                            ? `在 U${unit} 安裝 L10`
                            : `U${unit} 無法安裝：空間不足或與其他 L10 重疊`
                      }
                      aria-label={`U${unit}${selected ? "，已選取" : ""}`}
                      aria-pressed={selected}
                      disabled={!canToggle}
                      onClick={() => onL10SlotToggle(unit)}
                      className={cn(
                        "flex h-7 items-center justify-center rounded-md border text-[10px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                        selected
                          ? "border-cyan-200/70 bg-cyan-400 text-[#03131f] shadow-[0_0_12px_rgba(34,211,238,0.28)]"
                          : occupiedByAnotherSlot
                            ? "cursor-not-allowed border-cyan-300/20 bg-cyan-400/10 text-cyan-300/45"
                            : canToggle
                              ? "border-[#214669] bg-[#10283d] text-slate-300 hover:border-cyan-300/55 hover:text-cyan-50"
                              : "cursor-not-allowed border-[#163653]/60 bg-[#081c2d] text-slate-600"
                      )}
                    >
                      {unit}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">
                底部保留 {L10_RESERVED_BOTTOM_U}U、頂部保留 {L10_RESERVED_TOP_U}U 維修空間；亮色層位會立即同步到 3D 機櫃。
              </p>
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
  modelUsageById: Record<string, number>;
  onUpdateModel: (
    modelId: string,
    updates: Pick<RackModelDefinition, "name" | "manufacturer" | "revision" | "dimensions">
  ) => void;
  onDeleteModel: (modelId: string) => void;
  onPreviewModel: (modelId: string) => void;
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
  modelUsageById,
  onUpdateModel,
  onDeleteModel,
  onPreviewModel,
}: ModelLibraryProps) {
  const [view, setView] = useState<"browse" | "import" | "edit">("browse");
  const [editDraft, setEditDraft] = useState<{
    name: string;
    manufacturer: string;
    revision: string;
    dimensions: ImportedStepDimensions;
  } | null>(null);
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
      : selectedRack.l10ModelId === selectedModel.id && selectedRack.l10Count > 0
    : false;
  const selectedIsCompatible = selectedModel
    ? selectedModel.kind === "rack" || isL10CompatibleWithRack(selectedModel, selectedRack.modelId)
    : false;
  const selectedIsProtected = isProtectedCatalogModel(selectedModel?.id);
  const selectedUsageCount = selectedModel ? modelUsageById[selectedModel.id] ?? 0 : 0;

  const beginEditingSelectedModel = () => {
    if (!selectedModel) return;
    setEditDraft({
      name: selectedModel.name,
      manufacturer: selectedModel.manufacturer,
      revision: selectedModel.revision,
      dimensions: { ...selectedModel.dimensions },
    });
    setView("edit");
  };

  const saveSelectedModel = () => {
    if (!selectedModel || !editDraft || !editDraft.name.trim()) return;
    onUpdateModel(selectedModel.id, {
      ...editDraft,
      name: editDraft.name.trim(),
      manufacturer: editDraft.manufacturer.trim() || "未指定廠商",
      revision: editDraft.revision.trim() || "未指定版本",
    });
    setView("browse");
  };

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
                      : "L10 只會安裝在相容的 L11 機櫃軌道內；空機櫃會先安裝 1 台，之後可調整數量與起始 U 位。"}
                  </p>
                </div>
                <Badge className="border-cyan-300/18 bg-cyan-400/8 text-[11px] text-cyan-50 shadow-none">
                  {catalogModels.length} 個模型
                </Badge>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                {catalogModels.map((model) => {
                  const selected = model.id === selectedModel?.id;
                  const compatible =
                    model.kind === "rack" || isL10CompatibleWithRack(model, selectedRack.modelId);
                  const waitingForRack =
                    model.kind === "l10" &&
                    Array.isArray(model.compatibleRackModelIds) &&
                    model.compatibleRackModelIds.length === 0;
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
                            {model.kind === "l10" ? (
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                                  compatible
                                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                                    : waitingForRack
                                      ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                                      : "border-rose-300/30 bg-rose-400/10 text-rose-100",
                                )}
                              >
                                {compatible ? "可安裝" : waitingForRack ? "等待對應 L11" : "不相容"}
                              </span>
                            ) : null}
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
                      {selectedIsAssigned
                        ? `目前已套用至 ${selectedRack.cabinet}`
                        : selectedIsCompatible
                          ? `準備套用至 ${selectedRack.cabinet}`
                          : `不能套用至 ${selectedRack.cabinet}`}
                    </span>
                  </div>
                  {selectedModel.kind === "l10" && selectedModel.compatibilityNote ? (
                    <div
                      className={cn(
                        "mb-3 rounded-xl border px-3 py-2.5 text-xs leading-5",
                        selectedIsCompatible
                          ? "border-cyan-300/20 bg-cyan-400/[0.07] text-cyan-50"
                          : "border-amber-300/25 bg-amber-400/[0.08] text-amber-50",
                      )}
                    >
                      {selectedModel.compatibilityNote}
                    </div>
                  ) : null}
                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onPreviewModel(selectedModel.id)}
                      className="h-11 rounded-xl border-cyan-300/25 bg-cyan-400/[0.08] text-sm font-bold text-cyan-50 hover:bg-cyan-400/[0.15]"
                    >
                      <Eye className="mr-2 h-4 w-4" /> 檢視模型細節
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={beginEditingSelectedModel}
                      className="h-11 rounded-xl border-blue-300/25 bg-blue-400/[0.08] text-sm font-bold text-blue-50 hover:bg-blue-400/[0.15]"
                    >
                      <PencilRuler className="mr-2 h-4 w-4" /> 編輯模型資料
                    </Button>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canEdit || selectedIsProtected}
                        className="mb-2 h-11 w-full rounded-xl border-rose-300/25 bg-rose-400/[0.07] text-sm font-bold text-rose-100 hover:bg-rose-400/[0.14] disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-slate-500"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {selectedIsProtected ? "內建核心模型不可刪除" : "刪除模型"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-cyan-300/18 bg-[#081725] text-slate-100">
                      <AlertDialogHeader>
                        <AlertDialogTitle>確定刪除「{selectedModel.name}」？</AlertDialogTitle>
                        <AlertDialogDescription className="leading-6 text-slate-300">
                          {selectedUsageCount > 0
                            ? `目前有 ${selectedUsageCount} 座機櫃使用此模型。刪除後會自動改用安全替代模型，機櫃位置、L10 數量與 U 位資料不會消失。`
                            : "此模型目前未被任何機櫃使用。刪除後會從模型型錄移除。"}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-[#2a526f] bg-[#10263a] text-slate-100 hover:bg-[#17364f] hover:text-white">
                          取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteModel(selectedModel.id)}
                          className="bg-rose-500 font-bold text-white hover:bg-rose-400"
                        >
                          確認刪除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                    <Button type="button" disabled={!canEdit || selectedIsAssigned || !selectedIsCompatible} onClick={onAssignL10Model} className="h-12 w-full rounded-xl bg-cyan-300 text-sm font-bold text-cyan-950 hover:bg-cyan-200 disabled:bg-cyan-950 disabled:text-cyan-100/45">
                      <Cpu className="mr-2 h-4 w-4" /> {selectedRack.l10Count > 0 ? "替換櫃內 L10 外型" : `安裝 1 台至 U${selectedRack.l10StartU}`}
                    </Button>
                  )}
                </div>
              ) : null}
            </section>
            ) : view === "edit" && editDraft && selectedModel ? (
            <section className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-black text-white">編輯模型資料</div>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    編輯顯示名稱、廠牌、版本與校正尺寸；模型 ID 與 3D 資產不會被更動。
                  </p>
                </div>
                <Badge className="border-cyan-300/20 bg-cyan-400/10 text-cyan-50 shadow-none">
                  {selectedModel.kind === "rack" ? "L11 機櫃" : "L10 1U"}
                </Badge>
              </div>

              <div className="rounded-2xl border border-[#214669] bg-[#0b1b2d] p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-sm font-bold text-slate-100">模型名稱</span>
                    <Input
                      value={editDraft.name}
                      onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                      className="h-12 border-[#2a526f] bg-[#10263a] text-base font-semibold text-white"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-bold text-slate-100">廠牌</span>
                    <Input
                      value={editDraft.manufacturer}
                      onChange={(event) => setEditDraft({ ...editDraft, manufacturer: event.target.value })}
                      className="h-11 border-[#2a526f] bg-[#10263a] text-white"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-bold text-slate-100">版本</span>
                    <Input
                      value={editDraft.revision}
                      onChange={(event) => setEditDraft({ ...editDraft, revision: event.target.value })}
                      className="h-11 border-[#2a526f] bg-[#10263a] text-white"
                    />
                  </label>
                </div>

                <div className="mt-5 border-t border-[#214669] pt-5">
                  <div className="text-sm font-bold text-white">實體校正尺寸</div>
                  <p className="mt-1 text-xs text-slate-400">單位為毫米，順序固定為寬、深、高。</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {([[
                      "widthMm",
                      "寬 mm",
                    ], ["depthMm", "深 mm"], ["heightMm", "高 mm"]] as const).map(([key, label]) => (
                      <label key={key} className="space-y-1.5">
                        <span className="text-xs font-semibold text-cyan-100/75">{label}</span>
                        <Input
                          type="number"
                          min={1}
                          value={editDraft.dimensions[key]}
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            dimensions: {
                              ...editDraft.dimensions,
                              [key]: Math.max(1, Number(event.target.value) || 1),
                            },
                          })}
                          className="h-11 border-[#2a526f] bg-[#10263a] px-2 tabular-nums text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
                <Button type="button" variant="outline" onClick={() => setView("browse")} className="h-11 border-[#2a526f] bg-[#10263a] text-slate-100 hover:bg-[#17364f]">
                  取消
                </Button>
                <Button type="button" disabled={!editDraft.name.trim()} onClick={saveSelectedModel} className="h-11 bg-cyan-300 px-5 font-bold text-cyan-950 hover:bg-cyan-200">
                  儲存模型資料
                </Button>
              </div>
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
            <span>{view === "browse" && selectedModel ? `目前選取：${selectedModel.name}` : view === "edit" && selectedModel ? `正在編輯：${selectedModel.name}` : `準備匯入：${importKind === "rack" ? "L11 機櫃外型" : "L10 1U 機台"}`}</span>
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
  const [models, setModels] = useState<Record<string, RackModelDefinition>>(readInitialModels);
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
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 640px)").matches
  );
  const [workspaceMode, setWorkspaceMode] = useState<"3d" | "2d">("3d");
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
  const selectedL10Placement = getL10Placement(selectedRack, selectedL10Model);
  const selectedL10Capacity = selectedL10Placement.maxVisible;
  const selectedFacility = facilityPlans[selectedSiteId] ?? cloneDefaultFacilityPlan();
  const modelUsageById = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const site of sites) {
      for (const rack of site.racks) {
        usage[rack.modelId] = (usage[rack.modelId] ?? 0) + 1;
        if (rack.l10Count > 0) {
          usage[rack.l10ModelId] = (usage[rack.l10ModelId] ?? 0) + 1;
        }
      }
    }
    return usage;
  }, [sites]);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(sites));
  }, [sites]);

  useEffect(() => {
    window.localStorage.setItem(FACILITY_STORAGE_KEY, JSON.stringify(facilityPlans));
  }, [facilityPlans]);

  useEffect(() => {
    window.localStorage.setItem(
      MODEL_CATALOG_STORAGE_KEY,
      JSON.stringify(serializeModelCatalogOverrides(models, BUILT_IN_RACK_MODELS))
    );
  }, [models]);

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
    if (workspaceMode === "3d") requestCamera("focus");
  };

  const updateCatalogModel = (
    modelId: string,
    updates: Pick<RackModelDefinition, "name" | "manufacturer" | "revision" | "dimensions">
  ) => {
    if (!canEdit) return;
    setModels((current) => {
      const model = current[modelId];
      return model ? { ...current, [modelId]: { ...model, ...updates } } : current;
    });
    toast({
      title: "模型資料已更新",
      description: `${updates.name} 的顯示名稱、版本與尺寸已儲存。`,
    });
  };

  const deleteCatalogModel = (modelId: string) => {
    if (!canEdit) return;
    const deletedModel = models[modelId];
    const result = removeCatalogModel({ models, sites, modelId });

    if (!result.deleted) {
      toast({
        title: result.reason === "protected" ? "內建核心模型不可刪除" : "模型無法刪除",
        description:
          result.reason === "protected"
            ? "官方 GB300、VR200 與系統救援模型會永久保留，避免舊設定讓型錄或場景缺少必要模型。"
            : "請確認型錄中仍保留至少一個同類型模型。",
        variant: "destructive",
      });
      return;
    }

    if (deletedModel?.assetUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(deletedModel.assetUrl);
      uploadedUrlsRef.current = uploadedUrlsRef.current.filter(
        (url) => url !== deletedModel.assetUrl
      );
    }
    setModels(result.models as Record<string, RackModelDefinition>);
    setSites(result.sites as SitePlan[]);
    setPreviewModelId((current) => (current === modelId ? null : current));

    const nextSelectedModel =
      result.models[result.fallbackModelId] ??
      Object.values(result.models).find((model) => model.kind === deletedModel?.kind);
    if (nextSelectedModel) setSelectedModelId(nextSelectedModel.id);

    toast({
      title: "模型已刪除",
      description:
        result.affectedRackCount > 0
          ? `${deletedModel?.name ?? "模型"} 已移除，${result.affectedRackCount} 座受影響機櫃已切換至安全替代模型。`
          : `${deletedModel?.name ?? "模型"} 已從模型型錄移除。`,
    });
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
    updateFacility((facility) => ({
      ...facility,
      [field]: normalizeFacilityDimension(next, facility[field]),
    }));
  };

  const addAisle = (kind: FacilityAisleKind, orientation: FacilityAisleOrientation) => {
    const index = selectedFacility.aisles.filter((aisle) => aisle.kind === kind).length + 1;
    updateFacility((facility) => ({
      ...facility,
      aisles: [
        ...facility.aisles,
        {
          id: `${kind}-${crypto.randomUUID()}`,
          label: `${kind === "cold" ? "冷通道" : "熱通道"} ${index} · ${orientation === "horizontal" ? "橫向" : "直向"}`,
          kind,
          x: 0,
          z: 0,
          width: Math.max(
            4,
            (orientation === "horizontal" ? facility.width : facility.depth) - 3.8
          ),
          depth: kind === "cold" ? 2.1 : 1.15,
          rotation: orientation === "horizontal" ? 0 : 90,
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

  const placeRackOnPlan = (rackId: string, x: number, z: number) => {
    if (!canEdit) return;
    setSites((currentSites) =>
      currentSites.map((site) => {
        if (site.id !== selectedSiteId) return site;
        const movingRack = site.racks.find((rack) => rack.id === rackId);
        if (!movingRack) return site;
        const footprint = getFootprint(movingRack);
        const collision = site.racks.some((rack) => {
          if (rack.id === rackId) return false;
          const other = getFootprint(rack);
          return (
            Math.abs(x - rack.positionX) < (footprint.width + other.width) / 2 + 0.12 &&
            Math.abs(z - rack.positionZ) < (footprint.depth + other.depth) / 2 + 0.12
          );
        });
        if (collision) return site;
        return {
          ...site,
          racks: site.racks.map((rack) =>
            rack.id === rackId ? { ...rack, positionX: x, positionZ: z } : rack
          ),
        };
      })
    );
  };

  const rotateRackOnPlan = (rackId: string) => {
    if (!canEdit) return;
    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId
          ? {
              ...site,
              racks: site.racks.map((rack) =>
                rack.id === rackId ? { ...rack, rotation: (rack.rotation + 90) % 360 } : rack
              ),
            }
          : site
      )
    );
  };

  const findAvailableRackPosition = (rack: RackPlan) => {
    const footprint = getFootprint(rack);
    const padding = 0.25;
    const minX = -selectedFacility.width / 2 + footprint.width / 2 + padding;
    const maxX = selectedFacility.width / 2 - footprint.width / 2 - padding;
    const minZ = -selectedFacility.depth / 2 + footprint.depth / 2 + padding;
    const maxZ = selectedFacility.depth / 2 - footprint.depth / 2 - padding;
    if (minX > maxX || minZ > maxZ) return null;

    const isAvailable = (x: number, z: number) =>
      selectedSite.racks.every((otherRack) => {
        const other = getFootprint(otherRack);
        return (
          Math.abs(x - otherRack.positionX) >= (footprint.width + other.width) / 2 + 0.12 ||
          Math.abs(z - otherRack.positionZ) >= (footprint.depth + other.depth) / 2 + 0.12
        );
      });
    const snap = (value: number) => Math.round(value * 4) / 4;
    const clampToFloor = (value: number, min: number, max: number) =>
      snap(Math.min(max, Math.max(min, value)));
    const xStep = Math.max(1.25, footprint.width + 0.5);
    const zStep = Math.max(1.5, footprint.depth + 0.5);
    const nearbyCandidates = [
      [selectedRack.positionX + xStep, selectedRack.positionZ],
      [selectedRack.positionX - xStep, selectedRack.positionZ],
      [selectedRack.positionX, selectedRack.positionZ + zStep],
      [selectedRack.positionX, selectedRack.positionZ - zStep],
    ].map(([x, z]) => ({
      x: clampToFloor(x, minX, maxX),
      z: clampToFloor(z, minZ, maxZ),
    }));

    for (const candidate of nearbyCandidates) {
      if (isAvailable(candidate.x, candidate.z)) return candidate;
    }
    for (let z = minZ; z <= maxZ + 0.001; z += 0.5) {
      for (let x = minX; x <= maxX + 0.001; x += 0.5) {
        const candidate = { x: snap(x), z: snap(z) };
        if (isAvailable(candidate.x, candidate.z)) return candidate;
      }
    }
    return null;
  };

  const removeRackFromPlan = (rackId: string) => {
    if (!canEdit) return;
    const rackIndex = selectedSite.racks.findIndex((rack) => rack.id === rackId);
    if (rackIndex < 0) return;
    if (selectedSite.racks.length <= 1) {
      toast({
        title: "無法刪除最後一座機櫃",
        description: "場景至少需要保留一座機櫃，才能維持 2D、3D 與詳情面板正常運作。",
        variant: "destructive",
      });
      return;
    }

    const removedRack = selectedSite.racks[rackIndex];
    const remainingRacks = selectedSite.racks.filter((rack) => rack.id !== rackId);
    const nextRack = remainingRacks[Math.min(rackIndex, remainingRacks.length - 1)];
    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId ? { ...site, racks: remainingRacks } : site
      )
    );
    setSelectedRackId(nextRack.id);
    toast({
      title: "機櫃已刪除",
      description: `${removedRack.cabinet} 已同步從 2D 與 3D 場景移除。`,
    });
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
    updateSelectedRack((rack) => {
      const assignedL10 = models[rack.l10ModelId];
      const l10ModelId = isL10CompatibleWithRack(assignedL10, selectedModelId)
        ? rack.l10ModelId
        : "l10-placeholder";
      return { ...rack, modelId: selectedModelId, l10ModelId };
    });
    toast({
      title: "L11 機櫃外型已更新",
      description: `${selectedRack.cabinet} 已套用 ${models[selectedModelId].name}。`,
    });
  };

  const assignSelectedL10Model = () => {
    const definition = models[selectedModelId];
    if (!canEdit || definition?.kind !== "l10") return;
    if (!isL10CompatibleWithRack(definition, selectedRack.modelId)) {
      toast({
        title: "此 L10 無法安裝",
        description: definition.compatibilityNote || "此 L10 與目前 L11 機櫃不相容。",
        variant: "destructive",
      });
      return;
    }

    const capacity = getL10Capacity(selectedRack, definition);
    const assignedCount = getAssignedModuleCount({
      currentCount: selectedRack.l10Count,
      capacity,
    });
    if (assignedCount === 0) {
      toast({
        title: "目前機櫃沒有可用 U 位",
        description: "請先減少保留空間或調整機櫃容量，再安裝 L10。",
        variant: "destructive",
      });
      return;
    }

    updateSelectedRack((rack) => {
      const existingSlots = getRackL10Slots(rack, definition);
      const placement = getL10Placement(rack, definition);
      const l10Slots =
        existingSlots.length > 0
          ? existingSlots
          : normalizeRackUnitSlots({
              capacityU: rack.capacityU,
              rackUnits: getL10RackUnits(definition),
              rackUnitSlots: [placement.startU],
              reservedBottomU: L10_RESERVED_BOTTOM_U,
              reservedTopU: L10_RESERVED_TOP_U,
            });
      return {
        ...rack,
        l10ModelId: selectedModelId,
        l10Slots,
        l10Count: l10Slots.length,
        l10StartU: l10Slots[0] ?? placement.startU,
      };
    });
    toast({
      title: selectedRack.l10Count > 0 ? "櫃內 L10 外型已更新" : "L10 已安裝",
      description:
        selectedRack.l10Count > 0
          ? `${selectedRack.cabinet} 內的 ${assignedCount} 台 L10 已套用 ${definition.name}。`
          : `${definition.name} 已安裝至 ${selectedRack.cabinet} 的 U${selectedRack.l10StartU}。`,
    });
  };

  const changeSelectedRackL10Count = (count: number) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const rackUnits = getL10RackUnits(selectedL10Model);
      const capacity = getL10Capacity(rack, selectedL10Model);
      const desiredCount = Math.max(0, Math.min(capacity, Math.round(count)));
      const existingSlots = getRackL10Slots(rack, selectedL10Model);
      const requestedSlots = existingSlots.slice(0, desiredCount);

      if (requestedSlots.length < desiredCount) {
        const firstUsableU = L10_RESERVED_BOTTOM_U + 1;
        const lastUsableU = rack.capacityU - L10_RESERVED_TOP_U;
        for (
          let candidate = firstUsableU;
          candidate + rackUnits - 1 <= lastUsableU && requestedSlots.length < desiredCount;
          candidate += 1
        ) {
          const normalized = normalizeRackUnitSlots({
            capacityU: rack.capacityU,
            rackUnits,
            rackUnitSlots: [...requestedSlots, candidate],
            reservedBottomU: L10_RESERVED_BOTTOM_U,
            reservedTopU: L10_RESERVED_TOP_U,
          });
          if (normalized.length > requestedSlots.length) {
            requestedSlots.splice(0, requestedSlots.length, ...normalized);
          }
        }
      }

      return {
        ...rack,
        l10Slots: requestedSlots,
        l10Count: requestedSlots.length,
        l10StartU: requestedSlots[0] ?? rack.l10StartU,
      };
    });
  };

  const changeSelectedRackL10StartU = (startU: number) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const placement = getRackUnitSelection({
        capacityU: rack.capacityU,
        rackUnits: getL10RackUnits(selectedL10Model),
        moduleCount: rack.l10Count,
        startU,
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });
      const rackUnits = getL10RackUnits(selectedL10Model);
      const l10Slots = normalizeRackUnitSlots({
        capacityU: rack.capacityU,
        rackUnits,
        rackUnitSlots: Array.from(
          { length: placement.visibleCount },
          (_, index) => placement.startU + index * rackUnits
        ),
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });
      return {
        ...rack,
        l10Slots,
        l10Count: l10Slots.length,
        l10StartU: l10Slots[0] ?? Math.min(placement.startU, placement.maxStartUForCount),
      };
    });
  };

  const toggleSelectedRackL10Slot = (rackUnit: number) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const existingSlots = getRackL10Slots(rack, selectedL10Model);
      const requestedSlots = existingSlots.includes(rackUnit)
        ? existingSlots.filter((slot) => slot !== rackUnit)
        : [...existingSlots, rackUnit];
      const l10Slots = normalizeRackUnitSlots({
        capacityU: rack.capacityU,
        rackUnits: getL10RackUnits(selectedL10Model),
        rackUnitSlots: requestedSlots,
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });

      if (!existingSlots.includes(rackUnit) && l10Slots.length === existingSlots.length) {
        toast({
          title: "此層無法安裝",
          description: `U${rackUnit} 空間不足或會與其他 L10 重疊。`,
          variant: "destructive",
        });
        return rack;
      }

      return {
        ...rack,
        l10Slots,
        l10Count: l10Slots.length,
        l10StartU: l10Slots[0] ?? rack.l10StartU,
      };
    });
  };

  const changeSelectedRackL10Slots = (rackUnitSlots: number[]) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const l10Slots = normalizeRackUnitSlots({
        capacityU: rack.capacityU,
        rackUnits: getL10RackUnits(selectedL10Model),
        rackUnitSlots,
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });

      return {
        ...rack,
        l10Slots,
        l10Count: l10Slots.length,
        l10StartU: l10Slots[0] ?? rack.l10StartU,
      };
    });
  };

  const addRackUsingModel = (modelId: string, closeModelLibrary: boolean) => {
    if (!canEdit || models[modelId]?.kind !== "rack") return;
    const definition = models[modelId];
    const defaultL10Assignment = getDefaultRackL10Assignment({
      rackModelId: definition.id,
      models,
      firstUsableU: L10_RESERVED_BOTTOM_U + 1,
    });
    const defaultL10Model = models[defaultL10Assignment.l10ModelId];
    const defaultL10RackUnits = getL10RackUnits(
      defaultL10Model ?? models["l10-placeholder"]
    );
    const baseRack = {
      ...createRackFromModel(definition, selectedSite),
      ...defaultL10Assignment,
      l10Slots: Array.from(
        { length: defaultL10Assignment.l10Count },
        (_, index) =>
          defaultL10Assignment.l10StartU + index * defaultL10RackUnits
      ),
    };
    const position = findAvailableRackPosition(baseRack);
    if (!position) {
      toast({
        title: "目前沒有可放置的位置",
        description: "請先移動機櫃或放大廠房尺寸，再新增機櫃。",
        variant: "destructive",
      });
      return;
    }
    const nextRack = {
      ...baseRack,
      positionX: position.x,
      positionZ: position.z,
    };

    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId ? { ...site, racks: [...site.racks, nextRack] } : site
      )
    );
    setSelectedRackId(nextRack.id);
    if (closeModelLibrary) setModelLibraryOpen(false);
    if (workspaceMode === "3d") requestCamera("focus");
    toast({
      title: "新機櫃已放入場景",
      description:
        nextRack.l10Count > 0
          ? `${nextRack.cabinet} 使用 ${definition.name}，已在 U${nextRack.l10StartU} 安裝相容 L10。`
          : `${nextRack.cabinet} 使用 ${definition.name}；目前沒有相容 L10，可從型錄另行安裝。`,
    });
  };

  const addRackFromSelectedModel = () => addRackUsingModel(selectedModelId, true);
  const addRackFromCurrentModel = () => addRackUsingModel(selectedRack.modelId, false);

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
    l10FirstUsableU: selectedL10Placement.firstUsableU,
    l10LastUsableU: selectedL10Placement.lastUsableU,
    l10MaxStartU: selectedL10Placement.maxStartUForCount,
    canEdit,
    onFocus: () => requestCamera("focus"),
    onOpenModels: () => openModelLibrary("rack"),
    onOpenL10Models: () => openModelLibrary("l10"),
    onPreviewRackModel: () => setPreviewModelId(selectedModel.id),
    onPreviewL10Model: () => setPreviewModelId(selectedL10Model.id),
    onL10CountChange: changeSelectedRackL10Count,
    onL10StartUChange: changeSelectedRackL10StartU,
    onL10SlotToggle: toggleSelectedRackL10Slot,
    onL10SlotsChange: changeSelectedRackL10Slots,
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
                onClick={() => {
                  setWorkspaceMode("2d");
                }}
                className={cn(
                  "h-11 rounded-xl px-4 text-sm font-bold",
                  workspaceMode === "2d"
                    ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
                    : "bg-cyan-400 text-cyan-950 hover:bg-cyan-300"
                )}
              >
                <Map className="mr-2 h-4 w-4" />
                {workspaceMode === "2d" ? "2D 規劃中" : "2D 規劃"}
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
            {workspaceMode === "3d" ? (
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
            ) : (
              <DataCenter2DPlanner
                racks={selectedSite.racks}
                models={models}
                selectedRackId={selectedRackId}
                facility={selectedFacility}
                canEdit={canEdit}
                onSelectRack={handleRackSelect}
                onMoveRack={placeRackOnPlan}
                onRotateRack={rotateRackOnPlan}
                onAddRack={addRackFromCurrentModel}
                onDeleteRack={removeRackFromPlan}
                onMoveAisle={(aisleId, x, z) => updateAisle(aisleId, (aisle) => ({ ...aisle, x, z }))}
                onUpdateAisle={(aisleId, patch) => updateAisle(aisleId, (aisle) => ({ ...aisle, ...patch }))}
                onMovePowerFeed={(feedId, x, z) => updatePowerFeed(feedId, (feed) => ({ ...feed, x, z }))}
                onAddAisle={addAisle}
                onAddPowerFeed={addPowerFeed}
                onOpenModels={() => openModelLibrary("rack")}
                onOpenFacilitySettings={() => setFacilityPlannerOpen(true)}
                onView3D={() => {
                  setWorkspaceMode("3d");
                  requestCamera("overview");
                }}
              />
            )}

            <div className={cn("absolute left-4 top-4 z-20 flex max-w-[calc(100%-32px)] flex-wrap items-center gap-2", workspaceMode !== "3d" && "hidden")}>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-black/72 px-3 shadow-xl backdrop-blur-xl">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${activeLayerOption.color}1f`, color: activeLayerOption.color }}>
                  <activeLayerOption.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs font-bold text-white">{activeLayerOption.label}</div>
                  <div className="text-[10px] text-slate-300">{activeLayerOption.description}</div>
                </div>
              </div>
              <button
                type="button"
                data-testid="facility-size-button"
                onClick={() => setFacilityPlannerOpen(true)}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-cyan-200/35 bg-[#08283b]/94 px-3 text-left shadow-xl backdrop-blur-xl transition-colors hover:border-cyan-100/70 hover:bg-[#0b3650] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                <PencilRuler className="h-4 w-4 shrink-0 text-cyan-200" />
                <span>
                  <span className="block text-xs font-black text-white">
                    地板 {selectedFacility.width} × {selectedFacility.depth} m
                  </span>
                  <span className="block text-[10px] font-semibold text-cyan-100/75">
                    {getFacilityAreaSquareMeters(selectedFacility)} m² · 點擊調整
                  </span>
                </span>
              </button>

            </div>

            <div className="hidden">
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
                ["detail", ZoomIn, "近距離檢查"],
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

            <div
              data-testid="data-center-simple-toolbar"
              className={cn(
                "absolute right-4 top-4 z-20 flex max-w-[calc(100%-32px)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-cyan-200/18 bg-[#06111d]/92 p-2 shadow-2xl backdrop-blur-xl",
                workspaceMode !== "3d" && "hidden"
              )}
            >
              <Button
                type="button"
                onClick={() => {
                  setWorkspaceMode("2d");
                }}
                className="h-9 bg-cyan-300 px-3 text-xs font-black text-[#04131f] hover:bg-cyan-200"
              >
                <Map className="mr-2 h-4 w-4" /> 2D 規劃
              </Button>
              <Button type="button" variant="outline" onClick={() => setMobileLeftOpen(true)} className="h-9 border-white/12 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/[0.09]">
                <Layers3 className="mr-2 h-4 w-4" /> 機櫃清單
              </Button>
              <Button type="button" variant="outline" onClick={() => setMobileRightOpen(true)} className="h-9 border-white/12 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/[0.09]">
                <Server className="mr-2 h-4 w-4" /> 機櫃設定
              </Button>
              <Select value={activeLayer} onValueChange={(value) => setActiveLayer(value as DataCenterLayer)}>
                <SelectTrigger aria-label="選擇 3D 顯示圖層" className="h-9 w-[126px] rounded-lg border-white/12 bg-white/[0.04] text-xs font-bold text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#214669] bg-[#081c2d] text-slate-100">
                  {LAYER_OPTIONS.map((layer) => (
                    <SelectItem key={layer.id} value={layer.id}>{layer.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => requestCamera("overview")} className="h-9 border-white/12 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/[0.09]">
                <Boxes className="mr-2 h-4 w-4" /> 全景
              </Button>
              <Button type="button" variant="outline" onClick={() => requestCamera("top")} className="h-9 border-white/12 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/[0.09]">
                <LayoutDashboard className="mr-2 h-4 w-4" /> 俯視
              </Button>
              <Button type="button" variant="outline" onClick={() => requestCamera("focus")} className="h-9 border-white/12 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/[0.09]">
                <Focus className="mr-2 h-4 w-4" /> 聚焦
              </Button>
            </div>

            <div className={cn("absolute bottom-4 left-4 z-20 hidden items-center gap-3 rounded-xl border border-white/10 bg-black/72 px-3 py-2 text-[11px] text-slate-300 backdrop-blur-xl sm:flex", workspaceMode !== "3d" && "!hidden")}>
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
          {workspaceMode === "3d" ? (
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
          ) : (
            <DataCenter2DPlanner
              racks={selectedSite.racks}
              models={models}
              selectedRackId={selectedRackId}
              facility={selectedFacility}
              canEdit={canEdit}
              onSelectRack={handleRackSelect}
              onMoveRack={placeRackOnPlan}
              onRotateRack={rotateRackOnPlan}
              onAddRack={addRackFromCurrentModel}
              onDeleteRack={removeRackFromPlan}
              onMoveAisle={(aisleId, x, z) => updateAisle(aisleId, (aisle) => ({ ...aisle, x, z }))}
              onUpdateAisle={(aisleId, patch) => updateAisle(aisleId, (aisle) => ({ ...aisle, ...patch }))}
              onMovePowerFeed={(feedId, x, z) => updatePowerFeed(feedId, (feed) => ({ ...feed, x, z }))}
              onAddAisle={addAisle}
              onAddPowerFeed={addPowerFeed}
              onOpenModels={() => openModelLibrary("rack")}
              onOpenFacilitySettings={() => setFacilityPlannerOpen(true)}
              onView3D={() => {
                setWorkspaceMode("3d");
                requestCamera("overview");
              }}
            />
          )}
          <div className={cn("pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-24px)] items-center gap-2 rounded-xl border border-white/12 bg-black/72 px-3 py-2 shadow-xl backdrop-blur-xl", workspaceMode !== "3d" && "hidden")}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeLayerOption.color }} />
            <span className="truncate text-xs font-bold text-white">{activeLayerOption.label}</span>
          </div>

          <div
            data-testid="data-center-touch-help"
            className={cn("pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-200/20 bg-[#06111d]/88 px-3 py-1.5 text-[11px] font-semibold text-cyan-50 shadow-xl backdrop-blur-xl", workspaceMode !== "3d" && "hidden")}
            style={{ bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.5rem)" }}
          >
            單指旋轉 · 雙指縮放／平移
          </div>

          <nav
            data-testid="data-center-mobile-dock"
            aria-label="Data-center 手機操作"
            className={cn("absolute inset-x-3 z-30 flex items-stretch gap-1 rounded-2xl border border-cyan-200/20 bg-[#06111d]/94 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl", workspaceMode !== "3d" && "hidden")}
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
                id: "plan",
                label: "2D 規劃",
                icon: Map,
                onClick: () => {
                  setWorkspaceMode("2d");
                },
              },
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
                    "hover:bg-cyan-300/12 active:bg-cyan-300/20"
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
            <SheetHeader className="sr-only">
              <SheetTitle>場景導覽</SheetTitle>
              <SheetDescription>選擇廠區、圖層與機櫃。</SheetDescription>
            </SheetHeader>
            <SceneNavigator {...navigatorProps} />
          </SheetContent>
        </Sheet>

        <Sheet open={mobileRightOpen} onOpenChange={setMobileRightOpen}>
          <SheetContent side="right" className="h-[100dvh] w-[min(92vw,370px)] border-l border-[#163653] bg-[#081c2d] p-0 text-slate-100 sm:max-w-[370px]">
            <SheetHeader className="sr-only">
              <SheetTitle>機櫃詳情</SheetTitle>
              <SheetDescription>查看機櫃狀態並設定 L10 安裝層。</SheetDescription>
            </SheetHeader>
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {([
                      ["width", "地板寬度", "facility-width-control"],
                      ["depth", "地板深度", "facility-depth-control"],
                    ] as Array<["width" | "depth", string, string]>).map(([field, label, testId]) => (
                      <label key={field} className="space-y-1.5 rounded-xl border border-cyan-200/15 bg-black/20 p-3">
                        <span className="block text-[11px] font-bold text-cyan-100">{label}</span>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`減少${label}`}
                            disabled={!canEdit || selectedFacility[field] <= 8}
                            onClick={() =>
                              updateFacilityNumber(field, String(selectedFacility[field] - 1))
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-[#10283d] text-slate-100 hover:border-cyan-200/50 disabled:opacity-35"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <Input
                            data-testid={testId}
                            type="number"
                            min={8}
                            max={80}
                            step="0.5"
                            value={selectedFacility[field]}
                            disabled={!canEdit}
                            onChange={(event) => updateFacilityNumber(field, event.target.value)}
                            className="h-10 min-w-0 border-cyan-200/25 bg-[#06111f] px-2 text-center text-sm font-black tabular-nums text-white"
                          />
                          <button
                            type="button"
                            aria-label={`增加${label}`}
                            disabled={!canEdit || selectedFacility[field] >= 80}
                            onClick={() =>
                              updateFacilityNumber(field, String(selectedFacility[field] + 1))
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-400/15 text-cyan-50 hover:bg-cyan-400/25 disabled:opacity-35"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </span>
                        <span className="block text-[10px] text-slate-400">單位：公尺，範圍 8–80 m</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-cyan-200/20 bg-cyan-400/[0.08] px-3 py-2.5">
                    <span className="text-xs font-bold text-slate-300">目前地板面積</span>
                    <span className="text-base font-black tabular-nums text-cyan-100">
                      {getFacilityAreaSquareMeters(selectedFacility)} m²
                    </span>
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
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {(["horizontal", "vertical"] as FacilityAisleOrientation[]).map((orientation) => (
                      <Button key={`cold-${orientation}`} type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => addAisle("cold", orientation)} className="h-9 border-sky-300/20 bg-sky-400/10 px-2.5 text-[11px] text-sky-100 hover:bg-sky-400/20">
                        <Snowflake className="mr-1 h-3.5 w-3.5" />冷通道 · {orientation === "horizontal" ? "橫向" : "直向"}
                      </Button>
                    ))}
                    {(["horizontal", "vertical"] as FacilityAisleOrientation[]).map((orientation) => (
                      <Button key={`hot-${orientation}`} type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => addAisle("hot", orientation)} className="h-9 border-orange-300/20 bg-orange-400/10 px-2.5 text-[11px] text-orange-100 hover:bg-orange-400/20">
                        <Thermometer className="mr-1 h-3.5 w-3.5" />熱通道 · {orientation === "horizontal" ? "橫向" : "直向"}
                      </Button>
                    ))}
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
          modelUsageById={modelUsageById}
          onUpdateModel={updateCatalogModel}
          onDeleteModel={deleteCatalogModel}
          onPreviewModel={setPreviewModelId}
        />
        <DataCenterModelViewer
          open={Boolean(previewModelId)}
          model={previewModelId ? models[previewModelId] ?? null : null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPreviewModelId(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
