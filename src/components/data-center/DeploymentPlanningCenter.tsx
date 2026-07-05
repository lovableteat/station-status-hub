import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Blocks,
  Bot,
  Cable,
  CheckCircle2,
  Cpu,
  Gauge,
  HardDrive,
  LucideIcon,
  MapPinned,
  Network,
  Search,
  Server,
  ShieldCheck,
  Siren,
  Wrench,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { DataCenter3DPlanner } from "./DataCenter3DPlanner";
import type {
  DeploymentStepStatus,
  MaintenanceStatus,
  RackDevice,
  RackDeviceHealth,
  RackDeviceType,
  RackPlan,
  RackStatus,
  SitePlan,
} from "./dataCenterTypes";

function makeDevice(device: RackDevice): RackDevice {
  return device;
}

function makeRack(rack: RackPlan): RackPlan {
  return rack;
}

const initialSitePlans: SitePlan[] = [
  {
    id: "frankfurt-dc1",
    label: "Frankfurt DC-1",
    country: "Germany",
    phase: "Deployment staging",
    targetDate: "2026-09",
    powerBudgetKw: 84,
    coolingBudgetKw: 76,
    networkReady: "Dual 100G uplink / MPLS handoff reserved",
    siteManager: "NOC Germany",
    checklist: [
      { id: "permit", label: "海外防火區隔與承重審核完成", done: true },
      { id: "power", label: "三相電與 A/B PDU 路徑確認", done: true },
      { id: "aisle", label: "冷熱通道與維修抽拉距離驗證", done: false },
      { id: "carrier", label: "跨國 MPLS 與 cross-connect 排程", done: false },
    ],
    racks: [
      makeRack({
        id: "fra-a01",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A01",
        status: "allocated",
        powerKw: 18,
        coolingKw: 15,
        uplinks: 4,
        owner: "GB300 Batch-1",
        positionX: -3.1,
        positionZ: -2.4,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall A / Row A / Pos 01",
        aisle: "Cold aisle",
        sop: [
          "部署前先確認 TOR uplink 與 BMC 管理網路已標記。",
          "抽換 Compute Tray 前先鎖定對應 PSU feed 與 KVM 視窗。",
          "故障排除完成後同步維修紀錄與 Redfish health snapshot。",
        ],
        deploymentSteps: [
          { id: "fra-a01-step1", title: "機櫃定位與固定", owner: "Facility", status: "done" },
          { id: "fra-a01-step2", title: "A/B 電源與 PDU 標定", owner: "Power Team", status: "done" },
          { id: "fra-a01-step3", title: "TOR / 管理交換器上架", owner: "Network", status: "active" },
          { id: "fra-a01-step4", title: "Compute Tray 與 PSU 對位", owner: "Compute", status: "pending" },
          { id: "fra-a01-step5", title: "BMC / Redfish 驗證", owner: "Platform", status: "pending" },
        ],
        maintenance: [
          {
            id: "fra-a01-m1",
            title: "Non-PVL Tray 抽換確認",
            owner: "Victor",
            status: "in-progress",
            updatedAt: "2026/07/05 09:20",
            detail: "CT-02 偵測到記憶體錯誤，已排入本週維修窗口。",
          },
          {
            id: "fra-a01-m2",
            title: "TOR 韌體基線校正",
            owner: "Network",
            status: "open",
            updatedAt: "2026/07/04 18:10",
            detail: "上線前需統一到 10.6.4 韌體版本。",
          },
        ],
        devices: [
          makeDevice({
            id: "fra-a01-tor1",
            name: "TOR Switch A01",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-FRA-A01-01",
            assetTag: "NW-TOR-0001",
            model: "Mellanox SN4700",
            role: "ToR / spine uplink",
            network: "4x100G / fabric-a",
            powerFeed: "PDU-A / PDU-B",
            bmc: "net-a01-tor",
            redfish: "Enabled",
            note: "負責上聯 spine 與 OOB 管理流量隔離。",
          }),
          makeDevice({
            id: "fra-a01-sw1",
            name: "Switch Tray A01",
            type: "switch-tray",
            health: "healthy",
            slotStart: 37,
            slotSpan: 2,
            serial: "SWT-FRA-A01-01",
            assetTag: "NW-SWT-0031",
            model: "Switch Tray Rev.C",
            role: "Leaf fanout",
            network: "24x25G / tray backplane",
            powerFeed: "PDU-A",
            bmc: "switch-a01-1",
            redfish: "Enabled",
            note: "對應本櫃 Compute Tray 1-2 的下聯扇出。",
          }),
          makeDevice({
            id: "fra-a01-mgmt1",
            name: "Management Switch",
            type: "management",
            health: "healthy",
            slotStart: 35,
            slotSpan: 1,
            serial: "MGMT-FRA-A01-01",
            assetTag: "MGMT-4412",
            model: "OOB Switch 48P",
            role: "BMC / KVM / serial",
            network: "1G OOB",
            powerFeed: "PDU-B",
            bmc: "mgmt-a01",
            redfish: "N/A",
            note: "集中收斂 BMC、KVM 與維修筆電接入。",
          }),
          makeDevice({
            id: "fra-a01-ct1",
            name: "Compute Tray CT-01",
            type: "compute-tray",
            health: "healthy",
            slotStart: 28,
            slotSpan: 4,
            serial: "CT-FRA-A01-01",
            assetTag: "CMP-8801",
            model: "GB300 Compute Tray",
            role: "GPU node group 01",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-a01-01-bmc",
            redfish: "Enabled",
            note: "實體標籤位於左前方拉把內側。",
          }),
          makeDevice({
            id: "fra-a01-ct2",
            name: "Compute Tray CT-02",
            type: "compute-tray",
            health: "warning",
            slotStart: 23,
            slotSpan: 4,
            serial: "CT-FRA-A01-02",
            assetTag: "CMP-8802",
            model: "GB300 Compute Tray",
            role: "GPU node group 02",
            network: "2x100G + BMC",
            powerFeed: "PDU-A / PDU-B",
            bmc: "ct-a01-02-bmc",
            redfish: "Enabled",
            note: "近期有 ECC warning，維修窗口已開立。",
          }),
          makeDevice({
            id: "fra-a01-st1",
            name: "Storage Tray ST-01",
            type: "storage-tray",
            health: "healthy",
            slotStart: 15,
            slotSpan: 3,
            serial: "ST-FRA-A01-01",
            assetTag: "STR-2201",
            model: "NVMe Storage Tray",
            role: "log / image cache",
            network: "2x25G",
            powerFeed: "PDU-A",
            bmc: "st-a01-01-bmc",
            redfish: "Enabled",
            note: "保存部署映像與維修診斷檔。",
          }),
          makeDevice({
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
            bmc: "rack-a01-power-a",
            redfish: "Enabled",
            note: "A feed 需與上方 CT 對應貼標一致。",
          }),
          makeDevice({
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
            bmc: "rack-a01-power-b",
            redfish: "Enabled",
            note: "更換前需先確認負載已切換。",
          }),
        ],
      }),
      makeRack({
        id: "fra-a02",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A02",
        status: "reserved",
        powerKw: 16,
        coolingKw: 13,
        uplinks: 4,
        owner: "GB300 Batch-2",
        positionX: -1.4,
        positionZ: -2.4,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall A / Row A / Pos 02",
        aisle: "Cold aisle",
        sop: [
          "先完成 TOR / Mgmt Tray 佈線，再推入 Compute Tray。",
          "所有 Tray 編號需和實際拉把貼標一致。",
        ],
        deploymentSteps: [
          { id: "fra-a02-step1", title: "機櫃定位與固定", owner: "Facility", status: "done" },
          { id: "fra-a02-step2", title: "PDU 與電纜橋架", owner: "Power Team", status: "active" },
          { id: "fra-a02-step3", title: "Compute Tray 上架", owner: "Compute", status: "pending" },
          { id: "fra-a02-step4", title: "BMC 燒錄與 inventory 匯入", owner: "Platform", status: "pending" },
        ],
        maintenance: [
          {
            id: "fra-a02-m1",
            title: "預佈線複核",
            owner: "Field Engineer",
            status: "open",
            updatedAt: "2026/07/05 08:00",
            detail: "等 PDU 最終編碼後再確認 A/B 路徑。",
          },
        ],
        devices: [
          makeDevice({
            id: "fra-a02-tor1",
            name: "TOR Switch A02",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-FRA-A02-01",
            assetTag: "NW-TOR-0002",
            model: "Mellanox SN4700",
            role: "ToR / spine uplink",
            network: "4x100G / fabric-b",
            powerFeed: "PDU-A / PDU-B",
            bmc: "net-a02-tor",
            redfish: "Enabled",
            note: "已上架待 uplink 開通。",
          }),
          makeDevice({
            id: "fra-a02-ct1",
            name: "Compute Tray CT-03",
            type: "compute-tray",
            health: "offline",
            slotStart: 27,
            slotSpan: 4,
            serial: "CT-FRA-A02-03",
            assetTag: "CMP-8803",
            model: "GB300 Compute Tray",
            role: "GPU node group 03",
            network: "Reserved",
            powerFeed: "Pending",
            bmc: "Not provisioned",
            redfish: "Pending",
            note: "尚未入櫃，保留空間供本週部署。",
          }),
          makeDevice({
            id: "fra-a02-ct2",
            name: "Compute Tray CT-04",
            type: "compute-tray",
            health: "offline",
            slotStart: 22,
            slotSpan: 4,
            serial: "CT-FRA-A02-04",
            assetTag: "CMP-8804",
            model: "GB300 Compute Tray",
            role: "GPU node group 04",
            network: "Reserved",
            powerFeed: "Pending",
            bmc: "Not provisioned",
            redfish: "Pending",
            note: "等待機房通道清空後入櫃。",
          }),
          makeDevice({
            id: "fra-a02-psu-a",
            name: "PSU Feed A",
            type: "psu",
            health: "healthy",
            slotStart: 4,
            slotSpan: 2,
            serial: "PSU-FRA-A02-A",
            assetTag: "PWR-1201",
            model: "3.2kW PSU",
            role: "Power path A",
            network: "N/A",
            powerFeed: "PDU-A",
            bmc: "rack-a02-power-a",
            redfish: "Enabled",
            note: "A 路配線已完成。",
          }),
          makeDevice({
            id: "fra-a02-psu-b",
            name: "PSU Feed B",
            type: "psu",
            health: "warning",
            slotStart: 1,
            slotSpan: 2,
            serial: "PSU-FRA-A02-B",
            assetTag: "PWR-1202",
            model: "3.2kW PSU",
            role: "Power path B",
            network: "N/A",
            powerFeed: "PDU-B",
            bmc: "rack-a02-power-b",
            redfish: "Enabled",
            note: "B feed 線槽等待現場複核。",
          }),
        ],
      }),
      makeRack({
        id: "fra-b01",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B01",
        status: "available",
        powerKw: 8,
        coolingKw: 7,
        uplinks: 2,
        owner: "Standby / Service",
        positionX: -3.1,
        positionZ: 0.2,
        rotation: 90,
        capacityU: 42,
        coordinates: "Hall A / Row B / Pos 01",
        aisle: "Service aisle",
        sop: [
          "做為備援櫃時，先記錄空櫃照片與 PDU 空載讀值。",
          "維修櫃不得混放未標記 Tray。",
        ],
        deploymentSteps: [
          { id: "fra-b01-step1", title: "空櫃清點", owner: "Field Engineer", status: "done" },
          { id: "fra-b01-step2", title: "維修備品上架", owner: "Service Team", status: "active" },
        ],
        maintenance: [
          {
            id: "fra-b01-m1",
            title: "備援櫃點交",
            owner: "Service Team",
            status: "done",
            updatedAt: "2026/07/03 16:30",
            detail: "已完成空櫃盤點與備品標記。",
          },
        ],
        devices: [
          makeDevice({
            id: "fra-b01-sw1",
            name: "Management Switch",
            type: "management",
            health: "healthy",
            slotStart: 38,
            slotSpan: 1,
            serial: "MGMT-FRA-B01-01",
            assetTag: "MGMT-8821",
            model: "OOB Switch 24P",
            role: "維修與備援 OOB",
            network: "1G OOB",
            powerFeed: "PDU-A",
            bmc: "mgmt-b01",
            redfish: "N/A",
            note: "供臨時維修 Tray 接入 BMC 使用。",
          }),
          makeDevice({
            id: "fra-b01-st1",
            name: "Storage Tray ST-02",
            type: "storage-tray",
            health: "healthy",
            slotStart: 20,
            slotSpan: 3,
            serial: "ST-FRA-B01-02",
            assetTag: "STR-2202",
            model: "NVMe Storage Tray",
            role: "備援 image / logs",
            network: "2x25G",
            powerFeed: "PDU-A",
            bmc: "st-b01-02-bmc",
            redfish: "Enabled",
            note: "維修資料暫存與映像回灌。",
          }),
          makeDevice({
            id: "fra-b01-psu-a",
            name: "PSU Feed A",
            type: "psu",
            health: "healthy",
            slotStart: 4,
            slotSpan: 2,
            serial: "PSU-FRA-B01-A",
            assetTag: "PWR-1301",
            model: "3.2kW PSU",
            role: "Power path A",
            network: "N/A",
            powerFeed: "PDU-A",
            bmc: "rack-b01-power-a",
            redfish: "Enabled",
            note: "可直接供維修 Tray 使用。",
          }),
          makeDevice({
            id: "fra-b01-psu-b",
            name: "PSU Feed B",
            type: "psu",
            health: "healthy",
            slotStart: 1,
            slotSpan: 2,
            serial: "PSU-FRA-B01-B",
            assetTag: "PWR-1302",
            model: "3.2kW PSU",
            role: "Power path B",
            network: "N/A",
            powerFeed: "PDU-B",
            bmc: "rack-b01-power-b",
            redfish: "Enabled",
            note: "雙路供電正常。",
          }),
        ],
      }),
      makeRack({
        id: "fra-c01",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C01",
        status: "blocked",
        powerKw: 0,
        coolingKw: 0,
        uplinks: 0,
        owner: "Awaiting HVAC clearance",
        positionX: -1.4,
        positionZ: 2.8,
        rotation: 180,
        capacityU: 42,
        coordinates: "Hall A / Row C / Pos 01",
        aisle: "Hot aisle",
        sop: [
          "未解除阻擋前不可排入硬體部署。",
          "現場溫度與抽風路徑驗證完成後再開櫃。",
        ],
        deploymentSteps: [
          { id: "fra-c01-step1", title: "HVAC clearance", owner: "Facility", status: "active" },
          { id: "fra-c01-step2", title: "地板承重複驗", owner: "Facility", status: "pending" },
        ],
        maintenance: [
          {
            id: "fra-c01-m1",
            title: "冷卻路徑驗證",
            owner: "Facility",
            status: "in-progress",
            updatedAt: "2026/07/05 10:05",
            detail: "目前抽風不達標，維持 blocked 狀態。",
          },
        ],
        devices: [
          makeDevice({
            id: "fra-c01-psu-a",
            name: "PSU Feed A",
            type: "psu",
            health: "offline",
            slotStart: 4,
            slotSpan: 2,
            serial: "PSU-FRA-C01-A",
            assetTag: "PWR-1401",
            model: "3.2kW PSU",
            role: "Power path A",
            network: "N/A",
            powerFeed: "Pending",
            bmc: "Not ready",
            redfish: "Pending",
            note: "尚未送電。",
          }),
        ],
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
      { id: "power", label: "A/B feed 與 breaker map 完成", done: true },
      { id: "network", label: "TOR / OOB / spine uplink 上線", done: true },
      { id: "runbook", label: "維修 SOP 與疏散動線複核", done: true },
      { id: "spares", label: "備品與替換 Tray 緩衝區規劃", done: false },
    ],
    racks: [
      makeRack({
        id: "phx-a01",
        zone: "Zone D",
        row: "D",
        cabinet: "CAB-D11",
        status: "allocated",
        powerKw: 20,
        coolingKw: 17,
        uplinks: 4,
        owner: "Inference / Serving",
        positionX: -2.7,
        positionZ: -1.8,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall B / Row D / Pos 11",
        aisle: "Cold aisle",
        sop: [
          "Serving 機櫃每次變更都要更新資產與 BMC inventory。",
          "TOR / Compute Tray 變更後立即跑 Redfish 健康檢查。",
        ],
        deploymentSteps: [
          { id: "phx-a01-step1", title: "Pilot rack live", owner: "Platform", status: "done" },
          { id: "phx-a01-step2", title: "BMC inventory sync", owner: "Platform", status: "active" },
        ],
        maintenance: [
          {
            id: "phx-a01-m1",
            title: "風扇 tray 預警",
            owner: "Service Team",
            status: "open",
            updatedAt: "2026/07/05 07:48",
            detail: "Switch Tray 偵測 fan RPM 偏低，排入夜間窗口。",
          },
        ],
        devices: [
          makeDevice({
            id: "phx-a01-tor",
            name: "TOR Switch D11",
            type: "tor-switch",
            health: "healthy",
            slotStart: 40,
            slotSpan: 2,
            serial: "TOR-PHX-D11-01",
            assetTag: "NW-TOR-0101",
            model: "Mellanox SN5600",
            role: "Leaf / uplink",
            network: "8x100G / serving",
            powerFeed: "PDU-A / PDU-B",
            bmc: "tor-d11",
            redfish: "Enabled",
            note: "目前 serving 網路主用 ToR。",
          }),
          makeDevice({
            id: "phx-a01-ct1",
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
            note: "對應機台群 serving-pool-a。",
          }),
          makeDevice({
            id: "phx-a01-ct2",
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
            note: "GPU 溫度異常，現場需快速定位抽換。",
          }),
          makeDevice({
            id: "phx-a01-psu-a",
            name: "PSU Feed A",
            type: "psu",
            health: "healthy",
            slotStart: 4,
            slotSpan: 2,
            serial: "PSU-PHX-D11-A",
            assetTag: "PWR-2101",
            model: "3.6kW PSU",
            role: "Power path A",
            network: "N/A",
            powerFeed: "PDU-A",
            bmc: "rack-d11-power-a",
            redfish: "Enabled",
            note: "正常。",
          }),
          makeDevice({
            id: "phx-a01-psu-b",
            name: "PSU Feed B",
            type: "psu",
            health: "healthy",
            slotStart: 1,
            slotSpan: 2,
            serial: "PSU-PHX-D11-B",
            assetTag: "PWR-2102",
            model: "3.6kW PSU",
            role: "Power path B",
            network: "N/A",
            powerFeed: "PDU-B",
            bmc: "rack-d11-power-b",
            redfish: "Enabled",
            note: "正常。",
          }),
        ],
      }),
      makeRack({
        id: "phx-a02",
        zone: "Zone D",
        row: "D",
        cabinet: "CAB-D12",
        status: "available",
        powerKw: 10,
        coolingKw: 8,
        uplinks: 2,
        owner: "Hot spare",
        positionX: -0.8,
        positionZ: -1.8,
        rotation: 0,
        capacityU: 42,
        coordinates: "Hall B / Row D / Pos 12",
        aisle: "Cold aisle",
        sop: ["備援櫃只保留可快速抽換模組，不做長期混放。"],
        deploymentSteps: [{ id: "phx-a02-step1", title: "Spare rack ready", owner: "Infra Ops", status: "done" }],
        maintenance: [],
        devices: [
          makeDevice({
            id: "phx-a02-mgmt",
            name: "Management Switch",
            type: "management",
            health: "healthy",
            slotStart: 38,
            slotSpan: 1,
            serial: "MGMT-PHX-D12-01",
            assetTag: "MGMT-9011",
            model: "OOB Switch 24P",
            role: "OOB staging",
            network: "1G OOB",
            powerFeed: "PDU-A",
            bmc: "mgmt-d12",
            redfish: "N/A",
            note: "提供備援 Tray 上線前驗證。",
          }),
        ],
      }),
    ],
  },
];

function getRackStatusLabel(status: RackStatus) {
  switch (status) {
    case "allocated":
      return "已部署";
    case "reserved":
      return "已預留";
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
      return "管理交換器";
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
      return "未上線";
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
      return "完成";
    case "active":
      return "進行中";
    case "pending":
      return "待執行";
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
      return "待處理";
    default:
      return status;
  }
}

function getSlotLabel(device: RackDevice) {
  const slotEnd = device.slotStart + device.slotSpan - 1;
  return device.slotSpan === 1
    ? `U${device.slotStart}`
    : `U${device.slotStart}-U${slotEnd}`;
}

function getSiteReadiness(checklist: SitePlan["checklist"]) {
  if (!checklist.length) {
    return 0;
  }

  const doneCount = checklist.filter((item) => item.done).length;
  return Math.round((doneCount / checklist.length) * 100);
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
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
  const [selectedSiteId, setSelectedSiteId] = useState(initialSitePlans[0].id);
  const [selectedRackId, setSelectedRackId] = useState(initialSitePlans[0].racks[0].id);
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialSitePlans[0].racks[0].devices[0]?.id ?? "");
  const [searchTerm, setSearchTerm] = useState("");

  const selectedSite = useMemo(
    () => initialSitePlans.find((site) => site.id === selectedSiteId) ?? initialSitePlans[0],
    [selectedSiteId]
  );

  useEffect(() => {
    const nextRack = selectedSite.racks.find((rack) => rack.id === selectedRackId);
    if (!nextRack) {
      setSelectedRackId(selectedSite.racks[0]?.id ?? "");
    }
  }, [selectedRackId, selectedSite]);

  const selectedRack = useMemo(
    () => selectedSite.racks.find((rack) => rack.id === selectedRackId) ?? selectedSite.racks[0],
    [selectedRackId, selectedSite]
  );

  useEffect(() => {
    const hasSelectedDevice = selectedRack.devices.some((device) => device.id === selectedDeviceId);
    if (!hasSelectedDevice) {
      setSelectedDeviceId(selectedRack.devices[0]?.id ?? "");
    }
  }, [selectedDeviceId, selectedRack]);

  const selectedDevice = useMemo(
    () => selectedRack.devices.find((device) => device.id === selectedDeviceId) ?? selectedRack.devices[0],
    [selectedDeviceId, selectedRack]
  );

  const readinessPercent = useMemo(
    () => getSiteReadiness(selectedSite.checklist),
    [selectedSite.checklist]
  );

  const totalDevices = useMemo(
    () => selectedSite.racks.reduce((sum, rack) => sum + rack.devices.length, 0),
    [selectedSite.racks]
  );

  const activeAlerts = useMemo(
    () =>
      selectedSite.racks.flatMap((rack) => rack.devices).filter((device) => device.health !== "healthy")
        .length,
    [selectedSite.racks]
  );

  const plannedPower = useMemo(
    () => selectedSite.racks.reduce((sum, rack) => sum + rack.powerKw, 0),
    [selectedSite.racks]
  );

  const searchResults = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    if (!keyword) {
      return [];
    }

    return selectedSite.racks.flatMap((rack) => {
      const rackMatch =
        rack.cabinet.toLowerCase().includes(keyword) ||
        rack.owner.toLowerCase().includes(keyword) ||
        rack.coordinates.toLowerCase().includes(keyword);

      const deviceMatches = rack.devices.filter((device) =>
        [
          device.name,
          device.serial,
          device.assetTag,
          device.model,
          device.role,
          device.bmc,
          device.redfish,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );

      return [
        ...(rackMatch
          ? [
              {
                id: `rack-${rack.id}`,
                kind: "rack" as const,
                rackId: rack.id,
                deviceId: undefined,
                title: rack.cabinet,
                subtitle: `${rack.zone} / Row ${rack.row} / ${rack.owner}`,
                detail: rack.coordinates,
              },
            ]
          : []),
        ...deviceMatches.map((device) => ({
          id: `device-${device.id}`,
          kind: "device" as const,
          rackId: rack.id,
          deviceId: device.id,
          title: device.name,
          subtitle: `${rack.cabinet} / ${getSlotLabel(device)} / ${getDeviceTypeLabel(device.type)}`,
          detail: `${device.assetTag} / ${device.serial}`,
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

  const deployedRacks = selectedSite.racks.filter((rack) => rack.status === "allocated").length;
  const blockedRacks = selectedSite.racks.filter((rack) => rack.status === "blocked").length;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(135deg,hsl(223_28%_16%),hsl(223_24%_12%)_48%,hsl(215_44%_16%)_100%)] shadow-[0_30px_90px_-52px_hsl(var(--primary)/0.9)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <Badge className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-primary shadow-none">
                3D Digital Twin
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
                  Data-center
                </h1>
                <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                  選擇機櫃後，直接定位實體 Cabinet、Compute Tray、Switch Tray、PSU、TOR 與管理網路位置。
                  工程師可在同一頁完成部署定位、設備辨識、維修追蹤、SOP 查閱與 BMC / Redfish 對照。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-emerald-300/25 bg-emerald-400/10 text-emerald-100">
                  {deployedRacks} 櫃已部署
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/40">
                  {totalDevices} 筆硬體數位化
                </Badge>
                <Badge variant="outline" className="rounded-full border-amber-300/25 bg-amber-400/10 text-amber-100">
                  {activeAlerts} 筆待關注設備
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/40">
                  Site manager · {selectedSite.siteManager}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:min-w-[560px]">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">
                  Site
                </div>
                <Select
                  value={selectedSiteId}
                  onValueChange={(value) => {
                    setSelectedSiteId(value);
                    const nextSite = initialSitePlans.find((site) => site.id === value);
                    const nextRack = nextSite?.racks[0];
                    setSelectedRackId(nextRack?.id ?? "");
                    setSelectedDeviceId(nextRack?.devices[0]?.id ?? "");
                    setSearchTerm("");
                  }}
                >
                  <SelectTrigger className="h-12 rounded-2xl border-primary/15 bg-background/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {initialSitePlans.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">
                  Search
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜尋 Cabinet / Tray / Serial / Asset Tag / BMC"
                    className="h-12 rounded-2xl border-primary/15 bg-background/30 pl-10"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard
          icon={MapPinned}
          label="Target Site"
          value={selectedSite.label}
          detail={`${selectedSite.country} · ${selectedSite.phase} · ETA ${selectedSite.targetDate}`}
        />
        <SummaryCard
          icon={Server}
          label="Rack / Device"
          value={`${selectedSite.racks.length} 櫃 / ${totalDevices} 裝置`}
          detail={`已部署 ${deployedRacks} 櫃，阻塞 ${blockedRacks} 櫃`}
        />
        <SummaryCard
          icon={Zap}
          label="Power / Cooling"
          value={`${plannedPower} kW`}
          detail={`Power budget ${selectedSite.powerBudgetKw} kW · Cooling budget ${selectedSite.coolingBudgetKw} kW`}
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Readiness"
          value={`${readinessPercent}%`}
          detail={selectedSite.networkReady}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.48fr_0.82fr]">
        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-[-0.03em]">3D 機櫃數位分身</CardTitle>
                <div className="mt-2 text-sm text-muted-foreground">
                  直接從 3D 視圖點機櫃，對照真實 Row / Zone / 座標與內部硬體層級。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30">
                  Current rack · {selectedRack.cabinet}
                </Badge>
                <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30">
                  {selectedRack.coordinates}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataCenter3DPlanner
              racks={selectedSite.racks}
              selectedRackId={selectedRack.id}
              selectedDeviceId={selectedDevice?.id}
              onSelectRack={(rackId) => {
                const nextRack = selectedSite.racks.find((rack) => rack.id === rackId);
                setSelectedRackId(rackId);
                setSelectedDeviceId(nextRack?.devices[0]?.id ?? "");
              }}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {selectedSite.racks.map((rack) => {
                const isActive = rack.id === selectedRack.id;
                return (
                  <button
                    key={rack.id}
                    type="button"
                    onClick={() => {
                      setSelectedRackId(rack.id);
                      setSelectedDeviceId(rack.devices[0]?.id ?? "");
                    }}
                    className={cn(
                      "rounded-[22px] border px-4 py-4 text-left transition-all",
                      getRackStatusTone(rack.status),
                      isActive && "ring-1 ring-primary/60 shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.9)]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold text-foreground">{rack.cabinet}</div>
                      <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                        {getRackStatusLabel(rack.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {rack.zone} · Row {rack.row} · {rack.owner}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Power {rack.powerKw} kW</div>
                      <div>{rack.devices.length} devices</div>
                      <div>{rack.aisle}</div>
                      <div>{rack.uplinks} uplinks</div>
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
              <CardTitle className="text-xl tracking-[-0.03em]">選取中的機櫃</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("rounded-[22px] border p-4", getRackStatusTone(selectedRack.status))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight text-foreground">
                      {selectedRack.cabinet}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedRack.zone} · Row {selectedRack.row} · {selectedRack.coordinates}
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                    {getRackStatusLabel(selectedRack.status)}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Deployment owner</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{selectedRack.owner}</div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Aisle / Orientation</div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {selectedRack.aisle} · {selectedRack.rotation}°
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Power / Cooling</div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      {selectedRack.powerKw} kW · {selectedRack.coolingKw} kW
                    </div>
                  </div>
                  <div className="rounded-2xl border border-primary/10 bg-background/35 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">3D Coordinates</div>
                    <div className="mt-2 text-sm font-medium text-foreground">
                      X {selectedRack.positionX.toFixed(1)} · Z {selectedRack.positionZ.toFixed(1)}
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

              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">現場檢核</div>
                {selectedSite.checklist.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-sm",
                      item.done
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-50"
                        : "border-amber-300/20 bg-amber-400/10 text-amber-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {item.done ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <span>{item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(222_30%_15%),hsl(223_28%_12%))]">
            <CardHeader>
              <CardTitle className="text-xl tracking-[-0.03em]">搜尋與快速定位</CardTitle>
            </CardHeader>
            <CardContent>
              {searchTerm.trim() ? (
                searchResults.length ? (
                  <ScrollArea className="h-[340px] pr-3">
                    <div className="space-y-3">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            setSelectedRackId(result.rackId);
                            if (result.deviceId) {
                              setSelectedDeviceId(result.deviceId);
                            }
                          }}
                          className="w-full rounded-[20px] border border-primary/10 bg-background/35 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-background/55"
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
                    沒有找到符合關鍵字的機櫃或設備，請改搜 Cabinet、Tray 編號、Asset Tag、Serial 或 BMC 名稱。
                  </div>
                )
              ) : (
                <div className="rounded-[22px] border border-primary/10 bg-background/35 px-4 py-5">
                  <div className="text-sm font-medium text-foreground">可直接搜尋</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["CAB-A01", "CT-02", "TOR", "PWR-1102", "ct-d11-12-bmc"].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setSearchTerm(example)}
                        className="rounded-full border border-primary/15 bg-background/35 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1fr_0.88fr]">
        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.03em]">Rack Front / U 位對照</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] pr-3">
              <div className="space-y-3">
                {sortedDevices.map((device) => {
                  const Icon = getDeviceTypeIcon(device.type);
                  const isActive = device.id === selectedDevice?.id;

                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={cn(
                        "w-full rounded-[22px] border px-4 py-4 text-left transition-all",
                        getDeviceTone(device.health),
                        isActive && "ring-1 ring-primary/60 shadow-[0_18px_38px_-28px_hsl(var(--primary)/0.9)]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-background/35 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{device.name}</span>
                              <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30">
                                {getDeviceTypeLabel(device.type)}
                              </Badge>
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">{device.model}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-full border-primary/15 bg-background/30 text-foreground">
                          {getSlotLabel(device)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>Asset · {device.assetTag}</div>
                        <div>Serial · {device.serial}</div>
                        <div>Network · {device.network}</div>
                        <div>Power · {device.powerFeed}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(222_31%_15%),hsl(223_28%_12%))]">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl tracking-[-0.03em]">裝置詳情</CardTitle>
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
                    {selectedRack.cabinet} · {getSlotLabel(selectedDevice)} · {selectedDevice.model}
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
                      <span className="font-medium">連線與供電</span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>Role · {selectedDevice.role}</div>
                      <div>Network · {selectedDevice.network}</div>
                      <div>Power feed · {selectedDevice.powerFeed}</div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-primary/15 bg-background/35 p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="font-medium">定位提示</span>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-muted-foreground">
                      {selectedDevice.note}
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-primary/15 bg-background/35 p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Gauge className="h-4 w-4 text-primary" />
                    <span className="font-medium">現場對照</span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                    <div>機櫃 · {selectedRack.cabinet}</div>
                    <div>座標 · {selectedRack.coordinates}</div>
                    <div>Zone / Row · {selectedRack.zone} / {selectedRack.row}</div>
                    <div>U 位 · {getSlotLabel(selectedDevice)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-[22px] border border-primary/15 bg-background/35 px-4 py-5 text-sm text-muted-foreground">
                目前沒有裝置資料。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_28%_15%),hsl(223_28%_12%))]">
          <CardHeader>
            <CardTitle className="text-xl tracking-[-0.03em]">部署 / 維修 / SOP</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Blocks className="h-4 w-4 text-primary" />
                <span className="font-medium">部署流程</span>
              </div>
              {selectedRack.deploymentSteps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-[20px] border px-4 py-3 text-sm",
                    getStepTone(step.status)
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{step.title}</span>
                    <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                      {getStepLabel(step.status)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Owner · {step.owner}</div>
                </div>
              ))}
            </div>

            <Separator className="bg-primary/10" />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="font-medium">維修紀錄</span>
              </div>
              {selectedRack.maintenance.length ? (
                selectedRack.maintenance.map((record) => (
                  <div
                    key={record.id}
                    className={cn(
                      "rounded-[20px] border px-4 py-3",
                      getMaintenanceTone(record.status)
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{record.title}</div>
                      <Badge variant="outline" className="rounded-full border-current/25 bg-background/20">
                        {getMaintenanceLabel(record.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {record.owner} · {record.updatedAt}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">{record.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-primary/10 bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                  目前沒有維修事件，這一櫃可直接安排新部署。
                </div>
              )}
            </div>

            <Separator className="bg-primary/10" />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Siren className="h-4 w-4 text-primary" />
                <span className="font-medium">現場 SOP</span>
              </div>
              {selectedRack.sop.map((line, index) => (
                <div
                  key={`${selectedRack.id}-sop-${index}`}
                  className="rounded-[18px] border border-primary/10 bg-background/35 px-4 py-3 text-sm leading-6 text-muted-foreground"
                >
                  {line}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
