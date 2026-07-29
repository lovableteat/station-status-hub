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

test("auth HTTP requests abort instead of waiting forever", async () => {
  const fetchImpl = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      });
    });
  const boundedFetch = createBoundedAuthFetch({ fetchImpl, timeoutMs: 20 });

  const startedAt = Date.now();
  await assert.rejects(() =>
    boundedFetch("https://example.supabase.co/auth/v1/user", {
      headers: { Authorization: "Bearer token" },
    }),
  );
  assert.ok(Date.now() - startedAt < 250, "Auth network requests need a finite deadline");
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
  assert.match(clientSource, /createBoundedAuthFetch/);
  assert.match(clientSource, /fetch:\s*createBoundedAuthFetch\(/);
});
