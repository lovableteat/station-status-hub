import type { PcbSaveState } from "../types.ts";

export type PcbPersistenceStatus = "local" | "saving" | "synced";
type RemoteError = { code?: string; message?: string } | null;
type RemoteTable = {
  upsert: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: RemoteError }>;
};

export interface PcbRemoteClient {
  from(table: "pcb_designer_projects" | "pcb_designer_templates" | "pcb_designer_library"): RemoteTable;
}

export async function syncPcbRemote(client: PcbRemoteClient, state: PcbSaveState): Promise<boolean> {
  try {
    const results = await Promise.all([
      client.from("pcb_designer_projects").upsert(state.projects.map((project) => ({ id: project.id, payload: project })), { onConflict: "id" }),
      client.from("pcb_designer_templates").upsert(state.templates.map((template) => ({ id: template.id, payload: template })), { onConflict: "id" }),
      client.from("pcb_designer_library").upsert(state.library.map((component) => ({ id: component.id, payload: component })), { onConflict: "id" }),
    ]);
    return results.every((result) => !result.error);
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

  schedule(state: PcbSaveState): void {
    const generation = ++this.generation;
    this.queue = this.queue.then(async () => {
      if (!this.active || generation !== this.generation) return;
      const saved = await this.sync(state);
      if (this.active && generation === this.generation) this.onStatus(saved ? "synced" : "local");
    });
  }

  dispose(): void {
    this.active = false;
    this.generation += 1;
  }

  flush(): Promise<void> {
    return this.queue;
  }
}
