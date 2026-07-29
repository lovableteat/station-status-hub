import { useState } from "react";
import { KeyRound, LogOut, RadioTower, ShieldCheck } from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";

export function RealtimeSessionUpgradePage() {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { authenticate, logout, user } = useUser();
  const { toast } = useToast();

  if (!user) return null;

  const handleUpgrade = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const result = await authenticate(user.username, password);
      if (!result || result.mode !== "authenticated") {
        setErrorMessage("密碼不正確，請輸入目前帳號的登入密碼。");
        return;
      }

      toast({
        title: "即時身分驗證完成",
        description: "在線成員、訊息與帳戶管理功能已重新連線。",
      });
    } catch (error) {
      console.error("Realtime session upgrade failed:", error);
      setErrorMessage(
        isSupabaseServiceRestrictedError(error)
          ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
          : "目前無法建立安全工作階段，請確認網路後再試；若持續發生，請聯絡系統管理員。",
      );
    } finally {
      setPassword("");
      setIsSubmitting(false);
    }
  };

  const handleUseAnotherAccount = () => {
    setPassword("");
    logout();
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06111f] px-4 py-10 text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.14),transparent_34rem),radial-gradient(circle_at_82%_90%,rgba(59,130,246,0.12),transparent_30rem)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

      <section
        aria-labelledby="realtime-upgrade-title"
        className="relative w-full max-w-[520px] overflow-hidden rounded-[18px] border border-cyan-200/35 bg-[linear-gradient(145deg,#102a40,#0b2033_58%,#0a1b2c)] shadow-[0_34px_90px_-44px_rgba(34,211,238,0.75)]"
      >
        <header className="border-b border-cyan-100/10 px-6 py-6 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-cyan-200/25 bg-cyan-300/10 text-cyan-100">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/70">
                <RadioTower className="h-3.5 w-3.5" aria-hidden="true" />
                Secure Realtime
              </div>
              <h1
                id="realtime-upgrade-title"
                className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-[28px]"
              >
                重新驗證即時工作身分
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                系統已升級安全連線。驗證完成後會保留目前帳號與工作內容，並立即恢復在線成員、訊息與後台帳戶操作。
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          <div className="grid gap-1.5 rounded-[12px] border border-sky-200/15 bg-slate-950/20 px-4 py-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              目前帳號
            </span>
            <span className="truncate text-base font-semibold text-sky-100">
              {user.displayName}
              <span className="ml-2 text-sm font-normal text-slate-400">@{user.username}</span>
            </span>
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-[12px] border border-rose-300/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100"
            >
              {errorMessage}
            </div>
          ) : null}

          <form onSubmit={handleUpgrade} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="realtime-upgrade-password">目前密碼</Label>
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/60"
                  aria-hidden="true"
                />
                <Input
                  id="realtime-upgrade-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 border-cyan-200/20 bg-[#071827] pl-10 text-slate-50 placeholder:text-slate-500"
                  placeholder="輸入目前登入密碼"
                  autoFocus
                  required
                />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                密碼只用於本次驗證，不會儲存在瀏覽器或工作平台。
              </p>
            </div>

            <Button
              type="submit"
              className="h-11 w-full bg-cyan-300 font-bold text-slate-950 hover:bg-cyan-200"
              disabled={isSubmitting || password.length === 0}
            >
              {isSubmitting ? "正在建立安全連線…" : "驗證並恢復即時功能"}
            </Button>
          </form>

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
            <p className="text-xs leading-5 text-slate-500">不是這個帳號？可安全登出後重新選擇。</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUseAnotherAccount}
              className="shrink-0 border-slate-300/15 bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              改用其他帳號
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
