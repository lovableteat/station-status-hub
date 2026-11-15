import { usePcbRemoteAccess } from "./usePcbRemoteAccess.ts";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PcbProjectLock,
  PcbProjectLockResult,
  PcbRemoteClient,
} from "../core/remoteSync.ts";

export type PcbProjectLockStatus = "local" | "acquiring" | "editing" | "viewing" | "error";

const EMPTY_RESULT: PcbProjectLockResult = {
  available: true,
  acquired: false,
  lock: null,
};

// A late release must finish before the same client's next acquire, including remounts.
const lockQueues = new WeakMap<PcbRemoteClient, Promise<void>>();
function enqueueLockOperation(client: PcbRemoteClient, operation: () => Promise<void>) {
  const queued = (lockQueues.get(client) ?? Promise.resolve()).then(operation, operation);
  lockQueues.set(client, queued.catch(() => undefined));
  return queued;
}

export function usePcbProjectLock({
  client,
  clientId,
  permissionCanEdit,
  projectId,
  projectName,
  enabled = true,
}: {
  client: PcbRemoteClient | null;
  clientId: string;
  permissionCanEdit: boolean;
  projectId: string;
  projectName: string;
  enabled?: boolean;
}) {
  const access = usePcbRemoteAccess(client);
  const accessBlocked = access.status === "denied" || access.status === "session-required";
  const scopeRef = useRef<{ client: PcbRemoteClient | null; projectId: string; clientId: string; accessGeneration: number } | null>(null);
  const projectNameRef = useRef(projectName);
  projectNameRef.current = projectName;
  const [result, setResult] = useState<PcbProjectLockResult>(EMPTY_RESULT);
  const [status, setStatus] = useState<PcbProjectLockStatus>(client ? "acquiring" : "local");
  const generationRef = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let disposed = false;
    let running = false;
    let acquiredThisProject = false;
    scopeRef.current = { client, projectId, clientId, accessGeneration: access.generation };

    if (!enabled) {
      setResult(EMPTY_RESULT);
      setStatus("error");
      refreshRef.current = async () => undefined;
      return;
    }

    if (!client || !projectId) {
      setResult({ available: false, acquired: permissionCanEdit, lock: null });
      setStatus("local");
      refreshRef.current = async () => undefined;
      return () => {
        disposed = true;
      };
    }

    if (accessBlocked) {
      setResult(EMPTY_RESULT);
      setStatus("error");
      refreshRef.current = async () => undefined;
      return;
    }

    const refresh = async () => {
      if (disposed || running) return;
      running = true;
      await enqueueLockOperation(client, async () => {
        try {
          if (disposed) return;
          const next = permissionCanEdit && client.acquireProjectLock
            ? await client.acquireProjectLock({ projectId, projectName: projectNameRef.current })
            : client.loadProjectLock
              ? await client.loadProjectLock(projectId)
              : { available: false, acquired: permissionCanEdit, lock: null };
          acquiredThisProject = next.acquired;
          if (disposed || generation !== generationRef.current) return;
          setResult(next);
          setStatus(next.acquired ? "editing" : "viewing");
        } catch {
          if (disposed || generation !== generationRef.current) return;
          setResult(EMPTY_RESULT);
          setStatus("error");
        } finally {
          running = false;
        }
      });
    };

    // A project switch must revoke the previous lease locally before the new
    // project lock resolves, otherwise one render can inherit stale edit access.
    setResult(EMPTY_RESULT);
    setStatus("acquiring");
    refreshRef.current = refresh;
    void refresh();
    const heartbeat = window.setInterval(() => void refresh(), 8_000);

    const release = () => {
      if (!client.releaseProjectLock) return;
      void enqueueLockOperation(client, async () => {
        // Session revalidation must not release a lease owned by its replacement session.
        if (!acquiredThisProject || (client.getAccessSnapshot
          && client.getAccessSnapshot().generation !== access.generation)) return;
        await client.releaseProjectLock!(projectId);
        acquiredThisProject = false;
      }).catch(() => undefined);
    };
    window.addEventListener("beforeunload", release);

    return () => {
      disposed = true;
      generationRef.current += 1;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", release);
      refreshRef.current = async () => undefined;
      release();
    };
  }, [client, clientId, permissionCanEdit, projectId, access.generation, accessBlocked, enabled]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const sameProject = scopeRef.current?.client === client
    && scopeRef.current?.projectId === projectId && scopeRef.current?.clientId === clientId
    && scopeRef.current?.accessGeneration === access.generation;
  const canEdit = enabled && permissionCanEdit && access.status === "ready"
    && (!client || (sameProject && (!result.available || result.acquired)));
  const lock: PcbProjectLock | null = result.lock;

  return {
    canEdit,
    cloudLockAvailable: result.available,
    editorName: lock?.editorDisplayName || lock?.editorUsername || null,
    lock,
    refresh,
    status,
  };
}
