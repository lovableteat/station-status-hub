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
    solution: issue.solution || '',
    relate: issue.relate || '',
    category: issue.category || '',
    tags: issue.tags?.join(', ') || '',
    mentionMessage: '',
    mentionedUsers: issue.mentioned_users || []
  });
  const [showMentionSection, setShowMentionSection] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<Array<{id: string, name: string}>>([]);
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string, name: string, email?: string}>>([]);
  
  const { user } = useUser();
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();

  // SOP 範本內容
  const sopTemplate = `
<h2>📋 問題處理 SOP 操作說明</h2>

<h3>🔍 問題分析階段</h3>
<ul>
  <li><strong>問題確認：</strong>仔細閱讀問題描述，確認問題的具體症狀與影響範圍</li>
  <li><strong>環境檢查：</strong>確認發生問題的系統環境、版本資訊、相關配置</li>
  <li><strong>重現驗證：</strong>嘗試重現問題，記錄重現步驟與條件</li>
  <li><strong>影響評估：</strong>分析問題對業務流程的影響程度與優先級</li>
</ul>

<h3>⚙️ 處理步驟詳解</h3>
<ol>
  <li><strong>問題歸類：</strong>根據問題性質選擇適當的分類與標籤</li>
  <li><strong>責任分派：</strong>指派給最適合的工程師或團隊成員</li>
  <li><strong>處理記錄：</strong>在「處理過程記錄」中詳細記錄每個處理步驟</li>
  <li><strong>解決方案：</strong>實施解決方案並在「解決方案」欄位記錄詳細內容</li>
  <li><strong>驗證測試：</strong>確認問題已完全解決，更新狀態為「已解決」</li>
</ol>

<h3>⚠️ 重要注意事項</h3>
<ul>
  <li><strong>即時更新：</strong>處理過程中應及時更新問題狀態與進度</li>
  <li><strong>完整記錄：</strong>所有處理步驟都應詳細記錄，便於後續追蹤</li>
  <li><strong>團隊協作：</strong>必要時使用 @ 功能標註相關人員協助處理</li>
  <li><strong>知識累積：</strong>將解決方案整理成可重複使用的知識庫</li>
</ul>

<h3>🔧 常見問題處理</h3>
<ul>
  <li><strong>無法重現：</strong>請提供更詳細的環境資訊與操作步驟</li>
  <li><strong>權限不足：</strong>聯繫系統管理員或相關負責人員</li>
  <li><strong>跨部門問題：</strong>使用標註功能邀請相關部門人員參與</li>
  <li><strong>緊急問題：</strong>優先級設為「緊急」並立即通知相關人員</li>
</ul>

<h3>📚 相關資源連結</h3>
<ul>
  <li><a href="/test-tracker" target="_blank">測試追蹤系統</a></li>
  <li><a href="/tools" target="_blank">工具管理系統</a></li>
  <li><a href="/dashboard" target="_blank">系統儀表板</a></li>
</ul>
  `.trim();

  useEffect(() => {
    loadAvailableUsers();
  }, []);

  const loadAvailableUsers = async () => {
    try {
      const { data: engineers } = await supabase
        .from('engineers')
        .select('name, email')
        .eq('status', 'active');
      
      const { data: systemUsers } = await supabase
        .from('system_users')
        .select('username, display_name')
        .eq('status', 'active');

      const users = [
        ...(engineers || []).map(eng => ({
          id: eng.name,
          name: eng.name,
          email: eng.email
        })),
        ...(systemUsers || []).map(user => ({
          id: user.username,
          name: user.display_name || user.username
        }))
      ];

      setAvailableUsers(users);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // 處理標註用戶
  const handleMentionUser = (userId: string) => {
    if (!mentionUsers.find(u => u.id === userId)) {
      const user = availableUsers.find(u => u.id === userId);
      if (user) {
        setMentionUsers([...mentionUsers, user]);
      }
    }
  };

  const removeMentionUser = (userId: string) => {
    setMentionUsers(mentionUsers.filter(u => u.id !== userId));
  };

  const sendMentionNotification = async () => {
    if (!formData.mentionMessage.trim() || mentionUsers.length === 0) {
      toast({
        title: "錯誤",
        description: "請輸入訊息內容並選擇要標註的用戶",
        variant: "destructive"
      });
      return;
    }

    try {
      // 發送通知給每個被標註的用戶
      for (const mentionedUser of mentionUsers) {
        await supabase
          .from('user_notifications')
          .insert({
            recipient_id: mentionedUser.id,
            sender_id: user?.userId || 'system',
            notification_type: 'mention',
            title: `${user?.displayName || '用戶'} 在問題中標註了您`,
            message: formData.mentionMessage,
            reference_type: 'issue',
            reference_id: issue.id,
            metadata: {
              issue_title: formData.title,
              sender_name: user?.displayName || '用戶',
              mention_context: 'issue_edit'
            }
          });
      }

      // 更新問題的mentioned_users欄位
      const updatedMentionedUsers = [...new Set([
        ...(formData.mentionedUsers || []),
        ...mentionUsers.map(u => u.id)
      ])];

      setFormData({
        ...formData,
        mentionedUsers: updatedMentionedUsers,
        mentionMessage: ''
      });
      
      setMentionUsers([]);
      setShowMentionSection(false);

      toast({
        title: "通知已發送",
        description: `已成功通知 ${mentionUsers.length} 位用戶`
      });
    } catch (error) {
      console.error('Error sending mention notification:', error);
      toast({
        title: "發送失敗",
        description: "無法發送標註通知",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      toast({
        title: "錯誤",
        description: "請填寫標題和描述",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const tagsArray = formData.tags 
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];

      const { error } = await supabase
        .from('issues')
        .update({
          title: formData.title.trim(),
          description: formData.description.trim(),
          priority: formData.priority,
          status: formData.status,
          assigned_to: formData.assigned_to || null,
          process_notes: formData.process_notes.trim() || null,
          solution: formData.solution.trim() || null,
          relate: formData.relate.trim() || null,
          category: formData.category.trim() || null,
          tags: tagsArray,
          mentioned_users: formData.mentionedUsers,
          updated_at: new Date().toISOString()
        })
        .eq('id', issue.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "問題已成功更新"
      });
      
      onUpdate();
      onClose?.();
    } catch (error) {
      console.error('Error updating issue:', error);
      toast({
        title: "更新失敗",
        description: "無法更新問題",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issue.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "問題已刪除"
      });
      
      onDelete();
      onClose?.();
    } catch (error) {
      console.error('Error deleting issue:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除問題",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadSOPTemplate = () => {
    setFormData({
      ...formData,
      process_notes: sopTemplate
    });
    toast({
      title: "SOP 範本已載入",
      description: "已套用標準問題處理SOP範本到處理過程記錄中"
    });
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-2xl font-bold">編輯問題</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSOPTemplate}>
            📋 載入SOP範本
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* 基本資訊 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">問題標題 *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="請輸入問題標題"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">分類</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              placeholder="例如：硬體故障、軟體問題、流程改善"
            />
          </div>
        </div>

        {/* 問題描述 */}
        <div className="space-y-2">
          <Label htmlFor="description">問題描述 *</Label>
          <RichTextEditor
            content={formData.description}
            onChange={(content) => setFormData({...formData, description: content})}
            placeholder="請詳細描述問題的現象、發生條件、影響範圍等..."
            className="min-h-[150px]"
          />
        </div>

        {/* 優先級和狀態 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority">優先級</Label>
            <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
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
          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">待處理</SelectItem>
                <SelectItem value="in_progress">處理中</SelectItem>
                <SelectItem value="resolved">已解決</SelectItem>
                <SelectItem value="closed">已關閉</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 指派和相關資訊 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="assigned_to">指派給</Label>
            <Input
              id="assigned_to"
              value={formData.assigned_to}
              onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
              placeholder="請輸入負責人姓名"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relate">相關項目</Label>
            <Input
              id="relate"
              value={formData.relate}
              onChange={(e) => setFormData({...formData, relate: e.target.value})}
              placeholder="相關的系統、設備或項目"
            />
          </div>
        </div>

        {/* 處理過程記錄 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="process_notes">處理過程記錄</Label>
            <div className="text-xs text-muted-foreground">
              💡 建議使用上方的「載入SOP範本」來標準化處理流程
            </div>
          </div>
          <RichTextEditor
            content={formData.process_notes}
            onChange={(content) => setFormData({...formData, process_notes: content})}
            placeholder="記錄問題的處理過程、分析結果和處理步驟..."
            className="min-h-[200px]"
          />
        </div>

        {/* 解決方案 */}
        <div className="space-y-2">
          <Label htmlFor="solution">解決方案</Label>
          <RichTextEditor
            content={formData.solution}
            onChange={(content) => setFormData({...formData, solution: content})}
            placeholder="描述最終的解決方案、修復方法或替代方案..."
            className="min-h-[150px]"
          />
        </div>

        {/* 相關資訊 */}
        <div className="space-y-2">
          <Label htmlFor="relate">相關資訊</Label>
          <RichTextEditor
            content={formData.relate}
            onChange={(content) => setFormData({...formData, relate: content})}
            placeholder="相關的系統資訊、參考文件、外部連結等..."
            className="min-h-[100px]"
          />
        </div>

        {/* 標籤 */}
        <div className="space-y-2">
          <Label htmlFor="tags">標籤</Label>
          <Input
            id="tags"
            value={formData.tags}
            onChange={(e) => setFormData({...formData, tags: e.target.value})}
            placeholder="以逗號分隔多個標籤，例如：緊急,硬體,GPU"
          />
        </div>

        {/* 標註用戶功能 */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-medium">標註用戶協作</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMentionSection(!showMentionSection)}
            >
              {showMentionSection ? "收起" : "展開"} 標註功能
            </Button>
          </div>
          
          {showMentionSection && (
            <div className="space-y-4">
              {/* 選擇要標註的用戶 */}
              <div className="space-y-2">
                <Label>選擇要標註的用戶</Label>
                <div className="flex flex-wrap gap-2">
                  {availableUsers.map(user => (
                    <Button
                      key={user.id}
                      type="button"
                      variant={mentionUsers.find(u => u.id === user.id) ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (mentionUsers.find(u => u.id === user.id)) {
                          removeMentionUser(user.id);
                        } else {
                          handleMentionUser(user.id);
                        }
                      }}
                    >
                      @ {user.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 顯示已選擇的用戶 */}
              {mentionUsers.length > 0 && (
                <div className="space-y-2">
                  <Label>已選擇的用戶</Label>
                  <div className="flex flex-wrap gap-2">
                    {mentionUsers.map(user => (
                      <div key={user.id} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                        <span className="text-sm">@ {user.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={() => removeMentionUser(user.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 標註訊息輸入 */}
              <div className="space-y-2">
                <Label htmlFor="mentionMessage">標註訊息</Label>
                <Textarea
                  id="mentionMessage"
                  value={formData.mentionMessage}
                  onChange={(e) => setFormData({...formData, mentionMessage: e.target.value})}
                  placeholder="輸入要發送給被標註用戶的訊息..."
                  rows={3}
                />
              </div>

              <Button
                type="button"
                onClick={sendMentionNotification}
                disabled={!formData.mentionMessage.trim() || mentionUsers.length === 0}
                className="w-full"
              >
                發送標註通知
              </Button>

              {/* 顯示已標註的用戶 */}
              {formData.mentionedUsers && formData.mentionedUsers.length > 0 && (
                <div className="space-y-2">
                  <Label>此問題已標註的用戶</Label>
                  <div className="flex flex-wrap gap-2">
                    {formData.mentionedUsers.map(userId => (
                      <div key={userId} className="bg-green-100 dark:bg-green-900 px-2 py-1 rounded text-sm">
                        @ {availableUsers.find(u => u.id === userId)?.name || userId}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 操作按鈕 */}
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
              disabled={isSubmitting}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? "保存中..." : "儲存變更"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}