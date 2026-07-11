import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ClipboardCheck,
  Clock3,
  Copy,
  FileSliders,
  GripVertical,
  Layers3,
  ListChecks,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import DOMPurify from "dompurify";

import { MaintenanceMetricStrip } from "@/components/maintenance/MaintenanceMetricStrip";
import { MaintenancePageHeader } from "@/components/maintenance/MaintenancePageHeader";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFlowVersions } from "@/hooks/useFlowVersions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type TestStation = Tables<"test_flow_stations">;
type TestItem = Tables<"test_flow_items">;
type StationContent = Tables<"station_contents">;
type FlowView = "overview" | "editor";

interface FlowSnapshot {
  contents: StationContent[];
  items: TestItem[];
  stations: TestStation[];
}

function stripHtml(value?: string | null) {
  if (!value) return "";
  const sanitized = DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
  const documentNode = new DOMParser().parseFromString(sanitized, "text/html");
  return documentNode.body.textContent?.replace(/\s+/g, " ").trim() || "";
}

function updateFlowViewQuery(view: FlowView) {
  const url = new URL(window.location.href);
  url.searchParams.set("flowView", view);
  window.history.replaceState({}, "", url);
}

export function FlowInfo() {
  const { activeProject, activeProjectId } = useTestProject();
  const { toast } = useToast();
  const {
    activeVersion,
    isLoadingVersions,
  } = useFlowVersions();
  const [view, setView] = useState<FlowView>(() => {
    if (typeof window === "undefined") return "overview";
    return new URLSearchParams(window.location.search).get("flowView") === "editor"
      ? "editor"
      : "overview";
  });
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [contents, setContents] = useState<StationContent[]>([]);
  const [systemCount, setSystemCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [stationDraft, setStationDraft] = useState({
    description: "",
    estimated_hours: 0,
    station_name: "",
  });
  const [itemDraft, setItemDraft] = useState({
    description: "",
    estimated_minutes: 30,
    item_name: "",
  });
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState({ content: "", title: "" });
  const [draggedStationId, setDraggedStationId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const editingVersionId = activeVersion?.id ?? null;
  const displayedVersionId = activeVersion?.id ?? null;
  const canEdit = Boolean(view === "editor" && editingVersionId && displayedVersionId === editingVersionId);

  const loadSnapshot = useCallback(
    async (versionId: string | null): Promise<FlowSnapshot> => {
      if (!activeProjectId) return { contents: [], items: [], stations: [] };

      let stationQuery = supabase
        .from("test_flow_stations")
        .select("*")
        .eq("project_id", activeProjectId);
      let itemQuery = supabase
        .from("test_flow_items")
        .select("*")
        .eq("project_id", activeProjectId);
      let contentQuery = supabase
        .from("station_contents")
        .select("*")
        .eq("project_id", activeProjectId);

      if (versionId) {
        stationQuery = stationQuery.eq("flow_version_id", versionId);
        itemQuery = itemQuery.eq("flow_version_id", versionId);
        contentQuery = contentQuery.eq("flow_version_id", versionId);
      }

      let [stationResult, itemResult, contentResult] = await Promise.all([
        stationQuery.order("station_order"),
        itemQuery.order("item_order"),
        contentQuery.order("order_num"),
      ]);

      if (versionId && (stationResult.error || itemResult.error || contentResult.error)) {
        [stationResult, itemResult, contentResult] = await Promise.all([
          supabase
            .from("test_flow_stations")
            .select("*")
            .eq("project_id", activeProjectId)
            .order("station_order"),
          supabase
            .from("test_flow_items")
            .select("*")
            .eq("project_id", activeProjectId)
            .order("item_order"),
          supabase
            .from("station_contents")
            .select("*")
            .eq("project_id", activeProjectId)
            .order("order_num"),
        ]);
      }

      if (stationResult.error) throw stationResult.error;
      if (itemResult.error) throw itemResult.error;
      if (contentResult.error) throw contentResult.error;

      return {
        contents: contentResult.data ?? [],
        items: itemResult.data ?? [],
        stations: stationResult.data ?? [],
      };
    },
    [activeProjectId]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [snapshot, systemsResult] = await Promise.all([
        loadSnapshot(displayedVersionId),
        activeProjectId
          ? supabase
              .from("test_systems")
              .select("id", { count: "exact", head: true })
              .eq("project_id", activeProjectId)
          : Promise.resolve({ count: 0, error: null }),
      ]);
      setStations(snapshot.stations);
      setItems(snapshot.items);
      setContents(snapshot.contents);
      setSystemCount(systemsResult.count ?? 0);
      setSelectedStationId((current) =>
        snapshot.stations.some((station) => station.id === current)
          ? current
          : snapshot.stations[0]?.id ?? null
      );
    } catch (error) {
      console.error("Failed to load flow workspace:", error);
      toast({
        title: "流程載入失敗",
        description: "無法讀取目前流程版本。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, displayedVersionId, loadSnapshot, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedStation = stations.find((station) => station.id === selectedStationId) ?? null;
  const stationItems = useMemo(
    () =>
      items
        .filter((item) => item.station_id === selectedStationId)
        .sort((left, right) => left.item_order - right.item_order),
    [items, selectedStationId]
  );
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const stationContents = useMemo(
    () =>
      contents
        .filter((content) => content.station_id === selectedStationId)
        .sort((left, right) => left.order_num - right.order_num),
    [contents, selectedStationId]
  );

  useEffect(() => {
    if (!selectedStation) return;
    setStationDraft({
      description: selectedStation.description ?? "",
      estimated_hours: selectedStation.estimated_hours ?? 0,
      station_name: selectedStation.station_name,
    });
    setSelectedItemId((current) =>
      stationItems.some((item) => item.id === current) ? current : stationItems[0]?.id ?? null
    );
  }, [selectedStation, stationItems]);

  useEffect(() => {
    if (!selectedItem) {
      setItemDraft({ description: "", estimated_minutes: 30, item_name: "" });
      return;
    }
    setItemDraft({
      description: selectedItem.description ?? "",
      estimated_minutes: selectedItem.estimated_minutes ?? 30,
      item_name: selectedItem.item_name,
    });
  }, [selectedItem]);

  const validationIssues = useMemo(() => {
    const messages: string[] = [];
    if (!stations.length) messages.push("至少需要一個測試站點");
    stations.forEach((station) => {
      const stationItems = items.filter((item) => item.station_id === station.id);
      if (!stationItems.length) messages.push(`${station.station_name} 尚無測試項目`);
      stationItems.forEach((item) => {
        if (!item.item_name.trim()) messages.push(`${station.station_name} 有未命名測項`);
        if ((item.estimated_minutes ?? 0) <= 0) messages.push(`${item.item_name} 未設定有效工時`);
      });
    });
    return messages;
  }, [items, stations]);

  const totalMinutes = items.reduce(
    (sum, item) => sum + (item.estimated_minutes ?? 0),
    0
  );

  const setFlowView = useCallback((nextView: FlowView) => {
    setView(nextView);
    updateFlowViewQuery(nextView);
  }, []);

  const enterEditMode = useCallback(() => {
    setFlowView("editor");
  }, [setFlowView]);

  const requireEditableVersion = () => {
    if (!editingVersionId || !activeProjectId) {
      toast({
        title: "無法編輯流程",
        description: "目前專案尚未建立流程版本。",
        variant: "destructive",
      });
      return null;
    }
    return editingVersionId;
  };

  const addStation = async () => {
    const versionId = requireEditableVersion();
    if (!versionId || !activeProjectId) return;
    const nextOrder = Math.max(-1, ...stations.map((station) => station.station_order)) + 1;
    const { data, error } = await supabase
      .from("test_flow_stations")
      .insert({
        description: "",
        estimated_hours: 0,
        flow_version_id: versionId,
        project_id: activeProjectId,
        station_name: `新站點 ${nextOrder + 1}`,
        station_order: nextOrder,
      })
      .select("*")
      .single();
    if (error) return toast({ title: "新增站點失敗", description: error.message, variant: "destructive" });
    await loadData();
    setSelectedStationId(data.id);
  };

  const saveStation = async () => {
    if (!canEdit || !selectedStation || !activeProjectId || !editingVersionId) return;
    const { error } = await supabase
      .from("test_flow_stations")
      .update({
        description: stationDraft.description,
        estimated_hours: stationDraft.estimated_hours,
        station_name: stationDraft.station_name.trim(),
      })
      .eq("id", selectedStation.id)
      .eq("project_id", activeProjectId)
      .eq("flow_version_id", editingVersionId);
    if (error) return toast({ title: "站點儲存失敗", description: error.message, variant: "destructive" });
    toast({ title: "站點已儲存" });
    await loadData();
  };

  const deleteStation = async (station: TestStation) => {
    if (!canEdit || !activeProjectId || !editingVersionId) return;
    await supabase.from("station_contents").delete().eq("station_id", station.id).eq("flow_version_id", editingVersionId);
    await supabase.from("test_flow_items").delete().eq("station_id", station.id).eq("flow_version_id", editingVersionId);
    const { error } = await supabase.from("test_flow_stations").delete().eq("id", station.id).eq("project_id", activeProjectId);
    if (error) return toast({ title: "站點刪除失敗", description: error.message, variant: "destructive" });
    await loadData();
  };

  const duplicateStation = async (station: TestStation) => {
    const versionId = requireEditableVersion();
    if (!versionId || !activeProjectId) return;
    const { data: newStation, error } = await supabase
      .from("test_flow_stations")
      .insert({
        description: station.description,
        estimated_hours: station.estimated_hours,
        flow_version_id: versionId,
        project_id: activeProjectId,
        station_name: `${station.station_name} 複本`,
        station_order: Math.max(-1, ...stations.map((entry) => entry.station_order)) + 1,
      })
      .select("*")
      .single();
    if (error) return toast({ title: "複製站點失敗", description: error.message, variant: "destructive" });

    const sourceItems = items.filter((item) => item.station_id === station.id);
    if (sourceItems.length) {
      await supabase.from("test_flow_items").insert(
        sourceItems.map((item) => ({
          description: item.description,
          estimated_minutes: item.estimated_minutes,
          flow_version_id: versionId,
          item_name: item.item_name,
          item_order: item.item_order,
          project_id: activeProjectId,
          station_id: newStation.id,
        }))
      );
    }
    const sourceContents = contents.filter((content) => content.station_id === station.id);
    if (sourceContents.length) {
      await supabase.from("station_contents").insert(
        sourceContents.map((content) => ({
          content: content.content,
          flow_version_id: versionId,
          order_num: content.order_num,
          project_id: activeProjectId,
          station_id: newStation.id,
          title: content.title,
        }))
      );
    }
    await loadData();
    setSelectedStationId(newStation.id);
  };

  const reorderStations = async (ordered: TestStation[]) => {
    if (!canEdit || !editingVersionId) return;
    await Promise.all(
      ordered.map((station, index) =>
        supabase.from("test_flow_stations").update({ station_order: 10000 + index }).eq("id", station.id)
      )
    );
    await Promise.all(
      ordered.map((station, index) =>
        supabase.from("test_flow_stations").update({ station_order: index }).eq("id", station.id)
      )
    );
    await loadData();
  };

  const moveStation = (stationId: string, direction: -1 | 1) => {
    const currentIndex = stations.findIndex((station) => station.id === stationId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stations.length) return;
    const ordered = [...stations];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    reorderStations(ordered);
  };

  const addItem = async () => {
    const versionId = requireEditableVersion();
    if (!versionId || !activeProjectId || !selectedStation) return;
    const { data, error } = await supabase
      .from("test_flow_items")
      .insert({
        description: "",
        estimated_minutes: 30,
        flow_version_id: versionId,
        item_name: `新測項 ${stationItems.length + 1}`,
        item_order: Math.max(-1, ...stationItems.map((item) => item.item_order)) + 1,
        project_id: activeProjectId,
        station_id: selectedStation.id,
      })
      .select("*")
      .single();
    if (error) return toast({ title: "新增測項失敗", description: error.message, variant: "destructive" });
    await loadData();
    setSelectedItemId(data.id);
  };

  const saveItem = async () => {
    if (!canEdit || !selectedItem || !activeProjectId || !editingVersionId) return;
    const { error } = await supabase
      .from("test_flow_items")
      .update({
        description: itemDraft.description,
        estimated_minutes: itemDraft.estimated_minutes,
        item_name: itemDraft.item_name.trim(),
      })
      .eq("id", selectedItem.id)
      .eq("project_id", activeProjectId)
      .eq("flow_version_id", editingVersionId);
    if (error) return toast({ title: "測項儲存失敗", description: error.message, variant: "destructive" });
    toast({ title: "測項已儲存" });
    await loadData();
  };

  const deleteItem = async (item: TestItem) => {
    if (!canEdit || !editingVersionId) return;
    const { error } = await supabase.from("test_flow_items").delete().eq("id", item.id).eq("flow_version_id", editingVersionId);
    if (error) return toast({ title: "測項刪除失敗", description: error.message, variant: "destructive" });
    await loadData();
  };

  const duplicateItem = async (item: TestItem) => {
    const versionId = requireEditableVersion();
    if (!versionId || !activeProjectId) return;
    const { data, error } = await supabase
      .from("test_flow_items")
      .insert({
        description: item.description,
        estimated_minutes: item.estimated_minutes,
        flow_version_id: versionId,
        item_name: `${item.item_name} 複本`,
        item_order: Math.max(-1, ...stationItems.map((entry) => entry.item_order)) + 1,
        project_id: activeProjectId,
        station_id: item.station_id,
      })
      .select("*")
      .single();
    if (error) return toast({ title: "複製測項失敗", description: error.message, variant: "destructive" });
    await loadData();
    setSelectedItemId(data.id);
  };

  const reorderItems = async (ordered: TestItem[]) => {
    if (!canEdit || !editingVersionId) return;
    await Promise.all(
      ordered.map((item, index) =>
        supabase.from("test_flow_items").update({ item_order: 10000 + index }).eq("id", item.id)
      )
    );
    await Promise.all(
      ordered.map((item, index) =>
        supabase.from("test_flow_items").update({ item_order: index }).eq("id", item.id)
      )
    );
    await loadData();
  };

  const moveItem = (itemId: string, direction: -1 | 1) => {
    const currentIndex = stationItems.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stationItems.length) return;
    const ordered = [...stationItems];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    reorderItems(ordered);
  };

  const openContentDialog = (content?: StationContent) => {
    setEditingContentId(content?.id ?? null);
    setContentDraft({ content: content?.content ?? "", title: content?.title ?? "" });
    setContentDialogOpen(true);
  };

  const saveContent = async () => {
    const versionId = requireEditableVersion();
    if (!versionId || !activeProjectId || !selectedStation) return;
    const payload = {
      content: contentDraft.content,
      flow_version_id: versionId,
      project_id: activeProjectId,
      station_id: selectedStation.id,
      title: contentDraft.title.trim(),
    };
    const result = editingContentId
      ? await supabase.from("station_contents").update(payload).eq("id", editingContentId)
      : await supabase.from("station_contents").insert({
          ...payload,
          order_num: Math.max(-1, ...stationContents.map((content) => content.order_num)) + 1,
        });
    if (result.error) return toast({ title: "流程內容儲存失敗", description: result.error.message, variant: "destructive" });
    setContentDialogOpen(false);
    await loadData();
  };

  const deleteContent = async (contentId: string) => {
    if (!canEdit || !editingVersionId) return;
    await supabase.from("station_contents").delete().eq("id", contentId).eq("flow_version_id", editingVersionId);
    await loadData();
  };

  if (isLoading || isLoadingVersions) {
    return <div className="maintenance-page text-sm text-[#a9c0d1]">載入流程工作區...</div>;
  }

  return (
    <div className="maintenance-page space-y-3">
      <MaintenancePageHeader
        icon={FileSliders}
        title="L10 測試流程設定"
        description={activeProject?.name || "目前專案"}
        actions={
          <div className="flex rounded-lg border border-[#2a526f] bg-[#071522] p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 rounded-md", view === "overview" && "bg-[#10263a] text-cyan-100")}
              onClick={() => setFlowView("overview")}
            >
              <Route className="mr-2 h-4 w-4" />流程總覽
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 rounded-md", view === "editor" && "bg-[#10263a] text-cyan-100")}
              onClick={enterEditMode}
            >
              <FileSliders className="mr-2 h-4 w-4" />流程編輯
            </Button>
          </div>
        }
      />

      <div className="maintenance-toolbar flex min-h-11 flex-wrap items-center gap-2 px-3 py-2">
        <Badge
          variant="outline"
          className="h-7 rounded-md border-cyan-300/35 bg-cyan-300/10 text-cyan-100"
        >
          變更直接生效
        </Badge>

        <div className="ml-auto flex flex-wrap gap-2">
          {view === "overview" ? (
            <Button
              size="sm"
              className="h-8 rounded-lg"
              onClick={enterEditMode}
            >
              <FileSliders className="mr-2 h-4 w-4" />直接編輯流程
            </Button>
          ) : (
            <span className="flex h-8 items-center text-xs text-[#9eb8ca]">
              所有修改會立即套用到目前流程
            </span>
          )}
        </div>
      </div>

      {view === "overview" ? (
        <>
          <MaintenanceMetricStrip
            metrics={[
              { accent: "blue", icon: Layers3, label: "測試站點", value: stations.length },
              { accent: "cyan", icon: ListChecks, label: "測試項目", value: items.length },
              { accent: "amber", icon: Clock3, label: "單機預估", value: `${(totalMinutes / 60).toFixed(1)}h` },
              { accent: "emerald", icon: ClipboardCheck, label: "專案機台", value: systemCount },
            ]}
          />

          <div className="grid min-h-[410px] gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
            <section className="maintenance-panel overflow-hidden">
              <div className="border-b border-[#2a526f]/70 px-4 py-3">
                <h2 className="text-base font-semibold text-[#f3f8fc]">站點路徑</h2>
                <p className="mt-0.5 text-xs text-[#a9c0d1]">依實際執行順序排列。</p>
              </div>
              <div className="divide-y divide-[#2a526f]/50">
                {stations.map((station, index) => {
                  const count = items.filter((item) => item.station_id === station.id).length;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => setSelectedStationId(station.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#10263a]",
                        selectedStationId === station.id && "bg-[#10263a]"
                      )}
                    >
                      <span className="font-data flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4c8dff] text-xs font-semibold text-[#06111f]">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#f3f8fc]">{station.station_name}</span>
                        <span className="mt-0.5 block text-xs text-[#a9c0d1]">{count} 測項 · {(station.estimated_hours ?? 0).toFixed(1)}h</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="maintenance-panel overflow-hidden">
              {selectedStation ? (
                <div className="h-full">
                  <div className="flex items-start justify-between border-b border-[#2a526f]/70 px-4 py-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#f3f8fc]">{selectedStation.station_name}</h2>
                      <p className="mt-1 text-sm text-[#a9c0d1]">{selectedStation.description || "未填寫站點說明"}</p>
                    </div>
                    <Badge variant="outline" className="rounded-md">{stationItems.length} 測項</Badge>
                  </div>
                  <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
                    <div className="space-y-2">
                      {stationItems.map((item) => (
                        <div key={item.id} className="rounded-lg border border-[#2a526f] bg-[#10263a] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-[#f3f8fc]">{item.item_name}</span>
                            <span className="font-data shrink-0 text-xs text-cyan-100">{item.estimated_minutes ?? 0}m</span>
                          </div>
                          {item.description && <p className="mt-1 line-clamp-1 text-xs text-[#a9c0d1]">{item.description}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {stationContents.map((content) => (
                        <div key={content.id} className="rounded-lg border border-[#2a526f] bg-[#071522] px-3 py-2.5">
                          <div className="text-sm font-semibold text-[#f3f8fc]">{content.title}</div>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#a9c0d1]">{stripHtml(content.content) || "尚無內容"}</p>
                        </div>
                      ))}
                      {!stationContents.length && <div className="py-12 text-center text-sm text-[#a9c0d1]">尚未建立流程內容。</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#a9c0d1]">尚未建立站點。</div>
              )}
            </section>
          </div>
        </>
      ) : !editingVersionId ? (
        <div className="maintenance-panel flex min-h-32 items-center justify-center text-sm text-[#a9c0d1]">
          目前專案尚未建立可編輯的流程資料。
        </div>
      ) : (
        <div className="grid h-[calc(100vh-286px)] min-h-[470px] overflow-hidden rounded-xl border border-[#2a526f] bg-[#071522] xl:grid-cols-[240px_300px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col border-b border-[#2a526f] xl:border-b-0 xl:border-r">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2a526f]/70 px-3">
              <h2 className="text-sm font-semibold text-[#f3f8fc]">站點</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addStation}><Plus className="h-4 w-4" /><span className="sr-only">新增站點</span></Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1 pr-2">
                {stations.map((station, index) => (
                  <div
                    key={station.id}
                    draggable
                    onDragStart={() => setDraggedStationId(station.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedStationId || draggedStationId === station.id) return;
                      const ordered = [...stations];
                      const from = ordered.findIndex((entry) => entry.id === draggedStationId);
                      const to = ordered.findIndex((entry) => entry.id === station.id);
                      const [moved] = ordered.splice(from, 1);
                      ordered.splice(to, 0, moved);
                      setDraggedStationId(null);
                      reorderStations(ordered);
                    }}
                    className={cn(
                      "group flex items-center gap-1 rounded-lg border px-1.5 py-1.5",
                      selectedStationId === station.id ? "border-cyan-300/55 bg-[#10263a]" : "border-transparent hover:border-[#2a526f] hover:bg-[#0b1b2d]"
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#6f8ba0]" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedStationId(station.id)}>
                      <div className="truncate text-sm font-medium text-[#f3f8fc]">{station.station_name}</div>
                      <div className="font-data text-[10px] text-[#a9c0d1]">{items.filter((item) => item.station_id === station.id).length} items</div>
                    </button>
                    <div className="hidden shrink-0 group-hover:flex group-focus-within:flex">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveStation(station.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === stations.length - 1} onClick={() => moveStation(station.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </section>

          <section className="flex min-h-0 flex-col border-b border-[#2a526f] xl:border-b-0 xl:border-r">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#2a526f]/70 px-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">測試項目</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!selectedStation} onClick={addItem}><Plus className="h-4 w-4" /><span className="sr-only">新增測項</span></Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1 pr-2">
                {stationItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggedItemId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedItemId || draggedItemId === item.id) return;
                      const ordered = [...stationItems];
                      const from = ordered.findIndex((entry) => entry.id === draggedItemId);
                      const to = ordered.findIndex((entry) => entry.id === item.id);
                      const [moved] = ordered.splice(from, 1);
                      ordered.splice(to, 0, moved);
                      setDraggedItemId(null);
                      reorderItems(ordered);
                    }}
                    className={cn(
                      "group flex items-center gap-1 rounded-lg border px-1.5 py-2",
                      selectedItemId === item.id ? "border-[#4c8dff] bg-[#10263a]" : "border-transparent hover:border-[#2a526f] hover:bg-[#0b1b2d]"
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#6f8ba0]" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedItemId(item.id)}>
                      <div className="truncate text-sm font-medium text-[#f3f8fc]">{item.item_name}</div>
                      <div className="font-data text-[10px] text-[#a9c0d1]">{item.estimated_minutes ?? 0} min</div>
                    </button>
                    <div className="hidden shrink-0 group-hover:flex group-focus-within:flex">
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveItem(item.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === stationItems.length - 1} onClick={() => moveItem(item.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                {!stationItems.length && <div className="py-12 text-center text-xs text-[#a9c0d1]">此站點尚無測項。</div>}
              </div>
            </ScrollArea>
          </section>

          <section className="min-h-0 overflow-y-auto">
            {selectedStation ? (
              <div className="space-y-5 p-4">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#f3f8fc]">站點設定</h2>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateStation(selectedStation)}><Copy className="h-4 w-4" /><span className="sr-only">複製站點</span></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-rose-100"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>刪除 {selectedStation.station_name}？</AlertDialogTitle><AlertDialogDescription>此站點、測項與流程內容會立即刪除。</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => deleteStation(selectedStation)}>確認刪除</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <div className="space-y-2"><Label>站點名稱</Label><Input value={stationDraft.station_name} onChange={(event) => setStationDraft((current) => ({ ...current, station_name: event.target.value }))} /></div>
                    <div className="space-y-2"><Label>預估小時</Label><Input type="number" step="0.1" value={stationDraft.estimated_hours} onChange={(event) => setStationDraft((current) => ({ ...current, estimated_hours: Number(event.target.value) }))} /></div>
                    <div className="space-y-2 sm:col-span-2"><Label>站點說明</Label><Textarea rows={2} value={stationDraft.description} onChange={(event) => setStationDraft((current) => ({ ...current, description: event.target.value }))} /></div>
                  </div>
                  <Button size="sm" className="mt-3 h-8" onClick={saveStation}><Save className="mr-2 h-4 w-4" />儲存站點</Button>
                </div>

                {selectedItem && (
                  <div className="border-t border-[#2a526f]/70 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[#f3f8fc]">測項設定</h2>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateItem(selectedItem)}><Copy className="h-4 w-4" /><span className="sr-only">複製測項</span></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-100" onClick={() => deleteItem(selectedItem)}><Trash2 className="h-4 w-4" /><span className="sr-only">刪除測項</span></Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                      <div className="space-y-2"><Label>測項名稱</Label><Input value={itemDraft.item_name} onChange={(event) => setItemDraft((current) => ({ ...current, item_name: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>分鐘</Label><Input type="number" min={1} value={itemDraft.estimated_minutes} onChange={(event) => setItemDraft((current) => ({ ...current, estimated_minutes: Number(event.target.value) }))} /></div>
                      <div className="space-y-2 sm:col-span-2"><Label>測項說明</Label><Textarea rows={2} value={itemDraft.description} onChange={(event) => setItemDraft((current) => ({ ...current, description: event.target.value }))} /></div>
                    </div>
                    <Button size="sm" className="mt-3 h-8" onClick={saveItem}><Save className="mr-2 h-4 w-4" />儲存測項</Button>
                  </div>
                )}

                <div className="border-t border-[#2a526f]/70 pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#f3f8fc]">流程內容</h2>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => openContentDialog()}><Plus className="mr-2 h-4 w-4" />新增內容</Button>
                  </div>
                  <div className="space-y-2">
                    {stationContents.map((content) => (
                      <div key={content.id} className="rounded-lg border border-[#2a526f] bg-[#0b1b2d] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openContentDialog(content)}>
                            <div className="text-sm font-semibold text-[#f3f8fc]">{content.title}</div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#a9c0d1]">{stripHtml(content.content) || "尚無內容"}</p>
                          </button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-100" onClick={() => deleteContent(content.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {validationIssues.length > 0 && (
                  <div className="rounded-lg border border-amber-300/35 bg-amber-300/10 p-3 text-sm text-amber-100">
                    <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />流程資料需要修正</div>
                    <ul className="mt-2 space-y-1 text-xs">{validationIssues.slice(0, 6).map((message) => <li key={message}>• {message}</li>)}</ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#a9c0d1]">請先新增或選擇站點。</div>
            )}
          </section>
        </div>
      )}

      <Dialog open={contentDialogOpen} onOpenChange={setContentDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{editingContentId ? "編輯流程內容" : "新增流程內容"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>標題</Label><Input value={contentDraft.title} onChange={(event) => setContentDraft((current) => ({ ...current, title: event.target.value }))} /></div>
            <RichTextEditor content={contentDraft.content} onChange={(content) => setContentDraft((current) => ({ ...current, content }))} className="min-h-[320px]" />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setContentDialogOpen(false)}>取消</Button><Button disabled={!contentDraft.title.trim()} onClick={saveContent}>儲存內容</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
