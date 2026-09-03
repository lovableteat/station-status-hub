import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { watchPermissionRefresh } from "@/lib/permissionRefresh.mjs";

export interface PerformanceLock {
  owner_id: string;
  owner_name: string;
  unlocked: boolean;
  expires_at: string | null;
}
export const privacyDb = supabase as unknown as {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function usePerformancePrivacy(
  enabled: boolean,
  accountId: string,
  invalidate: () => void,
) {
  const [locks, setLocks] = useState<PerformanceLock[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(!enabled);
  const signature = useRef("");
  const generation = useRef(0);
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;
  const refresh = useCallback(async () => {
    if (!enabled || !accountId) return;
    const request = ++generation.current;
    try {
      const result = await privacyDb.rpc("get_performance_group_locks");
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      const next = (result.data || []) as PerformanceLock[];
      const nextSignature = JSON.stringify(next);
      if (signature.current !== nextSignature) {
        signature.current = nextSignature;
        invalidateRef.current();
      }
      setLocks(next);
      setReady(true);
      setError("");
    } catch {
      if (request !== generation.current) return;
      signature.current = "";
      setLocks([]);
      setReady(false);
      setError(
        "暫時無法確認考核資料保護狀態，請重新整理。若持續發生，請聯絡系統維護人員。",
      );
      invalidateRef.current();
    }
  }, [enabled, accountId]);
  useEffect(() => {
    signature.current = "";
    setLocks([]);
    setReady(!enabled);
    if (!enabled) return;
    void refresh();
    const cleanup = watchPermissionRefresh({
      windowTarget: window,
      documentTarget: document,
      refresh: () => void refresh(),
    });
    return () => {
      // Invalidate every outstanding RPC, not merely the one started here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      cleanup();
    };
  }, [enabled, refresh]);
  useEffect(() => {
    const expiries = locks
      .filter((lock) => lock.unlocked && lock.expires_at)
      .map((lock) => Date.parse(lock.expires_at!));
    if (!expiries.length) return;
    const timer = setTimeout(
      () => {
        setReady(false);
        invalidateRef.current();
        void refresh();
      },
      Math.max(0, Math.min(...expiries) - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [locks, refresh]);
  const clear = () => {
    ++generation.current;
    signature.current = "";
    setReady(false);
    invalidateRef.current();
  };
  return { locks, error, ready: !enabled || ready, refresh, clear };
}

export type PerformancePrivacy = ReturnType<typeof usePerformancePrivacy>;
