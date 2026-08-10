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
import { Badge } from "@/components/ui/badge";
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
  return (
    <div
      data-direct-thread-row="true"
      className="group flex w-full overflow-hidden rounded-2xl border border-sky-300/15 bg-[#0b1b2d] transition-colors hover:border-cyan-200/35"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left transition-colors hover:bg-[#10243a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 font-bold text-cyan-100">
          {(thread.otherDisplayName || thread.otherUsername).slice(0, 2).toUpperCase()}
          <span className={cn("absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b1b2d]", online ? "bg-emerald-400" : "bg-slate-600")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-slate-50">{thread.otherDisplayName}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{shortTime(thread.lastMessageAt)}</span>
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm text-slate-400">
              {thread.lastMessageBody || "開始一段新對話"}
            </span>
            {thread.unreadCount > 0 ? (
              <Badge className="h-5 min-w-5 shrink-0 justify-center bg-cyan-300 px-1.5 text-[#06111f]">
                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`刪除與 ${thread.otherDisplayName} 的所有訊息`}
        title={`刪除與 ${thread.otherDisplayName} 的所有訊息`}
        disabled={deleting}
        onClick={onDelete}
        className="flex w-11 shrink-0 items-center justify-center border-l border-sky-300/10 text-slate-500 transition-colors hover:bg-rose-300/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300/70 disabled:cursor-wait disabled:opacity-60"
      >
        {deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface SelectedMediaFile {
  file: File;
  previewUrl: string;
  mediaKind: "image" | "video";
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
    const confirmed = window.confirm(
      `確定刪除與「${thread.otherDisplayName}」的所有訊息嗎？\n\n只會清除你帳號看到的紀錄，對方仍會保留，且無法復原。`,
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
        <p className="font-semibold text-slate-100">即時訊息尚未啟用</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          現有網站功能仍可正常使用。請重新登入取得安全身分後，再使用在線與私訊。
        </p>
      </div>
    );
  }

  if (selectedThreadId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-cyan-200/10 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-slate-300"
            onClick={() => setSelectedThreadId(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-50">
              {selectedThread?.otherDisplayName || "私訊"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {typingUsers.length > 0 ? "正在輸入..." : "訊息會安全保留並於重新連線後補收"}
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {hasMore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-auto mb-3 flex text-slate-400"
            >
              {loadingMore && <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />}
              載入更早訊息
            </Button>
          ) : null}
          {messagesLoading && messages.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-slate-400">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin text-cyan-300" />載入訊息
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-slate-500">
              <MessageCircle className="mb-3 h-9 w-9 opacity-50" />
              <p className="font-semibold text-slate-300">開始第一則訊息</p>
              <p className="mt-1 text-sm">此對話只開放給雙方成員。</p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-2">
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
                          "rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                          message.deletedAt
                            ? "border border-slate-700 bg-slate-800/70 text-slate-500 italic"
                            : own
                            ? "rounded-br-md bg-cyan-300 text-[#06111f]"
                            : "rounded-bl-md border border-slate-700 bg-[#102036] text-slate-100",
                          message.delivery === "failed" && "border border-rose-300 bg-rose-400/15 text-rose-50",
                        )}
                      >
                        {message.attachments.length > 0 ? (
                          <div className={cn(
                            "grid gap-1.5",
                            message.attachments.length > 1 && "grid-cols-2",
                            message.body && "mb-2",
                          )}>
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
                                    您的瀏覽器無法播放此影片。
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
                            if (!window.confirm("確定要刪除這則訊息嗎？")) return;
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
                            <RefreshCw className="h-3 w-3" />傳送失敗，重試
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

        <form onSubmit={submitMessage} className="border-t border-cyan-200/10 p-3">
          {selectedMediaFiles.length > 0 ? (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="已選取的照片與影片">
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
          <div className="flex gap-2">
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
              aria-label="選擇照片或影片"
              title="新增照片或影片"
              disabled={isSendingMedia || selectedMediaFiles.length >= 4}
              onClick={() => mediaInputRef.current?.click()}
              className="h-11 w-11 shrink-0 rounded-xl border-cyan-200/20 bg-[#0b1b2d] text-cyan-200 hover:bg-cyan-300/10"
            >
              <ImagePlus className="h-4.5 w-4.5" />
            </Button>
            <Input
              value={draft}
              maxLength={5_000}
              disabled={isSendingMedia}
              placeholder={selectedMediaFiles.length > 0 ? "加入說明（選填）" : "輸入訊息"}
              className="h-11 flex-1 border-slate-700 bg-[#0b1b2d] text-slate-100"
              onChange={(event) => {
                setDraft(event.target.value);
                sendTyping(Boolean(event.target.value));
              }}
              onBlur={() => sendTyping(false)}
            />
            <Button
              type="submit"
              size="icon"
              aria-label={isSendingMedia ? "上傳並傳送中" : "傳送訊息"}
              disabled={isSendingMedia || (!draft.trim() && selectedMediaFiles.length === 0)}
              className="h-11 w-11 shrink-0 rounded-xl bg-cyan-300 text-[#06111f] hover:bg-cyan-200"
            >
              {isSendingMedia
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
              <span className="sr-only">{isSendingMedia ? "上傳並傳送中" : "傳送"}</span>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-cyan-200/10 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/55" />
          <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋同事或訊息內容" className="h-10 border-cyan-200/15 bg-[#071522] pl-9 text-slate-100" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
      {availableOnlineUsers.length > 0 ? (
        <section className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
            <Users className="h-3.5 w-3.5" />在線，可立即私訊
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {availableOnlineUsers.map((onlineUser) => (
              <button
                key={onlineUser.userId}
                type="button"
                onClick={() => {
                  const existing = threads.find((thread) => thread.otherUserId === onlineUser.userId);
                  if (existing) setSelectedThreadId(existing.threadId);
                  else void startDirectChat(onlineUser.userId).then(setSelectedThreadId);
                }}
                className="min-w-[110px] rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-left hover:bg-cyan-300/10"
              >
                <span className="block truncate text-sm font-semibold text-slate-100">
                  {onlineUser.displayName || onlineUser.username}
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />在線
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">最近對話</span>
          <Button variant="ghost" size="sm" onClick={() => void reload()} className="h-7 text-slate-400">
            <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />更新
          </Button>
        </div>
        {error ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
            {error}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center text-center text-slate-500">
            <MessageCircle className="mb-3 h-9 w-9 opacity-50" />
            <p className="font-semibold text-slate-300">尚無私訊</p>
            <p className="mt-1 text-sm">點選在線成員即可開始對話。</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center text-center text-slate-500">
            <Search className="mb-3 h-9 w-9 opacity-50" />
            <p className="font-semibold text-slate-300">找不到符合的對話</p>
            <p className="mt-1 text-sm">可搜尋姓名、帳號或最近訊息。</p>
          </div>
        ) : (
          <div className="space-y-2.5 pb-3">
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
