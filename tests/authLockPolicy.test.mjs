import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBoundedAuthFetch,
  createBoundedAuthLock,
} from "../src/integrations/supabase/authLockPolicy.mjs";

test("auth lock stops waiting when another browser context never releases the lock", async () => {
  const lockManager = {
    request(_name, options) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), {
          once: true,
        });
      });
    },
  };
  const lock = createBoundedAuthLock({ lockManager, maxWaitMs: 20 });

  const startedAt = Date.now();
  await assert.rejects(() => lock("auth-session", -1, async () => "never"));
  assert.ok(Date.now() - startedAt < 250, "the browser auth lock must have a finite wait");
});

test("auth lock executes immediately when Web Locks are unavailable", async () => {
  const lock = createBoundedAuthLock({ lockManager: null, maxWaitMs: 20 });

  assert.equal(await lock("auth-session", -1, async () => "ready"), "ready");
});

test("zero-timeout auth lock uses a non-blocking availability check", async () => {
  let receivedOptions;
  const lockManager = {
    request(_name, options, callback) {
      receivedOptions = options;
      return callback(null);
    },
  };
  const lock = createBoundedAuthLock({ lockManager, maxWaitMs: 20 });

  await assert.rejects(
    () => lock("auth-session", 0, async () => "unexpected"),
    (error) => error.isAcquireTimeout === true,
  );
  assert.equal(receivedOptions.ifAvailable, true);
});

test("auth lock preserves an operation error after the lock was acquired", async () => {
  const operationError = new Error("verified user request failed");
  const lockManager = {
    request(_name, _options, callback) {
      return callback({ name: "auth-session" });
    },
  };
  const lock = createBoundedAuthLock({ lockManager, maxWaitMs: 10 });

  await assert.rejects(
    () =>
      lock("auth-session", -1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw operationError;
      }),
    (error) => error === operationError,
  );
});

test("local Auth deadlines abort transport and return a non-retryable failure to the SDK", async () => {
  let receivedSignal;
  const fetchImpl = (_input, init) =>
    new Promise((_resolve, reject) => {
      receivedSignal = init.signal;
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      });
    });
  const boundedFetch = createBoundedAuthFetch({ fetchImpl, timeoutMs: 20 });

  const startedAt = Date.now();
  const response = await boundedFetch("https://example.supabase.co/auth/v1/user", {
    headers: { Authorization: "Bearer token" },
  });
  assert.equal(response.status, 408);
  assert.equal(response.ok, false);
  const error = await response.json();
  assert.equal(error.error_code, "request_timeout");
  assert.match(error.msg, /local.+timed out.+20 ms/i);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(receivedSignal.reason.name, "AuthFetchTimeoutError");
  assert.ok(Date.now() - startedAt < 250, "Auth network requests need a finite deadline");
});

test("local Auth deadlines remain bounded even if transport ignores abort", async () => {
  const boundedFetch = createBoundedAuthFetch({
    fetchImpl: () => new Promise(() => {}), timeoutMs: 20,
  });
  const startedAt = Date.now();
  const response = await boundedFetch("https://example.supabase.co/auth/v1/token");
  assert.equal(response.status, 408);
  assert.ok(Date.now() - startedAt < 250);
});

test("the Auth deadline includes a stalled response body after headers arrive", async () => {
  let receivedSignal;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 20,
    fetchImpl: async (_input, init) => {
      receivedSignal = init.signal;
      return new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
        },
      }), { headers: { "Content-Type": "application/json" } });
    },
  });
  const response = await boundedFetch("https://example.supabase.co/auth/v1/token");
  assert.equal(response.status, 408);
  assert.equal((await response.json()).error_code, "request_timeout");
  assert.equal(receivedSignal.aborted, true);
});

test("headers and body share one Auth deadline instead of receiving separate budgets", async () => {
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 45,
    fetchImpl: async (_input, init) => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return new Response(new ReadableStream({
        start(controller) {
          const timer = setTimeout(() => { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); }, 30);
          init.signal.addEventListener("abort", () => { clearTimeout(timer); controller.error(init.signal.reason); }, { once: true });
        },
      }));
    },
  });
  const response = await boundedFetch("https://example.supabase.co/auth/v1/user");
  assert.equal(response.status, 408);
});

test("normal Auth responses retain their status, headers and readable JSON body", async () => {
  const upstream = Response.json({ user: { id: "verified-user" } }, {
    status: 200, headers: { "x-auth-test": "unchanged" },
  });
  let receivedSignal;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 20,
    fetchImpl: async (_input, init) => { receivedSignal = init.signal; return upstream; },
  });
  const response = await boundedFetch("https://example.supabase.co/auth/v1/user");
  assert.equal(response, upstream);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-auth-test"), "unchanged");
  assert.equal(response.bodyUsed, false);
  assert.deepEqual(await response.json(), { user: { id: "verified-user" } });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(receivedSignal.aborted, false, "a finished response must clear its timer");
});

test("non-refresh server transient failures remain unchanged so the SDK can retry them", async () => {
  for (const status of [502, 503, 504]) {
    const upstream = Response.json({ message: "Server temporarily unavailable" }, { status });
    const boundedFetch = createBoundedAuthFetch({ fetchImpl: async () => upstream, timeoutMs: 20 });
    const response = await boundedFetch("https://example.supabase.co/auth/v1/token");
    assert.equal(response, upstream);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { message: "Server temporarily unavailable" });
  }
});

const refreshUrl = "https://example.supabase.co/auth/v1/token?grant_type=refresh_token";

test("refresh transient responses retry inside the transport and can recover successfully", async () => {
  const statuses = [503, 502, 504, 200];
  let calls = 0;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 200, retryDelayMs: 1,
    fetchImpl: async () => Response.json({ attempt: ++calls }, { status: statuses[calls - 1] }),
  });
  const response = await boundedFetch(refreshUrl, { method: "POST", body: '{}' });
  assert.equal(calls, 4);
  assert.equal(response.status, 200);
  assert.equal(response.bodyUsed, false);
  assert.deepEqual(await response.json(), { attempt: 4 });
});

test("refresh network errors retry within the same request and can recover", async () => {
  let calls = 0;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 200, retryDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Temporary network interruption");
      return Response.json({ access_token: "verified-refresh-result" });
    },
  });
  const response = await boundedFetch(refreshUrl, { method: "POST" });
  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: "verified-refresh-result" });
});

for (const failure of ["network", "503"]) {
  test(`persistent refresh ${failure} failures share one total deadline and stop SDK retries`, async () => {
    let calls = 0, receivedSignal;
    const boundedFetch = createBoundedAuthFetch({
      timeoutMs: 45, retryDelayMs: 1,
      fetchImpl: async (_input, init) => {
        calls += 1; receivedSignal = init.signal;
        if (failure === "network") throw new TypeError("Network unavailable");
        return Response.json({ message: "Temporarily unavailable" }, { status: 503 });
      },
    });
    const startedAt = Date.now();
    const response = await boundedFetch(refreshUrl, { method: "POST" });
    assert.ok(calls >= 2, "refresh should recover transient failures before exhausting its budget");
    assert.equal(response.status, 408);
    assert.equal((await response.json()).error_code, "request_timeout");
    assert.equal(receivedSignal.aborted, true);
    assert.ok(Date.now() - startedAt < 250, "backoff must not extend the total Auth budget");
  });
}

test("caller abort interrupts refresh backoff without another attempt or a synthetic timeout", async () => {
  const caller = new AbortController();
  const reason = new Error("Caller cancelled refresh backoff");
  let calls = 0;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 2_000, retryDelayMs: 1_000,
    fetchImpl: async () => { calls += 1; return Response.json({}, { status: 503 }); },
  });
  const result = boundedFetch(refreshUrl, { method: "POST", signal: caller.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  caller.abort(reason);
  await assert.rejects(result, error => error === reason);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

test("a response body after refresh retries still has only the original deadline", async () => {
  let calls = 0;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 45, retryDelayMs: 1,
    fetchImpl: async (_input, init) => {
      calls += 1;
      if (calls === 1) return Response.json({}, { status: 503 });
      return new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
        },
      }), { headers: { "Content-Type": "application/json" } });
    },
  });
  const startedAt = Date.now();
  const response = await boundedFetch(refreshUrl, { method: "POST" });
  assert.equal(calls, 2);
  assert.equal(response.status, 408);
  assert.ok(Date.now() - startedAt < 250);
});

test("refresh rejection responses return immediately without retrying credentials", async () => {
  let calls = 0;
  const rejection = Response.json({ error_code: "refresh_token_not_found" }, { status: 400 });
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 200, retryDelayMs: 1,
    fetchImpl: async () => { calls += 1; return rejection; },
  });
  const response = await boundedFetch(refreshUrl, { method: "POST" });
  assert.equal(calls, 1);
  assert.equal(response, rejection);
  assert.equal(response.status, 400);
});

test("other token grants do not acquire refresh-only retry behavior", async () => {
  for (const grant of ["password", "authorization_code"]) {
    let calls = 0;
    const upstream = Response.json({}, { status: 503 });
    const boundedFetch = createBoundedAuthFetch({
      timeoutMs: 200, retryDelayMs: 1,
      fetchImpl: async () => { calls += 1; return upstream; },
    });
    const response = await boundedFetch(`https://example.supabase.co/auth/v1/token?grant_type=${grant}`, { method: "POST" });
    assert.equal(calls, 1);
    assert.equal(response, upstream);
  }
});

test("refresh retries can replay a Request body without consuming the caller's original", async () => {
  const request = new Request(refreshUrl, { method: "POST", body: JSON.stringify({ refresh_token: "synthetic-refresh" }) });
  const bodies = [];
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 200, retryDelayMs: 1,
    fetchImpl: async input => {
      bodies.push(await input.text());
      return Response.json({}, { status: bodies.length === 1 ? 503 : 200 });
    },
  });
  const response = await boundedFetch(request);
  assert.equal(response.status, 200);
  assert.deepEqual(bodies, [JSON.stringify({ refresh_token: "synthetic-refresh" }), JSON.stringify({ refresh_token: "synthetic-refresh" })]);
  assert.equal(request.bodyUsed, false);
});

test("ordinary transport failures retain their original rejection", async () => {
  const failure = new TypeError("Network unavailable");
  const boundedFetch = createBoundedAuthFetch({ fetchImpl: async () => { throw failure; }, timeoutMs: 20 });
  await assert.rejects(boundedFetch("https://example.supabase.co/auth/v1/user"), error => error === failure);
});

test("caller cancellation remains a rejection instead of becoming a local timeout response", async () => {
  const caller = new AbortController();
  const reason = new Error("Caller cancelled request");
  let receivedSignal;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 100,
    fetchImpl: (_input, init) => { receivedSignal = init.signal; return new Promise(() => {}); },
  });
  const result = boundedFetch("https://example.supabase.co/auth/v1/user", { signal: caller.signal });
  await Promise.resolve();
  caller.abort(reason);
  await assert.rejects(result, error => error === reason);
  assert.equal(receivedSignal.reason, reason);
});

test("caller cancellation after Auth headers also stops a stalled body read", async () => {
  const caller = new AbortController();
  const reason = new Error("Caller cancelled body");
  let receivedSignal;
  const boundedFetch = createBoundedAuthFetch({
    timeoutMs: 100,
    fetchImpl: async (_input, init) => {
      receivedSignal = init.signal;
      return new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
        },
      }));
    },
  });
  const result = boundedFetch("https://example.supabase.co/auth/v1/user", { signal: caller.signal });
  await new Promise(resolve => setTimeout(resolve, 5));
  caller.abort(reason);
  await assert.rejects(result, error => error === reason);
  assert.equal(receivedSignal.reason, reason);
});

test("an already cancelled Request never starts Auth transport", async () => {
  const caller = new AbortController();
  const reason = new Error("Request was cancelled");
  caller.abort(reason);
  const request = new Request("https://example.supabase.co/auth/v1/user", { signal: caller.signal });
  let calls = 0;
  const boundedFetch = createBoundedAuthFetch({ fetchImpl: async () => { calls += 1; return Response.json({}); }, timeoutMs: 20 });
  await assert.rejects(boundedFetch(request), error => error === reason);
  assert.equal(calls, 0);
});

test("non-Auth Supabase requests retain their original fetch behavior", async () => {
  let receivedSignal = "not-called";
  const fetchImpl = async (_input, init) => {
    receivedSignal = init?.signal;
    return { ok: true };
  };
  const boundedFetch = createBoundedAuthFetch({ fetchImpl, timeoutMs: 20 });

  const result = await boundedFetch(
    "https://example.supabase.co/storage/v1/object/backups/auth/v1/large-model",
    {
      method: "POST",
    },
  );
  assert.equal(result.ok, true);
  assert.equal(receivedSignal, undefined);
});

test("Supabase client installs the bounded auth lock", async () => {
  const clientSource = await readFile(
    new URL("../src/integrations/supabase/client.ts", import.meta.url),
    "utf8",
  );

  assert.match(clientSource, /createBoundedAuthLock/);
  assert.match(clientSource, /lock:\s*createBoundedAuthLock\(/);
  assert.match(
    clientSource,
    /lockAcquireTimeout:\s*\d[\d_]*/,
    "current Supabase clients require an explicit timeout when a custom lock is supplied",
  );
  assert.match(clientSource, /createBoundedAuthFetch/);
  assert.match(clientSource, /fetch:\s*createBoundedAuthFetch\(/);
});
