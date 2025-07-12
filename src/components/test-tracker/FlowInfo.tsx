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

export function FlowInfo() {
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [systems, setSystems] = useState<any[]>([]);
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
      'bg-blue-500/10 text-blue-700 border-blue-200',
      'bg-green-500/10 text-green-700 border-green-200', 
      'bg-orange-500/10 text-orange-700 border-orange-200',
      'bg-purple-500/10 text-purple-700 border-purple-200',
      'bg-red-500/10 text-red-700 border-red-200'
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
        const { error } = await supabase
          .from('test_flow_stations')
          .update({
            station_name: newStationForm.station_name,
            station_order: newStationForm.station_order,
            description: newStationForm.description,
            estimated_hours: newStationForm.estimated_hours
          })
          .eq('id', editingNewStation.id);

        if (error) throw error;

        toast({ title: "更新成功", description: "測試站點已更新，測試進度表將自動更新" });
      } else {
        // Add new station
        const { error } = await supabase
          .from('test_flow_stations')
          .insert({
            station_name: newStationForm.station_name,
            station_order: newStationForm.station_order,
            description: newStationForm.description,
            estimated_hours: newStationForm.estimated_hours
          });

        if (error) throw error;

        toast({ title: "新增成功", description: "測試站點已新增，測試進度表將自動更新" });
      }

      setIsNewStationDialogOpen(false);
      setEditingNewStation(null);
      loadData();
    } catch (error) {
      console.error('Error saving station:', error);
      toast({
        title: "操作失敗",
        description: "無法儲存站點資料",
        variant: "destructive"
      });
    }
  };

  const handleDeleteNewStation = async (stationId: string) => {
    try {
      // 檢查是否有相關的測試項目
      const { data: relatedItems } = await supabase
        .from('test_flow_items')
        .select('id')
        .eq('station_id', stationId);

      if (relatedItems && relatedItems.length > 0) {
        toast({
          title: "無法刪除",
          description: "此站點還有相關的測試項目，請先刪除測試項目",
          variant: "destructive"
        });
        return;
      }

      // 檢查是否有相關的測試進度
      const { data: relatedProgress } = await supabase
        .from('test_progress')
        .select('id')
        .eq('station_id', stationId);

      if (relatedProgress && relatedProgress.length > 0) {
        toast({
          title: "無法刪除",
          description: "此站點還有相關的測試進度記錄，請先清除相關記錄",
          variant: "destructive"
        });
        return;
      }

      // 檢查是否有相關的站點內容
      const { data: relatedContents } = await supabase
        .from('station_contents')
        .select('id')
        .eq('station_id', stationId);

      if (relatedContents && relatedContents.length > 0) {
        // 同時刪除站點內容
        await supabase
          .from('station_contents')
          .delete()
          .eq('station_id', stationId);
      }

      // 刪除站點
      const { error } = await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationId);

      if (error) throw error;

      toast({ title: "刪除成功", description: "測試站點已刪除" });
      loadData();
    } catch (error) {
      console.error('Error deleting station:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除站點，請檢查是否有相關聯的資料",
        variant: "destructive"
      });
    }
  };

  // Calculate dynamic summary data
  const totalSystems = systems.length;
  const totalHours = stations.reduce((total, station) => {
    const calculatedHours = parseFloat(getCalculatedStationHours(station.id));
    return total + calculatedHours;
  }, 0);

  // Calculate estimated completion days based on bottleneck station
  const getEstimatedDays = () => {
    if (totalSystems === 0) return 0;
    
    // Find the station with the longest time (bottleneck)
    const bottleneckHours = Math.max(...stations.map(station => 
      parseFloat(getCalculatedStationHours(station.id))
    ));
    
    // Assume 8 working hours per day and calculate based on bottleneck
    const systemsPerDay = Math.floor(8 / bottleneckHours) || 1;
    return Math.ceil(totalSystems / systemsPerDay);
  };

  const getDailyThroughput = () => {
    if (stations.length === 0) return 0;
    
    // Calculate throughput based on bottleneck station
    const bottleneckHours = Math.max(...stations.map(station => 
      parseFloat(getCalculatedStationHours(station.id))
    ));
    
    return Math.floor(8 / bottleneckHours) || 1;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-muted-foreground">各測試站點詳細流程說明與所需設備清單</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setActiveTab("manage")}
        >
          <Edit className="h-4 w-4 mr-2" />
          管理流程
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">流程總覽</TabsTrigger>
          <TabsTrigger value="manage">管理測試項目</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {/* Overview Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>測試流程總覽</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            {stations.map((station, index) => (
              <div key={station.id} className="flex flex-col items-center flex-1">
                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getStationColor(station.station_order)}`}>
                  {getStationIcon(station.station_name)}
                </div>
                <div className="text-sm font-medium mt-2">{station.station_name}</div>
                <div className="text-xs text-muted-foreground">{getCalculatedStationHours(station.id)}h</div>
                {index < stations.length - 1 && (
                  <div className="absolute h-0.5 bg-border" style={{
                    left: `${(index + 1) * (100 / stations.length)}%`,
                    width: `${100 / stations.length}%`,
                    top: '24px'
                  }} />
                )}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{totalSystems}</div>
              <div className="text-sm text-muted-foreground">測試系統總數</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{totalHours.toFixed(1)}h</div>
              <div className="text-sm text-muted-foreground">單機總測試時間</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{getEstimatedDays()}</div>
              <div className="text-sm text-muted-foreground">預計完成天數</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Station Information - Remove hardcoded details */}
      <div className="space-y-6">
        {stations.map((station) => {
          const stationItems = items.filter(item => item.station_id === station.id);
          
          return (
            <Card key={station.id} className="overflow-hidden">
              <CardHeader className={`${getStationColor(station.station_order)} border-b`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStationIcon(station.station_name)}
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
                      className="opacity-70 hover:opacity-100"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Badge variant="outline" className="bg-white/80">
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
                        <div key={item.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">{item.item_name}</h5>
                            <Badge variant="outline" className="text-xs">
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

      {/* Dynamic Summary */}
      <Card>
        <CardHeader>
          <CardTitle>整體測試時程總結</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {stations.map((station, index) => (
                <div key={station.id} className="text-center p-4 border rounded-lg">
                  <div className="text-lg font-bold">{station.station_name}</div>
                  <div className="text-sm text-muted-foreground">{station.description || '測試站點'}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    約 {Math.floor(8 / parseFloat(getCalculatedStationHours(station.id))) || 1} 台/天
                  </div>
                </div>
              ))}
              <div className="text-center p-4 border rounded-lg bg-primary/5">
                <div className="text-lg font-bold text-primary">總計</div>
                <div className="text-sm text-muted-foreground">完整流程</div>
                <div className="text-xs text-muted-foreground mt-1">{getEstimatedDays()} 天</div>
              </div>
            </div>
            
            <Separator />
            
            <div className="text-sm text-muted-foreground">
              <p><strong>注意事項：</strong></p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>總計 {totalSystems} 個測試系統，預計需 {getEstimatedDays()} 天完成</li>
                <li>日產能約 {getDailyThroughput()} 台，基於瓶頸站點計算</li>
                <li>各站點需要相應的技術支援人員配合</li>
                <li>設備數量可能影響實際產能，請確認設備充足性</li>
                {stations.length > 0 && (
                  <li>瓶頸站點耗時 {Math.max(...stations.map(station => parseFloat(getCalculatedStationHours(station.id)))).toFixed(1)} 小時，建議增加設備或人力配置</li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="manage" className="space-y-6">
          {/* Station Management Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  站點管理
                </CardTitle>
                <Button onClick={handleAddNewStation}>
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
                          <Button variant="ghost" size="sm" onClick={() => handleEditNewStation(station)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認刪除</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要刪除站點 "{station.station_name}" 嗎？此操作將同時刪除相關的站點內容，且無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteNewStation(station.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              <Button variant="outline" onClick={() => setIsStationDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveStation}>
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
              <Button variant="outline" onClick={() => setIsNewStationDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveNewStation}>
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
