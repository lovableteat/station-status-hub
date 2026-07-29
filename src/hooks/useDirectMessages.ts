import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { authorizePrivateRealtime } from "@/lib/authorizePrivateRealtime";

const MESSAGE_PAGE_SIZE = 40;
const TYPING_THROTTLE_MS = 500;
const TYPING_EXPIRY_MS = 2_500;
const database = supabase as any;

export interface DirectThread {
  threadId: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
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
  delivery: "sending" | "sent" | "failed";
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
    delivery: "sent",
  };
}

function mergeMessages(current: DirectMessage[], incoming: DirectMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  const optimisticByClientId = new Map(
    current.filter((message) => message.delivery !== "sent").map((message) => [message.clientId, message.id]),
  );

  incoming.forEach((message) => {
    const optimisticId = optimisticByClientId.get(message.clientId);
    if (optimisticId) byId.delete(optimisticId);
    byId.set(message.id, message);
  });

  return [...byId.values()].sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

function extractBroadcastRecord(payload: any) {
  const envelope = payload?.payload ?? payload;
  const table = envelope?.table ?? envelope?.table_name;
  const record = envelope?.record ?? envelope?.new ?? payload?.new;
  return { table, record };
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
        .on("broadcast", { event: "INSERT" }, scheduleReload)
        .on("broadcast", { event: "UPDATE" }, scheduleReload)
        .subscribe();
    });
    return () => {
      active = false;
      if (inbox) void supabase.removeChannel(inbox);
    };
  }, [isRealtimeAuthenticated, scheduleReload, user?.userId]);

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

  const unreadCount = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads],
  );

  return { threads, unreadCount, loading, error, reload, startDirectChat };
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
    const { data, error: queryError } = await database
      .from("chat_messages")
      .select("id,thread_id,sender_id,client_id,body,created_at,edited_at")
      .eq("thread_id", threadId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (queryError) {
      setError("訊息載入失敗，已保留目前畫面與未送出內容。");
    } else {
      const latest = (data ?? []).map(mapMessage).reverse();
      setMessages((current) => mergeMessages(current, latest));
      setHasMore((data?.length ?? 0) === MESSAGE_PAGE_SIZE);
      setError(null);
      const lastMessage = latest.at(-1);
      if (lastMessage) void markRead(lastMessage.id);
    }
    setLoading(false);
    void loadReadReceipts();
  }, [isRealtimeAuthenticated, loadReadReceipts, markRead, threadId]);

  const loadMore = useCallback(async () => {
    const oldest = messages.find((message) => message.delivery === "sent");
    if (!threadId || !oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error: queryError } = await database
      .from("chat_messages")
      .select("id,thread_id,sender_id,client_id,body,created_at,edited_at")
      .eq("thread_id", threadId)
      .is("deleted_at", null)
      .lt("created_at", oldest.createdAt)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (!queryError) {
      setMessages((current) => mergeMessages(current, (data ?? []).map(mapMessage).reverse()));
      setHasMore((data?.length ?? 0) === MESSAGE_PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, messages, threadId]);

  const persistMessage = useCallback(
    async (clientId: string, body: string) => {
      if (!threadId || !user?.userId || !isRealtimeAuthenticated) return null;
      const { data, error: insertError } = await database
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          sender_id: user.userId,
          client_id: clientId,
          body,
        })
        .select("id,thread_id,sender_id,client_id,body,created_at,edited_at")
        .single();
      if (!insertError && data) return mapMessage(data);

      // A network failure may happen after the database committed. The stable
      // client ID makes retry idempotent and prevents duplicate messages.
      const { data: existing } = await database
        .from("chat_messages")
        .select("id,thread_id,sender_id,client_id,body,created_at,edited_at")
        .eq("sender_id", user.userId)
        .eq("client_id", clientId)
        .maybeSingle();
      return existing ? mapMessage(existing) : null;
    },
    [isRealtimeAuthenticated, threadId, user?.userId],
  );

  const sendMessage = useCallback(
    async (rawBody: string) => {
      const body = rawBody.trim();
      if (!threadId || !user?.userId || !body || body.length > 5_000) return false;
      const clientId = createClientId();
      const optimistic: DirectMessage = {
        id: `optimistic:${clientId}`,
        threadId,
        senderId: user.userId,
        clientId,
        body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        delivery: "sending",
      };
      setMessages((current) => mergeMessages(current, [optimistic]));

      const saved = await persistMessage(clientId, body);
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
          const { table, record } = extractBroadcastRecord(payload);
          if (table === "chat_read_receipts") {
            void loadReadReceipts();
          } else if (record?.thread_id === threadId && record?.id) {
            const message = mapMessage(record);
            setMessages((current) => mergeMessages(current, [message]));
            if (message.senderId !== user.userId) void markRead(message.id);
          }
        })
        .on("broadcast", { event: "UPDATE" }, (payload) => {
          const { table, record } = extractBroadcastRecord(payload);
          if (table === "chat_read_receipts") void loadReadReceipts();
          else if (record?.thread_id === threadId && record?.id) {
            setMessages((current) => mergeMessages(current, [mapMessage(record)]));
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
    markRead,
    sendTyping,
  };
}
