const DEFAULT_AUTH_LOCK_WAIT_MS = 6_000;
const DEFAULT_AUTH_FETCH_TIMEOUT_MS = 8_000;

function lockTimeoutError(name, timeoutMs, cause) {
  const error = new Error(`Auth lock "${name}" was not acquired within ${timeoutMs} ms`);
  error.name = "AuthLockTimeoutError";
  // Supabase uses this flag to treat a zero-timeout auto-refresh miss as an
  // expected condition instead of surfacing an application error.
  error.isAcquireTimeout = true;
  if (cause !== undefined) error.cause = cause;
  return error;
}

export function createBoundedAuthLock({
  lockManager = globalThis.navigator?.locks ?? null,
  maxWaitMs = DEFAULT_AUTH_LOCK_WAIT_MS,
} = {}) {
  const boundedWaitMs = Math.max(1, maxWaitMs);

  return async function boundedAuthLock(name, acquireTimeout, operation) {
    if (!lockManager?.request) return operation();

    if (acquireTimeout === 0) {
      return lockManager.request(
        name,
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          if (!lock) throw lockTimeoutError(name, 0);
          return operation();
        },
      );
    }

    const waitMs =
      acquireTimeout < 0 ? boundedWaitMs : Math.min(acquireTimeout, boundedWaitMs);
    const controller = new AbortController();
    let acquired = false;
    const timeoutId = setTimeout(() => {
      controller.abort(lockTimeoutError(name, waitMs));
    }, waitMs);

    try {
      return await lockManager.request(
        name,
        { mode: "exclusive", signal: controller.signal },
        (lock) => {
          if (!lock) throw lockTimeoutError(name, waitMs);
          acquired = true;
          clearTimeout(timeoutId);
          return operation();
        },
      );
    } catch (error) {
      if (!acquired && controller.signal.aborted) {
        throw lockTimeoutError(name, waitMs, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

function isAuthApiRequest(input) {
  const rawUrl =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : typeof input?.url === "string"
        ? input.url
        : "";
  if (!rawUrl) return false;

  try {
    const pathname = new URL(rawUrl, "http://localhost").pathname;
    return pathname === "/auth/v1" || pathname.startsWith("/auth/v1/");
  } catch {
    return false;
  }
}

function authFetchTimeoutError(timeoutMs) {
  const error = new Error(`Supabase Auth request exceeded ${timeoutMs} ms`);
  error.name = "AuthFetchTimeoutError";
  return error;
}

export function createBoundedAuthFetch({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_AUTH_FETCH_TIMEOUT_MS,
} = {}) {
  const boundedTimeoutMs = Math.max(1, timeoutMs);

  return async function boundedAuthFetch(input, init) {
    if (!isAuthApiRequest(input)) return fetchImpl(input, init);

    const controller = new AbortController();
    const inputSignal =
      init?.signal ?? (typeof input === "object" && input !== null ? input.signal : undefined);
    const relayAbort = () => controller.abort(inputSignal?.reason);

    if (inputSignal?.aborted) relayAbort();
    else inputSignal?.addEventListener("abort", relayAbort, { once: true });

    const timeoutId = setTimeout(() => {
      controller.abort(authFetchTimeoutError(boundedTimeoutMs));
    }, boundedTimeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      inputSignal?.removeEventListener("abort", relayAbort);
    }
  };
}
