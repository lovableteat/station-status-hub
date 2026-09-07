import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

export function NotificationIndicator() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const updateUnreadCount = (event: Event) => {
      const count = Number(
        (event as CustomEvent<{ count?: number }>).detail?.count ?? 0,
      );
      setUnreadCount(Number.isFinite(count) ? Math.max(0, count) : 0);
    };
    window.addEventListener("collaboration-unread-change", updateUnreadCount);
    return () =>
      window.removeEventListener(
        "collaboration-unread-change",
        updateUnreadCount,
      );
  }, []);

  const openNotifications = () => {
    window.dispatchEvent(
      new CustomEvent("open-global-collaboration", {
        detail: { tab: "notifications" },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={openNotifications}
      aria-label={`開啟通知${unreadCount > 0 ? `，${unreadCount} 則未讀` : ""}`}
      title="通知"
      className="interactive-lift relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/30 bg-amber-300/10 text-amber-100 transition-all duration-200 hover:border-amber-200/55 hover:bg-amber-300/20 sm:h-12 sm:w-12 sm:rounded-2xl"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#101a2d] bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-lg">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
