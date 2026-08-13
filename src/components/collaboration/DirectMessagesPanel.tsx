import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  CornerUpLeft,
  Download,
  Film,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { UserAvatar } from "@/components/account/UserAvatar";
import { useUser } from "@/components/auth/UserContext";
import {
  CHAT_MEDIA_ACCEPT,
  createDirectMessageClipboardFileName,
  formatDirectMessageFileSize,
  getDirectMessageClipboardImageFiles,
  getDirectMessageMediaKind,
  validateDirectMessageFiles,
} from "@/components/collaboration/directMessageMedia.mjs";
import {
  directMessageMatchesQuery,
  formatDirectMessageDay,
  formatDirectMessageReply,
  getDirectMessageDisplayPreview,
  parseDirectMessageBody,
  sortDirectThreads,
} from "@/components/collaboration/directMessageExperience.mjs";
import { setPendingDirectThread } from "@/components/collaboration/directMessageState.mjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { OnlineUser } from "@/hooks/useUserPresence";
import {
  type DirectMessage,
  type DirectMessageAttachment,
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

type ThreadFilter = "all" | "unread" | "pinned";

interface ReplyTarget {
  messageId: string;
  author: string;
  excerpt: string;
}

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "🎉", "✅"];
const CHAT_PREFERENCES_VERSION = "v1";

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readChatPreferences(userId: string) {
  try {
    const raw = window.localStorage.getItem(`station-chat-preferences-${CHAT_PREFERENCES_VERSION}:${userId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      pinnedThreadIds: Array.isArray(parsed.pinnedThreadIds)
        ? parsed.pinnedThreadIds.filter((value: unknown): value is string => typeof value === "string")
        : [],
      drafts: parsed.drafts && typeof parsed.drafts === "object"
        ? Object.fromEntries(Object.entries(parsed.drafts).filter(([, value]) => typeof value === "string"))
        : {},
    };
  } catch {
    return { pinnedThreadIds: [], drafts: {} };
  }
}

function saveChatPreferences(userId: string, pinnedThreadIds: Set<string>, drafts: Record<string, string>) {
  try {
    window.localStorage.setItem(
      `station-chat-preferences-${CHAT_PREFERENCES_VERSION}:${userId}`,
      JSON.stringify({ pinnedThreadIds: [...pinnedThreadIds], drafts }),
    );
  } catch {
    // Private browsing or a full storage quota should not block messaging.
  }
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
  pinned,
  draft,
  deleting,
  onOpen,
  onTogglePin,
  onDelete,
}: {
  thread: DirectThread;
  onlineUser?: OnlineUser;
  pinned: boolean;
  draft: string;
  deleting: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const displayName = thread.otherDisplayName || thread.otherUsername;
  const previewText = draft.trim()
    ? draft.trim()
    : getDirectMessageDisplayPreview(thread.lastMessageBody, "開始一段新對話");
  const online = Boolean(onlineUser);
  const avatarPath = onlineUser?.avatarPath ?? thread.otherAvatarPath;

  return (
    <div
      data-direct-thread-row="true"
      data-density="compact"
      data-pinned={pinned ? "true" : "false"}
      className={cn(
        "group relative h-[66px] overflow-hidden rounded-2xl border transition-colors [contain-intrinsic-size:66px] [content-visibility:auto]",
        pinned
          ? "border-amber-200/30 bg-[linear-gradient(100deg,rgba(251,191,36,0.13),rgba(13,27,44,0.98)_35%,rgba(34,211,238,0.07))]"
          : "border-cyan-100/12 bg-[linear-gradient(100deg,rgba(34,211,238,0.09),rgba(13,27,44,0.98)_34%,rgba(167,139,250,0.06))]",
        "hover:border-cyan-200/38 hover:bg-[#102238]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full min-w-0 items-center gap-2.5 px-3 pr-[74px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/60"
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
            {pinned ? <Pin className="h-3 w-3 shrink-0 fill-amber-200 text-amber-200" aria-label="已置頂" /> : null}
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
          <span className={cn("mt-1.5 block truncate text-xs leading-none", draft.trim() ? "font-semibold text-amber-200" : "text-slate-400")}>
            {draft.trim() ? "草稿 · " : ""}{previewText}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={pinned ? `取消置頂 ${displayName}` : `置頂 ${displayName}`}
        title={pinned ? "取消置頂" : "置頂對話"}
        onClick={onTogglePin}
        className="absolute right-10 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-amber-200/10 bg-amber-300/[0.06] text-amber-100/65 transition-colors hover:border-amber-200/35 hover:bg-amber-300/15 hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/70"
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label={`刪除與 ${displayName} 的對話`}
        title={`刪除與 ${displayName} 的對話`}
        disabled={deleting}
        onClick={onDelete}
        className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-rose-300/10 bg-rose-400/[0.06] text-rose-200/55 transition-colors hover:border-rose-300/35 hover:bg-rose-400/16 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300/70 disabled:cursor-wait disabled:opacity-40"
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
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => new Set());
  const [threadDrafts, setThreadDrafts] = useState<Record<string, string>>({});
  const [preferencesReadyFor, setPreferencesReadyFor] = useState<string | null>(null);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<DirectMessageAttachment | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<SelectedMediaFile[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [deletingThreadIds, setDeletingThreadIds] = useState<Set<string>>(() => new Set());
  const deletingThreadIdsRef = useRef(new Set<string>());
  const threadDraftsRef = useRef<Record<string, string>>({});
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
  const parsedMessages = useMemo(
    () => messages.map((message) => ({ message, parsed: parseDirectMessageBody(message.body) })),
    [messages],
  );
  const visibleMessages = useMemo(
    () => messageSearchQuery.trim()
      ? parsedMessages.filter(({ message }) => directMessageMatchesQuery(message, messageSearchQuery))
      : parsedMessages,
    [messageSearchQuery, parsedMessages],
  );

  useEffect(() => {
    if (!user?.userId) return;
    const preferences = readChatPreferences(user.userId);
    setPinnedThreadIds(new Set(preferences.pinnedThreadIds));
    threadDraftsRef.current = preferences.drafts;
    setThreadDrafts(preferences.drafts);
    setPreferencesReadyFor(user.userId);
  }, [user?.userId]);

  useEffect(() => {
    if (!user?.userId || preferencesReadyFor !== user.userId) return;
    saveChatPreferences(user.userId, pinnedThreadIds, threadDrafts);
  }, [pinnedThreadIds, preferencesReadyFor, threadDrafts, user?.userId]);

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
    setDraft(selectedThreadId ? threadDraftsRef.current[selectedThreadId] ?? "" : "");
    setReplyingTo(null);
    setEmojiPickerOpen(false);
    setMessageSearchOpen(false);
    setMessageSearchQuery("");
    setPreviewAttachment(null);
  }, [selectedThreadId]);

  const updateDraft = (value: string) => {
    setDraft(value);
    if (!selectedThreadId) return;
    setThreadDrafts((current) => {
      const next = { ...current };
      if (value) next[selectedThreadId] = value;
      else delete next[selectedThreadId];
      threadDraftsRef.current = next;
      return next;
    });
  };

  const togglePinnedThread = (threadId: string) => {
    setPinnedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const copyMessage = async (message: DirectMessage) => {
    const parsed = parseDirectMessageBody(message.body);
    const text = parsed.body || message.attachments.map((attachment) => attachment.fileName).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1_500);
    } catch {
      setMediaError("無法複製訊息，請確認瀏覽器已允許剪貼簿權限。");
    }
  };

  const startReply = (message: DirectMessage, own: boolean) => {
    const parsed = parseDirectMessageBody(message.body);
    const excerpt = parsed.body
      || message.attachments.map((attachment) => attachment.fileName).join("、")
      || "媒體訊息";
    setReplyingTo({
      messageId: message.id,
      author: own ? "你" : selectedThread?.otherDisplayName || selectedThread?.otherUsername || "同事",
      excerpt,
    });
    setEmojiPickerOpen(false);
  };

  const appendMediaFiles = (files: File[]) => {
    if (files.length === 0) return;
    const combined = [...selectedMediaFiles.map((item) => item.file), ...files];
    const validation = validateDirectMessageFiles(combined);
    if (validation.error) {
      setMediaError(validation.error);
      return;
    }
    const additions = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaKind: (getDirectMessageMediaKind(file) ?? "image") as "image" | "video",
    }));
    setSelectedMediaFiles((current) => [...current, ...additions]);
    setMediaError(null);
  };

  const selectMediaFiles = (files: FileList | null) => {
    appendMediaFiles(Array.from(files ?? []));
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardImages = getDirectMessageClipboardImageFiles(event.clipboardData.items);
    if (clipboardImages.length === 0) return;

    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    const pastedFiles = clipboardImages.map((file, index) => new File(
      [file],
      createDirectMessageClipboardFileName(file, index) ?? file.name,
      { type: file.type, lastModified: file.lastModified },
    ));
    appendMediaFiles(pastedFiles);
    setEmojiPickerOpen(false);
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
    const messageBody = draft.trim();
    if ((!messageBody && selectedMediaFiles.length === 0) || isSendingMedia) return;
    const body = formatDirectMessageReply(messageBody, replyingTo);
    setIsSendingMedia(true);
    sendTyping(false);
    try {
      const sent = await sendMessage(body, selectedMediaFiles.map((item) => item.file));
      if (!sent) return;
      updateDraft("");
      setReplyingTo(null);
      setEmojiPickerOpen(false);
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
      <div className="relative flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_36%)]">
        <div className="flex min-h-16 items-center gap-3 border-b border-white/8 bg-[linear-gradient(180deg,rgba(11,24,38,0.98),rgba(9,19,31,0.94))] px-3 py-2.5 sm:px-4 sm:py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-2xl border border-white/8 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] sm:h-10 sm:w-10"
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
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={pinnedThreadIds.has(selectedThreadId) ? "取消置頂這段對話" : "置頂這段對話"}
              title={pinnedThreadIds.has(selectedThreadId) ? "取消置頂" : "置頂對話"}
              onClick={() => togglePinnedThread(selectedThreadId)}
              className={cn(
                "h-11 w-11 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] sm:h-9 sm:w-9",
                pinnedThreadIds.has(selectedThreadId) ? "text-amber-200" : "text-slate-300",
              )}
            >
              {pinnedThreadIds.has(selectedThreadId)
                ? <PinOff className="h-4 w-4" />
                : <Pin className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={messageSearchOpen ? "關閉訊息搜尋" : "搜尋這段對話"}
              title="搜尋這段對話"
              onClick={() => {
                setMessageSearchOpen((current) => !current);
                if (messageSearchOpen) setMessageSearchQuery("");
              }}
              className={cn(
                "h-11 w-11 rounded-xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.08] sm:h-9 sm:w-9",
                messageSearchOpen ? "border-cyan-200/35 text-cyan-200" : "text-slate-300",
              )}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {messageSearchOpen ? (
          <div className="flex items-center gap-2 border-b border-cyan-100/10 bg-cyan-300/[0.04] px-3 py-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-200/55" />
              <Input
                autoFocus
                value={messageSearchQuery}
                onChange={(event) => setMessageSearchQuery(event.target.value)}
                placeholder="搜尋此對話的文字或檔名"
                className="h-9 rounded-xl border-cyan-100/15 bg-[#071522] pl-9 pr-9 text-sm text-slate-100"
              />
              {messageSearchQuery ? (
                <button
                  type="button"
                  aria-label="清除訊息搜尋"
                  onClick={() => setMessageSearchQuery("")}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/8 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <span className="shrink-0 rounded-lg border border-violet-200/15 bg-violet-300/[0.08] px-2 py-1 text-[11px] font-bold text-violet-100">
              {messageSearchQuery.trim() ? `${visibleMessages.length} 筆` : `${messages.length} 則`}
            </span>
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 px-3 py-4 sm:px-4">
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
          ) : messageSearchQuery.trim() && visibleMessages.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center px-5 text-center text-slate-500">
              <Search className="mb-3 h-9 w-9 opacity-50" />
              <p className="font-semibold text-slate-300">找不到符合的訊息</p>
              <p className="mt-1 text-sm">請更換關鍵字，或載入更早訊息後再搜尋。</p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {visibleMessages.map(({ message, parsed }, index) => {
                const own = message.senderId === user?.userId;
                const previousMessage = visibleMessages[index - 1]?.message;
                const showDay = !previousMessage
                  || new Date(previousMessage.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                const messageIndex = messages.findIndex((candidate) => candidate.id === message.id);
                const isLastOwn =
                  own && !messages.slice(messageIndex + 1).some((candidate) => candidate.senderId === user?.userId);
                const read =
                  isLastOwn &&
                  message.delivery === "sent" &&
                  readByOtherAt &&
                  Date.parse(readByOtherAt) >= Date.parse(message.createdAt);
                return (
                  <div key={message.id}>
                    {showDay ? (
                      <div className="my-3 flex items-center gap-2 text-[10px] font-bold text-slate-500" role="separator">
                        <span className="h-px flex-1 bg-white/[0.06]" />
                        <span className="rounded-full border border-white/[0.07] bg-[#0b1a2a] px-2.5 py-1">
                          {formatDirectMessageDay(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-white/[0.06]" />
                      </div>
                    ) : null}
                    <div className={cn("flex", own ? "justify-end" : "justify-start")}>
                      <div className="group relative max-w-[88%] sm:max-w-[82%]">
                        <div
                          className={cn(
                            "rounded-[22px] px-3.5 py-3 text-sm leading-6 shadow-[0_16px_30px_-24px_rgba(0,0,0,0.72)]",
                            message.deletedAt
                              ? "border border-slate-700 bg-slate-800/70 text-slate-500 italic"
                              : own
                                ? "rounded-br-md bg-[linear-gradient(135deg,#67e8f9,#a5f3fc)] text-[#082032]"
                                : "rounded-bl-md border border-white/8 bg-[linear-gradient(180deg,rgba(17,34,55,0.98),rgba(13,26,43,0.98))] text-slate-100",
                            message.delivery === "failed" && "border border-rose-300 bg-rose-400/15 text-rose-50",
                          )}
                        >
                          {parsed.reply ? (
                            <div className={cn(
                              "mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-xs leading-5",
                              own
                                ? "border-[#075985] bg-[#082032]/10 text-[#164e63]"
                                : "border-violet-300 bg-violet-300/[0.08] text-violet-100",
                            )}>
                              <span className="block font-black">{parsed.reply.author}</span>
                              <span className="block truncate opacity-80">{parsed.reply.excerpt}</span>
                            </div>
                          ) : null}
                          {message.attachments.length > 0 ? (
                            <div
                              className={cn(
                                "grid gap-1.5",
                                message.attachments.length > 1 && "grid-cols-2",
                                (parsed.body || parsed.reply) && "mb-2",
                              )}
                            >
                              {message.attachments.map((attachment) => (
                                <div
                                  key={attachment.id}
                                  className="min-w-0 overflow-hidden rounded-xl bg-[#071522]/90"
                                >
                                  {attachment.url && attachment.mediaKind === "image" ? (
                                    <button
                                      type="button"
                                      title={`預覽 ${attachment.fileName}`}
                                      onClick={() => setPreviewAttachment(attachment)}
                                      className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200"
                                    >
                                      <img
                                        src={attachment.url}
                                        alt={attachment.fileName}
                                        loading="lazy"
                                        className="max-h-72 w-full object-cover transition-opacity hover:opacity-90"
                                      />
                                    </button>
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
                          {parsed.body ? (
                            <p className="whitespace-pre-wrap break-words">{parsed.body}</p>
                          ) : null}
                        </div>
                        {!message.deletedAt ? (
                          <div className={cn(
                            "mt-1 flex items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                            own ? "justify-end" : "justify-start",
                          )}>
                            <button
                              type="button"
                              onClick={() => startReply(message, own)}
                              aria-label="回覆訊息"
                              title="回覆"
                              className="flex h-10 items-center gap-1.5 rounded-xl border border-cyan-100/10 bg-[#0b1a2a] px-2.5 text-[11px] font-bold text-cyan-100/80 hover:border-cyan-200/30 hover:text-cyan-50 sm:h-7 sm:rounded-lg sm:px-2 sm:text-[10px]"
                            >
                              <CornerUpLeft className="h-3 w-3" />回覆
                            </button>
                            <button
                              type="button"
                              onClick={() => void copyMessage(message)}
                              aria-label="複製訊息"
                              title="複製"
                              className="flex h-10 items-center gap-1.5 rounded-xl border border-violet-100/10 bg-[#0b1a2a] px-2.5 text-[11px] font-bold text-violet-100/80 hover:border-violet-200/30 hover:text-violet-50 sm:h-7 sm:rounded-lg sm:px-2 sm:text-[10px]"
                            >
                              {copiedMessageId === message.id
                                ? <Check className="h-3 w-3" />
                                : <ClipboardCopy className="h-3 w-3" />}
                              {copiedMessageId === message.id ? "已複製" : "複製"}
                            </button>
                            {message.delivery === "sent" &&
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
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200/10 bg-rose-400/[0.05] text-rose-200/70 hover:border-rose-200/30 hover:text-rose-100 disabled:opacity-40 sm:h-7 sm:w-7 sm:rounded-lg"
                              >
                                {deletingMessageId === message.id
                                  ? <LoaderCircle className="h-3 w-3 animate-spin" />
                                  : <Trash2 className="h-3 w-3" />}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        <div className={cn("mt-1 text-[10px] text-slate-500", own && "text-right")}>
                          <span>{formatMessageTime(message.createdAt)}</span>
                          {message.editedAt ? <span> · 已編輯</span> : null}
                          {message.delivery === "sending" ? <span> · 傳送中</span> : null}
                          {message.delivery === "sent" && own ? <span> · {read ? "已讀" : "已送出"}</span> : null}
                          {message.delivery === "failed" ? (
                            <button
                              type="button"
                              className="ml-1 inline-flex items-center gap-1 text-rose-300 hover:text-rose-200"
                              onClick={() => void retryMessage(message.clientId)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              重新傳送
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          )}
        </ScrollArea>

        <form onSubmit={submitMessage} className="border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,18,29,0.95),rgba(8,18,29,1))] px-2.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 sm:p-3">
          {replyingTo ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-violet-200/20 bg-violet-300/[0.08] px-3 py-2">
              <CornerUpLeft className="h-4 w-4 shrink-0 text-violet-200" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.08em] text-violet-200">
                  回覆 {replyingTo.author}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-300">{replyingTo.excerpt}</div>
              </div>
              <button
                type="button"
                aria-label="取消回覆"
                onClick={() => setReplyingTo(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          {emojiPickerOpen ? (
            <div className="mb-2 flex items-center gap-1.5 rounded-xl border border-amber-200/15 bg-amber-300/[0.05] p-1.5" aria-label="常用表情">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`加入表情 ${emoji}`}
                  onClick={() => {
                    updateDraft(`${draft}${emoji}`);
                    sendTyping(true);
                  }}
                  className="flex h-8 min-w-8 flex-1 items-center justify-center rounded-lg text-lg hover:bg-amber-200/15"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={emojiPickerOpen ? "關閉表情選單" : "加入表情"}
              title="常用表情"
              onClick={() => setEmojiPickerOpen((current) => !current)}
              className={cn(
                "h-11 w-11 shrink-0 rounded-2xl border-white/10 bg-white/[0.04] text-amber-200 hover:bg-amber-300/10",
                emojiPickerOpen && "border-amber-200/30 bg-amber-300/10",
              )}
            >
              <Smile className="h-4.5 w-4.5" />
            </Button>
            <Textarea
              value={draft}
              maxLength={4_800}
              disabled={isSendingMedia}
              placeholder={selectedMediaFiles.length > 0 ? "可以補一句文字再送出" : "輸入訊息"}
              rows={1}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-2xl border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm leading-5 text-slate-100 placeholder:text-slate-500"
              onChange={(event) => {
                updateDraft(event.target.value);
                sendTyping(Boolean(event.target.value));
              }}
              onPaste={handleComposerPaste}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
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
          <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] font-medium text-slate-600">
            <span>Ctrl+V 貼上截圖 · Enter 送出 · Shift + Enter 換行</span>
            {draft.length > 4_400 ? <span>{draft.length} / 4800</span> : null}
          </div>
        </form>
        {previewAttachment?.url ? (
          <div className="absolute inset-0 z-50 flex flex-col bg-[#020914]/96 backdrop-blur-sm" role="dialog" aria-label={`預覽 ${previewAttachment.fileName}`}>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-3">
              <div className="min-w-0 flex-1 truncate text-sm font-bold text-white">{previewAttachment.fileName}</div>
              <a
                href={previewAttachment.url}
                download={previewAttachment.fileName}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-100 hover:bg-cyan-300/15"
                aria-label="下載原始檔案"
                title="下載"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10"
                aria-label="關閉媒體預覽"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <img
                src={previewAttachment.url}
                alt={previewAttachment.fileName}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
          </div>
        ) : null}
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
  const searchedThreads = threads.filter((thread) => {
    if (!normalizedSearch) return true;
    return [
      thread.otherDisplayName,
      thread.otherUsername,
      getDirectMessageDisplayPreview(thread.lastMessageBody, ""),
      threadDrafts[thread.threadId],
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("zh-TW").includes(normalizedSearch));
  });
  const filteredThreads = sortDirectThreads(searchedThreads, pinnedThreadIds).filter((thread) => {
    if (threadFilter === "unread") return thread.unreadCount > 0;
    if (threadFilter === "pinned") return pinnedThreadIds.has(thread.threadId);
    return true;
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
              className="h-11 rounded-xl border-cyan-100/18 bg-[#0b1625] pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-cyan-200/50 focus-visible:ring-cyan-300/15 sm:h-9"
            />
          </div>
          <div
            className="flex h-11 shrink-0 items-center rounded-xl border border-amber-200/25 bg-amber-300/10 px-2.5 text-[11px] font-bold text-amber-100 sm:h-9"
            title={unreadCount > 0 ? `${unreadCount} 則未讀訊息` : `${threads.length} 個對話`}
          >
            {unreadCount > 0 ? `${unreadCount} 未讀` : `${threads.length} 對話`}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5" aria-label="對話篩選">
          {([
            { id: "all", label: "全部", count: threads.length },
            { id: "unread", label: "未讀", count: threads.filter((thread) => thread.unreadCount > 0).length },
            { id: "pinned", label: "置頂", count: threads.filter((thread) => pinnedThreadIds.has(thread.threadId)).length },
          ] as const).map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={threadFilter === filter.id}
              onClick={() => setThreadFilter(filter.id)}
              className={cn(
                "flex h-11 items-center gap-1 rounded-lg border px-3 text-[11px] font-black transition-colors sm:h-7 sm:px-2.5 sm:text-[10px]",
                threadFilter === filter.id
                  ? "border-cyan-200/35 bg-cyan-300/15 text-cyan-50"
                  : "border-white/8 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200",
              )}
            >
              {filter.id === "pinned" ? <Pin className="h-3 w-3" /> : null}
              {filter.label}
              <span className="opacity-65">{filter.count}</span>
            </button>
          ))}
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
                  className="h-11 min-w-[112px] rounded-lg border border-emerald-300/18 bg-emerald-400/[0.08] px-2 text-left transition-colors hover:border-emerald-200/38 hover:bg-emerald-400/15 sm:h-10"
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
              className="h-11 w-11 rounded-lg border border-violet-300/15 bg-violet-400/[0.07] text-violet-200 hover:bg-violet-400/16 hover:text-white sm:h-7 sm:w-7"
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
              {threadFilter === "pinned"
                ? <Pin className="mb-3 h-9 w-9 opacity-50" />
                : <Search className="mb-3 h-9 w-9 opacity-50" />}
              <p className="font-semibold text-slate-300">
                {threadFilter === "pinned" ? "目前沒有置頂對話" : threadFilter === "unread" ? "沒有未讀訊息" : "找不到符合的對話"}
              </p>
              <p className="mt-1 text-sm">
                {threadFilter === "pinned" ? "點對話右側的圖釘，就能固定在最上方。" : "可以更換篩選或搜尋關鍵字。"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pb-2">
              {filteredThreads.map((thread) => (
                <ThreadRow
                  key={thread.threadId}
                  thread={thread}
                  onlineUser={onlineUserById.get(thread.otherUserId)}
                  pinned={pinnedThreadIds.has(thread.threadId)}
                  draft={threadDrafts[thread.threadId] ?? ""}
                  deleting={deletingThreadIds.has(thread.threadId)}
                  onOpen={() => setSelectedThreadId(thread.threadId)}
                  onTogglePin={() => togglePinnedThread(thread.threadId)}
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
