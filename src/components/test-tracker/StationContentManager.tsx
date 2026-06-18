
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Save, X, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
}

interface StationContentManagerProps {
  stationId: string;
  stationName: string;
  contents: StationContent[];
  onUpdate: () => void;
}

export function StationContentManager({ 
  stationId, 
  stationName, 
  contents, 
  onUpdate 
}: StationContentManagerProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newContent, setNewContent] = useState({ title: '', content: '' });
  const [editValues, setEditValues] = useState({ title: '', content: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = async () => {
    if (!newContent.title.trim()) {
      toast({
        title: "請填寫標題",
        variant: "destructive"
      });
      return;
    }

    try {
      const maxOrder = contents.length > 0 ? Math.max(...contents.map(c => c.order_num)) : 0;
      
      const { error } = await supabase
        .from('station_contents')
        .insert({
          station_id: stationId,
          title: newContent.title.trim(),
          content: newContent.content.trim(),
          order_num: maxOrder + 1
        });

      if (error) throw error;

      setNewContent({ title: '', content: '' });
      setShowAddForm(false);
      onUpdate();
      
      toast({
        title: "新增成功",
        description: "流程內容已新增"
      });
    } catch (error) {
      console.error('Error adding content:', error);
      toast({
        title: "新增失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (content: StationContent) => {
    setEditingId(content.id);
    setEditValues({ title: content.title, content: content.content });
  };

  const handleSave = async (id: string) => {
    if (!editValues.title.trim()) {
      toast({
        title: "請填寫標題",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('station_contents')
        .update({
          title: editValues.title.trim(),
          content: editValues.content.trim()
        })
        .eq('id', id);

      if (error) throw error;

      setEditingId(null);
      onUpdate();
      
      toast({
        title: "更新成功",
        description: "流程內容已更新"
      });
    } catch (error) {
      console.error('Error updating content:', error);
      toast({
        title: "更新失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個流程內容嗎？')) return;

    try {
      const { error } = await supabase
        .from('station_contents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      onUpdate();
      
      toast({
        title: "刪除成功",
        description: "流程內容已刪除"
      });
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: "刪除失敗",
        description: "請稍後再試",
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {stationName} - 流程內容管理
          </CardTitle>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="sm"
            className="text-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            新增內容
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-3">
              <Input
                placeholder="標題"
                value={newContent.title}
                onChange={(e) => setNewContent({ ...newContent, title: e.target.value })}
                className="text-sm"
              />
              <Textarea
                placeholder="內容描述"
                value={newContent.content}
                onChange={(e) => setNewContent({ ...newContent, content: e.target.value })}
                rows={3}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={handleAdd} size="sm" className="text-sm">
                  <Save className="h-3 w-3 mr-1" />
                  儲存
                </Button>
                <Button 
                  onClick={() => {
                    setShowAddForm(false);
                    setNewContent({ title: '', content: '' });
                  }} 
                  variant="outline" 
                  size="sm"
                  className="text-sm"
                >
                  <X className="h-3 w-3 mr-1" />
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Content List */}
        <div className="space-y-3">
          {contents.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">尚未新增任何流程內容</p>
              <p className="mt-1 text-sm">點擊上方「新增內容」開始建立</p>
            </div>
          ) : (
            contents
              .sort((a, b) => a.order_num - b.order_num)
              .map((content, index) => (
                <Card key={content.id} className="relative">
                  <CardContent className="p-4">
                    {editingId === content.id ? (
                      <div className="space-y-3">
                        <Input
                          value={editValues.title}
                          onChange={(e) => setEditValues({ ...editValues, title: e.target.value })}
                          className="text-sm font-medium"
                        />
                        <Textarea
                          value={editValues.content}
                          onChange={(e) => setEditValues({ ...editValues, content: e.target.value })}
                          rows={3}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => handleSave(content.id)} size="sm" className="text-sm">
                            <Save className="h-3 w-3 mr-1" />
                            儲存
                          </Button>
                          <Button 
                            onClick={() => setEditingId(null)} 
                            variant="outline" 
                            size="sm"
                            className="text-sm"
                          >
                            <X className="h-3 w-3 mr-1" />
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {index + 1}
                            </Badge>
                            <h4 className="text-sm font-medium">{content.title}</h4>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              onClick={() => handleEdit(content)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => handleDelete(content.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {content.content && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {content.content}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
