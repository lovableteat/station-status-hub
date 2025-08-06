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
import { useUser } from "@/components/auth/UserContext";

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
    mentioned_users: issue.mentioned_users || [],
    mentionMessage: ''
  });
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([]);
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();
  const { user } = useUser();

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
      const oldStatus = issue.status;
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

      // 發送標註通知到上方通知中心
      if (mentionedUsers.length > 0 && formData.mentionMessage.trim()) {
        await sendMentionNotifications(
          formData.mentionMessage,
          {
            title: `問題更新通知: ${formData.title}`,
            message: `${user?.displayName || '用戶'} 在問題 "${formData.title}" 中標註了您`,
            referenceType: 'issue',
            referenceId: issue.id,
            metadata: {
              issueTitle: formData.title,
              issueStatus: formData.status,
              mentionContext: formData.mentionMessage
            }
          }
        );
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
          placeholder="請記錄詳細的處理過程，包含：&#10;1. 問題分析與診斷&#10;2. 解決方案制定&#10;3. 實施步驟記錄&#10;4. 測試驗證結果&#10;5. 後續追蹤事項"
          className="min-h-[100px]"
        />
        <div className="text-xs text-muted-foreground mt-1">
          <strong>建議記錄內容：</strong> 問題診斷過程、解決方案選擇理由、實施步驟、測試結果、影響評估
        </div>
      </div>

      <div>
        <Label>解決方案 / SOP 操作說明</Label>
        <RichTextEditor
          content={formData.solution}
          onChange={(content) => setFormData({...formData, solution: content})}
          placeholder="請記錄解決方案與SOP操作說明，包含：&#10;1. 具體解決步驟&#10;2. 所需工具與資源&#10;3. 操作注意事項&#10;4. 驗證方法&#10;5. 預防措施"
          className="min-h-[100px]"
        />
        <div className="text-xs text-muted-foreground mt-1">
          <strong>建議包含：</strong> 詳細操作步驟、所需權限、工具清單、安全注意事項、驗證檢查點
        </div>
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
        <Label>標註用戶與訊息 (輸入 @ 可選擇用戶)</Label>
        <MentionInput
          value={formData.mentionMessage || ""}
          onChange={(value, mentions) => {
            setFormData({...formData, mentionMessage: value});
            setMentionedUsers(mentions || []);
          }}
          placeholder="輸入 @ 來標註相關用戶，並在此輸入要告知他們的訊息..."
          className="min-h-[80px]"
        />
        {mentionedUsers.length > 0 && (
          <div className="mt-2 p-2 bg-muted rounded border">
            <div className="text-sm font-medium mb-1">已標註用戶:</div>
            <div className="text-sm text-muted-foreground">
              {mentionedUsers.map(user => user.displayName).join(', ')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              這些用戶將收到即時通知並可在頁面上方的通知中心查看
            </div>
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