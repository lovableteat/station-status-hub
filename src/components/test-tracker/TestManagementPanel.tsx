
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings, Target, FileText, Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function TestManagementPanel() {
  const { 
    stations: testFlowStations, 
    testItems, 
    stationContents, 
    refetch 
  } = useUnifiedData();

  const { toast } = useToast();
  
  // Station management states
  const [showStationDialog, setShowStationDialog] = useState(false);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [deleteStationDialog, setDeleteStationDialog] = useState(false);
  const [stationToDelete, setStationToDelete] = useState<any>(null);
  const [stationForm, setStationForm] = useState({
    station_name: "",
    description: "",
    estimated_hours: 0
  });

  // Test item management states
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteItemDialog, setDeleteItemDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [itemForm, setItemForm] = useState({
    item_name: "",
    station_id: "",
    description: "",
    estimated_minutes: 30,
    item_order: 1
  });

  // Station operations
  const resetStationForm = () => {
    setStationForm({
      station_name: "",
      description: "",
      estimated_hours: 0
    });
    setEditingStation(null);
  };

  const handleAddStation = () => {
    resetStationForm();
    setShowStationDialog(true);
  };

  const handleEditStation = (station: any) => {
    setEditingStation(station);
    setStationForm({
      station_name: station.station_name,
      description: station.description || "",
      estimated_hours: station.estimated_hours || 0
    });
    setShowStationDialog(true);
  };

  const handleDeleteStation = (station: any) => {
    setStationToDelete(station);
    setDeleteStationDialog(true);
  };

  const confirmDeleteStation = async () => {
    if (!stationToDelete) return;

    try {
      const { error } = await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationToDelete.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "站點及相關資料已刪除",
      });

      await refetch();
      setDeleteStationDialog(false);
      setStationToDelete(null);
    } catch (error) {
      console.error('Error deleting station:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除站點",
        variant: "destructive"
      });
    }
  };

  const handleSaveStation = async () => {
    if (!stationForm.station_name.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入站點名稱",
        variant: "destructive"
      });
      return;
    }

    try {
      const maxOrder = testFlowStations.length > 0 ? Math.max(...testFlowStations.map(s => s.station_order)) : -1;
      const nextOrder = editingStation ? editingStation.station_order : maxOrder + 1;

      const stationData = {
        station_name: stationForm.station_name.trim(),
        description: stationForm.description.trim() || null,
        estimated_hours: stationForm.estimated_hours,
        station_order: nextOrder
      };

      if (editingStation) {
        const { error } = await supabase
          .from('test_flow_stations')
          .update(stationData)
          .eq('id', editingStation.id);

        if (error) throw error;

        toast({
          title: "更新成功",
          description: "站點已更新",
        });
      } else {
        const { data: newStation, error: stationError } = await supabase
          .from('test_flow_stations')
          .insert(stationData)
          .select()
          .single();

        if (stationError) throw stationError;

        // Create default test items for the new station
        const defaultItems = [
          {
            station_id: newStation.id,
            item_name: "基本檢查",
            item_order: 1,
            description: "基本功能檢查",
            estimated_minutes: 30
          },
          {
            station_id: newStation.id,
            item_name: "性能測試",
            item_order: 2,
            description: "性能相關測試",
            estimated_minutes: 45
          }
        ];

        const { error: itemsError } = await supabase
          .from('test_flow_items')
          .insert(defaultItems);

        if (itemsError) throw itemsError;

        toast({
          title: "新增成功",
          description: "站點及預設測試項目已創建",
        });
      }

      await refetch();
      setShowStationDialog(false);
      resetStationForm();
    } catch (error) {
      console.error('Error saving station:', error);
      toast({
        title: "操作失敗",
        description: editingStation ? "更新站點失敗" : "新增站點失敗",
        variant: "destructive"
      });
    }
  };

  // Test item operations
  const resetItemForm = () => {
    setItemForm({
      item_name: "",
      station_id: "",
      description: "",
      estimated_minutes: 30,
      item_order: 1
    });
    setEditingItem(null);
  };

  const handleAddItem = (stationId: string) => {
    resetItemForm();
    setItemForm(prev => ({ ...prev, station_id: stationId }));
    setShowItemDialog(true);
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      item_name: item.item_name,
      station_id: item.station_id,
      description: item.description || "",
      estimated_minutes: item.estimated_minutes || 30,
      item_order: item.item_order
    });
    setShowItemDialog(true);
  };

  const handleDeleteItem = (item: any) => {
    setItemToDelete(item);
    setDeleteItemDialog(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from('test_flow_items')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "測試項目已刪除",
      });

      await refetch();
      setDeleteItemDialog(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除測試項目",
        variant: "destructive"
      });
    }
  };

  const handleSaveItem = async () => {
    if (!itemForm.item_name.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入測試項目名稱",
        variant: "destructive"
      });
      return;
    }

    try {
      const itemData = {
        item_name: itemForm.item_name.trim(),
        station_id: itemForm.station_id,
        description: itemForm.description.trim() || null,
        estimated_minutes: itemForm.estimated_minutes,
        item_order: itemForm.item_order
      };

      if (editingItem) {
        const { error } = await supabase
          .from('test_flow_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;

        toast({
          title: "更新成功",
          description: "測試項目已更新",
        });
      } else {
        const { error } = await supabase
          .from('test_flow_items')
          .insert(itemData);

        if (error) throw error;

        toast({
          title: "新增成功",
          description: "測試項目已新增",
        });
      }

      await refetch();
      setShowItemDialog(false);
      resetItemForm();
    } catch (error) {
      console.error('Error saving item:', error);
      toast({
        title: "操作失敗",
        description: editingItem ? "更新測試項目失敗" : "新增測試項目失敗",
        variant: "destructive"
      });
    }
  };

  const getStationName = (stationId: string) => {
    return testFlowStations.find(s => s.id === stationId)?.station_name || '未知站點';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-base text-muted-foreground">各站點站數詳細設置暨明表所需設備清單</p>
        </div>
        <Button 
          onClick={() => {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('tab', 'overview');
            window.history.pushState({}, '', currentUrl.toString());
            
            const event = new CustomEvent('navigate', { 
              detail: { module: 'overview' } 
            });
            window.dispatchEvent(event);
          }}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          查看流程
        </Button>
      </div>

      <Tabs defaultValue="stations" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stations">站點設定</TabsTrigger>
          <TabsTrigger value="items">管理測試項目</TabsTrigger>
        </TabsList>

        <TabsContent value="stations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  站點管理
                </CardTitle>
                <Button onClick={handleAddStation} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  新增站點
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-6 gap-4 p-3 text-sm font-medium text-muted-foreground border-b">
                  <div>站點名稱</div>
                  <div>順序</div>
                  <div>描述</div>
                  <div>預估時間</div>
                  <div>測項數量</div>
                  <div>操作</div>
                </div>
                {testFlowStations
                  .sort((a, b) => a.station_order - b.station_order)
                  .map((station) => {
                    const itemCount = testItems.filter(item => item.station_id === station.id).length;
                    const totalMinutes = testItems
                      .filter(item => item.station_id === station.id)
                      .reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
                    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

                    return (
                      <div key={station.id} className="grid grid-cols-6 gap-4 p-3 hover:bg-muted/20 border-b">
                        <div className="font-medium">{station.station_name}</div>
                        <div>
                          <Badge variant="outline" className="text-xs">
                            {station.station_order}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {station.description || '無描述'}
                        </div>
                        <div className="text-sm">
                          {station.estimated_hours || 0} 小時
                        </div>
                        <div>
                          <Badge variant="secondary" className="text-xs">
                            {itemCount} 個項目
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditStation(station)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteStation(station)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                測試項目管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {testFlowStations
                  .sort((a, b) => a.station_order - b.station_order)
                  .map((station) => {
                    const stationItems = testItems
                      .filter(item => item.station_id === station.id)
                      .sort((a, b) => a.item_order - b.item_order);

                    return (
                      <div key={station.id} className="border rounded-lg">
                        <div className="p-4 bg-muted/20 border-b flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{station.station_name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {stationItems.length} 個項目
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {Math.round(stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0) / 60 * 10) / 10}小時
                            </Badge>
                          </div>
                          <Button 
                            size="sm" 
                            onClick={() => handleAddItem(station.id)}
                            className="flex items-center gap-2"
                          >
                            <Plus className="h-4 w-4" />
                            新增測試項目
                          </Button>
                        </div>
                        <div className="p-4">
                          {stationItems.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                              此站點尚無測試項目
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {stationItems.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/10">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h4 className="font-medium">{item.item_name}</h4>
                                      <Badge variant="outline" className="text-xs">
                                        順序 {item.item_order}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs">
                                        {item.estimated_minutes || 30} 分鐘
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {item.description || '無描述'}
                                    </p>
                                  </div>
                                  <div className="flex gap-1 ml-4">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleEditItem(item)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleDeleteItem(item)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Station Dialog */}
      <Dialog open={showStationDialog} onOpenChange={setShowStationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStation ? "編輯站點" : "新增站點"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">站點名稱 *</label>
              <Input
                value={stationForm.station_name}
                onChange={(e) => setStationForm({...stationForm, station_name: e.target.value})}
                placeholder="輸入站點名稱"
              />
            </div>
            <div>
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={stationForm.description}
                onChange={(e) => setStationForm({...stationForm, description: e.target.value})}
                placeholder="輸入站點描述"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">預估時間 (小時)</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={stationForm.estimated_hours}
                onChange={(e) => setStationForm({...stationForm, estimated_hours: Number(e.target.value)})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowStationDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveStation}>
              {editingStation ? "更新" : "新增"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "編輯測試項目" : "新增測試項目"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">項目名稱 *</label>
              <Input
                value={itemForm.item_name}
                onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                placeholder="請輸入測試項目名稱"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="請輸入測試項目描述"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">預估時間 (分鐘)</label>
                <Input
                  type="number"
                  value={itemForm.estimated_minutes}
                  onChange={(e) => setItemForm({ ...itemForm, estimated_minutes: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">執行順序</label>
                <Input
                  type="number"
                  value={itemForm.item_order}
                  onChange={(e) => setItemForm({ ...itemForm, item_order: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveItem}>
              {editingItem ? "更新" : "新增"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Station Dialog */}
      <AlertDialog open={deleteStationDialog} onOpenChange={setDeleteStationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除站點</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除「{stationToDelete?.station_name}」站點嗎？
              <br />
              <strong className="text-red-600">
                這將會同時刪除該站點的所有測試項目、進度記錄、內容說明和相關設定！
              </strong>
              <br />
              此操作無法撤銷。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStation}
              className="bg-red-600 hover:bg-red-700"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Item Dialog */}
      <AlertDialog open={deleteItemDialog} onOpenChange={setDeleteItemDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除測試項目</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除「{itemToDelete?.item_name}」測試項目嗎？
              <br />
              此操作無法撤銷。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-red-600 hover:bg-red-700"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
