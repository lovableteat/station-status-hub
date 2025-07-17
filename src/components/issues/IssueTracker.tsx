
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Bug, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Plus, 
  Search, 
  Filter,
  Eye,
  Download,
  Image as ImageIcon,
  X
} from "lucide-react";
import { IssueCreateDialog } from "./IssueCreateDialog";
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
  const [statusFilter, setStatusFilter] = useState("all");
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
  }, [issues, searchTerm, statusFilter, priorityFilter]);

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

    if (statusFilter !== "all") {
      filtered = filtered.filter(issue => issue.status === statusFilter);
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter(issue => issue.priority === priorityFilter);
    }

    setFilteredIssues(filtered);
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
      case "resolved": return "bg-green-100 text-green-800";
      case "closed": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertTriangle className="h-4 w-4" />;
      case "in_progress": return <Clock className="h-4 w-4" />;
      case "resolved": return <CheckCircle className="h-4 w-4" />;
      case "closed": return <CheckCircle className="h-4 w-4" />;
      default: return <Bug className="h-4 w-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "open": return "開啟";
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
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="狀態篩選" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="open">開啟</SelectItem>
            <SelectItem value="in_progress">處理中</SelectItem>
            <SelectItem value="resolved">已解決</SelectItem>
            <SelectItem value="closed">已關閉</SelectItem>
          </SelectContent>
        </Select>
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

      {/* Issues List */}
      <div className="space-y-4">
        {filteredIssues.map((issue) => (
          <Card key={issue.id} className="transition-all hover:shadow-md">
            <CardContent className="p-6">
              <div className="space-y-4">
                {/* Issue Header */}
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">{issue.title}</h3>
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(issue.priority)}>
                        {getPriorityText(issue.priority)}
                      </Badge>
                      <Badge className={getStatusColor(issue.status)}>
                        {getStatusIcon(issue.status)}
                        <span className="ml-1">{getStatusText(issue.status)}</span>
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(issue.created_at).toLocaleString('zh-TW')}
                  </div>
                </div>

                {/* Issue Content */}
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {issue.description}
                  </p>
                  
                  {/* System Info */}
                  {(issue.system_name || issue.station_name || issue.test_item_name) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {issue.system_name && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          系統: {issue.system_name}
                        </span>
                      )}
                      {issue.station_name && (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                          站點: {issue.station_name}
                        </span>
                      )}
                      {issue.test_item_name && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                          測項: {issue.test_item_name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Attachments */}
                  {issue.attachments && issue.attachments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">附件:</h4>
                      <div className="flex flex-wrap gap-2">
                        {issue.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center gap-2 bg-muted p-2 rounded">
                            <ImageIcon className="h-4 w-4" />
                            <span className="text-sm truncate max-w-[100px]" title={attachment.file_name}>
                              {attachment.file_name}
                            </span>
                            <div className="flex gap-1">
                              {isImageFile(attachment.file_name) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleImagePreview(attachment.file_path)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImageDownload(attachment)}
                                className="h-6 w-6 p-0"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Issue Footer */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="text-sm text-muted-foreground">
                    {issue.assigned_to && `負責人: ${issue.assigned_to}`}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIssue(issue)}
                  >
                    查看詳情
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredIssues.length === 0 && (
        <div className="text-center py-12">
          <Bug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">沒有找到問題</h3>
          <p className="text-muted-foreground">
            {searchTerm || statusFilter !== "all" || priorityFilter !== "all"
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
