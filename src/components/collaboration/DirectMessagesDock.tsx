import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Minus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";
import { DirectMessagesPanel } from "./DirectMessagesPanel";

type OpenDirectMessagesDetail = {
  recipientId?: string;
};

export function DirectMessagesDock() {
  const { onlineUsers } = useUserPresence();
  const [isOpen, setIsOpen] = useState(false);
  const [requestedUserId, setRequestedUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleRequestHandled = useCallback(() => {
    setRequestedUserId(null);
  }, []);

  const handleUnreadCountChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    const openDirectMessages = (event: Event) => {
      const detail = (event as CustomEvent<OpenDirectMessagesDetail>).detail;
      setRequestedUserId(detail?.recipientId ?? null);
      setIsOpen(true);
    };

    window.addEventListener("open-direct-messages", openDirectMessages);
    return () => window.removeEventListener("open-direct-messages", openDirectMessages);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      <section
        aria-hidden={!isOpen}
        aria-label="私訊"
        className={cn(
          "flex h-[min(640px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-cyan-200/25 bg-[#06111f] shadow-[0_30px_100px_-30px_rgba(34,211,238,0.45)] transition-all duration-200",
          isOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-cyan-200/15 bg-[linear-gradient(120deg,#10263a,#0b1b2d)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-200/20 bg-cyan-300/10 text-cyan-200">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-slate-50">訊息</div>
              <p className="truncate text-xs text-slate-400">私訊保留在這裡，不打斷目前工作。</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="最小化私訊"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="關閉私訊"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <DirectMessagesPanel
          onlineUsers={onlineUsers}
          requestedUserId={requestedUserId}
          onRequestHandled={handleRequestHandled}
          onUnreadCountChange={handleUnreadCountChange}
        />
      </section>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`私訊${unreadCount > 0 ? `，${unreadCount} 則未讀` : ""}`}
        className="interactive-lift relative flex h-12 items-center gap-2 rounded-2xl border border-cyan-200/30 bg-[#10263a] px-4 text-cyan-50 shadow-[0_18px_36px_-20px_rgba(34,211,238,0.7)] transition-colors hover:border-cyan-200/55 hover:bg-[#153149]"
      >
        <span className="relative">
          <MessageCircle className="h-5 w-5 text-cyan-200" />
          {unreadCount > 0 ? (
            <span className="absolute -right-3 -top-3 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#10263a] bg-rose-500 px-1 text-[10px] font-bold leading-5 text-white shadow-[0_0_16px_rgba(244,63,94,0.7)]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        <span className="text-sm font-semibold">訊息</span>
      </button>
    </div>
  );
}
