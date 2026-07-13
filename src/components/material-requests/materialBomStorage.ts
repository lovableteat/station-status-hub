import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

import type { MaterialWorkbookPayload, MaterialWorkbookRecord } from "./materialRequestUtils";

export type BomPageTrackerStatus = "done" | "pending" | "done_missing";

export interface BomPageTrackerPage {
  pageNumber: number;
  status: BomPageTrackerStatus;
  completed?: boolean;
  note: string;
}

export interface BomPageTracker {
  totalPages: number;
  currentPage?: number;
  pages: BomPageTrackerPage[];
  updatedAt: string;
}

export interface BomTableColorTheme {
  primary: string;
  alternative: string;
  secondary: string;
}

export interface BomWorkspace {
  id: string;
  name: string;
  payload: MaterialWorkbookPayload;
  pageTracker?: BomPageTracker;
  recordMeta?: Record<string, BomRecordSyncMeta>;
  tableColorTheme?: BomTableColorTheme;
  isLoaded?: boolean;
  updatedAt: string;
}

export interface BomRecordSyncMeta {
  updatedAt: string;
}

export class BomRecordConflictError extends Error {
  constructor(public readonly recordId: string) {
    super("此筆料號已由其他使用者更新，系統已阻止覆蓋。請載入最新資料後再確認修改內容。");
    this.name = "BomRecordConflictError";
  }
}

export type BomStorageMode = "remote" | "recovery";

export interface BomWorkspaceLoadResult {
  mode: BomStorageMode;
  workspaces: BomWorkspace[];
}

export interface BomWorkspaceChange {
  recordIds: string[];
  workspaceIds: string[];
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

interface BomWorkspaceCacheEntry {
  cachedAt: string;
  id: "latest";
  result: BomWorkspaceLoadResult;
}

const DATABASE_NAME = "station-status-hub-material-boms";
const STORE_NAME = "boms";
const RENDER_CACHE_DATABASE_NAME = "station-status-hub-material-bom-render-cache";
const RENDER_CACHE_STORE_NAME = "snapshots";
const RENDER_CACHE_ENTRY_ID = "latest";
const WORKSPACE_TABLE = "material_bom_workspaces";
const RECORD_TABLE = "material_bom_records";
const PREFERENCE_TABLE = "ui_table_preferences";
const PREFERENCE_KEY_PREFIX = "material-bom-workspace:";
const PAGE_TRACKER_KEY_PREFIX = "material-bom-page-tracker:";
const TABLE_COLOR_THEME_KEY_PREFIX = "material-bom-table-color-theme:";
const RECORD_BATCH_SIZE = 200;
const REMOTE_RECORD_FETCH_BATCH_SIZE = 1000;
let renderCacheDatabasePromise: Promise<IDBDatabase | null> | null = null;

// Collaborative BOM tables predate the generated Supabase schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseClient = supabase as any;

interface RealtimeRowPayload {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

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

function getPageTrackerRowKey(workspaceId: string) {
  return `${PAGE_TRACKER_KEY_PREFIX}${workspaceId}`;
}

function openRenderCacheDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve<IDBDatabase | null>(null);
  }
  if (renderCacheDatabasePromise) return renderCacheDatabasePromise;

  renderCacheDatabasePromise = new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = window.indexedDB.open(RENDER_CACHE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RENDER_CACHE_STORE_NAME)) {
        database.createObjectStore(RENDER_CACHE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);

  return renderCacheDatabasePromise;
}

async function runRenderCacheRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openRenderCacheDatabase();
  if (!database) return null;

  return new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(RENDER_CACHE_STORE_NAME, mode);
    const request = action(transaction.objectStore(RENDER_CACHE_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRenderCacheEntry() {
  try {
    return await runRenderCacheRequest<BomWorkspaceCacheEntry>(
      "readonly",
      (store) => store.get(RENDER_CACHE_ENTRY_ID),
    );
  } catch {
    return null;
  }
}

async function writeRenderCacheResult(result: BomWorkspaceLoadResult) {
  try {
    const entry: BomWorkspaceCacheEntry = {
      cachedAt: new Date().toISOString(),
      id: "latest",
      result,
    };
    await runRenderCacheRequest<IDBValidKey>("readwrite", (store) => store.put(entry));
  } catch {
    // The cache is optional. Storage quota failures must never affect production data.
  }
}

async function patchCachedWorkspace(workspace: BomWorkspace) {
  const entry = await readRenderCacheEntry();
  if (!entry) return;

  const exists = entry.result.workspaces.some((candidate) => candidate.id === workspace.id);
  const workspaces = exists
    ? entry.result.workspaces.map((candidate) => candidate.id === workspace.id ? workspace : candidate)
    : [workspace, ...entry.result.workspaces];
  await writeRenderCacheResult({ ...entry.result, workspaces: sortWorkspaces(workspaces) });
}

async function patchCachedWorkspaceFields(
  workspaceId: string,
  update: (workspace: BomWorkspace) => BomWorkspace,
) {
  const entry = await readRenderCacheEntry();
  if (!entry) return;
  await writeRenderCacheResult({
    ...entry.result,
    workspaces: entry.result.workspaces.map((workspace) => (
      workspace.id === workspaceId ? update(workspace) : workspace
    )),
  });
}

async function removeCachedWorkspace(workspaceId: string) {
  const entry = await readRenderCacheEntry();
  if (!entry) return;
  await writeRenderCacheResult({
    ...entry.result,
    workspaces: entry.result.workspaces.filter((workspace) => workspace.id !== workspaceId),
  });
}

function getTableColorThemeRowKey(workspaceId: string) {
  return `${TABLE_COLOR_THEME_KEY_PREFIX}${workspaceId}`;
}

function normalizePageTracker(raw: unknown, fallbackUpdatedAt: string) {
  if (!raw || typeof raw !== "object") return undefined;

  const tracker = raw as Partial<BomPageTracker>;
  const totalPagesValue = Number(tracker.totalPages ?? 0);
  const totalPages = Number.isFinite(totalPagesValue) ? Math.max(0, Math.trunc(totalPagesValue)) : 0;
  const currentPageValue = Number(tracker.currentPage ?? 0);
  const currentPage = Number.isFinite(currentPageValue)
    ? Math.max(0, Math.trunc(currentPageValue))
    : 0;
  const pageMap = new Map<number, BomPageTrackerPage>();

  if (Array.isArray(tracker.pages)) {
    tracker.pages.forEach((page) => {
      if (!page || typeof page !== "object") return;

      const candidate = page as Partial<BomPageTrackerPage>;
      const pageNumberValue = Number(candidate.pageNumber ?? 0);
      const pageNumber = Number.isFinite(pageNumberValue) ? Math.trunc(pageNumberValue) : 0;
      if (pageNumber < 1) return;

      pageMap.set(pageNumber, {
        pageNumber,
        status: candidate.status === "done" || candidate.status === "pending" || candidate.status === "done_missing"
          ? candidate.status
          : candidate.completed === true
            ? "done"
            : "pending",
        note: typeof candidate.note === "string" ? candidate.note : "",
      });
    });
  }

  return {
    totalPages,
    currentPage: totalPages > 0 ? Math.min(totalPages, currentPage) : 0,
    pages: [...pageMap.values()].sort((left, right) => left.pageNumber - right.pageNumber),
    updatedAt: typeof tracker.updatedAt === "string" ? tracker.updatedAt : fallbackUpdatedAt,
  } satisfies BomPageTracker;
}

function normalizeTableColorTheme(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;

  const candidate = raw as Partial<BomTableColorTheme>;
  const normalizeColor = (value: unknown) => (
    typeof value === "string" && /^#([0-9a-f]{6})$/i.test(value.trim())
      ? value.trim().toUpperCase()
      : ""
  );

  const primary = normalizeColor(candidate.primary);
  const alternative = normalizeColor(candidate.alternative);
  const secondary = normalizeColor(candidate.secondary);

  if (!primary || !alternative || !secondary) return undefined;

  return {
    primary,
    alternative,
    secondary,
  } satisfies BomTableColorTheme;
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
    pageTracker: normalizePageTracker(workspace.pageTracker, fallbackUpdatedAt),
    tableColorTheme: normalizeTableColorTheme(workspace.tableColorTheme),
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

function buildWorkspaceFromRows(
  workspaceRow: BomWorkspaceRow,
  recordRows: BomRecordRow[],
  pageTracker?: BomPageTracker,
  tableColorTheme?: BomTableColorTheme,
): BomWorkspace {
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
    pageTracker,
    recordMeta: Object.fromEntries(
      recordRows.map((row) => [row.record_id, { updatedAt: row.updated_at } satisfies BomRecordSyncMeta]),
    ),
    tableColorTheme,
    isLoaded: true,
    updatedAt: workspaceRow.updated_at,
  };
}

function buildWorkspaceSummary(
  workspaceRow: BomWorkspaceRow,
  pageTracker?: BomPageTracker,
  tableColorTheme?: BomTableColorTheme,
): BomWorkspace {
  return {
    id: workspaceRow.id,
    name: workspaceRow.name,
    payload: {
      sourceFile: workspaceRow.source_file,
      sheetName: workspaceRow.sheet_name,
      generatedAt: workspaceRow.generated_at,
      recordCount: workspaceRow.record_count,
      records: [],
    },
    pageTracker,
    recordMeta: {},
    tableColorTheme,
    isLoaded: workspaceRow.record_count === 0,
    updatedAt: workspaceRow.updated_at,
  };
}

async function loadPageTrackerMap() {
  const { data, error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .select("table_key, column_order, updated_at")
    .like("table_key", `${PAGE_TRACKER_KEY_PREFIX}%`);

  if (error) throw error;

  const pageTrackerByWorkspace = new Map<string, BomPageTracker>();
  for (const row of (data ?? []) as BomPreferenceRow[]) {
    const workspaceId = row.table_key.replace(PAGE_TRACKER_KEY_PREFIX, "");
    if (!workspaceId) continue;

    const pageTracker = normalizePageTracker(row.column_order, row.updated_at);
    if (pageTracker) {
      pageTrackerByWorkspace.set(workspaceId, pageTracker);
    }
  }

  return pageTrackerByWorkspace;
}

async function loadRemoteRecordRowsForWorkspace(workspaceId: string) {
  const rows: BomRecordRow[] = [];

  for (let start = 0; ; start += REMOTE_RECORD_FETCH_BATCH_SIZE) {
    const end = start + REMOTE_RECORD_FETCH_BATCH_SIZE - 1;
    const { data, error } = await supabaseClient
      .from(RECORD_TABLE)
      .select("workspace_id, record_id, order_index, data, updated_at")
      .eq("workspace_id", workspaceId)
      .order("order_index", { ascending: true })
      .range(start, end);

    if (error) throw error;

    const batch = (data ?? []) as BomRecordRow[];
    rows.push(...batch);

    if (batch.length < REMOTE_RECORD_FETCH_BATCH_SIZE) break;
  }

  return rows;
}

async function loadTableColorThemeMap() {
  const { data, error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .select("table_key, column_order, updated_at")
    .like("table_key", `${TABLE_COLOR_THEME_KEY_PREFIX}%`);

  if (error) throw error;

  const themeByWorkspace = new Map<string, BomTableColorTheme>();
  for (const row of (data ?? []) as BomPreferenceRow[]) {
    const workspaceId = row.table_key.replace(TABLE_COLOR_THEME_KEY_PREFIX, "");
    if (!workspaceId) continue;

    const theme = normalizeTableColorTheme(row.column_order);
    if (theme) {
      themeByWorkspace.set(workspaceId, theme);
    }
  }

  return themeByWorkspace;
}

async function loadRemoteBomWorkspaces(preferredWorkspaceId?: string) {
  const [workspaceResponse, pageTrackerByWorkspace, tableColorThemeByWorkspace] = await Promise.all([
    supabaseClient
      .from(WORKSPACE_TABLE)
      .select("id, name, source_file, sheet_name, generated_at, record_count, updated_at")
      .order("updated_at", { ascending: false }),
    loadPageTrackerMap(),
    loadTableColorThemeMap(),
  ]);

  if (workspaceResponse.error) throw workspaceResponse.error;

  const workspaceRows = (workspaceResponse.data ?? []) as BomWorkspaceRow[];
  const activeWorkspaceId = preferredWorkspaceId && workspaceRows.some((row) => row.id === preferredWorkspaceId)
    ? preferredWorkspaceId
    : workspaceRows[0]?.id;
  const activeRecordRows = activeWorkspaceId
    ? await loadRemoteRecordRowsForWorkspace(activeWorkspaceId)
    : [];

  return sortWorkspaces(
    workspaceRows.map((workspaceRow) => workspaceRow.id === activeWorkspaceId
      ? buildWorkspaceFromRows(
          {
            ...workspaceRow,
            record_count: activeRecordRows.length,
          },
          activeRecordRows,
          pageTrackerByWorkspace.get(workspaceRow.id),
          tableColorThemeByWorkspace.get(workspaceRow.id),
        )
      : buildWorkspaceSummary(
          workspaceRow,
          pageTrackerByWorkspace.get(workspaceRow.id),
          tableColorThemeByWorkspace.get(workspaceRow.id),
        ))
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

async function saveRemotePageTracker(workspaceId: string, pageTracker: BomPageTracker) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .upsert({
      table_key: getPageTrackerRowKey(workspaceId),
      column_order: pageTracker,
    }, { onConflict: "table_key" });

  if (error) throw error;
}

async function saveRemoteTableColorTheme(workspaceId: string, tableColorTheme: BomTableColorTheme) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .upsert({
      table_key: getTableColorThemeRowKey(workspaceId),
      column_order: tableColorTheme,
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

async function removeRemotePageTracker(id: string) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .delete()
    .eq("table_key", getPageTrackerRowKey(id));

  if (error) throw error;
}

async function removeRemoteTableColorTheme(id: string) {
  const { error } = await supabaseClient
    .from(PREFERENCE_TABLE)
    .delete()
    .eq("table_key", getTableColorThemeRowKey(id));

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
  const [preferenceWorkspaces, legacyWorkspaces, pageTrackerByWorkspace, tableColorThemeByWorkspace] = await Promise.all([
    loadPreferenceBackedBomWorkspaces().catch(() => []),
    loadLegacyBomWorkspaces(),
    loadPageTrackerMap().catch(() => new Map<string, BomPageTracker>()),
    loadTableColorThemeMap().catch(() => new Map<string, BomTableColorTheme>()),
  ]);
  const mergedPreferenceWorkspaces = preferenceWorkspaces.map((workspace) => ({
    ...workspace,
    pageTracker: pageTrackerByWorkspace.get(workspace.id) ?? workspace.pageTracker,
    tableColorTheme: tableColorThemeByWorkspace.get(workspace.id) ?? workspace.tableColorTheme,
  }));
  const mergedLegacyWorkspaces = legacyWorkspaces.map((workspace) => ({
    ...workspace,
    pageTracker: pageTrackerByWorkspace.get(workspace.id) ?? workspace.pageTracker,
    tableColorTheme: tableColorThemeByWorkspace.get(workspace.id) ?? workspace.tableColorTheme,
  }));

  try {
    return await migrateLegacyBomWorkspaces(
      mergedPreferenceWorkspaces,
      savePreferenceBackedWorkspace,
      async () => {
        const [workspaces, latestPageTrackerByWorkspace] = await Promise.all([
          loadPreferenceBackedBomWorkspaces(),
          loadPageTrackerMap().catch(() => new Map<string, BomPageTracker>()),
        ]);
        const latestTableColorThemeByWorkspace = await loadTableColorThemeMap().catch(
          () => new Map<string, BomTableColorTheme>(),
        );

        return workspaces.map((workspace) => ({
          ...workspace,
          pageTracker: latestPageTrackerByWorkspace.get(workspace.id) ?? workspace.pageTracker,
          tableColorTheme: latestTableColorThemeByWorkspace.get(workspace.id) ?? workspace.tableColorTheme,
        }));
      },
    );
  } catch {
    const merged = new Map<string, BomWorkspace>();
    for (const workspace of [...mergedPreferenceWorkspaces, ...mergedLegacyWorkspaces]) {
      const current = merged.get(workspace.id);
      if (!current || toTimestamp(workspace.updatedAt) > toTimestamp(current.updatedAt)) {
        merged.set(workspace.id, workspace);
      }
    }

    return sortWorkspaces([...merged.values()]);
  }
}

export async function loadBomWorkspacesDetailed(preferredWorkspaceId?: string): Promise<BomWorkspaceLoadResult> {
  try {
    const remoteWorkspaces = await loadRemoteBomWorkspaces(preferredWorkspaceId);
    const result: BomWorkspaceLoadResult = {
      mode: "remote",
      workspaces: await migrateLegacyBomWorkspaces(
        remoteWorkspaces,
        saveBomWorkspace,
        () => loadRemoteBomWorkspaces(preferredWorkspaceId),
      ),
    };
    void writeRenderCacheResult(result);
    return result;
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

export async function loadCachedBomWorkspacesDetailed() {
  const entry = await readRenderCacheEntry();
  return entry?.result ?? null;
}

export async function loadBomWorkspaces() {
  const result = await loadBomWorkspacesDetailed();
  return result.workspaces;
}

export async function loadBomWorkspaceById(workspaceId: string) {
  const result = await loadBomWorkspacesDetailed(workspaceId);
  return {
    mode: result.mode,
    workspace: result.workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    workspaces: result.workspaces,
  };
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

  if (workspace.pageTracker) {
    await saveRemotePageTracker(workspace.id, workspace.pageTracker);
  }

  if (workspace.tableColorTheme) {
    await saveRemoteTableColorTheme(workspace.id, workspace.tableColorTheme);
  }

  await upsertWorkspaceRow(workspace);
  await removeLegacyBomWorkspace(workspace.id);
  void patchCachedWorkspace(workspace);
}

export async function saveBomWorkspaceRecord(workspace: BomWorkspace, record: MaterialWorkbookRecord) {
  await upsertWorkspaceRow(workspace);

  const orderIndex = workspace.payload.records.findIndex((item) => item.id === record.id);
  if (orderIndex < 0) {
    throw new Error(`Unable to save BOM record ${record.id} because it is not present in workspace ${workspace.id}.`);
  }

  const existingRecord = workspace.payload.records.some((item) => item.id === record.id);
  let expectedUpdatedAt = workspace.recordMeta?.[record.id]?.updatedAt;

  if (existingRecord && !expectedUpdatedAt) {
    const { data: currentRow, error: currentRowError } = await supabaseClient
      .from(RECORD_TABLE)
      .select("updated_at")
      .eq("workspace_id", workspace.id)
      .eq("record_id", record.id)
      .maybeSingle();

    if (currentRowError) throw currentRowError;
    expectedUpdatedAt = currentRow?.updated_at;
  }

  if (expectedUpdatedAt) {
    const { data, error } = await supabaseClient
      .from(RECORD_TABLE)
      .update({ data: record, order_index: orderIndex })
      .eq("workspace_id", workspace.id)
      .eq("record_id", record.id)
      .eq("updated_at", expectedUpdatedAt)
      .select("updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new BomRecordConflictError(record.id);

    await removeLegacyBomWorkspace(workspace.id);
    void patchCachedWorkspace(workspace);
    return { updatedAt: data.updated_at as string } satisfies BomRecordSyncMeta;
  }

  const { data, error } = await supabaseClient
    .from(RECORD_TABLE)
    .insert({
      workspace_id: workspace.id,
      record_id: record.id,
      order_index: orderIndex,
      data: record,
      updated_at: workspace.updatedAt,
    })
    .select("updated_at")
    .single();

  if (error) {
    if (error.code === "23505") throw new BomRecordConflictError(record.id);
    throw error;
  }

  await removeLegacyBomWorkspace(workspace.id);
  void patchCachedWorkspace(workspace);
  return { updatedAt: data.updated_at as string } satisfies BomRecordSyncMeta;
}

export async function saveBomWorkspacePageTracker(workspaceId: string, pageTracker: BomPageTracker) {
  await saveRemotePageTracker(workspaceId, pageTracker);
  void patchCachedWorkspaceFields(workspaceId, (workspace) => ({ ...workspace, pageTracker }));
}

export async function saveBomWorkspaceTableColorTheme(workspaceId: string, tableColorTheme: BomTableColorTheme) {
  await saveRemoteTableColorTheme(workspaceId, tableColorTheme);
  void patchCachedWorkspaceFields(workspaceId, (workspace) => ({ ...workspace, tableColorTheme }));
}

export async function removeBomWorkspace(id: string) {
  const { error } = await supabaseClient
    .from(WORKSPACE_TABLE)
    .delete()
    .eq("id", id);

  if (error) throw error;

  await Promise.allSettled([
    removePreferenceBackedWorkspace(id),
    removeRemotePageTracker(id),
    removeRemoteTableColorTheme(id),
  ]);
  await removeLegacyBomWorkspace(id);
  void removeCachedWorkspace(id);
}

export function subscribeBomWorkspaceChanges(onChange: (change: BomWorkspaceChange) => void) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const workspaceIds = new Set<string>();
  const recordIds = new Set<string>();
  const emitChange = (workspaceId?: unknown, recordId?: unknown) => {
    if (typeof workspaceId === "string" && workspaceId) workspaceIds.add(workspaceId);
    if (typeof recordId === "string" && recordId) recordIds.add(recordId);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onChange({ workspaceIds: [...workspaceIds], recordIds: [...recordIds] });
      workspaceIds.clear();
      recordIds.clear();
      debounceTimer = null;
    }, 180);
  };

  const channel = supabaseClient
    .channel("material_bom_workspace_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: WORKSPACE_TABLE }, (payload: RealtimeRowPayload) => {
      emitChange(payload?.new?.id ?? payload?.old?.id);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: RECORD_TABLE }, (payload: RealtimeRowPayload) => {
      emitChange(
        payload?.new?.workspace_id ?? payload?.old?.workspace_id,
        payload?.new?.record_id ?? payload?.old?.record_id,
      );
    })
    .on("postgres_changes", { event: "*", schema: "public", table: PREFERENCE_TABLE }, (payload: RealtimeRowPayload) => {
      const keys = [payload?.new?.table_key, payload?.old?.table_key].filter((value): value is string => typeof value === "string");
      if (keys.some((value) => value.startsWith(PREFERENCE_KEY_PREFIX) || value.startsWith(PAGE_TRACKER_KEY_PREFIX) || value.startsWith(TABLE_COLOR_THEME_KEY_PREFIX))) {
        const workspaceId = keys
          .map((key) => key.split(":").pop())
          .find(Boolean);
        emitChange(workspaceId);
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
