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
}: {
  client: PcbRemoteClient | null;
  clientId: string;
  permissionCanEdit: boolean;
  projectId: string;
  projectName: string;
}) {
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

    if (!client || !projectId) {
      setResult({ available: false, acquired: permissionCanEdit, lock: null });
      setStatus("local");
      refreshRef.current = async () => undefined;
      return () => {
        disposed = true;
      };
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
      if (acquiredThisProject) release();
    };
  }, [client, clientId, permissionCanEdit, projectId, projectName]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const canEdit = permissionCanEdit
    && (!client || !result.available || result.acquired);
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
