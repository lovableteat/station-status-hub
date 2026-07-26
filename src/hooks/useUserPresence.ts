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
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";
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

type PresenceConnectionStatus = "connecting" | "online" | "offline" | "error";

interface UserPresenceContextValue {
  allOnlineUsers: OnlineUser[];
  onlineUsers: OnlineUser[];
  totalOnlineUsers: number;
  otherOnlineUsersCount: number;
  connectionStatus: PresenceConnectionStatus;
  updateCurrentModule: (module: string) => void;
  updateEditingState: (editingInfo?: OnlineUser["isEditing"]) => void;
}

const UserPresenceContext = createContext<UserPresenceContextValue | null>(null);

type PresenceChannel = ReturnType<typeof supabase.channel>;

interface ActivePresenceSession {
  channel: PresenceChannel;
  generation: number;
  identity: Pick<
    OnlineUser,
    "userId" | "username" | "displayName" | "role" | "sessionId"
  >;
}

export function UserPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const userId = user?.userId ?? null;
  const username = user?.username ?? "";
  const displayName = user?.displayName ?? "";
  const role = user?.role ?? "";
  const [allOnlineUsers, setAllOnlineUsers] = useState<OnlineUser[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<PresenceConnectionStatus>("offline");
  const [currentModule, setCurrentModule] = useState("dashboard");
  const currentEditingRef = useRef<OnlineUser["isEditing"]>();
  const currentModuleRef = useRef("dashboard");
  const sessionIdRef = useRef(createPresenceSessionId());
  const presenceGenerationRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(userId);
  const activePresenceRef = useRef<ActivePresenceSession | null>(null);
  const presenceTransitionsRef = useRef(createPresenceTransitionQueue());
  activeUserIdRef.current = userId;

  const trackPresence = useCallback(
    (module: string, editingInfo = currentEditingRef.current) => {
      const activeSession = activePresenceRef.current;
      if (
        !activeSession ||
        !isCurrentPresenceSession(
          presenceGenerationRef.current,
          activeSession.generation,
          activeUserIdRef.current,
          activeSession.identity.userId,
        )
      ) {
        return;
      }

      void activeSession.channel.track({
        ...activeSession.identity,
        lastSeen: new Date().toISOString(),
        currentModule: module,
        isEditing: editingInfo,
        timestamp: Date.now(),
      });
    },
    [],
  );

  const updateCurrentModule = useCallback(
    (module: string) => {
      currentModuleRef.current = module;
      setCurrentModule(module);
      trackPresence(module);
    },
    [trackPresence],
  );

  const updateEditingState = useCallback(
    (editingInfo?: OnlineUser["isEditing"]) => {
      currentEditingRef.current = editingInfo;
      trackPresence(currentModule, editingInfo);
    },
    [currentModule, trackPresence],
  );

  useEffect(() => {
    const presenceTransitions = presenceTransitionsRef.current;
    const generation = presenceGenerationRef.current + 1;
    presenceGenerationRef.current = generation;
    setAllOnlineUsers([]);
    currentEditingRef.current = undefined;
    setConnectionStatus(userId ? "connecting" : "offline");

    let disposed = false;

    void presenceTransitions.enqueue(async () => {
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

      const identity: ActivePresenceSession["identity"] = {
        userId,
        username,
        displayName,
        role,
        sessionId: sessionIdRef.current,
      };
      const channel = supabase.channel("user_presence", {
        config: {
          presence: {
            key: createPresenceKey(userId, sessionIdRef.current),
          },
        },
      });
      activePresenceRef.current = { channel, generation, identity };

      const isCurrentChannel = () =>
        activePresenceRef.current?.channel === channel &&
        isCurrentPresenceSession(
          presenceGenerationRef.current,
          generation,
          activeUserIdRef.current,
          userId,
        );

      channel
        .on("presence", { event: "sync" }, () => {
          if (!isCurrentChannel()) return;
          setAllOnlineUsers(
            selectLatestOnlineUsers(channel.presenceState()) as OnlineUser[],
          );
        })
        .subscribe(async (status) => {
          if (!isCurrentChannel()) return;

          if (status === "SUBSCRIBED") {
            setConnectionStatus("online");
            trackPresence(currentModuleRef.current);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("error");
          } else if (status === "CLOSED") {
            setConnectionStatus("offline");
          }
        });
    });

    return () => {
      disposed = true;
      if (presenceGenerationRef.current === generation) {
        presenceGenerationRef.current += 1;
      }
      setConnectionStatus("offline");
      setAllOnlineUsers([]);

      void presenceTransitions.enqueue(async () => {
        const activeSession = activePresenceRef.current;
        if (!activeSession || activeSession.generation !== generation) return;

        activePresenceRef.current = null;
        const { channel } = activeSession;
        await channel.untrack().catch(() => undefined);
        await supabase.removeChannel(channel).catch(() => undefined);
      });
    };
  }, [displayName, role, trackPresence, userId, username]);

  useEffect(() => {
    if (!userId) return;
    const interval = window.setInterval(() => trackPresence(currentModule), 30_000);
    return () => window.clearInterval(interval);
  }, [currentModule, trackPresence, userId]);

  const visibleOnlineUsers = useMemo(() => {
    if (!user || allOnlineUsers.some((onlineUser) => onlineUser.userId === user.userId)) {
      return allOnlineUsers;
    }

    // Presence sync can arrive just after the shell renders. Keep the signed-in
    // user visible immediately instead of flashing an incorrect zero count.
    return [
      {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastSeen: new Date().toISOString(),
        currentModule,
        isEditing: currentEditingRef.current,
      },
      ...allOnlineUsers,
    ];
  }, [allOnlineUsers, currentModule, user]);

  const onlineUsers = useMemo(
    () => visibleOnlineUsers.filter((onlineUser) => onlineUser.userId !== user?.userId),
    [user?.userId, visibleOnlineUsers],
  );

  const value = useMemo<UserPresenceContextValue>(
    () => ({
      allOnlineUsers: visibleOnlineUsers,
      onlineUsers,
      totalOnlineUsers: visibleOnlineUsers.length,
      otherOnlineUsersCount: onlineUsers.length,
      connectionStatus,
      updateCurrentModule,
      updateEditingState,
    }),
    [
      connectionStatus,
      onlineUsers,
      updateCurrentModule,
      updateEditingState,
      visibleOnlineUsers,
    ],
  );

  return createElement(UserPresenceContext.Provider, { value }, children);
}

export function useUserPresence() {
  const context = useContext(UserPresenceContext);
  if (!context) throw new Error("useUserPresence must be used within UserPresenceProvider");
  return context;
}
