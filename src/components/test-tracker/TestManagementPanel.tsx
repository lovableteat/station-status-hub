
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, Settings, Target, Clock, Hash, MapPin, ListChecks } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StationForm {
  station_name: string;
  description: string;
  estimated_hours: number;
  station_order: number;
}

interface TestItemForm {
  item_name: string;
  station_id: string;
  description: string;
  estimated_minutes: number;
  item_order: number;
}

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
  const [stationForm, setStationForm] = useState<StationForm>({
    station_name: "",
    description: "",
    estimated_hours: 8,
    station_order: 0
  });

  // Test item management states
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteItemDialog, setDeleteItemDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [itemForm, setItemForm] = useState<TestItemForm>({
    item_name: "",
    station_id: "",
    description: "",
    estimated_minutes: 30,
    item_order: 1
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Station form functions
  const resetStationForm = () => {
    setStationForm({
      station_name: "",
      description: "",
      estimated_hours: 8,
      station_order: 0
    });
    setEditingStation(null);
  };

  const handleAddStation = () => {
    resetStationForm();
    const maxOrder = testFlowStations.length > 0 ? Math.max(...testFlowStations.map(s => s.station_order)) : -1;
    setStationForm(prev => ({ ...prev, station_order: maxOrder + 1 }));
    setShowStationDialog(true);
  };

  const handleEditStation = (station: any) => {
    setEditingStation(station);
    setStationForm({
      station_name: station.station_name,
      description: station.description || "",
      estimated_hours: station.estimated_hours || 8,
      station_order: station.station_order
    });
    setShowStationDialog(true);
  };

  const handleDeleteStation = (station: any) => {
    setStationToDelete(station);
    setDeleteStationDialog(true);
  };

  const confirmDeleteStation = async () => {
    if (!stationToDelete) return;
    
    setIsSubmitting(true);
    try {
      // First delete all test items for this station
      const { error: itemsError } = await supabase
        .from('test_flow_items')
        .delete()
        .eq('station_id', stationToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete station contents
      const { error: contentsError } = await supabase
        .from('station_contents')
        .delete()
        .eq('station_id', stationToDelete.id);

      if (contentsError) throw contentsError;

      // Finally delete the station
      const { error } = await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationToDelete.id);

      if (error) throw error;

      toast({
        title: "成功",
        description: "站點及其相關內容已刪除",
      });

      await refetch();
      setDeleteStationDialog(false);
      setStationToDelete(null);
    } catch (error) {
      console.error('Error deleting station:', error);
      toast({
        title: "錯誤",
        description: "刪除站點失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitStation = async () => {
    if (!stationForm.station_name.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入站點名稱",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const stationData = {
        station_name: stationForm.station_name.trim(),
        description: stationForm.description.trim() || null,
        estimated_hours: stationForm.estimated_hours,
        station_order: stationForm.station_order
      };

      if (editingStation) {
        const { error } = await supabase
          .from('test_flow_stations')
          .update(stationData)
          .eq('id', editingStation.id);

        if (error) throw error;

        toast({
          title: "成功",
          description: "站點已更新",
        });
      } else {
        const { error } = await supabase
          .from('test_flow_stations')
          .insert(stationData);

        if (error) throw error;

        toast({
          title: "成功",
          description: "站點已創建",
        });
      }

      await refetch();
      setShowStationDialog(false);
      resetStationForm();
    } catch (error) {
      console.error('Error saving station:', error);
      toast({
        title: "錯誤",
        description: editingStation ? "更新站點失敗" : "創建站點失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Test item form functions
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

  const handleAddItem = (stationId?: string) => {
    resetItemForm();
    if (stationId) {
      const stationItems = testItems.filter(item => item.station_id === stationId);
      const maxOrder = stationItems.length > 0 ? Math.max(...stationItems.map(item => item.item_order)) : 0;
      setItemForm(prev => ({ 
        ...prev, 
        station_id: stationId,
        item_order: maxOrder + 1
      }));
    }
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
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('test_flow_items')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) throw error;

      toast({
        title: "成功",
        description: "測試項目已刪除",
      });

      await refetch();
      setDeleteItemDialog(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "錯誤",
        description: "刪除測試項目失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitItem = async () => {
    if (!itemForm.item_name.trim() || !itemForm.station_id) {
      toast({
        title: "錯誤",
        description: "請輸入項目名稱並選擇站點",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
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
          title: "成功",
          description: "測試項目已更新",
        });
      } else {
        const { error } = await supabase
          .from('test_flow_items')
          .insert(itemData);

        if (error) throw error;

        toast({
          title: "成功",
          description: "測試項目已創建",
        });
      }

      await refetch();
      setShowItemDialog(false);
      resetItemForm();
    } catch (error) {
      console.error('Error saving item:', error);
      toast({
        title: "錯誤",
        description: editingItem ? "更新測試項目失敗" : "創建測試項目失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
            GB300 L10 測試流程管理系統
          </h1>
          <p className="text-xl text-gray-600">完整的站點與測試項目管理平台</p>
        </div>

        <Tabs defaultValue="stations" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12 bg-white shadow-lg rounded-xl">
            <TabsTrigger value="stations" className="text-lg font-medium data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
              <MapPin className="h-5 w-5 mr-2" />
              站點管理
            </TabsTrigger>
            <TabsTrigger value="items" className="text-lg font-medium data-[state=active]:bg-cyan-500 data-[state=active]:text-white">
              <ListChecks className="h-5 w-5 mr-2" />
              測試項目管理
            </TabsTrigger>
          </TabsList>

          {/* Stations Management Tab */}
          <TabsContent value="stations" className="space-y-6 mt-8">
            <Card className="shadow-xl border-0 bg-white">
              <CardHeader className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Settings className="h-7 w-7" />
                    測試站點管理
                  </CardTitle>
                  <Button 
                    onClick={handleAddStation} 
                    className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    新增站點
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => {
                      const stationItems = testItems.filter(item => item.station_id === station.id);
                      return (
                        <Card key={station.id} className="border-2 border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-lg px-3 py-1 bg-indigo-100 text-indigo-700 border-indigo-300">
                                順序 {station.station_order}
                              </Badge>
                              <div className="flex gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleEditStation(station)}
                                  className="hover:bg-indigo-50 text-indigo-600"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteStation(station)}
                                  className="hover:bg-red-50 text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <h3 className="text-xl font-semibold text-gray-800">{station.station_name}</h3>
                            {station.description && (
                              <p className="text-gray-600 text-sm leading-relaxed">{station.description}</p>
                            )}
                            <div className="flex items-center justify-between pt-2">
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Clock className="h-4 w-4" />
                                {station.estimated_hours || 0} 小時
                              </div>
                              <Badge variant="secondary" className="bg-cyan-100 text-cyan-700">
                                {stationItems.length} 個測項
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  
                  {testFlowStations.length === 0 && (
                    <div className="col-span-full text-center py-12">
                      <Settings className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">尚無測試站點，點擊上方按鈕新增站點</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test Items Management Tab */}
          <TabsContent value="items" className="space-y-6 mt-8">
            <Card className="shadow-xl border-0 bg-white">
              <CardHeader className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Target className="h-7 w-7" />
                    測試項目管理
                  </CardTitle>
                  <Button 
                    onClick={() => handleAddItem()} 
                    className="bg-white text-cyan-600 hover:bg-cyan-50 font-semibold"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    新增測試項目
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-8">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => {
                      const stationItems = testItems.filter(item => item.station_id === station.id);
                      return (
                        <div key={station.id} className="border-2 border-gray-200 rounded-xl p-6 bg-gray-50">
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                              <Badge variant="outline" className="text-base px-3 py-1 bg-white border-gray-300">
                                {station.station_name}
                              </Badge>
                              <span className="text-gray-500">({stationItems.length} 個測試項目)</span>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleAddItem(station.id)}
                              className="bg-white hover:bg-cyan-50 border-cyan-300 text-cyan-600"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              新增測項
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {stationItems.length === 0 ? (
                              <div className="col-span-full text-center py-8">
                                <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">尚無測試項目，點擊右上角按鈕新增</p>
                              </div>
                            ) : (
                              stationItems
                                .sort((a, b) => a.item_order - b.item_order)
                                .map((item) => (
                                  <Card key={item.id} className="bg-white border hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                      <div className="flex items-start justify-between mb-3">
                                        <h4 className="font-semibold text-gray-800 leading-tight">{item.item_name}</h4>
                                        <div className="flex gap-1">
                                          <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleEditItem(item)}
                                            className="h-8 w-8 p-0 hover:bg-cyan-50 text-cyan-600"
                                          >
                                            <Edit className="h-3 w-3" />
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="sm"
                                            onClick={() => handleDeleteItem(item)}
                                            className="h-8 w-8 p-0 hover:bg-red-50 text-red-600"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      {item.description && (
                                        <p className="text-sm text-gray-600 mb-3 leading-relaxed">{item.description}</p>
                                      )}
                                      <div className="flex items-center justify-between text-xs">
                                        <Badge variant="outline" className="bg-gray-100">
                                          <Hash className="h-3 w-3 mr-1" />
                                          順序 {item.item_order}
                                        </Badge>
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                                          <Clock className="h-3 w-3 mr-1" />
                                          {item.estimated_minutes}分
                                        </Badge>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  
                  {testFlowStations.length === 0 && (
                    <div className="text-center py-12">
                      <Target className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 text-lg">請先新增測試站點，然後才能新增測試項目</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Station Dialog */}
        <Dialog open={showStationDialog} onOpenChange={setShowStationDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingStation ? "編輯測試站點" : "新增測試站點"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label className="text-sm font-medium">站點名稱 *</Label>
                <Input
                  value={stationForm.station_name}
                  onChange={(e) => setStationForm({...stationForm, station_name: e.target.value})}
                  placeholder="輸入站點名稱"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">描述</Label>
                <Textarea
                  value={stationForm.description}
                  onChange={(e) => setStationForm({...stationForm, description: e.target.value})}
                  placeholder="輸入站點描述"
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">預估時間 (小時)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={stationForm.estimated_hours}
                    onChange={(e) => setStationForm({...stationForm, estimated_hours: parseInt(e.target.value) || 8})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">執行順序</Label>
                  <Input
                    type="number"
                    min="0"
                    value={stationForm.station_order}
                    onChange={(e) => setStationForm({...stationForm, station_order: parseInt(e.target.value) || 0})}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <Button variant="outline" onClick={() => setShowStationDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSubmitStation} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                {isSubmitting ? "處理中..." : (editingStation ? "更新" : "創建")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Test Item Dialog */}
        <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingItem ? "編輯測試項目" : "新增測試項目"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div>
                <Label className="text-sm font-medium">項目名稱 *</Label>
                <Input
                  value={itemForm.item_name}
                  onChange={(e) => setItemForm({...itemForm, item_name: e.target.value})}
                  placeholder="輸入測試項目名稱"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">所屬站點 *</Label>
                <Select
                  value={itemForm.station_id}
                  onValueChange={(value) => setItemForm({...itemForm, station_id: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="選擇站點" />
                  </SelectTrigger>
                  <SelectContent>
                    {testFlowStations
                      .sort((a, b) => a.station_order - b.station_order)
                      .map(station => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.station_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">描述</Label>
                <Textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                  placeholder="輸入測試項目描述"
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">預估時間 (分鐘)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={itemForm.estimated_minutes}
                    onChange={(e) => setItemForm({...itemForm, estimated_minutes: parseInt(e.target.value) || 30})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">執行順序</Label>
                  <Input
                    type="number"
                    min="1"
                    value={itemForm.item_order}
                    onChange={(e) => setItemForm({...itemForm, item_order: parseInt(e.target.value) || 1})}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <Button variant="outline" onClick={() => setShowItemDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSubmitItem} disabled={isSubmitting} className="bg-cyan-600 hover:bg-cyan-700">
                {isSubmitting ? "處理中..." : (editingItem ? "更新" : "創建")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Station Confirmation Dialog */}
        <AlertDialog open={deleteStationDialog} onOpenChange={setDeleteStationDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除測試站點</AlertDialogTitle>
              <AlertDialogDescription>
                您確定要刪除「{stationToDelete?.station_name}」測試站點嗎？
                <br />
                <strong className="text-red-600">注意：這將同時刪除該站點下的所有測試項目和內容，此操作無法撤銷。</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteStation}
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSubmitting ? "刪除中..." : "確認刪除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Item Confirmation Dialog */}
        <AlertDialog open={deleteItemDialog} onOpenChange={setDeleteItemDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除測試項目</AlertDialogTitle>
              <AlertDialogDescription>
                您確定要刪除「{itemToDelete?.item_name}」測試項目嗎？
                此操作無法撤銷。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteItem}
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSubmitting ? "刪除中..." : "確認刪除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
