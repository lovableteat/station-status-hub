import { useRef, useState } from "react";
import {
  Archive,
  Box,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const GENERAL_ASSET_CATEGORY = "general_file";

const STORAGE_BUCKET = "task-attachments";
const MAX_FILES_PER_UPLOAD = 20;

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
  projectId: string | null;
  canAssignToProject: boolean;
}

interface UploadFailure {
  fileName: string;
  message: string;
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName ? extension.toUpperCase() : "FILE";
}

function getFileIcon(file: File) {
  const extension = getFileExtension(file.name).toLowerCase();
  if (file.type.startsWith("image/")) return FileImage;
  if (["xls", "xlsx", "csv"].includes(extension)) return FileSpreadsheet;
  if (["ppt", "pptx"].includes(extension)) return Presentation;
  if (["pdf", "doc", "docx", "txt"].includes(extension)) return FileText;
  if (["stp", "step", "stl", "obj", "glb", "gltf"].includes(extension)) return Box;
  if (["zip", "7z", "rar", "tar", "gz"].includes(extension)) return Archive;
  return File;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.normalize("NFKC").replace(/[\\/:*?"<>|#%]/g, "-");
  return normalized.replace(/\s+/g, "-").replace(/-+/g, "-").slice(-180) || "asset-file";
}

function mergeFiles(currentFiles: File[], incomingFiles: File[]) {
  const uniqueFiles = new Map(currentFiles.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
  incomingFiles.forEach((file) => uniqueFiles.set(`${file.name}:${file.size}:${file.lastModified}`, file));
  return Array.from(uniqueFiles.values()).slice(0, MAX_FILES_PER_UPLOAD);
}

export function FileUploadDialog({
  isOpen,
  onClose,
  onUploadSuccess,
  projectId,
  canAssignToProject,
}: FileUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addFiles = (incomingFiles: File[]) => {
    const nextFiles = mergeFiles(files, incomingFiles);
    if (files.length + incomingFiles.length > MAX_FILES_PER_UPLOAD) {
      toast({
        title: `一次最多上傳 ${MAX_FILES_PER_UPLOAD} 個檔案`,
        description: "其餘檔案未加入佇列，完成後可再上傳。",
        variant: "destructive",
      });
    }
    setFiles(nextFiles);
  };

  const resetDialog = () => {
    setFiles([]);
    setDescription("");
    setIsDragging(false);
    setIsUploading(false);
    setCompletedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (isUploading) return;
    resetDialog();
    onClose();
  };

  const removeFile = (fileToRemove: File) => {
    setFiles((current) => current.filter((file) => file !== fileToRemove));
  };

  const uploadFile = async (file: File) => {
    const storagePath = `general-assets/${projectId || "company-library"}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const { data: asset, error: assetError } = await supabase
      .from("tools_management")
      .insert({
        category: GENERAL_ASSET_CATEGORY,
        description: description.trim() || null,
        file_name: file.name,
        file_path: publicUrlData.publicUrl,
        file_size: file.size,
        is_required: false,
        tool_name: file.name,
        upload_status: "completed",
        uploaded_at: new Date().toISOString(),
        uploaded_by: "system_user",
        version: null,
      })
      .select("id")
      .single();

    if (assetError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw assetError;
    }

    if (projectId && canAssignToProject) {
      const { error: assignmentError } = await supabase.from("test_project_tool_assignments").insert({
        is_required: false,
        project_id: projectId,
        tool_id: asset.id,
      });
      if (assignmentError) {
        await Promise.all([
          supabase.from("tools_management").delete().eq("id", asset.id),
          supabase.storage.from(STORAGE_BUCKET).remove([storagePath]),
        ]);
        throw assignmentError;
      }
    }
  };

  const handleUpload = async () => {
    if (!files.length) {
      toast({ title: "請先選擇檔案", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setCompletedCount(0);
    const failures: UploadFailure[] = [];

    for (const file of files) {
      try {
        await uploadFile(file);
      } catch (error) {
        failures.push({
          fileName: file.name,
          message: error instanceof Error ? error.message : "未知錯誤",
        });
      } finally {
        setCompletedCount((count) => count + 1);
      }
    }

    const successCount = files.length - failures.length;
    if (successCount > 0) onUploadSuccess();

    if (failures.length) {
      toast({
        title: `${successCount} 個成功，${failures.length} 個失敗`,
        description: failures.slice(0, 2).map((failure) => `${failure.fileName}：${failure.message}`).join("；"),
        variant: "destructive",
      });
      setFiles((current) => current.filter((file) => failures.some((failure) => failure.fileName === file.name)));
      setIsUploading(false);
      setCompletedCount(0);
      return;
    }

    toast({
      title: `${successCount} 個檔案已上傳`,
      description: projectId && canAssignToProject ? "已放入目前專案的不特定資產。" : "已放入公司共用庫。",
    });
    resetDialog();
    onClose();
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const progress = files.length ? Math.round((completedCount / files.length) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-[#2a526f] bg-[#071522] p-0 text-[#f3f8fc] sm:max-w-2xl">
        <DialogHeader className="border-b border-[#2a526f] bg-gradient-to-r from-cyan-400/[0.12] via-blue-400/[0.06] to-transparent px-6 py-5 text-left">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">上傳不特定檔案</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6 text-[#b6cad8]">
                {projectId
                  ? "作為專案檔案傳輸區使用。檔案會保留在公司共用庫，並自動套用到目前專案。"
                  : "作為公司檔案傳輸區使用。選擇專案後，可再將檔案套用到指定專案。"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap gap-2" aria-label="支援格式">
            {["PDF / Word", "Excel / CSV", "PPT / PPTX", "STP / STEP", "圖片", "其他格式"].map((format) => (
              <span key={format} className="rounded-md border border-[#315d79] bg-[#10263a] px-2.5 py-1 text-xs font-medium text-[#cce4f2]">
                {format}
              </span>
            ))}
          </div>

          <div
            className={cn(
              "rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors",
              isDragging
                ? "border-cyan-300 bg-cyan-300/[0.12]"
                : "border-[#3a6884] bg-[#0b1b2d] hover:border-cyan-300/70 hover:bg-[#10263a]",
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <UploadCloud className="mx-auto h-9 w-9 text-cyan-200" />
            <div className="mt-3 text-base font-semibold">把檔案拖到這裡</div>
            <div className="mt-1 text-sm text-[#9eb8c9]">可一次加入多個檔案，也可繼續追加</div>
            <Button type="button" variant="outline" className="mt-4 border-cyan-300/45 bg-cyan-300/[0.08]" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              選擇檔案
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(Array.from(event.target.files || []));
                event.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-[#2a526f] bg-[#091a2a]">
              <div className="flex items-center justify-between border-b border-[#2a526f] px-4 py-2.5">
                <div className="text-sm font-semibold">待上傳檔案</div>
                <div className="font-data text-xs text-[#9eb8c9]">{files.length} 個 · {formatFileSize(totalSize)}</div>
              </div>
              <div className="max-h-52 divide-y divide-[#24465e] overflow-y-auto">
                {files.map((file) => {
                  const Icon = getFileIcon(file);
                  return (
                    <div key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/25 bg-blue-300/10 text-blue-100">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{file.name}</div>
                        <div className="mt-0.5 font-data text-xs text-[#91aabd]">{getFileExtension(file.name)} · {formatFileSize(file.size)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFile(file)} disabled={isUploading} aria-label={`移除 ${file.name}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="space-y-2">
            <Label htmlFor="general-asset-description">檔案說明（選填）</Label>
            <Textarea
              id="general-asset-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 500))}
              rows={3}
              className="border-[#315d79] bg-[#10263a]"
              placeholder="例如：供應商規格、測試報告、機構模型或交接資料"
              disabled={isUploading}
            />
          </div>

          {isUploading && (
            <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.07] p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin" />正在上傳</span>
                <span className="font-data text-cyan-100">{completedCount}/{files.length}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {!canAssignToProject && projectId && (
            <div className="rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-sm text-amber-100">
              專案套用資料尚未就緒；檔案仍可上傳至公司共用庫，稍後再手動套用。
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-[#24465e] pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>取消</Button>
            <Button type="button" onClick={handleUpload} disabled={isUploading || !files.length}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {files.length ? `上傳 ${files.length} 個檔案` : "開始上傳"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
