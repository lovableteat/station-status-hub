// Background fetching of code the user is likely to open next, one workspace at a time while the browser is idle.
// A timer-driven preload once competed with the first render of the page on screen (see Index.tsx). This one waits for
// the page to settle, only downloads (the code runs when its page is opened), and stays off where the download could
// cost the user more than a later wait saves.

interface ConnectionInfo { saveData?: boolean; effectiveType?: string }

/**
 * False on 資料節省 mode and on 2G / 3G. A browser that does not say what the connection is (Safari, Firefox) is
 * allowed on a desktop and refused on a touch device, where it may well be a metered mobile connection.
 */
export function allowsBackgroundPreload(connection: ConnectionInfo | null | undefined, touchDevice = false) {
  if (!connection) return !touchDevice;
  return !connection.saveData && !/(^|-)[23]g$/.test(connection.effectiveType ?? "");
}

/**
 * Asks the page to download, not run, the code of one workspace (key as in scripts/bootPreloadPlugin.ts). The table of
 * files exists only in a built index.html; on the dev server this does nothing.
 */
export function requestCodePreload(key: string) {
  if (typeof window === "undefined") return;
  (window as Window & { __STATION_PRELOAD__?: (key: string) => void }).__STATION_PRELOAD__?.(key);
}

export interface IdleLoadOptions {
  /** How long after scheduling the first load may start: the page on screen renders and fetches first. */
  startDelayMs?: number;
  /** Pause between two loads, so the downloads of one workspace are mostly in before the next ones start. */
  gapMs?: number;
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Runs the loads in order, each in an idle period. A failed load is skipped (opening that page later loads it again and
 * shows its own recovery). Returns a cancel function; nothing starts after it is called.
 */
export function scheduleIdleLoads(loads: ReadonlyArray<() => Promise<unknown> | unknown>, { startDelayMs = 3000, gapMs = 1200 }: IdleLoadOptions = {}) {
  if (typeof window === "undefined" || loads.length === 0) return () => {};
  const connection = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  const touchDevice = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (!allowsBackgroundPreload(connection, touchDevice)) return () => {};
  const host = window as IdleWindow;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const step = (index: number) => {
    if (cancelled || index >= loads.length) return;
    const run = () => {
      idle = undefined;
      if (cancelled) return;
      Promise.resolve().then(loads[index]).catch(() => undefined).then(() => {
        if (!cancelled) timer = setTimeout(() => step(index + 1), gapMs);
      });
    };
    if (host.requestIdleCallback) idle = host.requestIdleCallback(run, { timeout: 5000 });
    else timer = setTimeout(run, 200);
  };
  timer = setTimeout(() => step(0), startDelayMs);
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined) host.cancelIdleCallback?.(idle);
  };
}
