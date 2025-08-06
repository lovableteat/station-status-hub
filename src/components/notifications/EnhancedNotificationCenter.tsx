import React, { useState } from "react";
import { 
  Bell, 
  Settings, 
  Filter, 
  Search, 
  X, 
  Check, 
  Users, 
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  Archive,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUserPresence } from "@/hooks/useUserPresence";
import { useEnhancedNotifications, type EnhancedNotification } from "@/hooks/useEnhancedNotifications";
import { cn } from "@/lib/utils";

const priorityConfig = {
  urgent: { color: "destructive", icon: AlertTriangle, label: "緊急" },
  high: { color: "orange", icon: AlertTriangle, label: "高" },
  normal: { color: "blue", icon: Info, label: "普通" },
  low: { color: "gray", icon: Info, label: "低" }
};

const categoryConfig = {
  mention: { icon: Users, label: "標註", color: "blue" },
  system: { icon: Settings, label: "系統", color: "green" },
  task: { icon: CheckCircle, label: "任務", color: "purple" },
  issue: { icon: AlertTriangle, label: "問題", color: "red" },
  test: { icon: Check, label: "測試", color: "teal" },
  general: { icon: Info, label: "一般", color: "gray" }
};

export function EnhancedNotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"notifications" | "users" | "settings">("notifications");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  
  const { onlineUsers, totalOnlineUsers } = useUserPresence();
  const {
    notifications,
    groupedNotifications,
    stats,
    preferences,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    updatePreferences
  } = useEnhancedNotifications();

  // Filter notifications based on search and filters
  const filteredNotifications = notifications.filter(notification => {
    const matchesSearch = !searchQuery || 
      notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || notification.category === selectedCategory;
    const matchesPriority = selectedPriority === "all" || notification.priority === selectedPriority;
    
    return matchesSearch && matchesCategory && matchesPriority;
  });

  const getNotificationIcon = (notification: EnhancedNotification) => {
    const categoryIcon = categoryConfig[notification.category as keyof typeof categoryConfig]?.icon || Info;
    const priorityIcon = priorityConfig[notification.priority as keyof typeof priorityConfig]?.icon || Info;
    
    // Use priority icon for urgent/high priority, category icon otherwise
    if (notification.priority === 'urgent' || notification.priority === 'high') {
      return React.createElement(priorityIcon, { className: "h-4 w-4" });
    }
    return React.createElement(categoryIcon, { className: "h-4 w-4" });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return '剛剛';
    if (diffInMinutes < 60) return `${diffInMinutes}分鐘前`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}小時前`;
    return `${Math.floor(diffInMinutes / 1440)}天前`;
  };

  const handleNotificationClick = (notification: EnhancedNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Handle navigation based on notification type
    if (notification.action_url) {
      window.location.href = notification.action_url;
    } else if (notification.reference_type && notification.reference_id) {
      // Default navigation logic
      switch (notification.reference_type) {
        case 'issue':
          window.location.href = `/issues?openIssue=${notification.reference_id}`;
          break;
        case 'test_system':
          window.location.href = `/test-tracker?system=${notification.reference_id}`;
          break;
        default:
          break;
      }
    }
  };

  const totalNotifications = stats?.unread_notifications || 0;
  const urgentCount = stats?.urgent_priority_unread || 0;
  const highCount = stats?.high_priority_unread || 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Notification trigger buttons */}
      {!isOpen && (
        <div className="flex gap-2">
          {/* Online users button */}
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
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border border-background" />
            </div>
            <span className="ml-2 text-sm font-medium">{totalOnlineUsers}</span>
          </Button>

          {/* Notifications button */}
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
              {totalNotifications > 0 && (
                <Badge 
                  variant={urgentCount > 0 ? "destructive" : highCount > 0 ? "default" : "secondary"}
                  className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totalNotifications > 9 ? "9+" : totalNotifications}
                </Badge>
              )}
            </div>
          </Button>
        </div>
      )}

      {/* Enhanced notification center panel */}
      {isOpen && (
        <Card className="w-96 max-h-[32rem] bg-background/95 backdrop-blur-sm border-primary/20 shadow-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">通知中心</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("settings")}
                  className="h-8 w-8 p-0"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="notifications" className="text-xs">
                  通知 ({totalNotifications})
                </TabsTrigger>
                <TabsTrigger value="users" className="text-xs">
                  在線 ({totalOnlineUsers})
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">
                  設定
                </TabsTrigger>
              </TabsList>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="mt-2 space-y-2">
                {/* Search and filters */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="搜尋通知..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="類別" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有類別</SelectItem>
                        {Object.entries(categoryConfig).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedPriority} onValueChange={setSelectedPriority}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="優先級" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有優先級</SelectItem>
                        {Object.entries(priorityConfig).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {totalNotifications > 0 && (
                    <div className="flex justify-between items-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAllAsRead()}
                        className="h-7 text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        全部已讀
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        {urgentCount > 0 && <span className="text-red-500">{urgentCount} 緊急</span>}
                        {urgentCount > 0 && highCount > 0 && " • "}
                        {highCount > 0 && <span className="text-orange-500">{highCount} 高優先級</span>}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Notifications list */}
                <ScrollArea className="h-72">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-20">
                      <div className="text-sm text-muted-foreground">載入中...</div>
                    </div>
                  ) : filteredNotifications.length > 0 ? (
                    <div className="space-y-2 p-1">
                      {filteredNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                            !notification.is_read 
                              ? "bg-primary/5 border-primary/20" 
                              : "bg-muted/30 border-transparent",
                            notification.priority === 'urgent' && "border-red-200 bg-red-50",
                            notification.priority === 'high' && "border-orange-200 bg-orange-50"
                          )}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {getNotificationIcon(notification)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="font-medium text-sm truncate">
                                  {notification.title}
                                </div>
                                {!notification.is_read && (
                                  <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                                )}
                                <Badge
                                  variant={priorityConfig[notification.priority as keyof typeof priorityConfig]?.color as any || "default"}
                                  className="text-xs h-4"
                                >
                                  {priorityConfig[notification.priority as keyof typeof priorityConfig]?.label || notification.priority}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {notification.message}
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="text-xs text-muted-foreground">
                                  {formatTime(notification.created_at)}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-xs h-4">
                                    {categoryConfig[notification.category as keyof typeof categoryConfig]?.label || notification.category}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dismissNotification(notification.id);
                                    }}
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 text-center">
                      <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <div className="text-sm text-muted-foreground">
                        {searchQuery || selectedCategory !== "all" || selectedPriority !== "all" 
                          ? "沒有符合條件的通知" 
                          : "暫無新通知"
                        }
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="mt-2">
                <ScrollArea className="h-80">
                  <div className="space-y-2 p-1">
                    {onlineUsers.map((user) => (
                      <div key={user.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <div className="relative">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-medium">
                              {user.displayName?.charAt(0) || user.username.charAt(0)}
                            </span>
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {user.displayName || user.username}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {user.currentModule || 'dashboard'}
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
                      <div className="text-center text-muted-foreground text-sm py-8">
                        目前只有您在線上
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-2">
                <ScrollArea className="h-80">
                  <div className="space-y-4 p-1">
                    <div>
                      <h3 className="text-sm font-medium mb-3">通知偏好</h3>
                      <div className="space-y-3">
                        {Object.entries(categoryConfig).map(([category, config]) => {
                          const pref = preferences.find(p => p.category === category);
                          return (
                            <div key={category} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {React.createElement(config.icon, { className: "h-4 w-4" })}
                                <Label className="text-sm">{config.label}</Label>
                              </div>
                              <Switch
                                checked={pref?.enabled !== false}
                                onCheckedChange={(enabled) =>
                                  updatePreferences({
                                    category,
                                    enabled,
                                    delivery_method: ['in_app']
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-sm font-medium mb-3">統計資訊</h3>
                      {stats && (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span>總通知數:</span>
                            <span>{stats.total_notifications}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>未讀通知:</span>
                            <span>{stats.unread_notifications}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>高優先級:</span>
                            <span>{stats.high_priority_unread}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>緊急通知:</span>
                            <span>{stats.urgent_priority_unread}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNotifications({ includeRead: true })}
                        className="w-full h-8 text-xs"
                      >
                        <Archive className="h-3 w-3 mr-1" />
                        查看所有通知
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAllAsRead()}
                        className="w-full h-8 text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        全部標記已讀
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}