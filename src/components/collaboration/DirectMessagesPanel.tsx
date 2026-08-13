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

import { UserAvatar } from "@/components/account/UserAvatar";
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
  onlineUser,
  deleting,
  onOpen,
  onDelete,
}: {
  thread: DirectThread;
  onlineUser?: OnlineUser;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const displayName = thread.otherDisplayName || thread.otherUsername;
  const previewText = thread.lastMessageBody || "開始一段新對話";
  const online = Boolean(onlineUser);
  const avatarPath = onlineUser?.avatarPath ?? thread.otherAvatarPath;

  return (
    <div
      data-direct-thread-row="true"
      data-density="compact"
      className="group relative h-[58px] overflow-hidden rounded-xl border border-cyan-100/12 bg-[linear-gradient(100deg,rgba(34,211,238,0.09),rgba(13,27,44,0.98)_34%,rgba(167,139,250,0.06))] transition-colors [contain-intrinsic-size:58px] [content-visibility:auto] hover:border-cyan-200/38 hover:bg-[#102238]"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full min-w-0 items-center gap-2.5 px-3 pr-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60"
      >
        <span className="relative shrink-0">
          <UserAvatar
            avatarPath={avatarPath}
            displayName={displayName}
            className="h-8 w-8 rounded-lg border border-cyan-200/15"
            fallbackClassName="rounded-lg text-xs font-black tracking-[0.04em]"
          />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d1b2c]",
              online ? "bg-emerald-400" : "bg-slate-500",
            )}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 leading-none">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
              {displayName}
            </span>
            <span className={cn("shrink-0 text-[10px] font-semibold", online ? "text-emerald-300" : "text-slate-500")}>
              {online ? "在線" : "離線"}
            </span>
            {thread.unreadCount > 0 ? (
              <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300 px-1.5 py-0.5 text-[10px] font-black text-[#06111f]">
                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
              </span>
            ) : null}
            <span className="shrink-0 text-[10px] text-slate-500">{shortTime(thread.lastMessageAt)}</span>
          </span>
          <span className="mt-1 block truncate text-xs leading-none text-slate-400">
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
        className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-rose-300/10 bg-rose-400/[0.06] text-rose-200/55 opacity-80 transition-colors hover:border-rose-300/35 hover:bg-rose-400/16 hover:text-rose-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300/70 disabled:cursor-wait disabled:opacity-40 group-hover:opacity-100"
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
  const onlineUserById = useMemo(
    () => new Map(onlineUsers.map((onlineUser) => [onlineUser.userId, onlineUser])),
    [onlineUsers],
  );
  const selectedOnlineUser = selectedThread
    ? onlineUserById.get(selectedThread.otherUserId)
    : undefined;

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
          {selectedThread ? (
            <span className="relative shrink-0">
              <UserAvatar
                avatarPath={selectedOnlineUser?.avatarPath ?? selectedThread.otherAvatarPath}
                displayName={selectedThread.otherDisplayName || selectedThread.otherUsername}
                className="h-10 w-10 border border-cyan-200/20"
                fallbackClassName="text-sm font-black"
              />
              <span
                aria-label={selectedOnlineUser ? "在線" : "離線"}
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b1826]",
                  selectedOnlineUser ? "bg-emerald-400" : "bg-slate-500",
                )}
              />
            </span>
          ) : null}
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
    <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_92%_12%,rgba(167,139,250,0.10),transparent_30%),#071421]">
      <div
        data-direct-messages-toolbar="compact"
        className="border-b border-cyan-100/12 bg-[linear-gradient(90deg,rgba(6,182,212,0.13),rgba(9,19,31,0.96),rgba(139,92,246,0.10))] px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-200/55" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜尋同事或訊息內容"
              className="h-9 rounded-xl border-cyan-100/18 bg-[#0b1625] pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-cyan-200/50 focus-visible:ring-cyan-300/15"
            />
          </div>
          <div
            className="flex h-9 shrink-0 items-center rounded-xl border border-amber-200/25 bg-amber-300/10 px-2.5 text-[11px] font-bold text-amber-100"
            title={unreadCount > 0 ? `${unreadCount} 則未讀訊息` : `${threads.length} 個對話`}
          >
            {unreadCount > 0 ? `${unreadCount} 未讀` : `${threads.length} 對話`}
          </div>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3 py-2.5">
        {availableOnlineUsers.length > 0 ? (
          <section className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/85">
              <Users className="h-3.5 w-3.5" />
              線上同事
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {availableOnlineUsers.map((onlineUser) => (
                <button
                  key={onlineUser.userId}
                  type="button"
                  onClick={() => {
                    const existing = threads.find((thread) => thread.otherUserId === onlineUser.userId);
                    if (existing) setSelectedThreadId(existing.threadId);
                    else void startDirectChat(onlineUser.userId).then(setSelectedThreadId);
                  }}
                  className="h-10 min-w-[112px] rounded-lg border border-emerald-300/18 bg-emerald-400/[0.08] px-2 text-left transition-colors hover:border-emerald-200/38 hover:bg-emerald-400/15"
                >
                  <span className="flex items-center gap-2">
                    <UserAvatar
                      avatarPath={onlineUser.avatarPath}
                      displayName={onlineUser.displayName || onlineUser.username}
                      className="h-6 w-6 shrink-0 rounded-md"
                      fallbackClassName="rounded-md text-[10px] font-black"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
                      {onlineUser.displayName || onlineUser.username}
                    </span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="在線上" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-1.5 flex h-7 items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">最近對話</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="更新對話"
              title="更新對話"
              onClick={() => void reload()}
              className="h-7 w-7 rounded-lg border border-violet-300/15 bg-violet-400/[0.07] text-violet-200 hover:bg-violet-400/16 hover:text-white"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
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
            <div className="space-y-1.5 pb-2">
              {filteredThreads.map((thread) => (
                <ThreadRow
                  key={thread.threadId}
                  thread={thread}
                  onlineUser={onlineUserById.get(thread.otherUserId)}
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
