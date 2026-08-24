import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { authorizePrivateRealtime } from "@/lib/authorizePrivateRealtime";

export type PcbViewMode = "2d" | "3d";
export type PcbAccessMode = "editor" | "viewer";

export interface PcbProjectPeer {
  displayName: string;
  dirty: boolean;
  projectId: string;
  projectName: string;
  tabId: string;
  userId: string;
  username: string;
  viewMode: PcbViewMode;
  accessMode: PcbAccessMode;
}

interface CurrentUser {
  displayName: string;
  userId: string;
  username: string;
}

function flattenPresenceState(state: Record<string, unknown[]>): PcbProjectPeer[] {
  const entries = Object.values(state)
    .flat()
    .filter((entry): entry is PcbProjectPeer => {
      if (!entry || typeof entry !== "object") return false;
      const peer = entry as Partial<PcbProjectPeer>;
      return typeof peer.userId === "string"
        && typeof peer.displayName === "string"
        && typeof peer.tabId === "string"
        && typeof peer.projectId === "string"
        && (peer.accessMode === "editor" || peer.accessMode === "viewer")
        && (peer.viewMode === "2d" || peer.viewMode === "3d");
    });

  return [...new Map(entries.map((peer) => [peer.tabId, peer])).values()];
}

export function usePcbProjectPresence({
  dirty,
  projectId,
  projectName,
  user,
  viewMode,
  accessMode,
  clientId,
  onProjectSaved,
}: {
  dirty: boolean;
  projectId: string;
  projectName: string;
  user: CurrentUser | null;
  viewMode: PcbViewMode;
  accessMode: PcbAccessMode;
  clientId?: string;
  onProjectSaved?: () => void;
}) {
  const { isRealtimeAuthenticated } = useUser();
  const [peers, setPeers] = useState<PcbProjectPeer[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const trackConfirmedRef = useRef(false);
  const tabIdRef = useRef(clientId || `pcb-tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const onProjectSavedRef = useRef(onProjectSaved);
  onProjectSavedRef.current = onProjectSaved;

  const payload = useMemo<PcbProjectPeer | null>(() => user ? {
    displayName: user.displayName || user.username,
    dirty,
    projectId,
    projectName,
    tabId: tabIdRef.current,
    userId: user.userId,
    username: user.username,
    viewMode,
    accessMode,
  } : null, [accessMode, dirty, projectId, projectName, user, viewMode]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const presenceUserId = payload?.userId ?? null;

  useEffect(() => {
    if (!projectId || !presenceUserId) {
      setConnected(false);
      setPeers([]);
      return undefined;
    }

    let disposed = false;
    let channel: RealtimeChannel | null = null;
    subscribedRef.current = false;
    trackConfirmedRef.current = false;

    const syncPresence = () => {
      if (!channel) return;
      const presenceState = channel.presenceState() as Record<string, unknown[]>;
      const nextPeers = flattenPresenceState(presenceState);
      setPeers(nextPeers.filter((peer) => peer.tabId !== tabIdRef.current));
      const ownSessionVisible = nextPeers.some((peer) => peer.tabId === tabIdRef.current);
      setConnected(subscribedRef.current && trackConfirmedRef.current && ownSessionVisible);
    };

    const trackCurrentPayload = async () => {
      const currentPayload = payloadRef.current;
      if (!channel || !subscribedRef.current || !currentPayload) return;
      const result = await channel.track(currentPayload);
      if (channelRef.current !== channel) return;
      trackConfirmedRef.current = result === "ok";
      if (result !== "ok") setConnected(false);
      syncPresence();
    };

    const connect = async () => {
      if (isRealtimeAuthenticated && !(await authorizePrivateRealtime())) {
        if (!disposed) setConnected(false);
        return;
      }
      if (disposed) return;

      const topic = isRealtimeAuthenticated
        ? `presence:workspace:pcb:${projectId}`
        : `pcb_project_presence:${projectId}`;
      channel = supabase.channel(topic, {
        config: {
          private: isRealtimeAuthenticated,
          presence: { key: `${presenceUserId}:${tabIdRef.current}` },
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;
      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence)
        .on("broadcast", { event: "project-saved" }, ({ payload: eventPayload }) => {
          const event = eventPayload as { projectId?: unknown; senderClientId?: unknown };
          if (event.projectId !== projectId || event.senderClientId === tabIdRef.current) return;
          onProjectSavedRef.current?.();
        })
        .subscribe((status) => {
          subscribedRef.current = status === "SUBSCRIBED";
          if (subscribedRef.current) void trackCurrentPayload();
          else setConnected(false);
        });
    };
    void connect();

    return () => {
      disposed = true;
      channelRef.current = null;
      subscribedRef.current = false;
      trackConfirmedRef.current = false;
      setConnected(false);
      if (channel) {
        void channel.untrack().catch(() => undefined);
        void supabase.removeChannel(channel);
      }
    };
  }, [isRealtimeAuthenticated, presenceUserId, projectId]);

  useEffect(() => {
    if (!payload || !channelRef.current || !subscribedRef.current) return;
    const channel = channelRef.current;
    void channel.track(payload).then((result) => {
      if (channelRef.current !== channel) return;
      trackConfirmedRef.current = result === "ok";
      if (result !== "ok") setConnected(false);
    });
  }, [payload]);

  const broadcastProjectSaved = useCallback(async (revision: string) => {
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current) return false;
    const result = await channel.send({
      type: "broadcast",
      event: "project-saved",
      payload: {
        projectId,
        revision,
        senderClientId: tabIdRef.current,
      },
    });
    return result === "ok";
  }, [projectId]);

  return { broadcastProjectSaved, connected, peers, tabId: tabIdRef.current };
}
