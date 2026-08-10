import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Film,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { useUser } from "@/components/auth/UserContext";
import {
  CHAT_MEDIA_ACCEPT,
  formatDirectMessageFileSize,
  getDirectMessageMediaKind,
  validateDirectMessageFiles,
} from "@/components/collaboration/directMessageMedia.mjs";
import { setPendingDirectThread } from "@/components/collaboration/directMessageState.mjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OnlineUser } from "@/hooks/useUserPresence";
import {
  type DirectThread,
  useDirectMessages,
  useDirectMessageThreads,
} from "@/hooks/useDirectMessages";
import { cn } from "@/lib/utils";

interface DirectMessagesPanelProps {
  onlineUsers: OnlineUser[];
  requestedUserId: string | null;
  onRequestHandled: () => void;
  onUnreadCountChange?: (count: number) => void;
}

interface SelectedMediaFile {
  file: File;
  previewUrl: string;
  mediaKind: "image" | "video";
}

function shortTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThreadRow({
  thread,
  online,
  deleting,
  onOpen,
  onDelete,
}: {
  thread: DirectThread;
  online: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const displayName = thread.otherDisplayName || thread.otherUsername;
  const previewText = thread.lastMessageBody || "開始一段新對話";

  return (
    <div
      data-direct-thread-row="true"
      className="group relative overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,32,51,0.96),rgba(12,23,38,0.98))] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.88)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/28 hover:shadow-[0_28px_56px_-28px_rgba(34,211,238,0.28)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-4 left-0 w-px bg-gradient-to-b from-transparent via-cyan-200/35 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(59,130,246,0.12))] text-lg font-black tracking-[0.04em] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {displayName.slice(0, 2).toUpperCase()}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#132235] shadow-[0_0_0_2px_rgba(7,20,33,0.9)]",
              online ? "bg-emerald-400" : "bg-slate-500",
            )}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-black tracking-[0.01em] text-white">
                {displayName}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5",
                    online ? "bg-emerald-400/10 text-emerald-200" : "bg-slate-500/10 text-slate-400",
                  )}
                >
                  {online ? "在線上" : "離線"}
                </span>
                {thread.unreadCount > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-cyan-300/12 px-2 py-0.5 text-cyan-100">
                    {thread.unreadCount > 99 ? "99+" : thread.unreadCount} 則未讀
                  </span>
                ) : null}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-400">
              {shortTime(thread.lastMessageAt)}
            </span>
          </span>
          <span className="mt-3 block line-clamp-2 pr-2 text-sm leading-6 text-slate-300/92">
            {previewText}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`刪除與 ${displayName} 的對話`}
        title={`刪除與 ${displayName} 的對話`}
        disabled={deleting}
        onClick={onDelete}
        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-slate-500 opacity-0 transition-all duration-200 hover:border-rose-300/30 hover:bg-rose-300/10 hover:text-rose-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300/70 disabled:cursor-wait disabled:opacity-60 group-hover:opacity-100"
      >
        {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function DirectMessagesPanel({
  onlineUsers,
  requestedUserId,
  onRequestHandled,
  onUnreadCountChange,
}: DirectMessagesPanelProps) {
  const { user, isRealtimeAuthenticated } = useUser();
  const { threads, unreadCount, loading, error, reload, startDirectChat, clearDirectChat } = useDirectMessageThreads();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<SelectedMediaFile[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [deletingThreadIds, setDeletingThreadIds] = useState<Set<string>>(() => new Set());
  const deletingThreadIdsRef = useRef(new Set<string>());
  const requestedUserRef = useRef<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const selectedMediaFilesRef = useRef<SelectedMediaFile[]>([]);
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.threadId === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );
  const {
    messages,
    error: messageError,
    loading: messagesLoading,
    loadingMore,
    hasMore,
    typingUsers,
    readByOtherAt,
    loadMore,
    sendMessage,
    retryMessage,
    deleteMessage,
    sendTyping,
  } = useDirectMessages(selectedThreadId);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((onlineUser) => onlineUser.userId)),
    [onlineUsers],
  );

  useEffect(() => {
    selectedMediaFilesRef.current = selectedMediaFiles;
  }, [selectedMediaFiles]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  useEffect(() => () => {
    selectedMediaFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  useEffect(() => {
    if (!requestedUserId || requestedUserRef.current === requestedUserId) return;
    requestedUserRef.current = requestedUserId;
    const existing = threads.find((thread) => thread.otherUserId === requestedUserId);
    if (existing) {
      setSelectedThreadId(existing.threadId);
      onRequestHandled();
      return;
    }
    void startDirectChat(requestedUserId).then((threadId) => {
      if (threadId) setSelectedThreadId(threadId);
      onRequestHandled();
    });
  }, [onRequestHandled, requestedUserId, startDirectChat, threads]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedThreadId]);

  useEffect(() => {
    setSelectedMediaFiles((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setMediaError(null);
  }, [selectedThreadId]);

  const selectMediaFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const combined = [...selectedMediaFiles.map((item) => item.file), ...Array.from(files)];
    const validation = validateDirectMessageFiles(combined);
    if (validation.error) {
      setMediaError(validation.error);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      return;
    }
    const additions = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaKind: (getDirectMessageMediaKind(file) ?? "image") as "image" | "video",
    }));
    setSelectedMediaFiles((current) => [...current, ...additions]);
    setMediaError(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const removeMediaFile = (index: number) => {
    setSelectedMediaFiles((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setMediaError(null);
  };

  const submitMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && selectedMediaFiles.length === 0) || isSendingMedia) return;
    setIsSendingMedia(true);
    sendTyping(false);
    try {
      const sent = await sendMessage(body, selectedMediaFiles.map((item) => item.file));
      if (!sent) return;
      setDraft("");
      setSelectedMediaFiles((current) => {
        current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      setMediaError(null);
    } finally {
      setIsSendingMedia(false);
    }
  };

  const handleClearThread = async (thread: DirectThread) => {
    if (deletingThreadIdsRef.current.has(thread.threadId)) return;
    const displayName = thread.otherDisplayName || thread.otherUsername;
    const confirmed = window.confirm(
      `要刪除和「${displayName}」的整段對話嗎？\n\n這只會清除目前聊天列表中的顯示內容，刪除後無法復原。`,
    );
    if (!confirmed) return;
    deletingThreadIdsRef.current = setPendingDirectThread(
      deletingThreadIdsRef.current,
      thread.threadId,
      true,
    );
    setDeletingThreadIds(deletingThreadIdsRef.current);
    try {
      await clearDirectChat(thread.threadId);
    } finally {
      deletingThreadIdsRef.current = setPendingDirectThread(
        deletingThreadIdsRef.current,
        thread.threadId,
        false,
      );
      setDeletingThreadIds(deletingThreadIdsRef.current);
    }
  };

  if (!isRealtimeAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <MessageCircle className="mb-3 h-10 w-10 text-amber-200/70" />
        <p className="font-semibold text-slate-100">登入後才能使用私訊</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          請先完成帳號驗證，之後就能和線上的同事開始一對一聊天。
        </p>
      </div>
    );
  }

  if (selectedThreadId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_36%)]">
        <div className="flex items-center gap-3 border-b border-white/8 bg-[linear-gradient(180deg,rgba(11,24,38,0.98),rgba(9,19,31,0.94))] px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-2xl border border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
            onClick={() => setSelectedThreadId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black tracking-[0.01em] text-white">
              {selectedThread?.otherDisplayName || "未命名對話"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {typingUsers.length > 0 ? "對方正在輸入…" : "輸入訊息、圖片或影片，內容會即時同步。"}
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4 py-4">
          {hasMore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-auto mb-3 rounded-full border border-white/8 bg-white/[0.03] px-4 text-slate-300 hover:bg-white/[0.06]"
            >
              {loadingMore && <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />}
              載入更早訊息
            </Button>
          ) : null}
          {messagesLoading && messages.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-slate-400">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-cyan-300" />
              讀取對話中
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-slate-500">
              <MessageCircle className="mb-3 h-9 w-9 opacity-50" />
              <p className="font-semibold text-slate-300">這裡還沒有訊息</p>
              <p className="mt-1 text-sm">送出第一句話，這段對話就會開始累積紀錄。</p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((message, index) => {
                const own = message.senderId === user?.userId;
                const isLastOwn =
                  own && !messages.slice(index + 1).some((candidate) => candidate.senderId === user?.userId);
                const read =
                  isLastOwn &&
                  message.delivery === "sent" &&
                  readByOtherAt &&
                  Date.parse(readByOtherAt) >= Date.parse(message.createdAt);
                return (
                  <div key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
                    <div className="group relative max-w-[82%]">
                      <div
                        className={cn(
                          "rounded-[22px] px-4 py-3 text-sm leading-6 shadow-[0_16px_30px_-24px_rgba(0,0,0,0.72)]",
                          message.deletedAt
                            ? "border border-slate-700 bg-slate-800/70 text-slate-500 italic"
                            : own
                              ? "rounded-br-md bg-[linear-gradient(135deg,#67e8f9,#a5f3fc)] text-[#082032]"
                              : "rounded-bl-md border border-white/8 bg-[linear-gradient(180deg,rgba(17,34,55,0.98),rgba(13,26,43,0.98))] text-slate-100",
                          message.delivery === "failed" && "border border-rose-300 bg-rose-400/15 text-rose-50",
                        )}
                      >
                        {message.attachments.length > 0 ? (
                          <div
                            className={cn(
                              "grid gap-1.5",
                              message.attachments.length > 1 && "grid-cols-2",
                              message.body && "mb-2",
                            )}
                          >
                            {message.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="min-w-0 overflow-hidden rounded-xl bg-[#071522]/90"
                              >
                                {attachment.url && attachment.mediaKind === "image" ? (
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`開啟 ${attachment.fileName}`}
                                  >
                                    <img
                                      src={attachment.url}
                                      alt={attachment.fileName}
                                      loading="lazy"
                                      className="max-h-72 w-full object-cover transition-opacity hover:opacity-90"
                                    />
                                  </a>
                                ) : attachment.url && attachment.mediaKind === "video" ? (
                                  <video
                                    src={attachment.url}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    className="max-h-72 w-full bg-black object-contain"
                                  >
                                    你的瀏覽器不支援影片播放。
                                  </video>
                                ) : (
                                  <div className="flex min-h-24 items-center justify-center gap-2 px-3 text-xs text-slate-300">
                                    {attachment.mediaKind === "video"
                                      ? <Film className="h-5 w-5" />
                                      : <ImagePlus className="h-5 w-5" />}
                                    <span className="truncate">{attachment.fileName}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {message.body ? (
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        ) : null}
                      </div>
                      {message.delivery === "sent" && !message.deletedAt &&
                      (own || user?.role === "admin" || user?.role === "super_admin") ? (
                        <button
                          type="button"
                          aria-label="刪除訊息"
                          title="刪除訊息"
                          disabled={deletingMessageId === message.id}
                          onClick={() => {
                            if (!window.confirm("要刪除這則訊息嗎？")) return;
                            setDeletingMessageId(message.id);
                            void deleteMessage(message.id).finally(() => setDeletingMessageId(null));
                          }}
                          className={cn(
                            "absolute -top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-[#071522] text-slate-400 shadow-lg transition sm:opacity-0 sm:group-hover:opacity-100 hover:border-rose-300/60 hover:text-rose-200",
                            own ? "-left-9" : "-right-9",
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <div className={cn("mt-1 text-[11px] text-slate-500", own && "text-right")}>
                        {message.delivery === "sending" ? "傳送中" : null}
                        {message.delivery === "sent" ? (read ? "已讀" : "已送出") : null}
                        {message.delivery === "failed" ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"
                            onClick={() => void retryMessage(message.clientId)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            重新傳送
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          )}
        </ScrollArea>

        <form onSubmit={submitMessage} className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,18,29,0.95),rgba(8,18,29,1))] p-3">
          {selectedMediaFiles.length > 0 ? (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="已選擇的媒體檔案">
              {selectedMediaFiles.map((item, index) => (
                <div
                  key={`${item.file.name}-${item.file.lastModified}-${index}`}
                  className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-cyan-200/20 bg-[#071522]"
                >
                  {item.mediaKind === "image" ? (
                    <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-slate-300">
                      <Film className="h-5 w-5 text-cyan-200" />
                      <span className="w-full truncate text-center text-[10px]">{item.file.name}</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-[#06111f]/85 px-1 text-[9px] text-slate-200">
                    {formatDirectMessageFileSize(item.file.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={`移除 ${item.file.name}`}
                    disabled={isSendingMedia}
                    onClick={() => removeMediaFile(index)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#06111f]/85 text-slate-200 hover:bg-rose-500 hover:text-white disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {(mediaError || messageError) ? (
            <p className="mb-2 text-xs text-rose-200" role="alert">{mediaError || messageError}</p>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              ref={mediaInputRef}
              type="file"
              accept={CHAT_MEDIA_ACCEPT}
              multiple
              disabled={isSendingMedia || selectedMediaFiles.length >= 4}
              onChange={(event) => selectMediaFiles(event.target.files)}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="加入圖片或影片"
              title="加入圖片或影片"
              disabled={isSendingMedia || selectedMediaFiles.length >= 4}
              onClick={() => mediaInputRef.current?.click()}
              className="h-11 w-11 shrink-0 rounded-2xl border-white/10 bg-white/[0.04] text-cyan-200 hover:bg-cyan-300/10"
            >
              <ImagePlus className="h-4.5 w-4.5" />
            </Button>
            <Input
              value={draft}
              maxLength={5_000}
              disabled={isSendingMedia}
              placeholder={selectedMediaFiles.length > 0 ? "可以補一句文字再送出" : "輸入訊息"}
              className="h-11 flex-1 rounded-2xl border-white/10 bg-white/[0.04] text-slate-100 placeholder:text-slate-500"
              onChange={(event) => {
                setDraft(event.target.value);
                sendTyping(Boolean(event.target.value));
              }}
              onBlur={() => sendTyping(false)}
            />
            <Button
              type="submit"
              size="icon"
              aria-label={isSendingMedia ? "訊息傳送中" : "送出訊息"}
              disabled={isSendingMedia || (!draft.trim() && selectedMediaFiles.length === 0)}
              className="h-11 w-11 shrink-0 rounded-2xl bg-[linear-gradient(135deg,#67e8f9,#a5f3fc)] text-[#082032] shadow-[0_16px_26px_-18px_rgba(103,232,249,0.78)] hover:bg-cyan-200"
            >
              {isSendingMedia
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              <span className="sr-only">{isSendingMedia ? "訊息傳送中" : "送出訊息"}</span>
            </Button>
          </div>
        </form>
      </div>
    );
  }

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("zh-TW");
  const availableOnlineUsers = onlineUsers.filter((onlineUser) => {
    if (onlineUser.userId === user?.userId) return false;
    if (!normalizedSearch) return true;
    return [onlineUser.displayName, onlineUser.username]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("zh-TW").includes(normalizedSearch));
  });
  const filteredThreads = threads.filter((thread) => {
    if (!normalizedSearch) return true;
    return [thread.otherDisplayName, thread.otherUsername, thread.lastMessageBody]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("zh-TW").includes(normalizedSearch));
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_35%)]">
      <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(11,24,38,0.98),rgba(9,19,31,0.94))] px-4 py-4">
        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_24px_50px_-30px_rgba(0,0,0,0.75)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-black tracking-[0.01em] text-white">快速開始私訊</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {unreadCount > 0 ? `目前有 ${unreadCount} 則未讀訊息` : "先找同事，或從最近對話直接接著聊"}
              </p>
            </div>
            <div className="rounded-full border border-cyan-200/12 bg-cyan-300/8 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
              {threads.length} 個對話
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/55" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜尋同事或訊息內容"
              className="h-11 rounded-2xl border-white/10 bg-[#0b1625] pl-10 text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-4 py-4">
        {availableOnlineUsers.length > 0 ? (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/75">
              <Users className="h-3.5 w-3.5" />
              線上同事
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {availableOnlineUsers.map((onlineUser) => (
                <button
                  key={onlineUser.userId}
                  type="button"
                  onClick={() => {
                    const existing = threads.find((thread) => thread.otherUserId === onlineUser.userId);
                    if (existing) setSelectedThreadId(existing.threadId);
                    else void startDirectChat(onlineUser.userId).then(setSelectedThreadId);
                  }}
                  className="min-w-[132px] rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,32,51,0.92),rgba(12,23,38,0.96))] px-3.5 py-3 text-left shadow-[0_16px_36px_-28px_rgba(0,0,0,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/24 hover:bg-cyan-300/[0.06]"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/16 bg-cyan-300/10 text-sm font-black text-cyan-50">
                      {(onlineUser.displayName || onlineUser.username || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-white">
                        {onlineUser.displayName || onlineUser.username}
                      </span>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        在線上
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">最近對話</span>
              <p className="mt-1 text-xs text-slate-500">保留最後訊息與未讀狀態，方便直接回接</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void reload()}
              className="h-9 rounded-2xl border border-white/8 bg-white/[0.03] px-3 text-slate-300 hover:bg-white/[0.06]"
            >
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              更新
            </Button>
          </div>
          {error ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
              {error}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center text-center text-slate-500">
              <MessageCircle className="mb-3 h-9 w-9 opacity-50" />
              <p className="font-semibold text-slate-300">還沒有任何對話</p>
              <p className="mt-1 text-sm">點上面的線上同事，就能立即開始私訊。</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center text-center text-slate-500">
              <Search className="mb-3 h-9 w-9 opacity-50" />
              <p className="font-semibold text-slate-300">找不到符合的對話</p>
              <p className="mt-1 text-sm">可以換個名字、帳號或訊息關鍵字再試一次。</p>
            </div>
          ) : (
            <div className="space-y-3 pb-3">
              {filteredThreads.map((thread) => (
                <ThreadRow
                  key={thread.threadId}
                  thread={thread}
                  online={onlineUserIds.has(thread.otherUserId)}
                  deleting={deletingThreadIds.has(thread.threadId)}
                  onOpen={() => setSelectedThreadId(thread.threadId)}
                  onDelete={() => void handleClearThread(thread)}
                />
              ))}
            </div>
          )}
        </section>
      </ScrollArea>
    </div>
  );
}
