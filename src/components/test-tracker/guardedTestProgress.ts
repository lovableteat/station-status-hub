import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export const UNRESOLVED_ISSUE_MESSAGE = "尚有問題未被解決";

interface GuardedProgressInput {
  itemId: string;
  projectId: string;
  stationId: string;
  status: string;
  systemId: string;
  updates?: Record<string, unknown>;
}

export async function saveGuardedTestProgress({
  itemId,
  projectId,
  stationId,
  status,
  systemId,
  updates = {},
}: GuardedProgressInput) {
  const { data, error } = await supabase.rpc("set_test_progress_status", {
    p_project_id: projectId,
    p_status: status,
    p_station_id: stationId,
    p_system_id: systemId,
    p_test_item_id: itemId,
    p_updates: updates as Json,
  });

  if (error) throw error;
  return data;
}

export function unresolvedIssueToast(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : String(error ?? "");

  if (!message.includes(UNRESOLVED_ISSUE_MESSAGE)) return null;

  return {
    title: UNRESOLVED_ISSUE_MESSAGE,
    description: "請先將相關問題標記為已解決或已關閉，再完成此測試項目。",
    variant: "destructive" as const,
  };
}
