import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import {
  mergeDirectMessages as mergeMessages,
  replaceVisibleDirectMessages,
} from "@/components/collaboration/directMessageState.mjs";
import {
  createDirectMessageMediaPath,
  getDirectMessageMediaKind,
  validateDirectMessageFiles,
} from "@/components/collaboration/directMessageMedia.mjs";
import { supabase } from "@/integrations/supabase/client";
import { authorizePrivateRealtime } from "@/lib/authorizePrivateRealtime";

const MESSAGE_PAGE_SIZE = 40;
const TYPING_THROTTLE_MS = 500;
const TYPING_EXPIRY_MS = 2_500;
const DIRECT_CHAT_CLEARED_EVENT = "station-direct-chat-cleared";
const CHAT_MEDIA_BUCKET = "chat-media";
const MESSAGE_SELECT = `
  id,thread_id,sender_id,client_id,body,created_at,edited_at,deleted_at,
  chat_message_attachments (
    id,storage_path,file_name,mime_type,file_size,media_kind,position
  )
`;
const database = supabase as any;

function describeDirectMessageFailure(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as { message?: unknown; error?: unknown; statusCode?: unknown };
  const detail = [candidate.message, candidate.error]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!detail) return fallback;
  if (/bucket.*not found|not found.*bucket/i.test(detail)) return "聊天室圖片空間尚未建立，請重新整理後再試。";
  if (/row-level security|unauthorized|permission|policy/i.test(detail)) return "圖片上傳權限尚未同步，請重新登入後再試。";
  if (/mime|content.?type/i.test(detail)) return "這個圖片格式未被聊天室接受，請改用 JPG、PNG、WebP 或 GIF。";
  if (/payload|too large|maximum.*size|exceeded/i.test(detail)) return "圖片檔案超過聊天室上傳限制。";
  return fallback;
}

export interface DirectThread {
  threadId: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarPath: string | null;
  lastMessageId: string | null;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  threadId: string;
  senderId: string;
  clientId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  delivery: "sending" | "sent" | "failed";
  attachments: DirectMessageAttachment[];
}

export interface DirectMessageAttachment {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaKind: "image" | "video";
  position: number;
  url: string | null;
}

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function mapThread(row: any): DirectThread {
  return {
    threadId: row.thread_id,
    otherUserId: row.other_user_id,
    otherUsername: row.other_username,
    otherDisplayName: row.other_display_name || row.other_username,
    otherAvatarPath: row.other_avatar_path ?? null,
    lastMessageId: row.last_message_id ?? null,
    lastMessageBody: row.last_message_body ?? null,
    lastMessageSenderId: row.last_message_sender_id ?? null,
    lastMessageAt: row.last_message_at ?? null,
    unreadCount: Number(row.unread_count ?? 0),
  };
}

function mapMessage(row: any): DirectMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    clientId: row.client_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
    delivery: "sent",
    attachments: (row.chat_message_attachments ?? [])
      .map((attachment: any) => ({
        id: attachment.id,
        storagePath: attachment.storage_path,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        fileSize: Number(attachment.file_size ?? 0),
        mediaKind: attachment.media_kind,
        position: Number(attachment.position ?? 0),
        url: null,
      }))
      .sort((a: DirectMessageAttachment, b: DirectMessageAttachment) => a.position - b.position),
  };
}

async function resolveSignedAttachmentUrls(messages: DirectMessage[]) {
  const paths = messages.flatMap((message) =>
    message.attachments.map((attachment) => attachment.storagePath),
  );
  if (paths.length === 0) return messages;

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return messages;

  const urls = new Map<string, string>();
  data.forEach((item: any, index: number) => {
    const path = item.path ?? paths[index];
    if (path && item.signedUrl) urls.set(path, item.signedUrl);
  });
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: urls.get(attachment.storagePath) ?? null,
    })),
  }));
}

function extractBroadcastReference(payload: any) {
  const envelope = payload?.payload ?? payload;
  const table = envelope?.table ?? envelope?.table_name;
  const record = envelope?.record ?? envelope?.new ?? payload?.new;
  const threadId = envelope?.thread_id ?? record?.thread_id;
  const recordId = envelope?.record_id ?? record?.id;
  return { table, threadId, recordId };
}

function notifyDirectChatCleared(threadId: string) {
  window.dispatchEvent(new CustomEvent(DIRECT_CHAT_CLEARED_EVENT, {
    detail: { threadId },
  }));
}

export function useDirectMessageThreads() {
  const { user, isRealtimeAuthenticated } = useUser();
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadTimerRef = useRef<number>();

  const reload = useCallback(async () => {
    if (!isRealtimeAuthenticated) {
      setThreads([]);
      setError("即時協作需要重新登入後才能使用。");
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await database.rpc("list_direct_chat_threads");
    if (queryError) {
      setError("訊息服務尚未啟用或目前無法連線。");
    } else {
      setThreads((data ?? []).map(mapThread));
      setError(null);
    }
    setLoading(false);
  }, [isRealtimeAuthenticated]);

  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => void reload(), 120);
  }, [reload]);

  const handleInboxChange = useCallback((payload: any) => {
    const { table, threadId } = extractBroadcastReference(payload);
    if (table === "chat_history_clears" && threadId) {
      notifyDirectChatCleared(threadId);
    }
    scheduleReload();
  }, [scheduleReload]);

  useEffect(() => {
    void reload();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
  }, [reload]);

  useEffect(() => {
    if (!isRealtimeAuthenticated || !user?.userId) return;
    let active = true;
    let inbox: ReturnType<typeof supabase.channel> | null = null;
    void authorizePrivateRealtime().then((authorized) => {
      if (!active || !authorized) return;
      inbox = supabase
        .channel(`chat-inbox:${user.userId}`, { config: { private: true } })
        .on("broadcast", { event: "INSERT" }, handleInboxChange)
        .on("broadcast", { event: "UPDATE" }, handleInboxChange)
        .subscribe();
    });
    return () => {
      active = false;
      if (inbox) void supabase.removeChannel(inbox);
    };
  }, [handleInboxChange, isRealtimeAuthenticated, user?.userId]);

  const threadSignature = threads.map((thread) => thread.threadId).sort().join(":");
  useEffect(() => {
    if (!isRealtimeAuthenticated || !threadSignature) return;
    let active = true;
    let channels: Array<ReturnType<typeof supabase.channel>> = [];
    void authorizePrivateRealtime().then((authorized) => {
      if (!active || !authorized) return;
      channels = threads.map((thread) =>
        supabase
          .channel(`chat:${thread.threadId}`, { config: { private: true } })
          .on("broadcast", { event: "INSERT" }, scheduleReload)
          .on("broadcast", { event: "UPDATE" }, scheduleReload)
          .subscribe(),
      );
    });
    return () => {
      active = false;
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [isRealtimeAuthenticated, scheduleReload, threadSignature]);

  const startDirectChat = useCallback(
    async (otherUserId: string) => {
      if (!isRealtimeAuthenticated) return null;
      const { data, error: startError } = await database.rpc("start_direct_chat", {
        p_other_user_id: otherUserId,
      });
      if (startError || typeof data !== "string") {
        setError("無法建立私訊，請確認即時服務連線後再試。");
        return null;
      }
      await reload();
      return data as string;
    },
    [isRealtimeAuthenticated, reload],
  );

  const clearDirectChat = useCallback(
    async (threadId: string) => {
      if (!isRealtimeAuthenticated || !threadId) return false;
      const { data, error: clearError } = await database.rpc("clear_direct_chat_history", {
        p_thread_id: threadId,
      });
      if (clearError || data !== true) {
        setError("對話刪除失敗，請稍後再試。");
        return false;
      }
      setThreads((current) => current.filter((thread) => thread.threadId !== threadId));
      notifyDirectChatCleared(threadId);
      setError(null);
      return true;
    },
    [isRealtimeAuthenticated],
  );

  const unreadCount = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads],
  );

  return { threads, unreadCount, loading, error, reload, startDirectChat, clearDirectChat };
}

export function useDirectMessages(threadId: string | null) {
  const { user, isRealtimeAuthenticated } = useUser();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [readByOtherAt, setReadByOtherAt] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimersRef = useRef(new Map<string, number>());
  const persistErrorRef = useRef<string | null>(null);

  const loadReadReceipts = useCallback(async () => {
    if (!threadId || !user?.userId || !isRealtimeAuthenticated) return;
    const { data } = await database
      .from("chat_read_receipts")
      .select("user_id,last_read_at")
      .eq("thread_id", threadId)
      .neq("user_id", user.userId)
      .order("last_read_at", { ascending: false })
      .limit(1);
    setReadByOtherAt(data?.[0]?.last_read_at ?? null);
  }, [isRealtimeAuthenticated, threadId, user?.userId]);

  const markRead = useCallback(
    async (messageId?: string | null) => {
      if (!threadId || !isRealtimeAuthenticated) return;
      await database.rpc("mark_chat_thread_read", {
        p_thread_id: threadId,
        p_message_id: messageId ?? null,
      });
    },
    [isRealtimeAuthenticated, threadId],
  );

  const loadLatest = useCallback(async () => {
    if (!threadId || !isRealtimeAuthenticated) {
      setMessages([]);
      return;
    }

    setLoading(true);
    const [messageResult, clearResult] = await Promise.all([
      database
        .from("chat_messages")
        .select(MESSAGE_SELECT)
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE),
      database
        .from("chat_history_clears")
        .select("cleared_at")
        .eq("thread_id", threadId)
        .maybeSingle(),
    ]);
    const { data, error: queryError } = messageResult;
    if (queryError) {
      setError("訊息載入失敗，已保留目前畫面與未送出內容。");
    } else {
      const latest = await resolveSignedAttachmentUrls((data ?? []).map(mapMessage).reverse());
      setMessages((current) => replaceVisibleDirectMessages(
        current,
        latest,
        clearResult.data?.cleared_at ?? null,
      ));
      setHasMore((data?.length ?? 0) === MESSAGE_PAGE_SIZE);
      setError(null);
      const lastMessage = latest.at(-1);
      if (lastMessage) void markRead(lastMessage.id);
    }
    setLoading(false);
    void loadReadReceipts();
  }, [isRealtimeAuthenticated, loadReadReceipts, markRead, threadId]);

  const loadVisibleMessage = useCallback(async (recordId: string) => {
    if (!threadId || !recordId || !isRealtimeAuthenticated) return null;
    const { data, error: queryError } = await database
      .from("chat_messages")
      .select(MESSAGE_SELECT)
      .eq("thread_id", threadId)
      .eq("id", recordId)
      .is("deleted_at", null)
      .maybeSingle();

    if (queryError) {
      void loadLatest();
      return null;
    }
    if (!data) {
      setMessages((current) => current.filter((message) => message.id !== recordId));
      return null;
    }

    const [message] = await resolveSignedAttachmentUrls([mapMessage(data)]);
    setMessages((current) => mergeMessages(current, [message]));
    return message;
  }, [isRealtimeAuthenticated, loadLatest, threadId]);

  const loadMore = useCallback(async () => {
    const oldest = messages.find((message) => message.delivery === "sent");
    if (!threadId || !oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error: queryError } = await database
      .from("chat_messages")
      .select(MESSAGE_SELECT)
      .eq("thread_id", threadId)
      .is("deleted_at", null)
      .lt("created_at", oldest.createdAt)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (!queryError) {
      const older = await resolveSignedAttachmentUrls((data ?? []).map(mapMessage).reverse());
      setMessages((current) => mergeMessages(current, older));
      setHasMore((data?.length ?? 0) === MESSAGE_PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, messages, threadId]);

  const persistMessage = useCallback(
    async (clientId: string, body: string, files: File[] = []) => {
      if (!threadId || !user?.userId || !isRealtimeAuthenticated) return null;
      persistErrorRef.current = null;
      const uploadedPaths: string[] = [];
      const attachments: Array<Record<string, string | number>> = [];

      for (const [index, file] of files.entries()) {
        const storagePath = createDirectMessageMediaPath(
          threadId,
          user.userId,
          clientId,
          file,
          index,
        );
        const mediaKind = getDirectMessageMediaKind(file);
        if (!mediaKind) return null;

        const { error: uploadError } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(
          storagePath,
          file,
          { contentType: file.type, cacheControl: "3600", upsert: false },
        );
        if (uploadError) {
          console.error("Direct-message media upload failed", JSON.stringify(uploadError));
          persistErrorRef.current = describeDirectMessageFailure(
            uploadError,
            "圖片無法寫入聊天室儲存空間，請稍後再試。",
          );
          if (uploadedPaths.length > 0) {
            await supabase.storage.from(CHAT_MEDIA_BUCKET).remove(uploadedPaths);
          }
          return null;
        }
        uploadedPaths.push(storagePath);
        attachments.push({
          storage_path: storagePath,
          file_name: file.name.slice(0, 255),
          mime_type: file.type,
          file_size: file.size,
          media_kind: mediaKind,
        });
      }

      const { data: messageId, error: insertError } = await database.rpc("send_direct_chat_message", {
        p_thread_id: threadId,
        p_client_id: clientId,
        p_body: body,
        p_attachments: attachments,
      });

      let savedRow: any = null;
      if (!insertError && typeof messageId === "string") {
        const { data } = await database
          .from("chat_messages")
          .select(MESSAGE_SELECT)
          .eq("id", messageId)
          .maybeSingle();
        savedRow = data;
      }

      // A network failure may happen after the database committed. The stable
      // client ID makes retry idempotent and prevents duplicate messages.
      if (!savedRow) {
        const { data: existing } = await database
          .from("chat_messages")
          .select(MESSAGE_SELECT)
          .eq("sender_id", user.userId)
          .eq("client_id", clientId)
          .maybeSingle();
        savedRow = existing;
      }

      if (savedRow) {
        const [saved] = await resolveSignedAttachmentUrls([mapMessage(savedRow)]);
        return saved;
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove(uploadedPaths);
      }
      if (insertError) {
        console.error("Direct-message attachment record failed", JSON.stringify(insertError));
        persistErrorRef.current = describeDirectMessageFailure(
          insertError,
          "圖片已上傳，但無法建立聊天室訊息，請稍後再試。",
        );
      }
      return null;
    },
    [isRealtimeAuthenticated, threadId, user?.userId],
  );

  const sendMessage = useCallback(
    async (rawBody: string, files: File[] = []) => {
      const body = rawBody.trim();
      const validation = validateDirectMessageFiles(files);
      if (validation.error) {
        setError(validation.error);
        return false;
      }
      if (!threadId || !user?.userId || (!body && files.length === 0) || body.length > 5_000) {
        return false;
      }
      const clientId = createClientId();
      const optimistic: DirectMessage = {
        id: `optimistic:${clientId}`,
        threadId,
        senderId: user.userId,
        clientId,
        body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        delivery: "sending",
        attachments: files.map((file, index) => ({
          id: `optimistic-attachment:${clientId}:${index}`,
          storagePath: "",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          mediaKind: getDirectMessageMediaKind(file) ?? "image",
          position: index,
          url: URL.createObjectURL(file),
        })),
      };
      setMessages((current) => mergeMessages(current, [optimistic]));

      const saved = await persistMessage(clientId, body, files);
      optimistic.attachments.forEach((attachment) => {
        if (attachment.url?.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
      });
      if (saved) {
        setMessages((current) => mergeMessages(current, [saved]));
        setError(null);
        return true;
      }

      setError(files.length > 0
        ? persistErrorRef.current || "照片或影片上傳失敗，已保留選取內容，請再試一次。"
        : null);
      setMessages((current) => files.length > 0
        ? current.filter((message) => message.clientId !== clientId)
        : current.map((message) =>
          message.clientId === clientId ? { ...message, delivery: "failed" } : message,
        ));
      return false;
    },
    [persistMessage, threadId, user?.userId],
  );

  const retryMessage = useCallback(
    async (clientId: string) => {
      const failed = messages.find(
        (message) => message.clientId === clientId && message.delivery === "failed",
      );
      if (!failed) return false;
      setMessages((current) =>
        current.map((message) =>
          message.clientId === clientId ? { ...message, delivery: "sending" } : message,
        ),
      );
      const saved = await persistMessage(clientId, failed.body);
      if (saved) {
        setMessages((current) => mergeMessages(current, [saved]));
        return true;
      }
      setMessages((current) =>
        current.map((message) =>
          message.clientId === clientId ? { ...message, delivery: "failed" } : message,
        ),
      );
      return false;
    },
    [messages, persistMessage],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!threadId || !isRealtimeAuthenticated || !messageId) return false;
      const { data, error: deleteError } = await database.rpc("delete_direct_chat_message", {
        p_message_id: messageId,
      });
      if (deleteError || data?.deleted !== true) {
        setError("訊息刪除失敗，請確認權限或稍後再試。");
        return false;
      }
      const storagePaths = Array.isArray(data.storage_paths) ? data.storage_paths : [];
      if (storagePaths.length > 0) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove(storagePaths);
      }
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? {
            ...message,
            body: "此訊息已刪除",
            attachments: [],
            deletedAt: new Date().toISOString(),
          }
          : message
      )));
      setError(null);
      return true;
    },
    [isRealtimeAuthenticated, threadId],
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!user?.userId || !threadId || !channelRef.current) return;
      const now = Date.now();
      if (isTyping && now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
      lastTypingSentRef.current = now;
      void channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: user.userId, isTyping },
      });
    },
    [threadId, user?.userId],
  );

  useEffect(() => {
    if (!threadId) return;
    const handleCleared = (event: Event) => {
      const clearedThreadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      if (clearedThreadId !== threadId) return;
      setMessages([]);
      setHasMore(false);
      setReadByOtherAt(null);
      setTypingUsers([]);
    };
    window.addEventListener(DIRECT_CHAT_CLEARED_EVENT, handleCleared);
    return () => window.removeEventListener(DIRECT_CHAT_CLEARED_EVENT, handleCleared);
  }, [threadId]);

  useEffect(() => {
    setMessages([]);
    setTypingUsers([]);
    setReadByOtherAt(null);
    if (!threadId || !user?.userId || !isRealtimeAuthenticated) return;
    let active = true;
    void loadLatest();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void authorizePrivateRealtime().then((authorized) => {
      if (!active || !authorized) return;
      channel = supabase.channel(`chat:${threadId}`, { config: { private: true } });
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "INSERT" }, (payload) => {
          if (!active) return;
          const { table, threadId: changedThreadId, recordId } = extractBroadcastReference(payload);
          if (table === "chat_read_receipts") {
            void loadReadReceipts();
          } else if (table === "chat_messages" && changedThreadId === threadId && recordId) {
            void loadVisibleMessage(recordId).then((message) => {
              if (message && message.senderId !== user.userId) void markRead(message.id);
            });
          }
        })
        .on("broadcast", { event: "UPDATE" }, (payload) => {
          const { table, threadId: changedThreadId, recordId } = extractBroadcastReference(payload);
          if (table === "chat_read_receipts") void loadReadReceipts();
          else if (table === "chat_messages" && changedThreadId === threadId && recordId) {
            void loadVisibleMessage(recordId);
          }
        })
        .on("broadcast", { event: "DELETE" }, (payload) => {
          const { table, threadId: changedThreadId, recordId } = extractBroadcastReference(payload);
          if (table === "chat_messages" && changedThreadId === threadId && recordId) {
            setMessages((current) => current.filter((message) => message.id !== recordId));
          }
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const typingUserId = payload?.userId;
          if (!active || !typingUserId || typingUserId === user.userId) return;
          const existingTimer = typingTimersRef.current.get(typingUserId);
          if (existingTimer) window.clearTimeout(existingTimer);
          if (!payload.isTyping) {
            typingTimersRef.current.delete(typingUserId);
            setTypingUsers((current) => current.filter((id) => id !== typingUserId));
            return;
          }
          setTypingUsers((current) =>
            current.includes(typingUserId) ? current : [...current, typingUserId],
          );
          const timer = window.setTimeout(() => {
            typingTimersRef.current.delete(typingUserId);
            setTypingUsers((current) => current.filter((id) => id !== typingUserId));
          }, TYPING_EXPIRY_MS);
          typingTimersRef.current.set(typingUserId, timer);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void loadLatest();
        });
    });

    return () => {
      active = false;
      channelRef.current = null;
      typingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      typingTimersRef.current.clear();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [
    isRealtimeAuthenticated,
    loadLatest,
    loadReadReceipts,
    loadVisibleMessage,
    markRead,
    threadId,
    user?.userId,
  ]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    typingUsers,
    readByOtherAt,
    loadMore,
    sendMessage,
    retryMessage,
    deleteMessage,
    markRead,
    sendTyping,
  };
}
