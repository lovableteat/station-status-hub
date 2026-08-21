import { Circle, Users } from "lucide-react";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";

export function OnlineUsersIndicator() {
  const { totalOnlineUsers, totalOnlineSessions, connectionStatus } = useUserPresence();
  const openOnlineMembers = () => {
    window.dispatchEvent(
      new CustomEvent("open-global-collaboration", { detail: { tab: "online" } }),
    );
  };

  return (
    <button
      type="button"
      onClick={openOnlineMembers}
      aria-label={`查看在線成員，目前 ${totalOnlineSessions} 個連線、${totalOnlineUsers} 個帳號在線`}
      className={cn(
        "interactive-lift flex h-12 w-[140px] shrink-0 items-center justify-center gap-2 rounded-2xl border px-3 transition-all duration-200 max-xl:w-12 max-xl:px-0",
        "border-emerald-200/30 bg-emerald-300/10 text-emerald-100 shadow-[0_16px_28px_-24px_rgba(16,185,129,0.65)] backdrop-blur-sm hover:border-emerald-200/50 hover:bg-emerald-300/18",
      )}
    >
      <span className="relative">
        <Users className="h-4 w-4" />
        <Circle
          className={cn(
            "absolute -right-1 -top-1 h-3 w-3",
            connectionStatus === "online"
              ? "fill-emerald-400 text-emerald-400"
              : connectionStatus === "connecting"
                ? "animate-pulse fill-amber-300 text-amber-300"
                : "fill-slate-500 text-slate-500",
          )}
        />
      </span>
      <span className="truncate text-sm font-semibold max-xl:hidden">
        {connectionStatus === "connecting" ? "連線中" : `${totalOnlineSessions} 人在線`}
      </span>
    </button>
  );
}
