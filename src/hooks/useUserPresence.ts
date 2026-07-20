import {
  createElement,
  createContext,
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

interface OnlineUser {
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

interface UserPresenceContextValue {
  onlineUsers: OnlineUser[];
  updateCurrentModule: (module: string) => void;
  updateEditingState: (editingInfo?: OnlineUser["isEditing"]) => void;
  totalOnlineUsers: number;
}

const UserPresenceContext = createContext<UserPresenceContextValue | null>(null);

export function UserPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [currentModule, setCurrentModule] = useState("dashboard");
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const trackPresence = useCallback(
    (module: string, editingInfo?: OnlineUser["isEditing"]) => {
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
    [user]
  );

  const updateCurrentModule = useCallback(
    (module: string) => {
      setCurrentModule(module);
      trackPresence(module);
    },
    [trackPresence]
  );

  const updateEditingState = useCallback(
    (editingInfo?: OnlineUser["isEditing"]) => {
      trackPresence(currentModule, editingInfo);
    },
    [currentModule, trackPresence]
  );

  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    const channel = supabase.channel("user_presence", {
      config: {
        presence: {
          key: user.userId,
        },
      },
    });

    presenceChannelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const users: OnlineUser[] = [];
        const presenceState = channel.presenceState();

        Object.values(presenceState).forEach((presences) => {
          presences.forEach((presence) => {
            const onlinePresence = presence as unknown as OnlineUser;
            if (onlinePresence.userId !== user.userId) {
              users.push(onlinePresence);
            }
          });
        });

        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            lastSeen: new Date().toISOString(),
            currentModule: "dashboard",
            timestamp: Date.now(),
          });
        }
      });

    return () => {
      presenceChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const interval = window.setInterval(() => {
      trackPresence(currentModule);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [currentModule, trackPresence, user]);

  const value = useMemo<UserPresenceContextValue>(
    () => ({
      onlineUsers,
      updateCurrentModule,
      updateEditingState,
      totalOnlineUsers: onlineUsers.length,
    }),
    [onlineUsers, updateCurrentModule, updateEditingState]
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
