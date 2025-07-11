
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Edit, AlertTriangle, Bug, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { IssuePDFExportManager } from "./IssuePDFExportManager";
import { BackButton } from "../common/BackButton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to?: string;
  system_id?: string;
  station_id?: string;
  created_at: string;
  updated_at: string;
}

export function IssueTracker() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all-priorities");
  const [filterStatus, setFilterStatus] = useState("all-status");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newIssue, setNewIssue] = useState({
    title: "",
    description: "",
    priority: "medium" as const,
    status: "open" as const,
    assigned_to: "",
    system_id: "",
    station_id: ""
  });
  
  const { toast } = useToast();
  
  // Calculate issue statistics
  const issueStats = {
    total: issues.length,
    open: issues.filter(i => i.status === 'open').length,
    inProgress: issues.filter(i => i.status === 'in_progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    critical: issues.filter(i => i.priority === 'critical').length,
    bySystem: issues.reduce((acc, issue) => {
      const system = issue.system_id || 'Unknown';
      acc[system] = (acc[system] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byStation: issues.reduce((acc, issue) => {
      const station = issue.station_id || 'Unknown';
      acc[station] = (acc[station] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  useEffect(() => {
    loadIssues();
    
    // Listen for navigation events from production monitor
    const handleNavigation = (event: CustomEvent) => {
      if (event.detail.module === 'issues' && event.detail.params) {
        const { station, system } = event.detail.params;
        if (station) {
          setSearchTerm(station);
        }
        if (system) {
          setSearchTerm(system);
        }
      }
    };

    window.addEventListener('navigate', handleNavigation as EventListener);
    return () => {
      window.removeEventListener('navigate', handleNavigation as EventListener);
    };
  }, []);

  const loadIssues = async () => {
    try {
      setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const handleCreateIssue = async () => {
    try {
      if (!newIssue.title.trim() || !newIssue.description.trim()) {
        toast({
          title: "輸入錯誤",
          description: "請填寫問題標題和描述",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('issues')
        .insert([{
          title: newIssue.title.trim(),
          description: newIssue.description.trim(),
          priority: newIssue.priority,
          status: newIssue.status,
          assigned_to: newIssue.assigned_to.trim() || null,
          system_id: newIssue.system_id.trim() || null,
          station_id: newIssue.station_id.trim() || null
        }]);

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "問題已成功新增"
      });

      setIsCreateDialogOpen(false);
      setNewIssue({
        title: "",
        description: "",
        priority: "medium",
        status: "open",
        assigned_to: "",
        system_id: "",
        station_id: ""
      });
      loadIssues();
    } catch (error) {
      console.error('Error creating issue:', error);
      toast({
        title: "新增失敗",
        description: "無法新增問題",
        variant: "destructive"
      });
    }
  };

  const handleUpdateIssue = async () => {
    try {
      if (!editingIssue || !editingIssue.title.trim() || !editingIssue.description.trim()) {
        toast({
          title: "輸入錯誤",
          description: "請填寫問題標題和描述",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('issues')
        .update({
          title: editingIssue.title.trim(),
          description: editingIssue.description.trim(),
          priority: editingIssue.priority,
          status: editingIssue.status,
          assigned_to: editingIssue.assigned_to?.trim() || null,
          system_id: editingIssue.system_id?.trim() || null,
          station_id: editingIssue.station_id?.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingIssue.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "問題已成功更新"
      });

      setEditingIssue(null);
      loadIssues();
    } catch (error) {
      console.error('Error updating issue:', error);
      toast({
        title: "更新失敗",
        description: "無法更新問題",
        variant: "destructive"
      });
    }
  };

  const handleDeleteIssue = async (issueId: string) => {
    try {
      const { error } = await supabase
        .from('issues')
        .delete()
        .eq('id', issueId);

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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-green-500 text-white';
      case 'in_progress': return 'bg-blue-500 text-white';
      case 'open': return 'bg-red-500 text-white';
      case 'closed': return 'bg-gray-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         issue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         issue.assigned_to?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = !filterPriority || filterPriority === "all-priorities" || issue.priority === filterPriority;
    const matchesStatus = !filterStatus || filterStatus === "all-status" || issue.status === filterStatus;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold">問題追蹤</h1>
            <p className="text-muted-foreground">故障問題管理與追蹤系統</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                開啟: {issueStats.open}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                處理中: {issueStats.inProgress}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                已解決: {issueStats.resolved}
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-red-500" />
                緊急: {issueStats.critical}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <IssuePDFExportManager issues={filteredIssues} />
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                新增問題
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增問題</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>問題標題</Label>
                  <Input 
                    placeholder="請輸入問題標題..." 
                    value={newIssue.title}
                    onChange={(e) => setNewIssue({...newIssue, title: e.target.value})}
                  />
                </div>
                <div>
                  <Label>問題描述</Label>
                  <Textarea 
                    placeholder="請詳細描述問題..." 
                    value={newIssue.description}
                    onChange={(e) => setNewIssue({...newIssue, description: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>優先級</Label>
                    <Select value={newIssue.priority} onValueChange={(value) => setNewIssue({...newIssue, priority: value as any})}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇優先級" />
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
                    <Label>指派給</Label>
                    <Input 
                      placeholder="負責人姓名" 
                      value={newIssue.assigned_to}
                      onChange={(e) => setNewIssue({...newIssue, assigned_to: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>系統編號</Label>
                    <Input 
                      placeholder="系統編號" 
                      value={newIssue.system_id}
                      onChange={(e) => setNewIssue({...newIssue, system_id: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>站點編號</Label>
                    <Input 
                      placeholder="站點編號" 
                      value={newIssue.station_id}
                      onChange={(e) => setNewIssue({...newIssue, station_id: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleCreateIssue}>
                    建立問題
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Issue Dialog */}
          <Dialog open={!!editingIssue} onOpenChange={() => setEditingIssue(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>編輯問題</DialogTitle>
              </DialogHeader>
              {editingIssue && (
                <div className="space-y-4">
                  <div>
                    <Label>問題標題</Label>
                    <Input 
                      value={editingIssue.title}
                      onChange={(e) => setEditingIssue({...editingIssue, title: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>問題描述</Label>
                    <Textarea 
                      value={editingIssue.description}
                      onChange={(e) => setEditingIssue({...editingIssue, description: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>優先級</Label>
                      <Select 
                        value={editingIssue.priority} 
                        onValueChange={(value) => setEditingIssue({...editingIssue, priority: value as any})}
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
                      <Label>狀態</Label>
                      <Select 
                        value={editingIssue.status} 
                        onValueChange={(value) => setEditingIssue({...editingIssue, status: value as any})}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>指派給</Label>
                      <Input 
                        value={editingIssue.assigned_to || ''}
                        onChange={(e) => setEditingIssue({...editingIssue, assigned_to: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>系統編號</Label>
                      <Input 
                        value={editingIssue.system_id || ''}
                        onChange={(e) => setEditingIssue({...editingIssue, system_id: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>站點編號</Label>
                    <Input 
                      value={editingIssue.station_id || ''}
                      onChange={(e) => setEditingIssue({...editingIssue, station_id: e.target.value})}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditingIssue(null)}>
                      取消
                    </Button>
                    <Button onClick={handleUpdateIssue}>
                      儲存
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋問題標題、描述或負責人..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="選擇優先級" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-priorities">全部優先級</SelectItem>
                <SelectItem value="critical">緊急</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="選擇狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-status">全部狀態</SelectItem>
                <SelectItem value="open">開啟</SelectItem>
                <SelectItem value="in_progress">處理中</SelectItem>
                <SelectItem value="resolved">已解決</SelectItem>
                <SelectItem value="closed">已關閉</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">系統問題統計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(issueStats.bySystem).slice(0, 5).map(([system, count]) => (
                <div key={system} className="flex justify-between text-sm">
                  <span className="truncate">{system}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">站點問題統計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(issueStats.byStation).slice(0, 5).map(([station, count]) => (
                <div key={station} className="flex justify-between text-sm">
                  <span className="truncate">{station}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">問題處理效率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>解決率</span>
                <span className="font-medium">
                  {issues.length > 0 ? Math.round((issueStats.resolved / issues.length) * 100) : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>處理中</span>
                <span className="font-medium">{issueStats.inProgress}</span>
              </div>
              <div className="flex justify-between">
                <span>待處理</span>
                <span className="font-medium text-red-500">{issueStats.open}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues List */}
      <div className="space-y-4">
        {filteredIssues.map((issue) => (
          <Card key={issue.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Bug className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">{issue.title}</h3>
                    <Badge className={getPriorityColor(issue.priority)}>
                      {issue.priority === 'critical' && '緊急'}
                      {issue.priority === 'high' && '高'}
                      {issue.priority === 'medium' && '中'}
                      {issue.priority === 'low' && '低'}
                    </Badge>
                    <Badge className={getStatusColor(issue.status)}>
                      {issue.status === 'open' && '開啟'}
                      {issue.status === 'in_progress' && '處理中'}
                      {issue.status === 'resolved' && '已解決'}
                      {issue.status === 'closed' && '已關閉'}
                    </Badge>
                  </div>
                  
                  <p className="text-muted-foreground mb-3">{issue.description}</p>
                  
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    {issue.assigned_to && (
                      <span>負責人: <span className="font-medium">{issue.assigned_to}</span></span>
                    )}
                    {issue.system_id && (
                      <span>系統: <span className="font-medium">{issue.system_id}</span></span>
                    )}
                    {issue.station_id && (
                      <span>站點: <span className="font-medium">{issue.station_id}</span></span>
                    )}
                    <span>建立時間: {new Date(issue.created_at).toLocaleDateString('zh-TW')}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEditingIssue(issue)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    編輯
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-1" />
                        刪除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>確認刪除</AlertDialogTitle>
                        <AlertDialogDescription>
                          您確定要刪除這個問題嗎？此操作無法復原。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDeleteIssue(issue.id)}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          確認刪除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredIssues.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">沒有找到相關問題</h3>
            <p className="text-muted-foreground">請調整搜尋條件或新增新的問題</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
