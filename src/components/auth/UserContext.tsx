import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { REALTIME_COLLABORATION_V2_ENABLED } from "@/lib/realtimeCollaborationConfig";
import {
  runLoginWithTransientRetry,
  runSessionBootstrapWithDeadline,
} from "./loginRetryPolicy.mjs";

export interface User {
  userId: string;
  username: string;
  role: string;
  displayName: string;
}

export type SessionMode = "authenticated" | "legacy" | "demo" | "signed-out";

export interface AuthenticationResult {
  user: User;
  mode: Exclude<SessionMode, "signed-out">;
}

interface UserContextType {
  user: User | null;
  login: (userId: string, username: string, role: string, displayName: string) => void;
  authenticate: (username: string, password: string) => Promise<AuthenticationResult | null>;
  logout: () => void;
  isLoggedIn: boolean;
  isInitializing: boolean;
  sessionMode: SessionMode;
  isRealtimeAuthenticated: boolean;
  requiresRealtimeUpgrade: boolean;
}

interface AccountLoginPayload {
  success?: boolean;
  code?: string;
  error?: string;
  session?: Session;
  system_user?: {
    user_id?: string;
    username?: string;
    role?: string;
    display_name?: string;
  };
}

const SESSION_BOOTSTRAP_TIMEOUT_MS = 8_000;

async function authorizeRealtime(session: Session) {
  // Private Realtime channels must receive the current JWT before subscribe().
  try {
    await supabase.realtime.setAuth(session.access_token);
    return true;
  } catch (error) {
    console.warn("Realtime authorization will retry in the collaboration provider", error);
    return false;
  }
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function readStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  try {
    const savedUser = window.localStorage.getItem("user");
    if (!savedUser) return null;

    const parsed = JSON.parse(savedUser) as Partial<User>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      window.localStorage.removeItem("user");
      return null;
    }

    return parsed as User;
  } catch {
    try {
      window.localStorage.removeItem("user");
    } catch {
      // Blocked storage must not prevent the application from starting.
    }
    return null;
  }
}

function storeUser(user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem("user", JSON.stringify(user));
    else window.localStorage.removeItem("user");
  } catch {
    // Session state still works when browser storage is unavailable.
  }
}

function getDevDemoUser(): User | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "admin") return null;

  return {
    userId: "demo-admin",
    username: "operator7",
    role: "admin",
    displayName: "Operator 7",
  };
}

function userFromMetadata(metadata: Session["user"]["app_metadata"]): User | null {
  const userId = metadata.system_user_id;
  const username = metadata.username;
  const role = metadata.role;
  if (typeof userId !== "string" || typeof username !== "string" || typeof role !== "string") {
    return null;
  }

  return {
    userId,
    username,
    role,
    displayName: typeof metadata.display_name === "string" ? metadata.display_name : username,
  };
}

async function userFromSession(session: Session): Promise<User | null> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
  ) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
  const { data, error } = await rpc("get_current_system_user");
  const profile = !error && Array.isArray(data) ? data[0] : null;
  if (
    profile &&
    typeof profile.user_id === "string" &&
    typeof profile.username === "string" &&
    typeof profile.role === "string"
  ) {
    return {
      userId: profile.user_id,
      username: profile.username,
      role: profile.role,
      displayName:
        typeof profile.display_name === "string" ? profile.display_name : profile.username,
    };
  }

  if (!error) return null;

  // Keep migration compatibility, but only after Auth has fetched the user
  // from the server. The user object inside getSession() comes from browser
  // storage and must never be trusted for identity or role decisions.
  const { data: verifiedUserData, error: verifiedUserError } =
    await supabase.auth.getUser(session.access_token);
  if (verifiedUserError || !verifiedUserData.user) return null;
  return userFromMetadata(verifiedUserData.user.app_metadata ?? {});
}

function normalizeThrownError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  const normalized = new Error(fallbackMessage) as Error & Record<string, unknown>;
  if (error && typeof error === "object") Object.assign(normalized, error);
  return normalized;
}

function isCredentialRejection(error: unknown, payload?: AccountLoginPayload | null) {
  if (/invalid credentials|account is unavailable/i.test(payload?.error ?? "")) return true;
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    status?: number;
    context?: { status?: number };
  };
  const status = Number(candidate.context?.status ?? candidate.status ?? 0);
  return status === 401 || status === 403;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const demoUser = useMemo(getDevDemoUser, []);
  const cachedUser = useMemo(() => (demoUser ? null : readStoredUser()), [demoUser]);
  const [user, setUser] = useState<User | null>(demoUser ?? cachedUser);
  const [sessionMode, setSessionMode] = useState<SessionMode>(
    demoUser ? "demo" : cachedUser ? "legacy" : "signed-out",
  );
  // A cached application user may still have a valid Supabase session waiting
  // to be restored. Keep the global session gate closed until that check ends.
  const [isInitializing, setIsInitializing] = useState(!demoUser);
  const authenticatedSessionSeen = useRef(false);

  const applyUser = useCallback((nextUser: User, mode: Exclude<SessionMode, "signed-out">) => {
    setUser(nextUser);
    setSessionMode(mode);
    storeUser(nextUser);
  }, []);

  const login = useCallback(
    (userId: string, username: string, role: string, displayName: string) => {
      applyUser({ userId, username, role, displayName }, "legacy");
    },
    [applyUser],
  );

  useEffect(() => {
    if (demoUser) return;
    let active = true;

    const restoreSession = async (session: Session | null) => {
      if (!active) return;

      try {
        if (!session) return;

        authenticatedSessionSeen.current = true;
        void authorizeRealtime(session);

        const profileResult = await runSessionBootstrapWithDeadline(
          () => userFromSession(session),
          { timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS },
        );
        if (!active) return;

        let authenticatedUser: User | null = null;
        if (profileResult.status === "fulfilled") {
          authenticatedUser = profileResult.value;
        } else {
          console.warn(
            profileResult.status === "timed-out"
              ? "Session profile restore timed out"
              : "Session profile restore failed",
            profileResult.status === "rejected" ? profileResult.error : undefined,
          );
        }

        if (!active) return;
        if (authenticatedUser) {
          applyUser(authenticatedUser, "authenticated");
          return;
        }

        setUser(null);
        setSessionMode("signed-out");
        storeUser(null);
        void supabase.auth.signOut({ scope: "local" });
      } finally {
        if (active) setIsInitializing(false);
      }
    };

    const initializeSession = async () => {
      const sessionResult = await runSessionBootstrapWithDeadline(
        () => supabase.auth.getSession(),
        { timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS },
      );
      if (!active) return;

      if (sessionResult.status !== "fulfilled") {
        console.warn(
          sessionResult.status === "timed-out"
            ? "Session bootstrap timed out"
            : "Session bootstrap failed",
          sessionResult.status === "rejected" ? sessionResult.error : undefined,
        );
        setUser(null);
        setSessionMode("signed-out");
        storeUser(null);
        setIsInitializing(false);
        return;
      }

      if (sessionResult.value.error) {
        console.warn("Session bootstrap returned an auth error", sessionResult.value.error);
        setUser(null);
        setSessionMode("signed-out");
        storeUser(null);
        setIsInitializing(false);
        return;
      }

      await restoreSession(sessionResult.value.data.session);
    };

    void initializeSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && authenticatedSessionSeen.current) {
        setUser(null);
        setSessionMode("signed-out");
        storeUser(null);
        setIsInitializing(false);
        return;
      }
      void restoreSession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [applyUser, demoUser]);

  const authenticate = useCallback(
    async (username: string, password: string): Promise<AuthenticationResult | null> => {
      const normalizedUsername = username.trim();

      if (REALTIME_COLLABORATION_V2_ENABLED) {
        const edgeResult = await runLoginWithTransientRetry(() =>
          supabase.functions.invoke<AccountLoginPayload>("account-login", {
            body: { username: normalizedUsername, password },
          }),
        );

        if (!edgeResult.error && edgeResult.data?.success && edgeResult.data.session) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: edgeResult.data.session.access_token,
            refresh_token: edgeResult.data.session.refresh_token,
          });
          if (!sessionError) {
            void authorizeRealtime(edgeResult.data.session);
            const profile = edgeResult.data.system_user;
            if (profile?.user_id && profile.username && profile.role) {
              const authenticatedUser: User = {
                userId: profile.user_id,
                username: profile.username,
                role: profile.role,
                displayName: profile.display_name || profile.username,
              };
              applyUser(authenticatedUser, "authenticated");
              return { user: authenticatedUser, mode: "authenticated" };
            }
            throw new Error("Authenticated account profile is incomplete");
          } else {
            throw normalizeThrownError(sessionError, "Unable to establish authenticated session");
          }
        }

        if (isCredentialRejection(edgeResult.error, edgeResult.data)) return null;
        throw normalizeThrownError(
          edgeResult.data?.error || edgeResult.error,
          "Authenticated login service is unavailable",
        );
      }

      // Legacy deployment path: this remains available only when realtime v2 is
      // disabled. A v2 deployment must never create a half-authenticated login.
      const legacyResult = await runLoginWithTransientRetry(() =>
        supabase.rpc("authenticate_user", {
          username_input: normalizedUsername,
          password_input: password,
        }),
      );
      if (legacyResult.error) {
        throw normalizeThrownError(legacyResult.error, "Authentication failed");
      }

      const legacyUser = Array.isArray(legacyResult.data) ? legacyResult.data[0] : null;
      if (!legacyUser?.success || !legacyUser.user_id) return null;

      const compatibleUser: User = {
        userId: legacyUser.user_id,
        username: legacyUser.username,
        role: legacyUser.role,
        displayName: legacyUser.display_name || legacyUser.username,
      };
      applyUser(compatibleUser, "legacy");
      return { user: compatibleUser, mode: "legacy" };
    },
    [applyUser],
  );

  const logout = useCallback(() => {
    setUser(null);
    setSessionMode("signed-out");
    storeUser(null);
    void supabase.auth.signOut({ scope: "local" });
  }, []);

  useEffect(() => {
    if (!user?.userId || sessionMode === "demo") return;
    const channel = supabase
      .channel(`account-session:${user.userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "system_users",
          filter: `id=eq.${user.userId}`,
        },
        (payload) => {
          const updated = payload.new as { status?: string };
          if (updated.status && updated.status !== "active") logout();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [logout, sessionMode, user?.userId]);

  const value = useMemo<UserContextType>(
    () => {
      const isRealtimeAuthenticated = sessionMode === "authenticated";
      const requiresRealtimeUpgrade =
        REALTIME_COLLABORATION_V2_ENABLED && user !== null && sessionMode === "legacy";

      return {
        user,
        login,
        authenticate,
        logout,
        isLoggedIn: user !== null,
        isInitializing,
        sessionMode,
        isRealtimeAuthenticated,
        requiresRealtimeUpgrade,
      };
    },
    [authenticate, isInitializing, login, logout, sessionMode, user],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
