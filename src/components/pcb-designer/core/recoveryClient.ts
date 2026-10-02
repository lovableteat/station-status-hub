const clients = new WeakMap<object, string>();
/** A recovery identity survives SPA remounts and reloads, separate from cloud locks. */
export function pcbRecoveryClient(): string {
  if (typeof window === "undefined") return "server";
  const cached = clients.get(window);
  if (cached) return cached;
  let id: string | null = null;
  try {
    const navigation = window.performance?.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    // window.open can copy sessionStorage; a newly navigated document gets its own identity.
    if (navigation?.type !== "navigate") id = window.sessionStorage.getItem("pcb-recovery-client");
  } catch { /* Restricted storage. */ }
  id ||= `pcb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  clients.set(window, id);
  try { window.sessionStorage.setItem("pcb-recovery-client", id); } catch { /* Keep this document's identity. */ }
  return id;
}
