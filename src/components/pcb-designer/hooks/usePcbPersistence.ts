import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PcbLocalRepository, type StorageLike } from "../core/storage.ts";
import type { PcbSaveState } from "../types.ts";

export type PcbPersistenceStatus = "local" | "saving" | "synced";

type RemoteError = { code?: string; message?: string } | null;
type RemoteTable = {
  upsert: (rows: unknown[], options: { onConflict: string }) => Promise<{ error: RemoteError }>;
};

export interface PcbRemoteClient {
  from(table: "pcb_designer_projects" | "pcb_designer_templates" | "pcb_designer_library"): RemoteTable;
}

export interface UsePcbPersistenceOptions {
  state: PcbSaveState;
  storage?: StorageLike;
  remoteClient?: PcbRemoteClient | null;
}

const localOnlyStorage: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
};

function browserStorage(): StorageLike {
  if (typeof window === "undefined") return localOnlyStorage;
  try {
    return window.localStorage;
  } catch {
    return localOnlyStorage;
  }
}

async function syncRemote(client: PcbRemoteClient, state: PcbSaveState): Promise<boolean> {
  const writes = [
    client.from("pcb_designer_projects").upsert(
      state.projects.map((project) => ({ id: project.id, payload: project })),
      { onConflict: "id" },
    ),
    client.from("pcb_designer_templates").upsert(
      state.templates.map((template) => ({ id: template.id, payload: template })),
      { onConflict: "id" },
    ),
    client.from("pcb_designer_library").upsert(
      state.library.map((component) => ({ id: component.id, payload: component })),
      { onConflict: "id" },
    ),
  ];

  try {
    const results = await Promise.all(writes);
    return results.every((result) => !result.error);
  } catch {
    return false;
  }
}

/** Persists editor state locally first; unavailable Supabase remains a non-fatal local draft. */
export function usePcbPersistence({ state, storage, remoteClient }: UsePcbPersistenceOptions): PcbPersistenceStatus {
  const repository = useMemo(() => new PcbLocalRepository(storage ?? browserStorage()), [storage]);
  const defaultClient = supabase as unknown as PcbRemoteClient;
  const client = remoteClient === undefined ? defaultClient : remoteClient;
  const stateRef = useRef(state);
  const repositoryRef = useRef(repository);
  const [status, setStatus] = useState<PcbPersistenceStatus>("local");

  stateRef.current = state;
  repositoryRef.current = repository;

  useEffect(() => {
    const persistBeforeUnload = () => {
      repositoryRef.current.save(stateRef.current);
    };
    window.addEventListener("beforeunload", persistBeforeUnload);
    return () => window.removeEventListener("beforeunload", persistBeforeUnload);
  }, []);

  useEffect(() => {
    setStatus("saving");
    const localTimer = window.setTimeout(() => {
      repository.save(state);
      setStatus("local");
    }, 300);
    const remoteTimer = window.setTimeout(async () => {
      if (!client) return;
      const saved = await syncRemote(client, state);
      setStatus(saved ? "synced" : "local");
    }, 900);

    return () => {
      window.clearTimeout(localTimer);
      window.clearTimeout(remoteTimer);
    };
  }, [client, repository, state]);

  return status;
}
