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

export function applyRealtimeBomNotes(workspace: BomWorkspace, changes: readonly BomWorkspaceRecordChange[]) {
  const pending = new Map(changes.map(change => [change.recordId, change]));
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
    // Other BOM edits keep the existing manual refresh and version checks.
    const { note: _currentNote, ...currentFields } = current;
    const { note: _incomingNote, ...incomingFields } = record;
    if (change.orderIndex !== index || JSON.stringify(currentFields) !== JSON.stringify(incomingFields)) return current;

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
