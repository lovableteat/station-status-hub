import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

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
  created_at: string;
  updated_at: string;
  system_name?: string;
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
      case "critical": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-red-500/10 text-red-700 dark:text-red-400";
      case "medium": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      case "low": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-destructive/10 text-destructive";
      case "in_progress": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "resolved":
      case "closed": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
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
                      <p className="mt-1 text-sm">{issue.system_name}</p>
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
              <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
            </div>
          </div>

          {/* 相關項目和分類 */}
          {(issue.relate || issue.category) && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                {issue.relate && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">相關項目</label>
                    <p className="mt-1 text-sm">{issue.relate}</p>
                  </div>
                )}
                {issue.category && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">問題分類</label>
                    <p className="mt-1 text-sm">{issue.category}</p>
                  </div>
                )}
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
                  <p className="text-sm whitespace-pre-wrap">{issue.process_notes}</p>
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
                <div className="mt-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-800">
                  <p className="text-sm whitespace-pre-wrap">{issue.solution}</p>
                </div>
              </div>
            </>
          )}

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