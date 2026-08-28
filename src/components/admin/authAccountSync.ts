import { supabase } from "@/integrations/supabase/client";
import { REALTIME_COLLABORATION_V2_ENABLED } from "@/lib/realtimeCollaborationConfig";

export interface AdminAccountProfile {
  username?: string;
  role?: string;
  status?: string;
  displayName?: string;
  permissions?: unknown;
}

export interface AdminAccountMutationOptions {
  action?: "create" | "update" | "sync" | "delete";
  password?: string;
  profile?: AdminAccountProfile;
  /**
   * Some legacy database RPCs can persist only a subset of a user's
   * permissions.  Their compatibility path still needs the verified account
   * service to store the complete settings, even while realtime V2 is off.
   */
  forceVerifiedService?: boolean;
}

export interface AdminAccountMutationResult {
  success: boolean;
  userId?: string;
  migrated?: boolean;
  deferred?: boolean;
  error?: string;
}

const ACCOUNT_SYNC_ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "登入身分已過期，請重新登入後再試。",
  "Administrator permission required": "目前帳號沒有管理系統帳戶的權限。",
  "Invalid password": "密碼至少需要 6 個字元。",
  "Password is required": "請輸入初始密碼。",
  "Invalid username": "帳號格式不正確，請重新輸入。",
  "Invalid display name": "顯示名稱格式不正確，請重新輸入。",
  "System account creation failed": "帳號名稱可能已存在，請更換帳號後再試。",
  "Synchronized account creation failed": "帳號資料未變更；登入身分建立失敗，請稍後再試。",
  "Account sync is unavailable": "帳戶同步服務暫時無法使用，請稍後再試。",
};

function translateAccountSyncError(message: string) {
  return (
    ACCOUNT_SYNC_ERROR_MESSAGES[message] ||
    (message ? `帳戶操作失敗：${message}` : "登入身分同步失敗，資料未變更。")
  );
}

async function readFunctionError(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.clone !== "function") return "";

  try {
    const payload = (await context.clone().json()) as { error?: unknown };
    return typeof payload?.error === "string" ? payload.error : "";
  } catch {
    return "";
  }
}

export async function mutateAuthAccount(
  userId: string,
  options: AdminAccountMutationOptions = {},
): Promise<AdminAccountMutationResult> {
  if (!REALTIME_COLLABORATION_V2_ENABLED && !options.forceVerifiedService) {
    return { success: false, error: "Realtime account synchronization is disabled" };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return { success: false, error: ACCOUNT_SYNC_ERROR_MESSAGES.Unauthorized };
  }

  const { data, error } = await supabase.functions.invoke<AdminAccountMutationResult>(
    "account-admin-sync",
    {
      body: {
        userId,
        action: options.action ?? "sync",
        password: options.password ?? "",
        profile: options.profile ?? {},
      },
    },
  );
  if (error || !data?.success) {
    const remoteError = data?.error || (await readFunctionError(error));
    console.warn("Auth account synchronization failed", remoteError || error);
    return {
      success: false,
      error: translateAccountSyncError(remoteError),
    };
  }
  return data;
}

export async function syncAuthAccount(
  userId: string,
  options: Omit<AdminAccountMutationOptions, "action"> & {
    action?: "sync" | "delete";
  } = {},
) {
  const result = await mutateAuthAccount(userId, options);
  return result.success;
}
