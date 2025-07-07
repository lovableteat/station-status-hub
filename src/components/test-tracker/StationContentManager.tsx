
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface StationContent {
  id: string;
  station_id: string;
  title: string;
  content: string;
  order_num: number;
}

interface Station {
  id: string;
  station_name: string;
  station_order: number;
}

interface StationContentManagerProps {
  stations: Station[];
}

export function StationContentManager({ stations }: StationContentManagerProps) {
  const [stationContents, setStationContents] = useState<StationContent[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<StationContent | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    order_num: 1
  });
  const { toast } = useToast();

  useEffect(() => {
    loadStationContents();
  }, []);

  const loadStationContents = async () => {
    try {
      const { data, error } = await supabase
        .from('station_contents')
        .select('*')
        .order('station_id, order_num');

      if (error) throw error;
      setStationContents(data || []);
    } catch (error) {
      console.error('Error loading station contents:', error);
      toast({
        title: "載入失敗",
        description: "無法載入站點內容",
        variant: "destructive"
      });
    }
  };

  const handleAddContent = (stationId: string) => {
    setSelectedStationId(stationId);
    setEditingContent(null);
    setFormData({ title: "", content: "", order_num: 1 });
    setIsDialogOpen(true);
  };

  const handleEditContent = (content: StationContent) => {
    setSelectedStationId(content.station_id);
    setEditingContent(content);
    setFormData({
      title: content.title,
      content: content.content,
      order_num: content.order_num
    });
    setIsDialogOpen(true);
  };

  const handleSaveContent = async () => {
    try {
      if (editingContent) {
        // Update existing content
        const { error } = await supabase
          .from('station_contents')
          .update({
            title: formData.title,
            content: formData.content,
            order_num: formData.order_num
          })
          .eq('id', editingContent.id);

        if (error) throw error;
        toast({ title: "更新成功", description: "站點內容已更新" });
      } else {
        // Add new content
        const { error } = await supabase
          .from('station_contents')
          .insert({
            station_id: selectedStationId,
            title: formData.title,
            content: formData.content,
            order_num: formData.order_num
          });

        if (error) throw error;
        toast({ title: "新增成功", description: "站點內容已新增" });
      }

      setIsDialogOpen(false);
      loadStationContents();
    } catch (error) {
      console.error('Error saving station content:', error);
      toast({
        title: "儲存失敗",
        description: "無法儲存站點內容",
        variant: "destructive"
      });
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    try {
      const { error } = await supabase
        .from('station_contents')
        .delete()
        .eq('id', contentId);

      if (error) throw error;
      toast({ title: "刪除成功", description: "站點內容已刪除" });
      loadStationContents();
    } catch (error) {
      console.error('Error deleting station content:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除站點內容",
        variant: "destructive"
      });
    }
  };

  const getContentsByStation = (stationId: string) => {
    return stationContents
      .filter(content => content.station_id === stationId)
      .sort((a, b) => a.order_num - b.order_num);
  };

  const getContentTypeColor = (title: string) => {
    if (title.includes('目的')) return 'bg-blue-100 text-blue-800';
    if (title.includes('程序') || title.includes('流程')) return 'bg-green-100 text-green-800';
    if (title.includes('設備')) return 'bg-orange-100 text-orange-800';
    if (title.includes('備註')) return 'bg-gray-100 text-gray-800';
    return 'bg-purple-100 text-purple-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">測試站點內容管理</h3>
          <p className="text-sm text-muted-foreground">管理各站點的目的、測試程序、所需設備、備註等內容</p>
        </div>
      </div>

      <div className="grid gap-6">
        {stations.sort((a, b) => a.station_order - b.station_order).map(station => {
          const contents = getContentsByStation(station.id);
          
          return (
            <Card key={station.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {station.station_name}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleAddContent(station.id)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    新增內容
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {contents.length > 0 ? (
                  <div className="space-y-4">
                    {contents.map(content => (
                      <div key={content.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge className={getContentTypeColor(content.title)}>
                              {content.title}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              順序: {content.order_num}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditContent(content)}
                            >
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
                                    確定要刪除內容 "{content.title}" 嗎？此操作無法復原。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteContent(content.id)}>
                                    刪除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {content.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>尚未新增任何內容</p>
                    <p className="text-xs mt-1">點擊「新增內容」來添加站點相關資訊</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Content Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingContent ? '編輯站點內容' : '新增站點內容'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">標題類型</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如：各站目的、測試程序、所需設備、備註"
              />
            </div>
            <div>
              <Label htmlFor="content">內容</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="請輸入詳細內容..."
                rows={8}
              />
            </div>
            <div>
              <Label htmlFor="order">顯示順序</Label>
              <Input
                id="order"
                type="number"
                value={formData.order_num}
                onChange={(e) => setFormData({ ...formData, order_num: parseInt(e.target.value) || 1 })}
                min="1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                取消
              </Button>
              <Button onClick={handleSaveContent}>
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
