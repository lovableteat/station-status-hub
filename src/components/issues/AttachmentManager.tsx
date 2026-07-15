import React, { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Download, Trash2, Image, FileText, File, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface AttachmentManagerProps {
  issueId: string;
  onUpdate?: () => void;
  refreshKey?: number;
}

export function AttachmentManager({ issueId, onUpdate, refreshKey = 0 }: AttachmentManagerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadAttachments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('issue_attachments')
        .select('*')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('載入附件失敗:', error);
    }
  }, [issueId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments, refreshKey]);

  const deleteAttachment = async (attachment: Attachment) => {
    setLoading(true);
    try {
      if (attachment.file_path.includes('/inline/')) {
        const publicUrl = supabase.storage.from('issue-attachments').getPublicUrl(attachment.file_path).data.publicUrl;
        const { data: issue, error: issueError } = await supabase
          .from('issues')
          .select('description, process_notes, solution')
          .eq('id', issueId)
          .single();

        if (issueError) throw issueError;
        const isReferenced = [issue.description, issue.process_notes, issue.solution]
          .some((content) => content?.includes(publicUrl));

        if (isReferenced) {
          toast({
            title: "截圖仍在問題內容中",
            description: "請先從內容編輯器移除截圖並儲存，再回到附件區刪除檔案。",
            variant: "destructive",
          });
          return;
        }
      }

      // 從資料庫刪除記錄
      const { error: dbError } = await supabase
        .from('issue_attachments')
        .delete()
        .eq('id', attachment.id);

      if (dbError) throw dbError;

      // 從儲存體刪除檔案
      const { error: storageError } = await supabase.storage
        .from('issue-attachments')
        .remove([attachment.file_path]);

      if (storageError) {
        console.warn('儲存體檔案刪除失敗:', storageError);
      }

      toast({
        title: "刪除成功",
        description: `附件 "${attachment.file_name}" 已刪除`
      });

      loadAttachments();
      onUpdate?.();
    } catch (error) {
      console.error('刪除附件失敗:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除附件，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setPendingDelete(null);
    }
  };

  const previewAttachment = async (attachment: Attachment) => {
    try {
      const { data } = supabase.storage
        .from('issue-attachments')
        .getPublicUrl(attachment.file_path);

      setPreviewFile({
        url: data.publicUrl,
        type: attachment.file_type,
        name: attachment.file_name
      });
    } catch (error) {
      console.error('預覽失敗:', error);
      toast({
        title: "預覽失敗",
        description: "無法預覽此附件",
        variant: "destructive"
      });
    }
  };

  const downloadAttachment = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('issue-attachments')
        .download(attachment.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "下載完成",
        description: `附件 "${attachment.file_name}" 已下載`
      });
    } catch (error) {
      console.error('下載失敗:', error);
      toast({
        title: "下載失敗",
        description: "無法下載附件，請稍後再試",
        variant: "destructive"
      });
    }
  };

  const getFileIcon = (fileType: string, fileName: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (fileType === 'application/pdf') return <FileText className="h-4 w-4" />;
    if (fileName.toLowerCase().endsWith('.msg') || fileType === 'application/vnd.ms-outlook') return <Mail className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (attachments.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-4">
        暫無附件
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {getFileIcon(attachment.file_type, attachment.file_name)}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate" title={attachment.file_name}>{attachment.file_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatFileSize(attachment.file_size)}</span>
                <span>•</span>
                <span>{new Date(attachment.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => previewAttachment(attachment)}
              title="預覽"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadAttachment(attachment)}
              title="下載"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingDelete(attachment)}
              disabled={loading}
              title="刪除"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="border-rose-300/30 bg-[#0b1b2d]">
          <AlertDialogHeader>
            <AlertDialogTitle>刪除附件？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.file_name}」會從問題與檔案儲存空間中永久移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-500"
              disabled={loading || !pendingDelete}
              onClick={() => pendingDelete && deleteAttachment(pendingDelete)}
            >
              {loading ? "刪除中" : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 預覽對話框 */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            {previewFile?.type.startsWith('image/') ? (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                className="max-w-full h-auto"
              />
            ) : previewFile?.type === 'application/pdf' ? (
              <iframe
                src={previewFile.url}
                className="w-full h-[60vh] border"
                title={previewFile.name}
              />
            ) : (
              <div className="text-center py-8">
                <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">此檔案類型無法預覽</p>
                <Button
                  className="mt-4"
                  onClick={() => window.open(previewFile.url, '_blank')}
                >
                  在新視窗開啟
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
