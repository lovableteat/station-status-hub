import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  process_notes?: string;
  solution?: string;
  relate?: string;
  category?: string;
}

interface IssueEditDialogProps {
  issue: Issue;
  onUpdate: () => void;
  onDelete: () => void;
}

export function IssueEditDialog({ issue, onUpdate, onDelete }: IssueEditDialogProps) {
  const [formData, setFormData] = useState({
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    status: issue.status,
    assigned_to: issue.assigned_to,
    process_notes: issue.process_notes || '',
    solution: issue.solution || '',
    relate: issue.relate || '',
    category: issue.category || ''
  });
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadEngineers = async () => {
      const { data } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (data) setEngineers(data);
    };
    loadEngineers();
  }, []);

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('issues')
        .update(formData)
        .eq('id', issue.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "問題資料已成功更新"
      });

      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新問題資料",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm("確定要刪除這個問題嗎？此操作無法復原。")) return;

    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issue.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "問題已成功刪除"
      });

      onDelete();
    } catch (error) {
      toast({
        title: "刪除失敗",
        description: "無法刪除問題",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>問題標題</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="請輸入問題標題..."
        />
      </div>
      
      <div>
        <Label>問題描述</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="請詳細描述問題..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>優先級</Label>
          <Select 
            value={formData.priority} 
            onValueChange={(value) => setFormData({...formData, priority: value})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">低</SelectItem>
              <SelectItem value="medium">中</SelectItem>
              <SelectItem value="high">高</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>狀態</Label>
          <Select 
            value={formData.status} 
            onValueChange={(value) => setFormData({...formData, status: value})}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">開啟</SelectItem>
              <SelectItem value="in_progress">處理中</SelectItem>
              <SelectItem value="resolved">已解決</SelectItem>
              <SelectItem value="closed">已關閉</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>負責人</Label>
        <Select 
          value={formData.assigned_to} 
          onValueChange={(value) => setFormData({...formData, assigned_to: value})}
        >
          <SelectTrigger>
            <SelectValue placeholder="請選擇負責人..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">未指派</SelectItem>
            {engineers.map(engineer => (
              <SelectItem key={engineer.id} value={engineer.name}>
                {engineer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>相關項目</Label>
          <Input
            value={formData.relate}
            onChange={(e) => setFormData({...formData, relate: e.target.value})}
            placeholder="請輸入相關項目..."
          />
        </div>

        <div>
          <Label>問題分類</Label>
          <Input
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            placeholder="請輸入問題分類..."
          />
        </div>
      </div>

      <div>
        <Label>處理過程</Label>
        <Textarea
          value={formData.process_notes}
          onChange={(e) => setFormData({...formData, process_notes: e.target.value})}
          placeholder="請記錄處理過程..."
          rows={3}
        />
      </div>

      <div>
        <Label>解決方案</Label>
        <Textarea
          value={formData.solution}
          onChange={(e) => setFormData({...formData, solution: e.target.value})}
          placeholder="請記錄解決方案..."
          rows={3}
        />
      </div>

      <div className="flex justify-between">
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          刪除問題
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onUpdate}>
            取消
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            儲存變更
          </Button>
        </div>
      </div>
    </div>
  );
}