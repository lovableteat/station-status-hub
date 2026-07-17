import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "@/integrations/supabase/serviceErrors";

interface LoginPageProps {
  onLogin: (userId: string, username: string, role: string, displayName: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isServiceRestricted, setIsServiceRestricted] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.rpc("authenticate_user", {
        username_input: username,
        password_input: password,
      });

      if (error) {
        console.error("Authentication error:", error);
        const serviceRestricted = isSupabaseServiceRestrictedError(error);
        setIsServiceRestricted(serviceRestricted);
        toast({
          title: serviceRestricted ? "系統服務暫時中斷" : "登入失敗",
          description: serviceRestricted
            ? SUPABASE_EGRESS_RESTRICTION_MESSAGE
            : "系統驗證時發生錯誤，請稍後再試。",
          variant: "destructive",
        });
      } else if (!data || data.length === 0 || !data[0].success) {
        setIsServiceRestricted(false);
        toast({
          title: "登入失敗",
          description: "帳號或密碼不正確。",
          variant: "destructive",
        });
      } else {
        setIsServiceRestricted(false);
        const userInfo = data[0];
        onLogin(userInfo.user_id, userInfo.username, userInfo.role, userInfo.display_name);
        toast({
          title: "登入成功",
          description: `歡迎回來，${userInfo.display_name || userInfo.username}`,
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
          : "系統驗證時發生錯誤，請稍後再試。",
        variant: "destructive",
      });
    }

    setIsLoading(false);
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
            <CardTitle className="text-2xl font-bold sm:text-3xl">機台管理系統登入</CardTitle>
            <CardDescription className="text-sm leading-6">
              請輸入您的帳號與密碼以進入工作整合平台。
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-primary/10 bg-primary/6 px-4 py-3 text-sm leading-6 text-muted-foreground">
            保留原本登入流程與權限驗證，只優化畫面層級、閱讀舒適度與按鈕操作手感。
          </div>

          {isServiceRestricted ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100"
            >
              <p className="font-bold">資料服務目前暫停</p>
              <p className="mt-1 text-rose-100/80">{SUPABASE_EGRESS_RESTRICTION_MESSAGE}</p>
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">帳號</Label>
              <Input
                id="username"
                type="text"
                placeholder="請輸入帳號"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
