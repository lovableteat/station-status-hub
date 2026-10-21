const DEFAULT_AUTH_LOCK_WAIT_MS = 6_000;
const DEFAULT_AUTH_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_REFRESH_RETRY_DELAY_MS = 200;

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

function authRequestUrl(input) {
  const rawUrl =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : typeof input?.url === "string"
        ? input.url
        : "";
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl, "http://localhost");
    return url.pathname === "/auth/v1" || url.pathname.startsWith("/auth/v1/") ? url : null;
  } catch {
    return null;
  }
}

function authFetchTimeoutError(timeoutMs) {
  const error = new Error(`Supabase Auth request exceeded ${timeoutMs} ms`);
  error.name = "AuthFetchTimeoutError";
  return error;
}

function authFetchTimeoutResponse(timeoutMs) {
  // Auth SDK 2.x turns thrown transport errors into retryable refresh failures.
  // A local 408 ends that retry loop and fails closed; it never grants a session.
  return new Response(JSON.stringify({
    error_code: "request_timeout",
    msg: `Local Supabase Auth request timed out after ${timeoutMs} ms`,
  }), { status: 408, headers: { "Content-Type": "application/json" } });
}

function waitForRefreshRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export function createBoundedAuthFetch({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_AUTH_FETCH_TIMEOUT_MS,
  retryDelayMs = DEFAULT_REFRESH_RETRY_DELAY_MS,
} = {}) {
  const boundedTimeoutMs = Math.max(1, timeoutMs);
  const boundedRetryDelayMs = Math.max(1, retryDelayMs);

  return async function boundedAuthFetch(input, init) {
    const url = authRequestUrl(input);
    if (!url) return fetchImpl(input, init);
    const refresh = url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token";

    const controller = new AbortController();
    const inputSignal =
      init?.signal ?? (typeof input === "object" && input !== null ? input.signal : undefined);
    let timedOut = false;
    let timeoutId;
    let relayAbort;
    const stopped = new Promise((resolve, reject) => {
      relayAbort = () => {
        const reason = inputSignal?.reason ?? new DOMException("The request was aborted", "AbortError");
        controller.abort(reason);
        reject(reason);
      };
      if (inputSignal?.aborted) relayAbort();
      else inputSignal?.addEventListener("abort", relayAbort, { once: true });

      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(authFetchTimeoutError(boundedTimeoutMs));
        resolve(authFetchTimeoutResponse(boundedTimeoutMs));
      }, boundedTimeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          let attempt = 0;
          while (true) {
            if (controller.signal.aborted) throw controller.signal.reason;
            try {
              const request = refresh && typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
              const response = await fetchImpl(request, { ...init, signal: controller.signal });
              // Auth payloads are small. Headers, bodies and refresh backoff all
              // consume this one deadline; leave the SDK's response body unread.
              await response.clone().arrayBuffer();
              if (!refresh || ![502, 503, 504].includes(response.status)) return response;
              await response.body?.cancel();
            } catch (error) {
              if (!refresh || controller.signal.aborted) throw error;
            }
            // Keep refresh retries here so the SDK cannot start a second,
            // 30-second retry window after the application's deadline.
            await waitForRefreshRetry(Math.min(boundedRetryDelayMs * 2 ** attempt, 2_000), controller.signal);
            attempt += 1;
          }
        })(),
        stopped,
      ]);
    } catch (error) {
      if (timedOut) return authFetchTimeoutResponse(boundedTimeoutMs);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      inputSignal?.removeEventListener("abort", relayAbort);
    }
  };
}
