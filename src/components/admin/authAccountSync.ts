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
}

export interface AdminAccountMutationResult {
  success: boolean;
  userId?: string;
  migrated?: boolean;
  deferred?: boolean;
  error?: string;
}

export async function mutateAuthAccount(
  userId: string,
  options: AdminAccountMutationOptions = {},
): Promise<AdminAccountMutationResult> {
  if (!REALTIME_COLLABORATION_V2_ENABLED) {
    return { success: false, error: "Realtime account synchronization is disabled" };
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
    console.warn("Auth account synchronization failed", error ?? data?.error);
    return {
      success: false,
      error: data?.error || "登入身分同步失敗，資料未變更",
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
