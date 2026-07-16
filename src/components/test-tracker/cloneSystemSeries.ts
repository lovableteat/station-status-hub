import { supabase } from "@/integrations/supabase/client";

interface CloneSystemSeriesInput {
  sourceSystemId: string;
  systemNames: string[];
}

interface CreatedSystem {
  id: string;
  system_name: string;
}

const SOURCE_SYSTEM_COLUMNS = [
  "id",
  "project_id",
  "flow_version_id",
  "assigned_engineer",
  "model",
  "team",
  "cabinet",
  "ubuntu_version",
  "cuda_version",
  "bom_90",
  "exclude_from_dashboard",
  "status",
  "current_station",
  "overall_progress",
].join(",");

async function rollbackCreatedSystems(createdSystems: CreatedSystem[]) {
  const rollbackResults = await Promise.allSettled(
    createdSystems.map((system) =>
      supabase.rpc("delete_test_system", { p_system_id: system.id })
    )
  );

  rollbackResults.forEach((result, index) => {
    if (result.status === "rejected" || result.value.error) {
      console.error(
        `Failed to roll back cloned machine ${createdSystems[index].system_name}`,
        result.status === "rejected" ? result.reason : result.value.error
      );
    }
  });
}

export async function cloneSystemSeries({
  sourceSystemId,
  systemNames,
}: CloneSystemSeriesInput): Promise<CreatedSystem[]> {
  const normalizedNames = systemNames.map((name) => name.trim()).filter(Boolean);
  if (!sourceSystemId) throw new Error("找不到來源機台");
  if (normalizedNames.length < 1 || normalizedNames.length > 100) {
    throw new Error("建立數量必須介於 1 到 100 台");
  }
  if (new Set(normalizedNames.map((name) => name.toLocaleLowerCase())).size !== normalizedNames.length) {
    throw new Error("新機台名稱不可重複");
  }

  const { data: sourceSystem, error: sourceError } = await supabase
    .from("test_systems")
    .select(SOURCE_SYSTEM_COLUMNS)
    .eq("id", sourceSystemId)
    .single();

  if (sourceError || !sourceSystem) {
    throw sourceError || new Error("來源機台不存在");
  }

  const [progressResult, exclusionResult] = await Promise.all([
    supabase
      .from("test_progress")
      .select("item_id, station_id, assigned_to, notes, progress_percent, status")
      .eq("system_id", sourceSystemId),
    supabase
      .from("dashboard_item_exclusions")
      .select("item_id, station_id, reason")
      .eq("system_id", sourceSystemId),
  ]);

  if (progressResult.error) throw progressResult.error;
  if (exclusionResult.error) throw exclusionResult.error;

  const clonedSystems = normalizedNames.map((systemName) => ({
    project_id: sourceSystem.project_id,
    flow_version_id: sourceSystem.flow_version_id,
    system_name: systemName,
    assigned_engineer: sourceSystem.assigned_engineer,
    model: sourceSystem.model,
    team: sourceSystem.team,
    cabinet: sourceSystem.cabinet,
    ubuntu_version: sourceSystem.ubuntu_version,
    cuda_version: sourceSystem.cuda_version,
    bom_90: sourceSystem.bom_90,
    exclude_from_dashboard: sourceSystem.exclude_from_dashboard,
    status: sourceSystem.status,
    current_station: sourceSystem.current_station,
    overall_progress: sourceSystem.overall_progress,
    serial_number: null,
  }));

  const { data: createdSystems, error: createError } = await supabase
    .from("test_systems")
    .insert(clonedSystems)
    .select("id, system_name");

  if (createError || !createdSystems?.length) {
    throw createError || new Error("未建立任何機台");
  }

  try {
    if (progressResult.data?.length) {
      const clonedProgress = createdSystems.flatMap((system) =>
        progressResult.data.map((progressRow) => ({
          project_id: sourceSystem.project_id,
          system_id: system.id,
          station_id: progressRow.station_id,
          item_id: progressRow.item_id,
          assigned_to: progressRow.assigned_to,
          notes: progressRow.notes,
          progress_percent: progressRow.progress_percent,
          status: progressRow.status,
          actual_hours: null,
          started_at: null,
          completed_at: null,
        }))
      );
      const { error } = await supabase.from("test_progress").insert(clonedProgress);
      if (error) throw error;
    }

    if (exclusionResult.data?.length) {
      const clonedExclusions = createdSystems.flatMap((system) =>
        exclusionResult.data.map((exclusion) => ({
          system_id: system.id,
          item_id: exclusion.item_id,
          station_id: exclusion.station_id,
          reason: exclusion.reason,
        }))
      );
      const { error } = await supabase
        .from("dashboard_item_exclusions")
        .insert(clonedExclusions);
      if (error) throw error;
    }

    return createdSystems;
  } catch (error) {
    await rollbackCreatedSystems(createdSystems);
    throw error;
  }
}
