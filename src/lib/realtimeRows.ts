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

/** PostgreSQL emits microseconds; keep ordering within the same millisecond. */
function timestampOrder(value: string): number {
  const milliseconds = Date.parse(value);
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? "";
  return milliseconds * 1_000 + Number(fraction.padEnd(6, "0").slice(3, 6));
}

/** A visible row committed no earlier than its transaction-start updated_at. */
export function seedSnapshotClocks(
  clocks: Map<string, string>, snapshot: ReadonlyArray<{ id: string; updated_at?: string }>,
): void {
  for (const row of snapshot) {
    if (!row.updated_at || !Number.isFinite(timestampOrder(row.updated_at))) continue;
    const previous = clocks.get(row.id);
    if (!previous || !Number.isFinite(timestampOrder(previous))
      || timestampOrder(row.updated_at) > timestampOrder(previous)) clocks.set(row.id, row.updated_at);
  }
}

/** Event clocks retain DELETE tombstones so delayed updates cannot resurrect rows. */
export function acceptRowChange<T extends RealtimeRow>(clocks: Map<string, string>, change: RowChange<T>): boolean {
  const row = change.eventType === "DELETE" ? change.old : change.new;
  const timestamp = change.commit_timestamp ?? row.updated_at;
  if (!row.id || !timestamp) return true;
  const previous = clocks.get(row.id);
  if (previous && timestampOrder(timestamp) < timestampOrder(previous)) return false;
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
  // updated_at can be the transaction-start time; commit order is authoritative.
  if (!change.commit_timestamp && existing?.updated_at && record.updated_at
    && timestampOrder(record.updated_at) < timestampOrder(existing.updated_at)) return rows;
  const next = { ...existing, ...record } as T;
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return rows;
  return existing ? rows.map((row) => row.id === next.id ? next : row) : [...rows, next];
}

/**
 * Replay over a row-specific commit lower bound, not an empty event clock.
 * A commit before snapshot.updated_at is provably older; a later commit can
 * legitimately contain an earlier transaction-start time and remains eligible.
 * Keep the scope clocks so delayed deliveries after the read use the same rule.
 * This is not a server snapshot LSN; absent timestamps cannot prove freshness.
 */
export function reconcileSnapshot<T extends RealtimeRow>(
  snapshot: T[], changes: RowChange<T>[], projectId: string, flowVersionId?: string | null,
  clocks: Map<string, string> = new Map(),
): T[] {
  const unique = [...new Map(snapshot.map((row) => [row.id, row])).values()];
  seedSnapshotClocks(clocks, unique);
  return changes.reduce((rows, change) => acceptRowChange(clocks, change)
    ? applyRowChange(rows, change, projectId, flowVersionId) : rows, unique);
}
