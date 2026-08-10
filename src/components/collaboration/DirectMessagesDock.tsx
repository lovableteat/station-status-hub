import { useCallback, useEffect, useState } from "react";
import { ChevronUp, MessageCircle, Minus } from "lucide-react";

import { useUserPresence } from "@/hooks/useUserPresence";
import { cn } from "@/lib/utils";
import { DirectMessagesPanel } from "./DirectMessagesPanel";

type OpenDirectMessagesDetail = {
  recipientId?: string;
};

const PANEL_ID = "direct-messages-panel";

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
    <div className="fixed bottom-0 right-3 z-50 w-[min(340px,calc(100vw-1.5rem))] sm:right-5">
      <section
        id={PANEL_ID}
        aria-hidden={!isOpen}
        aria-label="聊天室"
        className={cn(
          "absolute bottom-11 right-0 flex h-[min(620px,calc(100dvh-5rem))] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-500/40 bg-[#071421] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.9)] transition-[opacity,transform,visibility] duration-200",
          isOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-500/30 bg-[#18304a] px-3.5 text-slate-50">
          <div className="flex min-w-0 items-center gap-2.5">
            <MessageCircle className="h-4 w-4 shrink-0 text-cyan-200" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">聊天室</div>
              <p className="truncate text-[11px] text-slate-300">選擇聯絡人開始私訊</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="最小化聊天室"
          >
            <Minus className="h-4 w-4" />
          </button>
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
        aria-label={`聊天室${unreadCount > 0 ? `，${unreadCount} 則未讀` : ""}`}
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-t-xl border border-b-0 border-slate-500/45 bg-[#1a3552] px-3.5 text-slate-50 shadow-[0_-8px_28px_-16px_rgba(0,0,0,0.85)] transition-colors hover:bg-[#214463]",
          isOpen && "border-cyan-200/35 bg-[#214463]",
        )}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-cyan-200" />
          聊天室
        </span>
        <span className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <span className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-5 text-white shadow-[0_0_14px_rgba(244,63,94,0.65)]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
          {isOpen ? (
            <Minus className="h-4 w-4 text-slate-300" />
          ) : (
            <ChevronUp className="h-4 w-4 text-slate-300" />
          )}
        </span>
      </button>
    </div>
  );
}
