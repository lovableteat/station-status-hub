import {
  useCallback,
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
  Cloud,
  CloudOff,
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
  Settings2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";
import { cn } from "@/lib/utils";

import { DataCenter3DPlanner } from "./DataCenter3DPlanner";
import { DataCenter2DPlanner } from "./DataCenter2DPlanner";
import { DataCenterModelViewer } from "./DataCenterModelViewer";
import {
  useSharedDataCenterProjects,
  type DataCenterProjectDocument,
  type DataCenterProjectSummary,
  type DataCenterProjectSyncState,
} from "./useSharedDataCenterProjects";
import {
  FacilityAisleCreationDialog,
  type FacilityAisleCreationRequest,
} from "./FacilityAisleCreationDialog";
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
  EQUIPMENT_CATEGORY_OPTIONS,
  getAvailableCatalogEquipmentUnits,
  getEquipmentCategory,
  getEquipmentCategoryLabel,
  getEquipmentDeviceType,
} from "./rackEquipmentCatalog.mjs";
import {
  convertStepToGlb,
  type ModelConversionProgress,
} from "./modelConversionWorker";
import {
  getFacilityAreaSquareMeters,
  getFacilityOverflowItems,
  normalizeFacilityDimension,
  parseFacilityDimension,
} from "./facilityPlan.mjs";
import {
  createAutomaticAisle,
  createFreeAisle,
  getFriendlyAislePosition,
  updateAisleFromFriendlyPosition,
} from "./facilityAisles.mjs";
import {
  getAssignedModuleCount,
  getDefaultRackL10Assignment,
  getRackUnitSelection,
  normalizeRackUnitSlots,
} from "./rackMount.mjs";
import {
  GB300_CAPACITY_U,
  GB300_RACK_MODEL_ID,
  createGb300RackDevice,
  getGb300DefaultL10Slots,
  getGb300ServiceDeviceSpec,
  normalizeGb300RackDevices,
  resolveGb300RackEquipment,
  validateGb300RackEquipmentLayout,
} from "./gb300RackEquipment.mjs";
import type {
  CameraPreset,
  DataCenterAssetKind,
  DataCenterLayer,
  FacilityPlan,
  ImportedStepDimensions,
  RackDevice,
  RackDeviceHealth,
  RackEquipmentCategory,
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

const EQUIPMENT_CATEGORY_ICONS: Record<RackEquipmentCategory, LucideIcon> = {
  compute: Cpu,
  network: Network,
  storage: HardDrive,
  power: Zap,
  cooling: Snowflake,
  management: Wrench,
  other: Box,
};
type Gb300EditableDeviceType = "switch-tray" | "psu" | "cdu" | "tor-switch";

const GB300_EDITABLE_DEVICE_OPTIONS: Array<{
  type: Gb300EditableDeviceType;
  label: string;
  detail: string;
}> = [
  { type: "switch-tray", label: "Switch Tray", detail: "1U" },
  { type: "psu", label: "Power Shelf", detail: "1U／四模組" },
  { type: "cdu", label: "CDU", detail: "4U" },
  { type: "tor-switch", label: "ToR SN2201", detail: "1U＋下方理線" },
];

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
        const capacityU =
          modelId === GB300_RACK_MODEL_ID
            ? GB300_CAPACITY_U
            : typeof rack.capacityU === "number"
              ? Math.max(1, Math.round(rack.capacityU))
              : 42;
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
        const storedL10Slots =
          Array.isArray(rack.l10Slots) && rack.l10Slots.length > 0
            ? rack.l10Slots
            : [];
        const matchesLegacySequentialSlots =
          storedL10Slots.length === normalizedL10Count
          && storedL10Slots.every(
            (slot, index) =>
              Number(slot) === l10StartU + index * rackUnits,
          );
        const shouldUseGb300ComputeZones =
          modelId === GB300_RACK_MODEL_ID
          && (
            storedL10Slots.length === 0
            || (l10StartU <= L10_RESERVED_BOTTOM_U + 1 && matchesLegacySequentialSlots)
          );
        const l10Slots = normalizeRackUnitSlots({
          capacityU,
          rackUnits,
          rackUnitSlots:
            shouldUseGb300ComputeZones
              ? getGb300DefaultL10Slots({
                  moduleCount: normalizedL10Count,
                  rackUnits,
                })
              : storedL10Slots.length > 0
                ? storedL10Slots
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
          devices:
            modelId === GB300_RACK_MODEL_ID
              ? normalizeGb300RackDevices(rack.id, rack.devices, {
                  ensureReferenceDefaults:
                    Number(rack.equipmentLayoutVersion ?? 0) < 2,
                })
              : rack.devices,
          equipmentLayoutVersion:
            modelId === GB300_RACK_MODEL_ID
              ? 2
              : rack.equipmentLayoutVersion,
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
  if (rack.modelId === GB300_RACK_MODEL_ID) {
    const rackUnits = getL10RackUnits(model);
    const firstUsableU = L10_RESERVED_BOTTOM_U + 1;
    const lastUsableU = rack.capacityU - L10_RESERVED_TOP_U;
    let acceptedSlots: number[] = [];

    for (
      let candidate = firstUsableU;
      candidate + rackUnits - 1 <= lastUsableU;
      candidate += 1
    ) {
      const candidateSlots = normalizeRackUnitSlots({
        capacityU: rack.capacityU,
        rackUnits,
        rackUnitSlots: [...acceptedSlots, candidate],
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });
      if (candidateSlots.length <= acceptedSlots.length) continue;
      const validation = validateGb300RackEquipmentLayout({
        capacityU: rack.capacityU,
        devices: rack.devices,
        l10Slots: candidateSlots,
        l10RackUnits: rackUnits,
      });
      if (validation.valid) acceptedSlots = candidateSlots;
    }
    return acceptedSlots.length;
  }
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
  const legacySlots =
    rack.modelId === GB300_RACK_MODEL_ID
      ? getGb300DefaultL10Slots({
          moduleCount: rack.l10Count,
          rackUnits,
        })
      : Array.from(
          { length: rack.l10Count },
          (_, index) => rack.l10StartU + index * rackUnits,
        );
  return normalizeRackUnitSlots({
    capacityU: rack.capacityU,
    rackUnits,
    rackUnitSlots:
      Array.isArray(rack.l10Slots) && rack.l10Slots.length > 0
        ? rack.l10Slots
        : legacySlots,
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
    cdu: Snowflake,
    "cable-management": Cable,
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
  projects: DataCenterProjectSummary[];
  selectedProjectId: string;
  syncState: DataCenterProjectSyncState;
  canEditProjects: boolean;
  onProjectChange: (projectId: string) => void;
  onManageProjects: () => void;
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

function getDataCenterProjectStats(project: DataCenterProjectSummary) {
  const sites = project.document.sites ?? [];
  const facilities = Object.values(project.document.facilityPlans ?? {});
  return {
    siteCount: sites.length,
    rackCount: sites.reduce((sum, site) => sum + site.racks.length, 0),
    aisleCount: facilities.reduce((sum, facility) => sum + facility.aisles.length, 0),
    powerFeedCount: facilities.reduce(
      (sum, facility) => sum + facility.powerFeeds.length,
      0,
    ),
  };
}

function SceneNavigator({
  projects,
  selectedProjectId,
  syncState,
  canEditProjects,
  onProjectChange,
  onManageProjects,
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
        <div className="rounded-[18px] border border-cyan-200/15 bg-[#0c2235] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-black tracking-[0.08em] text-cyan-100/75">共用專案</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                {syncState === "synced" ? <Cloud className="h-3 w-3 text-emerald-300" /> : <CloudOff className="h-3 w-3 text-amber-300" />}
                {syncState === "loading" ? "載入共用資料" : syncState === "saving" ? "儲存變更中" : syncState === "synced" ? "所有登入成員共用" : "本機保護模式"}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onManageProjects}
              title={canEditProjects ? "管理與預覽專案" : "預覽專案"}
              className="h-8 border-cyan-300/20 bg-cyan-400/8 px-2.5 text-[11px] font-bold text-cyan-50 hover:bg-cyan-400/15"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> 管理專案
            </Button>
          </div>
          <Select value={selectedProjectId} onValueChange={onProjectChange} disabled={projects.length === 0}>
            <SelectTrigger className="h-11 rounded-xl border-[#214669] bg-[#081c2d] px-3 text-sm font-semibold text-slate-100">
              <SelectValue placeholder="選擇 Data Center 專案" />
            </SelectTrigger>
            <SelectContent className="border-[#214669] bg-[#081c2d] text-slate-100">
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.category} · {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
  models: Record<string, RackModelDefinition>;
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
  onRackDeviceAdd: (type: Gb300EditableDeviceType, slotStart: number) => void;
  onRackDeviceMove: (deviceId: string, slotStart: number) => void;
  onRackDeviceRemove: (deviceId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function RackInspector({
  rack,
  models,
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
  onRackDeviceAdd,
  onRackDeviceMove,
  onRackDeviceRemove,
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
  const isGb300Rack = rack.modelId === GB300_RACK_MODEL_ID;
  const [newDeviceType, setNewDeviceType] =
    useState<Gb300EditableDeviceType>("switch-tray");
  const [newDeviceStartU, setNewDeviceStartU] = useState(1);
  const gb300ResolvedEquipment = isGb300Rack
    ? resolveGb300RackEquipment(rack.devices)
    : [];
  const serviceOccupiedRackUnits = new Set(
    gb300ResolvedEquipment.flatMap((equipment) =>
      Array.from(
        { length: equipment.rackUnitSpan },
        (_, index) => equipment.rackUnitStart + index,
      ),
    ),
  );
  const serviceDevices = sortedDevices.filter((device) =>
    !device.catalogModelId && Boolean(getGb300ServiceDeviceSpec(device.type)),
  );
  const catalogDevices = sortedDevices.filter((device) =>
    Boolean(device.catalogModelId && models[device.catalogModelId]),
  );
  const availableNewDeviceUnits = useMemo(() => {
    if (!isGb300Rack) return [];
    const spec = getGb300ServiceDeviceSpec(newDeviceType);
    if (!spec) return [];
    const lastStartU = rack.capacityU - spec.slotSpan + 1;
    return Array.from({ length: Math.max(0, lastStartU) }, (_, index) => index + 1)
      .filter((slotStart) => {
        const draft = createGb300RackDevice({
          rackId: rack.id,
          id: `${rack.id}-draft-equipment`,
          type: newDeviceType,
          slotStart,
        });
        return validateGb300RackEquipmentLayout({
          capacityU: rack.capacityU,
          devices: [...rack.devices, draft],
          l10Slots: selectedL10Slots,
          l10RackUnits,
        }).valid;
      });
  }, [
    isGb300Rack,
    l10RackUnits,
    newDeviceType,
    rack.capacityU,
    rack.devices,
    rack.id,
    selectedL10Slots,
  ]);

  useEffect(() => {
    if (!availableNewDeviceUnits.includes(newDeviceStartU)) {
      setNewDeviceStartU(availableNewDeviceUnits[0] ?? 1);
    }
  }, [availableNewDeviceUnits, newDeviceStartU]);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 bg-[#081c2d] py-3">
        {onToggleCollapse ? (
          <IconTooltipButton label="展開機櫃詳情" icon={PanelRightOpen} onClick={onToggleCollapse} />
        ) : null}
        <div className="my-1 h-px w-8 bg-[#214669]" />
        <IconTooltipButton label="聚焦機櫃" icon={Focus} onClick={onFocus} />
        <IconTooltipButton label="模型與尺寸" icon={Box} onClick={onOpenModels} />
        <IconTooltipButton label="櫃內設備目錄" icon={Cpu} onClick={onOpenL10Models} />
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
                  主運算設備
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
                    {isGb300Rack
                      ? `${l10Capacity} 個 L10 可用層位`
                      : `${usableRackUnits} 個可用 U 位`}
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
                  {rack.l10Count === 0 ? "選擇主運算設備" : "更換主設備模型"}
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
                        [...railUnits].sort((left, right) => left - right),
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
                        [...railUnits],
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
                  const overlapsServiceEquipment = Array.from(
                    { length: l10RackUnits },
                    (_, index) => unit + index,
                  ).some((rackUnit) => serviceOccupiedRackUnits.has(rackUnit));
                  const canToggle =
                    canEdit
                    && (
                      selected
                      || (
                        fitsInsideRack
                        && !overlapsAnotherSlot
                        && !overlapsServiceEquipment
                      )
                    );
                  return (
                    <button
                      key={unit}
                      type="button"
                      title={
                        selected
                          ? `移除 U${unit} 的 L10`
                          : canToggle
                            ? `在 U${unit} 安裝 L10`
                            : `U${unit} 無法安裝：空間不足或與現有設備重疊`
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
                            : overlapsServiceEquipment
                              ? "cursor-not-allowed border-amber-300/20 bg-amber-400/10 text-amber-200/55"
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
              <div>
                <span className="text-xs font-bold text-slate-200">
                  機櫃設備配置
                </span>
                <p className="mt-1 text-[10px] text-blue-100/60">
                  運算、網路、儲存、電力與冷卻設備共用相同 U 位配置。
                </p>
              </div>
              <Badge className="border-0 bg-blue-400/10 text-[10px] text-blue-200 shadow-none">
                {catalogDevices.length + (isGb300Rack ? serviceDevices.length : rack.devices.filter((device) => !device.catalogModelId).length)} devices
              </Badge>
            </div>

            <button
              type="button"
              onClick={onOpenL10Models}
              className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-300/25 bg-blue-400/10 text-xs font-black text-blue-50 transition-colors hover:border-blue-300/45 hover:bg-blue-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <Boxes className="h-4 w-4" /> 從設備目錄新增
            </button>

            {catalogDevices.length > 0 ? (
              <div className="mb-3 space-y-2">
                {catalogDevices.map((device) => {
                  const definition = models[device.catalogModelId!];
                  const category = getEquipmentCategory(definition) as RackEquipmentCategory;
                  const Icon = EQUIPMENT_CATEGORY_ICONS[category];
                  const span = Math.max(1, definition.rackUnits ?? device.slotSpan ?? 1);
                  const movableUnits = getAvailableCatalogEquipmentUnits({
                    rack,
                    model: definition,
                    primarySlots: selectedL10Slots,
                    primaryRackUnits: l10RackUnits,
                    ignoredDeviceId: device.id,
                    reservedBottomU: L10_RESERVED_BOTTOM_U,
                    reservedTopU: L10_RESERVED_TOP_U,
                  });
                  return (
                    <div key={device.id} className="rounded-xl border border-blue-300/15 bg-[#081c2d] p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-black text-white">{definition.name}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {getEquipmentCategoryLabel(category)} · {span}U · {definition.manufacturer}
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-200">已安裝</span>
                      </div>
                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_38px] gap-2">
                        <Select
                          value={String(device.slotStart)}
                          onValueChange={(value) => onRackDeviceMove(device.id, Number(value))}
                          disabled={!canEdit}
                        >
                          <SelectTrigger aria-label={`${definition.name} 層位`} className="h-8 border-[#214669] bg-[#10283d] text-[11px] font-black text-blue-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[...new Set([device.slotStart, ...movableUnits])].sort((left, right) => left - right).map((rackUnit) => (
                              <SelectItem key={rackUnit} value={String(rackUnit)}>
                                U{rackUnit}{span > 1 ? `–U${rackUnit + span - 1}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          aria-label={`移除 ${definition.name}`}
                          disabled={!canEdit}
                          onClick={() => onRackDeviceRemove(device.id)}
                          className="flex h-8 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-400/[0.07] text-rose-200 hover:bg-rose-400/15 disabled:opacity-35"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {isGb300Rack ? (
              <>
                <div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-black text-cyan-50">
                    <PackagePlus className="h-4 w-4 text-cyan-300" />
                    新增設備
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_82px_38px] gap-2">
                    <Select
                      value={newDeviceType}
                      onValueChange={(value) =>
                        setNewDeviceType(value as Gb300EditableDeviceType)
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger
                        aria-label="設備類型"
                        className="h-9 border-[#214669] bg-[#081c2d] text-xs font-bold text-slate-100"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GB300_EDITABLE_DEVICE_OPTIONS.map((option) => (
                          <SelectItem key={option.type} value={option.type}>
                            {option.label} · {option.detail}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(newDeviceStartU)}
                      onValueChange={(value) => setNewDeviceStartU(Number(value))}
                      disabled={!canEdit || availableNewDeviceUnits.length === 0}
                    >
                      <SelectTrigger
                        aria-label="新增設備層位"
                        className="h-9 border-[#214669] bg-[#081c2d] text-xs font-black text-cyan-100"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNewDeviceUnits.map((rackUnit) => (
                          <SelectItem key={rackUnit} value={String(rackUnit)}>
                            U{rackUnit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      aria-label="新增機櫃設備"
                      disabled={!canEdit || availableNewDeviceUnits.length === 0}
                      onClick={() => onRackDeviceAdd(newDeviceType, newDeviceStartU)}
                      className="flex h-9 items-center justify-center rounded-lg bg-cyan-300 text-cyan-950 hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {newDeviceType === "tor-switch" ? (
                    <p className="mt-2 text-[10px] leading-4 text-amber-100/75">
                      SN2201 佔 1U；連續 ToR 群組最下方會自動保留並顯示 1U Cable Management。
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {serviceDevices.map((device) => {
                    const Icon = getDeviceIcon(device.type);
                    const spec = getGb300ServiceDeviceSpec(device.type);
                    if (!spec) return null;
                    const deviceEndU = device.slotStart + spec.slotSpan - 1;
                    const movableUnits = Array.from(
                      {
                        length: Math.max(
                          0,
                          rack.capacityU - spec.slotSpan + 1,
                        ),
                      },
                      (_, index) => index + 1,
                    ).filter((slotStart) => {
                      const devices = rack.devices.map((candidate) =>
                        candidate.id === device.id
                          ? {
                              ...candidate,
                              slotStart,
                              slotSpan: spec.slotSpan,
                            }
                          : candidate,
                      );
                      return validateGb300RackEquipmentLayout({
                        capacityU: rack.capacityU,
                        devices,
                        l10Slots: selectedL10Slots,
                        l10RackUnits,
                      }).valid;
                    });

                    return (
                      <div
                        key={device.id}
                        className="rounded-xl border border-[#163653] bg-[#081c2d] p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10283d] text-blue-100/75">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-slate-100">
                              {device.name}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {spec.label} · {spec.slotSpan}U
                              {device.type === "psu" ? " · 四模組" : ""}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              device.health === "healthy"
                                ? "bg-emerald-400"
                                : device.health === "critical"
                                  ? "bg-rose-400"
                                  : device.health === "offline"
                                    ? "bg-slate-500"
                                    : "bg-amber-400",
                            )}
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_38px] gap-2">
                          <Select
                            value={String(device.slotStart)}
                            onValueChange={(value) =>
                              onRackDeviceMove(device.id, Number(value))
                            }
                            disabled={!canEdit}
                          >
                            <SelectTrigger
                              aria-label={`${device.name} 層位`}
                              className="h-8 border-[#214669] bg-[#10283d] text-[11px] font-black text-cyan-100"
                            >
                              <SelectValue
                                aria-label={`U${device.slotStart}${
                                  deviceEndU === device.slotStart
                                    ? ""
                                    : ` 至 U${deviceEndU}`
                                }`}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {[...new Set([device.slotStart, ...movableUnits])]
                                .sort((left, right) => left - right)
                                .map((rackUnit) => (
                                  <SelectItem
                                    key={rackUnit}
                                    value={String(rackUnit)}
                                  >
                                    U{rackUnit}
                                    {spec.slotSpan > 1
                                      ? `–U${rackUnit + spec.slotSpan - 1}`
                                      : ""}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            aria-label={`刪除 ${device.name}`}
                            disabled={!canEdit}
                            onClick={() => onRackDeviceRemove(device.id)}
                            className="flex h-8 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-400/[0.07] text-rose-200 hover:bg-rose-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {gb300ResolvedEquipment
                    .filter((equipment) => equipment.kind === "cable-management")
                    .map((equipment) => (
                      <div
                        key={equipment.id}
                        className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-100">
                          <Cable className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-amber-50">
                            Cable Management
                          </div>
                          <div className="mt-0.5 text-[10px] text-amber-100/60">
                            U{equipment.rackUnitStart} · 隨 ToR 群組自動調整
                          </div>
                        </div>
                        <span className="rounded-full border border-amber-300/25 px-2 py-0.5 text-[9px] font-black text-amber-100">
                          1U
                        </span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                {sortedDevices.filter((device) => !device.catalogModelId).map((device) => {
                  const Icon = getDeviceIcon(device.type);
                  return (
                    <div
                      key={device.id}
                      className="flex items-center gap-3 rounded-xl border border-[#163653] bg-[#081c2d] px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10283d] text-blue-100/75">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-100">{device.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">U{device.slotStart} · {device.assetTag}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
  importEquipmentCategory: RackEquipmentCategory;
  selectedModelId: string;
  onManufacturerChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
  onRevisionChange: (value: string) => void;
  onDimensionsChange: (dimensions: ImportedStepDimensions) => void;
  onCatalogKindChange: (kind: DataCenterAssetKind) => void;
  onImportKindChange: (kind: DataCenterAssetKind) => void;
  onImportEquipmentCategoryChange: (category: RackEquipmentCategory) => void;
  onSelectedModelChange: (modelId: string) => void;
  onChooseFile: () => void;
  onCancelImport: () => void;
  onAssignModel: () => void;
  onAssignL10Model: () => void;
  onInstallCatalogEquipment: (modelId: string, rackUnit: number) => void;
  onAddRack: () => void;
  modelUsageById: Record<string, number>;
  onUpdateModel: (
    modelId: string,
    updates: Pick<RackModelDefinition, "name" | "manufacturer" | "revision" | "dimensions" | "equipmentCategory" | "rackUnits">
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
  importEquipmentCategory,
  selectedModelId,
  onManufacturerChange,
  onModelNameChange,
  onRevisionChange,
  onDimensionsChange,
  onCatalogKindChange,
  onImportKindChange,
  onImportEquipmentCategoryChange,
  onSelectedModelChange,
  onChooseFile,
  onCancelImport,
  onAssignModel,
  onAssignL10Model,
  onInstallCatalogEquipment,
  onAddRack,
  modelUsageById,
  onUpdateModel,
  onDeleteModel,
  onPreviewModel,
}: ModelLibraryProps) {
  const [view, setView] = useState<"browse" | "import" | "edit">("browse");
  const [modelSearch, setModelSearch] = useState("");
  const [equipmentCategory, setEquipmentCategory] = useState<"all" | RackEquipmentCategory>("all");
  const [installRackUnit, setInstallRackUnit] = useState(1);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    manufacturer: string;
    revision: string;
    dimensions: ImportedStepDimensions;
    equipmentCategory?: RackEquipmentCategory;
    rackUnits?: number;
  } | null>(null);
  const allCatalogModels = Object.values(models).filter((model) => model.kind === catalogKind);
  const normalizedSearch = modelSearch.trim().toLocaleLowerCase("zh-Hant");
  const catalogModels = allCatalogModels.filter((model) => {
    const matchesCategory =
      catalogKind === "rack" ||
      equipmentCategory === "all" ||
      getEquipmentCategory(model) === equipmentCategory;
    const matchesSearch =
      !normalizedSearch ||
      [model.name, model.manufacturer, model.revision, getEquipmentCategoryLabel(getEquipmentCategory(model))]
        .join(" ")
        .toLocaleLowerCase("zh-Hant")
        .includes(normalizedSearch);
    return matchesCategory && matchesSearch;
  });
  const selectedModel =
    catalogModels.find((model) => model.id === selectedModelId) ?? catalogModels[0];
  const rackModelCount = Object.values(models).filter((model) => model.kind === "rack").length;
  const l10ModelCount = Object.values(models).filter((model) => model.kind === "l10").length;
  const primaryModel = models[selectedRack.l10ModelId];
  const availableInstallUnits = useMemo(
    () =>
      selectedModel?.kind === "l10"
        ? getAvailableCatalogEquipmentUnits({
            rack: selectedRack,
            model: selectedModel,
            primarySlots: selectedRack.l10Slots ?? [],
            primaryRackUnits: primaryModel?.rackUnits ?? 1,
            reservedBottomU: L10_RESERVED_BOTTOM_U,
            reservedTopU: L10_RESERVED_TOP_U,
          })
        : [],
    [primaryModel?.rackUnits, selectedModel, selectedRack],
  );

  useEffect(() => {
    if (availableInstallUnits.length > 0 && !availableInstallUnits.includes(installRackUnit)) {
      setInstallRackUnit(availableInstallUnits[0]);
    }
  }, [availableInstallUnits, installRackUnit]);

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
  const selectedInstalledCount = selectedModel
    ? selectedRack.devices.filter((device) => device.catalogModelId === selectedModel.id).length
    : 0;
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
      equipmentCategory: selectedModel.equipmentCategory,
      rackUnits: selectedModel.rackUnits,
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setView("browse");
      }}
    >
      <DialogContent
        data-model-catalog="bright-catalog"
        className="flex h-[min(90dvh,860px)] w-[min(96vw,1120px)] max-w-none flex-col gap-0 overflow-hidden rounded-[28px] border border-slate-600/75 bg-[#08131f] p-0 text-slate-100 shadow-[0_38px_120px_-38px_rgba(2,8,23,0.95)] sm:max-w-[1120px]"
      >
        <DialogHeader className="shrink-0 border-b border-slate-700/80 bg-[linear-gradient(135deg,#12283d,#0b1827)] px-6 py-5 pr-14 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-amber-300/35 bg-amber-300/12 text-amber-200 shadow-[0_12px_30px_-18px_rgba(251,191,36,0.75)]">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black tracking-[-0.025em] text-white">模型目錄</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-5 text-slate-300">
                管理機櫃外框與櫃內設備，並安裝到 {selectedRack.cabinet} 的指定 U 位。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex shrink-0 gap-2 border-b border-slate-700/70 bg-[#0a1624] px-6 py-3" role="tablist" aria-label="模型目錄工作模式">
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
                "h-9 cursor-pointer rounded-xl border px-4 text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                view === id
                  ? id === "browse"
                    ? "border-cyan-300/60 bg-cyan-300 text-cyan-950 shadow-[0_8px_24px_-14px_rgba(103,232,249,0.9)]"
                    : "border-amber-300/60 bg-amber-300 text-amber-950 shadow-[0_8px_24px_-14px_rgba(251,191,36,0.8)]"
                  : "border-slate-700 bg-slate-800/45 text-slate-300 hover:border-slate-500 hover:bg-slate-700/55 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top_right,rgba(14,116,144,0.08),transparent_34%),#08131f]">
          <div className="p-5 sm:p-6">
            {view === "browse" ? (
            <section>
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/80 bg-[#0c1928] p-1.5" role="tablist" aria-label="模型種類">
                {([
                  ["rack", `機櫃外框 ${rackModelCount}`],
                  ["l10", `櫃內設備 ${l10ModelCount}`],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={catalogKind === kind}
                    onClick={() => selectCatalogKind(kind)}
                    className={cn(
                      "h-10 cursor-pointer rounded-lg text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
                      catalogKind === kind
                        ? kind === "rack"
                          ? "border border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-inner"
                          : "border border-violet-300/45 bg-violet-300/15 text-violet-100 shadow-inner"
                        : "border border-transparent text-slate-400 hover:border-slate-600 hover:bg-slate-700/35 hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mb-4 rounded-2xl border border-slate-700/80 bg-[#0c1928] p-3.5 shadow-[0_16px_38px_-30px_rgba(2,8,23,0.95)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/80" />
                  <Input
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder={catalogKind === "rack" ? "搜尋機櫃名稱、廠牌或版本" : "搜尋設備名稱、廠牌、類型或版本"}
                    className="h-11 rounded-xl border-slate-600/80 bg-[#111f31] pl-9 text-sm text-white placeholder:text-slate-500 focus-visible:border-cyan-300/70 focus-visible:ring-cyan-300/20"
                  />
                </div>
                {catalogKind === "l10" ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="設備類別">
                    {EQUIPMENT_CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={equipmentCategory === option.id}
                        onClick={() => setEquipmentCategory(option.id as "all" | RackEquipmentCategory)}
                        className={cn(
                          "h-8 shrink-0 rounded-full border px-3 text-[11px] font-black transition-colors",
                          equipmentCategory === option.id
                            ? "border-violet-300/45 bg-violet-400/15 text-violet-100"
                            : "border-slate-700 bg-[#101d2d] text-slate-400 hover:border-slate-500 hover:bg-slate-700/45 hover:text-white",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
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
                        "min-h-[136px] w-full cursor-pointer rounded-2xl border border-l-4 px-4 py-4 text-left transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
                        selected
                          ? model.kind === "rack"
                            ? "border-cyan-300/60 border-l-cyan-300 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(15,31,49,0.96))] shadow-[0_18px_42px_-28px_rgba(34,211,238,0.75)]"
                            : "border-violet-300/60 border-l-violet-300 bg-[linear-gradient(135deg,rgba(139,92,246,0.18),rgba(15,31,49,0.96))] shadow-[0_18px_42px_-28px_rgba(167,139,250,0.72)]"
                          : "border-slate-700/85 border-l-slate-600 bg-[#0d1b2a] hover:border-slate-500 hover:border-l-slate-400 hover:bg-[#122337]"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                          selected
                            ? model.kind === "rack"
                              ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                              : "border-violet-300/40 bg-violet-300/15 text-violet-100"
                            : "border-slate-600/80 bg-slate-800/70 text-slate-300",
                        )}>
                          {model.kind === "l10" ? (() => { const Icon = EQUIPMENT_CATEGORY_ICONS[getEquipmentCategory(model) as RackEquipmentCategory]; return <Icon className="h-5 w-5" />; })() : model.source === "step" ? <FileBox className="h-5 w-5" /> : <Box className="h-5 w-5" />}
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
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                            {model.kind === "l10" ? <span className="rounded-full bg-blue-400/10 px-2 py-1 text-blue-100">{getEquipmentCategoryLabel(getEquipmentCategory(model))} · {model.rackUnits ?? 1}U</span> : null}
                            <span className="rounded-full bg-slate-400/10 px-2 py-1 tabular-nums text-slate-300">{formatDimensions(model.dimensions)}</span>
                          </div>
                        </div>
                        <span className={cn(
                          "mt-1 flex h-5 w-5 items-center justify-center rounded-full border",
                          selected
                            ? model.kind === "rack"
                              ? "border-cyan-200 bg-cyan-300 text-cyan-950"
                              : "border-violet-200 bg-violet-300 text-violet-950"
                            : "border-slate-600 text-transparent",
                        )}>
                          <Check className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
                {catalogModels.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-600 bg-[#0d1b2a] px-6 py-12 text-center">
                    <Search className="mx-auto h-6 w-6 text-slate-500" />
                    <div className="mt-3 text-sm font-black text-slate-200">找不到符合條件的模型</div>
                    <p className="mt-1 text-xs text-slate-500">清除搜尋或改選其他設備類別。</p>
                  </div>
                ) : null}
              </div>

              {selectedModel ? (
                <div className="mt-5 rounded-2xl border border-slate-700/80 bg-[#0b1826] p-4 shadow-[0_18px_46px_-36px_rgba(2,8,23,0.95)] sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-white">已選擇 {selectedModel.name}</span>
                    <span className="text-xs text-slate-300">
                      {selectedInstalledCount > 0
                        ? `${selectedRack.cabinet} 已安裝 ${selectedInstalledCount} 台`
                        : selectedIsAssigned
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
                          ? "border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100"
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
                      className="h-11 rounded-xl border-cyan-300/35 bg-cyan-400/[0.09] text-sm font-bold text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-400/[0.17]"
                    >
                      <Eye className="mr-2 h-4 w-4" /> 檢視模型細節
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={beginEditingSelectedModel}
                      className="h-11 rounded-xl border-violet-300/35 bg-violet-400/[0.09] text-sm font-bold text-violet-100 hover:border-violet-200/60 hover:bg-violet-400/[0.17]"
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
                      <Button type="button" disabled={!canEdit || selectedIsAssigned} onClick={onAssignModel} className="h-12 rounded-xl bg-emerald-300 text-sm font-bold text-emerald-950 hover:bg-emerald-200 disabled:bg-emerald-950/50 disabled:text-emerald-100/40">
                        <Check className="mr-2 h-4 w-4" /> 套用至 {selectedRack.cabinet}
                      </Button>
                      <Button type="button" disabled={!canEdit} onClick={onAddRack} variant="outline" className="h-12 rounded-xl border-amber-300/35 bg-amber-400/[0.09] text-sm font-bold text-amber-100 hover:border-amber-200/60 hover:bg-amber-400/[0.17]">
                        <PackagePlus className="mr-2 h-4 w-4" /> 以此新增機櫃
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-2xl border border-violet-300/20 bg-violet-400/[0.05] p-3">
                      <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                        <Select
                          value={String(installRackUnit)}
                          onValueChange={(value) => setInstallRackUnit(Number(value))}
                          disabled={!canEdit || availableInstallUnits.length === 0}
                        >
                          <SelectTrigger aria-label="設備安裝 U 位" className="h-11 border-slate-600/80 bg-[#111f31] font-black text-violet-100">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableInstallUnits.map((rackUnit) => (
                              <SelectItem key={rackUnit} value={String(rackUnit)}>
                                U{rackUnit}{(selectedModel.rackUnits ?? 1) > 1 ? `–U${rackUnit + (selectedModel.rackUnits ?? 1) - 1}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          disabled={!canEdit || !selectedIsCompatible || availableInstallUnits.length === 0}
                          onClick={() => onInstallCatalogEquipment(selectedModel.id, installRackUnit)}
                          className="h-11 rounded-xl bg-emerald-400 text-sm font-black text-emerald-950 hover:bg-emerald-300 disabled:bg-emerald-950/50 disabled:text-emerald-100/40"
                        >
                          <PackagePlus className="mr-2 h-4 w-4" /> 安裝到 {selectedRack.cabinet}
                        </Button>
                      </div>
                      {availableInstallUnits.length === 0 ? (
                        <p className="text-[11px] font-semibold text-amber-200">目前沒有足夠且不重疊的 U 位可安裝此設備。</p>
                      ) : (
                        <p className="text-[11px] text-slate-400">此設備佔 {selectedModel.rackUnits ?? 1}U，可安裝位置已排除主設備與其他櫃內設備。</p>
                      )}
                      {getEquipmentCategory(selectedModel) === "compute" ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!canEdit || selectedIsAssigned || !selectedIsCompatible}
                          onClick={onAssignL10Model}
                          className="h-10 w-full rounded-xl border-violet-300/30 bg-violet-400/[0.08] text-xs font-black text-violet-100 hover:bg-violet-400/[0.16]"
                        >
                          <Cpu className="mr-2 h-4 w-4" /> 設為整櫃主運算設備
                        </Button>
                      ) : null}
                    </div>
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
                <Badge className="border-blue-300/20 bg-blue-400/10 text-blue-50 shadow-none">
                  {selectedModel.kind === "rack" ? "機櫃外框" : getEquipmentCategoryLabel(getEquipmentCategory(selectedModel))}
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
                  {selectedModel.kind === "l10" ? (
                    <>
                      <label className="space-y-1.5">
                        <span className="text-sm font-bold text-slate-100">設備類別</span>
                        <Select
                          value={editDraft.equipmentCategory ?? "compute"}
                          onValueChange={(value) => setEditDraft({ ...editDraft, equipmentCategory: value as RackEquipmentCategory })}
                        >
                          <SelectTrigger className="h-11 border-[#2a526f] bg-[#10263a] text-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {EQUIPMENT_CATEGORY_OPTIONS.filter((option) => option.id !== "all").map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-sm font-bold text-slate-100">占用高度</span>
                        <Input
                          type="number"
                          min={1}
                          max={48}
                          value={editDraft.rackUnits ?? 1}
                          onChange={(event) => setEditDraft({ ...editDraft, rackUnits: Math.max(1, Math.min(48, Number(event.target.value) || 1)) })}
                          className="h-11 border-[#2a526f] bg-[#10263a] text-white"
                        />
                      </label>
                    </>
                  ) : null}
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
                <Button type="button" disabled={!editDraft.name.trim()} onClick={saveSelectedModel} className="h-11 bg-blue-500 px-5 font-bold text-white hover:bg-blue-400">
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
                    ["rack", "機櫃外框", Server],
                    ["l10", "櫃內設備", Cpu],
                  ] as const).map(([kind, label, Icon]) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={importKind === kind}
                      onClick={() => onImportKindChange(kind)}
                      className={cn(
                        "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
                        importKind === kind
                          ? "border-blue-300/45 bg-blue-500/18 text-blue-50"
                          : "border-white/10 bg-white/[0.025] text-slate-300 hover:bg-white/[0.06]"
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {importKind === "l10" ? (
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-semibold text-slate-200">設備類別</span>
                    <Select value={importEquipmentCategory} onValueChange={(value) => onImportEquipmentCategoryChange(value as RackEquipmentCategory)} disabled={!canEdit}>
                      <SelectTrigger className="h-11 border-[#2a526f] bg-[#10263a] text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EQUIPMENT_CATEGORY_OPTIONS.filter((option) => option.id !== "all").map((option) => (
                          <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <div className="rounded-xl border border-blue-300/15 bg-blue-400/[0.07] px-4 py-3 text-xs leading-5 text-blue-100/80">
                    U 高度會依模型實際高度自動換算，匯入後仍可在模型資料中調整。
                  </div>
                </div>
              ) : null}

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

        <div className="shrink-0 border-t border-slate-700/80 bg-[#07111d] px-6 py-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>{view === "browse" && selectedModel ? `目前選取：${selectedModel.name}` : view === "edit" && selectedModel ? `正在編輯：${selectedModel.name}` : `準備匯入：${importKind === "rack" ? "機櫃外框" : `${getEquipmentCategoryLabel(importEquipmentCategory)}設備`}`}</span>
            {view === "browse" && selectedModel ? <span className="hidden tabular-nums sm:inline">{formatDimensions(selectedModel.dimensions)}</span> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const { user, isRealtimeAuthenticated } = useUser();
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
  const [showSceneTools, setShowSceneTools] = useState(true);
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
  const [aisleCreationOpen, setAisleCreationOpen] = useState(false);
  const [modelLibraryOpen, setModelLibraryOpen] = useState(false);
  const [catalogKind, setCatalogKind] = useState<DataCenterAssetKind>("rack");
  const [importKind, setImportKind] = useState<DataCenterAssetKind>("rack");
  const [importEquipmentCategory, setImportEquipmentCategory] = useState<RackEquipmentCategory>("compute");
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
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [projectPreviewId, setProjectPreviewId] = useState<string | null>(null);
  const [projectPendingArchive, setProjectPendingArchive] =
    useState<DataCenterProjectSummary | null>(null);
  const [projectDialogMode, setProjectDialogMode] = useState<"create" | "edit">("create");
  const [projectDraft, setProjectDraft] = useState({ name: "", category: "未分類", description: "" });

  const sharedDocument = useMemo<DataCenterProjectDocument>(() => ({
    schemaVersion: 1,
    sites,
    facilityPlans,
    modelOverrides: serializeModelCatalogOverrides(models, BUILT_IN_RACK_MODELS) as DataCenterProjectDocument["modelOverrides"],
  }), [facilityPlans, models, sites]);

  const applySharedDocument = useCallback((document: DataCenterProjectDocument) => {
    if (document.sites.length === 0) return;
    const nextSites = document.sites;
    const nextModels = mergeModelCatalogOverrides(BUILT_IN_RACK_MODELS, document.modelOverrides) as Record<string, RackModelDefinition>;
    setSites(nextSites);
    setFacilityPlans(document.facilityPlans);
    setModels(nextModels);
    setSelectedSiteId(nextSites[0].id);
    setSelectedRackId(nextSites[0].racks[0]?.id ?? "");
  }, []);

  const sharedProjects = useSharedDataCenterProjects({
    userId: isRealtimeAuthenticated ? user?.userId ?? null : null,
    canEdit,
    currentDocument: sharedDocument,
    onApplyDocument: applySharedDocument,
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
  const selectedL10Capacity = getL10Capacity(selectedRack, selectedL10Model);
  const selectedFacility = facilityPlans[selectedSiteId] ?? cloneDefaultFacilityPlan();
  const [facilitySizeDraft, setFacilitySizeDraft] = useState({
    width: String(selectedFacility.width),
    depth: String(selectedFacility.depth),
  });
  const [facilitySizeErrors, setFacilitySizeErrors] = useState<
    Partial<Record<"width" | "depth", string>>
  >({});
  const overflowItems = useMemo(
    () =>
      getFacilityOverflowItems({
        facility: selectedFacility,
        racks: selectedSite.racks,
        models,
      }) as Array<{
        kind: "rack" | "aisle" | "power";
        id: string;
        label: string;
      }>,
    [models, selectedFacility, selectedSite.racks]
  );
  const overflowKeys = useMemo(
    () => new Set(overflowItems.map((item) => `${item.kind}:${item.id}`)),
    [overflowItems]
  );
  const modelUsageById = useMemo(() => {
    const usage: Record<string, number> = {};
    for (const site of sites) {
      for (const rack of site.racks) {
        usage[rack.modelId] = (usage[rack.modelId] ?? 0) + 1;
        if (rack.l10Count > 0) {
          usage[rack.l10ModelId] = (usage[rack.l10ModelId] ?? 0) + 1;
        }
        for (const device of rack.devices) {
          if (device.catalogModelId) {
            usage[device.catalogModelId] = (usage[device.catalogModelId] ?? 0) + 1;
          }
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

  useEffect(() => {
    setFacilitySizeDraft({
      width: String(selectedFacility.width),
      depth: String(selectedFacility.depth),
    });
    setFacilitySizeErrors({});
  }, [selectedFacility.depth, selectedFacility.width, selectedSiteId]);

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
  };

  const updateCatalogModel = (
    modelId: string,
    updates: Pick<RackModelDefinition, "name" | "manufacturer" | "revision" | "dimensions" | "equipmentCategory" | "rackUnits">
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

  const handleRackDeviceHealthChange = (
    rackId: string,
    deviceId: string,
    health: RackDeviceHealth,
  ) => {
    if (!canEdit) return;
    setSites((currentSites) =>
      currentSites.map((site) =>
        site.id === selectedSiteId
          ? {
              ...site,
              racks: site.racks.map((rack) =>
                rack.id === rackId
                  ? {
                      ...rack,
                      devices: rack.devices.map((device) =>
                        device.id === deviceId ? { ...device, health } : device,
                      ),
                    }
                  : rack,
              ),
            }
          : site,
      ),
    );
  };

  const getRackEquipmentLayoutError = (
    rack: RackPlan,
    devices: RackDevice[],
    l10Slots = getRackL10Slots(rack, selectedL10Model),
  ) => {
    if (rack.modelId !== GB300_RACK_MODEL_ID) return null;
    const validation = validateGb300RackEquipmentLayout({
      capacityU: rack.capacityU,
      devices,
      l10Slots,
      l10RackUnits: getL10RackUnits(selectedL10Model),
    });
    return validation.valid ? null : validation.errors[0] ?? "設備層位發生衝突。";
  };

  const handleRackDeviceAdd = (
    type: Gb300EditableDeviceType,
    slotStart: number,
  ) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const device = createGb300RackDevice({
        rackId: rack.id,
        type,
        slotStart,
        index: rack.devices.filter((item) => item.type === type).length,
      }) as RackDevice;
      const devices = [...rack.devices, device];
      const error = getRackEquipmentLayoutError(rack, devices);
      if (error) {
        toast({
          title: "無法新增設備",
          description: error,
          variant: "destructive",
        });
        return rack;
      }
      toast({
        title: "設備已新增",
        description: `${device.name} 已安裝於 U${device.slotStart}${
          device.slotSpan > 1
            ? `–U${device.slotStart + device.slotSpan - 1}`
            : ""
        }。`,
      });
      return { ...rack, devices };
    });
  };

  const handleRackDeviceMove = (deviceId: string, slotStart: number) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const current = rack.devices.find((device) => device.id === deviceId);
      if (current?.catalogModelId) {
        const definition = models[current.catalogModelId];
        if (!definition) return rack;
        const primaryDefinition = models[rack.l10ModelId] ?? selectedL10Model;
        const availableUnits = getAvailableCatalogEquipmentUnits({
          rack,
          model: definition,
          primarySlots: getRackL10Slots(rack, primaryDefinition),
          primaryRackUnits: getL10RackUnits(primaryDefinition),
          ignoredDeviceId: current.id,
          reservedBottomU: L10_RESERVED_BOTTOM_U,
          reservedTopU: L10_RESERVED_TOP_U,
        });
        if (!availableUnits.includes(slotStart)) {
          toast({
            title: "無法調整層位",
            description: `U${slotStart} 空間不足或會與現有設備重疊。`,
            variant: "destructive",
          });
          return rack;
        }
        const span = Math.max(1, definition.rackUnits ?? 1);
        toast({
          title: "設備層位已更新",
          description: `${current.name} 已移至 U${slotStart}${span > 1 ? `–U${slotStart + span - 1}` : ""}。`,
        });
        return {
          ...rack,
          devices: rack.devices.map((device) =>
            device.id === current.id ? { ...device, slotStart, slotSpan: span } : device,
          ),
        };
      }
      const spec = getGb300ServiceDeviceSpec(current?.type);
      if (!current || !spec) return rack;
      const devices = rack.devices.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              slotStart,
              slotSpan: spec.slotSpan,
            }
          : device,
      );
      const error = getRackEquipmentLayoutError(rack, devices);
      if (error) {
        toast({
          title: "無法調整層位",
          description: error,
          variant: "destructive",
        });
        return rack;
      }
      toast({
        title: "設備層位已更新",
        description: `${current.name} 已移至 U${slotStart}${
          spec.slotSpan > 1 ? `–U${slotStart + spec.slotSpan - 1}` : ""
        }。`,
      });
      return { ...rack, devices };
    });
  };

  const handleRackDeviceRemove = (deviceId: string) => {
    if (!canEdit) return;
    updateSelectedRack((rack) => {
      const current = rack.devices.find((device) => device.id === deviceId);
      if (!current || (!current.catalogModelId && !getGb300ServiceDeviceSpec(current.type))) return rack;
      toast({
        title: "設備已移除",
        description: `${current.name} 已從 ${rack.cabinet} 移除。`,
      });
      return {
        ...rack,
        devices: rack.devices.filter((device) => device.id !== deviceId),
      };
    });
  };

  const updateFacility = (updater: (facility: FacilityPlan) => FacilityPlan) => {
    setFacilityPlans((current) => ({
      ...current,
      [selectedSiteId]: updater(current[selectedSiteId] ?? cloneDefaultFacilityPlan()),
    }));
  };

  const setFacilityDimension = (field: "width" | "depth", value: number) => {
    updateFacility((facility) => ({
      ...facility,
      [field]: value,
    }));
    setFacilitySizeDraft((current) => ({ ...current, [field]: String(value) }));
    setFacilitySizeErrors((current) => ({ ...current, [field]: "" }));
  };

  const commitFacilityDimension = (field: "width" | "depth") => {
    const parsed = parseFacilityDimension(
      facilitySizeDraft[field],
      selectedFacility[field]
    );
    if (!parsed.valid) {
      setFacilitySizeErrors((current) => ({
        ...current,
        [field]: parsed.message,
      }));
      return false;
    }

    setFacilityDimension(field, parsed.value);
    return true;
  };

  const focusOverflowItem = (item: {
    kind: "rack" | "aisle" | "power";
    id: string;
  }) => {
    if (item.kind === "rack") {
      setSelectedRackId(item.id);
    }
    setWorkspaceMode("2d");
    setFacilityPlannerOpen(false);
  };

  const openAisleCreation = () => {
    setFacilityPlannerOpen(false);
    setAisleCreationOpen(true);
  };

  const createAisle = (request: FacilityAisleCreationRequest) => {
    updateFacility((facility) => ({
      ...facility,
      aisles: [
        ...facility.aisles,
        request.mode === "automatic"
          ? createAutomaticAisle({
              kind: request.kind,
              orientation: request.orientation,
              racks: selectedSite.racks.filter((rack) =>
                request.rackIds.includes(rack.id)
              ),
              models,
              facility,
            })
          : createFreeAisle({
              kind: request.kind,
              orientation: request.orientation,
              facility,
            }),
      ],
    }));
    setWorkspaceMode("2d");
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
          equipmentCategory: importKind === "l10" ? importEquipmentCategory : undefined,
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
          equipmentCategory: importKind === "l10" ? importEquipmentCategory : undefined,
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

  const installCatalogEquipment = (modelId: string, slotStart: number) => {
    const definition = models[modelId];
    if (!canEdit || definition?.kind !== "l10") return;
    if (!isL10CompatibleWithRack(definition, selectedRack.modelId)) {
      toast({
        title: "此設備無法安裝",
        description: definition.compatibilityNote || "此設備與目前機櫃不相容。",
        variant: "destructive",
      });
      return;
    }

    updateSelectedRack((rack) => {
      const primaryDefinition = models[rack.l10ModelId] ?? selectedL10Model;
      const availableUnits = getAvailableCatalogEquipmentUnits({
        rack,
        model: definition,
        primarySlots: getRackL10Slots(rack, primaryDefinition),
        primaryRackUnits: getL10RackUnits(primaryDefinition),
        reservedBottomU: L10_RESERVED_BOTTOM_U,
        reservedTopU: L10_RESERVED_TOP_U,
      });
      if (!availableUnits.includes(slotStart)) {
        toast({
          title: "此 U 位無法安裝",
          description: `U${slotStart} 空間不足或會與現有設備重疊。`,
          variant: "destructive",
        });
        return rack;
      }

      const category = getEquipmentCategory(definition) as RackEquipmentCategory;
      const span = Math.max(1, definition.rackUnits ?? 1);
      const sameModelCount = rack.devices.filter((device) => device.catalogModelId === modelId).length;
      const device: RackDevice = {
        id: `${rack.id}-catalog-${crypto.randomUUID()}`,
        name: `${definition.name}${sameModelCount > 0 ? ` ${sameModelCount + 1}` : ""}`,
        type: getEquipmentDeviceType(category),
        health: "healthy",
        slotStart,
        slotSpan: span,
        serial: `CAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        assetTag: `DC-${category.toUpperCase().slice(0, 3)}-${String(rack.devices.length + 1).padStart(4, "0")}`,
        model: definition.name,
        role: getEquipmentCategoryLabel(category),
        network: category === "network" ? "待配置" : "N/A",
        powerFeed: "待配置",
        bmc: "待配置",
        redfish: "待配置",
        note: `由模型目錄安裝，使用 ${span}U。`,
        catalogModelId: modelId,
      };
      toast({
        title: "設備已安裝",
        description: `${definition.name} 已安裝至 ${rack.cabinet} 的 U${slotStart}${span > 1 ? `–U${slotStart + span - 1}` : ""}。`,
      });
      return { ...rack, devices: [...rack.devices, device] };
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
          const layoutError = getRackEquipmentLayoutError(
            rack,
            rack.devices,
            normalized,
          );
          if (normalized.length > requestedSlots.length && !layoutError) {
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
      const layoutError = getRackEquipmentLayoutError(
        rack,
        rack.devices,
        l10Slots,
      );
      if (layoutError) {
        toast({
          title: "此範圍無法安裝",
          description: layoutError,
          variant: "destructive",
        });
        return rack;
      }
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
      const layoutError = getRackEquipmentLayoutError(
        rack,
        rack.devices,
        l10Slots,
      );
      if (!existingSlots.includes(rackUnit) && layoutError) {
        toast({
          title: "此層無法安裝",
          description: layoutError,
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
      const rackUnits = getL10RackUnits(selectedL10Model);
      const l10Slots = rackUnitSlots.reduce<number[]>((acceptedSlots, rackUnit) => {
        const candidateSlots = normalizeRackUnitSlots({
          capacityU: rack.capacityU,
          rackUnits,
          rackUnitSlots: [...acceptedSlots, rackUnit],
          reservedBottomU: L10_RESERVED_BOTTOM_U,
          reservedTopU: L10_RESERVED_TOP_U,
        });
        if (candidateSlots.length <= acceptedSlots.length) return acceptedSlots;
        return getRackEquipmentLayoutError(rack, rack.devices, candidateSlots)
          ? acceptedSlots
          : candidateSlots;
      }, []);

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

  const openCreateProject = () => {
    setProjectManagerOpen(false);
    setProjectDialogMode("create");
    setProjectDraft({ name: "", category: sharedProjects.selectedProject?.category ?? "未分類", description: "" });
    setProjectDialogOpen(true);
  };

  const openEditProject = (targetProject?: DataCenterProjectSummary) => {
    const project = targetProject ?? sharedProjects.selectedProject;
    if (!project) return;
    setProjectManagerOpen(false);
    if (project.id !== sharedProjects.selectedProjectId) {
      sharedProjects.selectProject(project.id);
    }
    setProjectDialogMode("edit");
    setProjectDraft({ name: project.name, category: project.category, description: project.description });
    setProjectDialogOpen(true);
  };

  const openProjectManager = () => {
    setProjectPreviewId(
      sharedProjects.selectedProjectId || sharedProjects.projects[0]?.id || null
    );
    setProjectManagerOpen(true);
  };

  const saveProjectSettings = async () => {
    if (!projectDraft.name.trim()) {
      toast({ title: "請輸入專案名稱", variant: "destructive" });
      return;
    }
    try {
      if (projectDialogMode === "create") {
        await sharedProjects.createProject(projectDraft.name, projectDraft.category, projectDraft.description);
        toast({ title: "Data Center 專案已建立", description: "目前場景已作為新專案的初始內容。" });
      } else if (sharedProjects.selectedProjectId) {
        await sharedProjects.updateProject(sharedProjects.selectedProjectId, projectDraft.name, projectDraft.category, projectDraft.description);
        toast({ title: "專案設定已更新" });
      }
      setProjectDialogOpen(false);
    } catch (error) {
      toast({
        title: "專案設定失敗",
        description: error instanceof Error ? error.message : "請稍後再試",
        variant: "destructive",
      });
    }
  };

  const archiveProject = async (project: DataCenterProjectSummary) => {
    try {
      await sharedProjects.archiveProject(project.id);
      setProjectDialogOpen(false);
      setProjectPendingArchive(null);
      setProjectPreviewId((current) =>
        current === project.id ? sharedProjects.selectedProjectId : current
      );
      toast({ title: "專案已封存" });
    } catch (error) {
      toast({
        title: "無法封存專案",
        description: error instanceof Error ? error.message : "請稍後再試",
        variant: "destructive",
      });
    }
  };

  const previewProject = sharedProjects.projects.find(
    (project) => project.id === projectPreviewId
  ) ?? sharedProjects.selectedProject ?? sharedProjects.projects[0] ?? null;
  const previewProjectStats = previewProject
    ? getDataCenterProjectStats(previewProject)
    : null;

  const navigatorProps: SceneNavigatorProps = {
    projects: sharedProjects.projects,
    selectedProjectId: sharedProjects.selectedProjectId,
    syncState: sharedProjects.syncState,
    canEditProjects: canEdit,
    onProjectChange: sharedProjects.selectProject,
    onManageProjects: openProjectManager,
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
    models,
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
    onRackDeviceAdd: handleRackDeviceAdd,
    onRackDeviceMove: handleRackDeviceMove,
    onRackDeviceRemove: handleRackDeviceRemove,
  };

  const desktopGridClass = leftCollapsed
    ? rightCollapsed
      ? "lg:grid-cols-[72px_minmax(0,1fr)_68px]"
      : "lg:grid-cols-[72px_minmax(0,1fr)_360px]"
    : rightCollapsed
      ? "lg:grid-cols-[188px_minmax(0,1fr)_68px]"
      : "lg:grid-cols-[188px_minmax(0,1fr)_360px]";

  const compactDesktopGridClass = showSceneTools && showRackDetails
    ? desktopGridClass
    : showSceneTools
      ? leftCollapsed
        ? "lg:grid-cols-[72px_minmax(0,1fr)]"
        : "lg:grid-cols-[188px_minmax(0,1fr)]"
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
              { label: "機櫃", value: selectedSite.racks.length, icon: Server, color: "text-cyan-200" },
              { label: "主運算設備", value: totalL10, icon: Cpu, color: "text-cyan-200" },
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
              <span className="hidden sm:inline">模型目錄</span>
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
          {showSceneTools ? (
            <aside
              data-testid="data-center-navigation-dock"
              className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-700/80 bg-[linear-gradient(180deg,#111d2e,#09131f)] p-2.5 shadow-[0_24px_70px_rgba(2,8,23,0.46)]"
            >
              <div className={cn("flex h-14 items-center border-b border-slate-700/70 pb-2", leftCollapsed ? "justify-center" : "justify-between px-1")}>
                {!leftCollapsed ? (
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black tracking-[-0.01em] text-white">操作選單</div>
                    <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">場景與規劃工具</div>
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-label={leftCollapsed ? "展開 Data Center 選單" : "收合 Data Center 選單"}
                  onClick={() => setLeftCollapsed((value) => !value)}
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-600/80 bg-slate-800/80 text-cyan-200 transition-all hover:border-cyan-300/50 hover:bg-cyan-300/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                >
                  {leftCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>

              <nav aria-label="Data Center 功能選單" className="mt-2.5 grid gap-2.5">
                {[
                  { id: "scene", label: "場景機櫃", icon: Layers3, tone: "border-l-sky-300 hover:border-sky-300/60 hover:bg-sky-400/10", iconTone: "bg-sky-400/15 text-sky-200 ring-sky-300/20", onClick: () => setMobileLeftOpen(true) },
                  { id: "projects", label: "專案", icon: FileBox, tone: "border-l-blue-300 hover:border-blue-300/60 hover:bg-blue-400/10", iconTone: "bg-blue-400/15 text-blue-200 ring-blue-300/20", onClick: openProjectManager },
                  { id: "facility", label: "廠房", icon: PencilRuler, tone: "border-l-emerald-300 hover:border-emerald-300/60 hover:bg-emerald-400/10", iconTone: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/20", onClick: () => setFacilityPlannerOpen(true) },
                  { id: "models", label: "模型", icon: Boxes, tone: "border-l-amber-300 hover:border-amber-300/60 hover:bg-amber-400/10", iconTone: "bg-amber-400/15 text-amber-200 ring-amber-300/20", onClick: () => openModelLibrary("rack") },
                  { id: "rack", label: "機櫃設定", icon: Server, tone: "border-l-violet-300 hover:border-violet-300/60 hover:bg-violet-400/10", iconTone: "bg-violet-400/15 text-violet-200 ring-violet-300/20", onClick: () => setMobileRightOpen(true) },
                  { id: "plan", label: workspaceMode === "2d" ? "2D 規劃中" : "2D 規劃", icon: Map, tone: workspaceMode === "2d" ? "border-orange-300/70 border-l-orange-300 bg-orange-300/12 shadow-[0_10px_28px_-22px_rgba(251,146,60,0.9)]" : "border-l-orange-300 hover:border-orange-300/60 hover:bg-orange-400/10", iconTone: workspaceMode === "2d" ? "bg-orange-300 text-orange-950 ring-orange-200/40" : "bg-orange-400/15 text-orange-200 ring-orange-300/20", onClick: () => setWorkspaceMode("2d") },
                ].map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-action={item.id}
                      aria-label={item.label}
                      title={leftCollapsed ? item.label : undefined}
                      onClick={item.onClick}
                      className={cn(
                        "grid cursor-pointer border border-slate-700/80 border-l-[3px] bg-[#101d2d] text-slate-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200",
                        leftCollapsed
                          ? "h-12 w-12 place-items-center justify-self-center rounded-[15px]"
                          : "h-[66px] w-full grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded-[17px] px-3 text-left",
                        item.tone,
                      )}
                    >
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1", item.iconTone)}>
                        <ItemIcon className="h-[18px] w-[18px] shrink-0" />
                      </span>
                      {!leftCollapsed ? <span className="truncate text-xs font-black leading-5">{item.label}</span> : null}
                    </button>
                  );
                })}
              </nav>
            </aside>
          ) : null}

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
                canEdit={canEdit}
                onUpdateRackDeviceHealth={handleRackDeviceHealthChange}
              />
            ) : (
              <DataCenter2DPlanner
                racks={selectedSite.racks}
                models={models}
                selectedRackId={selectedRackId}
                facility={selectedFacility}
                overflowKeys={overflowKeys}
                canEdit={canEdit}
                onSelectRack={handleRackSelect}
                onMoveRack={placeRackOnPlan}
                onRotateRack={rotateRackOnPlan}
                onAddRack={addRackFromCurrentModel}
                onDeleteRack={removeRackFromPlan}
                onMoveAisle={(aisleId, x, z) => updateAisle(aisleId, (aisle) => ({ ...aisle, x, z }))}
                onDeleteAisle={removeAisle}
                onUpdateAisle={(aisleId, patch) => updateAisle(aisleId, (aisle) => ({ ...aisle, ...patch }))}
                onMovePowerFeed={(feedId, x, z) => updatePowerFeed(feedId, (feed) => ({ ...feed, x, z }))}
                onOpenAisleCreation={openAisleCreation}
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
              canEdit={canEdit}
              onUpdateRackDeviceHealth={handleRackDeviceHealthChange}
            />
          ) : (
            <DataCenter2DPlanner
              racks={selectedSite.racks}
              models={models}
              selectedRackId={selectedRackId}
              facility={selectedFacility}
              overflowKeys={overflowKeys}
              canEdit={canEdit}
              onSelectRack={handleRackSelect}
              onMoveRack={placeRackOnPlan}
              onRotateRack={rotateRackOnPlan}
              onAddRack={addRackFromCurrentModel}
              onDeleteRack={removeRackFromPlan}
              onMoveAisle={(aisleId, x, z) => updateAisle(aisleId, (aisle) => ({ ...aisle, x, z }))}
              onDeleteAisle={removeAisle}
              onUpdateAisle={(aisleId, patch) => updateAisle(aisleId, (aisle) => ({ ...aisle, ...patch }))}
              onMovePowerFeed={(feedId, x, z) => updatePowerFeed(feedId, (feed) => ({ ...feed, x, z }))}
              onOpenAisleCreation={openAisleCreation}
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

        <Dialog open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}>
          <DialogContent className="h-[min(88dvh,780px)] w-[min(94vw,720px)] max-w-none gap-0 overflow-hidden border border-[#163653] bg-[#081c2d] p-0 text-slate-100 sm:max-w-[720px]">
            <DialogHeader className="sr-only">
              <DialogTitle>場景導覽</DialogTitle>
              <DialogDescription>選擇廠區、圖層與機櫃。</DialogDescription>
            </DialogHeader>
            <SceneNavigator {...navigatorProps} />
          </DialogContent>
        </Dialog>

        <Dialog open={mobileRightOpen} onOpenChange={setMobileRightOpen}>
          <DialogContent className="h-[min(90dvh,900px)] w-[min(96vw,980px)] max-w-none gap-0 overflow-hidden border border-[#163653] bg-[#081c2d] p-0 text-slate-100 sm:max-w-[980px]">
            <DialogHeader className="sr-only">
              <DialogTitle>機櫃設定</DialogTitle>
              <DialogDescription>查看機櫃狀態並設定 L10 安裝層。</DialogDescription>
            </DialogHeader>
            <RackInspector {...inspectorProps} />
          </DialogContent>
        </Dialog>

        <Dialog open={projectManagerOpen} onOpenChange={setProjectManagerOpen}>
          <DialogContent className="flex h-[min(88dvh,760px)] w-[min(96vw,1040px)] max-w-none flex-col gap-0 overflow-hidden border border-cyan-300/20 bg-[#081725] p-0 text-slate-100 sm:max-w-[1040px]">
            <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-5 pr-14 text-left">
              <DialogTitle className="flex items-center gap-2 text-white">
                <FileBox className="h-5 w-5 text-cyan-300" /> Data Center 專案管理
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                在同一個視窗完成新增、預覽、開啟、編輯與封存，避免功能散落在側欄。
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 md:grid-cols-[360px_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col border-b border-white/10 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <div className="text-sm font-black text-white">專案清單</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">共 {sharedProjects.projects.length} 個共用專案</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canEdit}
                    onClick={openCreateProject}
                    className="h-9 bg-cyan-300 font-bold text-[#071421] hover:bg-cyan-200"
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> 新增
                  </Button>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-2 p-3">
                    {sharedProjects.projects.map((project) => {
                      const active = project.id === sharedProjects.selectedProjectId;
                      const previewed = project.id === previewProject?.id;
                      return (
                        <div
                          key={project.id}
                          className={cn(
                            "rounded-2xl border p-3 transition-colors",
                            previewed
                              ? "border-cyan-300/45 bg-cyan-400/10"
                              : "border-white/10 bg-[#0c2235] hover:border-cyan-300/25"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setProjectPreviewId(project.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-white">{project.name}</div>
                                <div className="mt-1 truncate text-[11px] text-cyan-100/70">{project.category}</div>
                              </div>
                              {active ? (
                                <Badge className="border-0 bg-emerald-400/12 text-[10px] text-emerald-200">使用中</Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                              {project.description || "尚未填寫專案說明"}
                            </p>
                          </button>
                          <div className="mt-3 flex items-center gap-2 border-t border-white/8 pt-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                sharedProjects.selectProject(project.id);
                                setProjectManagerOpen(false);
                              }}
                              className="h-8 flex-1 border-cyan-300/20 bg-cyan-400/8 text-xs text-cyan-50 hover:bg-cyan-400/15"
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> 開啟
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={!canEdit}
                              aria-label={`編輯 ${project.name}`}
                              onClick={() => openEditProject(project)}
                              className="h-8 w-8 border-white/12 bg-white/[0.03] text-slate-200"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={!canEdit || sharedProjects.projects.length <= 1}
                              aria-label={`封存 ${project.name}`}
                              onClick={() => setProjectPendingArchive(project)}
                              className="h-8 w-8 border-rose-300/20 bg-rose-400/8 text-rose-100 hover:bg-rose-400/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="min-h-0 overflow-y-auto p-5 md:p-6">
                {previewProject && previewProjectStats ? (
                  <div className="space-y-5">
                    <div className="rounded-3xl border border-cyan-300/20 bg-[linear-gradient(145deg,#102c42,#0a1b2b)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black tracking-[0.14em] text-cyan-200/70">PROJECT PREVIEW</div>
                          <h3 className="mt-2 text-2xl font-black text-white">{previewProject.name}</h3>
                          <p className="mt-1 text-sm font-semibold text-cyan-100/75">{previewProject.category}</p>
                        </div>
                        <Badge className="border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                          {previewProject.id === sharedProjects.selectedProjectId ? "目前使用中" : "可開啟"}
                        </Badge>
                      </div>
                      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                        {previewProject.description || "尚未填寫專案說明。"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        ["站點", previewProjectStats.siteCount],
                        ["機櫃", previewProjectStats.rackCount],
                        ["冷熱通道", previewProjectStats.aisleCount],
                        ["電力來源", previewProjectStats.powerFeedCount],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-[#0c2235] p-4">
                          <div className="text-[11px] font-bold text-slate-400">{label}</div>
                          <div className="mt-2 text-2xl font-black tabular-nums text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#0c2235] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-white">站點內容</div>
                        <div className="text-[11px] text-slate-500">更新 {new Date(previewProject.updatedAt).toLocaleString("zh-TW")}</div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {previewProject.document.sites.map((site) => (
                          <div key={site.id} className="rounded-xl border border-white/8 bg-[#081725] px-3 py-3">
                            <div className="font-bold text-slate-100">{site.label}</div>
                            <div className="mt-1 text-xs text-slate-400">{site.racks.length} 座機櫃 · {site.phase}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" disabled={!canEdit} onClick={() => openEditProject(previewProject)} className="border-white/12 bg-white/[0.03] text-slate-100">
                        <Settings2 className="mr-2 h-4 w-4" /> 編輯資料
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          sharedProjects.selectProject(previewProject.id);
                          setProjectManagerOpen(false);
                        }}
                        className="bg-cyan-300 font-bold text-[#071421] hover:bg-cyan-200"
                      >
                        <Eye className="mr-2 h-4 w-4" /> 開啟此專案
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">尚無可預覽專案</div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(projectPendingArchive)} onOpenChange={(open) => !open && setProjectPendingArchive(null)}>
          <AlertDialogContent className="border-cyan-300/18 bg-[#081725] text-slate-100">
            <AlertDialogHeader>
              <AlertDialogTitle>封存「{projectPendingArchive?.name}」？</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300">
                封存後會從所有成員的 Data Center 專案清單移除，既有其他專案不受影響。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/12 bg-white/[0.04] text-slate-100">取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => projectPendingArchive && void archiveProject(projectPendingArchive)}
                className="bg-rose-500 text-white hover:bg-rose-400"
              >
                確認封存
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
          <DialogContent className="w-[min(94vw,560px)] max-w-none border border-cyan-300/20 bg-[#0b1b2b] p-0 text-slate-100 sm:max-w-[560px]">
            <DialogHeader className="border-b border-white/10 px-6 py-5 pr-14 text-left">
              <DialogTitle className="flex items-center gap-2 text-white">
                <Settings2 className="h-5 w-5 text-cyan-300" />
                {projectDialogMode === "create" ? "新增 Data Center 專案" : "Data Center 專案設定"}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                所有獲授權的登入成員會看到同一份專案場景、機櫃與廠房規劃。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-5">
              <div className="space-y-2">
                <Label htmlFor="data-center-project-name">專案名稱</Label>
                <Input id="data-center-project-name" value={projectDraft.name} onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Taipei AI Lab" className="border-white/12 bg-[#081522]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-center-project-category">專案分類</Label>
                <Input id="data-center-project-category" value={projectDraft.category} onChange={(event) => setProjectDraft((current) => ({ ...current, category: event.target.value }))} placeholder="例如：正式機房、測試實驗室" className="border-white/12 bg-[#081522]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-center-project-description">專案說明</Label>
                <textarea id="data-center-project-description" value={projectDraft.description} onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))} rows={4} maxLength={1000} placeholder="用途、負責團隊或規劃階段" className="w-full resize-none rounded-xl border border-white/12 bg-[#081522] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                {projectDialogMode === "edit" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sharedProjects.selectedProject && setProjectPendingArchive(sharedProjects.selectedProject)}
                    disabled={sharedProjects.projects.length <= 1}
                    className="border-rose-300/20 bg-rose-400/8 text-rose-100 hover:bg-rose-400/15"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />封存專案
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)} className="border-white/12 bg-white/[0.03] text-slate-200">取消</Button>
                  <Button type="button" onClick={() => void saveProjectSettings()} className="bg-cyan-300 font-bold text-[#071421] hover:bg-cyan-200">
                    {projectDialogMode === "create" ? "建立專案" : "儲存設定"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={facilityPlannerOpen} onOpenChange={setFacilityPlannerOpen}>
          <DialogContent className="flex h-[min(90dvh,880px)] w-[min(96vw,980px)] max-w-none flex-col gap-0 overflow-hidden border border-cyan-300/20 bg-[#071522] p-0 text-slate-100 sm:max-w-[980px]">
            <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-5 pr-14 text-left">
              <DialogTitle className="flex items-center gap-2 text-white">
                <PencilRuler className="h-5 w-5 text-cyan-300" />
                廠房與佈線規劃
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                設定廠房邊界、冷熱通道與 PDU 饋線，變更會自動保存在目前廠區。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
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
                            disabled={!canEdit || selectedFacility[field] <= 1}
                            onClick={() =>
                              setFacilityDimension(
                                field,
                                normalizeFacilityDimension(
                                  selectedFacility[field] - 1,
                                  selectedFacility[field]
                                )
                              )
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-[#10283d] text-slate-100 hover:border-cyan-200/50 disabled:opacity-35"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <Input
                            data-testid={testId}
                            type="number"
                            min={1}
                            step="0.1"
                            value={facilitySizeDraft[field]}
                            disabled={!canEdit}
                            aria-invalid={Boolean(facilitySizeErrors[field])}
                            aria-describedby={
                              facilitySizeErrors[field]
                                ? `${testId}-error`
                                : `${testId}-hint`
                            }
                            onChange={(event) => {
                              setFacilitySizeDraft((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }));
                              setFacilitySizeErrors((current) => ({
                                ...current,
                                [field]: "",
                              }));
                            }}
                            onBlur={() => commitFacilityDimension(field)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitFacilityDimension(field);
                                event.currentTarget.blur();
                              }
                            }}
                            className={cn(
                              "h-10 min-w-0 bg-[#06111f] px-2 text-center text-sm font-black tabular-nums text-white",
                              facilitySizeErrors[field]
                                ? "border-rose-300/70 focus-visible:ring-rose-300"
                                : "border-cyan-200/25"
                            )}
                          />
                          <button
                            type="button"
                            aria-label={`增加${label}`}
                            disabled={!canEdit}
                            onClick={() =>
                              setFacilityDimension(
                                field,
                                normalizeFacilityDimension(
                                  selectedFacility[field] + 1,
                                  selectedFacility[field]
                                )
                              )
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-200/30 bg-cyan-400/15 text-cyan-50 hover:bg-cyan-400/25 disabled:opacity-35"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </span>
                        {facilitySizeErrors[field] ? (
                          <span
                            id={`${testId}-error`}
                            role="alert"
                            className="block text-[10px] font-semibold text-rose-200"
                          >
                            {facilitySizeErrors[field]}
                          </span>
                        ) : (
                          <span
                            id={`${testId}-hint`}
                            className="block text-[10px] text-slate-400"
                          >
                            單位：公尺，最小 1 m，沒有固定上限
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200/20 bg-cyan-400/[0.08] px-3 py-2.5">
                    <div>
                      <span className="block text-xs font-bold text-slate-300">目前地板面積</span>
                      <span className="mt-0.5 block text-base font-black tabular-nums text-cyan-100">
                        {getFacilityAreaSquareMeters(selectedFacility)} m²
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canEdit}
                      onClick={() => {
                        commitFacilityDimension("width");
                        commitFacilityDimension("depth");
                      }}
                      className="h-8 bg-cyan-300 px-3 text-xs font-black text-[#04131f] hover:bg-cyan-200"
                    >
                      套用尺寸
                    </Button>
                  </div>
                  {overflowItems.length > 0 ? (
                    <div
                      role="alert"
                      className="mt-3 rounded-xl border border-rose-300/30 bg-rose-400/10 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-rose-100">
                            {overflowItems.length} 個項目超出廠房範圍
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-rose-100/75">
                            系統不會自動移動原有配置。請放大廠房，或在 2D 規劃中手動調整。
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {overflowItems.map((item) => (
                              <button
                                key={`${item.kind}:${item.id}`}
                                type="button"
                                onClick={() => focusOverflowItem(item)}
                                className="rounded-full border border-rose-200/25 bg-rose-950/35 px-2 py-1 text-[10px] font-bold text-rose-50 transition-colors hover:border-rose-100/55 hover:bg-rose-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
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
                      <p className="mt-1 text-[11px] text-slate-400">
                        不必換算中心座標；可用距離或直接在 2D 畫布拖曳調整。
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={openAisleCreation}
                      className="h-8 border-sky-300/25 bg-sky-400/10 px-2.5 text-[11px] text-sky-100 hover:bg-sky-400/20"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      新增通道
                    </Button>
                  </div>
                  <div className="divide-y divide-white/10 border-y border-white/10">
                    {selectedFacility.aisles.map((aisle) => {
                      const friendlyPosition = getFriendlyAislePosition(
                        aisle,
                        selectedFacility
                      );
                      return (
                        <div key={aisle.id} className="py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-2.5 w-2.5 rounded-full", aisle.kind === "cold" ? "bg-sky-400" : "bg-orange-400")} />
                            <Input
                              value={aisle.label}
                              disabled={!canEdit}
                              onChange={(event) => updateAisle(aisle.id, (current) => ({ ...current, label: event.target.value }))}
                              className="h-8 w-32 border-white/10 bg-black/20 px-2 text-xs font-bold text-white"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={!canEdit}
                              onClick={() =>
                                updateAisle(aisle.id, (current) => ({
                                  ...current,
                                  rotation: (current.rotation + 90) % 360,
                                }))
                              }
                              className="h-8 px-2 text-xs text-slate-300 hover:bg-white/8 hover:text-white"
                            >
                              <RotateCw className="mr-1 h-3.5 w-3.5" />
                              旋轉
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => removeAisle(aisle.id)} className="h-8 px-2 text-xs text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                              移除
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {([
                            ["left", "左側距離"],
                            ["top", "上方距離"],
                            ["width", "通道長度"],
                            ["depth", "通道寬度"],
                          ] as const).map(([field, label]) => (
                            <label key={field} className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-400">{label}</span>
                              <Input
                                type="number"
                                min={field === "width" || field === "depth" ? 0.5 : undefined}
                                step="0.25"
                                value={
                                  field === "left" || field === "top"
                                    ? friendlyPosition[field]
                                    : aisle[field]
                                }
                                disabled={!canEdit}
                                onChange={(event) => {
                                  const value = Number(event.target.value);
                                  if (!Number.isFinite(value)) return;
                                  if (field === "left" || field === "top") {
                                    const nextPosition =
                                      updateAisleFromFriendlyPosition(
                                        aisle,
                                        selectedFacility,
                                        {
                                          ...friendlyPosition,
                                          [field]: value,
                                        }
                                      );
                                    updateAisle(aisle.id, (current) => ({
                                      ...current,
                                      ...nextPosition,
                                    }));
                                    return;
                                  }
                                  updateAisle(aisle.id, (current) => ({
                                    ...current,
                                    [field]: Math.max(0.5, value),
                                  }));
                                }}
                                className="h-8 border-white/10 bg-black/20 px-2 text-[11px] font-bold text-white"
                              />
                            </label>
                          ))}
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] font-bold text-slate-500 hover:text-slate-300">
                            進階座標
                          </summary>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {([
                              ["x", "中心 X"],
                              ["z", "中心 Z"],
                              ["rotation", "角度"],
                            ] as const).map(([field, label]) => (
                              <label key={field} className="space-y-1">
                                <span className="block text-[10px] font-bold text-slate-500">
                                  {label}
                                </span>
                                <Input
                                  type="number"
                                  step={field === "rotation" ? 90 : 0.25}
                                  value={aisle[field]}
                                  disabled={!canEdit}
                                  onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (Number.isFinite(value)) {
                                      updateAisle(aisle.id, (current) => ({
                                        ...current,
                                        [field]: value,
                                      }));
                                    }
                                  }}
                                  className="h-8 border-white/10 bg-black/20 px-2 text-[11px] text-white"
                                />
                              </label>
                            ))}
                          </div>
                        </details>
                        </div>
                      );
                    })}
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
          </DialogContent>
        </Dialog>

        <FacilityAisleCreationDialog
          open={aisleCreationOpen}
          racks={selectedSite.racks}
          onOpenChange={setAisleCreationOpen}
          onCreate={createAisle}
        />

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
          importEquipmentCategory={importEquipmentCategory}
          selectedModelId={selectedModelId}
          onManufacturerChange={setManufacturer}
          onModelNameChange={setModelName}
          onRevisionChange={setRevision}
          onDimensionsChange={setImportDimensions}
          onCatalogKindChange={setCatalogKind}
          onImportKindChange={handleImportKindChange}
          onImportEquipmentCategoryChange={setImportEquipmentCategory}
          onSelectedModelChange={setSelectedModelId}
          onChooseFile={() => fileInputRef.current?.click()}
          onCancelImport={cancelModelImport}
          onAssignModel={assignSelectedModel}
          onAssignL10Model={assignSelectedL10Model}
          onInstallCatalogEquipment={installCatalogEquipment}
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
