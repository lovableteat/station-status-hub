import { supabase } from "@/integrations/supabase/client";

import type { MaterialReportSnapshot } from "./materialRequestExport";

// Additive audit tables may be newer than the checked-in generated schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseClient = supabase as any;

interface AuditActor {
  displayName?: string | null;
  userId?: string | null;
  username?: string | null;
}

function actorName(actor: AuditActor | null | undefined) {
  return actor?.displayName || actor?.username || "未知使用者";
}

export async function logMaterialRecordChange({
  action,
  actor,
  imageCount,
  previousImageCount,
  newUpdatedAt,
  previousUpdatedAt,
  recordId,
  workspaceId,
}: {
  action: "create" | "update";
  actor: AuditActor | null;
  imageCount: number;
  previousImageCount?: number;
  newUpdatedAt: string;
  previousUpdatedAt?: string;
  recordId: string;
  workspaceId: string;
}) {
  const { error } = await supabaseClient.from("material_bom_audit_logs").insert({
    action: `record.${action}`,
    actor_id: actor?.userId ?? null,
    actor_name: actorName(actor),
    metadata: {
      imageCount,
      imageCountChanged: previousImageCount == null ? null : imageCount - previousImageCount,
      previousImageCount: previousImageCount ?? null,
    },
    new_updated_at: newUpdatedAt,
    previous_updated_at: previousUpdatedAt ?? null,
    record_id: recordId,
    workspace_id: workspaceId,
  });

  // The UI remains compatible before the additive audit migration is deployed.
  return !error;
}

export async function logMaterialWorkspaceAction({
  action,
  actor,
  metadata,
  workspaceId,
}: {
  action: "delete" | "import" | "page_tracker.update";
  actor: AuditActor | null;
  metadata?: Record<string, unknown>;
  workspaceId?: string | null;
}) {
  const { error } = await supabaseClient.from("material_bom_audit_logs").insert({
    action: `workspace.${action}`,
    actor_id: actor?.userId ?? null,
    actor_name: actorName(actor),
    metadata: metadata ?? {},
    workspace_id: workspaceId ?? null,
  });

  return !error;
}

export async function logMaterialReportExport({
  actor,
  fileName,
  format,
  snapshot,
  workspaceId,
}: {
  actor: AuditActor | null;
  fileName: string;
  format: "excel" | "html" | "html_zip";
  snapshot: MaterialReportSnapshot;
  workspaceId: string;
}) {
  const { error } = await supabaseClient.from("material_bom_export_logs").insert({
    actor_id: actor?.userId ?? null,
    actor_name: actorName(actor),
    data_as_of: snapshot.dataAsOf,
    export_format: format,
    exported_at: snapshot.exportedAt,
    file_name: fileName,
    filtered_group_count: snapshot.filteredGroupCount,
    filters: snapshot.filterSummary,
    original_group_count: snapshot.originalGroupCount,
    row_count: snapshot.rows.length,
    snapshot_id: snapshot.id,
    workspace_id: workspaceId,
  });

  return !error;
}
