import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { REALTIME_COLLABORATION_V2_ENABLED } from "@/lib/realtimeCollaborationConfig";
import {
  createPresenceKey,
  createPresenceSessionId,
  createPresenceTransitionQueue,
  isCurrentPresenceSession,
  selectLatestOnlineUsers,
} from "./presenceSession.mjs";

export interface OnlineUser {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  lastSeen: string;
  currentModule?: string;
  sessionId?: string;
  timestamp?: number;
  isEditing?: {
    module: string;
    itemId?: string;
    itemType?: string;
  };
}

export type PresenceConnectionState =
  | "connecting"
  | "subscribed"
  | "tracking"
  | "synced"
  | "reconnecting"
  | "offline"
  | "error";

type CompatibleConnectionStatus = "connecting" | "online" | "offline" | "error";

interface UserPresenceContextValue {
  allOnlineUsers: OnlineUser[];
  onlineUsers: OnlineUser[];
  totalOnlineUsers: number;
  otherOnlineUsersCount: number;
  connectionState: PresenceConnectionState;
  connectionStatus: CompatibleConnectionStatus;
  isRealtimeAvailable: boolean;
  retryPresence: () => void;
  updateCurrentModule: (module: string) => void;
  updateEditingState: (editingInfo?: OnlineUser["isEditing"]) => void;
}

const UserPresenceContext = createContext<UserPresenceContextValue | null>(null);
const GLOBAL_PRESENCE_TOPIC = "presence:global";
const LEGACY_PRESENCE_TOPIC = "user_presence";
const EDITING_STATE_DEBOUNCE_MS = 400;

type PresenceChannel = ReturnType<typeof supabase.channel>;

interface ActivePresenceSession {
  channel: PresenceChannel;
  generation: number;
  identity: Pick<
    OnlineUser,
    "userId" | "username" | "displayName" | "role" | "sessionId"
  >;
  trackConfirmed: boolean;
  firstRosterSynced: boolean;
  lastPayloadKey: string;
}

function containsSession(
  state: Record<string, Array<Record<string, unknown>>>,
  userId: string,
  sessionId: string,
) {
  return Object.values(state).some((presences) =>
    presences.some(
      (presence) => presence.userId === userId && presence.sessionId === sessionId,
    ),
  );
}

function compatibleStatus(state: PresenceConnectionState): CompatibleConnectionStatus {
  if (state === "synced") return "online";
  if (["connecting", "subscribed", "tracking", "reconnecting"].includes(state)) {
    return "connecting";
  }
  return state;
}

export function UserPresenceProvider({ children }: { children: ReactNode }) {
  const { user, isRealtimeAuthenticated } = useUser();
  const userId = user?.userId ?? null;
  const username = user?.username ?? "";
  const displayName = user?.displayName ?? "";
  const role = user?.role ?? "";
  const [allOnlineUsers, setAllOnlineUsers] = useState<OnlineUser[]>([]);
  const [connectionState, setConnectionState] =
    useState<PresenceConnectionState>("offline");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const currentEditingRef = useRef<OnlineUser["isEditing"]>();
  const currentModuleRef = useRef("dashboard");
  const editingTimerRef = useRef<number>();
  const sessionIdRef = useRef(createPresenceSessionId());
  const presenceGenerationRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(userId);
  const activePresenceRef = useRef<ActivePresenceSession | null>(null);
  const presenceTransitionsRef = useRef(createPresenceTransitionQueue());
  activeUserIdRef.current = userId;

  const isCurrentActiveSession = useCallback((session: ActivePresenceSession) => {
    return (
      activePresenceRef.current === session &&
      isCurrentPresenceSession(
        presenceGenerationRef.current,
        session.generation,
        activeUserIdRef.current,
        session.identity.userId,
      )
    );
  }, []);

  const syncRoster = useCallback(
    (session: ActivePresenceSession) => {
      if (!isCurrentActiveSession(session)) return;
      const state = session.channel.presenceState() as unknown as Record<
        string,
        Array<Record<string, unknown>>
      >;
      const roster = selectLatestOnlineUsers(state) as OnlineUser[];
      setAllOnlineUsers(roster);

      const ownSessionVisible = containsSession(
        state,
        session.identity.userId,
        session.identity.sessionId ?? "",
      );
      session.firstRosterSynced = session.firstRosterSynced || ownSessionVisible;
      if (session.trackConfirmed && session.firstRosterSynced) {
        setConnectionState("synced");
      }
    },
    [isCurrentActiveSession],
  );

  const publishPresence = useCallback(
    async (
      module: string,
      editingInfo = currentEditingRef.current,
      force = false,
    ) => {
      const session = activePresenceRef.current;
      if (!session || !isCurrentActiveSession(session)) return false;

      const payloadKey = JSON.stringify({ module, editingInfo: editingInfo ?? null });
      if (!force && payloadKey === session.lastPayloadKey) return true;
      session.lastPayloadKey = payloadKey;

      const response = await session.channel.track({
        ...session.identity,
        lastSeen: new Date().toISOString(),
        currentModule: module,
        isEditing: editingInfo,
        timestamp: Date.now(),
      });
      if (!isCurrentActiveSession(session)) return false;

      if (response !== "ok") {
        session.lastPayloadKey = "";
        setConnectionState((current) => (current === "synced" ? "reconnecting" : "error"));
        return false;
      }

      session.trackConfirmed = true;
      syncRoster(session);
      return true;
    },
    [isCurrentActiveSession, syncRoster],
  );

  const updateCurrentModule = useCallback(
    (module: string) => {
      if (!module || currentModuleRef.current === module) return;
      currentModuleRef.current = module;
      void publishPresence(module);
    },
    [publishPresence],
  );

  const updateEditingState = useCallback(
    (editingInfo?: OnlineUser["isEditing"]) => {
      currentEditingRef.current = editingInfo;
      if (editingTimerRef.current) window.clearTimeout(editingTimerRef.current);
      editingTimerRef.current = window.setTimeout(() => {
        void publishPresence(currentModuleRef.current, currentEditingRef.current);
      }, EDITING_STATE_DEBOUNCE_MS);
    },
    [publishPresence],
  );

  const retryPresence = useCallback(() => {
    if (!userId) return;
    setConnectionState("reconnecting");
    setRetryGeneration((current) => current + 1);
  }, [userId]);

  useEffect(() => {
    const transitions = presenceTransitionsRef.current;
    const generation = presenceGenerationRef.current + 1;
    presenceGenerationRef.current = generation;
    setAllOnlineUsers([]);

    if (!userId) setConnectionState("offline");
    else setConnectionState(retryGeneration > 0 ? "reconnecting" : "connecting");

    let disposed = false;

    void transitions.enqueue(async () => {
      const previousSession = activePresenceRef.current;
      if (previousSession) {
        activePresenceRef.current = null;
        await previousSession.channel.untrack().catch(() => undefined);
        await supabase.removeChannel(previousSession.channel).catch(() => undefined);
      }

      if (
        disposed ||
        !userId ||
        !isCurrentPresenceSession(
          presenceGenerationRef.current,
          generation,
          activeUserIdRef.current,
          userId,
        )
      ) {
        return;
      }

      if (REALTIME_COLLABORATION_V2_ENABLED && !isRealtimeAuthenticated) {
        setConnectionState("error");
        return;
      }

      if (isRealtimeAuthenticated) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (disposed || sessionError || !accessToken) {
          setConnectionState("error");
          return;
        }
        try {
          await supabase.realtime.setAuth(accessToken);
        } catch (error) {
          console.warn("Unable to authorize private presence channel", error);
          if (!disposed) setConnectionState("error");
          return;
        }
      }

      const session: ActivePresenceSession = {
        generation,
        identity: {
          userId,
          username,
          displayName,
          role,
          sessionId: sessionIdRef.current,
        },
        channel: supabase.channel(
          isRealtimeAuthenticated ? GLOBAL_PRESENCE_TOPIC : LEGACY_PRESENCE_TOPIC,
          {
            config: {
              private: isRealtimeAuthenticated,
              presence: { key: createPresenceKey(userId, sessionIdRef.current) },
            },
          },
        ),
        trackConfirmed: false,
        firstRosterSynced: false,
        lastPayloadKey: "",
      };
      activePresenceRef.current = session;

      session.channel
        .on("presence", { event: "sync" }, () => syncRoster(session))
        .on("presence", { event: "join" }, () => syncRoster(session))
        .on("presence", { event: "leave" }, () => syncRoster(session))
        .subscribe((status) => {
          if (!isCurrentActiveSession(session)) return;

          if (status === "SUBSCRIBED") {
            setConnectionState("subscribed");
            setConnectionState("tracking");
            void publishPresence(currentModuleRef.current, currentEditingRef.current, true);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionState((current) =>
              current === "synced" ? "reconnecting" : "error",
            );
          } else if (status === "CLOSED") {
            setConnectionState(disposed ? "offline" : "reconnecting");
          }
        });
    });

    return () => {
      disposed = true;
      if (editingTimerRef.current) window.clearTimeout(editingTimerRef.current);
      if (presenceGenerationRef.current === generation) {
        presenceGenerationRef.current += 1;
      }
      setConnectionState("offline");
      setAllOnlineUsers([]);

      void transitions.enqueue(async () => {
        const activeSession = activePresenceRef.current;
        if (!activeSession || activeSession.generation !== generation) return;
        activePresenceRef.current = null;
        await activeSession.channel.untrack().catch(() => undefined);
        await supabase.removeChannel(activeSession.channel).catch(() => undefined);
      });
    };
  }, [
    displayName,
    isCurrentActiveSession,
    isRealtimeAuthenticated,
    publishPresence,
    retryGeneration,
    role,
    syncRoster,
    userId,
    username,
  ]);

  useEffect(() => {
    if (!userId) return;
    const handleOffline = () => setConnectionState("reconnecting");
    const handleOnline = () => retryPresence();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [retryPresence, userId]);

  const onlineUsers = useMemo(
    () => allOnlineUsers.filter((onlineUser) => onlineUser.userId !== userId),
    [allOnlineUsers, userId],
  );
  const connectionStatus = compatibleStatus(connectionState);

  const value = useMemo<UserPresenceContextValue>(
    () => ({
      allOnlineUsers,
      onlineUsers,
      totalOnlineUsers: allOnlineUsers.length,
      otherOnlineUsersCount: onlineUsers.length,
      connectionState,
      connectionStatus,
      isRealtimeAvailable: connectionState === "synced",
      retryPresence,
      updateCurrentModule,
      updateEditingState,
    }),
    [
      allOnlineUsers,
      connectionState,
      connectionStatus,
      onlineUsers,
      retryPresence,
      updateCurrentModule,
      updateEditingState,
    ],
  );

  return createElement(UserPresenceContext.Provider, { value }, children);
}

export function useUserPresence() {
  const context = useContext(UserPresenceContext);
  if (!context) {
    throw new Error("useUserPresence must be used within UserPresenceProvider");
  }
  return context;
}
