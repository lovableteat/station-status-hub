
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Filter, ArrowLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  assigned_to: string | null;
  system_id: string | null;
  station_id: string | null;
  created_at: string;
  updated_at: string;
}

export function IssueTracker() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    status: "open",
    assigned_to: "",
    system_id: "",
    station_id: ""
  });
  const [filter, setFilter] = useState({ status: "all", priority: "all" });
  const { toast } = useToast();

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const typedIssues: Issue[] = (data || []).map(issue => ({
        ...issue,
        priority: ['low', 'medium', 'high', 'critical'].includes(issue.priority) 
          ? issue.priority as "low" | "medium" | "high" | "critical"
          : "medium" as "low" | "medium" | "high" | "critical"
      }));
      
      setIssues(typedIssues);
    } catch (error) {
      console.error('Error loading issues:', error);
      toast({
        title: "載入失敗",
        description: "無法載入問題列表",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingIssue) {
        const { error } = await supabase
          .from('issues')
          .update({
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            status: formData.status,
            assigned_to: formData.assigned_to || null,
            system_id: formData.system_id || null,
            station_id: formData.station_id || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingIssue.id);
          
        if (error) throw error;
        
        toast({
          title: "更新成功",
          description: "問題已成功更新"
        });
      } else {
        const { error } = await supabase
          .from('issues')
          .insert({
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            status: formData.status,
            assigned_to: formData.assigned_to || null,
            system_id: formData.system_id || null,
            station_id: formData.station_id || null
          });
          
        if (error) throw error;
        
        toast({
          title: "新增成功",
          description: "問題已成功新增"
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
      loadIssues();
    } catch (error) {
      console.error('Error saving issue:', error);
      toast({
        title: "操作失敗",
        description: "無法儲存問題",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個問題嗎？')) return;
    
    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      toast({
        title: "刪除成功",
        description: "問題已成功刪除"
      });
      
      loadIssues();
    } catch (error) {
      console.error('Error deleting issue:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除問題",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (issue: Issue) => {
    setEditingIssue(issue);
    setFormData({
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      assigned_to: issue.assigned_to || "",
      system_id: issue.system_id || "",
      station_id: issue.station_id || ""
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingIssue(null);
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      assigned_to: "",
      system_id: "",
      station_id: ""
    });
  };

  const handleNewIssue = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500'; 
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const filteredIssues = issues.filter(issue => {
    if (filter.status !== 'all' && issue.status !== filter.status) return false;
    if (filter.priority !== 'all' && issue.priority !== filter.priority) return false;
    return true;
  });

  // 統計數據
  const stats = {
    total: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    inProgress: issues.filter(i => i.status === 'in_progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    closed: issues.filter(i => i.status === 'closed').length
  };

  const priorityStats = {
    critical: issues.filter(i => i.priority === 'critical').length,
    high: issues.filter(i => i.priority === 'high').length,
    medium: issues.filter(i => i.priority === 'medium').length,
    low: issues.filter(i => i.priority === 'low').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回上一頁
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">問題追蹤</h1>
            <p className="text-sm text-muted-foreground">故障問題管理與追蹤系統</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            匯出 PDF 報告
          </Button>
          <Button variant="outline" size="sm">
            保留篩選
          </Button>
          <Button onClick={handleNewIssue} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新增問題
          </Button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span className="text-muted-foreground">緊急: {priorityStats.critical}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <span className="text-muted-foreground">重要: {priorityStats.high}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className="text-muted-foreground">已解決: {stats.resolved}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
          <span className="text-muted-foreground">緊急: {stats.closed}</span>
        </div>
      </div>

      {/* 搜尋和篩選 */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Input
            placeholder="搜尋問題描述、描述、負責人或系統站點編..."
            className="bg-card"
          />
        </div>
        <Select value={filter.status} onValueChange={(value) => setFilter({...filter, status: value})}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部完成" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部完成</SelectItem>
            <SelectItem value="open">開放</SelectItem>
            <SelectItem value="in_progress">進行中</SelectItem>
            <SelectItem value="resolved">已解決</SelectItem>
            <SelectItem value="closed">已關閉</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={filter.priority} onValueChange={(value) => setFilter({...filter, priority: value})}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="全部狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="low">低</SelectItem>
            <SelectItem value="medium">中</SelectItem>
            <SelectItem value="high">高</SelectItem>
            <SelectItem value="critical">緊急</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 統計卡片區域 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">系統問題統計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-foreground">{stats.total}</div>
              <div className="text-sm text-muted-foreground">總問題數</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">站點問題統計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-foreground">{stats.open}</div>
              <div className="text-sm text-muted-foreground">開放問題</div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">問題重要度分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">緊急</span>
                <span className="text-sm text-red-500 font-medium">{priorityStats.critical}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">重要</span>
                <span className="text-sm text-orange-500 font-medium">{priorityStats.high}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">有重要</span>
                <span className="text-sm text-red-500 font-medium">{priorityStats.critical}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 問題列表 */}
      <div className="space-y-4">
        {filteredIssues.length > 0 ? (
          filteredIssues.map((issue) => (
            <Card key={issue.id} className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg text-foreground">{issue.title}</h3>
                      <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                        {issue.priority}
                      </Badge>
                      <Badge variant="outline" className="text-blue-500">
                        {issue.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mb-3">{issue.description}</p>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      {issue.assigned_to && <span>負責人: {issue.assigned_to}</span>}
                      {issue.system_id && <span>系統: {issue.system_id}</span>}
                      {issue.station_id && <span>站點: {issue.station_id}</span>}
                      <span>建立時間: {new Date(issue.created_at).toLocaleString('zh-TW')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(issue)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(issue.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="bg-card">
            <CardContent className="p-12">
              <div className="text-center">
                <div className="text-6xl text-muted-foreground mb-4">⚠️</div>
                <h3 className="text-lg font-medium mb-2">沒有找到相關問題</h3>
                <p className="text-muted-foreground">請調整搜尋條件或建立新的問題記錄</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 新增/編輯對話框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingIssue ? '編輯問題' : '新增問題'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>標題</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={4}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>優先級</Label>
                <Select value={formData.priority} onValueChange={(value: "low" | "medium" | "high" | "critical") => setFormData({...formData, priority: value})}>
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
                <Label>狀態</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">開放</SelectItem>
                    <SelectItem value="in_progress">進行中</SelectItem>
                    <SelectItem value="resolved">已解決</SelectItem>
                    <SelectItem value="closed">已關閉</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>負責人</Label>
              <Input
                value={formData.assigned_to}
                onChange={(e) => setFormData({...formData, assigned_to: e.target.value})}
                placeholder="選填"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>系統 ID</Label>
                <Input
                  value={formData.system_id}
                  onChange={(e) => setFormData({...formData, system_id: e.target.value})}
                  placeholder="選填"
                />
              </div>
              <div>
                <Label>站點 ID</Label>
                <Input
                  value={formData.station_id}
                  onChange={(e) => setFormData({...formData, station_id: e.target.value})}
                  placeholder="選填"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">
                {editingIssue ? '更新' : '新增'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
