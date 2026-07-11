import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Save, Server, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TrackerSystem {
  assigned_engineer?: string | null;
  flow_version_id?: string | null;
  id: string;
  overall_progress?: number | null;
  serial_number?: string | null;
  system_name: string;
}

interface TrackerStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TrackerItem {
  description?: string | null;
  id: string;
  item_name: string;
  item_order: number;
  station_id: string;
}

interface TrackerProgress {
  completed_at?: string | null;
  id: string;
  item_id: string;
  notes?: string | null;
  progress_percent?: number | null;
  started_at?: string | null;
  station_id: string;
  status?: string | null;
  system_id: string;
}

interface ItemDraft {
  notes: string;
  progress_percent: number;
  status: string;
}

interface SystemProgressSheetProps {
  items: TrackerItem[];
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  open: boolean;
  progress: TrackerProgress[];
  stations: TrackerStation[];
  system: TrackerSystem | null;
  updateProgress: (
    systemId: string,
    stationId: string,
    itemId: string,
    updates: Record<string, unknown>
  ) => Promise<boolean>;
  versionLabel?: string | null;
}

const STATUS_OPTIONS = [
  { label: "未開始", value: "Not Start" },
  { label: "進行中", value: "On-going" },
  { label: "已完成", value: "Done" },
  { label: "異常", value: "Error" },
];

function statusBadgeClass(status: string) {
  if (status === "Done") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (status === "On-going") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  if (status === "Error") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  return "border-slate-300/25 bg-slate-300/[0.08] text-slate-200";
}

export function SystemProgressSheet({
  items,
  onOpenChange,
  onUpdated,
  open,
  progress,
  stations,
  system,
  updateProgress,
  versionLabel,
}: SystemProgressSheetProps) {
  const { toast } = useToast();
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !system) return;
    const firstStationId = stations[0]?.id ?? "";
    setSelectedStationId((current) =>
      stations.some((station) => station.id === current) ? current : firstStationId
    );

    const nextDrafts: Record<string, ItemDraft> = {};
    items.forEach((item) => {
      const current = progress.find(
        (entry) => entry.system_id === system.id && entry.item_id === item.id
      );
      nextDrafts[item.id] = {
        notes: current?.notes ?? "",
        progress_percent: current?.progress_percent ?? 0,
        status: current?.status ?? "Not Start",
      };
    });
    setDrafts(nextDrafts);
  }, [items, open, progress, stations, system]);

  const selectedStation = stations.find((station) => station.id === selectedStationId);
  const stationItems = useMemo(
    () =>
      items
        .filter((item) => item.station_id === selectedStationId)
        .sort((left, right) => left.item_order - right.item_order),
    [items, selectedStationId]
  );
  const stationDone = stationItems.filter((item) => drafts[item.id]?.status === "Done").length;
  const stationPercent = stationItems.length
    ? Math.round((stationDone / stationItems.length) * 100)
    : 0;

  const saveItem = async (item: TrackerItem, override?: ItemDraft) => {
    if (!system) return false;
    const draft = override ?? drafts[item.id];
    if (!draft) return false;
    const existing = progress.find(
      (entry) => entry.system_id === system.id && entry.item_id === item.id
    );
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { ...draft };

    if (draft.status === "On-going" && !existing?.started_at) updates.started_at = now;
    if (draft.status === "Done") {
      updates.completed_at = existing?.completed_at || now;
      updates.started_at = existing?.started_at || now;
      updates.progress_percent = 100;
    }
    if (draft.status === "Not Start") {
      updates.completed_at = null;
      updates.progress_percent = 0;
    }

    setSavingItemId(item.id);
    const success = await updateProgress(system.id, item.station_id, item.id, updates);
    setSavingItemId(null);
    if (success) onUpdated();
    return success;
  };

  const completeStation = async () => {
    const results = await Promise.all(
      stationItems.map((item) =>
        saveItem(item, {
          notes: drafts[item.id]?.notes ?? "",
          progress_percent: 100,
          status: "Done",
        })
      )
    );
    if (results.every(Boolean)) {
      toast({ title: "站點已完成", description: `${selectedStation?.station_name} 的測項已全部完成。` });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden border-[#2a526f] bg-[#071522] p-0 sm:max-w-[700px]">
        <SheetHeader className="border-b border-[#2a526f]/70 px-5 py-4 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
              <Server className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-xl text-[#f3f8fc]">{system?.system_name || "機台進度"}</SheetTitle>
                {versionLabel && <Badge variant="outline" className="rounded-md">{versionLabel}</Badge>}
              </div>
              <SheetDescription className="mt-1 text-[#a9c0d1]">
                {system?.serial_number || "無序號"} · {system?.assigned_engineer || "未指定工程師"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="border-b border-[#2a526f]/70 bg-[#0b1b2d] px-5 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stations.map((station) => {
              const stationItemIds = items.filter((item) => item.station_id === station.id).map((item) => item.id);
              const completed = stationItemIds.filter((itemId) => drafts[itemId]?.status === "Done").length;
              return (
                <button
                  key={station.id}
                  type="button"
                  className={cn(
                    "min-w-[138px] rounded-lg border px-3 py-2 text-left transition-colors",
                    selectedStationId === station.id
                      ? "border-[#39c6e8] bg-[#10263a] text-[#f3f8fc]"
                      : "border-[#2a526f] bg-[#071522] text-[#a9c0d1] hover:bg-[#10263a]"
                  )}
                  onClick={() => setSelectedStationId(station.id)}
                >
                  <div className="truncate text-sm font-medium">{station.station_name}</div>
                  <div className="font-data mt-1 text-xs">{completed}/{stationItemIds.length}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-[#2a526f]/70 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs text-[#a9c0d1]">
              <span>{selectedStation?.station_name || "選擇站點"}</span>
              <span className="font-data">{stationPercent}%</span>
            </div>
            <Progress value={stationPercent} className="mt-1.5 h-1.5" />
          </div>
          <Button size="sm" variant="outline" disabled={!stationItems.length} onClick={completeStation}>
            <Check className="mr-2 h-4 w-4" />
            完成此站
          </Button>
        </div>

        <ScrollArea className="h-[calc(100vh-214px)] px-5 py-4">
          <div className="space-y-2 pr-3">
            {stationItems.map((item) => {
              const draft = drafts[item.id] ?? {
                notes: "",
                progress_percent: 0,
                status: "Not Start",
              };
              return (
                <div key={item.id} className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-data text-xs text-cyan-100">{item.item_order}</span>
                        <h3 className="truncate text-sm font-semibold text-[#f3f8fc]">{item.item_name}</h3>
                      </div>
                      {item.description && <p className="mt-1 line-clamp-1 text-xs text-[#a9c0d1]">{item.description}</p>}
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 rounded-md", statusBadgeClass(draft.status))}>
                      {STATUS_OPTIONS.find((option) => option.value === draft.status)?.label || draft.status}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[140px_92px_minmax(0,1fr)_36px]">
                    <Select
                      value={draft.status}
                      onValueChange={(value) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            ...draft,
                            progress_percent: value === "Done" ? 100 : value === "Not Start" ? 0 : draft.progress_percent,
                            status: value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-9 font-data"
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`${item.item_name} 進度百分比`}
                      value={draft.progress_percent}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            ...draft,
                            progress_percent: Math.max(0, Math.min(100, Number(event.target.value))),
                          },
                        }))
                      }
                    />
                    <Input
                      className="h-9"
                      aria-label={`${item.item_name} 備註`}
                      placeholder="備註"
                      value={draft.notes}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: { ...draft, notes: event.target.value },
                        }))
                      }
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 rounded-lg"
                      disabled={savingItemId === item.id}
                      onClick={() => saveItem(item)}
                    >
                      {draft.status === "Error" ? <XCircle className="h-4 w-4" /> : draft.status === "On-going" ? <Clock3 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                      <span className="sr-only">儲存 {item.item_name}</span>
                    </Button>
                  </div>
                </div>
              );
            })}

            {stationItems.length === 0 && (
              <div className="py-16 text-center text-sm text-[#a9c0d1]">此站點尚未建立測試項目。</div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
