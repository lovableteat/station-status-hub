import { useState } from "react";
import { KeyRound, UserRoundPlus } from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import { PlatformLogoMark } from "@/components/brand/PlatformLogoMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";
import { cn } from "@/lib/utils";

type AuthView = "login" | "register";

const registrationMessages: Record<string, string> = {
  INVALID_USERNAME: "請輸入可辨識的帳號名稱。",
  INVALID_DISPLAY_NAME: "請填寫正確姓名。",
  INVALID_PASSWORD: "密碼至少需要 6 個字元。",
  USERNAME_EXISTS: "這個帳號已有人使用，請更換帳號。",
};

export function LoginPage() {
  const { authenticate, registerAccount, reauthRequired, requiresRealtimeUpgrade, user } = useUser();
  const [view, setView] = useState<AuthView>("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState(() => user?.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isServiceRestricted, setIsServiceRestricted] = useState(false);
  const { toast } = useToast();

  const switchView = (nextView: AuthView) => {
    setView(nextView);
    setPassword("");
    setConfirmPassword("");
    setIsServiceRestricted(false);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const result = await authenticate(username, password);
      if (!result) {
        toast({
          title: "無法登入",
          description: "帳號或密碼錯誤，或帳號仍在等待管理員核准。",
          variant: "destructive",
        });
        return;
      }
      setIsServiceRestricted(false);
      toast({ title: "登入成功", description: `歡迎回來，${result.user.displayName}` });
    } catch (error) {
      const serviceRestricted = isSupabaseServiceRestrictedError(error);
      setIsServiceRestricted(serviceRestricted);
      toast({
        title: serviceRestricted ? "登入服務暫時受限" : "無法登入",
        description: serviceRestricted
          ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
          : "登入服務暫時無法使用，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "密碼不一致", description: "請重新確認兩次輸入的密碼。", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const result = await registerAccount(displayName, username, password);
      if (!result.success) {
        toast({
          title: "註冊未完成",
          description: registrationMessages[result.code] ?? "目前無法完成註冊，請稍後再試。",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "註冊申請已送出",
        description: "管理員核准後即可使用這組帳號密碼登入。",
      });
      setView("login");
      setDisplayName("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      const serviceRestricted = isSupabaseServiceRestrictedError(error);
      toast({
        title: "註冊服務暫時無法使用",
        description: serviceRestricted ? SUPABASE_EGRESS_RESTRICTION_MESSAGE : "請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07101e] px-4 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(61,139,214,0.22),transparent_30%),radial-gradient(circle_at_85%_86%,rgba(45,196,185,0.13),transparent_28%),linear-gradient(145deg,#07101e,#0b1728_55%,#07111f)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(125,211,252,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,.12)_1px,transparent_1px)] [background-size:44px_44px]" />

      <Card className="relative w-full max-w-[460px] overflow-hidden border-cyan-200/15 bg-[#101c2f]/95 text-slate-100 shadow-[0_35px_100px_-45px_rgba(56,189,248,0.5)] backdrop-blur-xl">
        <CardHeader className="space-y-4 border-b border-white/8 pb-5 text-center">
          <PlatformLogoMark className="mx-auto text-cyan-100" size="lg" />
          <div className="space-y-2">
            <CardTitle className="text-2xl font-black tracking-[-0.03em]">工作整合平台</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-400">
              {view === "login" ? "使用已核准的帳號登入工作區。" : "填寫正確姓名並建立帳號，送出後由管理員核准。"}
            </CardDescription>
          </div>
          <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-[#081424] p-1">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchView(item)}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors",
                  view === item ? "bg-cyan-300 text-[#071421]" : "text-slate-400 hover:text-white",
                )}
              >
                {item === "login" ? <KeyRound className="h-4 w-4" /> : <UserRoundPlus className="h-4 w-4" />}
                {item === "login" ? "登入" : "註冊帳號"}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-6">
          {reauthRequired || requiresRealtimeUpgrade ? (
            <div role="status" className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              登入身分已更新，重新驗證後即可恢復完整功能，並讓在線成員同步正確。
            </div>
          ) : null}
          {isServiceRestricted ? (
            <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
              {SUPABASE_EGRESS_RESTRICTION_MESSAGE}
            </div>
          ) : null}

          <form onSubmit={view === "login" ? handleLogin : handleRegister} className="space-y-4">
            {view === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="display-name">正確姓名</Label>
                <Input id="display-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="請填寫本人姓名" required maxLength={100} className="border-white/12 bg-[#0a1627]" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="username">帳號</Label>
              <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="請輸入帳號" required maxLength={50} className="border-white/12 bg-[#0a1627]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              {view === "login" ? (
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="請輸入密碼" required minLength={6} maxLength={200} className="border-white/12 bg-[#0a1627]" />
              ) : (
                <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="請輸入密碼" required minLength={6} maxLength={200} className="border-white/12 bg-[#0a1627]" />
              )}
            </div>
            {view === "register" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">再次輸入密碼</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次輸入相同密碼" required minLength={6} maxLength={200} className="border-white/12 bg-[#0a1627]" />
                <p className="text-xs leading-5 text-slate-500">僅需至少 6 個字元，不限制大小寫、數字或符號組合。</p>
              </div>
            ) : null}
            <Button type="submit" className="h-11 w-full bg-cyan-300 text-base font-black text-[#071421] hover:bg-cyan-200" disabled={isLoading}>
              {isLoading ? "處理中..." : view === "login" ? "登入工作平台" : "送出註冊申請"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
