import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/components/auth/UserContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUserAvatarPublicUrl } from "./userAvatarUrl";
import {
  USER_AVATAR_ACCEPT,
  validateUserAvatarFile,
} from "./userAvatarUtils.mjs";

interface PersonalProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PersonalProfileDialog({ open, onOpenChange }: PersonalProfileDialogProps) {
  const { user, updateAvatar } = useUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (open) return;
    setSelectedFile(null);
    setError(null);
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const validationError = validateUserAvatarFile(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const saveAvatar = async () => {
    if (!selectedFile || saving) return;
    setSaving(true);
    const result = await updateAvatar(selectedFile);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "頭像儲存失敗。");
      return;
    }
    toast.success("頭像已更新");
    onOpenChange(false);
  };

  const removeAvatar = async () => {
    if (!user?.avatarPath || saving) return;
    setSaving(true);
    const result = await updateAvatar(null);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "頭像移除失敗。");
      return;
    }
    setSelectedFile(null);
    toast.success("頭像已移除");
  };

  const displayName = user?.displayName || user?.username || "使用者";
  const savedAvatarUrl = getUserAvatarPublicUrl(user?.avatarPath);
  const avatarUrl = previewUrl || savedAvatarUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-accent/35 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserRound className="h-5 w-5 text-primary" />
            編輯大頭貼
          </DialogTitle>
          <DialogDescription>選擇照片並儲存後，導覽列與聊天室會立即同步。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <button
              type="button"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              aria-label={selectedFile ? "重新選擇大頭貼圖片" : "選擇大頭貼圖片"}
              className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar className="h-32 w-32 border-4 border-primary/30 bg-accent shadow-[0_24px_48px_-28px_hsl(0_0%_0%/0.7)]">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${displayName}的頭像預覽`} className="object-cover" /> : null}
                <AvatarFallback className="bg-accent text-3xl font-black text-primary">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </span>
            </button>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">@{user?.username}</p>
            </div>
            <p className="text-sm leading-6 text-foreground/70">
              {selectedFile ? `已選擇 ${selectedFile.name}，按「儲存大頭貼」套用。` : "點上方頭像或下方按鈕選擇照片；支援 JPG、PNG、WebP，檔案上限 5 MB，會自動裁成正方形。"}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={USER_AVATAR_ACCEPT}
            aria-label="選擇頭像圖片"
            disabled={saving}
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            className="sr-only"
          />

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 rounded-xl px-4 text-sm font-semibold"
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {selectedFile ? "重新選擇" : "選擇照片"}
            </Button>
            {user?.avatarPath ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void removeAvatar()}
                className="h-10 rounded-xl px-4 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                移除目前頭像
              </Button>
            ) : null}
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-background/20 px-6 py-4">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!selectedFile || saving} onClick={() => void saveAvatar()} className="disabled:!bg-none disabled:bg-muted disabled:text-muted-foreground disabled:!opacity-75 disabled:shadow-none">
            {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            儲存大頭貼
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
