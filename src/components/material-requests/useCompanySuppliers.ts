import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@/components/auth/UserContext';
import { useWorkspaceMutationScope } from '@/hooks/useWorkspaceMutationScope';
import { loadCompanySuppliers, applyCompanySuppliers } from './supplierDirectoryStorage';
import type { SupplierContact } from './supplierDirectory';
const changedEvent = 'company-suppliers-changed';
export function useCompanySuppliers(open: boolean) {
  const { user, sessionMode } = useUser();
  const accountId = sessionMode === 'authenticated' ? user?.userId ?? null : null;
  const canEdit = !!accountId && ['admin', 'super_admin'].includes(user?.role ?? '');
  const { capture: captureRead, isCurrent: isCurrentRead } = useWorkspaceMutationScope(accountId, !!accountId);
  const writeScope = useWorkspaceMutationScope(accountId, canEdit);
  const [state, setState] = useState<{ account: string | null; contacts: SupplierContact[]; loading: boolean; error: string | null }>({ account: null, contacts: [], loading: false, error: null });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0), saving = useRef(false);
  const reload = useCallback(async () => {
    if (!accountId) return;
    const token = captureRead(), request = ++generation.current;
    setState(s => ({ account: accountId, contacts: s.account === accountId ? s.contacts : [], loading: true, error: null }));
    try {
      const contacts = await loadCompanySuppliers();
      if (isCurrentRead(token) && request === generation.current) setState({ account: accountId, contacts, loading: false, error: null });
    } catch (error) {
      if (isCurrentRead(token) && request === generation.current) setState(s => ({ ...s, loading: false, error: error instanceof Error ? error.message : '讀取失敗' }));
      throw error;
    }
  }, [accountId, captureRead, isCurrentRead]);
  useEffect(() => {
    if (!open || !accountId) return;
    const readGeneration = generation;
    const refresh = () => { void reload().catch(() => {}); };
    refresh();
    window.addEventListener(changedEvent, refresh);
    window.addEventListener('focus', refresh);
    return () => { readGeneration.current++; window.removeEventListener(changedEvent, refresh); window.removeEventListener('focus', refresh); };
  }, [open, accountId, reload]);
  const save = async (contacts: SupplierContact[]) => {
    const token = writeScope.capture();
    if (saving.current) throw new Error('正在儲存，請稍候');
    saving.current = true; setBusy(true);
    try {
      await applyCompanySuppliers(token.accountId, contacts);
      writeScope.assertCurrent(token);
      window.dispatchEvent(new Event(changedEvent));
      try { await reload(); } catch { throw new Error('已儲存，但重新載入失敗。請按更新核對，勿直接重試新增'); }
    } finally { saving.current = false; setBusy(false); }
  };
  return { accountId, canEdit, contacts: state.account === accountId ? state.contacts : [], loading: !!accountId && (state.account !== accountId || state.loading), error: state.account === accountId ? state.error : null,
    busy, reload, save, capture: writeScope.capture, assertCurrent: writeScope.assertCurrent };
}
