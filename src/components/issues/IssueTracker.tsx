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
import { Search, Plus, Edit, AlertTriangle, Bug, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      // Mock data for demonstration
      const mockIssues: Issue[] = [
        {
          id: "1",
          title: "Station 2 測試項目異常",
          description: "功能驗證過程中發現通訊問題",
          priority: "high",
          status: "open",
          assigned_to: "Wilson",
          system_id: "System23",
          station_id: "station_2",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: "2", 
          title: "系統軟體版本不匹配",
          description: "需要更新到最新版本以支援新測試項目",
          priority: "medium",
          status: "in_progress",
          assigned_to: "Alice",
          system_id: "System15",
          station_id: "station_1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: "3",
          title: "硬體連接不穩定",
          description: "偶發性連接中斷影響測試進度",
          priority: "critical",
          status: "open",
          assigned_to: "Bob",
          system_id: "System08",
          station_id: "station_0",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      
      setIssues(mockIssues);
      setIsLoading(false);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入問題列表",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-danger text-danger-foreground';
      case 'high': return 'bg-warning text-warning-foreground';
      case 'medium': return 'bg-info text-info-foreground';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved': return 'bg-success text-success-foreground';
      case 'in_progress': return 'bg-warning text-warning-foreground';
      case 'open': return 'bg-danger text-danger-foreground';
      case 'closed': return 'bg-muted text-muted-foreground';
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

  const exportData = () => {
    toast({
      title: "匯出功能",
      description: "匯出功能開發中...",
    });
  };

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
        <div>
          <h1 className="text-3xl font-bold">問題追蹤</h1>
          <p className="text-muted-foreground">故障問題管理與追蹤系統</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportData}>
            <Download className="h-4 w-4 mr-2" />
            匯出報表
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                  <Input placeholder="請輸入問題標題..." />
                </div>
                <div>
                  <Label>問題描述</Label>
                  <Textarea placeholder="請詳細描述問題..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>優先級</Label>
                    <Select>
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇負責人" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Wilson">Wilson</SelectItem>
                        <SelectItem value="Alice">Alice</SelectItem>
                        <SelectItem value="Bob">Bob</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={() => setIsDialogOpen(false)}>
                    建立問題
                  </Button>
                </div>
              </div>
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
                    <span>建立時間: {new Date(issue.created_at).toLocaleDateString('zh-TW')}</span>
                  </div>
                </div>
                
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-1" />
                  編輯
                </Button>
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