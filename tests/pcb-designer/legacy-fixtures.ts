import { isPcbSaveState } from "../../src/components/pcb-designer/core/storage.ts";
import type { PcbSaveState } from "../../src/components/pcb-designer/types.ts";
export const LEGACY_KEY = "pcbDesignerWorkspace";
export function catalog(state: PcbSaveState) {
  return { projects: structuredClone(state.projects), library: structuredClone(state.library.filter(component => component.source !== "built-in")), updatedAt: state.updatedAt,
    remoteDeletions: { projects: [...state.remoteDeletions?.projects ?? []], library: [...state.remoteDeletions?.library ?? []] } };
}
export function envelope(records: Array<{ id: string; permissions: Record<string, unknown> }>, owner: string) {
  const own = records.find(record => record.id === owner)?.permissions;
  return { schemaVersion: 1, ownSnapshotPresent: Boolean(own && Object.hasOwn(own, LEGACY_KEY)), ownSnapshot: own?.[LEGACY_KEY] ?? null,
    sharedCatalog: [...records].sort((a, b) => a.id.localeCompare(b.id)).map(record => record.permissions[LEGACY_KEY]).filter(isPcbSaveState).map(catalog) };
}
