// Keep unsent content for this browser tab so switching sections or reloading
// does not destroy a long self-assessment. It is never sent anywhere and is
// removed as soon as the cloud submission is confirmed.
const drafts = new Map();
const scheduledWrites = new Map();
const STORAGE_PREFIX = "station-status-hub:performance-draft:v2:";

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStored(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.version === 2 && parsed.value ? parsed : null;
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
function persistDraft(key) {
  const draft = drafts.get(key);
  if (!draft || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(draft));
  } catch {
    // Large inline attachments may exceed browser quota; the in-memory copy
    // still protects the form while the current tab remains open.
  }
}

function cancelScheduledWrite(key) {
  const scheduled = scheduledWrites.get(key);
  if (!scheduled) return;
  if (scheduled.kind === "idle") window.cancelIdleCallback?.(scheduled.id);
  else clearTimeout(scheduled.id);
  scheduledWrites.delete(key);
}

export function keepAssessmentDraft(key, source, value, { defer = false } = {}) {
  const draft = { version: 2, source, value };
  drafts.set(key, draft);
  cancelScheduledWrite(key);
  if (!defer || typeof window === "undefined") {
    persistDraft(key);
    return;
  }
  const write = () => {
    scheduledWrites.delete(key);
    persistDraft(key);
  };
  // Debounce first so normal typing does not serialize a multi-megabyte form
  // after every keystroke. Once typing pauses, use idle time when supported.
  const timeout = setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      scheduledWrites.set(key, {
        kind: "idle",
        id: window.requestIdleCallback(write, { timeout: 900 }),
      });
    } else {
      write();
    }
  }, 350);
  scheduledWrites.set(key, { kind: "timeout", id: timeout });
}

export function cancelAssessmentDraftWrite(key) {
  cancelScheduledWrite(key);
}
export function forgetAssessmentDraft(key) {
  cancelScheduledWrite(key);
  drafts.delete(key);
  try { window.sessionStorage.removeItem(storageKey(key)); } catch { /* best effort */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', event => {
    if (!drafts.size) return;
    // If the user actually leaves while an idle write is pending, persist the
    // latest in-memory value before this browsing context is destroyed.
    for (const key of drafts.keys()) persistDraft(key);
    event.preventDefault();
    event.returnValue = '';
  });
}
