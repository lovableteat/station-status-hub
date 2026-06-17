import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpDown, Edit, ImageIcon, Eye, UserPlus, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueEditDialog } from "./IssueEditDialog";
import { IssueDetailDialog } from "./IssueDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMentionNotifications } from "@/hooks/useMentionNotifications";
import { getEffectivePriority, IssuePriority } from "@/lib/issuePriority";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: IssuePriority;
  priority_manual?: boolean;
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to: string;
  created_at: string;
  updated_at: string;
  system_id?: string;
  station_id?: string;
  test_item_id?: string;
  system_name?: string;
  serial_number?: string;
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

type ColumnKey =
  | "system"
  | "fail_log"
  | "priority"
  | "status"
  | "assigned_to"
  | "station"
  | "category"
  | "attachments"
  | "created_at"
  | "actions";

const TABLE_KEY = "issues_table_v1";

const DEFAULT_COLUMNS: ColumnKey[] = [
  "system",
  "fail_log",
  "priority",
  "status",
  "assigned_to",
  "station",
  "category",
  "attachments",
  "created_at",
  "actions",
];

const COLUMN_META: Record<ColumnKey, { label: string; width: string; sortable?: keyof Issue }> = {
  system: { label: "系統", width: "w-[140px]" },
  fail_log: { label: "Fail Log", width: "w-[320px]" },
  priority: { label: "優先級", width: "w-[118px]", sortable: "priority" },
  status: { label: "狀態", width: "w-[100px]", sortable: "status" },
  assigned_to: { label: "負責人", width: "w-[140px]", sortable: "assigned_to" },
  station: { label: "站點", width: "w-[120px]" },
  category: { label: "問題分類", width: "w-[120px]" },
  attachments: { label: "附件", width: "w-[80px]" },
  created_at: { label: "建立時間", width: "w-[120px]", sortable: "created_at" },
  actions: { label: "操作", width: "w-[100px]" },
};

const PRIORITY_STYLES: Record<IssuePriority, { trigger: string; rank: string; itemDot: string }> = {
  critical: {
    trigger: "border-red-500/45 bg-red-500/20 text-red-700 hover:bg-red-500/25 dark:border-red-400/55 dark:bg-red-500/25 dark:text-red-100 dark:hover:bg-red-500/30",
    rank: "P1",
    itemDot: "bg-red-500",
  },
  high: {
    trigger: "border-orange-500/35 bg-orange-500/15 text-orange-700 hover:bg-orange-500/20 dark:border-orange-400/45 dark:bg-orange-500/20 dark:text-orange-100 dark:hover:bg-orange-500/25",
    rank: "P2",
    itemDot: "bg-orange-500",
  },
  medium: {
    trigger: "border-yellow-500/35 bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/20 dark:border-yellow-400/40 dark:bg-yellow-500/15 dark:text-yellow-100 dark:hover:bg-yellow-500/20",
    rank: "P3",
    itemDot: "bg-yellow-500",
  },
  low: {
    trigger: "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/20",
    rank: "P4",
    itemDot: "bg-emerald-500",
  },
};

export function IssueTableView({ issues, onUpdate }: IssueTableViewProps) {
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [viewingIssue, setViewingIssue] = useState<Issue | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Issue; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [engineers, setEngineers] = useState<Array<{ id: string; name: string }>>([]);
  const [inlineEditingAssignee, setInlineEditingAssignee] = useState<string | null>(null);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<Issue['attachments']>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const dragSrcRef = useRef<ColumnKey | null>(null);
  const { toast } = useToast();
  const { sendMentionNotifications } = useMentionNotifications();

  // 載入欄位順序
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('ui_table_preferences')
        .select('column_order')
        .eq('table_key', TABLE_KEY)
        .maybeSingle();
      if (data?.column_order && Array.isArray(data.column_order) && data.column_order.length) {
        const saved = data.column_order as ColumnKey[];
        const valid = saved.filter(k => DEFAULT_COLUMNS.includes(k));
        const missing = DEFAULT_COLUMNS.filter(k => !valid.includes(k));
        setColumnOrder([...valid, ...missing]);
      }
    };
    load();
  }, []);

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

  const persistOrder = async (order: ColumnKey[]) => {
    try {
      await supabase
        .from('ui_table_preferences')
        .upsert(
          { table_key: TABLE_KEY, column_order: order as any, updated_at: new Date().toISOString() },
          { onConflict: 'table_key' }
        );
    } catch (e) {
      console.error('persist column order failed', e);
    }
  };

  const handleDragStart = (key: ColumnKey) => {
    dragSrcRef.current = key;
  };

  const handleDrop = (targetKey: ColumnKey) => {
    const src = dragSrcRef.current;
    dragSrcRef.current = null;
    if (!src || src === targetKey) return;
    const next = [...columnOrder];
    const srcIdx = next.indexOf(src);
    const tgtIdx = next.indexOf(targetKey);
    if (srcIdx < 0 || tgtIdx < 0) return;
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, src);
    setColumnOrder(next);
    persistOrder(next);
  };

  const handleSort = (key: keyof Issue) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  // 計算有效優先級（除非手動鎖定）
  const issuesWithEffective = useMemo(
    () =>
      issues.map(i => ({
        ...i,
        effectivePriority: getEffectivePriority(i.priority, i.priority_manual, i.created_at),
      })),
    [issues]
  );

  const sortedIssues = useMemo(() => {
    const arr = [...issuesWithEffective];
    if (!sortConfig) return arr;
    return arr.sort((a, b) => {
      const aValue =
        sortConfig.key === 'priority' ? a.effectivePriority : (a as any)[sortConfig.key];
      const bValue =
        sortConfig.key === 'priority' ? b.effectivePriority : (b as any)[sortConfig.key];
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [issuesWithEffective, sortConfig]);

  const paginatedIssues = sortedIssues.slice((currentPage - 1) * pageSize, currentPage * pageSize);
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
      const { error } = await supabase.from('issues').update({ assigned_to: newAssignee }).eq('id', issueId);
      if (error) throw error;
      if (newAssignee !== 'unassigned') {
        const issue = issues.find(i => i.id === issueId);
        if (issue) {
          await sendMentionNotifications(`@[${newAssignee}](${newAssignee})`, {
            title: "問題指派通知",
            message: `您被指派處理問題：${issue.title || issue.description?.slice(0, 30)}`,
            referenceType: "issue",
            referenceId: issueId,
          });
        }
      }
      toast({ title: "指派成功", description: "負責人已更新" });
      onUpdate();
    } catch {
      toast({ title: "指派失敗", description: "無法更新負責人", variant: "destructive" });
    } finally {
      setInlineEditingAssignee(null);
    }
  };

  const handleInlinePriorityChange = async (issueId: string, value: IssuePriority) => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({ priority: value, priority_manual: true })
        .eq('id', issueId);
      if (error) throw error;
      toast({ title: "優先級已更新", description: "已標記為手動設定" });
      onUpdate();
    } catch {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  };

  const getPriorityColor = (priority: string) => {
    return (
      PRIORITY_STYLES[priority as IssuePriority]?.trigger ??
      "border-border bg-muted text-muted-foreground hover:bg-muted/80"
    );
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

  const renderCell = (key: ColumnKey, issue: Issue & { effectivePriority: IssuePriority }) => {
    switch (key) {
      case "system":
        return (
          <div className="text-sm text-foreground">
            {issue.system_name
              ? issue.serial_number
                ? `${issue.system_name} (${issue.serial_number})`
                : issue.system_name
              : '-'}
          </div>
        );
      case "fail_log":
        return (
          <div className="line-clamp-3 text-sm whitespace-pre-wrap" title={issue.description}>
            {issue.description}
          </div>
        );
      case "priority":
        return (
          <Select
            value={issue.effectivePriority}
            onValueChange={(v) => handleInlinePriorityChange(issue.id, v as IssuePriority)}
          >
            <SelectTrigger
              className={cn(
                "h-7 w-[104px] justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold shadow-none transition-colors [&>svg]:ml-0.5 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-65",
                getPriorityColor(issue.effectivePriority)
              )}
            >
              <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] leading-none text-current">
                {PRIORITY_STYLES[issue.effectivePriority].rank}
              </span>
              <span className="leading-none">{getPriorityText(issue.effectivePriority)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", PRIORITY_STYLES.low.itemDot)} />
                  <span>{getPriorityText("low")}</span>
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", PRIORITY_STYLES.medium.itemDot)} />
                  <span>{getPriorityText("medium")}</span>
                </span>
              </SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", PRIORITY_STYLES.high.itemDot)} />
                  <span>{getPriorityText("high")}</span>
                </span>
              </SelectItem>
              <SelectItem value="critical">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", PRIORITY_STYLES.critical.itemDot)} />
                  <span>{getPriorityText("critical")}</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        );
      case "status":
        return (
          <Badge variant="outline" className={getStatusColor(issue.status)}>
            {getStatusText(issue.status)}
          </Badge>
        );
      case "assigned_to":
        return inlineEditingAssignee === issue.id ? (
          <Select defaultValue={issue.assigned_to} onValueChange={(v) => handleAssigneeChange(issue.id, v)}>
            <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">未指派</SelectItem>
              {engineers.map(e => (
                <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-sm" onClick={() => setInlineEditingAssignee(issue.id)}>
            <UserPlus className="h-3 w-3 mr-1" />
            {issue.assigned_to || '未指派'}
          </Button>
        );
      case "station":
        return <div className="text-sm">{issue.station_name || '-'}</div>;
      case "category":
        return <div className="text-sm">{issue.category || '-'}</div>;
      case "attachments":
        return issue.attachments && issue.attachments.length > 0 ? (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => {
            setAttachmentPreview(issue.attachments || []);
            setAttachmentDialogOpen(true);
          }}>
            <ImageIcon className="h-4 w-4 mr-1" />
            <span className="text-xs">{issue.attachments.length}</span>
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        );
      case "created_at":
        return (
          <div className="text-xs text-muted-foreground">
            {new Date(issue.created_at).toLocaleDateString('zh-TW')}
          </div>
        );
      case "actions":
        return (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleView(issue)} className="h-8 w-8 p-0" title="查看">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleEdit(issue)} className="h-8 w-8 p-0" title="編輯">
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>問題列表（可拖曳欄位調整順序）</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
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
                {columnOrder.map((key) => {
                  const meta = COLUMN_META[key];
                  return (
                    <TableHead
                      key={key}
                      className={`${meta.width} cursor-move select-none`}
                      draggable
                      onDragStart={() => handleDragStart(key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(key)}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                        {meta.sortable ? (
                          <Button variant="ghost" className="h-7 px-1" onClick={() => handleSort(meta.sortable!)}>
                            {meta.label} <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        ) : (
                          <span className="text-sm font-medium">{meta.label}</span>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedIssues.map((issue) => (
                <TableRow key={issue.id}>
                  {columnOrder.map((key) => (
                    <TableCell key={key}>{renderCell(key, issue)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-muted-foreground">
            顯示 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, issues.length)} 筆，共 {issues.length} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>上一頁</Button>
            <span className="text-sm">第 {currentPage} 頁，共 {totalPages || 1} 頁</span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages || totalPages === 0}>下一頁</Button>
          </div>
        </div>

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
              <DialogHeader><DialogTitle>編輯問題</DialogTitle></DialogHeader>
              <IssueEditDialog
                issue={editingIssue}
                onUpdate={handleEditComplete}
                onDelete={handleEditComplete}
                onClose={() => setIsEditDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}

        {viewingIssue && (
          <IssueDetailDialog
            issue={viewingIssue}
            isOpen={isDetailDialogOpen}
            onClose={handleViewClose}
            onEdit={handleViewEdit}
          />
        )}

        <Dialog open={attachmentDialogOpen} onOpenChange={setAttachmentDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>附件預覽</DialogTitle></DialogHeader>
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
