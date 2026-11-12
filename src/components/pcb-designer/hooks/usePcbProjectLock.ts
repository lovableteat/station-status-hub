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
  const scopeRef = useRef<{ client: PcbRemoteClient | null; projectId: string; clientId: string } | null>(null);
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
    scopeRef.current = { client, projectId, clientId };

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
      try {
        const next = permissionCanEdit && client.acquireProjectLock
          ? await client.acquireProjectLock({ projectId, projectName })
          : client.loadProjectLock
            ? await client.loadProjectLock(projectId)
            : { available: false, acquired: permissionCanEdit, lock: null };
        if (disposed || generation !== generationRef.current) return;
        acquiredThisProject = next.acquired;
        setResult(next);
        setStatus(next.acquired ? "editing" : "viewing");
      } catch {
        if (disposed || generation !== generationRef.current) return;
        acquiredThisProject = false;
        setResult(EMPTY_RESULT);
        setStatus("error");
      } finally {
        running = false;
      }
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
      void client.releaseProjectLock(projectId).catch(() => undefined);
    };
    window.addEventListener("beforeunload", release);

    return () => {
      disposed = true;
      generationRef.current += 1;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", release);
      refreshRef.current = async () => undefined;
      // Session revalidation keeps the same client's lease. Releasing here can
      // race its replacement heartbeat and revoke a freshly renewed lease.
      if (acquiredThisProject && (!client.getAccessSnapshot
        || client.getAccessSnapshot().generation === access.generation)) release();
    };
  }, [client, clientId, permissionCanEdit, projectId, projectName, access.generation, accessBlocked, enabled]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const sameProject = scopeRef.current?.client === client
    && scopeRef.current?.projectId === projectId && scopeRef.current?.clientId === clientId;
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
