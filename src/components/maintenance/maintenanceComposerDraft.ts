import { clearDocumentDraft, isDocumentDraftScopeCurrent, readDocumentDraft, writeDocumentDraft, type DocumentDraftScope } from '@/lib/documentDrafts';
export interface ComposerFile { id: string; file: File; error?: string }
export interface MaintenanceComposerDraft {
  id: string; text: string; messageId: string; savedNote: boolean; attemptLocked: boolean; hasUncertainAttempt: boolean; files: ComposerFile[];
  phase: 'idle' | 'sending' | 'checking' | 'uncertain'; operation: string | null; error: string;
}
export function createMaintenanceComposerDraft(): MaintenanceComposerDraft {
  return { id: crypto.randomUUID(), text: '', messageId: crypto.randomUUID(), savedNote: false, attemptLocked: false, hasUncertainAttempt: false, files: [], phase: 'idle', operation: null, error: '' };
}
/** Receipt updates may outlive the view, but never its actor epoch or draft identity. */
export function updateComposerReceipt(scope: DocumentDraftScope | null, draftId: string, operation: string, update: (draft: MaintenanceComposerDraft) => MaintenanceComposerDraft): boolean {
  if (!isDocumentDraftScopeCurrent(scope)) return false;
  const current = readDocumentDraft<MaintenanceComposerDraft>(scope);
  if (!current || current.value.id !== draftId || current.value.operation !== operation) return false;
  writeDocumentDraft(scope, update(current.value)); return true;
}
export function clearSentComposer(scope: DocumentDraftScope | null, draftId: string, operation: string): boolean {
  const current = readDocumentDraft<MaintenanceComposerDraft>(scope);
  return Boolean(current && current.value.id === draftId && current.value.operation === operation && clearDocumentDraft(scope, current.generation));
}
export interface ComposerTransport {
  addNote: (messageId: string, text: string) => Promise<void>;
  uploadFile: (messageId: string, item: ComposerFile) => Promise<void>;
  attachFile: (messageId: string, item: ComposerFile) => Promise<void>;
}
export async function sendMaintenanceComposer(scope: DocumentDraftScope | null, canContinue: () => boolean, transport: ComposerTransport): Promise<boolean> {
  const current = readDocumentDraft<MaintenanceComposerDraft>(scope);
  if (!current || current.value.phase !== 'idle' || !canContinue() || !isDocumentDraftScopeCurrent(scope)) return false;
  const original = current.value;
  if (!original.text.trim() && !original.files.length) return false;
  const operation = crypto.randomUUID();
  writeDocumentDraft(scope, { ...original, phase: 'sending', attemptLocked: true, operation, error: '' });
  const receipt = (patch: Partial<MaintenanceComposerDraft>) => updateComposerReceipt(scope, original.id, operation, draft => ({ ...draft, ...patch }));
  const allowed = () => canContinue() && isDocumentDraftScopeCurrent(scope)
    && readDocumentDraft<MaintenanceComposerDraft>(scope)?.value.operation === operation;
  const pause = () => { receipt({ phase: 'idle', attemptLocked: original.hasUncertainAttempt, operation: null, error: '送出已暫停，已完成部分保留；恢復權限後可手動繼續。' }); return false; };
  try {
    if (!original.savedNote) {
      await transport.addNote(original.messageId, original.text);
      if (!receipt({ savedNote: true })) return false;
    }
    if (!allowed()) return pause();
    for (const item of original.files) {
      if (!allowed()) return pause();
      await transport.uploadFile(original.messageId, item);
      if (!allowed()) return pause();
      await transport.attachFile(original.messageId, item);
      if (!updateComposerReceipt(scope, original.id, operation, draft => ({ ...draft, files: draft.files.filter(file => file.id !== item.id) }))) return false;
    }
    return clearSentComposer(scope, original.id, operation);
  } catch (cause) {
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
    const status = cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : 0;
    const validation = code === '22023';
    const rejected = validation || ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) || status === 401 || status === 403;
    receipt({ phase: rejected ? 'idle' : 'uncertain', attemptLocked: original.hasUncertainAttempt || !rejected, hasUncertainAttempt: original.hasUncertainAttempt || !rejected, operation: null, error: rejected
      ? validation ? `送出未完成（${code}），內容已保留；請核對並修正輸入後重試。` : '送出遭拒，未完成的紀錄與附件已保留。請恢復權限後重試。'
      : '送出結果尚待確認，紀錄與附件已保留；為避免重複送出，請先核對結果。' });
    return false;
  }
}

/** PostgreSQL trim(text) removes ASCII spaces only, including after a trailing newline. */
export function trimMaintenanceNote(text: string): string {
  let start = 0, end = text.length;
  while (start < end && text.charCodeAt(start) === 32) start++;
  while (end > start && text.charCodeAt(end - 1) === 32) end--;
  return text.slice(start, end);
}

/** Explicit read-only reconciliation. Never sends/uploads, and absence is not proof a request never ran. */
export async function reconcileMaintenanceComposer(scope: DocumentDraftScope | null, issueId: string, canContinue: () => boolean, readThread: () => Promise<unknown>): Promise<boolean> {
  const current = readDocumentDraft<MaintenanceComposerDraft>(scope);
  if (!scope || !current || current.value.phase !== 'uncertain' || !canContinue() || !isDocumentDraftScopeCurrent(scope)) return false;
  const original = current.value, operation = crypto.randomUUID();
  writeDocumentDraft(scope, { ...original, phase: 'checking', operation });
  const receipt = (patch: Partial<MaintenanceComposerDraft>) => updateComposerReceipt(scope, original.id, operation, draft => ({ ...draft, ...patch }));
  try {
    const data = await readThread();
    if (!canContinue() || !isDocumentDraftScopeCurrent(scope)) { receipt({ phase: 'uncertain', operation: null }); return false; }
    if (!data || typeof data !== 'object' || !('messages' in data) || !('attachments' in data)
      || !Array.isArray(data.messages) || !Array.isArray(data.attachments)) throw new Error('Invalid receipt');
    const notes = data.messages.filter(item => item?.id === original.messageId);
    if (notes.length > 1) throw new Error('Ambiguous note');
    const note = notes[0];
    if (note && (note.issue_id !== issueId || note.actor_id !== scope.actorId || note.kind !== 'note' || note.body !== trimMaintenanceNote(original.text))) throw new Error('Conflicting note');
    if (!note && original.savedNote) throw new Error('Previously confirmed note unavailable');
    const pending: ComposerFile[] = [];
    for (const file of original.files) {
      const matches = data.attachments.filter(item => item?.id === file.id);
      if (matches.length > 1) throw new Error('Ambiguous attachment');
      const item = matches[0];
      if (!item) { pending.push(file); continue; }
      if (!note || item.issue_id !== issueId || item.maintenance_message_id !== original.messageId
        || item.file_path !== `${issueId}/${original.messageId}/${file.id}` || item.file_name !== file.file.name
        || item.file_size !== file.file.size || item.file_type !== file.file.type) throw new Error('Conflicting attachment');
    }
    if (note && !pending.length) return clearSentComposer(scope, original.id, operation);
    // Same IDs and exact retained payload are safe under the existing idempotent SQL contract.
    // An absent row can still be in flight; only a later explicit user action may retry.
    return receipt({ savedNote: Boolean(note), files: pending, phase: 'idle', operation: null,
      error: '已核對目前紀錄，尚未確認完成的內容已保留。可手動重試，不會自動送出。' });
  } catch {
    receipt({ phase: 'uncertain', operation: null, error: '目前無法確認送出結果，或紀錄與草稿不一致；草稿與附件保留，請稍後再核對。' });
    return false;
  }
}
