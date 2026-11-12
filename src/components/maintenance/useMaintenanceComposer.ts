import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { clearDocumentDraft, documentDraftScope, isDocumentDraftScopeCurrent, readDocumentDraft, subscribeDocumentDraft, writeDocumentDraft } from '@/lib/documentDrafts';
import { supabase } from '@/integrations/supabase/client';
import { createMaintenanceComposerDraft, reconcileMaintenanceComposer, sendMaintenanceComposer, type ComposerFile, type MaintenanceComposerDraft } from './maintenanceComposerDraft';

export function useMaintenanceComposer(actorId: string | undefined, projectId: string, issueId: string, canEdit: boolean) {
  const scope = useMemo(() => documentDraftScope(actorId, 'maintenance-note', JSON.stringify([projectId, issueId]), 'maintenance-composer'), [actorId, projectId, issueId]);
  const entry = useSyncExternalStore(subscribeDocumentDraft, () => readDocumentDraft<MaintenanceComposerDraft>(scope), () => null);
  const empty = useMemo(createMaintenanceComposerDraft, [scope, entry?.value.id]);
  const draft = entry?.value ?? empty;
  const mounted = useRef(false), access = useRef(canEdit), activeScope = useRef(scope);
  access.current = canEdit; activeScope.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const allowed = () => mounted.current && access.current && activeScope.current === scope && isDocumentDraftScopeCurrent(scope);
  const update = (patch: Partial<MaintenanceComposerDraft>) => {
    const latest = readDocumentDraft<MaintenanceComposerDraft>(scope)?.value ?? empty;
    if (!allowed() || latest.phase !== 'idle' || latest.attemptLocked || ('text' in patch && latest.savedNote)) return;
    const next = { ...latest, ...patch };
    // Removing the last failed attachment explicitly finishes a confirmed file-only note.
    // This clears RAM only; never delete its server note/object or resolve an unknown attempt.
    const finishedFileOnlyReceipt = 'files' in patch && latest.files.length > 0 && !next.files.length
      && latest.savedNote && !latest.hasUncertainAttempt && !latest.text.trim();
    if ((!next.text.length && !next.files.length && !next.savedNote) || finishedFileOnlyReceipt) {
      const current = readDocumentDraft(scope); if (current) clearDocumentDraft(scope, current.generation);
    } else writeDocumentDraft(scope, next);
  };
  const send = async () => {
    if (!allowed() || (!draft.text.trim() && !draft.files.length)) return false;
    if (!readDocumentDraft(scope)) writeDocumentDraft(scope, draft);
    return sendMaintenanceComposer(scope, allowed, {
      addNote: async (messageId, text) => {
        const result = await supabase.rpc('maintenance_add_note', { p_issue_id: issueId, p_message_id: messageId, p_body: text });
        if (result.error) throw result.error;
      },
      uploadFile: async (messageId, item) => {
        const result = await supabase.storage.from('issue-attachments').upload(`${issueId}/${messageId}/${item.id}`, item.file, { upsert: true, contentType: item.file.type || 'application/octet-stream' });
        if (result.error) throw result.error;
      },
      attachFile: async (messageId, item) => {
        const result = await supabase.rpc('maintenance_add_attachment', { p_issue_id: issueId, p_message_id: messageId, p_file: {
          id: item.id, file_path: `${issueId}/${messageId}/${item.id}`, file_name: item.file.name, file_size: item.file.size, file_type: item.file.type,
        } });
        if (result.error) throw result.error;
      },
    });
  };
  return { draft, setText: (text: string) => update({ text }), setFiles: (change: (files: ComposerFile[]) => ComposerFile[]) => {
      const latest = readDocumentDraft<MaintenanceComposerDraft>(scope)?.value ?? empty;
      update({ files: change(latest.files) });
    }, send,
    reconcile: () => reconcileMaintenanceComposer(scope, issueId, allowed, async () => {
      const result = await supabase.rpc('maintenance_thread', { p_issue_id: issueId });
      if (result.error) throw result.error; return result.data;
    }),
    isCurrent: allowed, blocked: !isDocumentDraftScopeCurrent(scope) || draft.phase !== 'idle' };
}
