import { useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";

export function LoginPage() {
  const { authenticate, requiresRealtimeUpgrade, user } = useUser();
  const [username, setUsername] = useState(() => user?.username ?? "");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isServiceRestricted, setIsServiceRestricted] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const result = await authenticate(username, password);
      if (!result) {
        setIsServiceRestricted(false);
        toast({
          title: "登入失敗",
          description: "帳號或密碼錯誤，請重新確認。",
          variant: "destructive",
        });
      } else {
        setIsServiceRestricted(false);
        toast({
          title: "登入成功",
          description:
            result.mode === "authenticated"
              ? `歡迎回來，${result.user.displayName}`
              : `歡迎回來，${result.user.displayName}。即時協作將在服務升級完成後啟用。`,
        });
      }
    } catch (error) {
      console.error("Login error:", error);
      const serviceRestricted = isSupabaseServiceRestrictedError(error);
      setIsServiceRestricted(serviceRestricted);
      toast({
        title: serviceRestricted ? "系統服務暫時中斷" : "登入失敗",
        description: serviceRestricted
          ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
          : "登入服務目前無法回應，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_28%),radial-gradient(circle_at_bottom_right,hsl(188_92%_58%/0.08),transparent_24%)]" />

      <Card className="relative w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-primary/20 bg-primary/10 text-primary shadow-[0_20px_40px_-26px_hsl(var(--primary)/0.72)]">
            <span className="text-2xl font-black tracking-[0.08em]">S</span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold sm:text-3xl">工作整合平台登入</CardTitle>
            <CardDescription className="text-sm leading-6">
              使用原有帳號與密碼登入，系統會安全升級即時協作身分。
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {requiresRealtimeUpgrade && user ? (
              <>
                已偵測到 <span className="font-semibold text-foreground">{user.displayName}</span>{" "}
                的既有帳號，重新驗證後即可恢復完整功能。也可以直接修改帳號欄位，改用其他帳號登入。
              </>
            ) : (
              "帳號、權限與現有工作資料都會保留，不需要重新註冊或重設密碼。"
            )}
          </div>

          {isServiceRestricted ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
            >
              <p className="font-bold">系統服務暫時中斷</p>
              <p className="mt-1 text-rose-100/80">{SUPABASE_EGRESS_RESTRICTION_MESSAGE}</p>
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">帳號</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="請輸入帳號"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="請輸入密碼"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <Button type="submit" className="h-11 w-full text-base" disabled={isLoading}>
              {isLoading ? "登入中..." : "登入"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
