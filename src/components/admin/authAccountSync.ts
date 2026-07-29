import { supabase } from "@/integrations/supabase/client";
import { REALTIME_COLLABORATION_V2_ENABLED } from "@/lib/realtimeCollaborationConfig";

export async function syncAuthAccount(
  userId: string,
  options: { action?: "sync" | "delete"; password?: string; authUserId?: string } = {},
) {
  if (!REALTIME_COLLABORATION_V2_ENABLED) return false;

  const { data, error } = await supabase.functions.invoke<{ success?: boolean }>(
    "account-admin-sync",
    {
      body: {
        userId,
        action: options.action ?? "sync",
        password: options.password ?? "",
        authUserId: options.authUserId ?? "",
      },
    },
  );
  if (error || !data?.success) {
    console.warn("Auth account synchronization deferred", error);
    return false;
  }
  return true;
}
