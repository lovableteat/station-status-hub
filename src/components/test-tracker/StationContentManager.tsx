import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
}

interface StationContentManagerProps {
  stationId: string;
  stationName: string;
  contents: StationContent[];
  onDataChange: () => void;
}

export function StationContentManager({ stationId, stationName, contents, onDataChange }: StationContentManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<StationContent | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    order_num: 1
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      if (editingContent) {
        // Update existing content
        await supabase
          .from('station_contents')
          .update({
            title: formData.title,
            content: formData.content,
            order_num: formData.order_num
          })
          .eq('id', editingContent.id);
        
        toast({ title: "更新成功", description: "內容已更新" });
      } else {
        // Create new content
        await supabase
          .from('station_contents')
          .insert({
            title: formData.title,
            content: formData.content,
            order_num: formData.order_num,
            station_id: stationId
          });
        
        toast({ title: "新增成功", description: "內容已新增" });
      }
      
      setIsDialogOpen(false);
      setEditingContent(null);
      resetForm();
      onDataChange();
    } catch (error) {
      toast({
        title: "操作失敗",
        description: "無法儲存內容",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (contentId: string) => {
    try {
      await supabase
        .from('station_contents')
        .delete()
        .eq('id', contentId);
      
      toast({ title: "刪除成功", description: "內容已刪除" });
      onDataChange();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除內容",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      order_num: 1
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingContent(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (content: StationContent) => {
    setFormData({
      title: content.title,
      content: content.content,
      order_num: content.order_num
    });
    setEditingContent(content);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">{stationName} - 詳細內容</h4>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              新增內容
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingContent ? '編輯內容' : '新增內容'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>標題</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="請輸入內容標題"
                />
              </div>
              
              <div>
                <Label>內容</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="請輸入詳細內容"
                  rows={6}
                />
              </div>
              
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={formData.order_num}
                  onChange={(e) => setFormData({ ...formData, order_num: parseInt(e.target.value) || 1 })}
                />
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

      <div className="space-y-3">
        {contents
          .sort((a, b) => a.order_num - b.order_num)
          .map(content => (
            <Card key={content.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="font-medium mb-2">{content.title}</h5>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {content.content}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => openEditDialog(content)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDelete(content.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        }
        
        {contents.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            此站點尚無詳細內容
          </div>
        )}
      </div>
    </div>
  );
}