import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUpDown, Save, Edit, Eye, Download, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Issue>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Issue;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { toast } = useToast();

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
    setEditingId(issue.id);
    setEditData({
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      assigned_to: issue.assigned_to
    });
  };

  const handleSave = async (issueId: string) => {
    try {
      await supabase
        .from('issues')
        .update(editData)
        .eq('id', issueId);

      toast({
        title: "更新成功",
        description: "問題已更新"
      });

      setEditingId(null);
      setEditData({});
      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新問題",
        variant: "destructive"
      });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
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
                    {editingId === issue.id ? (
                      <Input
                        value={editData.title || ''}
                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        className="w-full"
                      />
                    ) : (
                      <div className="font-medium line-clamp-2" title={issue.title}>
                        {issue.title}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === issue.id ? (
                      <Textarea
                        value={editData.description || ''}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        className="w-full min-h-[60px]"
                        rows={2}
                      />
                    ) : (
                      <div className="line-clamp-3 text-sm" title={issue.description}>
                        {issue.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === issue.id ? (
                      <Select
                        value={editData.priority || issue.priority}
                        onValueChange={(value) => setEditData({ ...editData, priority: value as any })}
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
                    ) : (
                      <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                        {getPriorityText(issue.priority)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === issue.id ? (
                      <Select
                        value={editData.status || issue.status}
                        onValueChange={(value) => setEditData({ ...editData, status: value as any })}
                      >
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
                    ) : (
                      <Badge variant="outline" className={getStatusColor(issue.status)}>
                        {getStatusText(issue.status)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === issue.id ? (
                      <Input
                        value={editData.assigned_to || ''}
                        onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
                        className="w-full"
                        placeholder="負責人"
                      />
                    ) : (
                      <div className="text-sm">{issue.assigned_to || '未指派'}</div>
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
                    {issue.attachments && issue.attachments.length > 0 && (
                      <div className="flex items-center gap-1">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {issue.attachments.length}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {new Date(issue.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {editingId === issue.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSave(issue.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(issue)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
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
      </CardContent>
    </Card>
  );
}