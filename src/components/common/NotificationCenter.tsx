import { useState } from "react";
import { Users, Circle, Bell, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useToast } from "@/hooks/use-toast";
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

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "notifications">("users");
  const { onlineUsers, totalOnlineUsers } = useUserPresence();
  const { toasts } = useToast();

  const recentNotifications = toasts.slice(-5); // 顯示最近5個通知

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* 通知中心按鈕 */}
      {!isOpen && (
        <div className="flex gap-2">
          {/* 在線用戶指示器 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("users");
              setIsOpen(true);
            }}
            className="bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
          >
            <div className="relative">
              <Users className="h-4 w-4 text-primary" />
              <Circle className="absolute -top-1 -right-1 h-3 w-3 fill-green-500 text-green-500" />
            </div>
            <span className="ml-2 text-sm font-medium">{totalOnlineUsers}</span>
          </Button>

          {/* 通知指示器 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTab("notifications");
              setIsOpen(true);
            }}
            className="bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary/10"
          >
            <div className="relative">
              <Bell className="h-4 w-4 text-primary" />
              {recentNotifications.length > 0 && (
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                  {recentNotifications.length > 9 ? "9+" : recentNotifications.length}
                </div>
              )}
            </div>
          </Button>
        </div>
      )}

      {/* 通知中心面板 */}
      {isOpen && (
        <Card className="w-80 max-h-96 bg-background/95 backdrop-blur-sm border-primary/20 shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === "users" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("users")}
                  className="h-8"
                >
                  <Users className="h-4 w-4 mr-1" />
                  在線 ({totalOnlineUsers})
                </Button>
                <Button
                  variant={activeTab === "notifications" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("notifications")}
                  className="h-8"
                >
                  <Bell className="h-4 w-4 mr-1" />
                  通知
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto">
              {activeTab === "users" && (
                <div className="p-3 space-y-2">
                  {onlineUsers.map((user) => (
                    <div key={user.userId} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
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
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{user.displayName || user.username}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {moduleLabels[user.currentModule || 'dashboard'] || user.currentModule}
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
                  ))}
                  
                  {onlineUsers.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      目前只有您在線上
                    </div>
                  )}
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="p-3 space-y-2">
                  {recentNotifications.length > 0 ? (
                    recentNotifications.map((notification, index) => (
                      <div key={index} className="p-2 rounded-lg border bg-muted/30">
                        <div className="text-sm font-medium">{notification.title}</div>
                        {notification.description && (
                          <div className="text-xs text-muted-foreground mt-1">{notification.description}</div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      暫無新通知
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}