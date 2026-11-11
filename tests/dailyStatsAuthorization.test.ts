import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { isServiceRequest } from "../supabase/functions/daily-stats/authorization.ts";

const request = (authorization?: string) => new Request("https://example.invalid/daily-stats", {
  headers: authorization ? { Authorization: authorization } : {},
});

test("the daily-stats handler authenticates before creating a privileged client", async () => {
  const source = await readFile(new URL("../supabase/functions/daily-stats/index.ts", import.meta.url), "utf8");
  const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ""), { mode: "strip" });
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let clients = 0;
  let calls = 0;
  const fakeDeno = {
    env: { get: (key: string) => ({ SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: serviceKey }[key]) },
    serve: (callback: typeof handler) => { handler = callback; },
  };
  const createClient = () => {
    clients += 1;
    return { rpc: async (name: string) => { assert.equal(name, "calculate_daily_production_stats"); calls += 1; return { error: null }; } };
  };
  new Function("createClient", "isServiceRequest", "Deno", executable)(createClient, isServiceRequest, fakeDeno);
  assert.ok(handler);
  for (const authorization of [undefined, "Bearer anon", "Bearer forged-admin-jwt"]) {
    const response = await handler(new Request("https://example.invalid", { method: "POST", headers: authorization ? { Authorization: authorization } : {} }));
    assert.equal(response.status, 401);
    assert.equal(clients, 0);
    assert.equal(calls, 0);
  }
  assert.equal((await handler(new Request("https://example.invalid", { method: "OPTIONS" }))).status, 200);
  assert.equal((await handler(request("Bearer " + serviceKey))).status, 405);
  assert.equal(clients, 0);
  const authorized = await handler(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer " + serviceKey } }));
  assert.equal(authorized.status, 200);
  const body = await authorized.json();
  assert.deepEqual(Object.keys(body).sort(), ["message", "success", "timestamp"]);
  assert.equal(body.success, true);
  assert.equal(body.message, "Daily production stats calculated successfully");
  assert.equal(typeof body.timestamp, "string");
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
  assert.equal(calls, 1);
});
const serviceKey = "fixture-service-key-not-a-real-credential";

test("daily stats only accepts the exact existing service credential", async () => {
  assert.equal(await isServiceRequest(request("Bearer " + serviceKey), serviceKey), true);
  for (const header of [undefined, "Bearer public-anon-key", "Bearer user-jwt", "Bearer forged-service-role", "Basic " + serviceKey, "Bearer " + serviceKey + "x"]) {
    assert.equal(await isServiceRequest(request(header), serviceKey), false);
  }
  assert.equal(await isServiceRequest(request("Bearer anything"), ""), false);
});

test("daily-stats fails closed on missing configuration and keeps errors and credentials out of responses", async (t) => {
  const source = await readFile(new URL("../supabase/functions/daily-stats/index.ts", import.meta.url), "utf8");
  const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ""), { mode: "strip" });
  const scenarios = [
    { name: "missing service key", key: "", url: "https://example.invalid", status: 503, clients: 0 },
    { name: "missing URL", key: serviceKey, url: "", status: 503, clients: 0 },
    { name: "RPC failure", key: serviceKey, url: "https://example.invalid", status: 500, clients: 1, rpcError: true },
    { name: "client exception", key: serviceKey, url: "https://example.invalid", status: 500, clients: 1, throws: true },
    { name: "default schema", key: serviceKey, url: "https://example.invalid", status: 200, clients: 1 },
    { name: "configured schema", key: serviceKey, url: "https://example.invalid", status: 200, clients: 1, schema: "fixture_workspace" },
  ];
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let clients = 0;
    const logs: unknown[][] = [];
    const env: Record<string, string | undefined> = {
      SUPABASE_URL: scenario.url, SUPABASE_SERVICE_ROLE_KEY: scenario.key, APP_DB_SCHEMA: scenario.schema,
    };
    const fakeDeno = { env: { get: (key: string) => env[key] }, serve: (callback: typeof handler) => { handler = callback; } };
    const createClient = (url: string, key: string, options: { db: { schema: string }; auth: { persistSession: boolean; autoRefreshToken: boolean } }) => {
      clients += 1;
      assert.equal(url, scenario.url); assert.equal(key, serviceKey);
      assert.equal(options.db.schema, scenario.schema || "workspace");
      assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false);
      if (scenario.throws) throw new Error("fixture-private-error");
      return { rpc: async (name: string) => {
        assert.equal(name, "calculate_daily_production_stats");
        return { error: scenario.rpcError ? { code: "FIXTURE", message: "fixture-private-error" } : null };
      } };
    };
    new Function("createClient", "isServiceRequest", "Deno", "console", executable)(createClient, isServiceRequest, fakeDeno, { error: (...args: unknown[]) => logs.push(args) });
    assert.ok(handler);
    const response = await handler(new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer " + serviceKey } }));
    const body = await response.text();
    assert.equal(response.status, scenario.status); assert.equal(clients, scenario.clients);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(body + JSON.stringify(logs), /fixture-private-error|fixture-service-key-not-a-real-credential/);
    const payload = JSON.parse(body);
    assert.equal(payload.success, scenario.status === 200 ? true : undefined);
    assert.equal(payload.message, scenario.status === 200 ? "Daily production stats calculated successfully" : undefined);
  });
});
