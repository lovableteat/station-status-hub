export interface RealtimeRow {
  id: string;
  project_id: string;
  updated_at?: string;
  flow_version_id?: string;
}

export interface RowChange<T extends RealtimeRow> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<T>;
  old: Partial<T>;
  commit_timestamp?: string;
}

/** Event clocks retain DELETE tombstones so delayed updates cannot resurrect rows. */
export function acceptRowChange<T extends RealtimeRow>(clocks: Map<string, string>, change: RowChange<T>): boolean {
  const row = change.eventType === "DELETE" ? change.old : change.new;
  const timestamp = change.commit_timestamp ?? row.updated_at;
  if (!row.id || !timestamp) return true;
  const previous = clocks.get(row.id);
  if (previous && timestamp < previous) return false;
  clocks.set(row.id, timestamp);
  return true;
}

/** Idempotent upsert; UPDATE can arrive before the initial snapshot/INSERT. */
export function applyRowChange<T extends RealtimeRow>(
  rows: T[], change: RowChange<T>, projectId: string, flowVersionId?: string | null,
): T[] {
  const record = change.eventType === "DELETE" ? change.old : change.new;
  if (!record.id) return rows;
  const existing = rows.find((row) => row.id === record.id);
  // DELETE payloads may contain only the primary key under default replica identity.
  if (record.project_id && record.project_id !== projectId) return rows;
  if (change.eventType === "DELETE") return rows.filter((row) => row.id !== record.id);
  if (record.project_id !== projectId) return rows;
  if (flowVersionId && record.flow_version_id && record.flow_version_id !== flowVersionId) {
    return rows.filter((row) => row.id !== record.id);
  }
  if (existing?.updated_at && record.updated_at && record.updated_at < existing.updated_at) return rows;
  const next = { ...existing, ...record } as T;
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return rows;
  return existing ? rows.map((row) => row.id === next.id ? next : row) : [...rows, next];
}

/** Replay changes received while a snapshot request was in flight. */
export function reconcileSnapshot<T extends RealtimeRow>(
  snapshot: T[], changes: RowChange<T>[], projectId: string, flowVersionId?: string | null,
): T[] {
  const unique = [...new Map(snapshot.map((row) => [row.id, row])).values()];
  return changes.reduce((rows, change) => applyRowChange(rows, change, projectId, flowVersionId), unique);
}
