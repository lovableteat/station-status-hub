import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { MentionInput } from "@/components/common/MentionInput";
import { useMentionNotifications } from "@/hooks/useMentionNotifications";

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
  tags?: string[];
  mentioned_users?: string[];
}

interface IssueEditDialogProps {
  issue: Issue;
  onUpdate: () => void;
  onDelete: () => void;
  onClose?: () => void;
}

export function IssueEditDialog({ issue, onUpdate, onDelete, onClose }: IssueEditDialogProps) {
  const [formData, setFormData] = useState({
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    status: issue.status,
    assigned_to: issue.assigned_to,
    process_notes: issue.process_notes || '',
    solution: issue.solution || '',
    relate: issue.relate || '',
    category: issue.category || '',
    tags: issue.tags?.join(', ') || '',
    mentioned_users: issue.mentioned_users || []
  });
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([]);
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();

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
      const updateData = {
        ...formData,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        mentioned_users: mentionedUsers.map(user => user.id)
      };
      delete updateData.mentioned_users; // Remove from update data as we handle it separately

      const { error } = await supabase
        .from('issues')
        .update(updateData)
        .eq('id', issue.id);

      if (error) throw error;

      // Send notifications to mentioned users if assigned user changed
      if (formData.assigned_to !== issue.assigned_to && formData.assigned_to !== 'unassigned') {
        await sendMentionNotifications(
          `@[${formData.assigned_to}](${formData.assigned_to})`,
          {
            title: "問題指派通知",
            message: `您被指派處理問題：${formData.title}`,
            referenceType: "issue",
            referenceId: issue.id
          }
        );
      }

      // Send notifications to mentioned users
      if (mentionedUsers.length > 0) {
        for (const user of mentionedUsers) {
          await sendMentionNotifications(
            `@[${user.displayName}](${user.id})`,
            {
              title: "問題標註通知",
              message: `您被標註在問題：${formData.title}`,
              referenceType: "issue",
              referenceId: issue.id
            }
          );
        }
      }

      toast({
        title: "更新成功",
        description: "問題資料已成功更新"
      });

      onUpdate();
      onClose?.(); // 成功後關閉對話框
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
        <RichTextEditor
          content={formData.description}
          onChange={(content) => setFormData({...formData, description: content})}
          placeholder="請詳細描述問題..."
          className="min-h-[120px]"
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
        <RichTextEditor
          content={formData.process_notes}
          onChange={(content) => setFormData({...formData, process_notes: content})}
          placeholder="請記錄處理過程..."
          className="min-h-[100px]"
        />
      </div>

      <div>
        <Label>解決方案</Label>
        <RichTextEditor
          content={formData.solution}
          onChange={(content) => setFormData({...formData, solution: content})}
          placeholder="請記錄解決方案..."
          className="min-h-[100px]"
        />
      </div>

      <div>
        <Label>標籤 (用逗號分隔)</Label>
        <Input
          value={formData.tags}
          onChange={(e) => setFormData({...formData, tags: e.target.value})}
          placeholder="例如：緊急, 硬體, 網路..."
        />
      </div>

      <div>
        <Label>標註用戶 (輸入 @ 可選擇用戶)</Label>
        <MentionInput
          value=""
          onChange={(value, mentions) => setMentionedUsers(mentions || [])}
          placeholder="輸入 @ 來標註相關用戶..."
          className="min-h-[60px]"
        />
        {mentionedUsers.length > 0 && (
          <div className="mt-2 text-sm text-muted-foreground">
            已標註用戶: {mentionedUsers.map(user => user.displayName).join(', ')}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          刪除問題
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
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