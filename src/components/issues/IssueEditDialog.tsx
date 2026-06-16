
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
import { Badge } from "@/components/ui/badge";
import { AttachmentManager } from "./AttachmentManager";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  system_id?: string;
  station_id?: string;
  test_item_id?: string;
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
    system_id: issue.system_id || '',
    station_id: issue.station_id || '',
    test_item_id: issue.test_item_id || '',
    process_notes: issue.process_notes || '',
    solution: issue.solution || '',
    relate: issue.relate || '',
    category: issue.category || '',
    tags: issue.tags?.join(', ') || '',
    mentionMessage: ''
  });
  
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const [systems, setSystems] = useState<Array<{id: string, system_name: string, serial_number?: string}>>([]);
  const [stations, setStations] = useState<Array<{id: string, station_name: string}>>([]);
  const [testItems, setTestItems] = useState<Array<{id: string, item_name: string, station_id: string}>>([]);
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([]);
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();
  const { user } = useUser();

  useEffect(() => {
    loadEngineers();
    loadSystems();
    loadStations();
    loadTestItems();
  }, []);

  useEffect(() => {
    if (formData.station_id) {
      loadTestItemsForStation(formData.station_id);
    }
  }, [formData.station_id]);

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

  const loadSystems = async () => {
    try {
      const { data, error } = await supabase
        .from('test_systems')
        .select('id, system_name, serial_number')
        .order('system_name');
      
      if (error) throw error;
      setSystems(data || []);
    } catch (error) {
      console.error('Error loading systems:', error);
    }
  };

  const loadStations = async () => {
    try {
      const { data, error } = await supabase
        .from('test_flow_stations')
        .select('id, station_name')
        .order('station_order');
      
      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error loading stations:', error);
    }
  };

  const loadTestItems = async () => {
    try {
      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
        .order('item_order');
      
      if (error) throw error;
      setTestItems(data || []);
    } catch (error) {
      console.error('Error loading test items:', error);
    }
  };

  const loadTestItemsForStation = async (stationId: string) => {
    try {
      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
        .eq('station_id', stationId)
        .order('item_order');
      
      if (error) throw error;
      setTestItems(data || []);
    } catch (error) {
      console.error('Error loading test items for station:', error);
    }
  };

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
        priority_manual: true,
        status: formData.status,
        assigned_to: formData.assigned_to,
        system_id: (formData.system_id && formData.system_id !== "none") ? formData.system_id : null,
        station_id: (formData.station_id && formData.station_id !== "none") ? formData.station_id : null,
        test_item_id: (formData.test_item_id && formData.test_item_id !== "none") ? formData.test_item_id : null,
        process_notes: formData.process_notes.trim() || null,
        solution: formData.solution.trim() || null,
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

      // 發送標註通知
      if (mentionedUsers.length > 0 && formData.mentionMessage.trim()) {
        try {
          await sendMentionNotifications(
            formData.mentionMessage,
            {
              title: `問題更新通知: ${formData.title}`,
              message: `${user?.displayName || '用戶'} 在問題 "${formData.title}" 中標註了您: ${formData.mentionMessage}`,
              referenceType: 'issue',
              referenceId: issue.id,
              metadata: {
                issueTitle: formData.title,
                issueStatus: formData.status,
                mentionContext: formData.mentionMessage
              }
            }
          );
        } catch (notificationError) {
          console.error('發送通知失敗:', notificationError);
        }
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左側：基本資訊 */}
        <div className="lg:col-span-2 space-y-4">
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="system">相關機台</Label>
              <Select 
                value={formData.system_id} 
                onValueChange={(value) => handleInputChange('system_id', value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇機台" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {systems.map(system => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.system_name}{system.serial_number ? ` (${system.serial_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="station">相關站點</Label>
              <Select 
                value={formData.station_id} 
                onValueChange={(value) => {
                  handleInputChange('station_id', value);
                  handleInputChange('test_item_id', '');
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇站點" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {stations.map(station => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.station_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="test_item">相關測項</Label>
              <Select 
                value={formData.test_item_id} 
                onValueChange={(value) => handleInputChange('test_item_id', value)}
                disabled={isSubmitting || !formData.station_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇測項" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {testItems
                    .filter(item => !formData.station_id || item.station_id === formData.station_id)
                    .map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.item_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
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
            <Label htmlFor="description">問題描述 *</Label>
            <RichTextEditor
              content={formData.description}
              onChange={(content) => handleInputChange('description', content)}
              placeholder="請詳細描述問題..."
              className="min-h-[120px]"
              disableImageUpload={true}
            />
          </div>

          <div>
            <Label htmlFor="process_notes">處理過程</Label>
            <RichTextEditor
              content={formData.process_notes}
              onChange={(content) => handleInputChange('process_notes', content)}
              placeholder="請記錄詳細的處理過程，包含：&#10;1. 問題分析與診斷&#10;2. 解決方案制定&#10;3. 實施步驟記錄&#10;4. 測試驗證結果&#10;5. 後續追蹤事項"
              className="min-h-[100px]"
              disableImageUpload={true}
            />
            <div className="text-xs text-muted-foreground mt-1">
              <strong>建議記錄內容：</strong> 問題診斷過程、解決方案選擇理由、實施步驟、測試結果、影響評估
            </div>
          </div>

          <div>
            <Label htmlFor="solution">解決方案</Label>
            <RichTextEditor
              content={formData.solution}
              onChange={(content) => handleInputChange('solution', content)}
              placeholder="請詳細記錄解決方案，包含：&#10;1. 採用的解決方法&#10;2. 實施步驟說明&#10;3. 相關文件或圖片&#10;4. 測試驗證結果&#10;5. 預防措施建議"
              className="min-h-[120px]"
              disableImageUpload={true}
            />
            <div className="text-xs text-muted-foreground mt-1">
              <strong>支援功能：</strong> 插入連結、調整格式等。
            </div>
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

          <div>
            <Label htmlFor="mention">標註用戶與訊息 (輸入 @ 可選擇用戶)</Label>
            <MentionInput
              value={formData.mentionMessage}
              onChange={(value, mentions) => {
                handleInputChange('mentionMessage', value);
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
        </div>

        {/* 右側：附件管理 */}
        <div className="space-y-4">
          <div>
            <Label>附件管理</Label>
            <div className="space-y-2">
              <Input 
                type="file" 
                multiple 
                accept="image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.exe,.dmg,.msi,.deb,.rpm,.msg"
                onChange={async (e) => {
                  const inputEl = e.currentTarget;
                  const files = Array.from(inputEl.files || []);
                  if (files.length === 0) return;
                  let successCount = 0;
                  for (const file of files) {
                    try {
                      const path = `${issue.id}/attachments/${Date.now()}-${file.name}`;
                      const { error } = await supabase.storage
                        .from('issue-attachments')
                        .upload(path, file, { upsert: true });
                      if (error) throw error;
                      const { error: dbErr } = await supabase.from('issue_attachments').insert({
                        issue_id: issue.id,
                        file_name: file.name,
                        file_path: path,
                        file_size: file.size,
                        file_type: file.type
                      });
                      if (dbErr) throw dbErr;
                      successCount++;
                    } catch (err) {
                      console.error('附件上傳失敗:', err);
                      toast({
                        title: '上傳失敗',
                        description: `${file.name} 無法上傳`,
                        variant: 'destructive'
                      });
                    }
                  }
                  if (successCount > 0) {
                    toast({ title: '上傳完成', description: `已成功上傳 ${successCount} 個附件` });
                  }
                  inputEl.value = '';
                  onUpdate();
                }} 
                className="text-sm"
              />
              <AttachmentManager issueId={issue.id} onUpdate={onUpdate} />
            </div>
          </div>
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
            disabled={isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? '保存中...' : '儲存變更'}
          </Button>
        </div>
      </div>
    </div>
  );
}
