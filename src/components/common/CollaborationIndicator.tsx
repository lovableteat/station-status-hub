import { useEffect, useState } from "react";
import { Bell, UsersRound } from "lucide-react";
import { useUserPresence } from "@/hooks/useUserPresence";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function CollaborationIndicator({ showNotifications = true, showOnlineUsers = true }: { showNotifications?: boolean; showOnlineUsers?: boolean }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { totalOnlineUsers, connectionStatus } = useUserPresence();

  useEffect(() => {
    const updateUnread = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count ?? 0);
      setUnreadCount(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    };
    window.addEventListener("collaboration-unread-change", updateUnread);
    window.dispatchEvent(new Event("collaboration-unread-request"));
    return () => window.removeEventListener("collaboration-unread-change", updateUnread);
  }, []);

  const openPanel = (tab: "notifications" | "online") => window.dispatchEvent(new CustomEvent("open-global-collaboration", { detail: { tab } }));
  const onlineLabel = connectionStatus === "online" ? `${totalOnlineUsers} 人在線` : connectionStatus === "connecting" ? "連線中" : "連線已中斷";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="platform-collaboration-trigger relative" aria-label={`通知與線上人員${showNotifications && unreadCount > 0 ? `，${unreadCount} 則未讀` : ""}`} title="通知與線上人員" data-collaboration-entry="combined">
          <UsersRound data-icon="inline-start" />
          <span className="hidden xl:inline">協作</span>
          {showNotifications && unreadCount > 0 ? <span className="platform-unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : showOnlineUsers ? <span className={`platform-presence-dot platform-presence-dot--${connectionStatus}`} aria-hidden="true" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="platform-collaboration-menu">
        {showNotifications && <DropdownMenuItem onSelect={() => openPanel("notifications")}><Bell /><span>通知</span><span className="ml-auto text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} 則未讀` : "沒有未讀"}</span></DropdownMenuItem>}
        {showOnlineUsers && <DropdownMenuItem onSelect={() => openPanel("online")}><UsersRound /><span>線上人員</span><span className="ml-auto text-xs text-muted-foreground">{onlineLabel}</span></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
