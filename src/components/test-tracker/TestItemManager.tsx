import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Edit, Trash2, Save, X, ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
}

interface TestItemManagerProps {
  stations: TestStation[];
  items: TestItem[];
  onDataChange: () => void;
}

export function TestItemManager({ stations, items, onDataChange }: TestItemManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TestItem | null>(null);
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    item_name: '',
    station_id: '',
    description: '',
    estimated_minutes: 30,
    item_order: 1
  });
  const { toast } = useToast();
  const { activeProjectId } = useTestProject();

  const handleSave = async () => {
    try {
      if (!activeProjectId) {
        throw new Error("No active project");
      }

      if (editingItem) {
        // Update existing item
        await supabase
          .from('test_flow_items')
          .update({
            item_name: formData.item_name,
            station_id: formData.station_id,
            description: formData.description,
            estimated_minutes: formData.estimated_minutes,
            item_order: formData.item_order
          })
          .eq('id', editingItem.id);
        
        toast({ title: "更新成功", description: "測試項目已更新" });
      } else {
        // Create new item
        await supabase
          .from('test_flow_items')
          .insert({
            project_id: activeProjectId,
            item_name: formData.item_name,
            station_id: formData.station_id,
            description: formData.description,
            estimated_minutes: formData.estimated_minutes,
            item_order: formData.item_order
          });
        
        toast({ title: "新增成功", description: "測試項目已新增" });
      }
      
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
      onDataChange();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存測試項目",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      // 先檢查是否有相關的測試進度記錄
      const { data: relatedProgress } = await supabase
        .from('test_progress')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('item_id', itemId);

      if (relatedProgress && relatedProgress.length > 0) {
        // 如果有相關記錄，先刪除測試進度記錄
        await supabase
          .from('test_progress')
          .delete()
          .eq('project_id', activeProjectId)
          .eq('item_id', itemId);
      }

      // 然後刪除測試項目
      const { error } = await supabase
        .from('test_flow_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      
      toast({ title: "刪除成功", description: "測試項目已刪除" });
      onDataChange();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除測試項目，可能有相關的測試記錄",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      item_name: '',
      station_id: '',
      description: '',
      estimated_minutes: 30,
      item_order: 1
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingItem(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: TestItem) => {
    setFormData({
      item_name: item.item_name,
      station_id: item.station_id,
      description: item.description || '',
      estimated_minutes: item.estimated_minutes || 30,
      item_order: item.item_order
    });
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const getStationName = (stationId: string) => {
    return stations.find(s => s.id === stationId)?.station_name || '未知站點';
  };

  const toggleStationExpanded = (stationId: string) => {
    const newExpanded = new Set(expandedStations);
    if (newExpanded.has(stationId)) {
      newExpanded.delete(stationId);
    } else {
      newExpanded.add(stationId);
    }
    setExpandedStations(newExpanded);
  };

  const getStationItems = (stationId: string) => {
    return items.filter(item => item.station_id === stationId).sort((a, b) => a.item_order - b.item_order);
  };

  const getStationItemsCount = (stationId: string) => {
    return items.filter(item => item.station_id === stationId).length;
  };

  const getTotalMinutes = (stationId: string) => {
    return items
      .filter(item => item.station_id === stationId)
      .reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
  };

  return (
    <Card className="overflow-hidden border-violet-200/25 bg-slate-800/85">
      <CardHeader className="bg-violet-500/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-xl text-slate-50 sm:text-xl">
            <ListChecks className="h-5 w-5 text-violet-100" />
            測試項目管理
          </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} className="bg-violet-400/20 text-violet-50 hover:bg-violet-400/30">
              <Plus className="h-4 w-4 mr-2" />
              新增測試項目
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingItem ? '編輯測試項目' : '新增測試項目'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>項目名稱</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="請輸入測試項目名稱"
                />
              </div>
              
              <div>
                <Label>所屬站點</Label>
                <Select value={formData.station_id} onValueChange={(value) => setFormData({ ...formData, station_id: value })}>
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
                <Label>描述</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="請輸入測試項目描述"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>預估時間 (分鐘)</Label>
                  <Input
                    type="number"
                    value={formData.estimated_minutes}
                    onChange={(e) => setFormData({ ...formData, estimated_minutes: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div>
                  <Label>執行順序</Label>
                  <Input
                    type="number"
                    value={formData.item_order}
                    onChange={(e) => setFormData({ ...formData, item_order: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  儲存
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>

      <CardContent>
      <div className="space-y-4">
        {stations
          .sort((a, b) => a.station_order - b.station_order)
          .map(station => {
            const stationItems = getStationItems(station.id);
            const itemsCount = getStationItemsCount(station.id);
            const totalMinutes = getTotalMinutes(station.id);
            const isExpanded = expandedStations.has(station.id);
            
            return (
              <Card key={station.id} className="overflow-hidden border-slate-500/45 bg-slate-900/35">
                <Collapsible 
                  open={isExpanded} 
                  onOpenChange={() => toggleStationExpanded(station.id)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer border-b-0 bg-slate-800/65 p-4 transition-colors hover:bg-violet-500/10 sm:p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-violet-100" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-violet-100" />
                          )}
                          <CardTitle className="text-base text-slate-50 sm:text-base">{station.station_name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="secondary" className="border border-violet-200/25 bg-violet-400/15 text-xs text-violet-100">
                            {itemsCount} 個項目
                          </Badge>
                          <Badge variant="outline" className="border-slate-400/35 bg-slate-700/70 text-xs text-slate-200">
                            {Math.round(totalMinutes / 60 * 10) / 10}小時
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {stationItems.length === 0 ? (
                          <p className="text-center text-slate-300 py-8">
                            此站點尚無測試項目
                          </p>
                        ) : (
                          stationItems.map(item => (
                            <div key={item.id} className="rounded-2xl border border-slate-500/40 bg-slate-800/70 p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-sm font-semibold text-slate-50">{item.item_name}</h4>
                                    <Badge variant="outline" className="border-violet-200/25 bg-violet-400/15 text-xs text-violet-100">
                                      順序 {item.item_order}
                                    </Badge>
                                    <Badge variant="secondary" className="border border-blue-200/25 bg-blue-400/15 text-xs text-blue-100">
                                      {item.estimated_minutes || 30} 分鐘
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-slate-300">
                                    {item.description || '無描述'}
                                  </p>
                                </div>
                                <div className="flex gap-1 ml-4">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => openEditDialog(item)}
                                    className="hover:bg-violet-400/15 hover:text-violet-100"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => handleDelete(item.id)}
                                    className="hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })
        }
      </div>
      </CardContent>
    </Card>
  );
}
