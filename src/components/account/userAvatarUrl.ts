import { supabase } from "@/integrations/supabase/client";
import { USER_AVATAR_BUCKET } from "./userAvatarUtils.mjs";

export function getUserAvatarPublicUrl(avatarPath?: string | null) {
  if (!avatarPath) return null;
  return supabase.storage.from(USER_AVATAR_BUCKET).getPublicUrl(avatarPath).data.publicUrl;
}
