import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { watchPermissionRefresh } from "@/lib/permissionRefresh.mjs";
export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  action_url: string | null;
  metadata: unknown;
};


export function useNotificationInbox(userId: string | undefined, authenticated: boolean, onReturned: (notification: NotificationRow) => void) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const scope = useRef("");
  scope.current = `${userId}:${authenticated}`;
  const seen = useRef(new Set<string>());
  const loaded = useRef(false);
  const callback = useRef(onReturned);
  callback.current = onReturned;
  const loadNotifications = useCallback(async () => {
    const version = ++request.current, account = scope.current;
    if (!userId || !authenticated) { setNotifications([]); setLoading(false); setError(null); return; }
    if (!loaded.current) setLoading(true);
    try {
      const { data, error: queryError } = await (supabase as any).from("user_notifications")
        .select("id,title,message,notification_type,is_read,created_at,reference_type,reference_id,action_url,metadata")
        .eq("recipient_id", userId).is("archived_at", null).order("created_at", { ascending: false }).limit(80);
      if (version !== request.current || scope.current !== account) return;
      if (queryError) throw queryError;
      const rows = (data || []) as NotificationRow[];
      for (const row of rows) {
        if (loaded.current && !seen.current.has(row.id) && !row.is_read && row.notification_type === "performance_review_returned") callback.current(row);
        seen.current.add(row.id);
      }
      loaded.current = true;
      setNotifications(rows);
      setError(null);
    } catch {
      if (version === request.current && scope.current === account) setError("通知暫時無法更新，已保留現有通知；連線恢復後會自動重試。");
    } finally {
      if (version === request.current && scope.current === account) setLoading(false);
    }
  }, [userId, authenticated]);
  useEffect(() => {
    seen.current.clear(); loaded.current = false; setNotifications([]);
    void loadNotifications();
    if (!userId || !authenticated) return;
    const channel = supabase.channel(`collaboration-notifications:${userId}`).on("postgres_changes", {
      event: "*", schema: "workspace", table: "user_notifications", filter: `recipient_id=eq.${userId}`,
    }, () => void loadNotifications()).subscribe(status => { if (status === "SUBSCRIBED") void loadNotifications(); });
    const stop = watchPermissionRefresh({ windowTarget: window, documentTarget: document, intervalMs: 8000, refresh: () => {
      if (navigator.onLine !== false) void loadNotifications();
    } });
    return () => { ++request.current; stop(); void supabase.removeChannel(channel); };
  }, [loadNotifications, userId, authenticated]);
  return { notifications, setNotifications, loading, error, setError, loadNotifications };
}
