
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
import { Settings, Plus, Edit, Trash2, FileText, Target, Eye, Clock, Hash } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  // Reset form function
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

  // Add new test item
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

  // Edit existing test item
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

  // Delete test item
  const handleDeleteItem = (item: any) => {
    setItemToDelete(item);
    setDeleteItemDialog(true);
  };

  // Confirm delete operation
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

  // Submit form (create or update)
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

  // Calculate totals for overview
  const totalItems = testItems.length;
  const totalEstimatedTime = testFlowStations.reduce((sum, station) => sum + (station.estimated_hours || 0), 0);

  const getStationProgress = (stationId: string) => {
    // Mock progress for display
    return Math.floor(Math.random() * 100);
  };

  const getStationStatus = (progress: number) => {
    if (progress === 100) return { color: "bg-green-500", text: "完成" };
    if (progress > 0) return { color: "bg-orange-500", text: "進行中" };
    return { color: "bg-gray-500", text: "未開始" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              GB300 L10 測試流程說明
            </h1>
            <p className="text-lg text-slate-600">各測試站點流程說明與管理測試項目</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.open('/test-tracker', '_blank')}
            className="flex items-center gap-2 bg-white shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Eye className="h-4 w-4" />
            查看流程
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white shadow-sm">
            <TabsTrigger value="overview" className="text-base">流程總覽</TabsTrigger>
            <TabsTrigger value="management" className="text-base">管理測試項目</TabsTrigger>
          </TabsList>

          {/* Flow Overview Tab */}
          <TabsContent value="overview" className="space-y-8 mt-8">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold mb-2">{totalItems}</div>
                  <div className="text-blue-100">測試項目總數</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold mb-2">{totalEstimatedTime}h</div>
                  <div className="text-green-100">預估總測試時間</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold mb-2">{testFlowStations.length}</div>
                  <div className="text-purple-100">測試站點數量</div>
                </CardContent>
              </Card>
            </div>

            {/* Station Flow Overview */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-6 w-6 text-blue-600" />
                  測試流程總覽
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => {
                      const progress = getStationProgress(station.id);
                      const status = getStationStatus(progress);
                      return (
                        <Card key={station.id} className="text-center hover:shadow-md transition-shadow">
                          <CardContent className="p-6">
                            <div className={`w-16 h-16 rounded-full ${status.color} mx-auto mb-4 flex items-center justify-center`}>
                              <Settings className="h-8 w-8 text-white" />
                            </div>
                            <h3 className="font-semibold text-lg mb-2">{station.station_name}</h3>
                            <p className="text-sm text-slate-600 mb-3">{station.estimated_hours || 0}小時</p>
                            <Badge variant="outline" className="text-sm">
                              {progress}%
                            </Badge>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </CardContent>
            </Card>

            {/* Detailed Station Information */}
            {testFlowStations
              .sort((a, b) => a.station_order - b.station_order)
              .map((station) => {
                const stationItems = testItems.filter(item => item.station_id === station.id);
                const stationContentList = stationContents.filter(content => content.station_id === station.id);
                const progress = getStationProgress(station.id);
                const status = getStationStatus(progress);

                return (
                  <Card key={station.id} className="shadow-lg">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full ${status.color} flex items-center justify-center`}>
                            <Settings className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">{station.station_name}</CardTitle>
                            <p className="text-slate-600 mt-1">
                              {station.description || "測試站點"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <Badge variant="outline" className="text-sm">
                            {progress}% 完成
                          </Badge>
                          <p className="text-sm text-slate-600">
                            預估 {station.estimated_hours || 0} 小時
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Test Items */}
                      <div>
                        <h4 className="font-semibold mb-4 flex items-center gap-2 text-lg">
                          <Target className="h-5 w-5 text-blue-600" />
                          測試項目 ({stationItems.length})
                        </h4>
                        <div className="space-y-3">
                          {stationItems.length === 0 ? (
                            <p className="text-slate-500 py-8 text-center bg-slate-50 rounded-lg">
                              尚無測試項目
                            </p>
                          ) : (
                            stationItems
                              .sort((a, b) => a.item_order - b.item_order)
                              .map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-shadow">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className="font-medium text-lg">{item.item_name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        順序 {item.item_order}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {item.estimated_minutes}分鐘
                                      </Badge>
                                    </div>
                                    {item.description && (
                                      <p className="text-slate-600">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Station Details */}
                      <div>
                        <h4 className="font-semibold mb-4 text-lg">站點詳細資訊</h4>
                        <div className="space-y-3">
                          {stationContentList.length === 0 ? (
                            <p className="text-slate-500 py-8 text-center bg-slate-50 rounded-lg">
                              尚無詳細資訊
                            </p>
                          ) : (
                            stationContentList
                              .sort((a, b) => a.order_num - b.order_num)
                              .map((content) => (
                                <div key={content.id} className="p-4 border border-slate-200 rounded-lg bg-white">
                                  <h5 className="font-medium text-lg mb-2">{content.title}</h5>
                                  {content.content && (
                                    <p className="text-slate-600 whitespace-pre-wrap">
                                      {content.content}
                                    </p>
                                  )}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </TabsContent>

          {/* Management Tab */}
          <TabsContent value="management" className="space-y-8 mt-8">
            {/* Test Item Management */}
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Target className="h-6 w-6 text-blue-600" />
                    測試項目管理
                  </CardTitle>
                  <Button onClick={() => handleAddItem()} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    新增測試項目
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => {
                      const stationItems = testItems.filter(item => item.station_id === station.id);
                      const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
                      const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
                      
                      return (
                        <div key={station.id} className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-lg">
                            <div className="flex items-center gap-4">
                              <Badge variant="outline" className="text-base px-3 py-1">
                                {station.station_order}
                              </Badge>
                              <h3 className="font-semibold text-lg">{station.station_name}</h3>
                              <Badge variant="secondary" className="text-sm">
                                {stationItems.length} 個項目
                              </Badge>
                              <Badge variant="outline" className="text-sm">
                                {totalHours} 小時
                              </Badge>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleAddItem(station.id)}
                              className="hover:bg-blue-50"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              新增項目
                            </Button>
                          </div>
                          
                          <div className="ml-8 space-y-3">
                            {stationItems.length === 0 ? (
                              <p className="text-slate-500 py-8 text-center bg-slate-50 rounded-lg">
                                尚無測試項目，點擊上方按鈕新增項目
                              </p>
                            ) : (
                              stationItems
                                .sort((a, b) => a.item_order - b.item_order)
                                .map((item) => (
                                  <div key={item.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white hover:shadow-sm transition-shadow">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className="font-medium text-lg">{item.item_name}</span>
                                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                                          <Hash className="h-3 w-3" />
                                          順序 {item.item_order}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {item.estimated_minutes}分鐘
                                        </Badge>
                                      </div>
                                      {item.description && (
                                        <p className="text-slate-600">{item.description}</p>
                                      )}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => handleEditItem(item)}
                                        className="hover:bg-blue-50"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => handleDeleteItem(item)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))
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
              <Button onClick={handleSubmitItem} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? "處理中..." : (editingItem ? "更新" : "創建")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
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
