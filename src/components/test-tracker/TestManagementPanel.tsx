import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Save, X, Settings, Users, Clipboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedData } from "@/hooks/useUnifiedData";

interface System {
  id: string;
  system_name: string;
  assigned_engineer: string;
  status: string;
  overall_progress: number;
  current_station: string;
}

interface Station {
  id: string;
  station_name: string;
  station_order: number;
  description?: string;
  estimated_hours?: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description?: string;
  estimated_minutes?: number;
}

export function TestManagementPanel() {
  const { systems, stations, testItems, loadAllData } = useUnifiedData();
  const [isSystemDialogOpen, setIsSystemDialogOpen] = useState(false);
  const [isStationDialogOpen, setIsStationDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editingItem, setEditingItem] = useState<TestItem | null>(null);
  const [engineers, setEngineers] = useState<string[]>([]);
  const { toast } = useToast();

  const [systemForm, setSystemForm] = useState({
    system_name: '',
    assigned_engineer: '',
    status: 'Not Start'
  });

  const [stationForm, setStationForm] = useState({
    station_name: '',
    station_order: 0,
    description: '',
    estimated_hours: 8
  });

  const [itemForm, setItemForm] = useState({
    station_id: '',
    item_name: '',
    item_order: 0,
    description: '',
    estimated_minutes: 30
  });

  useEffect(() => {
    loadEngineers();
  }, []);

  const loadEngineers = async () => {
    try {
      const { data } = await supabase
        .from('engineers')
        .select('name')
        .eq('status', 'active');
      
      if (data) {
        setEngineers(data.map(e => e.name));
      }
    } catch (error) {
      console.error('Error loading engineers:', error);
    }
  };

  // System Management
  const handleAddSystem = () => {
    setEditingSystem(null);
    setSystemForm({ system_name: '', assigned_engineer: '', status: 'Not Start' });
    setIsSystemDialogOpen(true);
  };

  const handleEditSystem = (system: System) => {
    setEditingSystem(system);
    setSystemForm({
      system_name: system.system_name,
      assigned_engineer: system.assigned_engineer,
      status: system.status
    });
    setIsSystemDialogOpen(true);
  };

  const handleSaveSystem = async () => {
    try {
      if (editingSystem) {
        // Update existing system
        const { error } = await supabase
          .from('test_systems')
          .update({
            system_name: systemForm.system_name,
            assigned_engineer: systemForm.assigned_engineer,
            status: systemForm.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSystem.id);

        if (error) throw error;
        toast({ title: "更新成功", description: "系統已更新" });
      } else {
        // Add new system
        const { error } = await supabase
          .from('test_systems')
          .insert({
            system_name: systemForm.system_name,
            assigned_engineer: systemForm.assigned_engineer,
            status: systemForm.status
          });

        if (error) throw error;
        toast({ title: "新增成功", description: "系統已新增" });
      }

      setIsSystemDialogOpen(false);
      loadAllData();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存系統資料",
        variant: "destructive"
      });
    }
  };

  const handleDeleteSystem = async (systemId: string) => {
    try {
      const { error } = await supabase
        .from('test_systems')
        .delete()
        .eq('id', systemId);

      if (error) throw error;
      toast({ title: "刪除成功", description: "系統已刪除" });
      loadAllData();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除系統",
        variant: "destructive"
      });
    }
  };

  // Station Management
  const handleAddStation = () => {
    setEditingStation(null);
    setStationForm({ station_name: '', station_order: stations.length, description: '', estimated_hours: 8 });
    setIsStationDialogOpen(true);
  };

  const handleEditStation = (station: Station) => {
    setEditingStation(station);
    setStationForm({
      station_name: station.station_name,
      station_order: station.station_order,
      description: station.description || '',
      estimated_hours: station.estimated_hours || 8
    });
    setIsStationDialogOpen(true);
  };

  const handleSaveStation = async () => {
    try {
      if (editingStation) {
        // Update existing station
        const { error } = await supabase
          .from('test_flow_stations')
          .update({
            station_name: stationForm.station_name,
            station_order: stationForm.station_order,
            description: stationForm.description,
            estimated_hours: stationForm.estimated_hours
          })
          .eq('id', editingStation.id);

        if (error) throw error;
        toast({ title: "更新成功", description: "測試站點已更新" });
      } else {
        // Add new station
        const { error } = await supabase
          .from('test_flow_stations')
          .insert({
            station_name: stationForm.station_name,
            station_order: stationForm.station_order,
            description: stationForm.description,
            estimated_hours: stationForm.estimated_hours
          });

        if (error) throw error;
        toast({ title: "新增成功", description: "測試站點已新增" });
      }

      setIsStationDialogOpen(false);
      loadAllData();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存站點資料",
        variant: "destructive"
      });
    }
  };

  const handleDeleteStation = async (stationId: string) => {
    try {
      const { error } = await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationId);

      if (error) throw error;
      toast({ title: "刪除成功", description: "測試站點已刪除" });
      loadAllData();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除站點",
        variant: "destructive"
      });
    }
  };

  // Test Item Management
  const handleAddItem = () => {
    setEditingItem(null);
    setItemForm({ station_id: '', item_name: '', item_order: 0, description: '', estimated_minutes: 30 });
    setIsItemDialogOpen(true);
  };

  const handleEditItem = (item: TestItem) => {
    setEditingItem(item);
    setItemForm({
      station_id: item.station_id,
      item_name: item.item_name,
      item_order: item.item_order,
      description: item.description || '',
      estimated_minutes: item.estimated_minutes || 30
    });
    setIsItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    try {
      if (editingItem) {
        // Update existing item
        const { error } = await supabase
          .from('test_flow_items')
          .update({
            station_id: itemForm.station_id,
            item_name: itemForm.item_name,
            item_order: itemForm.item_order,
            description: itemForm.description,
            estimated_minutes: itemForm.estimated_minutes
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        toast({ title: "更新成功", description: "測試項目已更新" });
      } else {
        // Add new item
        const { error } = await supabase
          .from('test_flow_items')
          .insert({
            station_id: itemForm.station_id,
            item_name: itemForm.item_name,
            item_order: itemForm.item_order,
            description: itemForm.description,
            estimated_minutes: itemForm.estimated_minutes
          });

        if (error) throw error;
        toast({ title: "新增成功", description: "測試項目已新增" });
      }

      setIsItemDialogOpen(false);
      loadAllData();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存測試項目",
        variant: "destructive"
      });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('test_flow_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      toast({ title: "刪除成功", description: "測試項目已刪除" });
      loadAllData();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除測試項目",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            測試管理中心
          </h2>
          <p className="text-muted-foreground">管理系統、測試站點和測試項目</p>
        </div>
      </div>

      <Tabs defaultValue="systems" className="space-y-4">
        <TabsList>
          <TabsTrigger value="systems">系統管理</TabsTrigger>
          <TabsTrigger value="stations">站點管理</TabsTrigger>
          <TabsTrigger value="items">測試項目管理</TabsTrigger>
        </TabsList>

        {/* Systems Management */}
        <TabsContent value="systems">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  系統管理
                </CardTitle>
                <Button onClick={handleAddSystem}>
                  <Plus className="h-4 w-4 mr-2" />
                  新增系統
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>系統名稱</TableHead>
                    <TableHead>負責工程師</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>進度</TableHead>
                    <TableHead>當前站點</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systems.map((system) => (
                    <TableRow key={system.id}>
                      <TableCell className="font-medium">{system.system_name}</TableCell>
                      <TableCell>{system.assigned_engineer}</TableCell>
                      <TableCell>
                        <Badge variant={system.status === 'Done' ? 'default' : system.status === 'On-going' ? 'secondary' : 'outline'}>
                          {system.status === 'Done' ? '已完成' : system.status === 'On-going' ? '進行中' : '未開始'}
                        </Badge>
                      </TableCell>
                      <TableCell>{system.overall_progress}%</TableCell>
                      <TableCell>{system.current_station}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditSystem(system)}>
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
                                  確定要刪除系統 "{system.system_name}" 嗎？此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSystem(system.id)}>
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
        </TabsContent>

        {/* Stations Management */}
        <TabsContent value="stations">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  測試站點管理
                </CardTitle>
                <Button onClick={handleAddStation}>
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
                          <Button variant="ghost" size="sm" onClick={() => handleEditStation(station)}>
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
                                  確定要刪除站點 "{station.station_name}" 嗎？此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteStation(station.id)}>
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
        </TabsContent>

        {/* Test Items Management */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clipboard className="h-5 w-5" />
                  測試項目管理
                </CardTitle>
                <Button onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  新增測試項目
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>測試項目</TableHead>
                    <TableHead>所屬站點</TableHead>
                    <TableHead>順序</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>預估時間</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testItems.map((item) => {
                    const station = stations.find(s => s.id === item.station_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.item_name}</TableCell>
                        <TableCell>{station?.station_name || '未指定'}</TableCell>
                        <TableCell>{item.item_order}</TableCell>
                        <TableCell>{item.description || '-'}</TableCell>
                        <TableCell>{item.estimated_minutes || 0} 分鐘</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEditItem(item)}>
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
                                    確定要刪除測試項目 "{item.item_name}" 嗎？此操作無法復原。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteItem(item.id)}>
                                    刪除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* System Dialog */}
      <Dialog open={isSystemDialogOpen} onOpenChange={setIsSystemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSystem ? '編輯系統' : '新增系統'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>系統名稱</Label>
              <Input
                value={systemForm.system_name}
                onChange={(e) => setSystemForm({ ...systemForm, system_name: e.target.value })}
                placeholder="請輸入系統名稱"
              />
            </div>
            <div>
              <Label>負責工程師</Label>
              <Select
                value={systemForm.assigned_engineer}
                onValueChange={(value) => setSystemForm({ ...systemForm, assigned_engineer: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇工程師" />
                </SelectTrigger>
                <SelectContent>
                  {engineers.map(engineer => (
                    <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>狀態</Label>
              <Select
                value={systemForm.status}
                onValueChange={(value) => setSystemForm({ ...systemForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Start">未開始</SelectItem>
                  <SelectItem value="On-going">進行中</SelectItem>
                  <SelectItem value="Done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSystemDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveSystem}>
                <Save className="h-4 w-4 mr-2" />
                儲存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Station Dialog */}
      <Dialog open={isStationDialogOpen} onOpenChange={setIsStationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStation ? '編輯站點' : '新增站點'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>站點名稱</Label>
              <Input
                value={stationForm.station_name}
                onChange={(e) => setStationForm({ ...stationForm, station_name: e.target.value })}
                placeholder="請輸入站點名稱"
              />
            </div>
            <div>
              <Label>順序</Label>
              <Input
                type="number"
                value={stationForm.station_order}
                onChange={(e) => setStationForm({ ...stationForm, station_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={stationForm.description}
                onChange={(e) => setStationForm({ ...stationForm, description: e.target.value })}
                placeholder="請輸入站點描述"
              />
            </div>
            <div>
              <Label>預估時間 (小時)</Label>
              <Input
                type="number"
                value={stationForm.estimated_hours}
                onChange={(e) => setStationForm({ ...stationForm, estimated_hours: parseInt(e.target.value) || 0 })}
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

      {/* Test Item Dialog */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? '編輯測試項目' : '新增測試項目'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>測試項目名稱</Label>
              <Input
                value={itemForm.item_name}
                onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                placeholder="請輸入測試項目名稱"
              />
            </div>
            <div>
              <Label>所屬站點</Label>
              <Select
                value={itemForm.station_id}
                onValueChange={(value) => setItemForm({ ...itemForm, station_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇站點" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map(station => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.station_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>順序</Label>
              <Input
                type="number"
                value={itemForm.item_order}
                onChange={(e) => setItemForm({ ...itemForm, item_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="請輸入測試項目描述"
              />
            </div>
            <div>
              <Label>預估時間 (分鐘)</Label>
              <Input
                type="number"
                value={itemForm.estimated_minutes}
                onChange={(e) => setItemForm({ ...itemForm, estimated_minutes: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveItem}>
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