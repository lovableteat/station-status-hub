import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type PcbViewMode = "2d" | "3d";

export interface PcbProjectPeer {
  displayName: string;
  dirty: boolean;
  projectId: string;
  projectName: string;
  tabId: string;
  userId: string;
  username: string;
  viewMode: PcbViewMode;
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
}: {
  dirty: boolean;
  projectId: string;
  projectName: string;
  user: CurrentUser | null;
  viewMode: PcbViewMode;
}) {
  const [peers, setPeers] = useState<PcbProjectPeer[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabIdRef = useRef(`pcb-tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const payload = useMemo<PcbProjectPeer | null>(() => user ? {
    displayName: user.displayName || user.username,
    dirty,
    projectId,
    projectName,
    tabId: tabIdRef.current,
    userId: user.userId,
    username: user.username,
    viewMode,
  } : null, [dirty, projectId, projectName, user, viewMode]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const presenceUserId = payload?.userId ?? null;

  useEffect(() => {
    if (!projectId || !presenceUserId) {
      setConnected(false);
      setPeers([]);
      return undefined;
    }

    const channel = supabase.channel(`pcb_project_presence:${projectId}`, {
      config: { presence: { key: `${presenceUserId}:${tabIdRef.current}` } },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      const nextPeers = flattenPresenceState(
        channel.presenceState() as Record<string, unknown[]>,
      );
      setPeers(nextPeers.filter((peer) => peer.tabId !== tabIdRef.current));
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        const isConnected = status === "SUBSCRIBED";
        setConnected(isConnected);
        const currentPayload = payloadRef.current;
        if (isConnected && currentPayload) await channel.track(currentPayload);
      });

    return () => {
      channelRef.current = null;
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [presenceUserId, projectId]);

  useEffect(() => {
    if (!payload || !channelRef.current) return;
    void channelRef.current.track(payload);
  }, [payload]);

  return { connected, peers, tabId: tabIdRef.current };
}
