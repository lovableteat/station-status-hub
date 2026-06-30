import { useMemo, useState } from "react";
import {
  Box,
  Boxes,
  Building2,
  ClipboardCheck,
  Network,
  RotateCcw,
  Snowflake,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { cn } from "@/lib/utils";

import { DataCenter3DPlanner } from "./DataCenter3DPlanner";
import type { RackPlan, RackStatus, SitePlan } from "./dataCenterTypes";

const initialSitePlans: SitePlan[] = [
  {
    id: "frankfurt-1",
    label: "Frankfurt DC-1",
    country: "Germany",
    phase: "Pre-deployment",
    targetDate: "2026-09",
    powerBudgetKw: 72,
    coolingBudgetKw: 64,
    networkReady: "Dual 100G uplink planned",
    racks: [
      {
        id: "rack-a01",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A01",
        status: "allocated",
        powerKw: 8,
        coolingKw: 7,
        uplinks: 2,
        owner: "GB300 Batch-1",
        positionX: -3.2,
        positionZ: -2.6,
        rotation: 0,
      },
      {
        id: "rack-a02",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A02",
        status: "reserved",
        powerKw: 8,
        coolingKw: 7,
        uplinks: 2,
        owner: "GB300 Batch-2",
        positionX: -1.4,
        positionZ: -2.6,
        rotation: 0,
      },
      {
        id: "rack-b01",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B01",
        status: "available",
        powerKw: 6,
        coolingKw: 5,
        uplinks: 2,
        owner: "Standby",
        positionX: -3.2,
        positionZ: 0,
        rotation: 90,
      },
      {
        id: "rack-b02",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B02",
        status: "blocked",
        powerKw: 0,
        coolingKw: 0,
        uplinks: 0,
        owner: "Awaiting HVAC clearance",
        positionX: -1.4,
        positionZ: 0,
        rotation: 90,
      },
      {
        id: "rack-c01",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C01",
        status: "allocated",
        powerKw: 10,
        coolingKw: 9,
        uplinks: 4,
        owner: "Inference Cluster",
        positionX: -3.2,
        positionZ: 2.8,
        rotation: 180,
      },
      {
        id: "rack-c02",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C02",
        status: "available",
        powerKw: 7,
        coolingKw: 6,
        uplinks: 2,
        owner: "Expansion",
        positionX: -1.4,
        positionZ: 2.8,
        rotation: 180,
      },
    ],
    checklist: [
      { id: "fw", label: "海外防火區隔與承重確認", done: true },
      { id: "power", label: "三相電源與 PDU 迴路鎖定", done: true },
      { id: "cooling", label: "冷通道與排熱路徑驗證", done: false },
      { id: "network", label: "跨國 MPLS 與 uplink 開通排程", done: false },
    ],
  },
  {
    id: "tokyo-1",
    label: "Tokyo DC-1",
    country: "Japan",
    phase: "Rack allocation",
    targetDate: "2026-10",
    powerBudgetKw: 60,
    coolingBudgetKw: 54,
    networkReady: "Single 100G live / secondary pending",
    racks: [
      {
        id: "rack-a03",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A03",
        status: "allocated",
        powerKw: 9,
        coolingKw: 8,
        uplinks: 2,
        owner: "GPU Pod-1",
        positionX: -2.4,
        positionZ: -2.2,
        rotation: 0,
      },
      {
        id: "rack-a04",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A04",
        status: "reserved",
        powerKw: 7,
        coolingKw: 6,
        uplinks: 2,
        owner: "GPU Pod-2",
        positionX: -0.8,
        positionZ: -2.2,
        rotation: 0,
      },
      {
        id: "rack-b03",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B03",
        status: "available",
        powerKw: 6,
        coolingKw: 5,
        uplinks: 2,
        owner: "Standby",
        positionX: -2.4,
        positionZ: 0.4,
        rotation: 90,
      },
      {
        id: "rack-b04",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B04",
        status: "available",
        powerKw: 6,
        coolingKw: 5,
        uplinks: 2,
        owner: "Standby",
        positionX: -0.8,
        positionZ: 0.4,
        rotation: 90,
      },
      {
        id: "rack-c03",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C03",
        status: "blocked",
        powerKw: 0,
        coolingKw: 0,
        uplinks: 0,
        owner: "Earthquake anchor not approved",
        positionX: -1.6,
        positionZ: 3,
        rotation: 180,
      },
    ],
    checklist: [
      { id: "permit", label: "地震固定與施工限制核准", done: false },
      { id: "route", label: "搬運路徑與進出管制確認", done: true },
      { id: "isp", label: "跨區 ISP 備援線路鎖定", done: false },
      { id: "staging", label: "端點暫存與拆箱區安排", done: true },
    ],
  },
  {
    id: "dallas-1",
    label: "Dallas DC-1",
    country: "United States",
    phase: "Facility review",
    targetDate: "2026-11",
    powerBudgetKw: 88,
    coolingBudgetKw: 79,
    networkReady: "Cross-connect in progress",
    racks: [
      {
        id: "rack-a05",
        zone: "Zone A",
        row: "A",
        cabinet: "CAB-A05",
        status: "available",
        powerKw: 8,
        coolingKw: 7,
        uplinks: 4,
        owner: "Unassigned",
        positionX: -3.4,
        positionZ: -2.8,
        rotation: 0,
      },
      {
        id: "rack-b05",
        zone: "Zone B",
        row: "B",
        cabinet: "CAB-B05",
        status: "reserved",
        powerKw: 8,
        coolingKw: 7,
        uplinks: 4,
        owner: "GB300 Batch-3",
        positionX: -1.4,
        positionZ: -0.4,
        rotation: 90,
      },
      {
        id: "rack-c05",
        zone: "Zone C",
        row: "C",
        cabinet: "CAB-C05",
        status: "allocated",
        powerKw: 9,
        coolingKw: 8,
        uplinks: 4,
        owner: "Inference Cluster",
        positionX: -3.4,
        positionZ: 2.4,
        rotation: 180,
      },
      {
        id: "rack-d05",
        zone: "Zone D",
        row: "D",
        cabinet: "CAB-D05",
        status: "blocked",
        powerKw: 0,
        coolingKw: 0,
        uplinks: 0,
        owner: "Raised floor check",
        positionX: -1.2,
        positionZ: 2.4,
        rotation: 180,
      },
    ],
    checklist: [
      { id: "load", label: "Raised floor loading review", done: false },
      { id: "security", label: "Badge / escort process alignment", done: true },
      { id: "carrier", label: "Carrier cross-connect scheduling", done: false },
      { id: "spares", label: "Spare FRU storage allocation", done: true },
    ],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRackTone(status: RackStatus) {
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

function getStatusLabel(status: RackStatus) {
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[24px] border border-primary/15 bg-[linear-gradient(180deg,hsl(223_26%_16%),hsl(224_24%_13%))]">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/75">
            {label}
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DeploymentPlanningCenter() {
  const { systems, stations, testItems } = useUnifiedData();
  const [sitePlans, setSitePlans] = useState(initialSitePlans);
  const [selectedSiteId, setSelectedSiteId] = useState(initialSitePlans[0].id);
  const [selectedRackId, setSelectedRackId] = useState(initialSitePlans[0].racks[0].id);

  const selectedSite = useMemo(
    () => sitePlans.find((site) => site.id === selectedSiteId) ?? sitePlans[0],
    [selectedSiteId, sitePlans]
  );

  const selectedRack = useMemo(
    () =>
      selectedSite.racks.find((rack) => rack.id === selectedRackId) ??
      selectedSite.racks[0],
    [selectedRackId, selectedSite]
  );

  const originalSelectedRack = useMemo(
    () =>
      initialSitePlans
        .find((site) => site.id === selectedSiteId)
        ?.racks.find((rack) => rack.id === selectedRackId),
    [selectedRackId, selectedSiteId]
  );

  const statusCounts = useMemo(
    () => ({
      allocated: selectedSite.racks.filter((rack) => rack.status === "allocated").length,
      reserved: selectedSite.racks.filter((rack) => rack.status === "reserved").length,
      available: selectedSite.racks.filter((rack) => rack.status === "available").length,
      blocked: selectedSite.racks.filter((rack) => rack.status === "blocked").length,
    }),
    [selectedSite]
  );

  const readinessPercent = useMemo(() => {
    const done = selectedSite.checklist.filter((item) => item.done).length;
    return Math.round((done / selectedSite.checklist.length) * 100);
  }, [selectedSite]);

  const plannedPower = selectedSite.racks.reduce((sum, rack) => sum + rack.powerKw, 0);
  const plannedCooling = selectedSite.racks.reduce(
    (sum, rack) => sum + rack.coolingKw,
    0
  );
  const suggestedCabinetCount = Math.max(
    selectedSite.racks.length,
    Math.ceil(systems.length / 12)
  );

  const updateRack = (rackId: string, updates: Partial<RackPlan>) => {
    setSitePlans((prev) =>
      prev.map((site) =>
        site.id === selectedSiteId
          ? {
              ...site,
              racks: site.racks.map((rack) =>
                rack.id === rackId ? { ...rack, ...updates } : rack
              ),
            }
          : site
      )
    );
  };

  const nudgeSelectedRack = (field: "positionX" | "positionZ", delta: number) => {
    updateRack(selectedRackId, {
      [field]: clamp(Number((selectedRack[field] + delta).toFixed(1)), -6, 6),
    } as Partial<RackPlan>);
  };

  const resetSelectedRack = () => {
    if (!originalSelectedRack) {
      return;
    }

    updateRack(selectedRackId, {
      positionX: originalSelectedRack.positionX,
      positionZ: originalSelectedRack.positionZ,
      rotation: originalSelectedRack.rotation,
    });
  };

  const resetSelectedSite = () => {
    const sourceSite = initialSitePlans.find((site) => site.id === selectedSiteId);
    if (!sourceSite) {
      return;
    }

    setSitePlans((prev) =>
      prev.map((site) => (site.id === selectedSiteId ? sourceSite : site))
    );
    setSelectedRackId(sourceSite.racks[0].id);
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-primary/15 bg-[linear-gradient(135deg,hsl(224_28%_16%),hsl(225_22%_12%)_52%,hsl(221_30%_13%)_100%)] p-5 shadow-[0_26px_70px_-48px_hsl(var(--primary)/0.8)] xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
            Data-center
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            提前規劃海外基櫃部署的位置、電力、散熱與網路，並直接在 3D 佈局裡調整櫃位座標與朝向。
          </p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
            Site
          </div>
          <Select
            value={selectedSiteId}
            onValueChange={(value) => {
              setSelectedSiteId(value);
              const nextSite = sitePlans.find((site) => site.id === value);
              if (nextSite?.racks[0]) {
                setSelectedRackId(nextSite.racks[0].id);
              }
            }}
          >
            <SelectTrigger className="h-12 rounded-2xl border-primary/15 bg-background/35 text-base">
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
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard
          icon={Building2}
          label="Target Site"
          value={selectedSite.label}
          detail={`${selectedSite.country} · ${selectedSite.phase} · ETA ${selectedSite.targetDate}`}
        />
        <SummaryCard
          icon={Boxes}
          label="Cabinet Plan"
          value={`${selectedSite.racks.length} racks`}
          detail={`依現有 ${systems.length} 台系統估算，建議至少保留 ${suggestedCabinetCount} 櫃`}
        />
        <SummaryCard
          icon={Zap}
          label="Power Load"
          value={`${plannedPower} kW`}
          detail={`站點預算 ${selectedSite.powerBudgetKw} kW，尚餘 ${selectedSite.powerBudgetKw - plannedPower} kW`}
        />
        <SummaryCard
          icon={Snowflake}
          label="Readiness"
          value={`${readinessPercent}%`}
          detail={`冷卻預算 ${selectedSite.coolingBudgetKw} kW，規劃用量 ${plannedCooling} kW`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr_0.92fr]">
        <Card className="rounded-[28px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Rack Allocation</CardTitle>
              <div className="mt-2 text-sm text-muted-foreground">
                直接管理各區基櫃的預留狀態、用途與部署位置。
              </div>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {statusCounts.allocated} allocated
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSite.racks.map((rack) => {
              const isActive = rack.id === selectedRackId;

              return (
                <button
                  key={rack.id}
                  type="button"
                  onClick={() => setSelectedRackId(rack.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition-all",
                    getRackTone(rack.status),
                    isActive &&
                      "ring-1 ring-primary/60 shadow-[0_18px_38px_-28px_hsl(var(--primary)/0.8)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-foreground">
                        {rack.cabinet}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {rack.zone} · Row {rack.row} · {rack.owner}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-current/25 bg-background/20"
                    >
                      {getStatusLabel(rack.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>Power {rack.powerKw} kW</div>
                    <div>Cooling {rack.coolingKw} kW</div>
                    <div>{rack.uplinks} uplinks</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    3D 座標 X {rack.positionX.toFixed(1)} · Z {rack.positionZ.toFixed(1)} · R {rack.rotation}°
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Zone Layout</CardTitle>
            <div className="text-sm text-muted-foreground">
              先確認每個區域可上櫃的容量，再決定機櫃配置與動線。
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {selectedSite.racks.map((rack) => {
              const isActive = rack.id === selectedRackId;

              return (
                <button
                  key={`${rack.id}-zone`}
                  type="button"
                  onClick={() => setSelectedRackId(rack.id)}
                  className={cn(
                    "rounded-[24px] border p-4 text-left transition-all",
                    getRackTone(rack.status),
                    isActive && "ring-1 ring-primary/60"
                  )}
                >
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground/70">
                    {rack.zone}
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                    {rack.cabinet}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{rack.owner}</div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    X {rack.positionX.toFixed(1)} · Z {rack.positionZ.toFixed(1)} · {rack.rotation}°
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Readiness Checklist</CardTitle>
            <div className="text-sm text-muted-foreground">
              布署前先把現場條件、網路與流程卡點一次看完。
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSite.checklist.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border px-4 py-3",
                  item.done
                    ? "border-emerald-300/20 bg-emerald-400/10"
                    : "border-amber-300/20 bg-amber-400/10"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      item.done
                        ? "bg-emerald-300/20 text-emerald-100"
                        : "bg-amber-300/20 text-amber-100"
                    )}
                  >
                    {item.done ? "OK" : "..."}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {item.done ? "已確認，可往下階段進行" : "尚未完成，需在設備出貨前收斂"}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-primary/15 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <span className="font-medium">Network readiness</span>
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedSite.networkReady}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="rounded-[28px]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>3D Cabinet Planner</CardTitle>
              <div className="mt-2 text-sm text-muted-foreground">
                點選 3D 機櫃後，可直接調整座標與朝向，規劃海外機櫃落位。
              </div>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {selectedRack.cabinet}
            </Badge>
          </CardHeader>
          <CardContent>
            <DataCenter3DPlanner
              racks={selectedSite.racks}
              selectedRackId={selectedRackId}
              onSelectRack={setSelectedRackId}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Layout Controls</CardTitle>
            <div className="text-sm text-muted-foreground">
              調整目前選中的機櫃位置。這些座標會即時反映在 3D 佈局上。
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-2xl border border-primary/15 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Box className="h-4 w-4 text-primary" />
                <span className="font-medium">Selected Rack</span>
              </div>
              <div className="mt-3 text-2xl font-semibold text-foreground">
                {selectedRack.cabinet}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {selectedRack.zone} · {selectedRack.owner}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{getStatusLabel(selectedRack.status)}</Badge>
                <Badge variant="outline">Power {selectedRack.powerKw} kW</Badge>
                <Badge variant="outline">Cooling {selectedRack.coolingKw} kW</Badge>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>左右位置 X</span>
                  <span className="text-muted-foreground">
                    {selectedRack.positionX.toFixed(1)} m
                  </span>
                </div>
                <Slider
                  min={-6}
                  max={6}
                  step={0.1}
                  value={[selectedRack.positionX]}
                  onValueChange={([value]) =>
                    updateRack(selectedRackId, { positionX: clamp(value, -6, 6) })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>前後位置 Z</span>
                  <span className="text-muted-foreground">
                    {selectedRack.positionZ.toFixed(1)} m
                  </span>
                </div>
                <Slider
                  min={-6}
                  max={6}
                  step={0.1}
                  value={[selectedRack.positionZ]}
                  onValueChange={([value]) =>
                    updateRack(selectedRackId, { positionZ: clamp(value, -6, 6) })
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>朝向 Rotation</span>
                  <span className="text-muted-foreground">{selectedRack.rotation}°</span>
                </div>
                <Slider
                  min={0}
                  max={270}
                  step={15}
                  value={[selectedRack.rotation]}
                  onValueChange={([value]) =>
                    updateRack(selectedRackId, { rotation: value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => nudgeSelectedRack("positionZ", -0.2)}>
                向前 -0.2m
              </Button>
              <Button variant="outline" onClick={() => nudgeSelectedRack("positionZ", 0.2)}>
                向後 +0.2m
              </Button>
              <Button variant="outline" onClick={() => nudgeSelectedRack("positionX", -0.2)}>
                向左 -0.2m
              </Button>
              <Button variant="outline" onClick={() => nudgeSelectedRack("positionX", 0.2)}>
                向右 +0.2m
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={resetSelectedRack}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重設目前機櫃
              </Button>
              <Button variant="ghost" onClick={resetSelectedSite}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重設整站配置
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Selected Cabinet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold tracking-tight text-foreground">
              {selectedRack.cabinet}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedRack.zone} · Row {selectedRack.row} · {selectedRack.owner}
            </div>
            <Badge variant="outline" className="mt-2 rounded-full">
              {getStatusLabel(selectedRack.status)}
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Capacity Guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-7 text-muted-foreground">
            <div>目前測試站數：{stations.length} 站</div>
            <div>活躍系統數：{systems.length} 台</div>
            <div>測項總數：{testItems.length} 項</div>
            <div>建議預留至少 15% 額外櫃位供擴充與備援。</div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px]">
          <CardHeader>
            <CardTitle>Deployment Focus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            <div className="flex items-start gap-2">
              <Zap className="mt-1 h-4 w-4 text-primary" />
              <span>先鎖定電力與冷卻，再安排機櫃與進場節點。</span>
            </div>
            <div className="flex items-start gap-2">
              <Network className="mt-1 h-4 w-4 text-primary" />
              <span>跨區 uplink、ISP 備援與現場網路出口必須提前排程。</span>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="mt-1 h-4 w-4 text-primary" />
              <span>現場承重、消防與冷熱通道條件是最常延誤的前置項目。</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
