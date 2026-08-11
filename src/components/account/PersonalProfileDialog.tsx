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
        <DialogHeader className="border-b border-primary/10 bg-primary/[0.04] px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserRound className="h-5 w-5 text-primary" />
            編輯大頭貼
          </DialogTitle>
          <DialogDescription>選擇照片並儲存後，導覽列與聊天室會立即同步。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 px-6 py-5">
          <div className="flex items-center gap-4 rounded-2xl border border-primary/15 bg-background/30 p-4">
            <Avatar className="h-20 w-20 border-2 border-primary/25 bg-primary/10 shadow-[0_18px_38px_-24px_hsl(var(--primary)/0.65)]">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${displayName}的頭像預覽`} className="object-cover" /> : null}
              <AvatarFallback className="bg-primary/10 text-xl font-black text-primary">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground">{displayName}</div>
              <div className="truncate text-sm text-muted-foreground">@{user?.username}</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                JPG、PNG 或 WebP，檔案上限 5 MB；畫面會自動裁切為正方形。
              </p>
            </div>
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

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/20 hover:text-primary"
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {selectedFile ? "重新選擇大頭貼" : "選擇大頭貼圖片"}
            </Button>
            {user?.avatarPath ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void removeAvatar()}
                className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
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

        <DialogFooter className="border-t border-primary/10 bg-background/20 px-6 py-4">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!selectedFile || saving} onClick={() => void saveAvatar()}>
            {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
            儲存大頭貼
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
