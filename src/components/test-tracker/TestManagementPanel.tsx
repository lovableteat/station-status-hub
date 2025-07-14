
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
import { Settings, Plus, Edit, Trash2, FileText, Target, Eye } from "lucide-react";
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

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test item management functions
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

  // Calculate totals for overview
  const totalItems = testItems.length;
  const totalEstimatedTime = testFlowStations.reduce((sum, station) => sum + (station.estimated_hours || 0), 0);

  const getStationProgress = (stationId: string) => {
    // This would typically come from actual progress data
    // For now, returning mock data for display
    return Math.floor(Math.random() * 100);
  };

  const getStationStatus = (progress: number) => {
    if (progress === 100) return { color: "bg-green-500", text: "完成" };
    if (progress > 0) return { color: "bg-orange-500", text: "進行中" };
    return { color: "bg-gray-500", text: "未開始" };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-base text-muted-foreground">各測試站點流程說明與管理測試項目</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => window.open('/test-tracker', '_blank')}
          className="flex items-center gap-2"
        >
          <Eye className="h-4 w-4" />
          查看流程
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">流程總覽</TabsTrigger>
          <TabsTrigger value="management">管理測試項目</TabsTrigger>
        </TabsList>

        {/* Flow Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Test Process Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                測試流程總覽
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {testFlowStations
                  .sort((a, b) => a.station_order - b.station_order)
                  .map((station) => {
                    const progress = getStationProgress(station.id);
                    const status = getStationStatus(progress);
                    return (
                      <Card key={station.id} className="text-center">
                        <CardContent className="p-4">
                          <div className={`w-12 h-12 rounded-full ${status.color} mx-auto mb-2 flex items-center justify-center`}>
                            <Settings className="h-6 w-6 text-white" />
                          </div>
                          <h3 className="font-medium text-sm">{station.station_name}</h3>
                          <p className="text-xs text-muted-foreground">{station.estimated_hours || 0}h</p>
                          <div className="mt-2">
                            <Badge variant="outline" className="text-xs">
                              {progress}%
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{totalItems}</div>
                    <div className="text-sm text-muted-foreground">測試項目總數</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{totalEstimatedTime}h</div>
                    <div className="text-sm text-muted-foreground">預估總測試時間</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{testFlowStations.length}</div>
                    <div className="text-sm text-muted-foreground">測試站點數量</div>
                  </CardContent>
                </Card>
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
                <Card key={station.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${status.color} flex items-center justify-center`}>
                          <Settings className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{station.station_name}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {station.description || "測試站點"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="mb-1">
                          {progress}% 完成
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          {station.estimated_hours || 0}h
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Test Items */}
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        測試項目
                      </h4>
                      <div className="space-y-2">
                        {stationItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">尚無測試項目</p>
                        ) : (
                          stationItems
                            .sort((a, b) => a.item_order - b.item_order)
                            .map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                                <div>
                                  <span className="font-medium text-sm">{item.item_name}</span>
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {item.estimated_minutes}min
                                </Badge>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Station Details */}
                    <div>
                      <h4 className="font-medium mb-2">站點詳細資訊</h4>
                      <div className="space-y-2">
                        {stationContentList.length === 0 ? (
                          <p className="text-sm text-muted-foreground">尚無詳細資訊</p>
                        ) : (
                          stationContentList
                            .sort((a, b) => a.order_num - b.order_num)
                            .map((content) => (
                              <div key={content.id} className="p-3 border rounded">
                                <h5 className="font-medium text-sm mb-1">{content.title}</h5>
                                {content.content && (
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
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
        <TabsContent value="management" className="space-y-6">
          {/* Test Item Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  測試項目管理
                </CardTitle>
                <Button onClick={() => handleAddItem()}>
                  <Plus className="h-4 w-4 mr-2" />
                  新增測試項目
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {testFlowStations
                  .sort((a, b) => a.station_order - b.station_order)
                  .map((station) => {
                    const stationItems = testItems.filter(item => item.station_id === station.id);
                    return (
                      <div key={station.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{station.station_order}</Badge>
                            <h3 className="font-medium">{station.station_name}</h3>
                            <Badge variant="secondary" className="text-xs">
                              {stationItems.length} 個項目
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {Math.round(stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0) / 60 * 10) / 10}小時
                            </Badge>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleAddItem(station.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            新增項目
                          </Button>
                        </div>
                        
                        <div className="ml-8 space-y-2">
                          {stationItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4">尚無測試項目</p>
                          ) : (
                            stationItems
                              .sort((a, b) => a.item_order - b.item_order)
                              .map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-3 border rounded">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium">{item.item_name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        順序 {item.item_order}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs">
                                        {item.estimated_minutes}min
                                      </Badge>
                                    </div>
                                    {item.description && (
                                      <p className="text-sm text-muted-foreground">{item.description}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
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
                                      className="text-red-600 hover:text-red-700"
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
            <DialogTitle>
              {editingItem ? "編輯測試項目" : "新增測試項目"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>項目名稱 *</Label>
              <Input
                value={itemForm.item_name}
                onChange={(e) => setItemForm({...itemForm, item_name: e.target.value})}
                placeholder="輸入測試項目名稱"
              />
            </div>
            <div>
              <Label>所屬站點 *</Label>
              <Select
                value={itemForm.station_id}
                onValueChange={(value) => setItemForm({...itemForm, station_id: value})}
              >
                <SelectTrigger>
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
              <Label>描述</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({...itemForm, description: e.target.value})}
                placeholder="輸入測試項目描述"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>預估時間 (分鐘)</Label>
                <Input
                  type="number"
                  min="1"
                  value={itemForm.estimated_minutes}
                  onChange={(e) => setItemForm({...itemForm, estimated_minutes: parseInt(e.target.value) || 30})}
                />
              </div>
              <div>
                <Label>執行順序</Label>
                <Input
                  type="number"
                  min="1"
                  value={itemForm.item_order}
                  onChange={(e) => setItemForm({...itemForm, item_order: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitItem} disabled={isSubmitting}>
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
  );
}
