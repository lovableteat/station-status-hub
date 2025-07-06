import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LoginPageProps {
  onLogin: (username: string, role: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use secure authentication function with password hashing
      const { data, error } = await (supabase as any)
        .rpc('authenticate_user', {
          username_input: username,
          password_input: password
        });

      if (error) {
        console.error('Authentication error:', error);
        toast({
          title: "登入失敗",
          description: "系統錯誤，請稍後再試",
          variant: "destructive"
        });
      } else if (data && Array.isArray(data) && data.length > 0 && data[0].success) {
        const user = data[0];
        onLogin(user.username, user.role);
        toast({
          title: "登入成功",
          description: `歡迎回來，${user.role === 'super_admin' ? '超級管理員' : user.role === 'admin' ? '管理員' : '工程師'}`
        });
      } else {
        toast({
          title: "登入失敗",
          description: "帳號或密碼錯誤",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "登入失敗",
        description: "系統錯誤，請稍後再試",
        variant: "destructive"
      });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">測試管理系統</CardTitle>
          <CardDescription>請登入您的帳號</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "登入中..." : "登入"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}