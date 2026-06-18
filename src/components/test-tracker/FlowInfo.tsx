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
import { BackButton } from "@/components/common/BackButton";

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
    shell: "border-border/80 bg-card text-foreground hover:border-primary/55 hover:bg-primary/[0.06]",
    icon: "border-primary/30 bg-primary/10 text-primary",
    badge: "border-primary/30 bg-primary/10 text-primary",
    accent: "text-primary",
    rail: "from-primary via-primary/55 to-transparent",
    contentPanel: "border-border/70 bg-card/90",
    contentIcon: "border-primary/30 bg-primary/10 text-primary",
    contentBadge: "border-primary/30 bg-primary/10 text-primary",
    contentBar: "from-primary via-primary/55 to-transparent",
  },
  {
    shell: "border-border/80 bg-card text-foreground hover:border-primary/55 hover:bg-primary/[0.06]",
    icon: "border-primary/30 bg-primary/10 text-primary",
    badge: "border-primary/30 bg-primary/10 text-primary",
    accent: "text-primary",
    rail: "from-primary via-primary/55 to-transparent",
    contentPanel: "border-border/70 bg-card/90",
    contentIcon: "border-primary/30 bg-primary/10 text-primary",
    contentBadge: "border-primary/30 bg-primary/10 text-primary",
    contentBar: "from-primary via-primary/55 to-transparent",
  },
  {
    shell: "border-border/80 bg-card text-foreground hover:border-primary/55 hover:bg-primary/[0.06]",
    icon: "border-primary/30 bg-primary/10 text-primary",
    badge: "border-primary/30 bg-primary/10 text-primary",
    accent: "text-primary",
    rail: "from-primary via-primary/55 to-transparent",
    contentPanel: "border-border/70 bg-card/90",
    contentIcon: "border-primary/30 bg-primary/10 text-primary",
    contentBadge: "border-primary/30 bg-primary/10 text-primary",
    contentBar: "from-primary via-primary/55 to-transparent",
  },
  {
    shell: "border-border/80 bg-card text-foreground hover:border-primary/55 hover:bg-primary/[0.06]",
    icon: "border-primary/30 bg-primary/10 text-primary",
    badge: "border-primary/30 bg-primary/10 text-primary",
    accent: "text-primary",
    rail: "from-primary via-primary/55 to-transparent",
    contentPanel: "border-border/70 bg-card/90",
    contentIcon: "border-primary/30 bg-primary/10 text-primary",
    contentBadge: "border-primary/30 bg-primary/10 text-primary",
    contentBar: "from-primary via-primary/55 to-transparent",
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
    <div className="space-y-6 p-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GB300 L10 測試流程說明</h1>
            <p className="mt-1 text-muted-foreground">集中查看站點路徑、測試項目與流程內容</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "overview" ? "default" : "outline"}
            onClick={() => setActiveTab("overview")}
            className={flowButtonClass}
          >
            <Route className="h-4 w-4" />
            查看流程
          </Button>
          <Button
            variant={activeTab === "manage" ? "default" : "outline"}
            onClick={() => setActiveTab("manage")}
            className={flowButtonClass}
          >
            <Edit className="h-4 w-4" />
            管理流程
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="overview">
            <Route className="mr-2 h-4 w-4" />
            流程總覽
          </TabsTrigger>
          <TabsTrigger value="manage">
            <Settings className="mr-2 h-4 w-4" />
            管理測試項目
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-[0_18px_55px_-38px_hsl(220_50%_2%/0.75)]">
            <div className="border-b border-border/55 bg-secondary/35 p-5 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">測試流程總覽</h2>
                      <p className="mt-1 text-sm text-muted-foreground">站點、工時、測項與流程內容集中在同一個工作區。</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[680px]">
                  <div className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <Monitor className="mb-3 h-4 w-4 text-primary" />
                    <div className="text-lg font-bold text-foreground">{totalSystems}</div>
                    <div className="text-sm text-muted-foreground">測試系統</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <ListChecks className="mb-3 h-4 w-4 text-primary" />
                    <div className="text-lg font-bold text-foreground">{items.length}</div>
                    <div className="text-sm text-muted-foreground">測試項目</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <Clock className="mb-3 h-4 w-4 text-primary" />
                    <div className="text-lg font-bold text-foreground">{totalHours.toFixed(1)}h</div>
                    <div className="text-sm text-muted-foreground">單機總時數</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <CalendarDays className="mb-3 h-4 w-4 text-primary" />
                    <div className="text-lg font-bold text-foreground">{getEstimatedDays()}</div>
                    <div className="text-sm text-muted-foreground">預計天數</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-primary/40 bg-card/85 shadow-[0_18px_55px_-38px_hsl(var(--primary)/0.55)]">
            <div className="flex flex-col gap-3 border-b border-primary/20 bg-primary/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Route className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">站點路徑</h2>
                  <p className="mt-1 text-sm text-muted-foreground">點選站點，右側會同步切換站點資訊與測試項目。</p>
                </div>
              </div>
              <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                {stations.length} 個站點
              </Badge>
            </div>

            <div className="grid items-start gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
              <div className="space-y-5">
                <div>
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
                          className={`group relative flex min-h-[168px] flex-col rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-22px_hsl(var(--primary)/0.55)] ${theme.shell} ${isSelected ? "border-primary/70 bg-primary/10 ring-2 ring-primary/25" : ""}`}
                        >
                          <div className={`mb-4 h-1 rounded-full bg-gradient-to-r ${theme.rail}`} />
                          <div className="flex items-start justify-between gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${theme.icon}`}>
                              {getStationIcon(station.station_name)}
                            </div>
                            <Badge variant="outline" className={`text-xs ${theme.badge}`}>
                              #{index + 1}
                            </Badge>
                          </div>
                          <div className="mt-4 flex flex-1 flex-col pr-5">
                            <div className="line-clamp-2 min-h-12 text-base font-semibold leading-6 text-foreground">{station.station_name}</div>
                            <div className="mt-auto flex flex-wrap gap-2 pt-3 text-sm">
                              <span className="rounded-full border border-border/75 bg-secondary/70 px-2.5 py-1 text-muted-foreground">
                                {getCalculatedStationHours(station.id)}h
                              </span>
                              <span className="rounded-full border border-border/75 bg-secondary/70 px-2.5 py-1 text-muted-foreground">
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
                  <div className="rounded-2xl border border-border/70 bg-secondary/35 p-5">
                    <Gauge className="mb-3 h-5 w-5 text-primary" />
                    <div className="text-lg font-bold text-foreground">{getDailyThroughput()}</div>
                    <div className="text-sm text-muted-foreground">預估日產能</div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-secondary/35 p-5">
                    <Clock className="mb-3 h-5 w-5 text-primary" />
                    <div className="text-lg font-bold text-foreground">{bottleneckHours > 0 ? bottleneckHours.toFixed(1) : "0.0"}h</div>
                    <div className="text-sm text-muted-foreground">瓶頸站點工時</div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-secondary/35 p-5">
                    <Route className="mb-3 h-5 w-5 text-primary" />
                    <div className="text-lg font-bold text-foreground">{selectedStationIndex + 1 || "-"}</div>
                    <div className="text-sm text-muted-foreground">目前查看站點</div>
                  </div>
                </div>
              </div>

              <aside className="space-y-5">
                {selectedStation ? (
                  <>
                    <div className={`rounded-2xl border p-5 ${selectedStationTheme.shell}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${selectedStationTheme.icon}`}>
                            {getStationIcon(selectedStation.station_name)}
                          </div>
                          <div>
                            <Badge variant="outline" className={`mb-2 ${selectedStationTheme.badge}`}>
                              Station {selectedStationIndex + 1}
                            </Badge>
                            <h3 className="text-lg font-semibold text-foreground">{selectedStation.station_name}</h3>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {selectedStation.description || "尚未填寫站點描述。"}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditStationDialog(selectedStation)}
                          className={`shrink-0 ${flowGhostButtonClass}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border/70 bg-secondary/55 p-3">
                          <div className="text-sm text-muted-foreground">站點工時</div>
                          <div className="mt-1 text-lg font-bold text-foreground">{getCalculatedStationHours(selectedStation.id)}h</div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-secondary/55 p-3">
                          <div className="text-sm text-muted-foreground">測項數量</div>
                          <div className="mt-1 text-lg font-bold text-foreground">{selectedStationItems.length}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-secondary/35 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">測試項目</h3>
                          <p className="text-sm text-muted-foreground">只顯示目前站點，避免整頁拉太長。</p>
                        </div>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {selectedStationItems.length} items
                        </Badge>
                      </div>
                      <div className="max-h-[330px] space-y-3 overflow-y-auto pr-1">
                        {selectedStationItems.length > 0 ? (
                          selectedStationItems.map((item) => (
                            <div key={item.id} className="rounded-xl border border-border/70 bg-card/70 p-3 transition-colors hover:border-primary/35 hover:bg-primary/[0.04]">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-foreground">{item.item_name}</div>
                                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description || "尚未填寫測項描述。"}</p>
                                </div>
                                <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/10 text-xs text-primary">
                                  {item.estimated_minutes}min
                                </Badge>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-background/35 p-6 text-center text-sm text-muted-foreground">
                            此站點尚未新增測試項目。
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center text-muted-foreground">
                    尚未建立站點資料。
                  </div>
                )}
              </aside>
            </div>
          </section>

          {selectedStation && (
            <section
              key={selectedStation.id}
              className="overflow-hidden rounded-2xl border border-amber-300/35 bg-card/85 shadow-[0_18px_55px_-38px_hsl(43_96%_56%/0.42)] animate-in fade-in-0 slide-in-from-top-2 duration-300"
            >
              <div className="flex flex-col gap-3 border-b border-amber-300/20 bg-amber-400/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/35 bg-amber-400/10 text-amber-200">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-foreground">流程內容管理</h2>
                      <Badge variant="outline" className="border-amber-300/35 bg-amber-400/10 text-xs text-amber-200">
                        Station {selectedStationIndex + 1}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">目前顯示 {selectedStation.station_name} 的流程內容。</p>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
                  已切換至 {selectedStation.station_name}
                </Badge>
              </div>
              <div className="p-5 sm:p-6">
                <div className="rounded-2xl border border-border/70 bg-background/35 p-3">
                  <div className="max-h-[430px] overflow-y-auto pr-1">
                    <StationContentManager
                      stationId={selectedStation.id}
                      stationName={selectedStation.station_name}
                      contents={selectedStationContents}
                      onUpdate={loadData}
                    />
                  </div>
                </div>
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="manage" className="mt-5 space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="bg-secondary/30">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  站點管理
                </CardTitle>
                <Button onClick={handleAddNewStation} className={flowButtonClass}>
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

          <TestItemManager
            stations={stations}
            items={items}
            onDataChange={loadData}
          />
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
