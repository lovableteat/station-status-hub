// In-memory only: never persist appraisal text or attachments to browser storage.
const drafts = new Map();
export function readAssessmentDraft(key, source) {
  const draft = drafts.get(key);
  if (draft?.source === source) return draft.value;
  drafts.delete(key);
  return undefined;
}
export function keepAssessmentDraft(key, source, value) {
  drafts.set(key, { source, value });
}
export function forgetAssessmentDraft(key) {
  drafts.delete(key);
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', event => {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
