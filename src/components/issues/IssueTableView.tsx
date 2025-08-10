import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpDown, Edit, ImageIcon, Eye, Tag, UserPlus } from "lucide-react";
import { IssueEditDialog } from "./IssueEditDialog";
import { IssueDetailDialog } from "./IssueDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMentionNotifications } from "@/hooks/useMentionNotifications";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to: string;
  created_at: string;
  updated_at: string;
  system_id?: string;
  station_id?: string;
  test_item_id?: string;
  system_name?: string;
  station_name?: string;
  test_item_name?: string;
  relate?: string;
  category?: string;
  process_notes?: string;
  solution?: string;
  tags?: string[];
  mentioned_users?: string[];
  attachments?: Array<{
    id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    file_type: string;
  }>;
}

interface IssueTableViewProps {
  issues: Issue[];
  onUpdate: () => void;
}

export function IssueTableView({ issues, onUpdate }: IssueTableViewProps) {
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [viewingIssue, setViewingIssue] = useState<Issue | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Issue;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const [inlineEditingAssignee, setInlineEditingAssignee] = useState<string | null>(null);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<Issue['attachments']>([]);
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

  const handleSort = (key: keyof Issue) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedIssues = [...issues].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const paginatedIssues = sortedIssues.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = Math.ceil(issues.length / pageSize);

  const handleEdit = (issue: Issue) => {
    setEditingIssue(issue);
    setIsEditDialogOpen(true);
  };

  const handleEditComplete = () => {
    setIsEditDialogOpen(false);
    setEditingIssue(null);
    onUpdate();
  };

  const handleView = (issue: Issue) => {
    setViewingIssue(issue);
    setIsDetailDialogOpen(true);
  };

  const handleViewClose = () => {
    setIsDetailDialogOpen(false);
    setViewingIssue(null);
  };

  const handleViewEdit = (issue: Issue) => {
    setIsDetailDialogOpen(false);
    setViewingIssue(null);
    setEditingIssue(issue);
    setIsEditDialogOpen(true);
  };

  const handleAssigneeChange = async (issueId: string, newAssignee: string) => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({ assigned_to: newAssignee })
        .eq('id', issueId);

      if (error) throw error;

      // Send notification to newly assigned user
      if (newAssignee !== 'unassigned') {
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
          await sendMentionNotifications(
            `@[${newAssignee}](${newAssignee})`,
            {
              title: "問題指派通知",
              message: `您被指派處理問題：${issue.title}`,
              referenceType: "issue",
              referenceId: issueId
            }
          );
        }
      }

      toast({
        title: "指派成功",
        description: "負責人已更新"
      });

      onUpdate();
    } catch (error) {
      toast({
        title: "指派失敗",
        description: "無法更新負責人",
        variant: "destructive"
      });
    } finally {
      setInlineEditingAssignee(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "medium": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      case "low": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-destructive/10 text-destructive";
      case "in_progress": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "resolved":
      case "closed": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "critical": return "緊急";
      case "high": return "高";
      case "medium": return "中";
      case "low": return "低";
      default: return priority;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "open": return "待處理";
      case "in_progress": return "處理中";
      case "resolved": return "已解決";
      case "closed": return "已關閉";
      default: return status;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>問題列表 (表格模式)</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">筆/頁</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">
                  <Button variant="ghost" onClick={() => handleSort('title')}>
                    標題 <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[300px]">描述</TableHead>
                <TableHead className="w-[100px]">
                  <Button variant="ghost" onClick={() => handleSort('priority')}>
                    優先級 <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <Button variant="ghost" onClick={() => handleSort('status')}>
                    狀態 <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[120px]">
                  <Button variant="ghost" onClick={() => handleSort('assigned_to')}>
                    負責人 <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[100px]">系統</TableHead>
                <TableHead className="w-[100px]">站點</TableHead>
                <TableHead className="w-[120px]">相關項目</TableHead>
                <TableHead className="w-[120px]">問題分類</TableHead>
                <TableHead className="w-[120px]">標籤</TableHead>
                <TableHead className="w-[80px]">附件</TableHead>
                <TableHead className="w-[120px]">
                  <Button variant="ghost" onClick={() => handleSort('created_at')}>
                    建立時間 <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedIssues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <div className="font-medium line-clamp-2" title={issue.title}>
                      {issue.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="line-clamp-3 text-sm" title={issue.description}>
                      {issue.description}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                      {getPriorityText(issue.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(issue.status)}>
                      {getStatusText(issue.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inlineEditingAssignee === issue.id ? (
                      <Select
                        defaultValue={issue.assigned_to}
                        onValueChange={(value) => handleAssigneeChange(issue.id, value)}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
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
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-sm justify-start"
                        onClick={() => setInlineEditingAssignee(issue.id)}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        {issue.assigned_to || '未指派'}
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {issue.system_name || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {issue.station_name || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {issue.relate || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {issue.category || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {issue.tags && issue.tags.length > 0 ? (
                        issue.tags.slice(0, 2).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {issue.tags && issue.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{issue.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {issue.attachments && issue.attachments.length > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          setAttachmentPreview(issue.attachments || []);
                          setAttachmentDialogOpen(true);
                        }}
                        title="查看附件"
                      >
                        <ImageIcon className="h-4 w-4 mr-1" />
                        <span className="text-xs">{issue.attachments.length}</span>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {new Date(issue.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleView(issue)}
                        className="h-8 w-8 p-0"
                        title="查看詳細資訊"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(issue)}
                        className="h-8 w-8 p-0"
                        title="編輯問題"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 分頁 */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            顯示 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, issues.length)} 筆，共 {issues.length} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              上一頁
            </Button>
            <span className="text-sm">
              第 {currentPage} 頁，共 {totalPages} 頁
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              下一頁
            </Button>
          </div>
        </div>

        {/* 編輯對話框 */}
        {editingIssue && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent 
            className="max-w-6xl max-h-[85vh] overflow-y-auto"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
              <DialogHeader>
                <DialogTitle>編輯問題</DialogTitle>
              </DialogHeader>
              <IssueEditDialog
                issue={editingIssue}
                onUpdate={handleEditComplete}
                onDelete={handleEditComplete}
                onClose={() => setIsEditDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}

          {/* 查看詳細資訊對話框 */}
          {viewingIssue && (
            <IssueDetailDialog
              issue={viewingIssue}
              isOpen={isDetailDialogOpen}
              onClose={handleViewClose}
              onEdit={handleViewEdit}
            />
          )}

          {/* 附件預覽對話框 */}
          <Dialog open={attachmentDialogOpen} onOpenChange={setAttachmentDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>附件預覽</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                {attachmentPreview?.map((att) => {
                  const pub = supabase.storage.from('issue-attachments').getPublicUrl(att.file_path).data.publicUrl;
                  const isImg = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(att.file_name);
                  return (
                    <div key={att.id} className="border rounded p-2">
                      {isImg ? (
                        <img src={pub} alt={att.file_name} className="w-full h-40 object-contain rounded" />
                      ) : (
                        <div className="text-sm text-muted-foreground">{att.file_name}</div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => window.open(pub, '_blank')}>開啟</Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          const a = document.createElement('a');
                          a.href = pub;
                          a.download = att.file_name;
                          a.click();
                        }}>下載</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
      </CardContent>
    </Card>
  );
}