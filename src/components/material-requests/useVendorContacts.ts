import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/auth/UserContext";
import { useWorkspaceMutationScope, type WorkspaceMutationScope } from "@/hooks/useWorkspaceMutationScope";
import type { VendorContact } from "./vendorContacts";
import { importVendorContacts, loadVendorContacts, saveVendorContact, type StoredVendorContact } from "./vendorContactsStorage";

type BookState = { ownerId: string | null; contacts: StoredVendorContact[]; loading: boolean; busy: boolean; error: string | null };
const emptyState = (ownerId: string | null): BookState => ({ ownerId, contacts: [], loading: false, busy: false, error: null });
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "聯絡簿操作失敗，請重試。";

export function useVendorContacts(open: boolean) {
  const { user, sessionMode } = useUser();
  const ownerId = sessionMode === "authenticated" ? user?.userId ?? null : null;
  const canEdit = ownerId !== null;
  const { capture, isCurrent, assertCurrent } = useWorkspaceMutationScope(ownerId, canEdit);
  const [state, setState] = useState<BookState>(() => emptyState(null));
  const readGeneration = useRef(0);
  const mutation = useRef<WorkspaceMutationScope | null>(null);

  const reload = useCallback(async () => {
    if (!open || !ownerId) return;
    const token = capture();
    const generation = ++readGeneration.current;
    setState((current) => !isCurrent(token) ? current : { ...(current.ownerId === ownerId ? current : emptyState(ownerId)), loading: true, error: null });
    try {
      const contacts = await loadVendorContacts(token.accountId);
      if (!isCurrent(token) || generation !== readGeneration.current) return;
      setState((current) => !isCurrent(token) || generation !== readGeneration.current ? current : { ...current, ownerId: token.accountId, contacts, loading: false, error: null });
    } catch (error) {
      if (!isCurrent(token) || generation !== readGeneration.current) return;
      setState((current) => !isCurrent(token) || generation !== readGeneration.current ? current : { ...current, loading: false, error: errorMessage(error) });
      throw error;
    }
  }, [capture, isCurrent, open, ownerId]);

  useEffect(() => {
    if (open && ownerId) void reload().catch(() => {});
    return () => { readGeneration.current += 1; };
  }, [open, ownerId, reload]);

  const beginMutation = useCallback(() => {
    const token = capture();
    if (mutation.current && isCurrent(mutation.current)) throw new Error("聯絡簿正在儲存，請稍候。");
    mutation.current = token;
    readGeneration.current += 1;
    setState((current) => !isCurrent(token) ? current : { ...(current.ownerId === token.accountId ? current : emptyState(token.accountId)), loading: false, busy: true, error: null });
    return token;
  }, [capture, isCurrent]);

  const finishMutation = useCallback((token: WorkspaceMutationScope) => {
    if (mutation.current === token) mutation.current = null;
    if (isCurrent(token)) setState((current) => !isCurrent(token) ? current : { ...current, busy: false });
  }, [isCurrent]);

  const save = useCallback(async (contact: VendorContact, expectedUpdatedAt?: string) => {
    const token = beginMutation();
    try {
      const saved = await saveVendorContact(token.accountId, contact, expectedUpdatedAt);
      assertCurrent(token);
      readGeneration.current += 1;
      setState((current) => !isCurrent(token) ? current : { ...current, contacts: current.contacts.some((row) => row.id === saved.id)
        ? current.contacts.map((row) => row.id === saved.id ? saved : row)
        : [...current.contacts, saved], loading: false, error: null });
      return saved;
    } catch (error) {
      if (isCurrent(token)) setState((current) => !isCurrent(token) ? current : { ...current, error: errorMessage(error) });
      throw error;
    } finally {
      finishMutation(token);
    }
  }, [assertCurrent, beginMutation, finishMutation, isCurrent]);

  const importContacts = useCallback(async (contacts: readonly VendorContact[]) => {
    const token = beginMutation();
    try {
      const result = await importVendorContacts(token.accountId, contacts);
      assertCurrent(token);
      const generation = ++readGeneration.current;
      try {
        const loaded = await loadVendorContacts(token.accountId);
        assertCurrent(token);
        if (generation === readGeneration.current) setState((current) => !isCurrent(token) || generation !== readGeneration.current ? current : { ...current, contacts: loaded, error: null });
      } catch (error) {
        assertCurrent(token);
        setState((current) => !isCurrent(token) ? current : { ...current, error: `已儲存 ${result.added} 筆聯絡人，但重新載入失敗。請按「更新」重試載入；既有聯絡人未被覆蓋。${errorMessage(error)}` });
      }
      return result;
    } catch (error) {
      if (isCurrent(token)) setState((current) => !isCurrent(token) ? current : { ...current, error: errorMessage(error) });
      throw error;
    } finally {
      finishMutation(token);
    }
  }, [assertCurrent, beginMutation, finishMutation, isCurrent]);

  const current = state.ownerId === ownerId ? state : emptyState(ownerId);
  return { ownerId, contacts: current.contacts, loading: current.loading || (open && canEdit && state.ownerId !== ownerId),
    busy: current.busy, error: current.error, canEdit, reload, save, importContacts, capture, assertCurrent };
}
