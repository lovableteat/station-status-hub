import type { PcbSaveState } from "../types.ts";

export type PcbPersistenceStatus = "local" | "saving" | "synced";
type RemoteError = { code?: string; message?: string } | null;
type RemoteTable = {
  upsert: (
    rows: unknown[],
    options: { onConflict: string; defaultToNull: boolean },
  ) => Promise<{ error: RemoteError }>;
  delete: () => {
    in: (column: "id", ids: string[]) => Promise<{ error: RemoteError }>;
  };
};

export interface PcbRemoteClient {
  from(table: "pcb_designer_projects" | "pcb_designer_templates" | "pcb_designer_library"): RemoteTable;
}

async function reconcileTable(
  client: PcbRemoteClient,
  tableName: Parameters<PcbRemoteClient["from"]>[0],
  rows: Array<{ id: string; payload: unknown }>,
  deletedIds: string[],
): Promise<boolean> {
  const table = client.from(tableName);
  const upsert = await table.upsert(rows, {
    onConflict: "id",
    defaultToNull: false,
  });
  if (upsert.error) return false;
  if (!deletedIds.length) return true;
  const removed = await table.delete().in("id", deletedIds);
  return !removed.error;
}

export async function syncPcbRemote(client: PcbRemoteClient, state: PcbSaveState): Promise<boolean> {
  try {
    const results = await Promise.all([
      reconcileTable(client, "pcb_designer_projects", state.projects.map((project) => ({ id: project.id, payload: project })), state.remoteDeletions?.projects ?? []),
      reconcileTable(client, "pcb_designer_templates", state.templates.map((template) => ({ id: template.id, payload: template })), state.remoteDeletions?.templates ?? []),
      reconcileTable(client, "pcb_designer_library", state.library.map((component) => ({ id: component.id, payload: component })), state.remoteDeletions?.library ?? []),
    ]);
    return results.every(Boolean);
  } catch {
    return false;
  }
}

type Sync = (state: PcbSaveState) => Promise<boolean>;
type StatusListener = (status: Extract<PcbPersistenceStatus, "local" | "synced">) => void;

/** Runs remote saves in order; obsolete queued/stale completions never publish a status. */
export class PcbRemoteSyncCoordinator {
  private generation = 0;
  private active = true;
  private queue: Promise<void> = Promise.resolve();
  private readonly sync: Sync;
  private readonly onStatus: StatusListener;

  constructor(sync: Sync, onStatus: StatusListener) {
    this.sync = sync;
    this.onStatus = onStatus;
  }

  reserve(): number {
    this.generation += 1;
    return this.generation;
  }

  commit(generation: number, state: PcbSaveState): void {
    this.queue = this.queue.then(async () => {
      if (!this.active || generation !== this.generation) return;
      const saved = await this.sync(state);
      if (this.active && generation === this.generation) this.onStatus(saved ? "synced" : "local");
    });
  }

  schedule(state: PcbSaveState): void {
    this.commit(this.reserve(), state);
  }

  dispose(): void {
    this.active = false;
    this.generation += 1;
  }

  flush(): Promise<void> {
    return this.queue;
  }
}
