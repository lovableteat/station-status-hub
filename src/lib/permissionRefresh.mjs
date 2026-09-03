// Realtime can miss an update while a tab is suspended or reconnecting.
// Always recover from the database, never from a cached permission snapshot.
export function watchPermissionRefresh({
  windowTarget,
  documentTarget,
  refresh,
  intervalMs = 30_000,
}) {
  const refreshWhenVisible = () => {
    if (documentTarget.visibilityState === "visible") refresh();
  };
  windowTarget.addEventListener("focus", refreshWhenVisible);
  windowTarget.addEventListener("online", refreshWhenVisible);
  documentTarget.addEventListener("visibilitychange", refreshWhenVisible);
  const timer = windowTarget.setInterval(refreshWhenVisible, intervalMs);

  return () => {
    windowTarget.removeEventListener("focus", refreshWhenVisible);
    windowTarget.removeEventListener("online", refreshWhenVisible);
    documentTarget.removeEventListener("visibilitychange", refreshWhenVisible);
    windowTarget.clearInterval(timer);
  };
}
