// Keep unsent content for this browser tab so switching sections or reloading
// does not destroy a long self-assessment. It is never sent anywhere and is
// removed as soon as the cloud submission is confirmed.
const drafts = new Map();
const STORAGE_PREFIX = "station-status-hub:performance-draft:v2:";

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStored(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.version === 2 && parsed.form ? parsed : null;
  } catch {
    return null;
  }
}

export function readAssessmentDraft(key, source) {
  const draft = drafts.get(key) || readStored(key);
  if (draft?.source === source || (draft?.source === "new" && source !== "")) {
    drafts.set(key, draft);
    return draft.value;
  }
  drafts.delete(key);
  try { window.sessionStorage.removeItem(storageKey(key)); } catch { /* quota/private mode */ }
  return undefined;
}
export function keepAssessmentDraft(key, source, value) {
  const draft = { version: 2, source, value };
  drafts.set(key, draft);
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(draft));
  } catch {
    // Large inline attachments may exceed browser quota; the in-memory copy
    // still protects the form while the current tab remains open.
  }
}
export function forgetAssessmentDraft(key) {
  drafts.delete(key);
  try { window.sessionStorage.removeItem(storageKey(key)); } catch { /* best effort */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', event => {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
