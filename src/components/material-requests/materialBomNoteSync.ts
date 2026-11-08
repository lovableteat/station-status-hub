import type { BomNoteSnapshot, BomWorkspace, BomWorkspaceRecordChange } from "./materialBomStorage";

function timestampMicros(value: string) {
  const fraction = value.match(/\.(\d{1,6})/)?.[1] ?? "";
  return Date.parse(value) * 1000 + Number(fraction.padEnd(6, "0").slice(3));
}

function hasCurrentRecord(workspace: BomWorkspace, { record, recordMeta }: BomNoteSnapshot) {
  const current = workspace.recordMeta?.[record.id]?.updatedAt;
  return current !== undefined && (
    current === recordMeta.updatedAt || timestampMicros(current) >= timestampMicros(recordMeta.updatedAt)
  );
}

export function applyBomNoteSnapshot(workspace: BomWorkspace, snapshot: BomNoteSnapshot): BomWorkspace {
  const { record, recordMeta } = snapshot;
  if (hasCurrentRecord(workspace, snapshot) || !workspace.payload.records.some(item => item.id === record.id)) return workspace;

  return {
    ...workspace,
    payload: { ...workspace.payload, records: workspace.payload.records.map(item => item.id === record.id ? record : item) },
    recordMeta: { ...workspace.recordMeta, [record.id]: recordMeta },
  };
}

export function applyRealtimeBomRecords(workspace: BomWorkspace, changes: readonly BomWorkspaceRecordChange[]) {
  const pending = new Map(changes.filter(change => change.workspaceId === workspace.id).map(change => [change.recordId, change]));
  if (!pending.size) return { workspace, pendingRecordIds: [] };

  const recordMeta = { ...workspace.recordMeta };
  let changed = false;
  const records = workspace.payload.records.map((current, index) => {
    const change = pending.get(current.id);
    if (!change?.snapshot) return current;
    const { record, recordMeta: incomingMeta } = change.snapshot;
    if (hasCurrentRecord(workspace, change.snapshot)) {
      pending.delete(current.id);
      return current;
    }
    if (record.id !== current.id || change.orderIndex !== index) return current;

    pending.delete(current.id);
    recordMeta[current.id] = incomingMeta;
    changed = true;
    return record;
  });

  return {
    workspace: changed ? { ...workspace, payload: { ...workspace.payload, records }, recordMeta } : workspace,
    pendingRecordIds: [...pending.keys()],
  };
}

/** A background read must not roll back a newer row received while it was in flight. */
export function mergeBomWorkspaceRecords(loaded: BomWorkspace, current: BomWorkspace): BomWorkspace {
  return applyRealtimeBomRecords(loaded, current.payload.records.flatMap((record, orderIndex) => {
    const recordMeta = current.recordMeta?.[record.id];
    return recordMeta ? [{ workspaceId: current.id, recordId: record.id, orderIndex, snapshot: { record, recordMeta } }] : [];
  })).workspace;
}
