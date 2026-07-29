import assert from "node:assert/strict";
import test from "node:test";

import * as authPolicy from "../src/components/auth/loginRetryPolicy.mjs";

test("session bootstrap stops waiting when an auth operation never settles", async () => {
  assert.equal(
    typeof authPolicy.runSessionBootstrapWithDeadline,
    "function",
    "the session bootstrap needs a bounded deadline helper",
  );

  const startedAt = Date.now();
  const result = await authPolicy.runSessionBootstrapWithDeadline(
    () => new Promise(() => {}),
    { timeoutMs: 20 },
  );

  assert.deepEqual(result, { status: "timed-out" });
  assert.ok(Date.now() - startedAt < 250, "the loading gate must not wait indefinitely");
});

test("session bootstrap reports rejected auth operations without hanging the UI", async () => {
  assert.equal(typeof authPolicy.runSessionBootstrapWithDeadline, "function");

  const failure = new Error("auth storage lock failed");
  const result = await authPolicy.runSessionBootstrapWithDeadline(
    () => Promise.reject(failure),
    { timeoutMs: 100 },
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.error, failure);
});

test("session bootstrap returns the successful auth result and clears its deadline", async () => {
  assert.equal(typeof authPolicy.runSessionBootstrapWithDeadline, "function");

  const result = await authPolicy.runSessionBootstrapWithDeadline(
    async () => ({ session: "ready" }),
    { timeoutMs: 100 },
  );

  assert.deepEqual(result, {
    status: "fulfilled",
    value: { session: "ready" },
  });
});
