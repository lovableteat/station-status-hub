const INDEX = "workspaceHistoryIndex";
const COMMIT = "workspace-history-commit";
function index(): number { return window.history.state?.[INDEX] ?? 0; }
function state(position: number) { return { ...window.history.state, [INDEX]: position }; }
export function replaceWorkspaceHistory(url: string | URL) {
  window.history.replaceState(state(index()), "", url);
  window.dispatchEvent(new Event(COMMIT));
}
export function pushWorkspaceHistory(url: string | URL) {
  window.history.pushState(state(index() + 1), "", url);
  window.dispatchEvent(new Event(COMMIT));
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
  };
  window.addEventListener(COMMIT, committed);
  window.addEventListener("popstate", popped);
  return () => { window.removeEventListener(COMMIT, committed); window.removeEventListener("popstate", popped); };
}
