import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Cable,
  Eye,
  Grid2X2,
  PencilRuler,
  Plus,
  RotateCw,
  Snowflake,
  ThermometerSun,
  Trash2,
} from "lucide-react";

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
import { cn } from "@/lib/utils";

import type {
  FacilityAisleKind,
  FacilityPlan,
  RackModelDefinition,
  RackPlan,
} from "./dataCenterTypes";

type PlanItemKind = "rack" | "aisle" | "power";

interface DragState {
  kind: PlanItemKind;
  id: string;
  offsetX: number;
  offsetZ: number;
}

interface DataCenter2DPlannerProps {
  racks: RackPlan[];
  models: Record<string, RackModelDefinition>;
  facility: FacilityPlan;
  selectedRackId: string;
  canEdit: boolean;
  onSelectRack: (rackId: string) => void;
  onMoveRack: (rackId: string, x: number, z: number) => void;
  onRotateRack: (rackId: string) => void;
  onMoveAisle: (aisleId: string, x: number, z: number) => void;
  onMovePowerFeed: (feedId: string, x: number, z: number) => void;
  onAddRack: () => void;
  onDeleteRack: (rackId: string) => void;
  onAddAisle: (kind: FacilityAisleKind) => void;
  onAddPowerFeed: () => void;
  onOpenModels: () => void;
  onOpenFacilitySettings: () => void;
  onView3D: () => void;
}

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 760;
const FLOOR_PADDING = 54;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value: number) {
  return Math.round(value * 4) / 4;
}

function getRackFootprint(rack: RackPlan, model: RackModelDefinition) {
  const rotated = Math.abs(rack.rotation % 180) === 90;
  return {
    width: (rotated ? model.dimensions.depthMm : model.dimensions.widthMm) / 1000,
    depth: (rotated ? model.dimensions.widthMm : model.dimensions.depthMm) / 1000,
  };
}

export function DataCenter2DPlanner({
  racks,
  models,
  facility,
  selectedRackId,
  canEdit,
  onSelectRack,
  onMoveRack,
  onRotateRack,
  onMoveAisle,
  onMovePowerFeed,
  onAddRack,
  onDeleteRack,
  onAddAisle,
  onAddPowerFeed,
  onOpenModels,
  onOpenFacilitySettings,
  onView3D,
}: DataCenter2DPlannerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  const geometry = useMemo(() => {
    const scale = Math.min(
      (VIEW_WIDTH - FLOOR_PADDING * 2) / facility.width,
      (VIEW_HEIGHT - FLOOR_PADDING * 2) / facility.depth,
    );
    const floorWidth = facility.width * scale;
    const floorHeight = facility.depth * scale;
    const left = (VIEW_WIDTH - floorWidth) / 2;
    const top = (VIEW_HEIGHT - floorHeight) / 2;

    return { scale, floorWidth, floorHeight, left, top };
  }, [facility.depth, facility.width]);

  const toScreen = (x: number, z: number) => ({
    x: geometry.left + (x + facility.width / 2) * geometry.scale,
    y: geometry.top + (z + facility.depth / 2) * geometry.scale,
  });

  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const svgY = ((clientY - rect.top) / rect.height) * VIEW_HEIGHT;
    return {
      x: (svgX - geometry.left) / geometry.scale - facility.width / 2,
      z: (svgY - geometry.top) / geometry.scale - facility.depth / 2,
    };
  };

  const beginDrag = (
    event: ReactPointerEvent<SVGElement>,
    kind: PlanItemKind,
    id: string,
    itemX: number,
    itemZ: number,
  ) => {
    if (!canEdit) return;
    const point = toWorld(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      kind,
      id,
      offsetX: itemX - point.x,
      offsetZ: itemZ - point.z,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging || !canEdit) return;
    const point = toWorld(event.clientX, event.clientY);
    if (!point) return;

    const requestedX = point.x + dragging.offsetX;
    const requestedZ = point.z + dragging.offsetZ;
    if (dragging.kind === "rack") {
      const rack = racks.find((item) => item.id === dragging.id);
      if (!rack) return;
      const model = models[rack.modelId] ?? models["generic-42u"];
      const footprint = getRackFootprint(rack, model);
      const x = snapToGrid(clamp(requestedX, -facility.width / 2 + footprint.width / 2, facility.width / 2 - footprint.width / 2));
      const z = snapToGrid(clamp(requestedZ, -facility.depth / 2 + footprint.depth / 2, facility.depth / 2 - footprint.depth / 2));
      onMoveRack(rack.id, x, z);
      return;
    }

    if (dragging.kind === "aisle") {
      const aisle = facility.aisles.find((item) => item.id === dragging.id);
      if (!aisle) return;
      const rotated = Math.abs(aisle.rotation % 180) === 90;
      const width = rotated ? aisle.depth : aisle.width;
      const depth = rotated ? aisle.width : aisle.depth;
      const x = snapToGrid(clamp(requestedX, -facility.width / 2 + width / 2, facility.width / 2 - width / 2));
      const z = snapToGrid(clamp(requestedZ, -facility.depth / 2 + depth / 2, facility.depth / 2 - depth / 2));
      onMoveAisle(aisle.id, x, z);
      return;
    }

    const x = snapToGrid(clamp(requestedX, -facility.width / 2 + 0.25, facility.width / 2 - 0.25));
    const z = snapToGrid(clamp(requestedZ, -facility.depth / 2 + 0.25, facility.depth / 2 - 0.25));
    onMovePowerFeed(dragging.id, x, z);
  };

  const selectedRack = racks.find((rack) => rack.id === selectedRackId) ?? racks[0];
  const selectedModel = selectedRack
    ? models[selectedRack.modelId] ?? models["generic-42u"]
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07111c]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-cyan-300/15 bg-[#0a1a29] px-3 py-3 sm:px-5">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <Grid2X2 className="h-4 w-4 text-cyan-200" /> 2D 廠房規劃
          </div>
          <p className="mt-1 hidden text-[11px] text-slate-400 sm:block">拖曳機櫃、通道與 PDU；切回 3D 會立即顯示相同配置。</p>
        </div>
        <Button type="button" onClick={onAddRack} disabled={!canEdit} className="h-9 bg-cyan-300 text-[#04131f] hover:bg-cyan-200">
          <Plus className="mr-2 h-4 w-4" /> 新增機櫃
        </Button>
        <Button type="button" variant="outline" onClick={onOpenModels} className="h-9 border-cyan-300/20 bg-cyan-400/8 text-cyan-50 hover:bg-cyan-400/15">
          <Box className="mr-2 h-4 w-4" /> 選擇模型
        </Button>
        <Button type="button" variant="outline" onClick={() => onAddAisle("cold")} disabled={!canEdit} className="h-9 border-sky-300/20 bg-sky-400/8 text-sky-50 hover:bg-sky-400/15">
          <Snowflake className="mr-2 h-4 w-4" /> 冷通道
        </Button>
        <Button type="button" variant="outline" onClick={() => onAddAisle("hot")} disabled={!canEdit} className="h-9 border-orange-300/20 bg-orange-400/8 text-orange-50 hover:bg-orange-400/15">
          <ThermometerSun className="mr-2 h-4 w-4" /> 熱通道
        </Button>
        <Button type="button" variant="outline" onClick={onAddPowerFeed} disabled={!canEdit} className="h-9 border-amber-300/20 bg-amber-400/8 text-amber-50 hover:bg-amber-400/15">
          <Cable className="mr-2 h-4 w-4" /> PDU
        </Button>
        <Button type="button" variant="outline" onClick={onOpenFacilitySettings} className="h-9 border-white/12 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]">
          <PencilRuler className="mr-2 h-4 w-4" /> 尺寸設定
        </Button>
        <Button type="button" onClick={onView3D} className="h-9 bg-cyan-300 text-[#04131f] hover:bg-cyan-200">
          <Eye className="mr-2 h-4 w-4" /> 查看 3D
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,#0c2334_0%,#050c14_68%)] p-2 sm:p-4">
        <svg
          ref={svgRef}
          data-testid="data-center-2d-plan"
          role="application"
          aria-label="Data Center 2D 廠房配置圖"
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className={cn("h-full w-full select-none", canEdit ? "cursor-default" : "cursor-not-allowed")}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
          <defs>
            <pattern id="dc-plan-grid" width={geometry.scale} height={geometry.scale} patternUnits="userSpaceOnUse">
              <path d={`M ${geometry.scale} 0 L 0 0 0 ${geometry.scale}`} fill="none" stroke="#24445b" strokeWidth="1" opacity="0.6" />
            </pattern>
            <filter id="dc-plan-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#02070d" floodOpacity="0.8" />
            </filter>
          </defs>

          <rect x={geometry.left} y={geometry.top} width={geometry.floorWidth} height={geometry.floorHeight} rx="18" fill="#081725" stroke="#5ea7cf" strokeWidth="3" />
          {facility.showGrid ? (
            <rect x={geometry.left} y={geometry.top} width={geometry.floorWidth} height={geometry.floorHeight} rx="18" fill="url(#dc-plan-grid)" />
          ) : null}

          {facility.aisles.map((aisle) => {
            const center = toScreen(aisle.x, aisle.z);
            const width = aisle.width * geometry.scale;
            const height = aisle.depth * geometry.scale;
            const cold = aisle.kind === "cold";
            return (
              <g
                key={aisle.id}
                data-plan-item={`aisle-${aisle.id}`}
                className={canEdit ? "cursor-grab active:cursor-grabbing" : undefined}
                transform={`rotate(${aisle.rotation} ${center.x} ${center.y})`}
                onPointerDown={(event) => beginDrag(event, "aisle", aisle.id, aisle.x, aisle.z)}
              >
                <rect x={center.x - width / 2} y={center.y - height / 2} width={width} height={height} rx="10" fill={cold ? "#0ea5e933" : "#f9731630"} stroke={cold ? "#38bdf8" : "#fb923c"} strokeWidth="2" strokeDasharray="8 6" />
                <text x={center.x} y={center.y + 5} textAnchor="middle" fill={cold ? "#bae6fd" : "#fed7aa"} fontSize="15" fontWeight="700">{aisle.label}</text>
              </g>
            );
          })}

          {facility.powerFeeds.filter((feed) => feed.enabled).flatMap((feed) => {
            const start = toScreen(feed.x, feed.z);
            return racks.map((rack) => {
              const end = toScreen(rack.positionX, rack.positionZ);
              return <line key={`${feed.id}-${rack.id}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={feed.color} strokeWidth="1.5" opacity="0.2" />;
            });
          })}

          {racks.map((rack) => {
            const model = models[rack.modelId] ?? models["generic-42u"];
            const center = toScreen(rack.positionX, rack.positionZ);
            const footprint = getRackFootprint(rack, model);
            const width = footprint.width * geometry.scale;
            const height = footprint.depth * geometry.scale;
            const selected = rack.id === selectedRackId;
            return (
              <g
                key={rack.id}
                data-plan-item={`rack-${rack.id}`}
                className={canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                filter="url(#dc-plan-shadow)"
                onClick={() => onSelectRack(rack.id)}
                onPointerDown={(event) => {
                  onSelectRack(rack.id);
                  beginDrag(event, "rack", rack.id, rack.positionX, rack.positionZ);
                }}
              >
                <rect x={center.x - width / 2} y={center.y - height / 2} width={width} height={height} rx="7" fill={selected ? "#164e63" : "#142838"} stroke={selected ? "#67e8f9" : "#5c7890"} strokeWidth={selected ? 4 : 2} />
                <path d={`M ${center.x} ${center.y - height / 2 + 6} l -7 11 h 14 z`} fill={selected ? "#67e8f9" : "#91a9ba"} />
                <text x={center.x} y={center.y + 5} textAnchor="middle" fill="#f8fafc" fontSize="14" fontWeight="800">{rack.cabinet}</text>
                <text x={center.x} y={center.y + 22} textAnchor="middle" fill="#a5c5d8" fontSize="10">{model.name}</text>
              </g>
            );
          })}

          {facility.powerFeeds.map((feed) => {
            const center = toScreen(feed.x, feed.z);
            return (
              <g
                key={feed.id}
                data-plan-item={`power-${feed.id}`}
                className={canEdit ? "cursor-grab active:cursor-grabbing" : undefined}
                onPointerDown={(event) => beginDrag(event, "power", feed.id, feed.x, feed.z)}
              >
                <circle cx={center.x} cy={center.y} r="17" fill="#071522" stroke={feed.color} strokeWidth="4" />
                <path d={`M ${center.x - 4} ${center.y - 10} L ${center.x + 5} ${center.y - 10} L ${center.x} ${center.y - 1} L ${center.x + 7} ${center.y - 1} L ${center.x - 5} ${center.y + 12} L ${center.x - 1} ${center.y + 3} L ${center.x - 8} ${center.y + 3} Z`} fill={feed.color} />
                <text x={center.x} y={center.y + 34} textAnchor="middle" fill="#f8fafc" fontSize="12" fontWeight="700">{feed.label}</text>
              </g>
            );
          })}

          <text x={geometry.left + 16} y={geometry.top + 28} fill="#cfefff" fontSize="13" fontWeight="700">{facility.width}m × {facility.depth}m</text>
        </svg>

        {selectedRack && selectedModel ? (
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-300/20 bg-[#071522]/94 p-3 shadow-2xl backdrop-blur-xl sm:left-auto sm:max-w-xl">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white">{selectedRack.cabinet} · {selectedModel.name}</div>
              <div className="mt-1 text-[11px] tabular-nums text-slate-400">X {selectedRack.positionX.toFixed(2)}m · Z {selectedRack.positionZ.toFixed(2)}m · {selectedRack.rotation}°</div>
            </div>
            <Button type="button" variant="outline" onClick={() => onRotateRack(selectedRack.id)} disabled={!canEdit} className="h-9 border-cyan-300/20 bg-cyan-400/8 text-cyan-50 hover:bg-cyan-400/15">
              <RotateCw className="mr-2 h-4 w-4" /> 旋轉 90°
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canEdit || racks.length <= 1}
                  className="h-9 border-rose-300/25 bg-rose-400/8 text-rose-100 hover:bg-rose-400/16 hover:text-white"
                  title={racks.length <= 1 ? "場景至少需要保留一座機櫃" : `刪除 ${selectedRack.cabinet}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 刪除機櫃
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="border-cyan-300/18 bg-[#081725] text-slate-100">
                <AlertDialogHeader>
                  <AlertDialogTitle>確定刪除「{selectedRack.cabinet}」？</AlertDialogTitle>
                  <AlertDialogDescription className="leading-6 text-slate-300">
                    此機櫃及其櫃內配置會同時從 2D 與 3D 場景移除，這個動作無法復原。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-[#2a526f] bg-[#10263a] text-slate-100 hover:bg-[#17364f] hover:text-white">
                    取消
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDeleteRack(selectedRack.id)}
                    className="bg-rose-500 text-white hover:bg-rose-400"
                  >
                    確定刪除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {!canEdit ? (
          <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-100">唯讀模式</div>
        ) : null}
      </div>
    </div>
  );
}
