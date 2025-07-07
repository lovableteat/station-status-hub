
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Save, X, Target, Wrench, Settings, FileText } from "lucide-react";
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

const CONTENT_TYPES = [
  { value: "purpose", label: "各站目的", icon: Target },
  { value: "procedure", label: "測試程序", icon: Settings },
  { value: "equipment", label: "所需設備", icon: Wrench },
  { value: "notes", label: "備註", icon: FileText }
];

export function StationContentManager({ stationId, stationName, contents, onDataChange }: StationContentManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<StationContent | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    order_num: 1
  });
  const { toast } = useToast();

  // Initialize default content types if they don't exist
  useEffect(() => {
    const initializeDefaultContent = async () => {
      const existingTitles = contents.map(c => c.title);
      const missingTypes = CONTENT_TYPES.filter(type => !existingTitles.includes(type.label));
      
      if (missingTypes.length > 0) {
        try {
          const defaultContents = missingTypes.map((type, index) => ({
            title: type.label,
            content: `請編輯 ${type.label} 內容...`,
            order_num: CONTENT_TYPES.findIndex(t => t.value === type.value) + 1,
            station_id: stationId
          }));

          await supabase
            .from('station_contents')
            .insert(defaultContents);
          
          onDataChange();
        } catch (error) {
          console.error('Error initializing default content:', error);
        }
      }
    };

    if (stationId && contents.length === 0) {
      initializeDefaultContent();
    }
  }, [stationId, contents.length, onDataChange]);

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

  const quickEdit = (content: StationContent, newContent: string) => {
    supabase
      .from('station_contents')
      .update({ content: newContent })
      .eq('id', content.id)
      .then(() => {
        toast({ title: "快速更新成功" });
        onDataChange();
      })
      .catch(() => {
        toast({
          title: "更新失敗",
          description: "無法更新內容",
          variant: "destructive"
        });
      });
  };

  const getContentTypeIcon = (title: string) => {
    const contentType = CONTENT_TYPES.find(type => type.label === title);
    if (contentType) {
      const IconComponent = contentType.icon;
      return <IconComponent className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">{stationName} - 詳細內容</h4>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新增內容
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {contents
          .sort((a, b) => a.order_num - b.order_num)
          .map(content => (
            <Card key={content.id} className="relative">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {getContentTypeIcon(content.title)}
                  {content.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
                  {content.content}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openEditDialog(content)}
                    className="flex-1"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    編輯
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDelete(content.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        }
        
        {contents.length === 0 && (
          <div className="col-span-2 text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>此站點尚無詳細內容</p>
            <p className="text-sm">點擊「新增內容」開始建立站點資訊</p>
          </div>
        )}
      </div>

      {/* Content Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingContent ? '編輯內容' : '新增內容'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>內容類型</Label>
              {editingContent ? (
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="請輸入內容標題"
                />
              ) : (
                <Select 
                  value={formData.title} 
                  onValueChange={(value) => {
                    const contentType = CONTENT_TYPES.find(type => type.label === value);
                    setFormData({ 
                      ...formData, 
                      title: value,
                      order_num: contentType ? CONTENT_TYPES.findIndex(t => t.label === value) + 1 : 1
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇內容類型" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.label}>
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div>
              <Label>內容</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="請輸入詳細內容"
                rows={8}
                className="resize-none"
              />
            </div>
            
            <div>
              <Label>排序</Label>
              <Input
                type="number"
                value={formData.order_num}
                onChange={(e) => setFormData({ ...formData, order_num: parseInt(e.target.value) || 1 })}
                min="1"
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
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
  );
}
