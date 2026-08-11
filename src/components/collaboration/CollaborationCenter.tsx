import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronUp,
  Inbox,
  LoaderCircle,
  Megaphone,
  MessageSquareText,
  Minus,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUser } from "@/components/auth/UserContext";
import { useUserPresence, type OnlineUser } from "@/hooks/useUserPresence";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { DirectMessagesPanel } from "./DirectMessagesPanel";

type CollaborationTab = "notifications" | "online";
type NotificationFilter = "all" | "unread" | "read";
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

type CollaborationDirectoryMember = {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
};

type CollaborationMember = {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  onlineUser?: OnlineUser;
};

const moduleLabels: Record<string, string> = {
  dashboard: "系統儀表板",
  "test-tracker": "L10 測試追蹤",
  "flow-info": "L10 流程設定",
  monitor: "生產監控牆",
  issues: "問題追蹤",
  tools: "工具與資產",
  "test-plan": "資料儲存",
  users: "後台管理",
  "api-management": "API 管理",
  "material-requests": "料號申請",
  "data-center": "Data-center",
  "pcb-designer": "PCB Designer",
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

function DirectMessageLauncher({
  unreadCount,
  onOpen,
}: {
  unreadCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`聊天室${unreadCount > 0 ? `，${unreadCount} 則未讀` : ""}`}
      aria-expanded={false}
      aria-controls="direct-messages-panel"
      onClick={onOpen}
      className="flex h-11 w-full items-center justify-between rounded-t-xl border border-b-0 border-slate-500/45 bg-[#1a3552] px-3.5 text-slate-50 shadow-[0_-8px_28px_-16px_rgba(0,0,0,0.85)] transition-colors hover:bg-[#214463] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <span className="flex items-center gap-2.5 text-sm font-semibold">
        <MessageSquareText className="h-4 w-4 text-cyan-200" />
        聊天室
      </span>
      <span className="flex items-center gap-2">
        {unreadCount > 0 ? (
          <span className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_14px_rgba(244,63,94,0.65)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
        <ChevronUp className="h-4 w-4 text-slate-300" />
      </span>
    </button>
  );
}

function MemberCard({
  member,
  currentUserId,
  onMessage,
}: {
  member: CollaborationMember;
  currentUserId?: string;
  onMessage?: () => void;
}) {
  const { onlineUser } = member;
  const isCurrentAccount = member.userId === currentUserId;
  const isOnline = Boolean(onlineUser);
  const sessionCount = Math.max(1, onlineUser?.sessionCount || 1);
  const memberName = member.displayName || member.username;
  return (
    <div className="rounded-2xl border border-sky-300/15 bg-[#0b1b2d] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 font-bold text-cyan-100">
          {memberName.slice(0, 2).toUpperCase()}
          <span className={cn(
            "absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b1b2d]",
            isOnline ? "bg-emerald-400" : "bg-slate-500",
          )} />
        </div>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-slate-50">{memberName}</span>
              {isCurrentAccount && <Badge className="bg-cyan-300/15 text-cyan-100">您</Badge>}
              <Badge className={cn(
                "border px-2",
                !isOnline
                  ? "border-slate-500/40 bg-slate-500/10 text-slate-300"
                  : sessionCount > 1
                    ? "border-amber-200/25 bg-amber-300/15 text-amber-100"
                    : "border-emerald-200/20 bg-emerald-300/10 text-emerald-100",
              )}>
                {!isOnline ? "離線" : sessionCount > 1 ? `同帳號 ${sessionCount} 個連線` : "1 個連線"}
              </Badge>
              {onlineUser?.isEditing && <Badge className="bg-amber-300/15 text-amber-100">編輯中</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              <span>{roleLabels[member.role] || member.role}</span>
              <span aria-hidden="true">•</span>
              <span>{isOnline ? moduleLabels[onlineUser?.currentModule || "dashboard"] || onlineUser?.currentModule : "目前離線"}</span>
            </div>
          </div>
          {onMessage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMessage}
              aria-label={`私訊 ${memberName}`}
              title={`私訊 ${memberName}`}
              className="h-8 shrink-0 rounded-lg px-2.5 text-cyan-200 hover:bg-cyan-300/10 hover:text-cyan-100"
            >
              <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />私訊
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CollaborationCenter() {
  const { user, isRealtimeAuthenticated } = useUser();
  const {
    onlineAccounts,
    onlineUsers,
    totalOnlineSessions,
    connectionState,
    connectionStatus,
    retryPresence,
  } = useUserPresence();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CollaborationTab>("notifications");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState<NotificationRow | null>(null);
  const [acknowledgingAnnouncement, setAcknowledgingAnnouncement] = useState(false);
  const [messageRecipientId, setMessageRecipientId] = useState<string | null>(null);
  const [messageFloatOpen, setMessageFloatOpen] = useState(false);
  const [directMessageUnreadCount, setDirectMessageUnreadCount] = useState(0);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [memberQuery, setMemberQuery] = useState("");
  const [directoryMembers, setDirectoryMembers] = useState<CollaborationDirectoryMember[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
  const [clearingRead, setClearingRead] = useState(false);
  const autoAnnouncementShownRef = useRef(false);

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

  const loadMemberDirectory = useCallback(async () => {
    if (!user?.userId || !isRealtimeAuthenticated) {
      setDirectoryMembers([]);
      setDirectoryError(null);
      return;
    }

    setDirectoryLoading(true);
    setDirectoryError(null);
    const { data, error: queryError } = await supabase.rpc("list_active_collaboration_members");
    if (queryError) {
      setDirectoryMembers([]);
      setDirectoryError("帳號目錄載入失敗，請重新登入後再試一次。");
    } else {
      setDirectoryMembers((data || []) as CollaborationDirectoryMember[]);
    }
    setDirectoryLoading(false);
  }, [isRealtimeAuthenticated, user?.userId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    void loadMemberDirectory();
  }, [loadMemberDirectory]);

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
  const unreadAnnouncementCount = useMemo(
    () => notifications.filter(
      (notification) => !notification.is_read && notification.notification_type === "admin_announcement",
    ).length,
    [notifications],
  );
  const readCount = notifications.length - unreadCount;
  const filteredNotifications = useMemo(
    () => notifications.filter((notification) => (
      notificationFilter === "all" ||
      (notificationFilter === "read" ? notification.is_read : !notification.is_read)
    )),
    [notificationFilter, notifications],
  );
  const collaborationMembers = useMemo(() => {
    const onlineById = new Map(onlineAccounts.map((onlineUser) => [onlineUser.userId, onlineUser]));
    return directoryMembers
      .map((member) => ({
        userId: member.user_id,
        username: member.username,
        displayName: member.display_name || member.username,
        role: member.role,
        onlineUser: onlineById.get(member.user_id),
      }))
      .sort((left, right) => {
        if (left.userId === user?.userId) return -1;
        if (right.userId === user?.userId) return 1;
        if (Boolean(left.onlineUser) !== Boolean(right.onlineUser)) return left.onlineUser ? -1 : 1;
        return left.displayName.localeCompare(right.displayName, "zh-TW");
      });
  }, [directoryMembers, onlineAccounts, user?.userId]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase("zh-TW");
    if (!query) return collaborationMembers;
    return collaborationMembers.filter((member) => {
      const moduleLabel = member.onlineUser
        ? moduleLabels[member.onlineUser.currentModule || "dashboard"] || member.onlineUser.currentModule || ""
        : "離線";
      return [member.displayName, member.username, roleLabels[member.role], moduleLabel]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("zh-TW").includes(query));
    });
  }, [collaborationMembers, memberQuery]);

  useEffect(() => {
    if (loading || autoAnnouncementShownRef.current) return;
    const announcement = notifications.find(
      (notification) => !notification.is_read && notification.notification_type === "admin_announcement",
    );
    if (!announcement) return;
    autoAnnouncementShownRef.current = true;
    setActiveAnnouncement(announcement);
  }, [loading, notifications]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("collaboration-unread-change", { detail: { count: unreadCount } }));
  }, [unreadCount]);

  const markAsRead = async (notification: NotificationRow) => {
    if (notification.is_read) return true;
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
    const { error: updateError } = await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notification.id);
    if (updateError) {
      await loadNotifications();
      setError("通知已讀狀態儲存失敗，請稍後再試。");
      return false;
    }
    return true;
  };

  const acknowledgeAnnouncement = async () => {
    if (!activeAnnouncement || acknowledgingAnnouncement) return;
    setAcknowledgingAnnouncement(true);
    const saved = await markAsRead(activeAnnouncement);
    setAcknowledgingAnnouncement(false);
    if (saved) setActiveAnnouncement(null);
  };

  const openAnnouncementInCenter = () => {
    setActiveAnnouncement(null);
    setActiveTab("notifications");
    setOpen(true);
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

  const dismissNotification = async (notification: NotificationRow) => {
    if (!notification.is_read || deletingNotificationId) return;
    setDeletingNotificationId(notification.id);
    setError(null);
    const { data, error: dismissError } = await supabase.rpc("dismiss_user_notification", {
      p_notification_id: notification.id,
    });
    setDeletingNotificationId(null);
    if (dismissError || !data) {
      setError("通知刪除失敗，請稍後再試。");
      return;
    }
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
  };

  const clearReadNotifications = async () => {
    if (readCount === 0 || clearingRead) return;
    setClearingRead(true);
    setError(null);
    const { error: dismissError } = await supabase.rpc("dismiss_read_user_notifications");
    setClearingRead(false);
    if (dismissError) {
      setError("已讀通知清除失敗，請稍後再試。");
      return;
    }
    setNotifications((current) => current.filter((item) => !item.is_read));
    if (notificationFilter === "read") setNotificationFilter("all");
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

  return (
    <>
      <Dialog
        open={Boolean(activeAnnouncement)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !acknowledgingAnnouncement) setActiveAnnouncement(null);
        }}
      >
        <DialogContent className="z-[100] max-w-[min(92vw,620px)] overflow-hidden border-cyan-200/30 bg-[#071523] p-0 text-slate-100 shadow-[0_36px_120px_-28px_rgba(34,211,238,0.6)]">
          <DialogHeader className="border-b border-cyan-200/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.2),transparent_48%),linear-gradient(135deg,#10263a,#0b1b2d)] px-6 py-5 text-left">
            <div className="mb-3 flex items-center justify-between gap-3 pr-7">
              <Badge className="gap-1.5 border border-amber-200/30 bg-amber-300/15 text-amber-100">
                <Megaphone className="h-3.5 w-3.5" />重要公告
              </Badge>
              {unreadAnnouncementCount > 1 && (
                <span className="text-xs font-medium text-cyan-100">尚有 {unreadAnnouncementCount} 則未讀公告</span>
              )}
            </div>
            <DialogTitle className="text-balance text-2xl font-black leading-tight text-white">
              {activeAnnouncement?.title}
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm text-slate-400">
              發布於 {activeAnnouncement ? new Date(activeAnnouncement.created_at).toLocaleString("zh-TW") : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-6">
            <p className="whitespace-pre-wrap text-base leading-8 text-slate-200">{activeAnnouncement?.message}</p>
          </div>
          <DialogFooter className="gap-2 border-t border-cyan-200/10 bg-[#091827] px-6 py-4 sm:justify-between">
            <Button variant="ghost" onClick={openAnnouncementInCenter} className="text-slate-300 hover:bg-white/10 hover:text-white">
              前往協作中心
            </Button>
            <Button
              onClick={() => void acknowledgeAnnouncement()}
              disabled={acknowledgingAnnouncement}
              className="bg-cyan-300 font-bold text-[#06111f] shadow-[0_12px_28px_-14px_rgba(34,211,238,0.9)] hover:bg-cyan-200"
            >
              {acknowledgingAnnouncement && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              我知道了，標為已讀
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {open && (
        <>
          <button
            type="button"
            aria-label="關閉協作中心"
            className="fixed inset-0 z-[78] bg-black/45 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <aside
            aria-label="全站協作中心"
            data-collaboration-center="true"
            className="fixed inset-x-2 bottom-2 top-20 z-[79] flex flex-col overflow-hidden rounded-[22px] border border-cyan-200/25 bg-[#06111f] shadow-[0_30px_100px_-30px_rgba(34,211,238,0.45)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[76px] sm:h-[min(640px,calc(100dvh-92px))] sm:w-[500px]"
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

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CollaborationTab)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-4 grid h-11 shrink-0 grid-cols-2 rounded-xl border border-cyan-200/15 bg-[#091827] p-1">
            <TabsTrigger value="notifications" className="gap-2 rounded-lg data-[state=active]:bg-cyan-300 data-[state=active]:font-bold data-[state=active]:text-[#06111f]">
              <Bell className="h-4 w-4" />通知
              {unreadCount > 0 && <Badge className="h-5 min-w-5 bg-rose-500 px-1.5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-2 rounded-lg data-[state=active]:bg-cyan-300 data-[state=active]:font-bold data-[state=active]:text-[#06111f]">
              <Users className="h-4 w-4" />在線成員
              <span className="font-mono text-xs">{totalOnlineSessions}</span>
            </TabsTrigger>
          </TabsList>

          <div data-collaboration-content-frame="true" className="relative mt-3 min-h-0 flex-1 overflow-hidden border-t border-cyan-200/10">
          <TabsContent value="notifications" className="absolute inset-0 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
            <div className="space-y-3 border-b border-cyan-200/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-400">共 {notifications.length} 則 · {unreadCount} 則未讀</div>
                <div className="flex flex-wrap gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => void loadNotifications()} disabled={loading} className="rounded-lg text-slate-300">
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />重新載入
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void markAllAsRead()} disabled={unreadCount === 0} className="rounded-lg text-cyan-200">
                  <CheckCheck className="mr-1.5 h-3.5 w-3.5" />全部標為已讀
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void clearReadNotifications()} disabled={readCount === 0 || clearingRead} className="rounded-lg text-slate-300 hover:bg-rose-300/10 hover:text-rose-200">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />清除全部已讀
                </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-cyan-200/10 bg-[#071522] p-1" aria-label="通知篩選">
                {(["all", "unread", "read"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setNotificationFilter(filter)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", notificationFilter === filter ? "bg-cyan-300 text-[#06111f]" : "text-slate-400 hover:bg-cyan-300/10 hover:text-cyan-100")}
                  >
                    {filter === "all" ? `全部 ${notifications.length}` : filter === "unread" ? `未讀 ${unreadCount}` : `已讀 ${readCount}`}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              {loading && notifications.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-slate-400"><LoaderCircle className="mb-3 h-8 w-8 animate-spin text-cyan-300" />正在同步通知</div>
              ) : error ? (
                <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/5 p-6 text-center">
                  <AlertCircle className="mb-3 h-8 w-8 text-rose-300" /><p className="text-sm text-rose-100">{error}</p><Button onClick={() => void loadNotifications()} className="mt-4">重試</Button>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-center text-slate-500">
                  <Inbox className="mb-3 h-10 w-10 opacity-40" /><p className="font-semibold text-slate-300">此分類目前沒有通知</p><p className="mt-1 text-sm">新公告與工作通知會即時顯示，不會刷新頁面。</p>
                </div>
              ) : (
                <div className="space-y-2.5 pb-3">
                  {filteredNotifications.map((notification) => (
                    <article key={notification.id} className={cn("rounded-2xl border p-4 transition-colors", notification.is_read ? "border-slate-700/65 bg-[#0b1b2d] hover:border-cyan-300/30" : "border-cyan-300/40 bg-cyan-300/[0.08] hover:border-cyan-200/65")}>
                      <button type="button" onClick={() => void openNotification(notification)} className="w-full text-left">
                        <div className="flex items-start gap-3">
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", notification.is_read ? "bg-slate-600" : "bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.8)]")} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-50">{notification.title}</span><span className="shrink-0 text-xs text-slate-500">{formatTime(notification.created_at)}</span></span>
                          <span className="mt-1.5 line-clamp-3 block text-sm leading-6 text-slate-300">{notification.message}</span>
                        </span>
                        </div>
                      </button>
                      <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                        <span className="text-xs text-slate-500">{notification.is_read ? "已讀後可刪除" : "點開內容後會標為已讀"}</span>
                        {notification.is_read ? (
                          <Button variant="ghost" size="sm" onClick={() => void dismissNotification(notification)} disabled={deletingNotificationId === notification.id} className="h-8 rounded-lg text-slate-400 hover:bg-rose-300/10 hover:text-rose-200">
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />刪除
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => void markAsRead(notification)} className="h-8 rounded-lg text-cyan-200 hover:bg-cyan-300/10">
                            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />標為已讀
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="online" className="absolute inset-0 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
            <div className="space-y-3 border-b border-cyan-200/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-100">全站目前 {totalOnlineSessions} 個在線連線</div>
                  <div className="mt-0.5 text-xs text-slate-500">帳號目錄共 {directoryMembers.length} 位啟用同事；同帳號的分頁或裝置會合併顯示。</div>
                </div>
                <div className="flex items-center gap-2">
                <Badge className={cn("gap-1.5", connectionStatus === "online" ? "bg-emerald-300/15 text-emerald-200" : connectionState === "error" ? "bg-rose-300/15 text-rose-200" : "bg-amber-300/15 text-amber-200")}>
                  <Radio className="h-3 w-3" />
                  {connectionStatus === "online" ? "即時連線" : connectionState === "error" ? "即時功能不可用" : "重新連線中"}
                </Badge>
                {connectionState === "error" && user ? (
                  <Button variant="ghost" size="sm" onClick={retryPresence} className="h-7 px-2 text-xs text-cyan-200">重試</Button>
                ) : null}
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/55" />
                <Input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="搜尋姓名、帳號、角色、頁面或離線狀態" className="h-10 border-cyan-200/15 bg-[#071522] pl-9 text-slate-100" />
              </div>
              {directoryError ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                  <span>{directoryError}</span>
                  <Button variant="ghost" size="sm" onClick={() => void loadMemberDirectory()} className="h-7 shrink-0 px-2 text-rose-100 hover:bg-rose-300/15">重試</Button>
                </div>
              ) : null}
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-3">
              {directoryLoading ? (
                <div className="flex h-56 flex-col items-center justify-center px-8 text-center text-slate-500"><LoaderCircle className="mb-3 h-9 w-9 animate-spin text-cyan-200/60" /><p className="font-semibold text-slate-300">正在載入可私訊的帳號</p><p className="mt-1 text-sm">在線狀態會在不重整頁面的情況下持續更新。</p></div>
              ) : directoryError ? (
                <div className="flex h-56 flex-col items-center justify-center px-8 text-center text-slate-500"><AlertCircle className="mb-3 h-10 w-10 text-rose-200/60" /><p className="font-semibold text-slate-300">帳號目錄暫時無法使用</p><p className="mt-1 text-sm">請重新登入後重試，系統不會用假資料取代目錄。</p></div>
              ) : collaborationMembers.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center px-8 text-center text-slate-500"><Users className="mb-3 h-10 w-10 opacity-40" /><p className="font-semibold text-slate-300">尚未找到啟用帳號</p><p className="mt-1 text-sm">請由管理員確認帳號已啟用。</p></div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center text-center text-slate-500"><Search className="mb-3 h-8 w-8 opacity-45" /><p className="font-semibold text-slate-300">找不到符合的帳號</p><p className="mt-1 text-sm">可改用姓名、帳號、角色、頁面或離線狀態搜尋。</p></div>
              ) : (
                <div className="space-y-2.5 pb-3">{filteredMembers.map((member) => <MemberCard key={member.userId} member={member} currentUserId={user?.userId} onMessage={member.userId === user?.userId ? undefined : () => { setMessageRecipientId(member.userId); setMessageFloatOpen(true); setOpen(false); }} />)}</div>
              )}
            </ScrollArea>
          </TabsContent>
          </div>
        </Tabs>
          </aside>
        </>
      )}

      {isRealtimeAuthenticated ? (
        <div className="fixed bottom-0 right-0 z-[84] w-[min(360px,100vw)] max-w-full">
          <section
            id="direct-messages-panel"
            aria-hidden={!messageFloatOpen}
            aria-label="聊天室"
            data-floating-direct-messages="true"
            className={cn(
              "absolute bottom-0 right-0 flex h-[min(620px,calc(100dvh-5rem))] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-500/40 bg-[#071421] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.9)] transition-[opacity,transform,visibility] duration-200",
              messageFloatOpen
                ? "visible translate-y-0 opacity-100"
                : "invisible pointer-events-none translate-y-2 opacity-0",
            )}
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-500/30 bg-[#18304a] px-3.5 text-slate-50">
              <div className="flex min-w-0 items-center gap-2.5">
                <MessageSquareText className="h-4 w-4 shrink-0 text-cyan-200" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">聊天室</div>
                  <p className="truncate text-[11px] text-slate-300">選擇聯絡人開始私訊</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMessageFloatOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="最小化聊天室"
              >
                <Minus className="h-4 w-4" />
              </button>
            </header>
            <DirectMessagesPanel
              onlineUsers={onlineUsers}
              requestedUserId={messageRecipientId}
              onRequestHandled={() => setMessageRecipientId(null)}
              onUnreadCountChange={setDirectMessageUnreadCount}
            />
          </section>
          {!messageFloatOpen ? (
            <DirectMessageLauncher
              unreadCount={directMessageUnreadCount}
              onOpen={() => setMessageFloatOpen(true)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
