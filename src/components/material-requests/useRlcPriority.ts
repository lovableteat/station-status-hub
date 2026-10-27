import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/auth/UserContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkspaceMutationScope, type WorkspaceMutationScope } from "@/hooks/useWorkspaceMutationScope";
import type { RlcPriorityRule } from "./rlcPriority";
import { loadRlcPriorityRules, saveRlcPriorityRule } from "./rlcPriorityStorage";

type State = { accountId: string | null; projectId: string | null; rules: RlcPriorityRule[]; loading: boolean; saving: boolean; error: string | null };
type Scope = WorkspaceMutationScope & { projectId: string; projectGeneration: number };
const empty = (accountId: string | null, projectId: string | null): State => ({ accountId, projectId, rules: [], loading: false, saving: false, error: null });
const message = (error: unknown) => error instanceof Error ? error.message : "RLC 規則操作失敗，請重新載入。";
const changedEvent = "rlc-priority-rules-changed";

/** Both the authenticated actor and the BOM's assigned project are captured before each asynchronous operation. */
export function useRlcPriority(projectId: string | null, userId: string | null | undefined, enabled: boolean) {
  const { user, sessionMode } = useUser();
  const { canViewModule, canEditModule } = usePermissions();
  const accountId = sessionMode === "authenticated" && user?.userId === userId ? userId : null;
  const canRead = !!accountId && !!projectId && enabled && canViewModule("material-requests");
  const canWrite = canRead && canEditModule("material-requests");
  const { capture: captureRead, isCurrent: currentRead } = useWorkspaceMutationScope(accountId, canRead);
  const { capture: captureWrite, isCurrent: currentWrite } = useWorkspaceMutationScope(accountId, canWrite);
  const context = useRef({ projectId, enabled, generation: 0 });
  if (context.current.projectId !== projectId || context.current.enabled !== enabled) context.current = { projectId, enabled, generation: context.current.generation + 1 };
  const [state, setState] = useState<State>(() => empty(null, null));
  const readGeneration = useRef(0);
  const mutation = useRef<Scope | null>(null);
  const sameProject = useCallback((scope: Scope) => context.current.enabled && context.current.projectId === scope.projectId && context.current.generation === scope.projectGeneration, []);
  const isCurrentRead = useCallback((scope: Scope) => sameProject(scope) && currentRead(scope), [sameProject, currentRead]);
  const isCurrentWrite = useCallback((scope: Scope) => sameProject(scope) && currentWrite(scope), [sameProject, currentWrite]);

  const reload = useCallback(async () => {
    if (!canRead || !projectId) return;
    const scope: Scope = { ...captureRead(), projectId, projectGeneration: context.current.generation };
    const request = ++readGeneration.current;
    setState(current => ({ ...(current.accountId === accountId && current.projectId === projectId ? current : empty(accountId, projectId)), loading: true, error: null }));
    try {
      const rules = await loadRlcPriorityRules(projectId);
      if (isCurrentRead(scope) && request === readGeneration.current) setState(current => ({ ...current, accountId, projectId, rules, loading: false, error: null }));
    } catch (error) {
      if (isCurrentRead(scope) && request === readGeneration.current) setState(current => ({ ...current, loading: false, error: message(error) }));
      throw error;
    }
  }, [accountId, canRead, projectId, captureRead, isCurrentRead]);

  useEffect(() => {
    if (!canRead) return;
    const requests = readGeneration;
    const refresh = () => { void reload().catch(() => {}); };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(changedEvent, refresh);
    return () => { requests.current++; window.removeEventListener("focus", refresh); window.removeEventListener(changedEvent, refresh); };
  }, [canRead, reload]);

  const saveRule = useCallback(async (rule: RlcPriorityRule): Promise<void> => {
    const scope: Scope = { ...captureWrite(), projectId: projectId!, projectGeneration: context.current.generation };
    if (!projectId || rule.projectId !== projectId || !sameProject(scope)) throw new Error("規則與目前 BOM 的專案不同，請重新確認。");
    if (mutation.current && isCurrentWrite(mutation.current)) throw new Error("規則正在儲存，請稍候。");
    mutation.current = scope;
    readGeneration.current++;
    setState(current => ({ ...(current.accountId === accountId && current.projectId === projectId ? current : empty(accountId, projectId)), loading: false, saving: true, error: null }));
    try {
      const saved = await saveRlcPriorityRule(scope.accountId, rule);
      if (!isCurrentWrite(scope)) throw new Error("帳號、專案或編輯權限已變更，請重新載入確認。");
      readGeneration.current++;
      setState(current => ({ ...current, rules: [...current.rules.filter(item => item.specKey !== saved.specKey || item.candidateKey !== saved.candidateKey), saved], loading: false, error: null }));
      window.dispatchEvent(new Event(changedEvent));
    } catch (error) {
      if (isCurrentWrite(scope)) setState(current => ({ ...current, error: message(error) }));
      throw error;
    } finally {
      if (mutation.current === scope) mutation.current = null;
      if (isCurrentWrite(scope)) setState(current => ({ ...current, saving: false }));
    }
  }, [accountId, projectId, captureWrite, sameProject, isCurrentWrite]);

  const current = canRead && state.accountId === accountId && state.projectId === projectId ? state : empty(accountId, projectId);
  return { rules: current.rules, loading: canRead && (current.loading || state.accountId !== accountId || state.projectId !== projectId), saving: current.saving, error: current.error, saveRule, reload };
}
