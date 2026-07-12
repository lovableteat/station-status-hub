import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Play, Save, Server, Square, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SegmentedProgress } from "./SegmentedProgress";
import { TimeRecordManager } from "./TimeRecordManager";

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
  actual_hours?: number | null;
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

function calculateHours(startedAt: string, completedAt: string) {
  const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(0, Number((duration / 3_600_000).toFixed(4)));
}

function formatElapsed(startedAt?: string | null, completedAt?: string | null, now = Date.now()) {
  if (!startedAt) return "尚未計時";
  const end = completedAt ? new Date(completedAt).getTime() : now;
  const totalSeconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  if (status === "Done") return "border-emerald-300/60 bg-emerald-300/20 text-emerald-50";
  if (status === "On-going") return "border-amber-300/55 bg-amber-300/15 text-amber-50";
  if (status === "Error") return "border-rose-300/55 bg-rose-300/15 text-rose-50";
  return "border-slate-300/25 bg-slate-300/[0.08] text-slate-200";
}

function statusCardClass(status: string) {
  if (status === "Done") {
    return "border-emerald-300/50 bg-[linear-gradient(110deg,rgba(16,185,129,0.16),rgba(11,27,45,0.97)_48%)] shadow-[inset_3px_0_0_rgba(110,231,183,0.95)]";
  }
  if (status === "On-going") {
    return "border-amber-300/45 bg-[linear-gradient(110deg,rgba(245,158,11,0.13),rgba(11,27,45,0.97)_48%)] shadow-[inset_3px_0_0_rgba(252,211,77,0.9)]";
  }
  if (status === "Error") {
    return "border-rose-300/50 bg-[linear-gradient(110deg,rgba(244,63,94,0.14),rgba(11,27,45,0.97)_48%)] shadow-[inset_3px_0_0_rgba(253,164,175,0.9)]";
  }
  return "border-[#2a526f] bg-[#0b1b2d] shadow-[inset_3px_0_0_rgba(88,117,140,0.75)]";
}

function statusControlClass(status: string) {
  if (status === "Done") return "border-emerald-300/55 bg-emerald-300/15 text-emerald-50";
  if (status === "On-going") return "border-amber-300/50 bg-amber-300/12 text-amber-50";
  if (status === "Error") return "border-rose-300/50 bg-rose-300/12 text-rose-50";
  return "border-[#365d78] bg-[#10263a] text-slate-100";
}

function statusSaveButtonClass(status: string) {
  if (status === "Done") return "bg-emerald-400 text-[#04130e] hover:bg-emerald-300";
  if (status === "On-going") return "bg-amber-300 text-[#1b1202] hover:bg-amber-200";
  if (status === "Error") return "bg-rose-400 text-white hover:bg-rose-300";
  return "bg-blue-500 text-white hover:bg-blue-400";
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
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [open]);

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
  const progressByItemId = useMemo(() => {
    const entries = progress.filter((entry) => entry.system_id === system?.id);
    return new Map(entries.map((entry) => [entry.item_id, entry]));
  }, [progress, system?.id]);
  const stationItems = useMemo(
    () =>
      items
        .filter((item) => item.station_id === selectedStationId)
        .sort((left, right) => left.item_order - right.item_order),
    [items, selectedStationId]
  );
  const stationPercent = stationItems.length
    ? Math.round(
        stationItems.reduce((sum, item) => sum + (drafts[item.id]?.progress_percent ?? 0), 0) /
          stationItems.length
      )
    : 0;

  const saveItem = async (
    item: TrackerItem,
    override?: ItemDraft,
    shouldRefresh = true
  ) => {
    if (!system) return false;
    const draft = override ?? drafts[item.id];
    if (!draft) return false;
    const existing = progressByItemId.get(item.id);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { ...draft };

    if (draft.status === "On-going") {
      updates.started_at = existing?.completed_at ? now : existing?.started_at || now;
      updates.completed_at = null;
      updates.actual_hours = 0;
    }
    if (draft.status === "Done") {
      updates.completed_at = existing?.completed_at || now;
      updates.started_at = existing?.started_at || now;
      updates.progress_percent = 100;
      updates.actual_hours = calculateHours(
        String(updates.started_at),
        String(updates.completed_at)
      );
    }
    if (draft.status === "Not Start") {
      updates.completed_at = null;
      updates.started_at = null;
      updates.actual_hours = 0;
      updates.progress_percent = 0;
    }

    setSavingItemId(item.id);
    const success = await updateProgress(system.id, item.station_id, item.id, updates);
    setSavingItemId(null);
    if (success && shouldRefresh) onUpdated();
    return success;
  };

  const startTimer = async (item: TrackerItem) => {
    if (!system) return;
    const draft = drafts[item.id] ?? { notes: "", progress_percent: 0, status: "Not Start" };
    const existing = progressByItemId.get(item.id);
    const startedAt = existing?.completed_at ? new Date().toISOString() : existing?.started_at || new Date().toISOString();
    const nextDraft: ItemDraft = {
      ...draft,
      progress_percent: Math.max(1, draft.progress_percent),
      status: "On-going",
    };

    setSavingItemId(item.id);
    const success = await updateProgress(system.id, item.station_id, item.id, {
      ...nextDraft,
      actual_hours: 0,
      completed_at: null,
      started_at: startedAt,
    });
    setSavingItemId(null);
    if (!success) {
      toast({ title: "計時啟動失敗", description: "無法寫入開始時間，請稍後再試。", variant: "destructive" });
      return;
    }
    setDrafts((current) => ({ ...current, [item.id]: nextDraft }));
    toast({ title: "已開始計時", description: `${item.item_name} 已切換為進行中。` });
    onUpdated();
  };

  const finishTimer = async (item: TrackerItem) => {
    if (!system) return;
    const draft = drafts[item.id] ?? { notes: "", progress_percent: 0, status: "Not Start" };
    const existing = progressByItemId.get(item.id);
    const completedAt = new Date().toISOString();
    const startedAt = existing?.started_at || completedAt;
    const nextDraft: ItemDraft = { ...draft, progress_percent: 100, status: "Done" };

    setSavingItemId(item.id);
    const success = await updateProgress(system.id, item.station_id, item.id, {
      ...nextDraft,
      actual_hours: calculateHours(startedAt, completedAt),
      completed_at: completedAt,
      started_at: startedAt,
    });
    setSavingItemId(null);
    if (!success) {
      toast({ title: "完成計時失敗", description: "無法寫入完成時間，請稍後再試。", variant: "destructive" });
      return;
    }
    setDrafts((current) => ({ ...current, [item.id]: nextDraft }));
    toast({ title: "計時已完成", description: `${item.item_name} 已設為 100% 完成。` });
    onUpdated();
  };

  const completeStation = async () => {
    const results = await Promise.all(
      stationItems.map((item) =>
        saveItem(
          item,
          {
            notes: drafts[item.id]?.notes ?? "",
            progress_percent: 100,
            status: "Done",
          },
          false
        )
      )
    );
    if (results.every(Boolean)) {
      onUpdated();
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
            <SegmentedProgress value={stationPercent} className="mt-1.5" label={`${selectedStation?.station_name || "站點"} 進度`} />
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
              const timeRecord = progressByItemId.get(item.id);
              const isTimerRunning = Boolean(timeRecord?.started_at && !timeRecord?.completed_at);
              return (
                <div key={item.id} className={cn("rounded-xl border p-3 transition-colors", statusCardClass(draft.status))}>
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
                      <SelectTrigger className={cn("h-9 font-semibold", statusControlClass(draft.status))}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className={statusBadgeClass(option.value)}>
                            {option.label}
                          </SelectItem>
                        ))}
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
                      className={cn("h-9 w-9 rounded-lg", statusSaveButtonClass(draft.status))}
                      disabled={savingItemId === item.id}
                      onClick={() => saveItem(item)}
                    >
                      {draft.status === "Error" ? <XCircle className="h-4 w-4" /> : draft.status === "On-going" ? <Clock3 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                      <span className="sr-only">儲存 {item.item_name}</span>
                    </Button>
                  </div>
                  <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3", draft.status === "Done" ? "border-emerald-300/25" : draft.status === "On-going" ? "border-amber-300/25" : "border-[#2a526f]/60")}>
                    <div className={cn("flex min-w-0 items-center gap-2 text-xs", draft.status === "Done" ? "text-emerald-100" : draft.status === "On-going" ? "text-amber-100" : "text-[#a9c0d1]")}>
                      <span className={cn("h-2 w-2 rounded-full", isTimerRunning ? "animate-pulse bg-amber-300 motion-reduce:animate-none" : timeRecord?.completed_at ? "bg-emerald-300" : "bg-[#58758c]")} />
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{isTimerRunning ? "計時中" : timeRecord?.completed_at ? "實際耗時" : "機台計時"}</span>
                      <span className="font-data text-[#f3f8fc]">{formatElapsed(timeRecord?.started_at, timeRecord?.completed_at, clockNow)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTimerRunning ? (
                        <Button size="sm" variant="outline" className="h-8 border-emerald-300/40 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" disabled={savingItemId === item.id} onClick={() => finishTimer(item)} title="停止計時，並將此測項設為已完成 100%">
                          <Square className="mr-1.5 h-3.5 w-3.5" />完成計時
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 border-cyan-300/40 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20" disabled={savingItemId === item.id} onClick={() => startTimer(item)} title={timeRecord?.completed_at ? "重新開始計時，原完成時間會被清除" : "開始計時，並將此測項設為進行中"}>
                          <Play className="mr-1.5 h-3.5 w-3.5" />{timeRecord?.completed_at ? "重新計時" : "開始計時"}
                        </Button>
                      )}
                      {system && (
                        <TimeRecordManager
                          systemId={system.id}
                          stationId={item.station_id}
                          itemId={item.id}
                          currentStartedAt={timeRecord?.started_at ?? undefined}
                          currentCompletedAt={timeRecord?.completed_at ?? undefined}
                          onTimeUpdate={onUpdated}
                        />
                      )}
                    </div>
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
