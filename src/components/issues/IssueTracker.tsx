
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { IssueCreateDialog } from "./IssueCreateDialog";
import { IssuePDFExportManager } from "./IssuePDFExportManager";
import { Plus, Search, Calendar, User, Camera } from "lucide-react";
import { format } from "date-fns";

// 定義本地的 Issue 類型，避免與其他地方的衝突
interface LocalIssue {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  assigned_to?: string;
  system_name?: string;
  station_name?: string;
  test_item_name?: string;
  created_at: string;
  updated_at: string;
}

interface IssueAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
}

export function IssueTracker() {
  const [issues, setIssues] = useState<LocalIssue[]>([]);
  const [attachments, setAttachments] = useState<Record<string, IssueAttachment[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const loadIssues = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('issue_details')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 轉換資料以確保類型正確
      const convertedIssues: LocalIssue[] = (data || []).map(item => ({
        id: item.id || '',
        title: item.title || '',
        description: item.description || '',
        priority: (item.priority as "low" | "medium" | "high" | "critical") || "medium",
        status: (item.status as "open" | "in_progress" | "resolved" | "closed") || "open",
        assigned_to: item.assigned_to || undefined,
        system_name: item.system_name || undefined,
        station_name: item.station_name || undefined,
        test_item_name: item.test_item_name || undefined,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString()
      }));

      setIssues(convertedIssues);

      // 載入附件
      const { data: attachmentData, error: attachmentError } = await supabase
        .from('issue_attachments')
        .select('*');

      if (attachmentError) throw attachmentError;

      // 按問題ID分組附件
      const attachmentsByIssue = (attachmentData || []).reduce((acc, att) => {
        if (!acc[att.issue_id]) {
          acc[att.issue_id] = [];
        }
        acc[att.issue_id].push(att);
        return acc;
      }, {} as Record<string, IssueAttachment[]>);

      setAttachments(attachmentsByIssue);

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

  useEffect(() => {
    loadIssues();
  }, []);

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         issue.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusBadge = (status: string) => {
    const configs = {
      open: { variant: "destructive" as const, label: "開放" },
      in_progress: { variant: "default" as const, label: "進行中" },
      resolved: { variant: "secondary" as const, label: "已解決" },
      closed: { variant: "outline" as const, label: "已關閉" }
    };
    
    const config = configs[status as keyof typeof configs] || configs.open;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const configs = {
      low: { variant: "secondary" as const, label: "低", color: "text-green-600" },
      medium: { variant: "outline" as const, label: "中", color: "text-yellow-600" },
      high: { variant: "default" as const, label: "高", color: "text-orange-600" },
      critical: { variant: "destructive" as const, label: "緊急", color: "text-red-600" }
    };
    
    const config = configs[priority as keyof typeof configs] || configs.medium;
    return <Badge variant={config.variant} className={config.color}>{config.label}</Badge>;
  };

  const getImageUrl = (filePath: string) => {
    const { data } = supabase.storage
      .from('issue-attachments')
      .getPublicUrl(filePath);
    return data.publicUrl;
  };

  const groupedIssues = {
    open: filteredIssues.filter(issue => issue.status === 'open'),
    in_progress: filteredIssues.filter(issue => issue.status === 'in_progress'),
    resolved: filteredIssues.filter(issue => issue.status === 'resolved'),
    closed: filteredIssues.filter(issue => issue.status === 'closed')
  };

  if (isLoading) {
    return <div className="p-4">載入中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold">問題追蹤</h1>
        <div className="flex gap-2">
          <IssuePDFExportManager issues={filteredIssues} />
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            新增問題
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="搜尋問題..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="狀態篩選" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="open">開放</SelectItem>
                <SelectItem value="in_progress">進行中</SelectItem>
                <SelectItem value="resolved">已解決</SelectItem>
                <SelectItem value="closed">已關閉</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="優先級篩選" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部優先級</SelectItem>
                <SelectItem value="critical">緊急</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Issues Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">
            全部 ({filteredIssues.length})
          </TabsTrigger>
          <TabsTrigger value="open">
            開放 ({groupedIssues.open.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            進行中 ({groupedIssues.in_progress.length})
          </TabsTrigger>
          <TabsTrigger value="resolved">
            已解決 ({groupedIssues.resolved.length})
          </TabsTrigger>
          <TabsTrigger value="closed">
            已關閉 ({groupedIssues.closed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredIssues.map(issue => (
            <IssueCard key={issue.id} issue={issue} attachments={attachments[issue.id] || []} getImageUrl={getImageUrl} />
          ))}
        </TabsContent>

        {Object.entries(groupedIssues).map(([status, statusIssues]) => (
          <TabsContent key={status} value={status} className="space-y-4">
            {statusIssues.map(issue => (
              <IssueCard key={issue.id} issue={issue} attachments={attachments[issue.id] || []} getImageUrl={getImageUrl} />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Create Dialog */}
      <IssueCreateDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onIssueCreated={loadIssues}
      />
    </div>
  );
}

// Issue Card Component
function IssueCard({ 
  issue, 
  attachments, 
  getImageUrl 
}: { 
  issue: LocalIssue; 
  attachments: IssueAttachment[];
  getImageUrl: (path: string) => string;
}) {
  const getStatusBadge = (status: string) => {
    const configs = {
      open: { variant: "destructive" as const, label: "開放" },
      in_progress: { variant: "default" as const, label: "進行中" },
      resolved: { variant: "secondary" as const, label: "已解決" },
      closed: { variant: "outline" as const, label: "已關閉" }
    };
    
    const config = configs[status as keyof typeof configs] || configs.open;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const configs = {
      low: { variant: "secondary" as const, label: "低", color: "text-green-600" },
      medium: { variant: "outline" as const, label: "中", color: "text-yellow-600" },
      high: { variant: "default" as const, label: "高", color: "text-orange-600" },
      critical: { variant: "destructive" as const, label: "緊急", color: "text-red-600" }
    };
    
    const config = configs[priority as keyof typeof configs] || configs.medium;
    return <Badge variant={config.variant} className={config.color}>{config.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{issue.title}</CardTitle>
            <div className="flex flex-wrap gap-2 mb-2">
              {getStatusBadge(issue.status)}
              {getPriorityBadge(issue.priority)}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{issue.description}</p>
        
        {/* 系統/站點/測項資訊 */}
        {(issue.system_name || issue.station_name || issue.test_item_name) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {issue.system_name && (
              <Badge variant="outline">系統: {issue.system_name}</Badge>
            )}
            {issue.station_name && (
              <Badge variant="outline">站點: {issue.station_name}</Badge>
            )}
            {issue.test_item_name && (
              <Badge variant="outline">測項: {issue.test_item_name}</Badge>
            )}
          </div>
        )}

        {/* 附件圖片 */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Camera className="h-4 w-4" />
              附件圖片 ({attachments.length})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={getImageUrl(attachment.file_path)}
                    alt={attachment.file_name}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => window.open(getImageUrl(attachment.file_path), '_blank')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(issue.created_at), 'yyyy/MM/dd HH:mm')}
            </div>
            {issue.assigned_to && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {issue.assigned_to}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
