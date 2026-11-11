// Run with Deno 2.1.4 after caching daily-stats/index.ts with the existing
// account-admin-sync/deno.json config and frozen lock. All credentials and data
// below are synthetic; the handler child can contact only the loopback fixture.
const backendPort = 54322;
const functionPort = 8000;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const functionUrl = `http://127.0.0.1:${functionPort}`;
const serviceKey = "synthetic-daily-stats-service-key";
const privateError = "synthetic-private-database-detail";
const configuredSchema = "synthetic_workspace";

interface BackendCall {
  method: string;
  path: string;
  search: string;
  apiKey: string | null;
  authorization: string | null;
  schema: string | null;
  body: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(Deno.version.deno === "2.1.4", "Run this runtime contract with Deno 2.1.4");

let backendMode: "reject-unexpected" | "success" | "rpc-error" = "reject-unexpected";
const calls: BackendCall[] = [];
const backend = Deno.serve(
  { hostname: "127.0.0.1", port: backendPort, onListen: () => undefined },
  async (request) => {
    const url = new URL(request.url);
    calls.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      apiKey: request.headers.get("apikey"),
      authorization: request.headers.get("authorization"),
      schema: request.headers.get("content-profile"),
      body: await request.text(),
    });
    if (request.method === "POST" && url.pathname === "/rest/v1/rpc/calculate_daily_production_stats") {
      if (backendMode === "success") return new Response(null, { status: 204 });
      if (backendMode === "rpc-error") {
        return new Response(JSON.stringify({
          code: "P0001",
          message: privateError,
          details: serviceKey,
          hint: "synthetic internal database hint",
        }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ message: "Unexpected synthetic backend request" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
);

async function invoke(method = "POST", headers: HeadersInit = {}, timeout = 5_000) {
  const response = await fetch(functionUrl, {
    method,
    headers,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  return { response, text };
}

function assertJson(result: Awaited<ReturnType<typeof invoke>>, status: number) {
  assert(result.response.status === status, `Expected HTTP ${status}, got ${result.response.status}`);
  assert(result.response.headers.get("cache-control") === "no-store", "JSON responses must be no-store");
  assert(result.response.headers.get("content-type")?.includes("application/json"), "Expected a JSON response");
  assert(result.response.headers.get("access-control-allow-origin") === "*", "JSON response must retain CORS");
  assert(!result.text.includes(serviceKey), "Response must not expose the service credential");
  assert(!result.text.includes(privateError), "Response must not expose backend error details");
  return JSON.parse(result.text) as Record<string, unknown>;
}

function assertError(result: Awaited<ReturnType<typeof invoke>>, status: number, message: string) {
  const body = assertJson(result, status);
  assert(JSON.stringify(body) === JSON.stringify({ error: message }), "Expected only the public error message");
}

function assertRpc(schema: string) {
  assert(calls.length === 1, "Authorized request must issue exactly one backend request");
  const call = calls[0];
  assert(call.method === "POST", "Calculation RPC must use POST");
  assert(call.path === "/rest/v1/rpc/calculate_daily_production_stats", "Expected only the calculation RPC");
  assert(call.search === "", "Calculation must not add query parameters");
  assert(call.apiKey === serviceKey, "RPC must use the configured service API key");
  assert(call.authorization === `Bearer ${serviceKey}`, "RPC must use the configured service authorization");
  assert(call.schema === schema, "RPC must send the expected PostgREST Content-Profile schema");
  assert(call.body === "{}", "Calculation RPC must have no caller-controlled arguments");
}

const functionDirectory = new URL("../../supabase/functions/daily-stats/", import.meta.url);

async function withFunction(env: Record<string, string>, run: () => Promise<void>) {
  // Do not inherit production credentials or alternate backend configuration.
  // Preserve only cache locations so --cached-only can use the frozen prefetch.
  const cacheEnv: Record<string, string> = {};
  for (const name of ["DENO_DIR", "HOME", "XDG_CACHE_HOME"]) {
    const value = Deno.env.get(name);
    if (value) cacheEnv[name] = value;
  }
  const child = new Deno.Command(Deno.execPath(), {
    cwd: functionDirectory,
    args: [
      "run",
      "--cached-only",
      "--frozen",
      "--config=../account-admin-sync/deno.json",
      "--allow-env",
      `--allow-net=127.0.0.1:${backendPort},0.0.0.0:${functionPort}`,
      "index.ts",
    ],
    clearEnv: true,
    env: {
      ...cacheEnv,
      DENO_NO_UPDATE_CHECK: "1",
      SUPABASE_URL: backendUrl,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      ...env,
    },
    stdout: "null",
    stderr: "piped",
  }).spawn();
  const output = child.output();
  let exited = false;
  void child.status.then(() => { exited = true; });
  let runError: unknown;
  let stderr = "";
  try {
    let ready = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !exited) {
      try {
        const preflight = await invoke("OPTIONS", {}, 500);
        if (preflight.response.status === 200 && preflight.text === "ok") {
          ready = true;
          break;
        }
      } catch {
        // The real handler child may still be loading its cached dependencies.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready && !exited, "daily-stats failed to become ready");
    await run();
  } catch (error) {
    runError = error;
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      // A startup failure may already have stopped the child.
    }
    const killTimeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process already stopped after SIGTERM.
      }
    }, 2_000);
    const result = await output.finally(() => clearTimeout(killTimeout));
    stderr = new TextDecoder().decode(result.stderr);
    if (stderr.includes(serviceKey) || stderr.includes(privateError)) {
      runError ??= new Error("Handler logs must not leak private details");
    }
    if (!result.success && result.signal !== "SIGTERM") {
      runError ??= new Error(`daily-stats child failed with exit code ${result.code}`);
    }
  }
  if (runError) throw new Error(`${String(runError)}\ndaily-stats stderr:\n${stderr}`, { cause: runError });
}

function forgedServiceRoleJwt() {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "service_role",
    sub: "00000000-0000-4000-8000-000000000099",
    exp: 4102444800,
  })}.synthetic-forged-signature`;
}

async function assertAuthorizedSuccess(schema: string) {
  backendMode = "success";
  calls.length = 0;
  const before = Date.now();
  const result = await invoke("POST", { authorization: `Bearer ${serviceKey}` });
  const body = assertJson(result, 200);
  assert(body.success === true, "Authorized calculation must report success");
  assert(Object.keys(body).sort().join(",") === "success,timestamp", "Success must expose only the public receipt");
  assert(typeof body.timestamp === "string", "Success must include an ISO timestamp");
  const timestamp = Date.parse(body.timestamp);
  assert(Number.isFinite(timestamp) && new Date(timestamp).toISOString() === body.timestamp, "Expected an ISO timestamp");
  assert(timestamp >= before && timestamp <= Date.now(), "Receipt timestamp must belong to this request");
  assertRpc(schema);
}

try {
  await withFunction({ APP_DB_SCHEMA: configuredSchema }, async () => {
    calls.length = 0;
    const preflight = await invoke("OPTIONS");
    assert(preflight.response.status === 200 && preflight.text === "ok", "CORS preflight must succeed");
    assert(preflight.response.headers.get("access-control-allow-methods") === "POST, OPTIONS", "CORS must expose only POST and OPTIONS");
    assert(preflight.response.headers.get("access-control-allow-headers")?.includes("authorization"), "CORS must allow authorization");
    assert(calls.length === 0, "Preflight must not contact the backend");

    for (const method of ["GET", "PUT", "DELETE"]) {
      assertError(await invoke(method, { authorization: `Bearer ${serviceKey}` }), 405, "Method not allowed");
      assert(calls.length === 0, "Unsupported methods must not contact the backend");
    }

    const rejectedHeaders: HeadersInit[] = [
      {},
      { apikey: serviceKey },
      { authorization: "Bearer synthetic-anon-key" },
      { authorization: `Bearer ${forgedServiceRoleJwt()}` },
      { authorization: `Basic ${serviceKey}` },
      { authorization: `Bearer ${serviceKey}x` },
    ];
    for (const headers of rejectedHeaders) {
      assertError(await invoke("POST", headers), 401, "Unauthorized");
      assert(calls.length === 0, "Rejected credentials must not reach Supabase APIs");
    }

    await assertAuthorizedSuccess(configuredSchema);

    backendMode = "rpc-error";
    calls.length = 0;
    assertError(await invoke("POST", { authorization: `Bearer ${serviceKey}` }), 500, "Calculation failed");
    assertRpc(configuredSchema);
  });

  await withFunction({}, () => assertAuthorizedSuccess("workspace"));

  const missingConfigurations: Record<string, string>[] = [
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    { SUPABASE_URL: "" },
  ];
  for (const missingConfig of missingConfigurations) {
    backendMode = "reject-unexpected";
    calls.length = 0;
    await withFunction(missingConfig, async () => {
      assertError(await invoke("POST", { authorization: `Bearer ${serviceKey}` }), 503, "Service unavailable");
      assert(calls.length === 0, "Missing configuration must fail closed before the backend");
    });
  }

  calls.length = 0;
  await withFunction({ SUPABASE_URL: "not-a-valid-synthetic-url" }, async () => {
    assertError(await invoke("POST", { authorization: `Bearer ${serviceKey}` }), 500, "Internal server error");
    assert(calls.length === 0, "Client construction failure must not contact the backend");
  });
} finally {
  await backend.shutdown();
}

console.log(JSON.stringify({
  runtime: Deno.version.deno,
  corsPreflight: true,
  unsupportedMethodsRejected: true,
  missingAndForgedCredentialsRejectedBeforeBackend: true,
  exactServiceCredentialRequired: true,
  configuredAndDefaultSchemaVerified: true,
  calculationRpcContractVerified: true,
  configurationFailuresClosed: true,
  cleanErrorsAndLogs: true,
  jsonResponsesNoStore: true,
  productionWrites: false,
}));
