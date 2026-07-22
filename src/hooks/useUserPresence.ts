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

export interface OnlineUser {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  lastSeen: string;
  currentModule?: string;
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

export function UserPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [allOnlineUsers, setAllOnlineUsers] = useState<OnlineUser[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<PresenceConnectionStatus>("offline");
  const [currentModule, setCurrentModule] = useState("dashboard");
  const currentEditingRef = useRef<OnlineUser["isEditing"]>();
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const trackPresence = useCallback(
    (module: string, editingInfo = currentEditingRef.current) => {
      if (!presenceChannelRef.current || !user) return;

      void presenceChannelRef.current.track({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastSeen: new Date().toISOString(),
        currentModule: module,
        isEditing: editingInfo,
        timestamp: Date.now(),
      });
    },
    [user],
  );

  const updateCurrentModule = useCallback(
    (module: string) => {
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
    if (!user) {
      setAllOnlineUsers([]);
      setConnectionStatus("offline");
      return;
    }

    setConnectionStatus("connecting");
    const channel = supabase.channel("user_presence", {
      config: { presence: { key: user.userId } },
    });
    presenceChannelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const usersById = new Map<string, OnlineUser>();
        Object.values(channel.presenceState()).forEach((presences) => {
          presences.forEach((presence) => {
            const candidate = presence as unknown as OnlineUser;
            if (!candidate.userId) return;
            const existing = usersById.get(candidate.userId);
            if (!existing || candidate.lastSeen > existing.lastSeen) {
              usersById.set(candidate.userId, candidate);
            }
          });
        });
        setAllOnlineUsers(
          [...usersById.values()].sort((a, b) =>
            (a.displayName || a.username).localeCompare(b.displayName || b.username, "zh-TW"),
          ),
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("online");
          trackPresence("dashboard");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("error");
        } else if (status === "CLOSED") {
          setConnectionStatus("offline");
        }
      });

    return () => {
      presenceChannelRef.current = null;
      setConnectionStatus("offline");
      void supabase.removeChannel(channel);
    };
  }, [trackPresence, user]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => trackPresence(currentModule), 30_000);
    return () => window.clearInterval(interval);
  }, [currentModule, trackPresence, user]);

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
