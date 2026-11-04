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

export interface OwnCredentialsResult {
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
  updateOwnCredentials: (input: {
    displayName: string;
    username: string;
    currentPassword: string;
    newPassword: string;
  }) => Promise<OwnCredentialsResult>;
  logout: () => void;
  isLoggedIn: boolean;
  isInitializing: boolean;
  sessionMode: SessionMode;
  isRealtimeAuthenticated: boolean;
  requiresRealtimeUpgrade: boolean;
  reauthRequired: boolean;
  sessionRecoveryNeeded: boolean;
  retrySession: () => void;
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
const SESSION_RECOVERY_RETRY_MS = 10_000;
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
  window.dispatchEvent(new CustomEvent("station-user-changed", { detail: user?.userId ?? null }));
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
  // Only an unavailable legacy RPC may use the verified Auth metadata fallback.
  // Network failures must not become either a new grant or a permanent logout.
  const rpcCode = (error as { code?: string }).code;
  if (rpcCode !== "PGRST202" && rpcCode !== "42883") {
    throw normalizeThrownError(error, "Account profile is temporarily unavailable");
  }

  // Keep migration compatibility, but only after Auth has fetched the user
  // from the server. The user object inside getSession() comes from browser
  // storage and must never be trusted for identity or role decisions.
  const { data: verifiedUserData, error: verifiedUserError } =
    await supabase.auth.getUser(session.access_token);
  if (verifiedUserError) {
    if (isTerminalSessionError(verifiedUserError)) return null;
    throw normalizeThrownError(verifiedUserError, "Account verification is temporarily unavailable");
  }
  if (!verifiedUserData.user) return null;
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

function isTerminalSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; code?: string; name?: string };
  return value.status === 401 || value.status === 403 || value.name === "AuthSessionMissingError"
    || ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "user_banned", "user_not_found"].includes(value.code ?? "");
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
  const [sessionRecoveryNeeded, setSessionRecoveryNeeded] = useState(false);
  const userRef = useRef<User | null>(demoUser ?? cachedUser);
  // Only a server-verified identity in this mounted provider can survive a
  // transient profile read. Browser-stored users never enter this ref.
  const verifiedIdentity = useRef<{ authId: string; accountId: string; checkedAt: number } | null>(null);
  const lastVerifiedSession = useRef<Session | null>(null);
  const recoveryPending = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retrySessionRef = useRef<(() => void) | null>(null);
  const suppressRecovery = useRef(false);
  const authenticationAttempt = useRef(0);
  const pendingSignOut = useRef<Promise<void> | null>(null);
  const signOutLocally = useCallback(() => {
    if (pendingSignOut.current) return pendingSignOut.current;
    const operation = Promise.resolve().then(() => supabase.auth.signOut({ scope: "local" }))
      .then(() => {}, () => { console.warn("Local sign-out request did not complete"); })
      .finally(() => { if (pendingSignOut.current === operation) pendingSignOut.current = null; });
    pendingSignOut.current = operation;
    return operation;
  }, []);
  const cancelRecoveryRetry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    recoveryPending.current = false;
  }, []);
  const retrySession = useCallback(() => retrySessionRef.current?.(), []);
  const sessionRestore = useRef<{
    generation: number;
    token: string | null;
    pending: Promise<void> | null;
  }>({ generation: 0, token: null, pending: null });

  const invalidateSessionRestore = useCallback(() => {
    sessionRestore.current = {
      generation: sessionRestore.current.generation + 1,
      token: null,
      pending: null,
    };
  }, []);

  const applyUser = useCallback((nextUser: User, mode: Exclude<SessionMode, "signed-out">) => {
    userRef.current = nextUser;
    setUser(nextUser);
    setSessionMode(mode);
    storeUser(nextUser);
  }, []);

  const login = useCallback(
    (userId: string, username: string, role: string, displayName: string) => {
      invalidateSessionRestore();
      applyUser({ userId, username, role, displayName, avatarPath: null }, "legacy");
    },
    [applyUser, invalidateSessionRestore],
  );

  useEffect(() => {
    if (demoUser) return;
    let active = true;
    let eventEpoch = 0;
    const eventTimers = new Set<ReturnType<typeof setTimeout>>();

    const clearIdentity = () => {
      verifiedIdentity.current = null;
      lastVerifiedSession.current = null;
      userRef.current = null;
      setUser(null);
      setSessionMode("signed-out");
      storeUser(null);
      setSessionRecoveryNeeded(false);
      cancelRecoveryRetry();
    };
    const rejectSession = () => {
      authenticationAttempt.current += 1;
      suppressRecovery.current = true;
      clearIdentity();
      storeCurrentSessionVersion(false);
      void signOutLocally();
    };
    const mayKeepVerifiedUser = (session?: Session | null) => Boolean(
      session && verifiedIdentity.current?.authId === session.user.id
      && verifiedIdentity.current.accountId === userRef.current?.userId
      && typeof session.expires_at === "number" && session.expires_at * 1000 > Date.now(),
    );
    const recoverLater = (session?: Session | null) => {
      if (!active || suppressRecovery.current) return;
      recoveryPending.current = true;
      // No cached/local identity is promoted. While unverified (or expired),
      // the session gate shows a retry screen instead of private providers.
      setSessionRecoveryNeeded(!mayKeepVerifiedUser(session ?? lastVerifiedSession.current));
      if (retryTimer.current === null) {
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          if (active && !suppressRecovery.current) void initializeSession();
        }, SESSION_RECOVERY_RETRY_MS);
      }
    };

    const restoreSession = (session: Session | null): Promise<void> => {
      if (!active || (suppressRecovery.current && session)) return Promise.resolve();
      const token = session?.access_token ?? null;
      const previous = sessionRestore.current;
      if (token && previous.token === token && previous.pending) return previous.pending;
      const current = { generation: previous.generation + 1, token, pending: null as Promise<void> | null };
      sessionRestore.current = current;
      const isCurrent = () => active && sessionRestore.current === current;
      if (session && verifiedIdentity.current && verifiedIdentity.current.authId !== session.user.id) {
        clearIdentity();
        setIsInitializing(true);
      }
      current.pending = Promise.resolve().then(async () => {
        if (!isCurrent()) return;
        try {
          if (!session) { clearIdentity(); return; }
          if (!hasCurrentSessionVersion()) {
            setReauthRequired(true);
            rejectSession();
            return;
          }
          void authorizeRealtime(session);
          const profileResult = await runSessionBootstrapWithDeadline(
            () => userFromSession(session),
            { timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS },
          );
          if (!isCurrent()) return;
          if (profileResult.status === "fulfilled") {
            if (!profileResult.value) { rejectSession(); return; }
            lastVerifiedSession.current = session;
            verifiedIdentity.current = { authId: session.user.id, accountId: profileResult.value.userId, checkedAt: Date.now() };
            cancelRecoveryRetry();
            setSessionRecoveryNeeded(false);
            setReauthRequired(false);
            applyUser(profileResult.value, "authenticated");
            return;
          }
          console.warn("Session profile verification will retry", profileResult.status);
          if (profileResult.status === "rejected" && isTerminalSessionError(profileResult.error)) rejectSession();
          else recoverLater(session);
        } finally {
          if (isCurrent()) { current.pending = null; setIsInitializing(false); }
        }
      });
      return current.pending;
    };

    async function initializeSession() {
      if (!active || suppressRecovery.current) return;
      const generation = sessionRestore.current.generation;
      const authEvent = eventEpoch;
      const sessionResult = await runSessionBootstrapWithDeadline(
        () => supabase.auth.getSession(),
        { timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS },
      );
      if (!active || suppressRecovery.current || sessionRestore.current.generation !== generation || eventEpoch !== authEvent) return;
      if (sessionResult.status !== "fulfilled") {
        console.warn("Session bootstrap will retry", sessionResult.status);
        recoverLater();
        setIsInitializing(false);
        return;
      }
      if (sessionResult.value.error) {
        if (isTerminalSessionError(sessionResult.value.error)) rejectSession();
        else recoverLater();
        setIsInitializing(false);
        return;
      }
      await restoreSession(sessionResult.value.data.session);
    }
    retrySessionRef.current = () => {
      if (!active || suppressRecovery.current) return;
      cancelRecoveryRetry();
      void initializeSession();
    };
    const onReconnect = () => {
      if (active && !suppressRecovery.current && (recoveryPending.current || Date.now() - (verifiedIdentity.current?.checkedAt ?? 0) >= 60_000)) {
        retrySessionRef.current?.();
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") onReconnect(); };
    window.addEventListener("online", onReconnect);
    window.addEventListener("pageshow", onReconnect);
    document.addEventListener("visibilitychange", onVisible);
    void initializeSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" && !session) return;
      eventEpoch += 1;
      if (event === "SIGNED_OUT") { suppressRecovery.current = true; void restoreSession(null); return; }
      // INITIAL_SESSION(null) can also mean a temporary refresh failure. The
      // getSession result above owns that distinction; never erase storage here.
      if (!session || suppressRecovery.current) return;
      const epoch = eventEpoch;
      const timer = setTimeout(() => {
        eventTimers.delete(timer);
        if (active && !suppressRecovery.current && epoch === eventEpoch) void restoreSession(session);
      }, 0);
      eventTimers.add(timer);
    });
    return () => {
      active = false;
      authenticationAttempt.current += 1;
      cancelRecoveryRetry();
      retrySessionRef.current = null;
      for (const timer of eventTimers) clearTimeout(timer);
      window.removeEventListener("online", onReconnect);
      window.removeEventListener("pageshow", onReconnect);
      document.removeEventListener("visibilitychange", onVisible);
      invalidateSessionRestore();
      authListener.subscription.unsubscribe();
    };
  }, [applyUser, cancelRecoveryRetry, demoUser, invalidateSessionRestore, signOutLocally]);

  const authenticate = useCallback(
    async (username: string, password: string): Promise<AuthenticationResult | null> => {
      // Usernames are case-insensitive at login time. Keep the password
      // untouched so its existing case-sensitive verification remains intact.
      const normalizedUsername = username.trim().toLowerCase();
      const attempt = ++authenticationAttempt.current;
      const isCurrentAttempt = () => authenticationAttempt.current === attempt;
      invalidateSessionRestore();
      cancelRecoveryRetry();
      // An older logout must finish before a new account establishes its SDK
      // session; otherwise its late SIGNED_OUT can disable the new refreshes.
      if (pendingSignOut.current) await pendingSignOut.current;
      if (!isCurrentAttempt()) return null;

      if (REALTIME_COLLABORATION_V2_ENABLED) {
        const edgeResult = await runLoginWithTransientRetry(() =>
          supabase.functions.invoke<AccountLoginPayload>("account-login", {
            body: { username: normalizedUsername, password },
          }),
        );

        if (!isCurrentAttempt()) return null;
        if (!edgeResult.error && edgeResult.data?.success && edgeResult.data.session) {
          // Write the version before setSession(), because the auth listener can
          // run synchronously while the new session is being established.
          suppressRecovery.current = false;
          storeCurrentSessionVersion(true);
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: edgeResult.data.session.access_token,
            refresh_token: edgeResult.data.session.refresh_token,
          });
          if (!isCurrentAttempt()) return null;
          if (!sessionError) {
            suppressRecovery.current = false;
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
              // The login endpoint already returned a verified account. A
              // slower SIGNED_IN profile read must not undo this login later.
              invalidateSessionRestore();
              lastVerifiedSession.current = edgeResult.data.session;
              verifiedIdentity.current = { authId: edgeResult.data.session.user.id, accountId: authenticatedUser.userId, checkedAt: Date.now() };
              cancelRecoveryRetry();
              setSessionRecoveryNeeded(false);
              applyUser(authenticatedUser, "authenticated");
              setIsInitializing(false);
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
      if (!isCurrentAttempt()) return null;
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
      invalidateSessionRestore();
      applyUser(compatibleUser, "legacy");
      return { user: compatibleUser, mode: "legacy" };
    },
    [applyUser, cancelRecoveryRetry, invalidateSessionRestore],
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

  const updateOwnCredentials = useCallback(async (input: {
    displayName: string;
    username: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<OwnCredentialsResult> => {
    if (!user?.userId || sessionMode !== "authenticated") {
      return { success: false, error: "請重新登入後再修改帳號或密碼。" };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      return { success: false, error: "登入已過期，請重新登入後再試。" };
    }

    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      username?: string;
      displayName?: string;
      error?: string;
    }>("account-self-service", { body: input });
    if (error || !data?.success || !data.username) {
      let code = data?.error;
      if (!code && error && typeof error === "object" && "context" in error) {
        const response = (error as { context?: Response }).context;
        if (response && typeof response.clone === "function") {
          try {
            const payload = await response.clone().json() as { error?: string };
            code = payload.error;
          } catch {
            // A network or gateway error may have no JSON response.
          }
        }
      }
      const messages: Record<string, string> = {
        Unauthorized: "登入已過期，請重新登入後再試。",
        "Account unavailable": "目前帳號無法修改，請重新登入後再試。",
        "Current password incorrect": "目前密碼不正確。",
        "Current password required": "請輸入目前密碼。",
        "Invalid display name": "顯示名稱需為 1 至 100 個字元。",
        "Invalid username": "帳號名稱需為 1 至 50 個字元。",
        "Invalid new password": "新密碼需為 6 至 200 個字元。",
        "New password unchanged": "新密碼不可與目前密碼相同。",
        "Username taken": "這個帳號名稱已有人使用。",
        "No changes": "請修改顯示名稱、登入帳號或輸入新密碼。",
        "Account changed elsewhere": "帳號資料剛被更新，請重新整理後再試。",
        "Account sync failed": "帳號更新未完成，請稍後重試。",
      };
      return { success: false, error: code ? messages[code] || "帳號服務暫時無法使用，請稍後再試。" : "帳號服務暫時無法使用，請稍後再試。" };
    }

    setUser((current) => {
      if (!current || current.userId !== user.userId) return current;
      const nextUser = {
        ...current,
        username: data.username,
        displayName: data.displayName ?? current.displayName,
      };
      storeUser(nextUser);
      return nextUser;
    });
    return { success: true };
  }, [sessionMode, user?.userId]);

  const logout = useCallback(() => {
    authenticationAttempt.current += 1;
    suppressRecovery.current = true;
    cancelRecoveryRetry();
    verifiedIdentity.current = null;
    lastVerifiedSession.current = null;
    userRef.current = null;
    setSessionRecoveryNeeded(false);
    invalidateSessionRestore();
    setUser(null);
    setSessionMode("signed-out");
    storeUser(null);
    storeCurrentSessionVersion(false);
    setReauthRequired(false);
    setIsInitializing(false);
    void signOutLocally();
  }, [cancelRecoveryRetry, invalidateSessionRestore, signOutLocally]);

  useEffect(() => {
    if (
      !user?.userId ||
      sessionMode === "demo" ||
      (REALTIME_COLLABORATION_V2_ENABLED && (isInitializing || sessionMode !== "authenticated"))
    ) return;
    const channel = supabase
      .channel(`account-session:${user.userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "workspace",
          table: "system_users",
          filter: `id=eq.${user.userId}`,
        },
        (payload) => {
          const updated = payload.new as { status?: string; avatar_path?: string | null; username?: string; display_name?: string | null };
          if (updated.status && updated.status !== "active") logout();
          if ("avatar_path" in updated || "username" in updated || "display_name" in updated) {
            setUser((current) => {
              if (!current || current.userId !== user.userId) return current;
              const nextUser = {
                ...current,
                ...("avatar_path" in updated ? { avatarPath: updated.avatar_path ?? null } : {}),
                ...(updated.username ? { username: updated.username } : {}),
                ...("display_name" in updated ? { displayName: updated.display_name || updated.username || current.username } : {}),
              };
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
  }, [isInitializing, logout, sessionMode, user?.userId]);

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
        updateOwnCredentials,
        logout,
        isLoggedIn: user !== null,
        isInitializing,
        sessionMode,
        isRealtimeAuthenticated,
        requiresRealtimeUpgrade,
        reauthRequired,
        sessionRecoveryNeeded,
        retrySession,
      };
    },
    [authenticate, isInitializing, login, logout, reauthRequired, registerAccount, retrySession, sessionRecoveryNeeded, sessionMode, updateAvatar, updateOwnCredentials, user],
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
