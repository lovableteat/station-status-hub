import { supabase } from "@/integrations/supabase/client";

export async function authorizePrivateRealtime() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) return false;

  try {
    await supabase.realtime.setAuth(accessToken);
    return true;
  } catch (authError) {
    console.warn("Unable to authorize private Realtime channel", authError);
    return false;
  }
}
