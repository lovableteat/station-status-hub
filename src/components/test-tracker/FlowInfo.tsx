import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
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
  Loader2,
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFlowVersions } from "@/hooks/useFlowVersions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

import { reorderItemsByDrop, reorderStationsByDrop } from "./flowDragReorder";

type TestStation = Tables<"test_flow_stations">;
type TestItem = Tables<"test_flow_items">;
type StationContent = Tables<"station_contents">;
type FlowView = "overview" | "editor";
type StationAction = "add" | "remove" | null;

const REMOVED_STATIONS_VERSION_LABEL = "系統封存站點";
const FLOW_CONTENT_TONES = [
  "border-cyan-300/45 bg-cyan-300/[0.10]",
  "border-blue-300/45 bg-blue-300/[0.10]",
  "border-amber-300/45 bg-amber-300/[0.10]",
  "border-emerald-300/45 bg-emerald-300/[0.10]",
] as const;

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
  const { activeProject, activeProjectId, refreshProjects } = useTestProject();
  const { toast } = useToast();
  const {
    activeVersion,
    isLoadingVersions,
    refreshVersions,
    versions,
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
  const [dragOverStationId, setDragOverStationId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [isPreparingFlow, setIsPreparingFlow] = useState(false);
  const [stationAction, setStationAction] = useState<StationAction>(null);
  const [isWideEditor, setIsWideEditor] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1280px)").matches
  );

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const updateLayoutDirection = (event: MediaQueryListEvent) => setIsWideEditor(event.matches);
    setIsWideEditor(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateLayoutDirection);
    return () => mediaQuery.removeEventListener("change", updateLayoutDirection);
  }, []);

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

  const ensureEditableVersion = useCallback(async () => {
    if (!activeProjectId || isPreparingFlow) return null;
    setIsPreparingFlow(true);

    try {
      let version = activeVersion ?? versions[0] ?? null;

      if (!version) {
        const { data: existingVersion, error: existingError } = await supabase
          .from("test_flow_versions")
          .select("*")
          .eq("project_id", activeProjectId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;
        version = existingVersion;
      }

      if (!version) {
        const { data: createdVersion, error: createError } = await supabase
          .from("test_flow_versions")
          .insert({
            label: "目前流程",
            notes: "Direct-edit flow created from the maintenance workspace.",
            project_id: activeProjectId,
            published_at: new Date().toISOString(),
            status: "published",
            version_number: 1,
          })
          .select("*")
          .single();
        if (createError) throw createError;
        version = createdVersion;
      }

      if (version.status !== "published") {
        const { error: publishError } = await supabase
          .from("test_flow_versions")
          .update({ published_at: new Date().toISOString(), status: "published" })
          .eq("id", version.id)
          .eq("project_id", activeProjectId);
        if (publishError) throw publishError;
      }

      if (activeProject?.active_flow_version_id !== version.id) {
        const { error: projectError } = await supabase
          .from("test_projects")
          .update({ active_flow_version_id: version.id })
          .eq("id", activeProjectId);
        if (projectError) throw projectError;
      }

      await Promise.all([refreshProjects(), refreshVersions()]);
      return version.id;
    } catch (error) {
      console.error("Failed to prepare direct-edit flow:", error);
      toast({
        title: "無法建立流程資料",
        description: error instanceof Error ? error.message : "請稍後再試。",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsPreparingFlow(false);
    }
  }, [
    activeProject?.active_flow_version_id,
    activeProjectId,
    activeVersion,
    isPreparingFlow,
    refreshProjects,
    refreshVersions,
    toast,
    versions,
  ]);

  useEffect(() => {
    if (
      !activeVersion ||
      !activeProjectId ||
      (activeVersion.status === "published" && activeProject?.active_flow_version_id === activeVersion.id)
    ) {
      return;
    }
    void ensureEditableVersion();
  }, [activeProject?.active_flow_version_id, activeProjectId, activeVersion, ensureEditableVersion]);

  const addStation = async () => {
    if (stationAction) return;
    setStationAction("add");

    try {
      const versionId = await ensureEditableVersion();
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
      if (error) throw error;

      setStations((current) => [...current, data]);
      setSelectedStationId(data.id);
      setSelectedItemId(null);
      toast({ title: "站點已新增", description: "可立即在右側修改名稱與預估工時。" });
      await loadData();
    } catch (error) {
      toast({
        title: "新增站點失敗",
        description: error instanceof Error ? error.message : "請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setStationAction(null);
    }
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

  const getRemovedStationsVersion = async () => {
    if (!activeProjectId) return null;

    const { data: existingVersion, error: existingError } = await supabase
      .from("test_flow_versions")
      .select("*")
      .eq("project_id", activeProjectId)
      .eq("status", "retired")
      .eq("label", REMOVED_STATIONS_VERSION_LABEL)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingVersion) return existingVersion;

    const { data: latestVersion, error: latestError } = await supabase
      .from("test_flow_versions")
      .select("version_number")
      .eq("project_id", activeProjectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const { data: createdVersion, error: createError } = await supabase
      .from("test_flow_versions")
      .insert({
        label: REMOVED_STATIONS_VERSION_LABEL,
        notes: "Internal archive for stations removed from the active direct-edit flow.",
        project_id: activeProjectId,
        status: "retired",
        version_number: (latestVersion?.version_number ?? 0) + 1,
      })
      .select("*")
      .single();
    if (createError) {
      // Another operator may have created the shared archive at the same time.
      const { data: concurrentVersion, error: concurrentError } = await supabase
        .from("test_flow_versions")
        .select("*")
        .eq("project_id", activeProjectId)
        .eq("status", "retired")
        .eq("label", REMOVED_STATIONS_VERSION_LABEL)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (concurrentError || !concurrentVersion) throw createError;
      return concurrentVersion;
    }
    return createdVersion;
  };

  const removeStation = async (station: TestStation) => {
    if (stationAction) return;
    setStationAction("remove");

    try {
      const versionId = await ensureEditableVersion();
      if (!versionId || !activeProjectId) return;
      const removedVersion = await getRemovedStationsVersion();
      if (!removedVersion) throw new Error("無法準備站點封存空間。");

      const { data: removedStations, error: removedStationsError } = await supabase
        .from("test_flow_stations")
        .select("station_order")
        .eq("flow_version_id", removedVersion.id)
        .order("station_order", { ascending: false })
        .limit(1);
      if (removedStationsError) throw removedStationsError;
      const removedOrder = (removedStations?.[0]?.station_order ?? -1) + 1;

      const itemResult = await supabase
        .from("test_flow_items")
        .update({ flow_version_id: removedVersion.id })
        .eq("station_id", station.id)
        .eq("flow_version_id", versionId);
      if (itemResult.error) throw itemResult.error;

      const contentResult = await supabase
        .from("station_contents")
        .update({ flow_version_id: removedVersion.id })
        .eq("station_id", station.id)
        .eq("flow_version_id", versionId);
      if (contentResult.error) {
        await supabase
          .from("test_flow_items")
          .update({ flow_version_id: versionId })
          .eq("station_id", station.id)
          .eq("flow_version_id", removedVersion.id);
        throw contentResult.error;
      }

      const stationResult = await supabase
        .from("test_flow_stations")
        .update({ flow_version_id: removedVersion.id, station_order: removedOrder })
        .eq("id", station.id)
        .eq("project_id", activeProjectId)
        .eq("flow_version_id", versionId);
      if (stationResult.error) {
        await Promise.all([
          supabase
            .from("test_flow_items")
            .update({ flow_version_id: versionId })
            .eq("station_id", station.id)
            .eq("flow_version_id", removedVersion.id),
          supabase
            .from("station_contents")
            .update({ flow_version_id: versionId })
            .eq("station_id", station.id)
            .eq("flow_version_id", removedVersion.id),
        ]);
        throw stationResult.error;
      }

      setSelectedStationId(null);
      setSelectedItemId(null);
      toast({
        title: `${station.station_name} 已移出目前流程`,
        description: "既有機台進度與計時紀錄仍完整保留。",
      });
      await Promise.all([loadData(), refreshVersions()]);
    } catch (error) {
      toast({
        title: "移除站點失敗",
        description: error instanceof Error ? error.message : "請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setStationAction(null);
    }
  };

  const duplicateStation = async (station: TestStation) => {
    const versionId = await ensureEditableVersion();
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
    if (!canEdit || !editingVersionId || !activeProjectId || isReordering) return;
    const previousStations = stations;
    const normalizedStations = ordered.map((station, station_order) => ({
      ...station,
      station_order,
    }));
    setStations(normalizedStations);
    setIsReordering(true);
    try {
      const { error } = await supabase.rpc("reorder_test_flow_stations", {
        p_flow_version_id: editingVersionId,
        p_project_id: activeProjectId,
        p_station_ids: normalizedStations.map((station) => station.id),
      });
      if (error) throw error;
      toast({ title: "站點順序已更新" });
    } catch (error) {
      setStations(previousStations);
      toast({
        title: "站點排序失敗",
        description: error instanceof Error ? error.message : "資料未變更，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsReordering(false);
    }
  };

  const moveStation = (stationId: string, direction: -1 | 1) => {
    const currentIndex = stations.findIndex((station) => station.id === stationId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stations.length) return;
    const ordered = [...stations];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    void reorderStations(ordered);
  };

  const addItem = async () => {
    const versionId = await ensureEditableVersion();
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
    const versionId = await ensureEditableVersion();
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

  const persistItemArrangement = async (
    nextItems: TestItem[],
    stationId: string,
  ) => {
    if (!canEdit || !editingVersionId || !activeProjectId || isReordering) return;
    const previousItems = items;
    const orderedItemIds = nextItems
      .filter((item) => item.station_id === stationId)
      .sort((left, right) => left.item_order - right.item_order)
      .map((item) => item.id);

    setItems(nextItems);
    setIsReordering(true);
    try {
      const { error } = await supabase.rpc("reorder_test_flow_items", {
        p_flow_version_id: editingVersionId,
        p_item_ids: orderedItemIds,
        p_project_id: activeProjectId,
        p_station_id: stationId,
      });
      if (error) throw error;
      toast({ title: "測項順序已更新" });
    } catch (error) {
      setItems(previousItems);
      toast({
        title: "測項排序失敗",
        description: error instanceof Error ? error.message : "資料未變更，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsReordering(false);
    }
  };

  const reorderItems = (ordered: TestItem[]) => {
    if (!selectedStationId) return;
    const normalizedItems = ordered.map((item, item_order) => ({ ...item, item_order }));
    const orderedById = new Map(normalizedItems.map((item) => [item.id, item]));
    const nextItems = items.map((item) => orderedById.get(item.id) ?? item);
    void persistItemArrangement(nextItems, selectedStationId);
  };

  const moveItem = (itemId: string, direction: -1 | 1) => {
    const currentIndex = stationItems.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stationItems.length) return;
    const ordered = [...stationItems];
    [ordered[currentIndex], ordered[nextIndex]] = [ordered[nextIndex], ordered[currentIndex]];
    reorderItems(ordered);
  };

  const clearDragState = () => {
    setDraggedStationId(null);
    setDraggedItemId(null);
    setDragOverStationId(null);
    setDragOverItemId(null);
  };

  const handleStationDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    stationId: string,
  ) => {
    if (!canEdit || isReordering) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `station:${stationId}`);
    setDraggedStationId(stationId);
    setDraggedItemId(null);
  };

  const handleItemDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    if (!canEdit || isReordering) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `item:${itemId}`);
    setDraggedItemId(itemId);
    setDraggedStationId(null);
  };

  const handleStationDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    targetStationId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (draggedStationId) {
      if (draggedStationId === targetStationId) {
        clearDragState();
        return;
      }
      const nextStations = reorderStationsByDrop(
        stations,
        draggedStationId,
        targetStationId,
      );
      clearDragState();
      void reorderStations(nextStations);
      return;
    }

  };

  const handleItemDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    targetItem: TestItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedItemId || draggedItemId === targetItem.id) {
      clearDragState();
      return;
    }

    const ordered = reorderItemsByDrop(stationItems, draggedItemId, targetItem.id);
    clearDragState();
    reorderItems(ordered);
  };

  const handleItemListDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedItemId || !selectedStationId) {
      clearDragState();
      return;
    }

    const ordered = reorderItemsByDrop(stationItems, draggedItemId);
    clearDragState();
    reorderItems(ordered);
  };

  const openContentDialog = (content?: StationContent) => {
    setEditingContentId(content?.id ?? null);
    setContentDraft({ content: content?.content ?? "", title: content?.title ?? "" });
    setContentDialogOpen(true);
  };

  const saveContent = async () => {
    const versionId = await ensureEditableVersion();
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
    <div className="maintenance-page flex h-full min-h-0 flex-col gap-3">
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
            <span className="flex h-8 items-center gap-1.5 text-xs text-[#9eb8ca]">
              {isReordering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-200 motion-reduce:animate-none" />
              ) : (
                <GripVertical className="h-3.5 w-3.5 text-cyan-200" />
              )}
              {isReordering ? "正在儲存排序" : "拖曳卡片即可調整順序"}
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

          <div className="grid min-h-[410px] gap-3 xl:grid-cols-[290px_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-xl border border-[#2f6f92] bg-[#071a2b]">
              <div className="border-b border-[#397b9d]/70 bg-[linear-gradient(135deg,#16405f_0%,#0d2b43_62%,#091d30_100%)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/15 text-cyan-100">
                    <Route className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">站點路徑</h2>
                    <p className="mt-0.5 text-xs text-[#b9d8e8]">選擇站點查看測項與流程內容。</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-[#28506b]/70 bg-[#081a2b]">
                {stations.map((station, index) => {
                  const count = items.filter((item) => item.station_id === station.id).length;
                  const isSelected = selectedStationId === station.id;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => setSelectedStationId(station.id)}
                      aria-current={isSelected ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200",
                        isSelected
                          ? "bg-[#195071] text-white"
                          : "bg-[#091e31] text-[#d9e7f0] hover:bg-[#102d46]"
                      )}
                    >
                      <span
                        className={cn(
                          "font-data flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                          isSelected
                            ? "bg-[#69dcff] text-[#04121e]"
                            : "bg-[#173a58] text-[#a9dfff]"
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="block min-w-0 flex-1 truncate text-sm font-semibold">{station.station_name}</span>
                          {isSelected && (
                            <span className="shrink-0 rounded-md bg-cyan-100/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-50">
                              查看中
                            </span>
                          )}
                        </span>
                        <span className={cn("mt-0.5 block text-xs", isSelected ? "text-[#d2edf8]" : "text-[#91b2c7]")}>{count} 測項 · {(station.estimated_hours ?? 0).toFixed(1)}h</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-[#316f8f] bg-[#081827]">
              {selectedStation ? (
                <div className="h-full">
                  <div className="flex items-start justify-between border-b border-[#397b9d]/70 bg-[linear-gradient(100deg,#16415f_0%,#102b42_52%,#0a1e31_100%)] px-5 py-4">
                    <div>
                      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-cyan-100">
                        <Route className="h-3.5 w-3.5" />目前查看站點
                      </div>
                      <h2 className="text-xl font-semibold text-white">{selectedStation.station_name}</h2>
                      <p className="mt-1 text-sm text-[#c0d9e7]">{selectedStation.description || "未填寫站點說明"}</p>
                    </div>
                    <Badge variant="outline" className="rounded-md border-cyan-200/45 bg-cyan-200/15 text-cyan-50">{stationItems.length} 測項</Badge>
                  </div>
                  <div className="grid min-h-[330px] xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
                    <div className="border-b border-[#326785]/70 bg-[#0b2438] p-4 xl:border-b-0 xl:border-r">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-50">
                          <ListChecks className="h-4 w-4 text-[#78b8ff]" />測試項目
                        </div>
                        <span className="font-data text-xs text-[#9fc7e0]">{stationItems.length} 項</span>
                      </div>
                      <div className="space-y-2">
                      {stationItems.map((item) => (
                        <div key={item.id} className="rounded-lg border border-[#3f7da4] bg-[#12344d] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-white">{item.item_name}</span>
                            <span className="font-data shrink-0 rounded-md bg-cyan-200/15 px-1.5 py-0.5 text-xs text-cyan-50">{item.estimated_minutes ?? 0}m</span>
                          </div>
                          {item.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#b9d4e5]">{item.description}</p>}
                        </div>
                      ))}
                      {!stationItems.length && <div className="py-12 text-center text-sm text-[#9fc0d4]">此站點尚未建立測試項目。</div>}
                      </div>
                    </div>
                    <div className="bg-[#101d29] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-50">
                          <ClipboardCheck className="h-4 w-4 text-amber-200" />流程文件
                        </div>
                        <span className="font-data text-xs text-[#cbbd9e]">{stationContents.length} 區</span>
                      </div>
                      <div className="space-y-2">
                      {stationContents.map((content, index) => (
                        <div key={content.id} className={cn("rounded-lg border px-3 py-2.5", FLOW_CONTENT_TONES[index % FLOW_CONTENT_TONES.length])}>
                          <div className="text-sm font-semibold text-white">{content.title}</div>
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#d2e0e8]">{stripHtml(content.content) || "尚無內容"}</p>
                        </div>
                      ))}
                      {!stationContents.length && <div className="py-12 text-center text-sm text-[#aebfca]">尚未建立流程內容。</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-100"><Route className="h-5 w-5" /></div>
                  <div><div className="text-base font-semibold text-[#f3f8fc]">尚未建立測試站點</div><p className="mt-1 text-sm text-[#a9c0d1]">切換到流程編輯，建立第一站後即可加入測項。</p></div>
                  <Button
                    size="sm"
                    disabled={isPreparingFlow || stationAction !== null}
                    onClick={() => {
                      setFlowView("editor");
                      void addStation();
                    }}
                  >
                    {isPreparingFlow ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="mr-2 h-4 w-4" />}
                    {isPreparingFlow ? "建立中" : "建立站點"}
                  </Button>
                </div>
              )}
            </section>
          </div>
        </>
      ) : !editingVersionId ? (
        <div className="maintenance-panel flex min-h-[360px] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100"><Route className="h-6 w-6" /></div>
          <div><h2 className="text-lg font-semibold text-[#f3f8fc]">建立第一個測試站點</h2><p className="mt-1 max-w-md text-sm text-[#a9c0d1]">系統會自動準備流程資料並建立站點，不需要建立版本或草稿。</p></div>
          <Button onClick={() => void addStation()} disabled={isPreparingFlow || stationAction !== null} className="min-w-36">
            {isPreparingFlow || stationAction === "add" ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="mr-2 h-4 w-4" />}
            {isPreparingFlow || stationAction === "add" ? "準備流程中" : "建立第一個站點"}
          </Button>
        </div>
      ) : (
        <ResizablePanelGroup
          autoSaveId={`maintenance-flow-editor:${activeProjectId ?? "default"}:${isWideEditor ? "columns" : "rows"}`}
          className="min-h-[470px] flex-1 overflow-hidden rounded-xl border border-[#2a526f] bg-[#071522]"
          direction={isWideEditor ? "horizontal" : "vertical"}
          data-testid="flow-editor-panels"
        >
          <ResizablePanel
            defaultSize={isWideEditor ? 15 : 27}
            minSize={isWideEditor ? 12 : 18}
            maxSize={isWideEditor ? 30 : 42}
            order={1}
          >
          <section className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2a526f]/70 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[#f3f8fc]">站點</h2>
                  <Badge variant="outline" className="h-5 rounded-md border-[#2a526f] px-1.5 font-data text-[10px] text-cyan-100">
                    {stations.length}
                  </Badge>
                </div>
                <p
                  className="mt-0.5 truncate text-[11px] text-[#8facbf]"
                  title="拖曳站點可調整順序"
                >
                  拖曳排序
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-cyan-300/35 bg-cyan-300/10 px-2.5 text-cyan-50 hover:bg-cyan-300/20"
                onClick={() => void addStation()}
                disabled={isPreparingFlow || stationAction !== null || isReordering}
                data-testid="add-station-button"
              >
                {stationAction === "add" || isPreparingFlow ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                新增
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-1 pr-2">
                {stations.map((station, index) => (
                  <div
                    key={station.id}
                    draggable={canEdit && !isReordering}
                    aria-grabbed={draggedStationId === station.id}
                    data-testid={`flow-station-${station.id}`}
                    onDragStart={(event) => handleStationDragStart(event, station.id)}
                    onDragOver={(event) => {
                      if (!draggedStationId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverStationId(station.id);
                      setDragOverItemId(null);
                    }}
                    onDrop={(event) => handleStationDrop(event, station.id)}
                    onDragEnd={clearDragState}
                    className={cn(
                      "group relative flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-[border-color,background-color,opacity] duration-150 motion-reduce:transition-none",
                      selectedStationId === station.id ? "border-cyan-300/55 bg-[#10263a]" : "border-transparent hover:border-[#2a526f] hover:bg-[#0b1b2d]",
                      draggedStationId === station.id && "opacity-45",
                      dragOverStationId === station.id && draggedStationId && draggedStationId !== station.id && "border-cyan-200 bg-cyan-300/15",
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#8fb2c8] active:cursor-grabbing" />
                    <button type="button" className="min-w-0 flex-1 pr-14 text-left" onClick={() => setSelectedStationId(station.id)}>
                      <div className="truncate text-sm font-medium text-[#f3f8fc]">{station.station_name}</div>
                      <div className="flex items-center gap-1.5 font-data text-[10px] text-[#a9c0d1]">
                        <span>{items.filter((item) => item.station_id === station.id).length} items</span>
                      </div>
                    </button>
                    <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition-opacity motion-reduce:transition-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <Button aria-label={`${station.station_name} 上移`} variant="ghost" size="icon" className="h-7 w-7" disabled={isReordering || index === 0} onClick={() => moveStation(station.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button aria-label={`${station.station_name} 下移`} variant="ghost" size="icon" className="h-7 w-7" disabled={isReordering || index === stations.length - 1} onClick={() => moveStation(station.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </section>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            aria-label={isWideEditor ? "調整站點欄寬" : "調整站點區高度"}
            className="w-2 shrink-0 bg-[#10263a] transition-colors duration-200 hover:bg-cyan-300/35 focus-visible:bg-cyan-300/35 data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full"
          />

          <ResizablePanel
            defaultSize={isWideEditor ? 19 : 28}
            minSize={isWideEditor ? 14 : 18}
            maxSize={isWideEditor ? 36 : 42}
            order={2}
          >
          <section className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2a526f]/70 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-[#f3f8fc]">測試項目</h2>
                  <Badge variant="outline" className="h-5 rounded-md border-[#2a526f] px-1.5 font-data text-[10px] text-blue-100">
                    {stationItems.length}
                  </Badge>
                </div>
                <p
                  className="mt-0.5 truncate text-[11px] text-[#8facbf]"
                  title="拖曳測試項目可調整同站順序"
                >
                  {selectedStation ? `${selectedStation.station_name} · 拖曳換序` : "請先選擇站點"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-blue-300/35 bg-blue-300/10 px-2.5 text-blue-50 hover:bg-blue-300/20"
                disabled={!selectedStation || isReordering}
                onClick={() => void addItem()}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />新增
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div
                className={cn(
                  "min-h-[200px] space-y-1 pr-2 rounded-lg transition-colors duration-150 motion-reduce:transition-none",
                  draggedItemId && !dragOverItemId && "bg-blue-300/[0.04]",
                )}
                data-testid="flow-item-drop-zone"
                onDragOver={(event) => {
                  if (!draggedItemId || event.target !== event.currentTarget) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverItemId(null);
                }}
                onDrop={handleItemListDrop}
              >
                {stationItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={canEdit && !isReordering}
                    aria-grabbed={draggedItemId === item.id}
                    data-testid={`flow-item-${item.id}`}
                    onDragStart={(event) => handleItemDragStart(event, item.id)}
                    onDragOver={(event) => {
                      if (!draggedItemId) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverItemId(item.id);
                      setDragOverStationId(null);
                    }}
                    onDrop={(event) => handleItemDrop(event, item)}
                    onDragEnd={clearDragState}
                    className={cn(
                      "group relative flex items-center gap-1 rounded-lg border px-1.5 py-2 transition-[border-color,background-color,opacity] duration-150 motion-reduce:transition-none",
                      selectedItemId === item.id ? "border-[#4c8dff] bg-[#10263a]" : "border-transparent hover:border-[#2a526f] hover:bg-[#0b1b2d]",
                      draggedItemId === item.id && "opacity-45",
                      dragOverItemId === item.id && draggedItemId !== item.id && "border-blue-200 bg-blue-300/15",
                    )}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[#8fb2c8] active:cursor-grabbing" />
                    <button type="button" className="min-w-0 flex-1 pr-14 text-left" onClick={() => setSelectedItemId(item.id)}>
                      <div className="truncate text-sm font-medium text-[#f3f8fc]">{item.item_name}</div>
                      <div className="font-data text-[10px] text-[#a9c0d1]">{item.estimated_minutes ?? 0} min</div>
                    </button>
                    <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition-opacity motion-reduce:transition-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                      <Button aria-label={`${item.item_name} 上移`} variant="ghost" size="icon" className="h-7 w-7" disabled={isReordering || index === 0} onClick={() => moveItem(item.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button aria-label={`${item.item_name} 下移`} variant="ghost" size="icon" className="h-7 w-7" disabled={isReordering || index === stationItems.length - 1} onClick={() => moveItem(item.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                {!stationItems.length && <div className="py-12 text-center text-xs text-[#a9c0d1]">此站點尚無測項。</div>}
              </div>
            </ScrollArea>
          </section>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            aria-label={isWideEditor ? "調整測試項目欄寬" : "調整測試項目區高度"}
            className="w-2 shrink-0 bg-[#10263a] transition-colors duration-200 hover:bg-cyan-300/35 focus-visible:bg-cyan-300/35 data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full"
          />

          <ResizablePanel
            defaultSize={isWideEditor ? 66 : 45}
            minSize={isWideEditor ? 34 : 28}
            order={3}
          >
          <section className="h-full min-h-0 overflow-y-auto">
            {selectedStation ? (
              <div className="space-y-5 p-4">
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-[#f3f8fc]">站點設定</h2>
                      <p className="mt-0.5 text-[11px] text-[#8facbf]">修改名稱、工時，或將站點移出目前流程。</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-[#2a526f] px-2.5"
                        onClick={() => void duplicateStation(selectedStation)}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />複製站點
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-rose-300/35 bg-rose-300/10 px-2.5 text-rose-100 hover:bg-rose-300/20 hover:text-rose-50"
                            disabled={stationAction !== null}
                            data-testid="remove-station-button"
                          >
                            {stationAction === "remove" ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            移除站點
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>從目前流程移除「{selectedStation.station_name}」？</AlertDialogTitle>
                            <AlertDialogDescription>
                              站點與其中 {stationItems.length} 個測試項目將不再出現在目前流程；既有機台的測試進度與計時紀錄會保留，不會刪除歷史資料。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-rose-500 text-white hover:bg-rose-400"
                              onClick={() => void removeStation(selectedStation)}
                            >
                              確認移出流程
                            </AlertDialogAction>
                          </AlertDialogFooter>
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
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="text-base font-semibold text-[#f3f8fc]">目前沒有站點</div>
                <p className="text-sm text-[#a9c0d1]">新增站點後，可在右側設定名稱、預估工時與測試項目。</p>
                <Button size="sm" onClick={() => void addStation()} disabled={isPreparingFlow || stationAction !== null}>{isPreparingFlow || stationAction === "add" ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="mr-2 h-4 w-4" />}新增站點</Button>
              </div>
            )}
          </section>
          </ResizablePanel>
        </ResizablePanelGroup>
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
