import assert from "node:assert/strict";
import test from "node:test";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createBoundedAuthFetch } from "../src/integrations/supabase/authLockPolicy.mjs";

const authUser = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
};
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwt = (now, revision) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  sub: authUser.id, aud: "authenticated", role: "authenticated", exp: Math.floor(now / 1000) + 3600, revision,
})}.${Buffer.alloc(32).toString("base64url")}`;

async function fixture(t) {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const storageKey = "synthetic-refresh-retention";
  const makeSession = revision => ({
    access_token: jwt(now, revision), refresh_token: `synthetic-refresh-${revision}`,
    user: authUser, token_type: "bearer", expires_at: Math.floor(now / 1000) + 3600, expires_in: 3600,
  });
  const initial = makeSession(0);
  const storage = new Map([[storageKey, JSON.stringify(initial)]]);
  const events = [];
  const requests = [];
  let mode = "success", revision = 0, advanced = false;

  const client = createClient("https://synthetic.supabase.co", "synthetic-anon-key", {
    global: {
      fetch: createBoundedAuthFetch({
        timeoutMs: 25,
        retryDelayMs: 1,
        fetchImpl: async (input, init) => {
          const url = new URL(String(input));
          assert.equal(url.pathname, "/auth/v1/token", "the fixture must never make a live request");
          assert.equal(url.searchParams.get("grant_type"), "refresh_token");
          requests.push(JSON.parse(init.body));
          if (mode === "success") return Response.json(makeSession(++revision));
          if (mode === "rejected") return Response.json({
            error_code: "refresh_token_not_found", msg: "Synthetic refresh token was revoked",
          }, { status: 400 });

          // The production SDK retries retryable errors for up to 30 seconds.
          // Exhaust that SDK window logically while retaining the real transport
          // deadline, timers, error classification, storage and subscriber code.
          if (!advanced) { now += 31_000; advanced = true; }
          if (mode === "network") throw new TypeError("Synthetic connection interruption");
          return new Promise((_resolve, reject) => {
            if (init.signal.aborted) reject(init.signal.reason);
            else init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          });
        },
      }),
    },
    auth: {
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
      storageKey,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _timeout, operation) => operation(),
    },
  });
  let subscription;
  t.after(async () => {
    subscription?.unsubscribe();
    await client.auth.stopAutoRefresh();
    client.realtime.disconnect();
    Date.now = originalNow;
  });
  assert.equal((await client.auth.getSession()).data.session.refresh_token, initial.refresh_token);
  subscription = client.auth.onAuthStateChange(event => { events.push(event); }).data.subscription;
  return {
    client, events, requests, initial,
    saved: () => storage.has(storageKey) ? JSON.parse(storage.get(storageKey)) : null,
    setMode(value) { mode = value; advanced = false; },
  };
}

for (const failure of ["stalled", "network"]) {
  test(`real Supabase SDK preserves refresh credentials after ${failure} deadline and recovers later`, async t => {
    const f = await fixture(t);
    f.setMode(failure);
    const failed = await f.client.auth.refreshSession();
    assert.equal(isAuthRetryableFetchError(failed.error), true,
      "a local network deadline must not become a permanent credentials rejection");
    assert.equal(f.saved().refresh_token, f.initial.refresh_token);
    assert.equal(f.saved().access_token, f.initial.access_token);
    assert.ok(!f.events.includes("SIGNED_OUT"), "temporary connectivity must not announce logout");

    f.setMode("success");
    const recovered = await f.client.auth.refreshSession();
    assert.equal(recovered.error, null);
    assert.equal(recovered.data.session.refresh_token, "synthetic-refresh-1");
    assert.equal(f.saved().refresh_token, recovered.data.session.refresh_token);
    assert.equal(f.saved().access_token, recovered.data.session.access_token);
    assert.ok(f.events.includes("TOKEN_REFRESHED"));
    assert.ok(!f.events.includes("SIGNED_OUT"));
  });
}

test("real SDK still removes a definitively revoked refresh session", async t => {
  const f = await fixture(t);
  f.setMode("rejected");
  const rejected = await f.client.auth.refreshSession();
  assert.equal(rejected.error.status, 400);
  assert.equal(isAuthRetryableFetchError(rejected.error), false);
  assert.equal(f.saved(), null);
  assert.ok(f.events.includes("SIGNED_OUT"));
  assert.equal(f.requests.length, 1, "revoked credentials are not retried");
});

test("SDK persistence survives repeated refresh and offline cycles without any provider restoring credentials", async t => {
  const f = await fixture(t);
  let latest = f.initial;
  for (let cycle = 1; cycle <= 3; cycle++) {
    f.setMode(cycle % 2 ? "network" : "stalled");
    const firstRequest = f.requests.length;
    const failed = await f.client.auth.refreshSession();
    assert.equal(isAuthRetryableFetchError(failed.error), true);
    assert.equal(f.requests[firstRequest].refresh_token, latest.refresh_token);
    assert.equal(f.saved().refresh_token, latest.refresh_token);
    assert.equal(f.saved().access_token, latest.access_token);

    f.setMode("success");
    const recovered = await f.client.auth.refreshSession();
    assert.equal(recovered.error, null);
    latest = recovered.data.session;
    assert.equal(latest.refresh_token, `synthetic-refresh-${cycle}`);
    assert.equal((await f.client.auth.getSession()).data.session.refresh_token, latest.refresh_token);
    assert.equal(f.saved().refresh_token, latest.refresh_token);
    assert.equal(f.saved().access_token, latest.access_token);
  }
  assert.equal(f.events.filter(event => event === "TOKEN_REFRESHED").length, 3);
  assert.ok(!f.events.includes("SIGNED_OUT"));
});
