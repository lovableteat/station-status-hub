import { useState, useEffect, useCallback, useRef } from "react";
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

export function useUserPresence() {
  const { user } = useUser();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [currentModule, setCurrentModule] = useState<string>("dashboard");
  const presenceChannelRef = useRef<any>(null);

  // Track current module
  const updateCurrentModule = useCallback((module: string) => {
    setCurrentModule(module);
    if (presenceChannelRef.current && user) {
      presenceChannelRef.current.track({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastSeen: new Date().toISOString(),
        currentModule: module,
        timestamp: Date.now()
      });
    }
  }, [user]);

  // Track editing state
  const updateEditingState = useCallback((editingInfo?: { module: string; itemId?: string; itemType?: string }) => {
    if (presenceChannelRef.current && user) {
      presenceChannelRef.current.track({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastSeen: new Date().toISOString(),
        currentModule,
        isEditing: editingInfo,
        timestamp: Date.now()
      });
    }
  }, [user, currentModule]);

  useEffect(() => {
    if (!user) return;

    // Create presence channel
    const channel = supabase.channel('user_presence', {
      config: {
        presence: {
          key: user.userId,
        },
      },
    });

    presenceChannelRef.current = channel;

    // Listen to presence events
    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const users: OnlineUser[] = [];
        
        Object.values(presenceState).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.userId !== user.userId) {
              users.push({
                userId: presence.userId,
                username: presence.username,
                displayName: presence.displayName,
                role: presence.role,
                lastSeen: presence.lastSeen,
                currentModule: presence.currentModule,
                isEditing: presence.isEditing
              });
            }
          });
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track initial presence
          await channel.track({
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            lastSeen: new Date().toISOString(),
            currentModule: 'dashboard',
            timestamp: Date.now()
          });
        }
      });

    // Cleanup on unmount
    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [user]);

  // Update presence every 30 seconds to keep it alive
  useEffect(() => {
    if (!user || !presenceChannelRef.current) return;

    const interval = setInterval(() => {
      presenceChannelRef.current?.track({
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastSeen: new Date().toISOString(),
        currentModule,
        timestamp: Date.now()
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [user, currentModule]);

  return {
    onlineUsers,
    updateCurrentModule,
    updateEditingState,
    totalOnlineUsers: onlineUsers.length + 1 // +1 for current user
  };
}
