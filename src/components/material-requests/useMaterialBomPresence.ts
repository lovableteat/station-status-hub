import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

interface PresenceUser {
  displayName: string;
  recordId: string | null;
  tabId: string;
  userId: string;
}

interface CurrentUser {
  displayName: string;
  userId: string;
  username: string;
}

function flattenPresenceState(state: Record<string, unknown[]>) {
  return Object.values(state)
    .flat()
    .filter((entry): entry is PresenceUser => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<PresenceUser>;
      return typeof candidate.userId === "string"
        && typeof candidate.displayName === "string"
        && typeof candidate.tabId === "string";
    });
}

export function useMaterialBomPresence(
  workspaceId: string,
  user: CurrentUser | null,
  editingRecordId: string | null,
) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabIdRef = useRef(`material-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const editingRecordIdRef = useRef(editingRecordId);

  useEffect(() => {
    editingRecordIdRef.current = editingRecordId;
  }, [editingRecordId]);

  useEffect(() => {
    if (!workspaceId || !user) {
      setPeers([]);
      return undefined;
    }

    const channel = supabase.channel(`material_bom_presence:${workspaceId}`, {
      config: { presence: { key: `${user.userId}:${tabIdRef.current}` } },
    });
    channelRef.current = channel;

    const syncPresence = () => {
      const nextPeers = flattenPresenceState(channel.presenceState() as Record<string, unknown[]>);
      setPeers(nextPeers.filter((peer) => peer.tabId !== tabIdRef.current));
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          displayName: user.displayName || user.username,
          recordId: editingRecordIdRef.current,
          tabId: tabIdRef.current,
          userId: user.userId,
        } satisfies PresenceUser);
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user, workspaceId]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !user) return;
    void channel.track({
      displayName: user.displayName || user.username,
      recordId: editingRecordId,
      tabId: tabIdRef.current,
      userId: user.userId,
    } satisfies PresenceUser);
  }, [editingRecordId, user]);

  const editorsByRecordId = useMemo(() => {
    const result = new Map<string, string[]>();
    peers.forEach((peer) => {
      if (!peer.recordId) return;
      const names = result.get(peer.recordId) ?? [];
      if (!names.includes(peer.displayName)) names.push(peer.displayName);
      result.set(peer.recordId, names);
    });
    return result;
  }, [peers]);

  return {
    editorsByRecordId,
    onlineUserCount: new Set(peers.map((peer) => peer.userId)).size + (user ? 1 : 0),
  };
}
