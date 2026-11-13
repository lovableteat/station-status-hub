import { supabase } from "@/integrations/supabase/client";
import type { CircuitChangeAction, CircuitChangeContent, CircuitChangeContext, CircuitChangeEvent, CircuitChangeItem, CircuitChangeSet, CircuitChangeStatus } from "./types";


// Narrow contracts for additive tables that are not in the generated schema yet.
// These describe the existing wire responses without changing the shared client.
export interface AdditiveQuery<Row, Result = Row[]> extends PromiseLike<{
  data: Result | null; error: { code?: string; message: string } | null; status: number;
}> {
  select(columns?: string): AdditiveQuery<Row, Result>;
  eq(column: string, value: unknown): AdditiveQuery<Row, Result>;
  neq(column: string, value: unknown): AdditiveQuery<Row, Result>;
  is(column: string, value: null | boolean): AdditiveQuery<Row, Result>;
  lt(column: string, value: unknown): AdditiveQuery<Row, Result>;
  in(column: string, values: readonly unknown[]): AdditiveQuery<Row, Result>;
  like(column: string, pattern: string): AdditiveQuery<Row, Result>;
  order(column: string, options?: { ascending?: boolean }): AdditiveQuery<Row, Result>;
  limit(count: number): AdditiveQuery<Row, Result>;
  range(from: number, to: number): AdditiveQuery<Row, Result>;
  single(): AdditiveQuery<Row, Row>;
  maybeSingle(): AdditiveQuery<Row, Row>;
  abortSignal(signal: AbortSignal): AdditiveQuery<Row, Result>;
}
export type AdditiveClient<Tables, Functions> = {
  from<Name extends keyof Tables>(name: Name): AdditiveQuery<Tables[Name]>;
  rpc<Name extends keyof Functions>(name: Name, args?: Record<string, unknown>): AdditiveQuery<Functions[Name], Functions[Name]>;
};
type ItemRow = {
  id: string; set_id: string; number: number; content: CircuitChangeContent;
  status: CircuitChangeStatus; revision: number; created_at: string; updated_at: string;
  created_by: string; updated_by: string; removed_at?: string; removed_by?: string; image_count?: number;
};
type SetRow = {
  id: string; series_id: string; workspace_id: string; project_id: string | null; title: string;
  from_label: string; to_label: string; created_at: string; updated_at: string; created_by: string;
};
type EventRow = {
  id: string; item_id: string; set_id: string; type: string; actor_id: string; actor_name: string;
  revision: number; note: string; snapshot: ItemRow; created_at: string;
};
type CircuitClient = AdditiveClient<{
  circuit_change_sets: SetRow; circuit_change_items: ItemRow; circuit_change_events: EventRow;
}, {
  circuit_change_create_set: SetRow; circuit_change_list_items: ItemRow[];
  circuit_change_save_item: ItemRow; circuit_change_set_removed: ItemRow; circuit_change_action: ItemRow;
}>;

// Additive tables are deployed before the generated application schema is refreshed.
const db = supabase as unknown as CircuitClient;
const PAGE_SIZE = 200;
export class CircuitChangeConflictError extends Error {
  constructor() { super("這個修改項目已由其他人更新；你的草稿仍保留，請先對照最新內容。"); }
}

async function request<Row, Result>(query: AdditiveQuery<Row, Result>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { data, error, status } = await query.abortSignal(controller.signal);
    if (error) {
      if (status === 409 || error.code === "PT409") throw new CircuitChangeConflictError();
      if (controller.signal.aborted) throw new Error("連線逾時，草稿仍保留；請重試或重新載入。");
      throw new Error(error.message || "無法保存線路修改，請重試。");
    }
    return data;
  } finally { clearTimeout(timer); }
}

function content(value: CircuitChangeContent): CircuitChangeContent {
  if (!value || typeof value !== "object" || !Array.isArray(value.images)) throw new Error("線路修改內容格式無效。");
  for (const field of ["title", "reason", "description", "refs", "net", "page", "owner"]) {
    if (typeof value[field] !== "string") throw new Error("線路修改欄位格式無效。");
  }
  return value as CircuitChangeContent;
}
function item(row: ItemRow): CircuitChangeItem {
  if (!row?.id || !row.set_id || !["draft", "in_review", "needs_changes", "approved"].includes(row.status) || !Number.isInteger(row.revision)) throw new Error("線路修改項目格式無效。");
  return { id: row.id, setId: row.set_id, number: row.number, content: content(row.content),
    status: row.status as CircuitChangeStatus, revision: row.revision, createdAt: row.created_at,
    updatedAt: row.updated_at, createdBy: row.created_by, updatedBy: row.updated_by,
    ...(row.removed_at ? { removedAt: row.removed_at, removedBy: row.removed_by } : {}),
    imageCount: row.image_count ?? row.content.images.length };
}
function changeSet(row: SetRow): CircuitChangeSet {
  if (!row?.id || !row.series_id || typeof row.title !== "string") throw new Error("線路修改批次格式無效。");
  return { id: row.id, seriesId: row.series_id, workspaceId: row.workspace_id, projectId: row.project_id,
    title: row.title, fromLabel: row.from_label, toLabel: row.to_label, createdAt: row.created_at,
    updatedAt: row.updated_at, createdBy: row.created_by };
}
function event(row: EventRow): CircuitChangeEvent {
  return { id: row.id, itemId: row.item_id, setId: row.set_id, type: row.type, actorId: row.actor_id,
    actorName: row.actor_name, revision: row.revision, note: row.note || "", snapshot: item(row.snapshot), createdAt: row.created_at };
}
async function readPages<Row>(makeQuery: () => AdditiveQuery<Row>) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await request(makeQuery().range(offset, offset + PAGE_SIZE - 1));
    if (!Array.isArray(page)) throw new Error("線路修改清單回應無效。");
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function listCircuitChangeSets(seriesId: string) {
  return (await readPages(() => db.from("circuit_change_sets").select("*").eq("series_id", seriesId).order("created_at", { ascending: false }).order("id"))).map(changeSet);
}
export async function createCircuitChangeSet(context: CircuitChangeContext, title: string, fromLabel: string, toLabel: string) {
  return changeSet(await request(db.rpc("circuit_change_create_set", {
    p_series_id: context.seriesId, p_workspace_id: context.workspaceId, p_project_id: context.projectId ?? null,
    p_title: title.trim(), p_from_label: fromLabel.trim(), p_to_label: toLabel.trim(),
  })));
}
export async function listCircuitChangeItems(setId: string) {
  const rows = await request(db.rpc("circuit_change_list_items", { p_set_id: setId }));
  if (!Array.isArray(rows)) throw new Error("線路修改清單回應無效。");
  return rows.map(item);
}
export async function getCircuitChangeItem(id: string) {
  return item(await request(db.from("circuit_change_items").select("*").eq("id", id).single()));
}
export async function saveCircuitChangeItem(setId: string, id: string, revision: number, value: CircuitChangeContent) {
  const saved = item(await request(db.rpc("circuit_change_save_item", {
    p_set_id: setId, p_item_id: id, p_expected_revision: revision, p_content: value,
  })));
  if (saved.removedAt) throw new CircuitChangeConflictError();
  return saved;
}
export async function setCircuitChangeItemRemoved(id: string, revision: number, removed: boolean) {
  return item(await request(db.rpc("circuit_change_set_removed", { p_item_id: id, p_expected_revision: revision, p_removed: removed })));
}
export async function actOnCircuitChangeItem(id: string, revision: number, action: CircuitChangeAction, note = "") {
  return item(await request(db.rpc("circuit_change_action", {
    p_item_id: id, p_expected_revision: revision, p_action: action, p_note: note.trim(),
  })));
}

const EVENT_METADATA = "id,item_id,set_id,type,actor_id,actor_name,revision,note,created_at";
// Historical images are loaded only when opening that immutable revision.
async function eventMetadata(itemIds: string[]) {
  const output: CircuitChangeEvent[] = [];
  for (let offset = 0; offset < itemIds.length; offset += 100) {
    const ids = itemIds.slice(offset, offset + 100);
    const rows = await readPages(() => db.from("circuit_change_events").select(EVENT_METADATA).in("item_id", ids).order("created_at", { ascending: false }).order("id"));
    output.push(...rows.map((row) => ({ id: row.id, itemId: row.item_id, setId: row.set_id, type: row.type,
      actorId: row.actor_id, actorName: row.actor_name, revision: row.revision, note: row.note || "", createdAt: row.created_at })));
  }
  return output;
}
export const listCircuitChangeEvents = (itemId: string) => eventMetadata([itemId]);
export async function getCircuitChangeEvent(id: string) {
  return event(await request(db.from("circuit_change_events").select("*").eq("id", id).single()));
}
export async function loadCircuitChangeItemsForExport(ids: string[]) {
  const rows: CircuitChangeItem[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    rows.push(...(await readPages(() => db.from("circuit_change_items").select("*").in("id", chunk).order("id"))).map(item));
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.map(id => { const row = byId.get(id); if (!row) throw new Error("有修改項目已不可讀取，請重新載入後再匯出。"); return row; });
}
export const loadCircuitChangeEventsForExport = eventMetadata;

export function subscribeCircuitChanges(seriesId: string, _setId: string, onChange: () => void) {
  // Every item write bumps its set; subscribe to metadata without broadcasting image arrays.
  const channel = supabase.channel(`circuit-change:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "workspace", table: "circuit_change_sets", filter: `series_id=eq.${seriesId}` }, onChange);
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
