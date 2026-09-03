import { useState } from "react";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  privacyDb,
  type PerformancePrivacy,
  type PerformanceLock,
} from "./usePerformancePrivacy";

export function PerformancePrivacyPanel({
  privacy,
  userId,
  configure = false,
}: {
  privacy: PerformancePrivacy;
  userId: string;
  configure?: boolean;
}) {
  const [dialog, setDialog] = useState<"configure" | PerformanceLock | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const own = privacy.locks.find((lock) => lock.owner_id === userId);
  const close = () => {
    setDialog(null);
    setPassword("");
    setCurrent("");
    setConfirm("");
    setError("");
  };
  const open = (target: typeof dialog) => {
    close();
    setDialog(target);
  };
  const submit = async (remove = false) => {
    if (!dialog || busy) return;
    if (
      dialog === "configure" &&
      !remove &&
      (password.length < 8 ||
        new TextEncoder().encode(password).length > 72 ||
        password !== confirm)
    ) {
      setError(
        "請輸入至少 8 個字元、最多 72 位元組的密碼，並確認兩次輸入相同。",
      );
      return;
    }
    setBusy(true);
    setError("");
    privacy.clear();
    try {
      const result =
        dialog === "configure"
          ? await privacyDb.rpc("set_performance_group_password", {
              p_password: remove ? "" : password,
              p_current_password: current,
            })
          : await privacyDb.rpc("unlock_performance_group", {
              p_owner_id: dialog.owner_id,
              p_password: password,
            });
      if (result.error) throw result.error;
      if (!result.data) {
        setError("密碼不正確。連續錯誤 5 次後，請等 5 分鐘再試。");
        return;
      }
      setNotice(
        dialog === "configure"
          ? remove
            ? "已移除本組密碼保護。"
            : "本組密碼已設定。管理員也必須輸入密碼才能查看受保護的考核。"
          : "已解鎖 30 分鐘；仍依你的組織權限顯示資料。",
      );
      close();
    } catch {
      setError("操作失敗，請確認權限與連線後重試。");
    } finally {
      await privacy.refresh();
      setBusy(false);
    }
  };
  const lock = async () => {
    setBusy(true);
    privacy.clear();
    setNotice("");
    try {
      const result = await privacyDb.rpc("lock_performance_groups");
      if (result.error) throw result.error;
      setNotice("本次登入已重新鎖定所有受保護考核。");
    } catch {
      setNotice("鎖定未完成，請重試。");
    } finally {
      await privacy.refresh();
      setBusy(false);
    }
  };
  return (
    <section className="rd2-card rd2-privacy" aria-label="考核資料保護">
      <div className="rd2-org-header">
        <div>
          <h3>
            <LockKeyhole aria-hidden="true" />
            考核資料保護
          </h3>
          <p className="rd2-hint">
            密碼只解鎖考核資料，不會擴大組織權限。員工仍可填寫自己的自評。
          </p>
        </div>
        <div className="rd2-row-actions">
          {configure && (
            <Button
              variant="outline"
              disabled={busy || !privacy.ready}
              onClick={() => open("configure")}
            >
              {own ? "管理本組密碼" : "設定本組密碼"}
            </Button>
          )}
          {privacy.locks.some((item) => item.unlocked) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void lock()}
            >
              <LockKeyhole data-icon="inline-start" />
              立即鎖定
            </Button>
          )}
        </div>
      </div>
      {privacy.error && (
        <p role="alert" className="rd2-error">
          {privacy.error}
          <Button variant="ghost" onClick={() => void privacy.refresh()}>
            重新整理
          </Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!!privacy.locks.length && (
        <ul className="rd2-privacy-groups">
          {privacy.locks.map((item) => (
            <li key={item.owner_id}>
              <span>{item.owner_name} 的保護範圍</span>
              <span>{item.unlocked ? "已解鎖" : "已鎖定"}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || item.unlocked}
                onClick={() => open(item)}
              >
                <UnlockKeyhole data-icon="inline-start" />
                {item.unlocked ? "30 分鐘內有效" : "輸入密碼"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!privacy.locks.length && privacy.ready && (
        <p className="rd2-hint">目前沒有設定密碼的主管群組。</p>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(value) => {
          if (!value && !busy) close();
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === "configure"
                ? "設定本組考核密碼"
                : `解鎖 ${dialog?.owner_name || ""} 的考核`}
            </DialogTitle>
            <DialogDescription>
              {dialog === "configure"
                ? "保護你與所屬下級的考核。只有設定者可憑原密碼修改或移除，管理員沒有重設密碼的入口。請妥善保存密碼。"
                : "解鎖只對本次登入有效，30 分鐘後自動鎖定。"}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <FieldGroup>
              {dialog === "configure" && own && (
                <Field>
                  <FieldLabel htmlFor="performance-current-password">
                    目前密碼
                  </FieldLabel>
                  <Input
                    id="performance-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={current}
                    disabled={busy}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="performance-group-password">
                  {dialog === "configure" ? "新密碼" : "密碼"}
                </FieldLabel>
                <Input
                  id="performance-group-password"
                  type="password"
                  autoComplete={
                    dialog === "configure" ? "new-password" : "current-password"
                  }
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {dialog === "configure" && (
                <Field>
                  <FieldLabel htmlFor="performance-confirm-password">
                    再次輸入新密碼
                  </FieldLabel>
                  <Input
                    id="performance-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    disabled={busy}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              )}
              {error && (
                <p role="alert" className="rd2-error">
                  {error}
                </p>
              )}
              <div className="rd2-actions">
                {dialog === "configure" && own && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !current}
                    onClick={() => void submit(true)}
                  >
                    移除密碼保護
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={close}
                >
                  取消
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "處理中…"
                    : dialog === "configure"
                      ? "儲存密碼"
                      : "解鎖"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
