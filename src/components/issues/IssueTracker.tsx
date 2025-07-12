
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Filter, Edit, Trash2, AlertTriangle, Clock, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedData } from "@/hooks/useUnifiedData";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to?: string;
  system_id?: string;
  station_id?: string;
  test_item_id?: string;
  created_at: string;
  updated_at: string;
}

export function IssueTracker() {
  const { systems, stations, testItems } = useUnifiedData();
  const { toast } = useToast();
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<Issue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [issueForm, setIssueForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    assigned_to: "",
    system_id: "none",
    station_id: "none",
    test_item_id: "none"
  });

  const statusOptions = [
    { value: "open", label: "開放", color: "bg-blue-500" },
    { value: "in_progress", label: "進行中", color: "bg-yellow-500" },
    { value: "resolved", label: "已解決", color: "bg-green-500" },
    { value: "closed", label: "已關閉", color: "bg-gray-500" }
  ];

  const priorityOptions = [
    { value: "low", label: "低", color: "text-green-600" },
    { value: "medium", label: "中", color: "text-yellow-600" },
    { value: "high", label: "高", color: "text-red-600" },
    { value: "critical", label: "緊急", color: "text-red-800" }
  ];

  const loadIssues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (error) {
      console.error('Error loading issues:', error);
      toast({
        title: "載入失敗",
        description: "無法載入問題列表",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    let filtered = issues;

    if (searchTerm) {
      filtered = filtered.filter(issue => 
        issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(issue => issue.status === statusFilter);
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter(issue => issue.priority === priorityFilter);
    }

    setFilteredIssues(filtered);
  }, [issues, searchTerm, statusFilter, priorityFilter]);

  const resetForm = () => {
    setIssueForm({
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      assigned_to: "",
      system_id: "none",
      station_id: "none",
      test_item_id: "none"
    });
    setEditingIssue(null);
  };

  const handleAddIssue = () => {
    resetForm();
    setShowIssueDialog(true);
  };

  const handleEditIssue = (issue: Issue) => {
    setEditingIssue(issue);
    setIssueForm({
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      assigned_to: issue.assigned_to || "",
      system_id: issue.system_id || "none",
      station_id: issue.station_id || "none",
      test_item_id: issue.test_item_id || "none"
    });
    setShowIssueDialog(true);
  };

  const handleDeleteIssue = (issue: Issue) => {
    setIssueToDelete(issue);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteIssue = async () => {
    if (!issueToDelete) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueToDelete.id);

      if (error) throw error;

      toast({
        title: "成功",
        description: "問題已刪除",
      });

      await loadIssues();
      setDeleteDialogOpen(false);
      setIssueToDelete(null);
    } catch (error) {
      console.error('Error deleting issue:', error);
      toast({
        title: "錯誤",
        description: "刪除問題失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitIssue = async () => {
    if (!issueForm.title.trim() || !issueForm.description.trim()) {
      toast({
        title: "錯誤",
        description: "請填寫標題和描述",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const issueData = {
        title: issueForm.title.trim(),
        description: issueForm.description.trim(),
        priority: issueForm.priority,
        status: issueForm.status,
        assigned_to: issueForm.assigned_to || null,
        system_id: issueForm.system_id === "none" ? null : issueForm.system_id,
        station_id: issueForm.station_id === "none" ? null : issueForm.station_id,
        test_item_id: issueForm.test_item_id === "none" ? null : issueForm.test_item_id
      };

      if (editingIssue) {
        const { error } = await supabase
          .from('issues')
          .update({
            ...issueData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingIssue.id);

        if (error) throw error;

        toast({
          title: "成功",
          description: "問題已更新",
        });
      } else {
        const { error } = await supabase
          .from('issues')
          .insert(issueData);

        if (error) throw error;

        toast({
          title: "成功",
          description: "問題已創建",
        });
      }

      await loadIssues();
      setShowIssueDialog(false);
      resetForm();
    } catch (error) {
      console.error('Error saving issue:', error);
      toast({
        title: "錯誤",
        description: editingIssue ? "更新問題失敗" : "創建問題失敗",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusOption = statusOptions.find(opt => opt.value === status);
    const Icon = status === 'open' ? AlertTriangle : 
                status === 'in_progress' ? Clock :
                status === 'resolved' ? CheckCircle : XCircle;
    
    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {statusOption?.label || status}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityOption = priorityOptions.find(opt => opt.value === priority);
    return (
      <Badge variant="outline" className={priorityOption?.color}>
        {priorityOption?.label || priority}
      </Badge>
    );
  };

  const getSystemName = (systemId?: string) => {
    if (!systemId || systemId === "none") return "未指定";
    const system = systems.find(s => s.id === systemId);
    return system?.system_name || "未知系統";
  };

  const getStationName = (stationId?: string) => {
    if (!stationId || stationId === "none") return "未指定";
    const station = stations.find(s => s.id === stationId);
    return station?.station_name || "未知站點";
  };

  const issueStats = {
    total: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    inProgress: issues.filter(i => i.status === 'in_progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    critical: issues.filter(i => i.priority === 'critical').length
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">問題追蹤</h1>
              <p className="text-muted-foreground">管理和追蹤項目問題</p>
            </div>
            <Button onClick={handleAddIssue} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新增問題
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{issueStats.total}</div>
              <div className="text-sm text-muted-foreground">總問題數</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{issueStats.open}</div>
              <div className="text-sm text-muted-foreground">開放中</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{issueStats.inProgress}</div>
              <div className="text-sm text-muted-foreground">進行中</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{issueStats.resolved}</div>
              <div className="text-sm text-muted-foreground">已解決</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-800">{issueStats.critical}</div>
              <div className="text-sm text-muted-foreground">緊急問題</div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋問題標題或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="狀態篩選" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {statusOptions.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="優先級篩選" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部優先級</SelectItem>
                  {priorityOptions.map(priority => (
                    <SelectItem key={priority.value} value={priority.value}>
                      {priority.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Issues List */}
        <div className="space-y-4">
          {filteredIssues.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {issues.length === 0 ? "尚無問題記錄" : "沒有符合篩選條件的問題"}
              </CardContent>
            </Card>
          ) : (
            filteredIssues.map((issue) => (
              <Card key={issue.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{issue.title}</h3>
                        {getStatusBadge(issue.status)}
                        {getPriorityBadge(issue.priority)}
                      </div>
                      <p className="text-muted-foreground mb-3 line-clamp-2">{issue.description}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>系統: {getSystemName(issue.system_id)}</span>
                        <span>站點: {getStationName(issue.station_id)}</span>
                        {issue.assigned_to && <span>負責人: {issue.assigned_to}</span>}
                        <span>創建時間: {new Date(issue.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditIssue(issue)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteIssue(issue)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Issue Dialog */}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIssue ? "編輯問題" : "新增問題"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">標題 *</label>
              <Input
                value={issueForm.title}
                onChange={(e) => setIssueForm({...issueForm, title: e.target.value})}
                placeholder="輸入問題標題"
              />
            </div>
            <div>
              <label className="text-sm font-medium">描述 *</label>
              <Textarea
                value={issueForm.description}
                onChange={(e) => setIssueForm({...issueForm, description: e.target.value})}
                placeholder="詳細描述問題"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">優先級</label>
                <Select value={issueForm.priority} onValueChange={(value) => setIssueForm({...issueForm, priority: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map(priority => (
                      <SelectItem key={priority.value} value={priority.value}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">狀態</label>
                <Select value={issueForm.status} onValueChange={(value) => setIssueForm({...issueForm, status: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(status => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">負責人</label>
              <Input
                value={issueForm.assigned_to}
                onChange={(e) => setIssueForm({...issueForm, assigned_to: e.target.value})}
                placeholder="輸入負責人"
              />
            </div>
            <div>
              <label className="text-sm font-medium">關聯系統</label>
              <Select value={issueForm.system_id} onValueChange={(value) => setIssueForm({...issueForm, system_id: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇系統" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無</SelectItem>
                  {systems.map(system => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.system_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">關聯站點</label>
              <Select value={issueForm.station_id} onValueChange={(value) => setIssueForm({...issueForm, station_id: value})}>
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
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setShowIssueDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitIssue} disabled={isSubmitting}>
              {isSubmitting ? "處理中..." : (editingIssue ? "更新" : "創建")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除問題</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除問題「{issueToDelete?.title}」嗎？
              此操作無法撤銷。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteIssue}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? "刪除中..." : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
