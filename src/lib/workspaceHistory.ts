const INDEX = "workspaceHistoryIndex";
const COMMIT = "workspace-history-commit";
// Window-target popstate listeners can run in registration order even when a
// later listener uses capture. Install this dispatcher at module evaluation,
// before React/HashRouter/editor listeners (main.tsx imports this module first).
// Keep it installed across watcher cleanup/remounts so it never loses priority.
let activePopstate: ((event: Event) => void) | null = null;
let replaying = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", event => {
    if (!replaying) activePopstate?.(event);
  }, true);
}
// Native hash / third-party entries have no reliable workspace cursor. Once
// encountered, do not infer history.go distances across that unknown entry.
let contiguousHistory = true;
export const WORKSPACE_HISTORY_NAVIGATED = "workspace-history-navigated";
function index(): number { return window.history.state?.[INDEX] ?? 0; }
function state(position: number) { return { ...window.history.state, [INDEX]: position }; }
export function replaceWorkspaceHistory(url: string | URL) {
  window.history.replaceState(state(index()), "", url);
  window.dispatchEvent(new Event(COMMIT));
  return index();
}
export function pushWorkspaceHistory(url: string | URL) {
  window.history.pushState(state(index() + 1), "", url);
  window.dispatchEvent(new Event(COMMIT));
  return index();
}
/** Restore the cursor after cancellation, retaining both destination and current entries. */
export function watchWorkspaceHistory(
  onNavigate: () => void,
  prepareNavigate?: (destination: URL) => Promise<unknown>,
  onLoadError?: (retry: () => void) => void,
  onNavigationStart?: () => void,
) {
  if (window.history.state?.[INDEX] === undefined) window.history.replaceState(state(0), "");
  let accepted = index();
  let acceptedUrl = window.location.href;
  let acceptedState = window.history.state;
  let restoring: number | null = null;
  let restored: (() => void) | null = null;
  let resuming: { destination: number; commit: () => void } | null = null;
  let sequence = 0;
  let obsoleteTraversals = 0;
  const invalidate = () => {
    sequence += 1;
    // history.go cannot be canceled after scheduling. Ignore its next event,
    // then return to the newest committed cursor instead of accepting stale UI.
    if (restoring !== null || resuming !== null) obsoleteTraversals += 1;
    restoring = null;
    resuming = null;
    const settle = restored;
    restored = null;
    settle?.();
    return sequence;
  };
  const rememberAccepted = () => {
    accepted = index();
    acceptedUrl = window.location.href;
    acceptedState = window.history.state;
  };
  const committed = () => { invalidate(); rememberAccepted(); };
  const popped = (event: Event) => {
    if (replaying) return;
    const marker = window.history.state?.[INDEX];
    if (!Number.isSafeInteger(marker)) contiguousHistory = false;
    if (!contiguousHistory) {
      if (obsoleteTraversals > 0) {
        obsoleteTraversals -= 1;
        event.stopImmediatePropagation();
        window.history.replaceState(acceptedState, "", acceptedUrl);
        return;
      }
      invalidate();
      onNavigationStart?.();
      const targetUrl = new URL(window.location.href);
      const previousUrl = new URL(acceptedUrl);
      if (targetUrl.origin === previousUrl.origin && targetUrl.pathname === previousUrl.pathname && targetUrl.search === previousUrl.search) {
        // HashRouter owns native hash routing and its own preload/dirty guard.
        // No project/workspace query changed, so do not intercept that event.
        // Do not accept the new hash here: PreparedRoutes may still veto it.
        // Successful routing remounts this watcher with the accepted location.
        return;
      }
      event.stopImmediatePropagation();
      // An unknown cursor cannot safely be traversed back by a guessed delta.
      // Keep the mounted editor's URL/context and retain the requested target
      // for an explicit retry. This normalizes the unknown entry, not its data;
      // its original third-party history contents cannot be reconstructed.
      // Normal contiguous workspace entries still retain Back/Forward entries.
      window.history.replaceState(acceptedState, "", acceptedUrl);
      const retry = () => {
        const request = invalidate();
        Promise.resolve().then(() => prepareNavigate?.(targetUrl)).then(() => {
          if (request !== sequence) return;
          if (!window.dispatchEvent(new Event("workspace-before-navigate", { cancelable: true }))) return;
          if (request !== sequence) return;
          pushWorkspaceHistory(targetUrl);
          onNavigate();
          window.dispatchEvent(new Event(WORKSPACE_HISTORY_NAVIGATED));
          const acceptedEvent = new Event("popstate");
          Object.defineProperty(acceptedEvent, "state", { value: window.history.state });
          replaying = true;
          try { window.dispatchEvent(acceptedEvent); } finally { replaying = false; }
        }, () => { if (request === sequence) onLoadError?.(retry); });
      };
      onLoadError?.(retry);
      return;
    }
    // The early dispatcher runs before Router/editor listeners. They must not accept a URL
    // whose module has not loaded. Replay once only after successful prepare.
    if (prepareNavigate) event.stopImmediatePropagation();
    const destination = index();
    if (obsoleteTraversals > 0) {
      obsoleteTraversals -= 1;
      const delta = accepted - destination;
      if (delta) { restoring = accepted; window.history.go(delta); }
      return;
    }
    if (restoring !== null && destination === restoring) {
      restoring = null;
      restored?.();
      restored = null;
      return;
    }
    if (resuming && destination === resuming.destination) {
      const resume = resuming;
      resuming = null;
      resume.commit();
      return;
    }
    const request = invalidate();
    onNavigationStart?.();
    const commit = () => {
      if (request !== sequence) return;
      // The current editor stays interactive during prepare. Check its latest
      // dirty state only now, immediately before unmounting, rather than asking
      // twice or relying on approval from before the user made more changes.
      if (!window.dispatchEvent(new Event("workspace-before-navigate", { cancelable: true }))) {
        const delta = accepted - index();
        if (delta) { restoring = accepted; window.history.go(delta); }
        return;
      }
      if (request !== sequence) return;
      rememberAccepted();
      onNavigate();
      window.dispatchEvent(new Event(WORKSPACE_HISTORY_NAVIGATED));
      if (prepareNavigate) {
        const acceptedEvent = new Event("popstate");
        Object.defineProperty(acceptedEvent, "state", { value: window.history.state });
        replaying = true;
        try { window.dispatchEvent(acceptedEvent); } finally { replaying = false; }
      }
    };
    if (!prepareNavigate) { commit(); return; }
    // The browser has already changed location before popstate. Capture the
    // intended URL, then put the cursor back while loading so existing editor
    // callbacks and background work keep seeing their current URL/project.
    const targetUrl = new URL(window.location.href);
    const delta = accepted - destination;
    const restoration = delta ? new Promise<void>(resolve => {
      restored = resolve;
      restoring = accepted;
      window.history.go(delta);
    }) : Promise.resolve();
    Promise.all([restoration, Promise.resolve().then(() => prepareNavigate(targetUrl))]).then(() => {
      if (request !== sequence) return;
      if (!delta) { commit(); return; }
      resuming = { destination, commit };
      window.history.go(-delta);
    }, () => {
      void restoration.then(() => {
        if (request !== sequence) return;
        onLoadError?.(() => {
          if (index() === accepted && delta) window.history.go(-delta);
        });
      });
    });
  };
  window.addEventListener(COMMIT, committed);
  activePopstate = popped;
  return () => {
    sequence += 1;
    window.removeEventListener(COMMIT, committed);
    if (activePopstate === popped) activePopstate = null;
  };
}
