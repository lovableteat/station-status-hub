import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

import type { MaterialWorkbookPayload, MaterialWorkbookRecord } from "./materialRequestUtils";

export interface BomWorkspace {
  id: string;
  name: string;
  payload: MaterialWorkbookPayload;
  updatedAt: string;
}

export type BomStorageMode = "remote" | "recovery";

export interface BomWorkspaceLoadResult {
  mode: BomStorageMode;
  workspaces: BomWorkspace[];
}

interface BomWorkspaceRow {
  id: string;
  name: string;
  source_file: string;
  sheet_name: string;
  generated_at: string;
  record_count: number;
  updated_at: string;
}

interface BomRecordRow {
  workspace_id: string;
  record_id: string;
  order_index: number;
  data: MaterialWorkbookRecord;
  updated_at: string;
}

interface BomPreferenceRow {
  table_key: string;
  column_order: unknown;
  updated_at: string;
}

const DATABASE_NAME = "station-status-hub-material-boms";
const STORE_NAME = "boms";
const WORKSPACE_TABLE = "material_bom_workspaces";
const RECORD_TABLE = "material_bom_records";
const PREFERENCE_TABLE = "ui_table_preferences";
const PREFERENCE_KEY_PREFIX = "material-bom-workspace:";
const RECORD_BATCH_SIZE = 200;
const REMOTE_RECORD_FETCH_BATCH_SIZE = 1000;

const supabaseClient = supabase as any;

function toTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortWorkspaces(workspaces: BomWorkspace[]) {
  return [...workspaces].sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));
}

function isMissingCollaborativeTables(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return code === "42P01" || (
    /material_bom_workspaces|material_bom_records/i.test(message) &&
    /does not exist|relation/i.test(message)
  );
}

function getPreferenceRowKey(workspaceId: string) {
  return `${PREFERENCE_KEY_PREFIX}${workspaceId}`;
}

function parsePreferenceWorkspace(raw: unknown, fallbackUpdatedAt: string) {
  if (!raw || typeof raw !== "object") return null;

  const candidate = (
    "workspace" in raw &&
    raw.workspace &&
    typeof raw.workspace === "object"
  ) ? raw.workspace : raw;

  if (!candidate || typeof candidate !== "object") return null;

  const workspace = candidate as Partial<BomWorkspace>;
  const payload = workspace.payload as Partial<MaterialWorkbookPayload> | undefined;

  if (!workspace.id || !workspace.name || !payload || !Array.isArray(payload.records)) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    payload: {
      sourceFile: typeof payload.sourceFile === "string" ? payload.sourceFile : workspace.name,
      sheetName: typeof payload.sheetName === "string" ? payload.sheetName : "",
      generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : fallbackUpdatedAt,
      recordCount: payload.records.length,
      records: payload.records as MaterialWorkbookRecord[],
    },
    updatedAt: typeof workspace.updatedAt === "string" ? workspace.updatedAt : fallbackUpdatedAt,
  } satisfies BomWorkspace;
}

function openLegacyDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve<IDBDatabase | null>(null);
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runLegacyRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openLegacyDatabase();
  if (!database) return null;

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadLegacyBomWorkspaces() {
  try {
    const result = await runLegacyRequest<BomWorkspace[]>("readonly", (store) => store.getAll());
    return sortWorkspaces(result ?? []);
  } catch {
    return [];
  }
}

async function saveLegacyBomWorkspace(workspace: BomWorkspace) {
  try {
    await runLegacyRequest<IDBValidKey>("readwrite", (store) => store.put(workspace));
  } catch {
    // Ignore local fallback failures so remote storage can still continue independently.
  }
}

async function removeLegacyBomWorkspace(id: string) {
  try {
    await runLegacyRequest<undefined>("readwrite", (store) => store.delete(id));
  } catch {
    // Ignore legacy cleanup failures so collaborative storage keeps working.
  }
}

function toWorkspaceRow(workspace: BomWorkspace): BomWorkspaceRow {
  return {
    id: workspace.id,
    name: workspace.name,
    source_file: workspace.payload.sourceFile,
    sheet_name: workspace.payload.sheetName,
    generated_at: workspace.payload.generatedAt,
    record_count: workspace.payload.records.length,
    updated_at: workspace.updatedAt,
  };
}

function toRecordRows(workspace: BomWorkspace) {
  return workspace.payload.records.map((record, index) => ({
    workspace_id: workspace.id,
    record_id: record.id,
    order_index: index,
    data: record,
    updated_at: workspace.updatedAt,
  })) satisfies BomRecordRow[];
}

function buildWorkspaceFromRows(workspaceRow: BomWorkspaceRow, recordRows: BomRecordRow[]): BomWorkspace {
  const records = [...recordRows]
    .sort((left, right) => left.order_index - right.order_index)
    .map((row) => row.data);

  return {
    id: workspaceRow.id,
    name: workspaceRow.name,
      payload: {
        sourceFile: workspaceRow.source_file,
        sheetName: workspaceRow.sheet_name,
        generatedAt: workspaceRow.generated_at,
        // Prefer the material rows we actually loaded so stale workspace metadata
        // cannot desynchronize the visible counts from the rendered table.
        recordCount: records.length,
        records,
      },
      updatedAt: workspaceRow.updated_at,
    };
}

async function loadAllRemoteRecordRows() {
  const rows: BomRecordRow[] = [];

  for (let start = 0; ; start += REMOTE_RECORD_FETCH_BATCH_SIZE) {
    const end = start + REMOTE_RECORD_FETCH_BATCH_SIZE - 1;
    const { data, error } = await supabaseClient
      .from(RECORD_TABLE)
      .select("workspace_id, record_id, order_index, data, updated_at")
      .order("workspace_id", { ascending: true })
      .order("order_index", { ascending: true })
      .range(start, end);

    if (error) throw error;

    const batch = (data ?? []) as BomRecordRow[];
    rows.push(...batch);

    if (batch.length < REMOTE_RECORD_FETCH_BATCH_SIZE) {
      break;
    }
  }

  return rows;
}

async function repairRemoteWorkspaceRecordCounts(
  workspaceRows: BomWorkspaceRow[],
  rowsByWorkspace: Map<string, BomRecordRow[]>,
) {
  const mismatches = workspaceRows
    .map((workspaceRow) => ({
      id: workspaceRow.id,
      recordCount: rowsByWorkspace.get(workspaceRow.id)?.length ?? 0,
      currentRecordCount: workspaceRow.record_count ?? 0,
    }))
    .filter((workspace) => workspace.recordCount !== workspace.currentRecordCount);

  await Promise.allSettled(
    mismatches.map((workspace) =>
      supabaseClient
        .from(WORKSPACE_TABLE)
        .update({ record_count: workspace.recordCount })
        .eq("id", workspace.id)
    ),
  );
}

async function loadRemoteBomWorkspaces() {
  const [workspaceResponse, recordRows] = await Promise.all([
    supabaseClient
      .from(WORKSPACE_TABLE)
      .select("id, name, source_file, sheet_name, generated_at, record_count, updated_at")
      .order("updated_at", { ascending: false }),
    loadAllRemoteRecordRows(),
  ]);

  if (workspaceResponse.error) throw workspaceResponse.error;

  const rowsByWorkspace = new Map<string, BomRecordRow[]>();
  for (const row of recordRows) {
    const current = rowsByWorkspace.get(row.workspace_id) ?? [];
    current.push(row);
    rowsByWorkspace.set(row.workspace_id, current);
  }

  await repairRemoteWorkspaceRecordCounts(
    (workspaceResponse.data ?? []) as BomWorkspaceRow[],
    rowsByWorkspace,
  );

  return sortWorkspaces(
    ((workspaceResponse.data ?? []) as BomWorkspaceRow[]).map((workspaceRow) =>
      buildWorkspaceFromRows(workspaceRow, rowsByWorkspace.get(workspaceRow.id) ?? [])
    )
  );
}

async function loadPreferenceBackedBomWorkspaces() {
  const { data, error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .select("table_key, column_order, updated_at")
    .like("table_key", `${PREFERENCE_KEY_PREFIX}%`);

  if (error) throw error;

  return sortWorkspaces(
    ((data ?? []) as BomPreferenceRow[])
      .map((row) => parsePreferenceWorkspace(row.column_order, row.updated_at))
      .filter((workspace): workspace is BomWorkspace => Boolean(workspace))
  );
}

async function upsertWorkspaceRow(workspace: BomWorkspace) {
  const { error } = await supabaseClient
    .from(WORKSPACE_TABLE)
    .upsert(toWorkspaceRow(workspace), { onConflict: "id" });

  if (error) throw error;
}

async function upsertRecordRows(recordRows: BomRecordRow[]) {
  for (let index = 0; index < recordRows.length; index += RECORD_BATCH_SIZE) {
    const batch = recordRows.slice(index, index + RECORD_BATCH_SIZE);
    const { error } = await supabaseClient
      .from(RECORD_TABLE)
      .upsert(batch, { onConflict: "workspace_id,record_id" });

    if (error) throw error;
  }
}

async function deleteRecordIds(workspaceId: string, recordIds: string[]) {
  for (let index = 0; index < recordIds.length; index += RECORD_BATCH_SIZE) {
    const batch = recordIds.slice(index, index + RECORD_BATCH_SIZE);
    const { error } = await supabaseClient
      .from(RECORD_TABLE)
      .delete()
      .eq("workspace_id", workspaceId)
      .in("record_id", batch);

    if (error) throw error;
  }
}

async function savePreferenceBackedWorkspace(workspace: BomWorkspace) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .upsert({
      table_key: getPreferenceRowKey(workspace.id),
      column_order: workspace,
    }, { onConflict: "table_key" });

  if (error) throw error;
}

async function removePreferenceBackedWorkspace(id: string) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .delete()
    .eq("table_key", getPreferenceRowKey(id));

  if (error) throw error;
}

async function migrateLegacyBomWorkspaces(
  currentWorkspaces: BomWorkspace[],
  saveWorkspace: (workspace: BomWorkspace) => Promise<void>,
  reloadWorkspaces: () => Promise<BomWorkspace[]>,
) {
  const legacyWorkspaces = await loadLegacyBomWorkspaces();
  if (legacyWorkspaces.length === 0) return currentWorkspaces;

  const currentMap = new Map(currentWorkspaces.map((workspace) => [workspace.id, workspace]));
  let migrated = false;
  for (const workspace of legacyWorkspaces) {
    const currentWorkspace = currentMap.get(workspace.id);
    const shouldUpload = !currentWorkspace || toTimestamp(workspace.updatedAt) > toTimestamp(currentWorkspace.updatedAt);

    if (shouldUpload) {
      await saveWorkspace(workspace);
      migrated = true;
    } else {
      await removeLegacyBomWorkspace(workspace.id);
    }

    if (shouldUpload) {
      await removeLegacyBomWorkspace(workspace.id);
    }
  }

  return migrated ? reloadWorkspaces() : currentWorkspaces;
}

async function loadRecoveryBomWorkspaces() {
  const [preferenceWorkspaces, legacyWorkspaces] = await Promise.all([
    loadPreferenceBackedBomWorkspaces().catch(() => []),
    loadLegacyBomWorkspaces(),
  ]);

  try {
    return await migrateLegacyBomWorkspaces(
      preferenceWorkspaces,
      savePreferenceBackedWorkspace,
      loadPreferenceBackedBomWorkspaces,
    );
  } catch {
    const merged = new Map<string, BomWorkspace>();
    for (const workspace of [...preferenceWorkspaces, ...legacyWorkspaces]) {
      const current = merged.get(workspace.id);
      if (!current || toTimestamp(workspace.updatedAt) > toTimestamp(current.updatedAt)) {
        merged.set(workspace.id, workspace);
      }
    }

    return sortWorkspaces([...merged.values()]);
  }
}

export async function loadBomWorkspacesDetailed(): Promise<BomWorkspaceLoadResult> {
  try {
    const remoteWorkspaces = await loadRemoteBomWorkspaces();
    return {
      mode: "remote",
      workspaces: await migrateLegacyBomWorkspaces(
        remoteWorkspaces,
        saveBomWorkspace,
        loadRemoteBomWorkspaces,
      ),
    };
  } catch (error) {
    if (!isMissingCollaborativeTables(error)) {
      throw error;
    }

    return {
      mode: "recovery",
      workspaces: await loadRecoveryBomWorkspaces(),
    };
  }
}

export async function loadBomWorkspaces() {
  const result = await loadBomWorkspacesDetailed();
  return result.workspaces;
}

export async function saveBomWorkspace(workspace: BomWorkspace) {
  await upsertWorkspaceRow(workspace);
  const { data: existingRows, error: existingRowsError } = await supabaseClient
    .from(RECORD_TABLE)
    .select("record_id")
    .eq("workspace_id", workspace.id);

  if (existingRowsError) throw existingRowsError;

  await upsertRecordRows(toRecordRows(workspace));

  const nextRecordIds = new Set(workspace.payload.records.map((record) => record.id));
  const obsoleteRecordIds = ((existingRows ?? []) as Array<{ record_id: string }>).flatMap((row) =>
    nextRecordIds.has(row.record_id) ? [] : [row.record_id]
  );

  if (obsoleteRecordIds.length > 0) {
    await deleteRecordIds(workspace.id, obsoleteRecordIds);
  }

  await upsertWorkspaceRow(workspace);
  await removeLegacyBomWorkspace(workspace.id);
}

export async function saveBomWorkspaceRecord(workspace: BomWorkspace, record: MaterialWorkbookRecord) {
  await upsertWorkspaceRow(workspace);

  const orderIndex = workspace.payload.records.findIndex((item) => item.id === record.id);
  if (orderIndex < 0) {
    throw new Error(`Unable to save BOM record ${record.id} because it is not present in workspace ${workspace.id}.`);
  }

  await upsertRecordRows([{
    workspace_id: workspace.id,
    record_id: record.id,
    order_index: orderIndex,
    data: record,
    updated_at: workspace.updatedAt,
  }]);

  await removeLegacyBomWorkspace(workspace.id);
}

export async function removeBomWorkspace(id: string) {
  const { error } = await supabaseClient
    .from(WORKSPACE_TABLE)
    .delete()
    .eq("id", id);

  if (error) throw error;

  await removeLegacyBomWorkspace(id);
}

export function subscribeBomWorkspaceChanges(onChange: () => void) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const emitChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onChange();
      debounceTimer = null;
    }, 180);
  };

  const channel = supabaseClient
    .channel("material_bom_workspace_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: WORKSPACE_TABLE }, emitChange)
    .on("postgres_changes", { event: "*", schema: "public", table: RECORD_TABLE }, emitChange)
    .on("postgres_changes", { event: "*", schema: "public", table: PREFERENCE_TABLE }, (payload: any) => {
      const keys = [payload?.new?.table_key, payload?.old?.table_key].filter((value): value is string => typeof value === "string");
      if (keys.some((value) => value.startsWith(PREFERENCE_KEY_PREFIX))) {
        emitChange();
      }
    })
    .subscribe();

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    void supabase.removeChannel(channel as RealtimeChannel);
  };
}
