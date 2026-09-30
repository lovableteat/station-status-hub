import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface OwnCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OwnCredentialsDialog({ open, onOpenChange }: OwnCredentialsDialogProps) {
  const { user, updateOwnCredentials } = useUser();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUsername(open ? user?.username ?? "" : "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmedPassword("");
    setShowPasswords(false);
    setError("");
  }, [open, user?.username]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const nextUsername = username.trim();
    if (!nextUsername || nextUsername.length > 50) {
      setError("帳號名稱需為 1 至 50 個字元。");
      return;
    }
    if (!currentPassword) {
      setError("請輸入目前密碼，以確認是本人操作。");
      return;
    }
    if (nextUsername === user?.username && !newPassword) {
      setError("請修改帳號名稱或輸入新密碼。");
      return;
    }
    if (newPassword && (newPassword.length < 6 || newPassword.length > 200)) {
      setError("新密碼需為 6 至 200 個字元。");
      return;
    }
    if (newPassword && newPassword === currentPassword) {
      setError("新密碼不可與目前密碼相同。");
      return;
    }
    if (newPassword !== confirmedPassword) {
      setError("兩次輸入的新密碼不一致。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await updateOwnCredentials({
        username: nextUsername,
        currentPassword,
        newPassword,
      });
      if (!result.success) {
        setError(result.error || "儲存失敗，請稍後再試。");
        return;
      }
      toast.success("帳號設定已更新");
      onOpenChange(false);
    } catch {
      setError("帳號服務暫時無法使用，請稍後再試。");
    } finally {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmedPassword("");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
      <DialogContent className="z-[100] max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-accent/35 px-5 py-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" />
            帳號與密碼
          </DialogTitle>
          <DialogDescription className="leading-6">
            修改自己的登入帳號或密碼。儲存前需輸入目前密碼確認身分。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void save(event)}>
          <div className="grid gap-4 px-5 py-5 sm:px-6">
            <div className="grid gap-2">
              <label htmlFor="own-account-username" className="text-sm font-semibold text-foreground">登入帳號</label>
              <Input
                id="own-account-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={50}
                value={username}
                disabled={saving}
                onChange={(event) => { setUsername(event.target.value); setError(""); }}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="own-account-current-password" className="text-sm font-semibold text-foreground">目前密碼</label>
              <Input
                id="own-account-current-password"
                name="current-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                maxLength={200}
                value={currentPassword}
                disabled={saving}
                onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }}
              />
            </div>

            <div className="grid gap-2 border-t border-border/70 pt-4">
              <label htmlFor="own-account-new-password" className="text-sm font-semibold text-foreground">新密碼 <span className="font-normal text-muted-foreground">（留空則不更改）</span></label>
              <Input
                id="own-account-new-password"
                name="new-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                minLength={newPassword ? 6 : undefined}
                maxLength={200}
                value={newPassword}
                disabled={saving}
                onChange={(event) => { setNewPassword(event.target.value); setError(""); }}
              />
              <p className="text-xs text-muted-foreground">如要更改，請輸入至少 6 個字元。</p>
            </div>

            <div className="grid gap-2">
              <label htmlFor="own-account-confirm-password" className="text-sm font-semibold text-foreground">確認新密碼</label>
              <Input
                id="own-account-confirm-password"
                name="confirm-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                maxLength={200}
                value={confirmedPassword}
                disabled={saving || !newPassword}
                onChange={(event) => { setConfirmedPassword(event.target.value); setError(""); }}
              />
            </div>

            <button
              type="button"
              className="flex min-h-11 w-fit items-center gap-2 rounded-xl px-2 text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-pressed={showPasswords}
              disabled={saving}
              onClick={() => setShowPasswords((visible) => !visible)}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPasswords ? "隱藏密碼" : "顯示密碼"}
            </button>

            {error ? <p role="alert" className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-background/20 px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={saving} className="disabled:opacity-70">
              {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              儲存變更
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
