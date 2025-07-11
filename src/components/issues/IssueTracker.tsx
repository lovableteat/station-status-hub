import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to?: string;
  system_id?: string;
  station_id?: string;
  created_at: string;
  updated_at: string;
}

const IssueTracker = () => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as Issue['priority'],
    status: 'open' as Issue['status'],
    assigned_to: '',
    system_id: '',
    station_id: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Type assertion to ensure correct type mapping
      setIssues((data || []).map(issue => ({
        ...issue,
        priority: issue.priority as Issue['priority'],
        status: issue.status as Issue['status']
      })));
    } catch (error) {
      console.error('載入問題失敗:', error);
      toast({
        title: "載入失敗",
        description: "無法載入問題列表",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      status: 'open',
      assigned_to: '',
      system_id: '',
      station_id: ''
    });
    setEditingIssue(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      toast({
        title: "輸入錯誤",
        description: "標題和描述為必填項目",
        variant: "destructive"
      });
      return;
    }

    try {
      if (editingIssue) {
        // 更新問題
        const { error } = await supabase
          .from('issues')
          .update({
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            status: formData.status,
            assigned_to: formData.assigned_to || null,
            system_id: formData.system_id || null,
            station_id: formData.station_id || null
          })
          .eq('id', editingIssue.id);

        if (error) throw error;
        
        toast({
          title: "更新成功",
          description: "問題已成功更新"
        });
      } else {
        // 創建新問題
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
          title: "創建成功",
          description: "新問題已成功創建"
        });
      }

      setShowCreateDialog(false);
      resetForm();
      loadIssues();
    } catch (error) {
      console.error('提交問題失敗:', error);
      toast({
        title: "操作失敗",
        description: "無法保存問題",
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
      assigned_to: issue.assigned_to || '',
      system_id: issue.system_id || '',
      station_id: issue.station_id || ''
    });
    setShowCreateDialog(true);
  };

  const handleDelete = async (issueId: string) => {
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
      console.error('刪除問題失敗:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除問題",
        variant: "destructive"
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'in_progress': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'resolved': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'closed': return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">載入中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6" />
          問題追蹤
        </h2>
        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              新增問題
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingIssue ? '編輯問題' : '新增問題'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  標題 *
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="輸入問題標題"
                  className="bg-background border-border text-foreground"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  描述 *
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="詳細描述問題"
                  rows={4}
                  className="bg-background border-border text-foreground"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    優先級
                  </label>
                  <Select value={formData.priority} onValueChange={(value: Issue['priority']) => 
                    setFormData(prev => ({ ...prev, priority: value }))
                  }>
                    <SelectTrigger className="bg-background border-border">
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
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    狀態
                  </label>
                  <Select value={formData.status} onValueChange={(value: Issue['status']) => 
                    setFormData(prev => ({ ...prev, status: value }))
                  }>
                    <SelectTrigger className="bg-background border-border">
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    指派給
                  </label>
                  <Input
                    value={formData.assigned_to}
                    onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                    placeholder="指派人員"
                    className="bg-background border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    系統ID
                  </label>
                  <Input
                    value={formData.system_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, system_id: e.target.value }))}
                    placeholder="相關系統ID"
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  站點ID
                </label>
                <Input
                  value={formData.station_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, station_id: e.target.value }))}
                  placeholder="相關站點ID"
                  className="bg-background border-border text-foreground"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateDialog(false);
                    resetForm();
                  }}
                  className="border-border text-foreground hover:bg-muted"
                >
                  取消
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  {editingIssue ? '更新' : '創建'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {issues.length === 0 ? (
          <Card className="bg-card/50 border-border">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">目前沒有問題記錄</p>
              <p className="text-sm text-muted-foreground mt-2">點擊上方按鈕新增第一個問題</p>
            </CardContent>
          </Card>
        ) : (
          issues.map((issue) => (
            <Card key={issue.id} className="bg-card/50 border-border hover:bg-card/70 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg text-foreground">{issue.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(issue)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-foreground">確認刪除</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            確定要刪除這個問題嗎？此操作無法撤銷。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-border text-foreground hover:bg-muted">
                            取消
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(issue.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            刪除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge className={`${getPriorityColor(issue.priority)} border`}>
                    {issue.priority === 'low' ? '低' : 
                     issue.priority === 'medium' ? '中' : 
                     issue.priority === 'high' ? '高' : '緊急'}
                  </Badge>
                  <Badge className={`${getStatusColor(issue.status)} border`}>
                    {issue.status === 'open' ? '開放' : 
                     issue.status === 'in_progress' ? '進行中' : 
                     issue.status === 'resolved' ? '已解決' : '已關閉'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{issue.description}</p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {issue.assigned_to && (
                    <div>指派給: <span className="text-foreground">{issue.assigned_to}</span></div>
                  )}
                  {issue.system_id && (
                    <div>系統: <span className="text-foreground">{issue.system_id}</span></div>
                  )}
                  {issue.station_id && (
                    <div>站點: <span className="text-foreground">{issue.station_id}</span></div>
                  )}
                  <div>創建時間: <span className="text-foreground">
                    {new Date(issue.created_at).toLocaleString('zh-TW')}
                  </span></div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default IssueTracker;
