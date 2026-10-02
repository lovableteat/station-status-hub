import {useCallback, useEffect, useRef} from "react";

export interface WorkspaceMutationScope { accountId: string; generation: number }
export class WorkspaceMutationScopeChangedError extends Error {
  constructor() {super("帳號或編輯權限已變更，請重新確認後再儲存。");}
}

/** Prevent async work prepared under one permission/account epoch being written
 * with a replacement session. Server-side authorization remains required. */
export function useWorkspaceMutationScope(accountId: string | null, canEdit: boolean) {
  const scope = useRef({accountId, canEdit, generation: 0});
  const mounted = useRef(true);
  if (scope.current.accountId !== accountId || scope.current.canEdit !== canEdit) {
    scope.current = {accountId, canEdit, generation: scope.current.generation + 1};
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scope.current.generation += 1;
    };
  }, []);
  const isCurrent = useCallback((token: WorkspaceMutationScope) =>
    mounted.current && scope.current.canEdit && scope.current.accountId === token.accountId
      && scope.current.generation === token.generation, []);
  const capture = useCallback((): WorkspaceMutationScope => {
    if (!mounted.current || !accountId || accountId !== scope.current.accountId || !scope.current.canEdit) {
      throw new WorkspaceMutationScopeChangedError();
    }
    return {accountId, generation: scope.current.generation};
  }, [accountId]);
  const assertCurrent = useCallback((token: WorkspaceMutationScope) => {
    if (!isCurrent(token)) throw new WorkspaceMutationScopeChangedError();
  }, [isCurrent]);
  return {capture, isCurrent, assertCurrent};
}
