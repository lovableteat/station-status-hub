const INDEX = "workspaceHistoryIndex";
const COMMIT = "workspace-history-commit";
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
export function watchWorkspaceHistory(onNavigate: () => void) {
  if (window.history.state?.[INDEX] === undefined) window.history.replaceState(state(0), "");
  let accepted = index();
  let restoring: number | null = null;
  const committed = () => { accepted = index(); };
  const popped = () => {
    const destination = index();
    if (restoring !== null && destination === restoring) { restoring = null; return; }
    if (!window.dispatchEvent(new Event("workspace-before-navigate", { cancelable: true }))) {
      const delta = accepted - destination;
      if (delta) { restoring = accepted; window.history.go(delta); }
      return;
    }
    accepted = destination;
    onNavigate();
    window.dispatchEvent(new Event(WORKSPACE_HISTORY_NAVIGATED));
  };
  window.addEventListener(COMMIT, committed);
  window.addEventListener("popstate", popped);
  return () => { window.removeEventListener(COMMIT, committed); window.removeEventListener("popstate", popped); };
}
