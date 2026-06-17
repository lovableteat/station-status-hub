import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, Monitor, Cpu, HardDrive, Zap, Settings, Edit, Plus, Save, X, Trash2 } from "lucide-react";
import { TestItemManager } from "./TestItemManager";
import { StationContentManager } from "./StationContentManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export function FlowInfo() {
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [systems, setSystems] = useState<unknown[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
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

  const getStationColor = (stationOrder: number) => {
    const colors = [
      'bg-primary/10 text-primary border-primary/30',
      'bg-indigo-500/10 text-indigo-200 border-indigo-400/25',
      'bg-amber-500/10 text-amber-200 border-amber-400/25',
      'bg-violet-500/10 text-violet-200 border-violet-400/25',
      'bg-rose-500/10 text-rose-200 border-rose-400/25'
    ];
    return colors[stationOrder] || colors[0];
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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.92)_48%,hsl(var(--background))_100%)] p-6 shadow-[0_24px_70px_-48px_hsl(220_50%_2%/0.95)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-3 border-primary/25 bg-primary/10 px-3 py-1 text-primary">
              L10 Flow Control
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">GB300 L10 測試流程說明</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              各測試站點詳細流程說明與所需設備清單，快速確認站點順序、測項時間與管理入口。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="secondary" className="border border-border/70 bg-secondary/80 px-3 py-1">
                <Monitor className="mr-1 h-3.5 w-3.5" />
                {stations.length} 個站點
              </Badge>
              <Badge variant="secondary" className="border border-border/70 bg-secondary/80 px-3 py-1">
                <Settings className="mr-1 h-3.5 w-3.5" />
                {items.length} 個測項
              </Badge>
              <Badge variant="secondary" className="border border-border/70 bg-secondary/80 px-3 py-1">
                <Clock className="mr-1 h-3.5 w-3.5" />
                單機 {totalHours.toFixed(1)}h
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setActiveTab("manage")}
            className={`h-11 border-primary/25 bg-secondary/75 px-5 hover:border-primary/55 hover:bg-primary/10 hover:text-primary ${flowButtonClass}`}
          >
            <Edit className="h-4 w-4 mr-2" />
            管理流程
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 rounded-2xl border border-border/70 bg-card/80 p-1 shadow-sm">
          <TabsTrigger
            value="overview"
            className="rounded-xl transition-all duration-200 hover:bg-primary/10 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            流程總覽
          </TabsTrigger>
          <TabsTrigger
            value="manage"
            className="rounded-xl transition-all duration-200 hover:bg-primary/10 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-sm"
          >
            管理測試項目
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {/* Overview Timeline */}
      <Card className="overflow-hidden border-primary/15 bg-card/90">
        <CardHeader className="bg-secondary/35">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>測試流程總覽</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">依站點順序呈現 L10 測試路徑與預估工時。</p>
            </div>
            <Badge variant="outline" className="w-fit border-primary/25 bg-primary/10 px-3 py-1 text-primary">
              {stations.length} stations
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-6 right-6 top-8 hidden h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent xl:block" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {stations.map((station, index) => (
                <div
                  key={station.id}
                  className={`relative rounded-2xl border p-4 shadow-[0_16px_40px_-32px_hsl(220_50%_2%/0.9)] backdrop-blur transition-all duration-200 ease-out hover:-translate-y-1 hover:border-primary/45 hover:shadow-[0_22px_48px_-34px_hsl(var(--primary)/0.65)] ${getStationColor(station.station_order)}`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-current/25 bg-background/40">
                      {getStationIcon(station.station_name)}
                    </div>
                    <span className="rounded-full border border-current/20 bg-background/35 px-2.5 py-1 text-xs font-semibold">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-foreground">{station.station_name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{getCalculatedStationHours(station.id)}h estimated</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-secondary/45 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-secondary/65 hover:shadow-[0_18px_36px_-30px_hsl(var(--primary)/0.65)]">
              <div className="text-3xl font-bold text-primary">{totalSystems}</div>
              <div className="mt-1 text-sm text-muted-foreground">測試系統總數</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-secondary/45 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-secondary/65 hover:shadow-[0_18px_36px_-30px_hsl(var(--primary)/0.65)]">
              <div className="text-3xl font-bold text-primary">{totalHours.toFixed(1)}h</div>
              <div className="mt-1 text-sm text-muted-foreground">單機總測試時間</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-secondary/45 p-5 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-secondary/65 hover:shadow-[0_18px_36px_-30px_hsl(var(--primary)/0.65)]">
              <div className="text-3xl font-bold text-primary">{getEstimatedDays()}</div>
              <div className="mt-1 text-sm text-muted-foreground">預計完成天數</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Station Information - Remove hardcoded details */}
      <div className="space-y-6">
        {stations.map((station) => {
          const stationItems = items.filter(item => item.station_id === station.id);
          
          return (
            <Card
              key={station.id}
              className="overflow-hidden border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_24px_64px_-44px_hsl(var(--primary)/0.55)]"
            >
              <CardHeader className={`${getStationColor(station.station_order)} border-b border-current/15`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-current/25 bg-background/35">
                      {getStationIcon(station.station_name)}
                    </div>
                    <div>
                      <CardTitle className="text-xl">{station.station_name}</CardTitle>
                      <p className="text-sm opacity-90">{station.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditStationDialog(station)}
                      className={`opacity-75 hover:opacity-100 ${flowGhostButtonClass}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Badge variant="outline" className="border-current/20 bg-background/40">
                      <Clock className="h-3 w-3 mr-1" />
                      {getCalculatedStationHours(station.id)}h
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left Column - Test Items */}
                  <div>
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      測試項目
                    </h4>
                    <div className="space-y-3">
                      {stationItems.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/70 bg-secondary/35 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-secondary/55"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">{item.item_name}</h5>
                            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-xs text-primary">
                              {item.estimated_minutes}min
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                   {/* Right Column - Station Details from station_contents */}
                   <div>
                     <h4 className="font-semibold mb-4 flex items-center justify-between">
                       站點詳細資訊
                       <Button 
                         variant="ghost" 
                         size="sm"
                         onClick={() => setActiveTab("content")}
                         className={flowGhostButtonClass}
                       >
                         <Plus className="h-4 w-4 mr-1" />
                         管理內容
                       </Button>
                     </h4>
                     
                     {/* Station Content Manager */}
                     <StationContentManager
                       stationId={station.id}
                       stationName={station.station_name}
                       contents={stationContents.filter(c => c.station_id === station.id)}
                       onUpdate={loadData}
                     />
                   </div>
                 </div>
               </CardContent>
             </Card>
           );
         })}
       </div>

        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          {/* Station Management Section */}
          <Card className="border-primary/15 bg-card/90">
            <CardHeader className="bg-secondary/30">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
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

          {/* Test Items Management Section */}
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
