
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Bug, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Search, 
  Eye,
  Download,
  Edit,
  Image as ImageIcon,
  BarChart3,
  ListChecks
} from "lucide-react";
import { IssueCreateDialog } from "./IssueCreateDialog";
import { IssuePDFExportManager } from "./IssuePDFExportManager";
import { IssueTableView } from "./IssueTableView";
import { IssueAnalyticsPanel } from "./IssueAnalyticsPanel";
import { BackButton } from "@/components/common/BackButton";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

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
  relate?: string;
  category?: string;
  process_notes?: string;
  solution?: string;
  system_name?: string;
  serial_number?: string;
  assigned_engineer?: string;
  station_name?: string;
  station_order?: number;
  test_item_name?: string;
  test_item_description?: string;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    file_type: string;
  }>;
}

export function IssueTracker() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("list");
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const { toast } = useToast();
  const { activeProjectId } = useTestProject();

  // 處理 URL 參數以自動開啟特定問題
  useEffect(() => {
    loadIssues();
  }, [activeProjectId]);

  // 單獨處理 URL 參數跳轉
  useEffect(() => {
    if (issues.length === 0) return;
    
    // 檢查 URL 參數是否要求開啟特定問題
    const urlParams = new URLSearchParams(window.location.search);
    const openIssueId = urlParams.get('openIssue');
    
    if (openIssueId) {
      const issueToOpen = issues.find(issue => issue.id === openIssueId);
      if (issueToOpen) {
        setSelectedIssue(issueToOpen);
      }
      
      // 清除 URL 參數
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [issues]);

  useEffect(() => {
    filterIssues();
  }, [issues, searchTerm, priorityFilter]);

  const loadIssues = async () => {
    try {
      setLoading(true);

      if (!activeProjectId) {
        setIssues([]);
        return;
      }

      const { data, error } = await supabase
        .from('issues')
        .select(`
          *,
          test_systems!issues_system_id_fkey (
            system_name,
            assigned_engineer,
            serial_number
          ),
          test_flow_stations!issues_station_id_fkey (
            station_name,
            station_order
          ),
          test_flow_items!issues_test_item_id_fkey (
            item_name,
            description
          )
        `)
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load attachments for each issue
      const issuesWithAttachments = await Promise.all(
        (data || []).map(async (issue) => {
          const { data: attachments } = await supabase
            .from('issue_attachments')
            .select('*')
            .eq('issue_id', issue.id);

          return {
            ...issue,
            priority: (issue.priority || 'medium') as "low" | "medium" | "high" | "critical",
            status: (issue.status || 'open') as "open" | "in_progress" | "resolved" | "closed",
            assigned_to: issue.assigned_to || '',
            system_name: issue.test_systems?.system_name,
            serial_number: issue.test_systems?.serial_number,
            assigned_engineer: issue.test_systems?.assigned_engineer,
            station_name: issue.test_flow_stations?.station_name,
            station_order: issue.test_flow_stations?.station_order,
            test_item_name: issue.test_flow_items?.item_name,
            test_item_description: issue.test_flow_items?.description,
            attachments: attachments || []
          };
        })
      );

      setIssues(issuesWithAttachments);
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

  const filterIssues = () => {
    let filtered = issues;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(issue =>
        issue.description?.toLowerCase().includes(q) ||
        issue.system_name?.toLowerCase().includes(q) ||
        issue.station_name?.toLowerCase().includes(q) ||
        issue.category?.toLowerCase().includes(q)
      );
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter(issue => issue.priority === priorityFilter);
    }

    setFilteredIssues(filtered);
  };

  const groupIssuesByStatus = (issues: Issue[]) => {
    return {
      open: issues.filter(issue => issue.status === 'open'),
      in_progress: issues.filter(issue => issue.status === 'in_progress'),
      resolved: issues.filter(issue => issue.status === 'resolved' || issue.status === 'closed')
    };
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "border-red-400/60 bg-red-500/20 text-red-100";
      case "high": return "border-orange-400/55 bg-orange-500/20 text-orange-100";
      case "medium": return "border-amber-400/50 bg-amber-500/15 text-amber-100";
      case "low": return "border-primary/45 bg-primary/15 text-primary";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "border-destructive/40 bg-destructive/15 text-red-100";
      case "in_progress": return "border-amber-400/35 bg-amber-500/15 text-amber-100";
      case "resolved": 
      case "closed": return "border-primary/35 bg-primary/15 text-primary";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertTriangle className="h-4 w-4" />;
      case "in_progress": return <Clock className="h-4 w-4" />;
      case "resolved": 
      case "closed": return <CheckCircle className="h-4 w-4" />;
      default: return <Bug className="h-4 w-4" />;
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

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case "high": return "高";
      case "medium": return "中";
      case "low": return "低";
      default: return priority;
    }
  };

  const handleImagePreview = (imagePath: string) => {
    setPreviewImage(imagePath);
    setShowImagePreview(true);
  };

  const handleImageDownload = async (attachment: NonNullable<Issue["attachments"]>[number]) => {
    try {
      const { data, error } = await supabase.storage
        .from('issue-attachments')
        .download(attachment.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "下載成功",
        description: `檔案 ${attachment.file_name} 已下載`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "下載失敗",
        description: "無法下載檔案",
        variant: "destructive"
      });
    }
  };

  const isImageFile = (fileName: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    return imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  const renderIssueCard = (issue: Issue) => (
    <Card key={issue.id} className="group hover:shadow-md transition-all hover:bg-muted/20 cursor-pointer border-l-4" 
          style={{borderLeftColor: issue.priority === 'high' ? 'hsl(var(--destructive))' : 
                                   issue.priority === 'medium' ? 'hsl(var(--warning))' : 
                                   'hsl(var(--muted-foreground))'}}
          onClick={() => setSelectedIssue(issue)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Title and basic info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate mb-1" title={issue.title}>
              {issue.title}
            </h3>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={`${getStatusColor(issue.status)} text-xs px-1.5 py-0.5 flex items-center gap-1`}>
                {getStatusIcon(issue.status)}
                <span>{getStatusText(issue.status)}</span>
              </Badge>
              <Badge variant="outline" className={`${getPriorityColor(issue.priority)} text-xs px-1.5 py-0.5`}>
                {getPriorityText(issue.priority)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {issue.system_name && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs">
                  {issue.system_name}{issue.serial_number ? ` (${issue.serial_number})` : ''}
                </span>
              )}
              {issue.station_name && (
                <span className="bg-secondary/10 text-secondary-foreground px-1.5 py-0.5 rounded text-xs">
                  {issue.station_name}
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions and date */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: 這裡需要實現編輯對話框
                }}
                className="h-6 w-6 p-0"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIssue(issue);
                }}
                className="h-6 w-6 p-0"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(issue.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
            </div>
            {issue.assigned_to && (
              <div className="text-xs text-muted-foreground truncate max-w-20" title={issue.assigned_to}>
                {issue.assigned_to}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const groupedIssues = groupIssuesByStatus(filteredIssues);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold">問題追蹤</h1>
            <p className="text-muted-foreground">問題填報、處理追蹤、統計分析與工廠報告</p>
          </div>
        </div>
        <div className="flex gap-2">
          <IssuePDFExportManager issues={issues} />
          <IssueCreateDialog onIssueCreated={loadIssues} />
        </div>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="list">
            <ListChecks className="mr-2 h-4 w-4" />
            問題列表
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            統計與報告
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-5 space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="min-w-[200px] flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋問題..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="優先級篩選" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部優先級</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <IssueTableView issues={filteredIssues} onUpdate={loadIssues} />

          {filteredIssues.length === 0 && (
            <div className="py-12 text-center">
              <Bug className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">沒有找到問題</h3>
              <p className="text-muted-foreground">
                {searchTerm || priorityFilter !== "all"
                  ? "請調整篩選條件或建立新問題"
                  : "還沒有任何問題記錄，點擊上方按鈕新增問題"
                }
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-5">
          <IssueAnalyticsPanel issues={issues} />
        </TabsContent>
      </Tabs>

      {/* Image Preview Dialog */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>圖片預覽</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {previewImage && (
              <img 
                src={`${supabase.storage.from('issue-attachments').getPublicUrl(previewImage).data.publicUrl}`}
                alt="預覽圖片"
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue Detail Dialog */}
      {selectedIssue && (
        <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedIssue.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge className={getPriorityColor(selectedIssue.priority)}>
                  {getPriorityText(selectedIssue.priority)}
                </Badge>
                <Badge className={getStatusColor(selectedIssue.status)}>
                  {getStatusIcon(selectedIssue.status)}
                  <span className="ml-1">{getStatusText(selectedIssue.status)}</span>
                </Badge>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">問題描述:</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedIssue.description}
                </p>
              </div>

              {selectedIssue.attachments && selectedIssue.attachments.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">附件:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedIssue.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center gap-2 bg-muted p-3 rounded">
                        <ImageIcon className="h-4 w-4" />
                        <span className="text-sm truncate flex-1" title={attachment.file_name}>
                          {attachment.file_name}
                        </span>
                        <div className="flex gap-1">
                          {isImageFile(attachment.file_name) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleImagePreview(attachment.file_path)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleImageDownload(attachment)}
                            className="h-8 w-8 p-0"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">負責人:</span> {selectedIssue.assigned_to || "未分配"}
                </div>
                <div>
                  <span className="font-medium">建立時間:</span> {new Date(selectedIssue.created_at).toLocaleString('zh-TW')}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
