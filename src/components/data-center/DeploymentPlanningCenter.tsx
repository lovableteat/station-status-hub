import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Bot,
  Cable,
  Cpu,
  Gauge,
  HardDrive,
  MapPinned,
  Network,
  RefreshCw,
  Ruler,
  Search,
  Server,
  ShieldCheck,
  Upload,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { DataCenter3DPlanner } from "./DataCenter3DPlanner";
import { importStepModel } from "./stepImport";
import type {
  DeploymentStepStatus,
  ImportedStepDimensions,
  ImportedStepModel,
  MaintenanceStatus,
  RackDevice,
  RackDeviceHealth,
  RackDeviceType,
  RackPlan,
  RackStatus,
  SitePlan,
} from "./dataCenterTypes";

const DEFAULT_RACK_DIMENSIONS: ImportedStepDimensions = {
  widthMm: 600,
  depthMm: 1200,
  heightMm: 2200,
};

function device(input: RackDevice): RackDevice {
  return input;
}

function rack(input: RackPlan): RackPlan {
  return input;
}

const sitePlans: SitePlan[] = [
  {
    id: "frankfurt-dc1",
    label: "Frankfurt DC-1",
    country: "Germany",
    phase: "Pre-deployment",
    targetDate: "2026-09",
    powerBudgetKw: 84,
    coolingBudgetKw: 76,
    networkReady: "Dual 100G uplink reserved / OOB route verified",
    siteManager: "NOC Germany",
    checklist: [
      { id: "power", label: "A / B PDU 供電確認", done: true },
      { id: "uplink", label: "TOR uplink 路徑確認", done: true },
      { id: "hvac", label: "冷通道間隙確認", done: false },
      { id: "mpls", label: "跨站 MPLS 開通", done: false },
    ],
    racks: [
      rack({
        id: "fra-a01",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A01",
        status: "allocated",
        powerKw: 18,
        coolingKw: 15,
        uplinks: 4,
        owner: "GB300 Batch-1",
        positionX: -3.2,
        positionZ: -2.4,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall A / Row A / Position 01",
        aisle: "Cold aisle",
        sop: ["先裝 TOR", "確認 PDU A/B", "建立 Redfish 基線"],
        deploymentSteps: [
          { id: "fra-a01-step-1", title: "機櫃到位", owner: "Facility", status: "done" },
          { id: "fra-a01-step-2", title: "PDU A/B 接線完成", owner: "Power", status: "done" },
          { id: "fra-a01-step-3", title: "TOR uplink 驗證", owner: "Network", status: "active" },
          { id: "fra-a01-step-4", title: "Compute Tray 上架", owner: "Platform", status: "pending" },
        ],
        maintenance: [
          {
            id: "fra-a01-maint-1",
            title: "CT-02 風扇轉速觀察中",
            owner: "Field Engineer",
            status: "in-progress",
            updatedAt: "2026/07/05 09:20",
            detail: "首次上電後，持續觀察 tray 溫度與風扇曲線。",
          },
        ],
        devices: [
          device({
            id: "fra-a01-tor",
            name: "TOR Switch A01",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-FRA-A01-01",
            assetTag: "NW-TOR-0001",
            model: "Mellanox SN4700",
            role: "Leaf / Uplink",
            network: "4x100G / fabric-a",
            powerFeed: "PDU-A / PDU-B",
            bmc: "tor-a01-oob",
            redfish: "Enabled",
            note: "前方上層網路設備",
          }),
          device({
            id: "fra-a01-sw",
            name: "Switch Tray A01",
            type: "switch-tray",
            health: "healthy",
            slotStart: 37,
            slotSpan: 2,
            serial: "SWT-FRA-A01-01",
            assetTag: "NW-SWT-0031",
            model: "Switch Tray Rev.C",
            role: "Fanout",
            network: "24x25G",
            powerFeed: "PDU-A",
            bmc: "swt-a01-01",
            redfish: "Enabled",
            note: "上層 switch tray",
          }),
          device({
            id: "fra-a01-ct1",
            name: "Compute Tray CT-01",
            type: "compute-tray",
            health: "healthy",
            slotStart: 28,
            slotSpan: 4,
            serial: "CT-FRA-A01-01",
            assetTag: "CMP-8801",
            model: "GB300 Compute Tray",
            role: "GPU group 01",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-a01-01-bmc",
            redfish: "Enabled",
            note: "主運算模組",
          }),
          device({
            id: "fra-a01-ct2",
            name: "Compute Tray CT-02",
            type: "compute-tray",
            health: "warning",
            slotStart: 23,
            slotSpan: 4,
            serial: "CT-FRA-A01-02",
            assetTag: "CMP-8802",
            model: "GB300 Compute Tray",
            role: "GPU group 02",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-a01-02-bmc",
            redfish: "Enabled",
            note: "需觀察散熱表現",
          }),
          device({
            id: "fra-a01-psu-a",
            name: "PSU Feed A",
            type: "psu",
            health: "healthy",
            slotStart: 4,
            slotSpan: 2,
            serial: "PSU-FRA-A01-A",
            assetTag: "PWR-1101",
            model: "3.2kW PSU",
            role: "Power path A",
            network: "N/A",
            powerFeed: "PDU-A",
            bmc: "rack-a01-pwr-a",
            redfish: "Enabled",
            note: "左側電源路徑",
          }),
          device({
            id: "fra-a01-psu-b",
            name: "PSU Feed B",
            type: "psu",
            health: "healthy",
            slotStart: 1,
            slotSpan: 2,
            serial: "PSU-FRA-A01-B",
            assetTag: "PWR-1102",
            model: "3.2kW PSU",
            role: "Power path B",
            network: "N/A",
            powerFeed: "PDU-B",
            bmc: "rack-a01-pwr-b",
            redfish: "Enabled",
            note: "右側電源路徑",
          }),
        ],
      }),
      rack({
        id: "fra-a02",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A02",
        status: "reserved",
        powerKw: 16,
        coolingKw: 13,
        uplinks: 4,
        owner: "GB300 Batch-2",
        positionX: -1.2,
        positionZ: -2.4,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall A / Row A / Position 02",
        aisle: "Cold aisle",
        sop: ["保留 uplink", "準備 Tray 標籤"],
        deploymentSteps: [
          { id: "fra-a02-step-1", title: "電力預留", owner: "Power", status: "active" },
          { id: "fra-a02-step-2", title: "Compute Tray 等待到貨", owner: "Platform", status: "pending" },
        ],
        maintenance: [],
        devices: [
          device({
            id: "fra-a02-tor",
            name: "TOR Switch A02",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-FRA-A02-01",
            assetTag: "NW-TOR-0002",
            model: "Mellanox SN4700",
            role: "Leaf / Uplink",
            network: "4x100G / fabric-b",
            powerFeed: "PDU-A / PDU-B",
            bmc: "tor-a02-oob",
            redfish: "Enabled",
            note: "預留 TOR",
          }),
        ],
      }),
      rack({
        id: "fra-b01",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B01",
        status: "available",
        powerKw: 8,
        coolingKw: 5,
        uplinks: 2,
        owner: "Standby / Service",
        positionX: -3.2,
        positionZ: 0.4,
        rotation: 90,
        capacityU: 42,
        coordinates: "Hall A / Row B / Position 01",
        aisle: "Service aisle",
        sop: ["確認備援狀態", "維持 OOB 可達"],
        deploymentSteps: [{ id: "fra-b01-step-1", title: "Standby rack ready", owner: "Service", status: "done" }],
        maintenance: [
          {
            id: "fra-b01-maint-1",
            title: "季度保養完成",
            owner: "Service Team",
            status: "done",
            updatedAt: "2026/07/03 16:30",
            detail: "巡檢完成，無異常。",
          },
        ],
        devices: [
          device({
            id: "fra-b01-mgmt",
            name: "Management Switch",
            type: "management",
            health: "healthy",
            slotStart: 38,
            slotSpan: 1,
            serial: "MGMT-FRA-B01-01",
            assetTag: "MGMT-8821",
            model: "OOB Switch 24P",
            role: "OOB staging",
            network: "1G OOB",
            powerFeed: "PDU-A",
            bmc: "mgmt-b01",
            redfish: "N/A",
            note: "管理網交換器",
          }),
        ],
      }),
      rack({
        id: "fra-c01",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C01",
        status: "blocked",
        powerKw: 0,
        coolingKw: 0,
        uplinks: 0,
        owner: "Awaiting HVAC clearance",
        positionX: -1.2,
        positionZ: 2.6,
        rotation: 180,
        capacityU: 42,
        coordinates: "Hall A / Row C / Position 01",
        aisle: "Hot aisle",
        sop: ["待空調放行前不可部署設備"],
        deploymentSteps: [
          { id: "fra-c01-step-1", title: "HVAC clearance", owner: "Facility", status: "active" },
          { id: "fra-c01-step-2", title: "Grounding re-check", owner: "Facility", status: "pending" },
        ],
        maintenance: [
          {
            id: "fra-c01-maint-1",
            title: "機櫃待現場放行",
            owner: "Facility",
            status: "open",
            updatedAt: "2026/07/05 10:05",
            detail: "冷通道與地板孔位尚未完成複驗。",
          },
        ],
        devices: [],
      }),
    ],
  },
  {
    id: "phoenix-dc2",
    label: "Phoenix DC-2",
    country: "United States",
    phase: "Pilot live",
    targetDate: "2026-08",
    powerBudgetKw: 96,
    coolingBudgetKw: 88,
    networkReady: "Dual 400G live / OOB active",
    siteManager: "US Infra Ops",
    checklist: [
      { id: "feed", label: "A / B feed verified", done: true },
      { id: "fabric", label: "Fabric ready", done: true },
      { id: "runbook", label: "Runbook published", done: true },
      { id: "spare", label: "Spare tray stock pending", done: false },
    ],
    racks: [
      rack({
        id: "phx-d11",
        zone: "Zone D",
        row: "D",
        cabinet: "CAB-D11",
        status: "allocated",
        powerKw: 20,
        coolingKw: 17,
        uplinks: 4,
        owner: "Inference / Serving",
        positionX: 2.8,
        positionZ: -1.6,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall B / Row D / Position 11",
        aisle: "Cold aisle",
        sop: ["Serving rack baseline complete", "同步 BMC inventory"],
        deploymentSteps: [
          { id: "phx-d11-step-1", title: "Pilot rack live", owner: "Platform", status: "done" },
          { id: "phx-d11-step-2", title: "BMC inventory sync", owner: "Platform", status: "active" },
        ],
        maintenance: [
          {
            id: "phx-d11-maint-1",
            title: "Switch tray fan RPM review",
            owner: "Service Team",
            status: "open",
            updatedAt: "2026/07/05 07:48",
            detail: "需對比 golden rack 風扇曲線。",
          },
        ],
        devices: [
          device({
            id: "phx-d11-tor",
            name: "TOR Switch D11",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-PHX-D11-01",
            assetTag: "NW-TOR-0101",
            model: "Mellanox SN5600",
            role: "Leaf / Uplink",
            network: "8x100G / serving",
            powerFeed: "PDU-A / PDU-B",
            bmc: "tor-d11",
            redfish: "Enabled",
            note: "正式線上 TOR",
          }),
          device({
            id: "phx-d11-ct1",
            name: "Compute Tray CT-11",
            type: "compute-tray",
            health: "healthy",
            slotStart: 28,
            slotSpan: 4,
            serial: "CT-PHX-D11-11",
            assetTag: "CMP-9811",
            model: "GB300 Compute Tray",
            role: "Serving node 11",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-d11-11-bmc",
            redfish: "Enabled",
            note: "正式線上運算節點",
          }),
          device({
            id: "phx-d11-ct2",
            name: "Compute Tray CT-12",
            type: "compute-tray",
            health: "critical",
            slotStart: 23,
            slotSpan: 4,
            serial: "CT-PHX-D11-12",
            assetTag: "CMP-9812",
            model: "GB300 Compute Tray",
            role: "Serving node 12",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-d11-12-bmc",
            redfish: "Enabled",
            note: "GPU issue under review",
          }),
        ],
      }),
    ],
  },
];

function getRackStatusLabel(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "已配置";
    case "reserved":
      return "預留";
    case "available":
      return "可用";
    case "blocked":
      return "阻塞";
    default:
      return status;
  }
}

function getRackStatusTone(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "reserved":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "available":
      return "border-sky-300/25 bg-sky-400/10 text-sky-100";
    case "blocked":
      return "border-rose-300/25 bg-rose-400/10 text-rose-100";
    default:
      return "border-border bg-card text-foreground";
  }
}

function getDeviceTypeLabel(type: RackDeviceType) {
  switch (type) {
    case "compute-tray":
      return "Compute Tray";
    case "switch-tray":
      return "Switch Tray";
    case "tor-switch":
      return "TOR Switch";
    case "psu":
      return "PSU";
    case "management":
      return "Management";
    case "storage-tray":
      return "Storage Tray";
    default:
      return type;
  }
}

function getDeviceTypeIcon(type: RackDeviceType): LucideIcon {
  switch (type) {
    case "compute-tray":
      return Cpu;
    case "switch-tray":
    case "tor-switch":
    case "management":
      return Network;
    case "psu":
      return Zap;
    case "storage-tray":
      return HardDrive;
    default:
      return Server;
  }
}

function getDeviceHealthLabel(health: RackDeviceHealth) {
  switch (health) {
    case "healthy":
      return "正常";
    case "warning":
      return "注意";
    case "critical":
      return "異常";
    case "offline":
      return "離線";
    default:
      return health;
  }
}

function getDeviceTone(health: RackDeviceHealth) {
  switch (health) {
    case "healthy":
      return "border-emerald-300/20 bg-emerald-400/10";
    case "warning":
      return "border-amber-300/20 bg-amber-400/10";
    case "critical":
      return "border-rose-300/20 bg-rose-400/10";
    case "offline":
      return "border-slate-400/20 bg-slate-500/10";
    default:
      return "border-border bg-card";
  }
}

function getStepTone(status: DeploymentStepStatus) {
  switch (status) {
    case "done":
      return "border-emerald-300/20 bg-emerald-400/10 text-emerald-50";
    case "active":
      return "border-sky-300/20 bg-sky-400/10 text-sky-50";
    case "pending":
      return "border-border bg-background/45 text-muted-foreground";
    default:
      return "border-border bg-background/45 text-muted-foreground";
  }
}

function getStepLabel(status: DeploymentStepStatus) {
  switch (status) {
    case "done":
      return "已完成";
    case "active":
      return "進行中";
    case "pending":
      return "待處理";
    default:
      return status;
  }
}

function getMaintenanceTone(status: MaintenanceStatus) {
  switch (status) {
    case "done":
      return "border-violet-300/20 bg-violet-400/10";
    case "in-progress":
      return "border-amber-300/20 bg-amber-400/10";
    case "open":
      return "border-slate-400/20 bg-slate-500/10";
    default:
      return "border-border bg-background/45";
  }
}

function getMaintenanceLabel(status: MaintenanceStatus) {
  switch (status) {
    case "done":
      return "已完成";
    case "in-progress":
      return "處理中";
    case "open":
      return "無狀態";
    default:
      return status;
  }
}

function getSlotLabel(device: RackDevice) {
  const slotEnd = device.slotStart + device.slotSpan - 1;
  return device.slotSpan === 1 ? `U${device.slotStart}` : `U${device.slotStart}-U${slotEnd}`;
}

function getSiteReadiness(checklist: SitePlan["checklist"]) {
  if (!checklist.length) {
    return 0;
  }

  const doneCount = checklist.filter((item) => item.done).length;
  return Math.round((doneCount / checklist.length) * 100);
}

function formatDimensionLabel(dimensions: ImportedStepDimensions) {
  return `${Math.round(dimensions.widthMm)} x ${Math.round(dimensions.depthMm)} x ${Math.round(dimensions.heightMm)} mm`;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[24px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_26%_16%),hsl(224_24%_13%))]">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">{label}</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DeploymentPlanningCenter() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(sitePlans[0].id);
  const [selectedRackId, setSelectedRackId] = useState(sitePlans[0].racks[0].id);
  const [selectedDeviceId, setSelectedDeviceId] = useState(sitePlans[0].racks[0].devices[0]?.id ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [importedModel, setImportedModel] = useState<ImportedStepModel | null>(null);
  const [isImportingModel, setIsImportingModel] = useState(false);
  const [targetDimensions, setTargetDimensions] = useState<ImportedStepDimensions>(DEFAULT_RACK_DIMENSIONS);
  const [importError, setImportError] = useState("");

  const selectedSite = useMemo(
    () => sitePlans.find((site) => site.id === selectedSiteId) ?? sitePlans[0],
    [selectedSiteId]
  );

  useEffect(() => {
    const nextRack = selectedSite.racks.find((currentRack) => currentRack.id === selectedRackId);
    if (!nextRack) {
      setSelectedRackId(selectedSite.racks[0]?.id ?? "");
    }
  }, [selectedRackId, selectedSite]);

  const selectedRack = useMemo(
    () => selectedSite.racks.find((currentRack) => currentRack.id === selectedRackId) ?? selectedSite.racks[0],
    [selectedRackId, selectedSite]
  );

  useEffect(() => {
    const hasSelectedDevice = selectedRack.devices.some((currentDevice) => currentDevice.id === selectedDeviceId);
    if (!hasSelectedDevice) {
      setSelectedDeviceId(selectedRack.devices[0]?.id ?? "");
    }
  }, [selectedDeviceId, selectedRack]);

  const selectedDevice = useMemo(
    () => selectedRack.devices.find((currentDevice) => currentDevice.id === selectedDeviceId) ?? selectedRack.devices[0],
    [selectedDeviceId, selectedRack]
  );

  const readinessPercent = useMemo(() => getSiteReadiness(selectedSite.checklist), [selectedSite.checklist]);
  const totalDevices = useMemo(() => selectedSite.racks.reduce((sum, currentRack) => sum + currentRack.devices.length, 0), [selectedSite.racks]);
  const activeAlerts = useMemo(
    () => selectedSite.racks.flatMap((currentRack) => currentRack.devices).filter((currentDevice) => currentDevice.health !== "healthy").length,
    [selectedSite.racks]
  );
  const plannedPower = useMemo(() => selectedSite.racks.reduce((sum, currentRack) => sum + currentRack.powerKw, 0), [selectedSite.racks]);

  const deployedRacks = selectedSite.racks.filter((currentRack) => currentRack.status === "allocated").length;

  const searchResults = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    return selectedSite.racks.flatMap((currentRack) => {
      const rackMatch =
        currentRack.cabinet.toLowerCase().includes(keyword) ||
        currentRack.owner.toLowerCase().includes(keyword) ||
        currentRack.coordinates.toLowerCase().includes(keyword);

      const deviceMatches = currentRack.devices.filter((currentDevice) =>
        [
          currentDevice.name,
          currentDevice.serial,
          currentDevice.assetTag,
          currentDevice.model,
          currentDevice.role,
          currentDevice.bmc,
          currentDevice.redfish,
          getSlotLabel(currentDevice),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );

      return [
        ...(rackMatch
          ? [
              {
                id: `rack-${currentRack.id}`,
                kind: "rack" as const,
                rackId: currentRack.id,
                deviceId: undefined,
                title: currentRack.cabinet,
                subtitle: `${currentRack.zone} / Row ${currentRack.row} / ${currentRack.owner}`,
                detail: currentRack.coordinates,
              },
            ]
          : []),
        ...deviceMatches.map((currentDevice) => ({
          id: `device-${currentDevice.id}`,
          kind: "device" as const,
          rackId: currentRack.id,
          deviceId: currentDevice.id,
          title: currentDevice.name,
          subtitle: `${currentRack.cabinet} / ${getSlotLabel(currentDevice)} / ${getDeviceTypeLabel(currentDevice.type)}`,
          detail: `${currentDevice.assetTag} / ${currentDevice.serial}`,
        })),
      ];
    });
  }, [searchTerm, selectedSite.racks]);

  const sortedDevices = useMemo(
    () =>
      [...selectedRack.devices].sort((left, right) => {
        const leftTop = left.slotStart + left.slotSpan - 1;
        const rightTop = right.slotStart + right.slotSpan - 1;
        return rightTop - leftTop;
      }),
    [selectedRack.devices]
  );

  const handleRackSelect = (rackId: string) => {
    const nextRack = selectedSite.racks.find((currentRack) => currentRack.id === rackId);
    setSelectedRackId(rackId);
    setSelectedDeviceId(nextRack?.devices[0]?.id ?? "");
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".stp") && !lowerName.endsWith(".step")) {
      setImportError("目前只接受 .STP 或 .STEP 檔案。");
      toast({
        title: "檔案格式不支援",
        description: "請匯入 .STP 或 .STEP 的 3D 模型檔案。",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsImportingModel(true);
      setImportError("");
      const model = await importStepModel(file);
      setImportedModel(model);
      setTargetDimensions(model.dimensions);
      toast({
        title: "3D 模型匯入完成",
        description: `${file.name} 已載入，現在可以用毫米尺寸校正成現場實體大小。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "STEP 模型匯入失敗。";
      setImportError(message);
      toast({
        title: "匯入失敗",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsImportingModel(false);
    }
  };

  const applyCalibration = () => {
    if (!importedModel) {
      return;
    }

    setImportedModel({
      ...importedModel,
      calibratedDimensions: {
        widthMm: Math.max(1, targetDimensions.widthMm),
        depthMm: Math.max(1, targetDimensions.depthMm),
        heightMm: Math.max(1, targetDimensions.heightMm),
      },
    });

    toast({
      title: "尺寸校正完成",
      description: "模型已依照輸入的實體毫米尺寸重新縮放。",
    });
  };

  const resetCalibration = () => {
    if (!importedModel) {
      return;
    }

    setTargetDimensions(importedModel.dimensions);
    setImportedModel({
      ...importedModel,
      calibratedDimensions: importedModel.dimensions,
    });
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <input ref={fileInputRef} type="file" accept=".stp,.step" className="hidden" onChange={handleImportFile} />

      <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(135deg,hsl(223_30%_16%),hsl(223_28%_12%)_52%,hsl(196_55%_15%)_100%)] shadow-[0_32px_90px_-52px_hsl(var(--primary)/0.72)]">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-100 shadow-none">
                Rack Digital Twin
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">Data-center</h1>
                <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                  這裡以 3D 視覺化管理實體機櫃、Compute Tray、Switch Tray、PSU 與 TOR Switch。
                  你可以匯入 STP / STEP 模型，再用毫米尺寸校正，讓畫面大小與現場實際設備一致。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-emerald-300/25 bg-emerald-400/10 text-emerald-100">
                  {deployedRacks} 個已配置機櫃
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/35 text-foreground">
                  {selectedSite.racks.length} 櫃 / {totalDevices} 台設備
                </Badge>
                <Badge variant="outline" className="rounded-full border-amber-300/25 bg-amber-400/10 text-amber-100">
                  {activeAlerts} 個告警
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/35 text-foreground">
                  Manager / {selectedSite.siteManager}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1.2fr] xl:min-w-[640px]">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">Site</div>
                <Select
                  value={selectedSiteId}
                  onValueChange={(value) => {
                    setSelectedSiteId(value);
                    const nextSite = sitePlans.find((site) => site.id === value);
                    const nextRack = nextSite?.racks[0];
                    setSelectedRackId(nextRack?.id ?? "");
                    setSelectedDeviceId(nextRack?.devices[0]?.id ?? "");
                    setImportedModel(null);
                    setImportError("");
                    setSearchTerm("");
                  }}
                >
                  <SelectTrigger className="h-12 rounded-2xl border-primary/15 bg-background/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sitePlans.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">快速搜尋</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜尋機櫃、設備、Asset Tag、Serial、BMC"
                    className="h-12 rounded-2xl border-primary/15 bg-background/30 pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <SummaryCard
              icon={MapPinned}
              label="Target Site"
              value={selectedSite.label}
              detail={`${selectedSite.country} / ${selectedSite.phase} / ETA ${selectedSite.targetDate}`}
            />
            <SummaryCard
              icon={Server}
              label="Rack Capacity"
              value={`${selectedSite.racks.length} racks`}
              detail={`全站共 ${totalDevices} 台設備，目前選中機櫃容量 ${selectedRack.capacityU}U`}
            />
            <SummaryCard
              icon={Zap}
              label="Power Load"
              value={`${plannedPower} kW`}
              detail={`Power ${selectedSite.powerBudgetKw} kW / Cooling ${selectedSite.coolingBudgetKw} kW`}
            />
            <SummaryCard icon={ShieldCheck} label="Readiness" value={`${readinessPercent}%`} detail={selectedSite.networkReady} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.9fr]">
        <Card className="rounded-[28px] border border-cyan-300/10 bg-[linear-gradient(180deg,hsl(223_30%_15%),hsl(223_34%_11%))]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-[-0.03em]">3D 機櫃視圖</CardTitle>
                <div className="mt-2 text-sm text-muted-foreground">
                  點選機櫃可切換視角。匯入 STEP 後，模型會套用到目前選中的機櫃，並依校正尺寸等比例顯示。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-cyan-400 px-4 text-slate-950 hover:bg-cyan-300"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImportingModel}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isImportingModel ? "匯入中..." : "匯入 STP"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-primary/15 bg-background/30"
                  onClick={resetCalibration}
                  disabled={!importedModel}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  還原尺寸
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataCenter3DPlanner
              racks={selectedSite.racks}
              selectedRackId={selectedRack.id}
              importedModel={importedModel}
              onSelectRack={handleRackSelect}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {selectedSite.racks.map((currentRack) => {
                const isActive = currentRack.id === selectedRack.id;
                return (
                  <button
                    key={currentRack.id}
                    type="button"
                    onClick={() => handleRackSelect(currentRack.id)}
                    className={cn(
                      "rounded-[22px] border px-4 py-4 text-left transition-all",
                      getRackStatusTone(currentRack.status),
                      isActive && "ring-1 ring-cyan-300/60 shadow-[0_18px_42px_-28px_hsl(191_91%_55%/0.6)]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold text-foreground">{currentRack.cabinet}</div>
                      <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                        {getRackStatusLabel(currentRack.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {currentRack.zone} / Row {currentRack.row} / {currentRack.owner}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>{currentRack.powerKw} kW</div>
                      <div>{currentRack.devices.length} devices</div>
                      <div>{currentRack.aisle}</div>
                      <div>{currentRack.uplinks} uplinks</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(222_29%_15%),hsl(223_28%_12%))]">
            <CardHeader>
              <CardTitle className="text-xl tracking-[-0.03em]">目前機櫃</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("rounded-[22px] border p-4", getRackStatusTone(selectedRack.status))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-foreground">{selectedRack.cabinet}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedRack.zone} / Row {selectedRack.row} / {selectedRack.coordinates}
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                    {getRackStatusLabel(selectedRack.status)}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Owner</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedRack.owner}</div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Aisle</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedRack.aisle}</div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Power / Cooling</div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {selectedRack.powerKw} kW / {selectedRack.coolingKw} kW
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">3D Position</div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      X {selectedRack.positionX.toFixed(1)} / Z {selectedRack.positionZ.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Site readiness</span>
                  <span className="font-medium text-foreground">{readinessPercent}%</span>
                </div>
                <Progress value={readinessPercent} className="h-2 bg-primary/10" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(199_42%_15%),hsl(223_26%_12%))]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl tracking-[-0.03em]">STP / STEP 匯入</CardTitle>
              <div className="text-sm text-muted-foreground">
                匯入機櫃或 Tray 的 STEP 模型後，可以用毫米尺寸校正，確保 3D 圖與實際設備大小一致。
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[22px] border border-primary/10 bg-background/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{importedModel ? importedModel.fileName : "尚未匯入 3D 模型"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {importedModel
                        ? `原始尺寸 ${formatDimensionLabel(importedModel.dimensions)}`
                        : "支援 .stp / .step，可匯入機櫃外觀或單一 Tray 模型。"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-cyan-300/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImportingModel}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    重新匯入
                  </Button>
                </div>
                {importError ? (
                  <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{importError}</div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Width (mm)</div>
                  <Input
                    type="number"
                    min={1}
                    value={targetDimensions.widthMm}
                    onChange={(event) =>
                      setTargetDimensions((prev) => ({
                        ...prev,
                        widthMm: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Depth (mm)</div>
                  <Input
                    type="number"
                    min={1}
                    value={targetDimensions.depthMm}
                    onChange={(event) =>
                      setTargetDimensions((prev) => ({
                        ...prev,
                        depthMm: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Height (mm)</div>
                  <Input
                    type="number"
                    min={1}
                    value={targetDimensions.heightMm}
                    onChange={(event) =>
                      setTargetDimensions((prev) => ({
                        ...prev,
                        heightMm: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" className="rounded-2xl bg-cyan-400 text-slate-950 hover:bg-cyan-300" onClick={applyCalibration} disabled={!importedModel}>
                  <Ruler className="mr-2 h-4 w-4" />
                  套用實體尺寸
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-primary/15 bg-background/35"
                  onClick={() => setTargetDimensions(DEFAULT_RACK_DIMENSIONS)}
                >
                  標準機櫃 600 x 1200 x 2200
                </Button>
              </div>

              {importedModel ? (
                <div className="rounded-[22px] border border-primary/10 bg-background/35 p-4 text-sm text-muted-foreground">
                  <div>原始模型 / {formatDimensionLabel(importedModel.dimensions)}</div>
                  <div className="mt-2">校正後尺寸 / {formatDimensionLabel(importedModel.calibratedDimensions)}</div>
                  <div className="mt-2">零件數量 / {importedModel.parts.length}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl tracking-[-0.03em]">搜尋結果</CardTitle>
              <div className="text-sm text-muted-foreground">可以快速定位機櫃、設備、Asset Tag、Serial 或 BMC 名稱。</div>
            </CardHeader>
            <CardContent>
              {searchTerm.trim() ? (
                searchResults.length ? (
                  <ScrollArea className="h-[320px] pr-3">
                    <div className="space-y-3">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            handleRackSelect(result.rackId);
                            if (result.deviceId) {
                              setSelectedDeviceId(result.deviceId);
                            }
                          }}
                          className="w-full rounded-[20px] border border-primary/10 bg-background/35 px-4 py-3 text-left transition-colors hover:border-cyan-300/30 hover:bg-background/55"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full border-primary/15 bg-primary/5">
                              {result.kind === "rack" ? "Rack" : "Device"}
                            </Badge>
                            <div className="text-sm font-semibold text-foreground">{result.title}</div>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">{result.subtitle}</div>
                          <div className="mt-1 text-xs text-muted-foreground/75">{result.detail}</div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="rounded-[22px] border border-primary/10 bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                    找不到符合條件的機櫃或設備。
                  </div>
                )
              ) : (
                <div className="rounded-[22px] border border-primary/10 bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                  例如可搜尋 CAB-A01、TOR、CT-02、PWR-1102、BMC。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1fr_0.85fr]">
        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.03em]">Rack Front / U 位</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] pr-3">
              <div className="space-y-3">
                {sortedDevices.length ? (
                  sortedDevices.map((currentDevice) => {
                    const Icon = getDeviceTypeIcon(currentDevice.type);
                    const isActive = currentDevice.id === selectedDevice?.id;

                    return (
                      <button
                        key={currentDevice.id}
                        type="button"
                        onClick={() => setSelectedDeviceId(currentDevice.id)}
                        className={cn(
                          "w-full rounded-[22px] border px-4 py-4 text-left transition-all",
                          getDeviceTone(currentDevice.health),
                          isActive && "ring-1 ring-cyan-300/60 shadow-[0_18px_38px_-28px_hsl(191_91%_55%/0.58)]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-background/35 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">{currentDevice.name}</span>
                                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30">
                                  {getDeviceTypeLabel(currentDevice.type)}
                                </Badge>
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">{currentDevice.model}</div>
                            </div>
                          </div>
                          <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30 text-foreground">
                            {getSlotLabel(currentDevice)}
                          </Badge>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-primary/10 bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                    這個機櫃目前沒有設備資料。
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(222_31%_15%),hsl(223_28%_12%))]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl tracking-[-0.03em]">設備定位</CardTitle>
              {selectedDevice ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30">
                    {getDeviceTypeLabel(selectedDevice.type)}
                  </Badge>
                  <Badge variant="outline" className={cn("rounded-full", getDeviceTone(selectedDevice.health))}>
                    {getDeviceHealthLabel(selectedDevice.health)}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedDevice ? (
              <>
                <div className="rounded-[24px] border border-primary/15 bg-background/35 p-4">
                  <div className="text-2xl font-semibold tracking-tight text-foreground">{selectedDevice.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selectedRack.cabinet} / {getSlotLabel(selectedDevice)} / {selectedDevice.model}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Asset Tag</div>
                      <div className="mt-2 text-sm font-medium text-foreground">{selectedDevice.assetTag}</div>
                    </div>
                    <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Serial</div>
                      <div className="mt-2 text-sm font-medium text-foreground">{selectedDevice.serial}</div>
                    </div>
                    <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">BMC</div>
                      <div className="mt-2 text-sm font-medium text-foreground">{selectedDevice.bmc}</div>
                    </div>
                    <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Redfish</div>
                      <div className="mt-2 text-sm font-medium text-foreground">{selectedDevice.redfish}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-primary/15 bg-background/35 p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <Cable className="h-4 w-4 text-primary" />
                      <span className="font-medium">設備連線 / 角色</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>Role / {selectedDevice.role}</div>
                      <div>Network / {selectedDevice.network}</div>
                      <div>Power / {selectedDevice.powerFeed}</div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-primary/15 bg-background/35 p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <Gauge className="h-4 w-4 text-primary" />
                      <span className="font-medium">現場定位資訊</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>Site / {selectedSite.label}</div>
                      <div>Rack / {selectedRack.cabinet}</div>
                      <div>Coordinate / {selectedRack.coordinates}</div>
                      <div>U 位 / {getSlotLabel(selectedDevice)}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[22px] border border-primary/15 bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                請先選擇一台設備。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.03em]">部署與維護</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Server className="h-4 w-4 text-primary" />
                <span className="font-medium">部署步驟</span>
              </div>
              {selectedRack.deploymentSteps.map((step) => (
                <div key={step.id} className={cn("rounded-[20px] border px-4 py-3 text-sm", getStepTone(step.status))}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{step.title}</span>
                    <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                      {getStepLabel(step.status)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Owner / {step.owner}</div>
                </div>
              ))}
            </div>

            <Separator className="bg-primary/10" />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="font-medium">維護紀錄</span>
              </div>
              {selectedRack.maintenance.length ? (
                selectedRack.maintenance.map((record) => (
                  <div key={record.id} className={cn("rounded-[20px] border px-4 py-3", getMaintenanceTone(record.status))}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{record.title}</div>
                      <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                        {getMaintenanceLabel(record.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {record.owner} / {record.updatedAt}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{record.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-primary/10 bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                  目前沒有維護紀錄。
                </div>
              )}
            </div>

            <Separator className="bg-primary/10" />

            <div className="rounded-[22px] border border-cyan-300/10 bg-cyan-400/5 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Bot className="h-4 w-4 text-cyan-200" />
                <span className="font-medium">後續擴充方向</span>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <div>支援 STEP / STP 機櫃與 Tray 模型的標準化匯入。</div>
                <div>加入設備搜尋、序號定位、BMC / Redfish 快速跳轉。</div>
                <div>串接部署 SOP、維修紀錄與現場照片，形成完整維運履歷。</div>
                <div>延伸整合 BMC / Redfish / 設備狀態 API，建立真正的 Data Center Digital Twin。</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
