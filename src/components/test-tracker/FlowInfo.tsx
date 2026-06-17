import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CalendarDays, Clock, Cpu, Gauge, HardDrive, Layers, ListChecks, Monitor, Route, Settings, Edit, Plus, Save, Trash2, Zap } from "lucide-react";
import { TestItemManager } from "./TestItemManager";
import { StationContentManager } from "./StationContentManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
  description: string;
  estimated_hours: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes: number;
}

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
}

const flowButtonClass =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-22px_hsl(var(--primary)/0.8)] active:translate-y-px";

const flowGhostButtonClass =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-[0_12px_24px_-20px_hsl(var(--primary)/0.75)] active:translate-y-px";

const flowDangerButtonClass =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-destructive/10 hover:text-destructive hover:shadow-[0_12px_24px_-20px_hsl(var(--destructive)/0.7)] active:translate-y-px";

const stationThemes = [
  {
    shell: "border-blue-300/45 bg-blue-500/15 text-blue-50 hover:border-blue-200/65 hover:bg-blue-500/20",
    icon: "border-blue-200/35 bg-blue-400/20 text-blue-100",
    badge: "border-blue-200/35 bg-blue-400/20 text-blue-100",
    accent: "text-blue-200",
    rail: "from-blue-300/80 via-blue-400/45 to-transparent",
  },
  {
    shell: "border-amber-300/45 bg-amber-500/15 text-amber-50 hover:border-amber-200/65 hover:bg-amber-500/20",
    icon: "border-amber-200/35 bg-amber-400/20 text-amber-100",
    badge: "border-amber-200/35 bg-amber-400/20 text-amber-100",
    accent: "text-amber-200",
    rail: "from-amber-300/80 via-amber-400/45 to-transparent",
  },
  {
    shell: "border-rose-300/45 bg-rose-500/15 text-rose-50 hover:border-rose-200/65 hover:bg-rose-500/20",
    icon: "border-rose-200/35 bg-rose-400/20 text-rose-100",
    badge: "border-rose-200/35 bg-rose-400/20 text-rose-100",
    accent: "text-rose-200",
    rail: "from-rose-300/80 via-rose-400/45 to-transparent",
  },
  {
    shell: "border-violet-300/45 bg-violet-500/15 text-violet-50 hover:border-violet-200/65 hover:bg-violet-500/20",
    icon: "border-violet-200/35 bg-violet-400/20 text-violet-100",
    badge: "border-violet-200/35 bg-violet-400/20 text-violet-100",
    accent: "text-violet-200",
    rail: "from-violet-300/80 via-violet-400/45 to-transparent",
  },
];

export function FlowInfo() {
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [systems, setSystems] = useState<unknown[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [isStationDialogOpen, setIsStationDialogOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<TestStation | null>(null);
  const [stationFormData, setStationFormData] = useState({
    station_name: '',
    description: '',
    estimated_hours: 0
  });

  // Station Management State
  const [newStationForm, setNewStationForm] = useState({
    station_name: '',
    station_order: 0,
    description: '',
    estimated_hours: 8
  });
  const [isNewStationDialogOpen, setIsNewStationDialogOpen] = useState(false);
  const [editingNewStation, setEditingNewStation] = useState<TestStation | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (stations.length === 0) {
      setSelectedStationId(null);
      return;
    }

    if (!selectedStationId || !stations.some((station) => station.id === selectedStationId)) {
      setSelectedStationId(stations[0].id);
    }
  }, [stations, selectedStationId]);

  const loadData = async () => {
    try {
      const [stationsRes, itemsRes, contentsRes, systemsRes] = await Promise.all([
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('station_contents').select('*').order('order_num'),
        supabase.from('test_systems').select('*')
      ]);

      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      if (contentsRes.data) setStationContents(contentsRes.data);
      if (systemsRes.data) setSystems(systemsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Calculate total estimated hours for each station based on test items
  const getCalculatedStationHours = (stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
    return (totalMinutes / 60).toFixed(1); // Convert to hours with 1 decimal place
  };

  const getStationIcon = (stationName: string) => {
    if (stationName.includes('ME')) return <Settings className="h-5 w-5" />;
    if (stationName.includes('BIOS')) return <Zap className="h-5 w-5" />;
    if (stationName.includes('EE')) return <HardDrive className="h-5 w-5" />;
    if (stationName.includes('SIT')) return <Cpu className="h-5 w-5" />;
    if (stationName.includes('Station 4')) return <Monitor className="h-5 w-5" />;
    return <Settings className="h-5 w-5" />;
  };

  const getStationTheme = (index: number) => {
    return stationThemes[index % stationThemes.length];
  };

  const handleSaveStation = async () => {
    if (!editingStation) return;
    
    try {
      await supabase
        .from('test_flow_stations')
        .update({
          station_name: stationFormData.station_name,
          description: stationFormData.description,
          estimated_hours: stationFormData.estimated_hours
        })
        .eq('id', editingStation.id);

      toast({ title: "更新成功", description: "站點資訊已更新" });
      setIsStationDialogOpen(false);
      setEditingStation(null);
      loadData();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新站點資訊",
        variant: "destructive"
      });
    }
  };

  const openEditStationDialog = (station: TestStation) => {
    setStationFormData({
      station_name: station.station_name,
      description: station.description || '',
      estimated_hours: station.estimated_hours || 0
    });
    setEditingStation(station);
    setIsStationDialogOpen(true);
  };

  // Station Management Functions
  const handleAddNewStation = () => {
    setEditingNewStation(null);
    setNewStationForm({ 
      station_name: '', 
      station_order: stations.length, 
      description: '', 
      estimated_hours: 8 
    });
    setIsNewStationDialogOpen(true);
  };

  const handleEditNewStation = (station: TestStation) => {
    setEditingNewStation(station);
    setNewStationForm({
      station_name: station.station_name,
      station_order: station.station_order,
      description: station.description || '',
      estimated_hours: station.estimated_hours || 8
    });
    setIsNewStationDialogOpen(true);
  };

  const handleSaveNewStation = async () => {
    try {
      if (editingNewStation) {
        // Update existing station
        await supabase
          .from('test_flow_stations')
          .update({
            station_name: newStationForm.station_name,
            station_order: newStationForm.station_order,
            description: newStationForm.description,
            estimated_hours: newStationForm.estimated_hours
          })
          .eq('id', editingNewStation.id);

        toast({ title: "更新成功", description: "測試站點已更新，測試進度表將自動更新" });
      } else {
        // Add new station
        await supabase
          .from('test_flow_stations')
          .insert({
            station_name: newStationForm.station_name,
            station_order: newStationForm.station_order,
            description: newStationForm.description,
            estimated_hours: newStationForm.estimated_hours
          });

        toast({ title: "新增成功", description: "測試站點已新增，測試進度表將自動更新" });
      }

      setIsNewStationDialogOpen(false);
      setEditingNewStation(null);
      loadData();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存站點資料",
        variant: "destructive"
      });
    }
  };

  const handleDeleteNewStation = async (stationId: string) => {
    try {
      await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationId);

      toast({ title: "刪除成功", description: "測試站點已刪除" });
      loadData();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除站點",
        variant: "destructive"
      });
    }
  };

  // Calculate dynamic summary data - 修正計算邏輯
  const totalSystems = systems.length;
  
  // 計算每個站點的實際測試時間（基於測試項目預估時間）
  const getStationEstimatedHours = (stationId: string) => {
    const stationItems = items.filter(item => item.station_id === stationId);
    const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
    return totalMinutes / 60; // 轉換為小時
  };

  // 計算總測試時間（所有站點時間加總）
  const totalHours = stations.reduce((total, station) => {
    return total + getStationEstimatedHours(station.id);
  }, 0);

  // 找出瓶頸站點（耗時最長的站點）
  const bottleneckHours = Math.max(...stations.map(station => 
    getStationEstimatedHours(station.id)
  ));

  // 預計完成天數（固定為12天）
  const getEstimatedDays = () => {
    return 12;
  };

  // 計算日產能（基於瓶頸站點）
  const getDailyThroughput = () => {
    if (bottleneckHours === 0) return 0;
    return Math.floor(8 / bottleneckHours) || 1;
  };

  const selectedStation = stations.find((station) => station.id === selectedStationId) || stations[0];
  const selectedStationIndex = selectedStation ? stations.findIndex((station) => station.id === selectedStation.id) : -1;
  const selectedStationTheme = getStationTheme(Math.max(selectedStationIndex, 0));
  const selectedStationItems = selectedStation
    ? items
        .filter((item) => item.station_id === selectedStation.id)
        .sort((a, b) => a.item_order - b.item_order)
    : [];
  const selectedStationContents = selectedStation
    ? stationContents.filter((content) => content.station_id === selectedStation.id)
    : [];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="overflow-hidden rounded-[2rem] border border-blue-200/25 bg-[radial-gradient(circle_at_12%_18%,hsl(221_83%_63%/0.24),transparent_34%),linear-gradient(135deg,hsl(222_32%_18%)_0%,hsl(220_30%_15%)_48%,hsl(224_42%_11%)_100%)] p-5 shadow-[0_28px_80px_-48px_hsl(220_50%_2%/0.95)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-3 border-blue-200/35 bg-blue-400/15 px-3 py-1 text-blue-100">
              <Route className="mr-1 h-3.5 w-3.5" />
              L10 Flow Cockpit
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">GB300 L10 測試流程說明</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              改成一屏掌握站點、工時與測項；點選站點即可查看詳細內容，不需要一路往下滑找資料。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setActiveTab("overview")}
              className={`h-11 border-blue-200/35 bg-blue-400/15 px-5 text-blue-50 hover:border-blue-100/60 hover:bg-blue-400/25 ${flowButtonClass}`}
            >
              <Route className="mr-2 h-4 w-4" />
              查看流程
            </Button>
            <Button
              variant="outline"
              onClick={() => setActiveTab("manage")}
              className={`h-11 border-amber-200/35 bg-amber-400/15 px-5 text-amber-50 hover:border-amber-100/60 hover:bg-amber-400/25 ${flowButtonClass}`}
            >
              <Edit className="mr-2 h-4 w-4" />
              管理流程
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-2xl border border-slate-500/45 bg-slate-800/80 p-1 shadow-sm">
          <TabsTrigger
            value="overview"
            className="rounded-xl transition-all duration-200 hover:bg-blue-400/15 hover:text-blue-100 data-[state=active]:bg-blue-400/20 data-[state=active]:text-blue-50 data-[state=active]:shadow-sm"
          >
            流程總覽
          </TabsTrigger>
          <TabsTrigger
            value="manage"
            className="rounded-xl transition-all duration-200 hover:bg-amber-400/15 hover:text-amber-100 data-[state=active]:bg-amber-400/20 data-[state=active]:text-amber-50 data-[state=active]:shadow-sm"
          >
            管理測試項目
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <section className="overflow-hidden rounded-[2rem] border border-slate-500/45 bg-slate-800/85 shadow-[0_22px_70px_-44px_hsl(220_50%_2%/0.9)]">
            <div className="border-b border-slate-500/35 bg-slate-700/55 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-200/30 bg-blue-400/15 text-blue-100">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-50">測試流程總覽</h2>
                      <p className="mt-1 text-sm text-slate-300">站點、工時、測項與流程內容集中在同一個工作區。</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[680px]">
                  <div className="rounded-2xl border border-blue-200/30 bg-blue-500/15 p-4">
                    <Monitor className="mb-3 h-4 w-4 text-blue-100" />
                    <div className="text-2xl font-bold text-blue-50">{totalSystems}</div>
                    <div className="text-xs text-blue-100/75">測試系統</div>
                  </div>
                  <div className="rounded-2xl border border-violet-200/30 bg-violet-500/15 p-4">
                    <ListChecks className="mb-3 h-4 w-4 text-violet-100" />
                    <div className="text-2xl font-bold text-violet-50">{items.length}</div>
                    <div className="text-xs text-violet-100/75">測試項目</div>
                  </div>
                  <div className="rounded-2xl border border-amber-200/30 bg-amber-500/15 p-4">
                    <Clock className="mb-3 h-4 w-4 text-amber-100" />
                    <div className="text-2xl font-bold text-amber-50">{totalHours.toFixed(1)}h</div>
                    <div className="text-xs text-amber-100/75">單機總時數</div>
                  </div>
                  <div className="rounded-2xl border border-rose-200/30 bg-rose-500/15 p-4">
                    <CalendarDays className="mb-3 h-4 w-4 text-rose-100" />
                    <div className="text-2xl font-bold text-rose-50">{getEstimatedDays()}</div>
                    <div className="text-xs text-rose-100/75">預計天數</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-500/40 bg-slate-900/35 p-4">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-50">站點路徑</h3>
                      <p className="text-sm text-slate-300">點選站點，右側會切換成該站的測項與流程內容。</p>
                    </div>
                    <Badge variant="outline" className="w-fit border-blue-200/30 bg-blue-400/15 px-3 py-1 text-blue-100">
                      {stations.length} 個站點
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                    {stations.map((station, index) => {
                      const theme = getStationTheme(index);
                      const isSelected = selectedStation?.id === station.id;
                      const stationItemCount = items.filter((item) => item.station_id === station.id).length;

                      return (
                        <button
                          key={station.id}
                          type="button"
                          onClick={() => setSelectedStationId(station.id)}
                          className={`group relative min-h-[168px] rounded-3xl border p-4 text-left shadow-[0_20px_42px_-34px_hsl(220_50%_2%/0.9)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_28px_58px_-38px_hsl(220_50%_2%/0.95)] ${theme.shell} ${isSelected ? "ring-2 ring-blue-100/55" : ""}`}
                        >
                          <div className={`mb-5 h-1.5 rounded-full bg-gradient-to-r ${theme.rail}`} />
                          <div className="flex items-start justify-between gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${theme.icon}`}>
                              {getStationIcon(station.station_name)}
                            </div>
                            <Badge variant="outline" className={`text-xs ${theme.badge}`}>
                              #{index + 1}
                            </Badge>
                          </div>
                          <div className="mt-5">
                            <div className="line-clamp-2 text-base font-semibold text-slate-50">{station.station_name}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-slate-200">
                                {getCalculatedStationHours(station.id)}h
                              </span>
                              <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-slate-200">
                                {stationItemCount} 測項
                              </span>
                            </div>
                          </div>
                          <ArrowRight className={`absolute bottom-4 right-4 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 ${theme.accent}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-blue-200/30 bg-blue-500/15 p-5">
                    <Gauge className="mb-3 h-5 w-5 text-blue-100" />
                    <div className="text-2xl font-bold text-blue-50">{getDailyThroughput()}</div>
                    <div className="text-sm text-blue-100/75">預估日產能</div>
                  </div>
                  <div className="rounded-3xl border border-amber-200/30 bg-amber-500/15 p-5">
                    <Clock className="mb-3 h-5 w-5 text-amber-100" />
                    <div className="text-2xl font-bold text-amber-50">{bottleneckHours > 0 ? bottleneckHours.toFixed(1) : "0.0"}h</div>
                    <div className="text-sm text-amber-100/75">瓶頸站點工時</div>
                  </div>
                  <div className="rounded-3xl border border-violet-200/30 bg-violet-500/15 p-5">
                    <Route className="mb-3 h-5 w-5 text-violet-100" />
                    <div className="text-2xl font-bold text-violet-50">{selectedStationIndex + 1 || "-"}</div>
                    <div className="text-sm text-violet-100/75">目前查看站點</div>
                  </div>
                </div>
              </div>

              <aside className="space-y-5">
                {selectedStation ? (
                  <>
                    <div className={`rounded-3xl border p-5 ${selectedStationTheme.shell}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${selectedStationTheme.icon}`}>
                            {getStationIcon(selectedStation.station_name)}
                          </div>
                          <div>
                            <Badge variant="outline" className={`mb-2 ${selectedStationTheme.badge}`}>
                              Station {selectedStationIndex + 1}
                            </Badge>
                            <h3 className="text-xl font-semibold text-slate-50">{selectedStation.station_name}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-200/85">
                              {selectedStation.description || "尚未填寫站點描述。"}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditStationDialog(selectedStation)}
                          className={`shrink-0 border-white/20 bg-white/10 text-slate-50 hover:bg-white/15 ${flowGhostButtonClass}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                          <div className="text-xs text-slate-300">站點工時</div>
                          <div className="mt-1 text-xl font-bold text-slate-50">{getCalculatedStationHours(selectedStation.id)}h</div>
                        </div>
                        <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                          <div className="text-xs text-slate-300">測項數量</div>
                          <div className="mt-1 text-xl font-bold text-slate-50">{selectedStationItems.length}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-500/45 bg-slate-700/55 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-50">測試項目</h3>
                          <p className="text-sm text-slate-300">只顯示目前站點，避免整頁拉太長。</p>
                        </div>
                        <Badge variant="outline" className="border-violet-200/30 bg-violet-400/15 text-violet-100">
                          {selectedStationItems.length} items
                        </Badge>
                      </div>
                      <div className="max-h-[330px] space-y-3 overflow-y-auto pr-1">
                        {selectedStationItems.length > 0 ? (
                          selectedStationItems.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-slate-500/40 bg-slate-800/75 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-50">{item.item_name}</div>
                                  <p className="mt-1 text-xs leading-5 text-slate-300">{item.description || "尚未填寫測項描述。"}</p>
                                </div>
                                <Badge variant="outline" className="shrink-0 border-amber-200/30 bg-amber-400/15 text-xs text-amber-100">
                                  {item.estimated_minutes}min
                                </Badge>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-500/45 bg-slate-800/55 p-6 text-center text-sm text-slate-300">
                            此站點尚未新增測試項目。
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-500/45 bg-slate-800/70 p-8 text-center text-slate-300">
                    尚未建立站點資料。
                  </div>
                )}
              </aside>
            </div>

            {selectedStation && (
              <div className="border-t border-slate-500/35 bg-slate-900/25 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200/30 bg-rose-400/15 text-rose-100">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-50">流程內容管理</h3>
                    <p className="text-sm text-slate-300">目前只展開 {selectedStation.station_name} 的內容。</p>
                  </div>
                </div>
                <div className="max-h-[430px] overflow-y-auto pr-1 [&>div]:border-slate-500/45 [&>div]:bg-slate-800/80">
                  <StationContentManager
                    stationId={selectedStation.id}
                    stationName={selectedStation.station_name}
                    contents={selectedStationContents}
                    onUpdate={loadData}
                  />
                </div>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="manage" className="mt-5 space-y-5">
          <Card className="overflow-hidden border-amber-200/25 bg-slate-800/85">
            <CardHeader className="bg-amber-500/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-50">
                  <Settings className="h-5 w-5 text-amber-100" />
                  站點管理
                </CardTitle>
                <Button onClick={handleAddNewStation} className={`bg-amber-400/20 text-amber-50 hover:bg-amber-400/30 ${flowButtonClass}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  新增站點
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>站點名稱</TableHead>
                    <TableHead>順序</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>預估時間</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stations.map((station) => (
                    <TableRow key={station.id}>
                      <TableCell className="font-medium">{station.station_name}</TableCell>
                      <TableCell>{station.station_order}</TableCell>
                      <TableCell>{station.description || '-'}</TableCell>
                      <TableCell>{station.estimated_hours || 0} 小時</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditNewStation(station)}
                            className={flowGhostButtonClass}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className={flowDangerButtonClass}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認刪除</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要刪除站點 "{station.station_name}" 嗎？此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className={flowButtonClass}>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteNewStation(station.id)}
                                  className={flowDangerButtonClass}
                                >
                                  刪除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="rounded-[2rem] border border-violet-200/25 bg-slate-800/85 p-4">
            <TestItemManager
              stations={stations}
              items={items}
              onDataChange={loadData}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Station Edit Dialog */}
      <Dialog open={isStationDialogOpen} onOpenChange={setIsStationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯站點資訊</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>站點名稱</Label>
              <Input
                value={stationFormData.station_name}
                onChange={(e) => setStationFormData({ ...stationFormData, station_name: e.target.value })}
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={stationFormData.description}
                onChange={(e) => setStationFormData({ ...stationFormData, description: e.target.value })}
              />
            </div>
            <div>
              <Label>預估時間 (小時)</Label>
              <Input
                type="number"
                value={stationFormData.estimated_hours}
                onChange={(e) => setStationFormData({ ...stationFormData, estimated_hours: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsStationDialogOpen(false)}
                className={flowButtonClass}
              >
                取消
              </Button>
              <Button onClick={handleSaveStation} className={flowButtonClass}>
                <Save className="h-4 w-4 mr-2" />
                儲存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Station Add/Edit Dialog */}
      <Dialog open={isNewStationDialogOpen} onOpenChange={setIsNewStationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingNewStation ? '編輯站點資訊' : '新增測試站點'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>站點名稱</Label>
              <Input
                value={newStationForm.station_name}
                onChange={(e) => setNewStationForm({ ...newStationForm, station_name: e.target.value })}
                placeholder="請輸入站點名稱"
              />
            </div>
            <div>
              <Label>順序</Label>
              <Input
                type="number"
                value={newStationForm.station_order}
                onChange={(e) => setNewStationForm({ ...newStationForm, station_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={newStationForm.description}
                onChange={(e) => setNewStationForm({ ...newStationForm, description: e.target.value })}
                placeholder="請輸入站點描述"
              />
            </div>
            <div>
              <Label>預估時間 (小時)</Label>
              <Input
                type="number"
                step="0.1"
                value={newStationForm.estimated_hours}
                onChange={(e) => setNewStationForm({ ...newStationForm, estimated_hours: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsNewStationDialogOpen(false)}
                className={flowButtonClass}
              >
                取消
              </Button>
              <Button onClick={handleSaveNewStation} className={flowButtonClass}>
                <Save className="h-4 w-4 mr-2" />
                儲存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
