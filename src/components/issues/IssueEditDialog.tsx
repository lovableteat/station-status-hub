import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, X } from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    status: issue.status,
    assigned_to: issue.assigned_to,
    process_notes: issue.process_notes || '',
    relate: issue.relate || '',
    category: issue.category || '',
    tags: issue.tags?.join(', ') || '',
    mentionMessage: ''
  });
  
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([]);
  const { toast } = useToast();
  const { sendMentionNotifications, isLoading: isSendingNotification } = useMentionNotifications();
  const { user } = useUser();

  const loadEngineers = async () => {
    try {
      const { data, error } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (error) {
        console.error('載入工程師列表錯誤:', error);
        return;
      }
      
      setEngineers(data || []);
    } catch (error) {
      console.error('載入工程師列表失敗:', error);
    }
  };

  useEffect(() => {
    loadEngineers();
  }, []);

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "驗證錯誤",
        description: "請輸入問題標題",
        variant: "destructive"
      });
      return;
    }

    if (!formData.description.trim()) {
      toast({
        title: "驗證錯誤", 
        description: "請輸入問題描述",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const updateData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        status: formData.status,
        assigned_to: formData.assigned_to,
        process_notes: formData.process_notes.trim() || null,
        relate: formData.relate.trim() || null,
        category: formData.category.trim() || null,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('issues')
        .update(updateData)
        .eq('id', issue.id);

      if (error) {
        console.error('更新問題錯誤:', error);
        throw error;
      }

      // 發送標註通知 - 簡化版本
      if (mentionedUsers.length > 0 && formData.mentionMessage.trim()) {
        console.log('準備發送標註通知...'); 
        await sendMentionNotifications(
          formData.mentionMessage,
          {
            title: `問題更新: ${formData.title}`,
            message: `${user?.displayName || '用戶'} 標註了您: ${formData.mentionMessage}`,
            referenceType: 'issue',
            referenceId: issue.id,
            metadata: {
              issueTitle: formData.title,
              issueStatus: formData.status
            }
          }
        );
      }

      toast({
        title: "更新成功",
        description: "問題資料已成功更新"
      });

      onUpdate();
      onClose?.();
    } catch (error) {
      console.error('保存問題失敗:', error);
      toast({
        title: "更新失敗",
        description: "無法更新問題資料，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("確定要刪除這個問題嗎？此操作無法復原。")) return;

    setIsSubmitting(true);
    
    try {
      // 先刪除相關附件
      const { error: attachmentError } = await supabase
        .from('issue_attachments')
        .delete()
        .eq('issue_id', issue.id);

      if (attachmentError) {
        console.error('刪除附件錯誤:', attachmentError);
      }

      // 刪除問題
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issue.id);

      if (error) {
        console.error('刪除問題錯誤:', error);
        throw error;
      }

      toast({
        title: "刪除成功",
        description: "問題已成功刪除"
      });

      onDelete();
    } catch (error) {
      console.error('刪除問題失敗:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除問題，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">編輯問題</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">問題標題 *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="請輸入問題標題..."
            disabled={isSubmitting}
          />
        </div>
        
        <div>
          <Label htmlFor="description">問題描述 *</Label>
          <RichTextEditor
            content={formData.description}
            onChange={(content) => handleInputChange('description', content)}
            placeholder="請詳細描述問題..."
            className="min-h-[120px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="priority">優先級</Label>
            <Select 
              value={formData.priority} 
              onValueChange={(value) => handleInputChange('priority', value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="critical">緊急</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status">狀態</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => handleInputChange('status', value)}
              disabled={isSubmitting}
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
          <Label htmlFor="assigned_to">負責人</Label>
          <Select 
            value={formData.assigned_to} 
            onValueChange={(value) => handleInputChange('assigned_to', value)}
            disabled={isSubmitting}
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
            <Label htmlFor="relate">相關項目</Label>
            <Input
              id="relate"
              value={formData.relate}
              onChange={(e) => handleInputChange('relate', e.target.value)}
              placeholder="請輸入相關項目..."
              disabled={isSubmitting}
            />
          </div>

          <div>
            <Label htmlFor="category">問題分類</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              placeholder="請輸入問題分類..."
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="process_notes">處理過程</Label>
          <RichTextEditor
            content={formData.process_notes}
            onChange={(content) => handleInputChange('process_notes', content)}
            placeholder="請記錄詳細的處理過程..."
            className="min-h-[100px]"
          />
        </div>

        <div>
          <Label htmlFor="tags">標籤 (用逗號分隔)</Label>
          <Input
            id="tags"
            value={formData.tags}
            onChange={(e) => handleInputChange('tags', e.target.value)}
            placeholder="例如：緊急, 硬體, 網路..."
            disabled={isSubmitting}
          />
        </div>

        {/* 標註功能 - 簡化版 */}
        <div>
          <Label htmlFor="mention">標註用戶與訊息</Label>
          <MentionInput
            value={formData.mentionMessage}
            onChange={(value, mentions) => {
              console.log('MentionInput onChange:', value, mentions);
              handleInputChange('mentionMessage', value);
              setMentionedUsers(mentions || []);
            }}
            placeholder="輸入 @ 來標註用戶，告訴他們要做什麼..."
            disabled={isSubmitting || isSendingNotification}
          />
          {mentionedUsers.length > 0 && (
            <div className="mt-2 p-2 bg-muted rounded">
              <div className="text-sm font-medium">已標註用戶:</div>
              <div className="text-sm text-muted-foreground">
                {mentionedUsers.map(user => user.displayName).join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button 
          variant="destructive" 
          onClick={handleDelete}
          disabled={isSubmitting}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          刪除問題
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSubmitting || isSendingNotification}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting || isSendingNotification ? '處理中...' : '儲存變更'}
          </Button>
        </div>
      </div>
    </div>
  );
}
