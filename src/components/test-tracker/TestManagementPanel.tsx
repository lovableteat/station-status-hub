
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings, Plus, Edit, Trash2, FileText, Target, Eye, Clock, Users, BarChart3 } from "lucide-react";
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

  // Station content management states
  const [showContentDialog, setShowContentDialog] = useState(false);
  const [editingContent, setEditingContent] = useState<any>(null);
  const [deleteContentDialog, setDeleteContentDialog] = useState(false);
  const [contentToDelete, setContentToDelete] = useState<any>(null);
  const [contentForm, setContentForm] = useState({
    title: "",
    content: "",
    station_id: "",
    order_num: 1
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Station management functions
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
    
    setIsSubmitting(true);
    try {
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
      setItemForm(prev => ({ ...prev, station_id: stationId }));
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

  // Content management functions
  const resetContentForm = () => {
    setContentForm({
      title: "",
      content: "",
      station_id: "",
      order_num: 1
    });
    setEditingContent(null);
  };

  const handleAddContent = (stationId: string) => {
    resetContentForm();
    const maxOrder = stationContents.filter(c => c.station_id === stationId).length;
    setContentForm({
      title: "",
      content: "",
      station_id: stationId,
      order_num: maxOrder + 1
    });
    setShowContentDialog(true);
  };

  const handleEditContent = (content: any) => {
    setEditingContent(content);
    setContentForm({
      title: content.title,
      content: content.content || "",
      station_id: content.station_id,
      order_num: content.order_num
    });
    setShowContentDialog(true);
  };

  const handleDeleteContent = (content: any) => {
    setContentToDelete(content);
    setDeleteContentDialog(true);
  };

  const confirmDeleteContent = async () => {
    if (!contentToDelete) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('station_contents')
        .delete()
        .eq('id', contentToDelete.id);

      if (error) throw error;

      toast({
        title: "成功",
        description: "站點內容已刪除",
      });

      await refetch();
      setDeleteContentDialog(false);
      setContentToDelete(null);
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: "錯誤",
        description: "刪除站點內容失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitContent = async () => {
    if (!contentForm.title.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入內容標題",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const contentData = {
        title: contentForm.title.trim(),
        content: contentForm.content.trim() || null,
        station_id: contentForm.station_id,
        order_num: contentForm.order_num
      };

      if (editingContent) {
        const { error } = await supabase
          .from('station_contents')
          .update(contentData)
          .eq('id', editingContent.id);

        if (error) throw error;

        toast({
          title: "成功",
          description: "站點內容已更新",
        });
      } else {
        const { error } = await supabase
          .from('station_contents')
          .insert(contentData);

        if (error) throw error;

        toast({
          title: "成功",
          description: "站點內容已創建",
        });
      }

      await refetch();
      setShowContentDialog(false);
      resetContentForm();
    } catch (error) {
      console.error('Error saving content:', error);
      toast({
        title: "錯誤",
        description: editingContent ? "更新站點內容失敗" : "創建站點內容失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate totals for overview
  const totalItems = testItems.length;
  const totalEstimatedTime = testFlowStations.reduce((sum, station) => sum + (station.estimated_hours || 0), 0);
  const totalStations = testFlowStations.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              GB300 L10 測試流程說明
            </h1>
            <p className="text-lg text-slate-600">測試站點與項目管理系統</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.open('/test-tracker', '_blank')}
            className="flex items-center gap-2 bg-white hover:bg-blue-50 border-blue-200 text-blue-600 hover:text-blue-700 shadow-sm"
          >
            <Eye className="h-4 w-4" />
            查看測試追蹤
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12 bg-white shadow-sm">
            <TabsTrigger value="overview" className="text-base data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              流程總覽
            </TabsTrigger>
            <TabsTrigger value="management" className="text-base data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              管理測試項目
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8 mt-8">
            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">{totalStations}</div>
                  <div className="text-sm text-blue-700 font-medium flex items-center justify-center gap-2">
                    <Settings className="h-4 w-4" />
                    測試站點總數
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-emerald-600 mb-2">{totalItems}</div>
                  <div className="text-sm text-emerald-700 font-medium flex items-center justify-center gap-2">
                    <Target className="h-4 w-4" />
                    測試項目總數
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">{totalEstimatedTime}h</div>
                  <div className="text-sm text-purple-700 font-medium flex items-center justify-center gap-2">
                    <Clock className="h-4 w-4" />
                    預估總時間
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Stations Overview */}
            <div className="space-y-6">
              {testFlowStations
                .sort((a, b) => a.station_order - b.station_order)
                .map((station) => {
                  const stationItems = testItems.filter(item => item.station_id === station.id);
                  const stationContentList = stationContents.filter(content => content.station_id === station.id);

                  return (
                    <Card key={station.id} className="shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
                      <CardHeader className="bg-gradient-to-r from-slate-600 to-slate-700 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shadow-lg">
                              <Settings className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">{station.station_name}</CardTitle>
                              <p className="text-slate-200 text-sm">
                                {station.description || "測試站點"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="secondary" className="mb-2 bg-white/20 text-white border-white/30">
                              站點 {station.station_order}
                            </Badge>
                            <p className="text-sm text-slate-200">
                              預估時間: {station.estimated_hours || 0}h
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8 space-y-8">
                        {/* Test Items */}
                        <div>
                          <h4 className="font-semibold text-lg mb-4 flex items-center gap-2 text-slate-700">
                            <Target className="h-5 w-5 text-blue-600" />
                            測試項目 ({stationItems.length})
                          </h4>
                          <div className="space-y-3">
                            {stationItems.length === 0 ? (
                              <div className="text-center py-8 text-slate-500">
                                <Target className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                                <p>此站點尚無測試項目</p>
                              </div>
                            ) : (
                              stationItems
                                .sort((a, b) => a.item_order - b.item_order)
                                .map((item) => (
                                  <div key={item.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                                    <div className="flex-1">
                                      <span className="font-medium text-slate-800">{item.item_name}</span>
                                      {item.description && (
                                        <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                                      )}
                                    </div>
                                    <Badge variant="outline" className="text-blue-600 border-blue-200">
                                      {item.estimated_minutes || 30}min
                                    </Badge>
                                  </div>
                                ))
                            )}
                          </div>
                        </div>

                        {/* Station Details */}
                        <div>
                          <h4 className="font-semibold text-lg mb-4 flex items-center gap-2 text-slate-700">
                            <FileText className="h-5 w-5 text-emerald-600" />
                            站點詳細資訊 ({stationContentList.length})
                          </h4>
                          <div className="space-y-4">
                            {stationContentList.length === 0 ? (
                              <div className="text-center py-8 text-slate-500">
                                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                                <p>此站點尚無詳細資訊</p>
                              </div>
                            ) : (
                              stationContentList
                                .sort((a, b) => a.order_num - b.order_num)
                                .map((content) => (
                                  <div key={content.id} className="p-5 border border-slate-200 rounded-lg bg-white shadow-sm">
                                    <h5 className="font-semibold text-slate-800 mb-2">{content.title}</h5>
                                    {content.content && (
                                      <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">
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
            </div>
          </TabsContent>

          {/* Management Tab */}
          <TabsContent value="management" className="space-y-8 mt-8">
            {/* Station Management */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Settings className="h-6 w-6" />
                    站點管理
                  </CardTitle>
                  <Button onClick={handleAddStation} className="bg-white text-blue-600 hover:bg-blue-50">
                    <Plus className="h-4 w-4 mr-2" />
                    新增站點
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-4">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => (
                      <div key={station.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className="text-blue-600 border-blue-200">
                            {station.station_order}
                          </Badge>
                          <div>
                            <div className="font-medium text-slate-800">{station.station_name}</div>
                            <div className="text-sm text-slate-600">
                              {station.description || "無描述"} • {station.estimated_hours || 0}小時
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditStation(station)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteStation(station)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  
                  {testFlowStations.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                      <Settings className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                      <p className="text-lg">尚未建立任何測試站點</p>
                      <p className="text-sm">點擊上方「新增站點」按鈕開始建立</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Test Item Management */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <Target className="h-6 w-6" />
                    測試項目管理
                  </CardTitle>
                  <Button onClick={() => handleAddItem()} className="bg-white text-emerald-600 hover:bg-emerald-50">
                    <Plus className="h-4 w-4 mr-2" />
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
                        <div key={station.id} className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-slate-600 border-slate-300">{station.station_order}</Badge>
                              <h3 className="font-semibold text-lg text-slate-800">{station.station_name}</h3>
                              <Badge variant="secondary" className="text-sm bg-blue-100 text-blue-700">
                                {stationItems.length} 個項目
                              </Badge>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleAddItem(station.id)}
                              className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              新增項目
                            </Button>
                          </div>
                          
                          <div className="ml-8 space-y-3">
                            {stationItems.length === 0 ? (
                              <div className="text-center py-8 text-slate-500">
                                <Target className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                                <p>此站點尚無測試項目</p>
                              </div>
                            ) : (
                              stationItems
                                .sort((a, b) => a.item_order - b.item_order)
                                .map((item) => (
                                  <div key={item.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className="font-medium text-slate-800">{item.item_name}</span>
                                        <Badge variant="outline" className="text-xs text-slate-600 border-slate-300">
                                          順序 {item.item_order}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                          {item.estimated_minutes || 30}min
                                        </Badge>
                                      </div>
                                      {item.description && (
                                        <p className="text-sm text-slate-600">{item.description}</p>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => handleEditItem(item)}
                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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

            {/* Station Content Management */}
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <FileText className="h-6 w-6" />
                  站點內容管理
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="space-y-8">
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map((station) => {
                      const stationContentList = stationContents.filter(content => content.station_id === station.id);
                      return (
                        <div key={station.id} className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-slate-600 border-slate-300">{station.station_order}</Badge>
                              <h3 className="font-semibold text-lg text-slate-800">{station.station_name}</h3>
                              <Badge variant="secondary" className="text-sm bg-purple-100 text-purple-700">
                                {stationContentList.length} 項內容
                              </Badge>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleAddContent(station.id)}
                              className="text-purple-600 border-purple-200 hover:bg-purple-50"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              新增內容
                            </Button>
                          </div>
                          
                          <div className="ml-8 space-y-3">
                            {stationContentList.length === 0 ? (
                              <div className="text-center py-8 text-slate-500">
                                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                                <p>此站點尚無詳細內容</p>
                              </div>
                            ) : (
                              stationContentList
                                .sort((a, b) => a.order_num - b.order_num)
                                .map((content) => (
                                  <div key={content.id} className="p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                          <Badge variant="outline" className="text-xs text-slate-600 border-slate-300">
                                            {content.order_num}
                                          </Badge>
                                          <span className="font-medium text-slate-800">{content.title}</span>
                                        </div>
                                        {content.content && (
                                          <p className="text-sm text-slate-600 whitespace-pre-wrap">
                                            {content.content}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex gap-1 ml-4">
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          onClick={() => handleEditContent(content)}
                                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="sm"
                                          onClick={() => handleDeleteContent(content)}
                                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
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
                <Label>站點名稱 *</Label>
                <Input
                  value={stationForm.station_name}
                  onChange={(e) => setStationForm({...stationForm, station_name: e.target.value})}
                  placeholder="輸入站點名稱"
                />
              </div>
              <div>
                <Label>描述</Label>
                <Textarea
                  value={stationForm.description}
                  onChange={(e) => setStationForm({...stationForm, description: e.target.value})}
                  placeholder="輸入站點描述"
                  rows={3}
                />
              </div>
              <div>
                <Label>預估時間 (小時)</Label>
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
                <select
                  className="w-full p-2 border rounded"
                  value={itemForm.station_id}
                  onChange={(e) => setItemForm({...itemForm, station_id: e.target.value})}
                >
                  <option value="">選擇站點</option>
                  {testFlowStations
                    .sort((a, b) => a.station_order - b.station_order)
                    .map(station => (
                      <option key={station.id} value={station.id}>
                        {station.station_name}
                      </option>
                    ))}
                </select>
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

        {/* Content Dialog */}
        <Dialog open={showContentDialog} onOpenChange={setShowContentDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingContent ? "編輯站點內容" : "新增站點內容"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>標題 *</Label>
                <Input
                  value={contentForm.title}
                  onChange={(e) => setContentForm({...contentForm, title: e.target.value})}
                  placeholder="輸入內容標題"
                />
              </div>
              <div>
                <Label>內容</Label>
                <Textarea
                  value={contentForm.content}
                  onChange={(e) => setContentForm({...contentForm, content: e.target.value})}
                  placeholder="輸入詳細內容"
                  rows={5}
                />
              </div>
              <div>
                <Label>順序</Label>
                <Input
                  type="number"
                  min="1"
                  value={contentForm.order_num}
                  onChange={(e) => setContentForm({...contentForm, order_num: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowContentDialog(false)}>
                取消
              </Button>
              <Button onClick={handleSubmitContent} disabled={isSubmitting}>
                {isSubmitting ? "處理中..." : (editingContent ? "更新" : "創建")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialogs */}
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
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSubmitting ? "刪除中..." : "確認刪除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

        <AlertDialog open={deleteContentDialog} onOpenChange={setDeleteContentDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除站點內容</AlertDialogTitle>
              <AlertDialogDescription>
                您確定要刪除「{contentToDelete?.title}」內容嗎？
                此操作無法撤銷。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteContent}
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
