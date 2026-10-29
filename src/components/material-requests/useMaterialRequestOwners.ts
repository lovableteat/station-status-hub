import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MaterialRequestOwner } from "./MaterialRequestOwnerPicker";

export function useMaterialRequestOwners(enabled: boolean, accountId?: string) {
  const [state, setState] = useState<{ accountId?: string; owners: MaterialRequestOwner[]; error: string }>({ owners: [], error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // Existing authenticated directory exposes public account identities, never credentials.
    void supabase.rpc("list_active_collaboration_members").then(({ data, error }) => {
      if (!active) return;
      setState({ accountId, owners: (data ?? []).map(member => ({ id: member.user_id, name: member.display_name?.trim() || member.username, username: member.username })), error: error ? "填單人名單載入失敗，請關閉後重新開啟。" : "" });
    }).catch(() => { if (active) setState({ accountId, owners: [], error: "填單人名單載入失敗，請關閉後重新開啟。" }); });
    return () => { active = false; };
  }, [enabled, accountId]);
  return state.accountId === accountId ? state : { owners: [], error: "" };
}

