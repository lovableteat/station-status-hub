import { Users, Circle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";

const moduleLabels: Record<string, string> = {
  dashboard: "儀表板",
  "test-tracker": "測試追蹤",
  "flow-info": "流程資訊",
  monitor: "生產監控",
  issues: "問題追蹤",
  data: "資料中心",
  tools: "工具管理",
  users: "用戶管理"
};

const roleColors: Record<string, string> = {
  admin: "bg-red-500",
  engineer: "bg-blue-500",
  manager: "bg-green-500",
  tester: "bg-yellow-500"
};

export function OnlineUsersIndicator() {
  const { onlineUsers, totalOnlineUsers } = useUserPresence();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all duration-300",
          "bg-primary/10 border border-primary/20 backdrop-blur-sm hover:bg-primary/20",
          "animate-fade-in"
        )}>
          <div className="relative">
            <Users className="h-4 w-4 text-primary" />
            <Circle className="absolute -top-1 -right-1 h-3 w-3 fill-green-500 text-green-500" />
          </div>
          <span className="text-sm font-medium text-primary">
            {totalOnlineUsers} 在線
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">在線用戶 ({totalOnlineUsers})</h4>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {onlineUsers.map((user) => (
              <Card key={user.userId} className="p-2">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {user.displayName?.charAt(0) || user.username.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                          roleColors[user.role] || "bg-gray-500"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{user.displayName || user.username}</div>
                        <div className="text-xs text-muted-foreground">
                          {moduleLabels[user.currentModule || 'dashboard'] || user.currentModule}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                      {user.isEditing && (
                        <Badge variant="secondary" className="text-xs">
                          編輯中
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {onlineUsers.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-4">
                目前只有您在線上
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}