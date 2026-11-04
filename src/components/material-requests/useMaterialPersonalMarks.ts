import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const emptyKeys = new Set<string>();
type MarkState = { generation: number; keys: Set<string>; pendingKeys: Set<string>; ready: boolean; error: string };

export function useMaterialPersonalMarks(accountId: string | undefined, workspaceId: string, enabled: boolean) {
  const scope = `${enabled ? accountId ?? "" : ""}:${workspaceId}`;
  const scopeRef = useRef({ key: scope, generation: 0 });
  const pending = useRef(new Set<string>());
  if (scopeRef.current.key !== scope) {
    scopeRef.current = { key: scope, generation: scopeRef.current.generation + 1 };
    pending.current = new Set();
  }
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<MarkState>({ generation: -1, keys: emptyKeys, pendingKeys: emptyKeys, ready: false, error: "" });
  const generation = scopeRef.current.generation;
  const current = state.generation === generation ? state : { keys: emptyKeys, pendingKeys: emptyKeys, ready: false, error: "" };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ generation, keys: new Set(), pendingKeys: new Set(), ready: false, error: "" });
    if (!accountId || !enabled) return () => { active = false; controller.abort(); };
    void (async () => {
      try {
        const keys = new Set<string>();
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.from("material_personal_marks").select("group_key")
            .eq("owner_id", accountId).eq("workspace_id", workspaceId).order("group_key")
            .range(offset, offset + 499).abortSignal(controller.signal);
          if (error) throw error;
          if (!active || generation !== scopeRef.current.generation) return;
          (data ?? []).forEach(row => keys.add(row.group_key));
          if ((data?.length ?? 0) < 500) break;
        }
        setState({ generation, keys, pendingKeys: new Set(), ready: true, error: "" });
      } catch {
        if (active && generation === scopeRef.current.generation) setState({ generation, keys: new Set(), pendingKeys: new Set(), ready: false, error: "個人標記載入失敗，請重試。" });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [accountId, enabled, generation, revision, workspaceId]);

  const toggle = useCallback(async (selection: string | string[]) => {
    const selectedKeys = [...new Set(typeof selection === "string" ? [selection] : selection)];
    if (!selectedKeys.length || !accountId || !enabled || !current.ready || generation !== scopeRef.current.generation || selectedKeys.some(key => pending.current.has(key))) return;
    const markedBefore = new Set(selectedKeys.filter(key => current.keys.has(key)));
    const wasMarked = selectedKeys.every(key => markedBefore.has(key));
    selectedKeys.forEach(key => pending.current.add(key));
    setState(previous => {
      const keys = new Set(previous.keys);
      selectedKeys.forEach(key => { if (wasMarked) keys.delete(key); else keys.add(key); });
      return { ...previous, keys, pendingKeys: new Set(pending.current), error: "" };
    });
    try {
      const table = supabase.from("material_personal_marks");
      const rows = selectedKeys.map(group_key => ({ owner_id: accountId, workspace_id: workspaceId, group_key }));
      const deletion = () => {
        const query = table.delete().eq("owner_id", accountId).eq("workspace_id", workspaceId);
        return selectedKeys.length === 1 ? query.eq("group_key", selectedKeys[0]) : query.in("group_key", selectedKeys);
      };
      const { error } = wasMarked ? await deletion() : await table.upsert(rows, { onConflict: "owner_id,workspace_id,group_hash", ignoreDuplicates: true });
      if (error) throw error;
    } catch {
      if (generation === scopeRef.current.generation) setState(previous => {
        const keys = new Set(previous.keys);
        selectedKeys.forEach(key => { if (markedBefore.has(key)) keys.add(key); else keys.delete(key); });
        return { ...previous, keys, error: "個人標記儲存失敗，已還原這次變更，請重試。" };
      });
    } finally {
      if (generation === scopeRef.current.generation) {
        selectedKeys.forEach(key => pending.current.delete(key));
        setState(previous => ({ ...previous, pendingKeys: new Set(pending.current) }));
      }
    }
  }, [accountId, current.keys, current.ready, enabled, generation, workspaceId]);

  return { ...current, toggle, reload: () => { if (!pending.current.size) setRevision(value => value + 1); } };
}
