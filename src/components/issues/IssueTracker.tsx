
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Image as ImageIcon
} from "lucide-react";
import { IssueCreateDialog } from "./IssueCreateDialog";
import { IssueEditDialog } from "./IssueEditDialog";
import { BackButton } from "@/components/common/BackButton";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
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

export function IssueTracker() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filteredIssues, setFilteredIssues] = useState<Issue[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    filterIssues();
  }, [issues, searchTerm, priorityFilter]);

  const loadIssues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('issue_details')
        .select('*')
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
      filtered = filtered.filter(issue =>
        issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.system_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        issue.station_name?.toLowerCase().includes(searchTerm.toLowerCase())
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
      case "high": return "bg-red-100 text-red-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-100 text-red-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "resolved": 
      case "closed": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
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

  const handleImageDownload = async (attachment: any) => {
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
    <Card key={issue.id} className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 border-l-4 border-l-primary/20 hover:border-l-primary bg-gradient-to-r from-background to-muted/20">
      <CardContent className="p-5">
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-3 flex-1">
              <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-relaxed">
                {issue.title}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`${getPriorityColor(issue.priority)} shadow-sm border-0 font-medium`}>
                  {getPriorityText(issue.priority)}
                </Badge>
                <Badge variant="outline" className={`${getStatusColor(issue.status)} shadow-sm border-0 font-medium flex items-center gap-1`}>
                  {getStatusIcon(issue.status)}
                  <span>{getStatusText(issue.status)}</span>
                </Badge>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <IssueEditDialog 
                issue={issue} 
                onUpdate={loadIssues} 
                onDelete={loadIssues} 
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIssue(issue)}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {issue.description}
          </p>

          {(issue.system_name || issue.station_name || issue.test_item_name) && (
            <div className="flex flex-wrap gap-2">
              {issue.system_name && (
                <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-xs font-medium border border-blue-200">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  系統: {issue.system_name}
                </div>
              )}
              {issue.station_name && (
                <div className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-medium border border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  站點: {issue.station_name}
                </div>
              )}
            </div>
          )}

          {issue.attachments && issue.attachments.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">附件 ({issue.attachments.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {issue.attachments.slice(0, 3).map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2 bg-background/80 px-3 py-1.5 rounded-md text-xs border">
                    <ImageIcon className="h-3 w-3 text-primary" />
                    <span className="truncate max-w-[80px] font-medium" title={attachment.file_name}>
                      {attachment.file_name}
                    </span>
                  </div>
                ))}
                {issue.attachments.length > 3 && (
                  <div className="flex items-center justify-center bg-primary/10 text-primary px-3 py-1.5 rounded-md text-xs font-medium">
                    +{issue.attachments.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">
                  {(issue.assigned_to || "未").charAt(0)}
                </span>
              </div>
              <span className="text-sm font-medium text-foreground">{issue.assigned_to || "未指派"}</span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {new Date(issue.created_at).toLocaleDateString('zh-TW')}
            </span>
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
            <p className="text-muted-foreground">管理和追蹤測試過程中的問題</p>
          </div>
        </div>
        <IssueCreateDialog onIssueCreated={loadIssues} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋問題..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.trim().slice(0, 100))}
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

      {/* Issues by Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 待處理 */}
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-red-50 to-red-100/50 border-red-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-3 text-red-700">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <div className="text-lg font-bold">待處理</div>
                  <div className="text-sm font-normal text-red-600">{groupedIssues.open.length} 個問題</div>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
          <div className="space-y-4 min-h-[200px]">
            {groupedIssues.open.map(renderIssueCard)}
            {groupedIssues.open.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>目前沒有待處理的問題</p>
              </div>
            )}
          </div>
        </div>

        {/* 處理中 */}
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-blue-50 to-blue-100/50 border-blue-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-3 text-blue-700">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-lg font-bold">處理中</div>
                  <div className="text-sm font-normal text-blue-600">{groupedIssues.in_progress.length} 個問題</div>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
          <div className="space-y-4 min-h-[200px]">
            {groupedIssues.in_progress.map(renderIssueCard)}
            {groupedIssues.in_progress.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>目前沒有處理中的問題</p>
              </div>
            )}
          </div>
        </div>

        {/* 已完成 */}
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-green-50 to-green-100/50 border-green-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center gap-3 text-green-700">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <div className="text-lg font-bold">已完成</div>
                  <div className="text-sm font-normal text-green-600">{groupedIssues.resolved.length} 個問題</div>
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
          <div className="space-y-4 min-h-[200px]">
            {groupedIssues.resolved.map(renderIssueCard)}
            {groupedIssues.resolved.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>目前沒有已完成的問題</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {filteredIssues.length === 0 && (
        <div className="text-center py-12">
          <Bug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">沒有找到問題</h3>
          <p className="text-muted-foreground">
            {searchTerm || priorityFilter !== "all"
              ? "請調整篩選條件或建立新問題"
              : "還沒有任何問題記錄，點擊上方按鈕新增問題"
            }
          </p>
        </div>
      )}

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
