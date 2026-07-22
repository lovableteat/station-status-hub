import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  LoaderCircle,
  MessageSquareText,
  Radio,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/components/auth/UserContext";
import { useUserPresence, type OnlineUser } from "@/hooks/useUserPresence";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type CollaborationTab = "notifications" | "online";
type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  action_url: string | null;
  metadata: unknown;
};

const moduleLabels: Record<string, string> = {
  dashboard: "系統儀表板",
  "test-tracker": "L10 測試追蹤",
  "flow-info": "L10 流程設定",
  monitor: "生產監控牆",
  issues: "問題追蹤",
  tools: "工具與資產",
  users: "後台管理",
  "api-management": "API 管理",
  "material-requests": "料號申請",
  "data-center": "Data-center",
  "ai-chat": "資料查詢空間",
};

const roleLabels: Record<string, string> = {
  super_admin: "超級管理員",
  admin: "管理員",
  manager: "主管",
  engineer: "工程師",
  viewer: "檢視者",
};

function formatTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小時前`;
  return date.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PresenceCard({ onlineUser, currentUserId }: { onlineUser: OnlineUser; currentUserId?: string }) {
  const isCurrentUser = onlineUser.userId === currentUserId;
  return (
    <div className="rounded-2xl border border-sky-300/15 bg-[#0b1b2d] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 font-bold text-cyan-100">
          {(onlineUser.displayName || onlineUser.username).slice(0, 2).toUpperCase()}
          <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b1b2d] bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-slate-50">
              {onlineUser.displayName || onlineUser.username}
            </span>
            {isCurrentUser && <Badge className="bg-cyan-300/15 text-cyan-100">您</Badge>}
            {onlineUser.isEditing && <Badge className="bg-amber-300/15 text-amber-100">編輯中</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
            <span>{roleLabels[onlineUser.role] || onlineUser.role}</span>
            <span aria-hidden="true">•</span>
            <span>{moduleLabels[onlineUser.currentModule || "dashboard"] || onlineUser.currentModule}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CollaborationCenter() {
  const { user } = useUser();
  const { allOnlineUsers, totalOnlineUsers, connectionStatus } = useUserPresence();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CollaborationTab>("notifications");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user?.userId) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("user_notifications")
      .select("id,title,message,notification_type,is_read,created_at,reference_type,reference_id,action_url,metadata")
      .eq("recipient_id", user.userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (queryError) setError("通知載入失敗，請確認網路後重試。");
    else setNotifications((data || []) as NotificationRow[]);
    setLoading(false);
  }, [user?.userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user?.userId) return;
    const channel = supabase
      .channel(`collaboration-notifications:${user.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `recipient_id=eq.${user.userId}` },
        () => void loadNotifications(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [loadNotifications, user?.userId]);

  useEffect(() => {
    const openCenter = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: CollaborationTab }>).detail;
      setActiveTab(detail?.tab || "notifications");
      setOpen(true);
    };
    const openLegacyNotifications = () => {
      setActiveTab("notifications");
      setOpen(true);
    };
    window.addEventListener("open-global-collaboration", openCenter);
    window.addEventListener("open-global-notifications", openLegacyNotifications);
    return () => {
      window.removeEventListener("open-global-collaboration", openCenter);
      window.removeEventListener("open-global-notifications", openLegacyNotifications);
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("collaboration-unread-change", { detail: { count: unreadCount } }));
  }, [unreadCount]);

  const markAsRead = async (notification: NotificationRow) => {
    if (notification.is_read) return;
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
    const { error: updateError } = await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notification.id);
    if (updateError) void loadNotifications();
  };

  const markAllAsRead = async () => {
    if (!user?.userId || unreadCount === 0) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    const { error: updateError } = await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", user.userId)
      .eq("is_read", false)
      .is("archived_at", null);
    if (updateError) void loadNotifications();
  };

  const openNotification = async (notification: NotificationRow) => {
    await markAsRead(notification);
    const metadata = notification.metadata && typeof notification.metadata === "object"
      ? notification.metadata as Record<string, unknown>
      : {};
    const module = typeof metadata.module === "string"
      ? metadata.module
      : notification.reference_type === "issue" ? "issues" : undefined;
    if (module) {
      const params = notification.reference_id ? { openIssue: notification.reference_id } : undefined;
      window.dispatchEvent(new CustomEvent("navigate", { detail: { module, params } }));
      setOpen(false);
    } else if (notification.action_url) {
      window.location.assign(notification.action_url);
    }
  };

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="關閉協作中心"
        className="fixed inset-0 z-[78] bg-black/45 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <aside
        aria-label="全站協作中心"
        className="fixed inset-x-2 bottom-2 top-20 z-[79] flex flex-col overflow-hidden rounded-[22px] border border-cyan-200/25 bg-[#06111f] shadow-[0_30px_100px_-30px_rgba(34,211,238,0.45)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[76px] sm:h-[min(720px,calc(100dvh-92px))] sm:w-[460px]"
      >
        <header className="border-b border-cyan-200/15 bg-[linear-gradient(120deg,#10263a,#0b1b2d)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-bold text-slate-50">
                <MessageSquareText className="h-5 w-5 text-cyan-300" />
                協作中心
              </div>
              <p className="mt-1 text-sm text-slate-400">通知、公告與在線工作狀態集中在這裡。</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-xl text-slate-300 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CollaborationTab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-4 grid h-11 grid-cols-2 rounded-xl border border-cyan-200/15 bg-[#091827] p-1">
            <TabsTrigger value="notifications" className="gap-2 rounded-lg data-[state=active]:bg-sky-400 data-[state=active]:font-bold data-[state=active]:text-[#06111f]">
              <Bell className="h-4 w-4" />通知
              {unreadCount > 0 && <Badge className="h-5 min-w-5 bg-rose-500 px-1.5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-2 rounded-lg data-[state=active]:bg-emerald-300 data-[state=active]:font-bold data-[state=active]:text-[#06111f]">
              <Users className="h-4 w-4" />在線成員
              <span className="font-mono text-xs">{totalOnlineUsers}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-cyan-200/10 px-4 py-3">
              <div className="text-sm text-slate-400">{unreadCount > 0 ? `${unreadCount} 則未讀` : "已讀完所有通知"}</div>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => void loadNotifications()} disabled={loading} className="rounded-lg text-slate-300">
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />重新載入
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void markAllAsRead()} disabled={unreadCount === 0} className="rounded-lg text-cyan-200">
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />全部標為已讀
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              {loading && notifications.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-slate-400"><LoaderCircle className="mb-3 h-8 w-8 animate-spin text-cyan-300" />正在同步通知</div>
              ) : error ? (
                <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/5 p-6 text-center">
                  <AlertCircle className="mb-3 h-8 w-8 text-rose-300" /><p className="text-sm text-rose-100">{error}</p><Button onClick={() => void loadNotifications()} className="mt-4">重試</Button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-center text-slate-500">
                  <Bell className="mb-3 h-10 w-10 opacity-40" /><p className="font-semibold text-slate-300">暫無通知</p><p className="mt-1 text-sm">後台公告與工作通知會顯示在這裡。</p>
                </div>
              ) : (
                <div className="space-y-2.5 pb-3">
                  {notifications.map((notification) => (
                    <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={cn("w-full rounded-2xl border p-4 text-left transition-colors", notification.is_read ? "border-slate-700/65 bg-[#0b1b2d] hover:border-sky-300/30" : "border-sky-300/40 bg-[linear-gradient(120deg,rgba(14,116,144,0.2),rgba(11,27,45,0.94))] hover:border-sky-200/65")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", notification.is_read ? "bg-slate-600" : "bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.8)]")} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-50">{notification.title}</span><span className="shrink-0 text-xs text-slate-500">{formatTime(notification.created_at)}</span></span>
                          <span className="mt-1.5 line-clamp-3 block text-sm leading-6 text-slate-300">{notification.message}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="online" className="mt-0 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-cyan-200/10 px-4 py-3">
              <div><div className="font-semibold text-slate-100">全站目前 {totalOnlineUsers} 人在線</div><div className="mt-0.5 text-xs text-slate-500">包含您自己，跨頁面同步顯示。</div></div>
              <Badge className={cn("gap-1.5", connectionStatus === "online" ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-300/15 text-amber-200")}><Radio className="h-3 w-3" />{connectionStatus === "online" ? "即時連線" : "連線中"}</Badge>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              {allOnlineUsers.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-center text-slate-500"><Users className="mb-3 h-10 w-10 opacity-40" /><p className="font-semibold text-slate-300">目前只有您在線上</p><p className="mt-1 text-sm">連線完成後會在此顯示您的位置。</p></div>
              ) : (
                <div className="space-y-2.5 pb-3">{allOnlineUsers.map((onlineUser) => <PresenceCard key={onlineUser.userId} onlineUser={onlineUser} currentUserId={user?.userId} />)}</div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}
