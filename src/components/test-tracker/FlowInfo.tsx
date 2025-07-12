
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit, FileText } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function FlowInfo() {
  const { stations, testItems, stationContents, refetch } = useUnifiedData();
  const { toast } = useToast();
  
  const [showStationDialog, setShowStationDialog] = useState(false);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stationToDelete, setStationToDelete] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [stationForm, setStationForm] = useState({
    station_name: "",
    description: "",
    estimated_hours: 0
  });

  const resetForm = () => {
    setStationForm({
      station_name: "",
      description: "",
      estimated_hours: 0
    });
    setEditingStation(null);
  };

  const handleAddStation = () => {
    resetForm();
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
    setDeleteDialogOpen(true);
  };

  const confirmDeleteStation = async () => {
    if (!stationToDelete) return;
    
    setIsSubmitting(true);
    try {
      // Database cascading will handle all related deletions automatically
      const { error } = await supabase
        .from('test_flow_stations')
        .delete()
        .eq('id', stationToDelete.id);

      if (error) throw error;

      toast({
        title: "成功",
        description: "站點及相關資料已刪除",
      });

      await refetch();
      setDeleteDialogOpen(false);
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
      // Determine the next station order
      const maxOrder = stations.length > 0 ? Math.max(...stations.map(s => s.station_order)) : -1;
      const nextOrder = editingStation ? editingStation.station_order : maxOrder + 1;

      const stationData = {
        station_name: stationForm.station_name.trim(),
        description: stationForm.description.trim() || null,
        estimated_hours: stationForm.estimated_hours,
        station_order: nextOrder
      };

      if (editingStation) {
        // Update existing station
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
        // Create new station
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

        // Create default station content
        const defaultContent = {
          station_id: newStation.id,
          title: "測試說明",
          content: "請在此添加測試說明內容",
          order_num: 1
        };

        const { error: contentError } = await supabase
          .from('station_contents')
          .insert(defaultContent);

        if (contentError) throw contentError;

        toast({
          title: "成功",
          description: "站點及相關項目已創建",
        });
      }

      await refetch();
      setShowStationDialog(false);
      resetForm();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">GB300 L10 測試流程說明</h2>
          <p className="text-muted-foreground">管理測試站點和流程</p>
        </div>
        <Button onClick={handleAddStation} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          新增站點
        </Button>
      </div>

      <div className="grid gap-6">
        {stations
          .sort((a, b) => a.station_order - b.station_order)
          .map((station) => {
            const stationItems = testItems.filter(item => item.station_id === station.id);
            const stationContentCount = stationContents.filter(content => content.station_id === station.id).length;
            
            return (
              <Card key={station.id} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        站點 {station.station_order}
                      </Badge>
                      <CardTitle className="text-xl">{station.station_name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditStation(station)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        編輯
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteStation(station)}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        刪除
                      </Button>
                    </div>
                  </div>
                  {station.description && (
                    <p className="text-muted-foreground">{station.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>預估時間: {station.estimated_hours || 0} 小時</span>
                    <span>測試項目: {stationItems.length} 個</span>
                    <span>說明內容: {stationContentCount} 項</span>
                  </div>
                  
                  {stationItems.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        測試項目
                      </h4>
                      <div className="space-y-2">
                        {stationItems
                          .sort((a, b) => a.item_order - b.item_order)
                          .map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded">
                              <div>
                                <span className="font-medium">{item.item_name}</span>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground">{item.description}</p>
                                )}
                              </div>
                              <Badge variant="secondary">
                                {item.estimated_minutes || 0} 分鐘
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Add/Edit Station Dialog */}
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
            <Button onClick={handleSubmitStation} disabled={isSubmitting}>
              {isSubmitting ? "處理中..." : (editingStation ? "更新" : "創建")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
