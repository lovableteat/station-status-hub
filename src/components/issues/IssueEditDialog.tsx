
import { useCallback, useState, useEffect, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardPenLine,
  Link2,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { MentionInput } from "@/components/common/MentionInput";
import { useMentionNotifications } from "@/hooks/useMentionNotifications";
import { useUser } from "@/components/auth/UserContext";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { Badge } from "@/components/ui/badge";
import { AttachmentManager } from "./AttachmentManager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  onAttachmentUpdate?: () => void;
}

interface MentionedUser {
  displayName: string;
  id: string;
  role: string;
  username: string;
}

export function IssueEditDialog({
  issue,
  onUpdate,
  onDelete,
  onClose,
  onAttachmentUpdate,
}: IssueEditDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentRefreshKey, setAttachmentRefreshKey] = useState(0);
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
  const [mentionedUsers, setMentionedUsers] = useState<MentionedUser[]>([]);
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();
  const { user } = useUser();
  const { activeProjectId } = useTestProject();

  const loadEngineers = useCallback(async () => {
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
  }, []);

  const loadSystems = useCallback(async () => {
    try {
      if (!activeProjectId) {
        setSystems([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_systems')
        .select('id, system_name, serial_number')
        .eq('project_id', activeProjectId)
        .order('system_name');
      
      if (error) throw error;
      setSystems(data || []);
    } catch (error) {
      console.error('Error loading systems:', error);
    }
  }, [activeProjectId]);

  const loadStations = useCallback(async () => {
    try {
      if (!activeProjectId) {
        setStations([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_flow_stations')
        .select('id, station_name')
        .eq('project_id', activeProjectId)
        .order('station_order');
      
      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error('Error loading stations:', error);
    }
  }, [activeProjectId]);

  const loadTestItems = useCallback(async () => {
    try {
      if (!activeProjectId) {
        setTestItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('test_flow_items')
        .select('id, item_name, station_id')
        .eq('project_id', activeProjectId)
        .order('item_order');
      
      if (error) throw error;
      setTestItems(data || []);
    } catch (error) {
      console.error('Error loading test items:', error);
    }
  }, [activeProjectId]);

  const loadTestItemsForStation = useCallback(async (stationId: string) => {
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
      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const updateData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        project_id: activeProjectId,
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
        .eq('project_id', activeProjectId)
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
        .eq('project_id', activeProjectId)
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

  const handleAttachmentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    setIsUploading(true);
    let successCount = 0;
    for (const [index, file] of files.entries()) {
      try {
        const path = `${issue.id}/attachments/${Date.now()}-${index}-${file.name}`;
        const { error: storageError } = await supabase.storage
          .from("issue-attachments")
          .upload(path, file, { upsert: true });
        if (storageError) throw storageError;

        const { error: databaseError } = await supabase.from("issue_attachments").insert({
          issue_id: issue.id,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          file_type: file.type,
        });
        if (databaseError) throw databaseError;
        successCount += 1;
      } catch (error) {
        console.error("附件上傳失敗:", error);
        toast({
          title: "附件上傳失敗",
          description: `${file.name} 無法上傳，其他檔案仍會繼續處理。`,
          variant: "destructive",
        });
      }
    }

    input.value = "";
    setIsUploading(false);
    if (successCount > 0) {
      setAttachmentRefreshKey((current) => current + 1);
      onAttachmentUpdate?.();
      toast({
        title: "附件已加入",
        description: `成功上傳 ${successCount} 個檔案，編輯視窗會保持開啟。`,
      });
    }
  };

  useEffect(() => {
    loadEngineers();
    loadSystems();
    loadStations();
    loadTestItems();
  }, [loadEngineers, loadStations, loadSystems, loadTestItems]);

  useEffect(() => {
    if (formData.station_id && formData.station_id !== "none") {
      loadTestItemsForStation(formData.station_id);
    } else {
      loadTestItems();
    }
  }, [formData.station_id, loadTestItems, loadTestItemsForStation]);

  const statusLabel = {
    open: "開啟",
    in_progress: "處理中",
    resolved: "已解決",
    closed: "已關閉",
  }[formData.status] || formData.status;
  const priorityLabel = {
    low: "低",
    medium: "中",
    high: "高",
    critical: "緊急",
  }[formData.priority] || formData.priority;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#071522] text-[#f3f8fc]">
      <header className="shrink-0 border-b border-[#2a526f] bg-[linear-gradient(110deg,#0b1b2d_0%,#102b41_100%)] px-5 py-4">
        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
            <ClipboardPenLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">編輯問題</h2>
              <Badge variant="outline" className="rounded-md border-amber-300/35 bg-amber-300/10 text-amber-100">{priorityLabel}</Badge>
              <Badge variant="outline" className="rounded-md border-cyan-300/35 bg-cyan-300/10 text-cyan-100">{statusLabel}</Badge>
            </div>
            <p className="mt-1 text-sm text-[#a9c0d1]">更新處理狀態、關聯機台與維修紀錄；按下儲存後才會寫入問題資料。</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-h-0 overflow-y-auto p-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-semibold text-[#dce9f2]">問題標題 *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(event) => handleInputChange("title", event.target.value)}
              placeholder="輸入可辨識的問題標題"
              disabled={isSubmitting}
              className="h-11 border-[#3c6380] bg-[#10263a] text-base font-semibold"
            />
          </div>

          <Tabs defaultValue="description" className="mt-4">
            <TabsList className="grid h-11 w-full grid-cols-3 border border-[#2a526f] bg-[#0b1b2d] p-1">
              <TabsTrigger value="description">問題描述 *</TabsTrigger>
              <TabsTrigger value="process">處理過程</TabsTrigger>
              <TabsTrigger value="solution">解決方案</TabsTrigger>
            </TabsList>
            <TabsContent value="description" className="mt-3 rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-200" />問題現象與影響</div>
              <RichTextEditor
                content={formData.description}
                onChange={(content) => handleInputChange("description", content)}
                placeholder="記錄錯誤現象、發生條件、影響範圍與重現方式..."
                className="min-h-[330px]"
                disableImageUpload
              />
            </TabsContent>
            <TabsContent value="process" className="mt-3 rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardPenLine className="h-4 w-4 text-cyan-100" />診斷與處理時間線</div>
              <RichTextEditor
                content={formData.process_notes}
                onChange={(content) => handleInputChange("process_notes", content)}
                placeholder="依時間記錄診斷、執行步驟、測試結果與待追蹤事項..."
                className="min-h-[330px]"
                disableImageUpload
              />
            </TabsContent>
            <TabsContent value="solution" className="mt-3 rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-200" />最終修復與驗證</div>
              <RichTextEditor
                content={formData.solution}
                onChange={(content) => handleInputChange("solution", content)}
                placeholder="記錄採用方案、變更內容、驗證結果與預防措施..."
                className="min-h-[330px]"
                disableImageUpload
              />
            </TabsContent>
          </Tabs>
        </main>

        <aside className="min-h-0 overflow-y-auto border-t border-[#2a526f] bg-[#091a2a] p-4 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-cyan-100" />處理狀態</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="priority">優先級</Label>
                  <Select value={formData.priority} onValueChange={(value) => handleInputChange("priority", value)} disabled={isSubmitting}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="medium">中</SelectItem><SelectItem value="high">高</SelectItem><SelectItem value="critical">緊急</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">狀態</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)} disabled={isSubmitting}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="open">開啟</SelectItem><SelectItem value="in_progress">處理中</SelectItem><SelectItem value="resolved">已解決</SelectItem><SelectItem value="closed">已關閉</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="assigned_to">負責人</Label>
                <Select value={formData.assigned_to || "unassigned"} onValueChange={(value) => handleInputChange("assigned_to", value)} disabled={isSubmitting}>
                  <SelectTrigger id="assigned_to"><SelectValue placeholder="選擇負責人" /></SelectTrigger>
                  <SelectContent><SelectItem value="unassigned">未指派</SelectItem>{engineers.map((engineer) => <SelectItem key={engineer.id} value={engineer.name}>{engineer.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </section>

            <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-cyan-100" />關聯範圍</div>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label htmlFor="system">相關機台</Label><Select value={formData.system_id || "none"} onValueChange={(value) => handleInputChange("system_id", value)} disabled={isSubmitting}><SelectTrigger id="system"><SelectValue placeholder="選擇機台" /></SelectTrigger><SelectContent><SelectItem value="none">無</SelectItem>{systems.map((system) => <SelectItem key={system.id} value={system.id}>{system.system_name}{system.serial_number ? ` (${system.serial_number})` : ""}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="station">站點</Label><Select value={formData.station_id || "none"} onValueChange={(value) => { handleInputChange("station_id", value); handleInputChange("test_item_id", ""); }} disabled={isSubmitting}><SelectTrigger id="station"><SelectValue placeholder="選擇站點" /></SelectTrigger><SelectContent><SelectItem value="none">無</SelectItem>{stations.map((station) => <SelectItem key={station.id} value={station.id}>{station.station_name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label htmlFor="test_item">測項</Label><Select value={formData.test_item_id || "none"} onValueChange={(value) => handleInputChange("test_item_id", value)} disabled={isSubmitting || !formData.station_id || formData.station_id === "none"}><SelectTrigger id="test_item"><SelectValue placeholder="選擇測項" /></SelectTrigger><SelectContent><SelectItem value="none">無</SelectItem>{testItems.filter((item) => !formData.station_id || formData.station_id === "none" || item.station_id === formData.station_id).map((item) => <SelectItem key={item.id} value={item.id}>{item.item_name}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="relate">相關項目</Label><Input id="relate" value={formData.relate} onChange={(event) => handleInputChange("relate", event.target.value)} placeholder="料號／批次" disabled={isSubmitting} /></div>
                  <div className="space-y-1.5"><Label htmlFor="category">問題分類</Label><Input id="category" value={formData.category} onChange={(event) => handleInputChange("category", event.target.value)} placeholder="硬體／線材" disabled={isSubmitting} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="tags">標籤</Label><Input id="tags" value={formData.tags} onChange={(event) => handleInputChange("tags", event.target.value)} placeholder="以逗號分隔" disabled={isSubmitting} /></div>
              </div>
            </section>

            <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-cyan-100" />通知協作者</div>
              <MentionInput
                value={formData.mentionMessage}
                onChange={(value, mentions) => { handleInputChange("mentionMessage", value); setMentionedUsers(mentions || []); }}
                placeholder="輸入 @ 選擇人員並留下通知內容..."
                className="min-h-[72px]"
              />
              {mentionedUsers.length > 0 && <div className="mt-2 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] px-2.5 py-2 text-xs text-cyan-50">儲存後通知：{mentionedUsers.map((person) => person.displayName).join("、")}</div>}
            </section>

            <section className="rounded-xl border border-[#2a526f] bg-[#0b1b2d] p-3">
              <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-cyan-100" />附件</div><Label htmlFor={`issue-file-${issue.id}`} className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-[#3c6380] bg-[#10263a] px-3 text-xs font-semibold hover:border-cyan-300/55 hover:bg-[#16324b]"><Upload className="mr-1.5 h-3.5 w-3.5" />{isUploading ? "上傳中" : "加入檔案"}</Label></div>
              <Input id={`issue-file-${issue.id}`} type="file" multiple className="sr-only" disabled={isUploading || isSubmitting} accept="image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.msg" onChange={handleAttachmentUpload} />
              <AttachmentManager issueId={issue.id} refreshKey={attachmentRefreshKey} onUpdate={onAttachmentUpdate} />
            </section>
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#2a526f] bg-[#0b1b2d] px-5 py-3">
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="ghost" className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100" disabled={isSubmitting}><Trash2 className="mr-2 h-4 w-4" />刪除問題</Button></AlertDialogTrigger>
          <AlertDialogContent className="border-rose-300/30 bg-[#0b1b2d]"><AlertDialogHeader><AlertDialogTitle>永久刪除「{formData.title}」？</AlertDialogTitle><AlertDialogDescription>問題資料與附件記錄會立即刪除，這個動作無法復原。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留問題</AlertDialogCancel><AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-500" onClick={handleDelete}>確認刪除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || isUploading}>取消</Button>
          <Button onClick={handleSave} disabled={isSubmitting || isUploading} className="min-w-28 bg-[#4c8dff] text-[#06111f] hover:bg-[#6da2ff]">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="mr-2 h-4 w-4" />}
            {isSubmitting ? "儲存中" : "儲存變更"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
