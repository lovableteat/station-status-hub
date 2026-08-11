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

import {
  createUserAvatarPath,
  USER_AVATAR_BUCKET,
  validateUserAvatarFile,
} from "@/components/account/userAvatarUtils.mjs";
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
  avatarPath: string | null;
}

export type SessionMode = "authenticated" | "legacy" | "demo" | "signed-out";

export interface AuthenticationResult {
  user: User;
  mode: Exclude<SessionMode, "signed-out">;
}

export interface RegistrationResult {
  success: boolean;
  code: string;
}

export interface AvatarMutationResult {
  success: boolean;
  error?: string;
}

interface UserContextType {
  user: User | null;
  login: (userId: string, username: string, role: string, displayName: string) => void;
  authenticate: (username: string, password: string) => Promise<AuthenticationResult | null>;
  registerAccount: (
    displayName: string,
    username: string,
    password: string,
  ) => Promise<RegistrationResult>;
  updateAvatar: (file: File | null) => Promise<AvatarMutationResult>;
  logout: () => void;
  isLoggedIn: boolean;
  isInitializing: boolean;
  sessionMode: SessionMode;
  isRealtimeAuthenticated: boolean;
  requiresRealtimeUpgrade: boolean;
  reauthRequired: boolean;
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
    avatar_path?: string | null;
  };
}

const SESSION_BOOTSTRAP_TIMEOUT_MS = 8_000;
const AUTH_SESSION_VERSION = "2026-07-31-tab-isolation-v2";
const AUTH_SESSION_VERSION_KEY = "bringup-auth-session-version";

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
    const savedUser = window.sessionStorage.getItem("user");
    if (!savedUser) return null;

    const parsed = JSON.parse(savedUser) as Partial<User>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.displayName !== "string"
    ) {
      window.sessionStorage.removeItem("user");
      return null;
    }

    return {
      userId: parsed.userId,
      username: parsed.username,
      role: parsed.role,
      displayName: parsed.displayName,
      avatarPath: typeof parsed.avatarPath === "string" ? parsed.avatarPath : null,
    };
  } catch {
    try {
      window.sessionStorage.removeItem("user");
    } catch {
      // Blocked storage must not prevent the application from starting.
    }
    return null;
  }
}

function storeUser(user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.sessionStorage.setItem("user", JSON.stringify(user));
    else window.sessionStorage.removeItem("user");
  } catch {
    // Session state still works when browser storage is unavailable.
  }
}

function hasCurrentSessionVersion() {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(AUTH_SESSION_VERSION_KEY) === AUTH_SESSION_VERSION;
  } catch {
    return false;
  }
}

function storeCurrentSessionVersion(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.sessionStorage.setItem(AUTH_SESSION_VERSION_KEY, AUTH_SESSION_VERSION);
    else window.sessionStorage.removeItem(AUTH_SESSION_VERSION_KEY);
  } catch {
    // Storage restrictions are handled as a signed-out session on next load.
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
    avatarPath: null,
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
    avatarPath: typeof metadata.avatar_path === "string" ? metadata.avatar_path : null,
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
      avatarPath: typeof profile.avatar_path === "string" ? profile.avatar_path : null,
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
  const [reauthRequired, setReauthRequired] = useState(false);
  const authenticatedSessionSeen = useRef(false);

  const applyUser = useCallback((nextUser: User, mode: Exclude<SessionMode, "signed-out">) => {
    setUser(nextUser);
    setSessionMode(mode);
    storeUser(nextUser);
  }, []);

  const login = useCallback(
    (userId: string, username: string, role: string, displayName: string) => {
      applyUser({ userId, username, role, displayName, avatarPath: null }, "legacy");
    },
    [applyUser],
  );

  useEffect(() => {
    if (demoUser) return;
    let active = true;

    const restoreSession = async (session: Session | null) => {
      if (!active) return;

      try {
        if (!session) {
          setUser(null);
          setSessionMode("signed-out");
          storeUser(null);
          return;
        }

        if (!hasCurrentSessionVersion()) {
          setUser(null);
          setSessionMode("signed-out");
          storeUser(null);
          setReauthRequired(true);
          authenticatedSessionSeen.current = false;
          void supabase.auth.signOut({ scope: "local" });
          return;
        }

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
          setReauthRequired(false);
          applyUser(authenticatedUser, "authenticated");
          return;
        }

        setUser(null);
        setSessionMode("signed-out");
        storeUser(null);
        storeCurrentSessionVersion(false);
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
          // Write the version before setSession(), because the auth listener can
          // run synchronously while the new session is being established.
          storeCurrentSessionVersion(true);
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: edgeResult.data.session.access_token,
            refresh_token: edgeResult.data.session.refresh_token,
          });
          if (!sessionError) {
            setReauthRequired(false);
            void authorizeRealtime(edgeResult.data.session);
            const profile = edgeResult.data.system_user;
            if (profile?.user_id && profile.username && profile.role) {
              const authenticatedUser: User = {
                userId: profile.user_id,
                username: profile.username,
                role: profile.role,
                displayName: profile.display_name || profile.username,
                avatarPath: profile.avatar_path || null,
              };
              applyUser(authenticatedUser, "authenticated");
              return { user: authenticatedUser, mode: "authenticated" };
            }
            throw new Error("Authenticated account profile is incomplete");
          } else {
            storeCurrentSessionVersion(false);
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
        avatarPath: null,
      };
      applyUser(compatibleUser, "legacy");
      return { user: compatibleUser, mode: "legacy" };
    },
    [applyUser],
  );

  const registerAccount = useCallback(
    async (displayName: string, username: string, password: string): Promise<RegistrationResult> => {
      const { data, error } = await supabase.rpc("register_system_user", {
        display_name_input: displayName.trim(),
        username_input: username.trim(),
        password_input: password,
      });
      if (error) throw normalizeThrownError(error, "Account registration failed");
      const result = Array.isArray(data) ? data[0] : null;
      return {
        success: result?.success === true,
        code: result?.code ?? "REGISTRATION_FAILED",
      };
    },
    [],
  );

  const updateAvatar = useCallback(async (file: File | null): Promise<AvatarMutationResult> => {
    if (!user?.userId || sessionMode !== "authenticated") {
      return { success: false, error: "請重新登入後再編輯頭像。" };
    }

    const previousPath = user.avatarPath;
    let uploadedPath: string | null = null;

    if (file) {
      const validationError = validateUserAvatarFile(file);
      if (validationError) return { success: false, error: validationError };

      uploadedPath = createUserAvatarPath(user.userId, file);
      if (!uploadedPath) return { success: false, error: "無法建立頭像檔案，請重新選擇圖片。" };

      const { error: uploadError } = await supabase.storage
        .from(USER_AVATAR_BUCKET)
        .upload(uploadedPath, file, {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) {
        return { success: false, error: "頭像上傳失敗，請稍後再試。" };
      }
    }

    const { data, error } = await supabase.rpc("set_own_avatar_path", {
      p_avatar_path: uploadedPath,
    });
    if (error) {
      if (uploadedPath) {
        await supabase.storage.from(USER_AVATAR_BUCKET).remove([uploadedPath]);
      }
      return { success: false, error: "頭像資料儲存失敗，原頭像未變更。" };
    }

    const avatarPath = typeof data === "string" ? data : null;
    setUser((current) => {
      if (!current || current.userId !== user.userId) return current;
      const nextUser = { ...current, avatarPath };
      storeUser(nextUser);
      return nextUser;
    });

    if (previousPath && previousPath !== avatarPath) {
      await supabase.storage.from(USER_AVATAR_BUCKET).remove([previousPath]);
    }

    window.dispatchEvent(new CustomEvent("station-user-avatar-updated", {
      detail: { userId: user.userId, avatarPath },
    }));
    return { success: true };
  }, [sessionMode, user]);

  const logout = useCallback(() => {
    setUser(null);
    setSessionMode("signed-out");
    storeUser(null);
    storeCurrentSessionVersion(false);
    setReauthRequired(false);
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
          const updated = payload.new as { status?: string; avatar_path?: string | null };
          if (updated.status && updated.status !== "active") logout();
          if ("avatar_path" in updated) {
            setUser((current) => {
              if (!current || current.userId !== user.userId) return current;
              const nextUser = { ...current, avatarPath: updated.avatar_path ?? null };
              storeUser(nextUser);
              return nextUser;
            });
          }
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
        registerAccount,
        updateAvatar,
        logout,
        isLoggedIn: user !== null,
        isInitializing,
        sessionMode,
        isRealtimeAuthenticated,
        requiresRealtimeUpgrade,
        reauthRequired,
      };
    },
    [authenticate, isInitializing, login, logout, reauthRequired, registerAccount, sessionMode, updateAvatar, user],
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
