import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Edit, Tag } from "lucide-react";
import { NotificationConversationView } from "@/components/common/NotificationConversationView";

interface Issue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  process_notes?: string;
  solution?: string;
  relate?: string;
  category?: string;
  tags?: string[];
  mentioned_users?: string[];
  created_at: string;
  updated_at: string;
  system_name?: string;
  serial_number?: string;
  station_name?: string;
  test_item_name?: string;
}

interface IssueDetailDialogProps {
  issue: Issue;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (issue: Issue) => void;
}

export function IssueDetailDialog({ issue, isOpen, onClose, onEdit }: IssueDetailDialogProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "border-red-400/60 bg-red-500/20 text-red-100";
      case "high": return "border-orange-400/55 bg-orange-500/20 text-orange-100";
      case "medium": return "border-amber-400/50 bg-amber-500/15 text-amber-100";
      case "low": return "border-primary/45 bg-primary/15 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "border-destructive/40 bg-destructive/15 text-red-100";
      case "in_progress": return "border-amber-400/35 bg-amber-500/15 text-amber-100";
      case "resolved":
      case "closed": return "border-primary/35 bg-primary/15 text-primary";
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
      case "open": return "開啟";
      case "in_progress": return "處理中";
      case "resolved": return "已解決";
      case "closed": return "已關閉";
      default: return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">{issue.title}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(issue)}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              編輯
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 基本資訊 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">優先級</label>
              <div className="mt-1">
                <Badge className={getPriorityColor(issue.priority)}>
                  {getPriorityText(issue.priority)}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">狀態</label>
              <div className="mt-1">
                <Badge className={getStatusColor(issue.status)}>
                  {getStatusText(issue.status)}
                </Badge>
              </div>
            </div>
          </div>

          {/* 負責人 */}
          {issue.assigned_to && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">負責人</label>
              <p className="mt-1 text-sm">{issue.assigned_to}</p>
            </div>
          )}

          {/* 系統相關資訊 */}
          {(issue.system_name || issue.station_name || issue.test_item_name) && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="font-medium">系統資訊</h4>
                <div className="grid grid-cols-3 gap-4">
                  {issue.system_name && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">系統名稱</label>
                      <p className="mt-1 text-sm">
                        {issue.system_name}{issue.serial_number ? ` (${issue.serial_number})` : ''}
                      </p>
                    </div>
                  )}
                  {issue.station_name && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">工站</label>
                      <p className="mt-1 text-sm">{issue.station_name}</p>
                    </div>
                  )}
                  {issue.test_item_name && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">測試項目</label>
                      <p className="mt-1 text-sm">{issue.test_item_name}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 問題描述 */}
          <Separator />
          <div>
            <label className="text-sm font-medium text-muted-foreground">問題描述</label>
            <div className="mt-2 p-3 bg-muted/50 rounded-md">
              <div 
                className="text-sm prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: issue.description }}
              />
            </div>
          </div>

          {/* 問題分類 */}
          {issue.category && (
            <>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">問題分類</label>
                <p className="mt-1 text-sm">{issue.category}</p>
              </div>
            </>
          )}

          {/* 處理過程 */}
          {issue.process_notes && (
            <>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">處理過程</label>
                <div className="mt-2 p-3 bg-muted/50 rounded-md">
                  <div 
                    className="text-sm prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: issue.process_notes }}
                  />
                </div>
              </div>
            </>
          )}

          {/* 解決方案 */}
          {issue.solution && (
            <>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">解決方案</label>
                <div className="mt-2 rounded-md border border-primary/20 bg-primary/10 p-3">
                  <div 
                    className="text-sm prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: issue.solution }}
                  />
                </div>
              </div>
            </>
          )}

          {/* 標註對話 */}
          <Separator />
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-3 block">標註對話記錄</label>
            <NotificationConversationView 
              issueId={issue.id}
              referenceType="issue"
              referenceId={issue.id}
            />
          </div>

          {/* 時間戳 */}
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <label className="font-medium">建立時間</label>
              <p className="mt-1">{new Date(issue.created_at).toLocaleString('zh-TW')}</p>
            </div>
            <div>
              <label className="font-medium">更新時間</label>
              <p className="mt-1">{new Date(issue.updated_at).toLocaleString('zh-TW')}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
