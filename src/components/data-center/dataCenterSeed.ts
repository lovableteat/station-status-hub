import type {
  RackDevice,
  RackDeviceHealth,
  RackDeviceType,
  RackModelDefinition,
  RackPlan,
  RackStatus,
  SitePlan,
} from "./dataCenterTypes";

const companyModelUrl = `${import.meta.env.BASE_URL}models/data-center/nv-mgx-rack-v1-2-rev7.glb`;
const companyMobileModelUrl = `${import.meta.env.BASE_URL}models/data-center/nv-mgx-rack-v1-2-rev7.mobile.glb`;
const veraRubinVr1uModelUrl = `${import.meta.env.BASE_URL}models/data-center/vera-rubin-vr-1u-20260715.glb`;
const veraRubinVr1uMobileModelUrl = `${import.meta.env.BASE_URL}models/data-center/vera-rubin-vr-1u-20260715.mobile.glb`;
const carloNextL10ModelUrl = `${import.meta.env.BASE_URL}models/data-center/carlo-next-l10-20260715.glb`;
const carloNextL10MobileModelUrl = `${import.meta.env.BASE_URL}models/data-center/carlo-next-l10-20260715.mobile.glb`;

export const BUILT_IN_RACK_MODELS: Record<string, RackModelDefinition> = {
  "nv-mgx-rack-v1-2-rev7": {
    id: "nv-mgx-rack-v1-2-rev7",
    kind: "rack",
    manufacturer: "NVIDIA / Internal",
    name: "GB300 L11 機櫃",
    revision: "REV 7",
    source: "builtin-glb",
    sourceFileName: "000_nv_mgx_rack_v1-2_REV_7.stp",
    assetUrl: companyModelUrl,
    mobileAssetUrl: companyMobileModelUrl,
    dimensions: {
      widthMm: 708.8,
      depthMm: 1072.2,
      heightMm: 2308.315,
    },
    upAxis: "y",
    isCalibrated: true,
  },
  "vera-rubin-vr-1u-20260715": {
    id: "vera-rubin-vr-1u-20260715",
    kind: "l10",
    manufacturer: "Internal / VR200",
    name: "VR200 L10 1U 機台",
    revision: "20260715",
    source: "builtin-glb",
    sourceFileName: "00_vr_outlook_20260715.stp",
    assetUrl: veraRubinVr1uModelUrl,
    mobileAssetUrl: veraRubinVr1uMobileModelUrl,
    dimensions: {
      widthMm: 497.2,
      depthMm: 899.1,
      heightMm: 44,
    },
    upAxis: "y",
    rackUnits: 1,
    compatibleRackModelIds: [],
    compatibilityNote: "尚未取得 VR200 L11 原始檔，目前只提供 L10 細節檢視，不允許誤套至其他機櫃。",
    isCalibrated: true,
  },
  "carlo-next-l10-20260715": {
    id: "carlo-next-l10-20260715",
    kind: "l10",
    manufacturer: "Internal / GB300",
    name: "GB300 L10 1U 機台",
    revision: "20260715",
    source: "builtin-glb",
    sourceFileName: "00_carlo-next_l10_outlook_20260715.stp",
    assetUrl: carloNextL10ModelUrl,
    mobileAssetUrl: carloNextL10MobileModelUrl,
    dimensions: {
      widthMm: 482.1,
      depthMm: 912.3,
      heightMm: 43.8,
    },
    upAxis: "y",
    rackUnits: 1,
    compatibleRackModelIds: ["nv-mgx-rack-v1-2-rev7"],
    compatibilityNote: "已依 19 吋軌道與 1U 節距校正，可安裝於 GB300 L11 機櫃。",
    isCalibrated: true,
  },
  "generic-42u": {
    id: "generic-42u",
    kind: "rack",
    manufacturer: "Open Rack",
    name: "Generic 42U",
    revision: "Standard",
    source: "procedural",
    dimensions: {
      widthMm: 600,
      depthMm: 1200,
      heightMm: 2200,
    },
    upAxis: "y",
    isCalibrated: true,
  },
  "partner-48u": {
    id: "partner-48u",
    kind: "rack",
    manufacturer: "Partner Vendor",
    name: "High Density 48U",
    revision: "Reference",
    source: "procedural",
    dimensions: {
      widthMm: 800,
      depthMm: 1200,
      heightMm: 2300,
    },
    upAxis: "y",
    isCalibrated: true,
  },
  "l10-placeholder": {
    id: "l10-placeholder",
    kind: "l10",
    manufacturer: "Internal Planning",
    name: "L10 1U 暫代機台",
    revision: "Pre-STP",
    source: "procedural",
    dimensions: {
      widthMm: 482.6,
      depthMm: 800,
      heightMm: 44.45,
    },
    upAxis: "y",
    rackUnits: 1,
    isPlaceholder: true,
    isCalibrated: false,
  },
};

function createDevice(
  rackId: string,
  index: number,
  type: RackDeviceType,
  health: RackDeviceHealth,
  slotStart: number,
  slotSpan: number
): RackDevice {
  const typeNames: Record<RackDeviceType, string> = {
    "compute-tray": "Compute Tray",
    "switch-tray": "Switch Tray",
    "tor-switch": "TOR Switch",
    psu: "Power Shelf",
    management: "Management Node",
    "storage-tray": "Storage Tray",
  };

  const id = `${rackId}-${type}-${index}`;
  return {
    id,
    name: `${typeNames[type]} ${String(index).padStart(2, "0")}`,
    type,
    health,
    slotStart,
    slotSpan,
    serial: `SN-${rackId.toUpperCase()}-${String(index).padStart(3, "0")}`,
    assetTag: `DC-${type.slice(0, 3).toUpperCase()}-${String(index).padStart(4, "0")}`,
    model: type === "compute-tray" ? "MGX Compute Tray" : `${typeNames[type]} Rev.C`,
    role: type === "tor-switch" ? "Leaf / Uplink" : typeNames[type],
    network: type === "tor-switch" ? "4 × 400G Fabric" : "Dual 100G",
    powerFeed: index % 2 === 0 ? "PDU-B" : "PDU-A",
    bmc: `10.42.${Number(rackId.replace(/\D/g, "") || 1)}.${20 + index}`,
    redfish: "Enabled",
    note: health === "healthy" ? "運行正常" : "需要現場確認",
  };
}

function createRack(input: {
  id: string;
  cabinet: string;
  row: string;
  positionX: number;
  positionZ: number;
  status?: RackStatus;
  health?: RackDeviceHealth;
  modelId?: string;
  l10ModelId?: string;
  powerKw?: number;
  temperatureC?: number;
  utilizationPercent?: number;
  l10Count?: number;
  l10StartU?: number;
}): RackPlan {
  const health = input.health ?? "healthy";
  const status = input.status ?? "allocated";
  const devices: RackDevice[] = [
    createDevice(input.id, 1, "tor-switch", "healthy", 41, 2),
    createDevice(input.id, 2, "switch-tray", health === "critical" ? "warning" : "healthy", 38, 2),
    createDevice(input.id, 3, "compute-tray", health, 27, 8),
    createDevice(input.id, 4, "compute-tray", "healthy", 17, 8),
    createDevice(input.id, 5, "psu", health === "offline" ? "offline" : "healthy", 2, 4),
  ];

  return {
    id: input.id,
    zone: input.row === "A" ? "Compute Zone" : "Expansion Zone",
    row: input.row,
    cabinet: input.cabinet,
    status,
    modelId: input.modelId ?? "nv-mgx-rack-v1-2-rev7",
    l10ModelId: input.l10ModelId ?? "l10-placeholder",
    l10Count: input.l10Count ?? (status === "available" ? 0 : 4),
    l10StartU: input.l10StartU ?? 3,
    powerKw: input.powerKw ?? 16.8,
    coolingKw: Math.round((input.powerKw ?? 16.8) * 0.88 * 10) / 10,
    temperatureC: input.temperatureC ?? 24.2,
    utilizationPercent: input.utilizationPercent ?? 72,
    uplinks: 4,
    owner: "AI Infrastructure",
    positionX: input.positionX,
    positionZ: input.positionZ,
    rotation: input.row === "A" ? 0 : 180,
    capacityU: 42,
    coordinates: `Hall 1 / Row ${input.row} / ${input.cabinet}`,
    aisle: input.row === "A" ? "Cold Aisle A" : "Cold Aisle B",
    devices,
    sop: ["確認 PDU A/B", "驗證 TOR uplink", "同步 BMC inventory"],
    deploymentSteps: [
      { id: `${input.id}-step-1`, title: "機櫃定位", owner: "Facility", status: "done" },
      { id: `${input.id}-step-2`, title: "電力與網路驗證", owner: "Infra", status: health === "healthy" ? "done" : "active" },
      { id: `${input.id}-step-3`, title: "運行交付", owner: "Operations", status: health === "healthy" ? "active" : "pending" },
    ],
    maintenance:
      health === "healthy"
        ? []
        : [
            {
              id: `${input.id}-maintenance-1`,
              title: health === "critical" ? "溫度與電源異常" : "設備健康狀態待確認",
              owner: "Field Engineer",
              status: "in-progress",
              updatedAt: "2026/07/11 02:30",
              detail: "已建立現場檢查項目，等待工程師回報。",
            },
          ],
  };
}

const taipeiRacks: RackPlan[] = [
  createRack({
    id: "tpe-a01",
    cabinet: "TPE-A01",
    row: "A",
    positionX: -4.2,
    positionZ: -2.35,
    modelId: "nv-mgx-rack-v1-2-rev7",
    l10ModelId: "carlo-next-l10-20260715",
    powerKw: 18.4,
    utilizationPercent: 86,
    l10Count: 6,
  }),
  createRack({ id: "tpe-a02", cabinet: "TPE-A02", row: "A", positionX: -1.4, positionZ: -2.35, health: "warning", temperatureC: 28.6, utilizationPercent: 91, l10Count: 4 }),
  createRack({ id: "tpe-a03", cabinet: "TPE-A03", row: "A", positionX: 1.4, positionZ: -2.35, powerKw: 17.1, utilizationPercent: 78, l10Count: 8 }),
  createRack({ id: "tpe-a04", cabinet: "TPE-A04", row: "A", positionX: 4.2, positionZ: -2.35, status: "reserved", modelId: "partner-48u", powerKw: 8.2, utilizationPercent: 32, l10Count: 2 }),
  createRack({ id: "tpe-b01", cabinet: "TPE-B01", row: "B", positionX: -4.2, positionZ: 2.35, health: "critical", temperatureC: 31.4, utilizationPercent: 96, l10Count: 5 }),
  createRack({ id: "tpe-b02", cabinet: "TPE-B02", row: "B", positionX: -1.4, positionZ: 2.35, powerKw: 15.6, utilizationPercent: 69, l10Count: 3 }),
  createRack({ id: "tpe-b03", cabinet: "TPE-B03", row: "B", positionX: 1.4, positionZ: 2.35, status: "available", modelId: "generic-42u", powerKw: 0, utilizationPercent: 0 }),
  createRack({ id: "tpe-b04", cabinet: "TPE-B04", row: "B", positionX: 4.2, positionZ: 2.35, health: "offline", temperatureC: 23.8, utilizationPercent: 0, l10Count: 4 }),
];

const phoenixRacks: RackPlan[] = [
  createRack({ id: "phx-a01", cabinet: "PHX-A01", row: "A", positionX: -3.2, positionZ: -2.2, powerKw: 16.1, l10Count: 5 }),
  createRack({ id: "phx-a02", cabinet: "PHX-A02", row: "A", positionX: 0, positionZ: -2.2, status: "reserved", modelId: "generic-42u", powerKw: 5.2, l10Count: 2 }),
  createRack({ id: "phx-a03", cabinet: "PHX-A03", row: "A", positionX: 3.2, positionZ: -2.2, health: "warning", temperatureC: 27.9, l10Count: 4 }),
  createRack({ id: "phx-b01", cabinet: "PHX-B01", row: "B", positionX: -1.6, positionZ: 2.2, powerKw: 14.8, l10Count: 6 }),
  createRack({ id: "phx-b02", cabinet: "PHX-B02", row: "B", positionX: 1.6, positionZ: 2.2, status: "available", modelId: "partner-48u", powerKw: 0, utilizationPercent: 0 }),
];

export const INITIAL_SITE_PLANS: SitePlan[] = [
  {
    id: "taipei-ai-lab",
    label: "Taipei AI Lab",
    country: "Taiwan",
    phase: "Live",
    targetDate: "2026-07",
    powerBudgetKw: 180,
    coolingBudgetKw: 160,
    networkReady: "Dual fabric / OOB ready",
    siteManager: "Data Center Operations",
    racks: taipeiRacks,
    checklist: [
      { id: "power", label: "PDU A/B", done: true },
      { id: "network", label: "400G Fabric", done: true },
      { id: "cooling", label: "Cooling baseline", done: true },
      { id: "handoff", label: "Operations handoff", done: false },
    ],
  },
  {
    id: "phoenix-expansion",
    label: "Phoenix Expansion",
    country: "United States",
    phase: "Build-out",
    targetDate: "2026-10",
    powerBudgetKw: 120,
    coolingBudgetKw: 108,
    networkReady: "Fabric reservation complete",
    siteManager: "US Infrastructure",
    racks: phoenixRacks,
    checklist: [
      { id: "power", label: "PDU A/B", done: true },
      { id: "network", label: "400G Fabric", done: true },
      { id: "cooling", label: "Cooling baseline", done: false },
      { id: "handoff", label: "Operations handoff", done: false },
    ],
  },
];

export function createRackFromModel(
  model: RackModelDefinition,
  site: SitePlan
): RackPlan {
  const nextIndex = site.racks.length + 1;
  const id = `${site.id}-rack-${Date.now()}`;
  const rack = createRack({
    id,
    cabinet: `NEW-${String(nextIndex).padStart(2, "0")}`,
    row: "B",
    positionX: 0,
    positionZ: 4.7,
    status: "reserved",
    modelId: model.id,
    powerKw: 0,
    utilizationPercent: 0,
  });
  rack.owner = model.manufacturer;
  return rack;
}
