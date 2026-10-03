const backendPort = 54321;
const functionPort = 8000;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const functionUrl = `http://127.0.0.1:${functionPort}`;
const anonKey = "synthetic-anon-key";
const serviceKey = "synthetic-service-role-key";
const callerAuthorization = "Bearer synthetic-caller-jwt";
const targetUserId = "00000000-0000-4000-8000-000000000099";

type BackendMode = "idle" | "deny-update" | "create-auth-failure" | "sync-deferred";
interface BackendCall {
  method: string;
  path: string;
  apiKey: string;
  authorization: string;
  body: unknown;
}

let mode: BackendMode = "idle";
const calls: BackendCall[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const backend = Deno.serve(
  { hostname: "127.0.0.1", port: backendPort, onListen: () => undefined },
  async (request) => {
    const url = new URL(request.url);
    const bodyText = await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      apiKey: request.headers.get("apikey") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (url.pathname === "/rest/v1/test_plan_account_cleanup_queue") {
      return json([]);
    }
    if (url.pathname === "/rest/v1/rpc/hash_password") {
      return json("$2b$synthetic-password-hash");
    }
    if (url.pathname === "/rest/v1/rpc/update_system_user_admin_profile") {
      if (mode !== "deny-update") return json({ message: "unexpected update mode" }, 500);
      return json({ code: "42501", message: "Administrator permission required" }, 403);
    }
    if (url.pathname === "/rest/v1/rpc/create_system_user_admin_profile") {
      if (mode !== "create-auth-failure") return json({ message: "unexpected create mode" }, 500);
      return json({
        id: targetUserId,
        username: "synthetic-user",
        display_name: "Synthetic User",
        role: "engineer",
        status: "active",
        auth_user_id: null,
      });
    }
    if (url.pathname === "/rest/v1/rpc/authorize_system_user_admin_sync") {
      if (mode !== "sync-deferred") return json({ message: "unexpected sync mode" }, 500);
      return json({
        id: targetUserId,
        username: "synthetic-user",
        display_name: "Synthetic User",
        role: "engineer",
        status: "active",
        auth_user_id: null,
      });
    }
    if (url.pathname === "/auth/v1/admin/users" && request.method === "POST") {
      if (mode !== "create-auth-failure") return json({ message: "unexpected auth mode" }, 500);
      return json({ message: "synthetic Auth outage" }, 503);
    }
    return json({ message: `unhandled synthetic route ${request.method} ${url.pathname}` }, 500);
  },
);

const functionDirectory = new URL("../../supabase/functions/account-admin-sync/", import.meta.url);
const child = new Deno.Command(Deno.execPath(), {
  cwd: functionDirectory,
  args: [
    "run",
    "--frozen",
    "--allow-env",
    "--allow-net",
    "index.ts",
  ],
  env: {
    SUPABASE_URL: backendUrl,
    SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    APP_DB_SCHEMA: "workspace",
  },
  stdout: "null",
  stderr: "piped",
}).spawn();

async function waitForFunction() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(functionUrl, { method: "OPTIONS" });
      if (response.status === 200) return;
    } catch {
      // The child may still be resolving its locked dependency graph.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("account-admin-sync did not start within 8 seconds");
}

async function invoke(body: unknown, includeAuthorization = true) {
  const headers = new Headers({ "content-type": "application/json" });
  if (includeAuthorization) headers.set("authorization", callerAuthorization);
  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

let runError: unknown = null;
try {
  await waitForFunction();

  const options = await fetch(functionUrl, { method: "OPTIONS" });
  assert(options.status === 200, "CORS preflight must succeed");
  assert(options.headers.get("access-control-allow-methods")?.includes("POST"), "CORS must allow POST");

  calls.length = 0;
  const unauthorized = await invoke({ action: "sync", userId: targetUserId }, false);
  assert(unauthorized.response.status === 401, "missing bearer token must fail with 401");
  assert(calls.length === 0, "unauthorized request must not reach Supabase APIs");

  calls.length = 0;
  const permissionInjection = await invoke({
    action: "update",
    userId: targetUserId,
    profile: { permissions: { all: true } },
  });
  assert(permissionInjection.response.status === 400, "permission payload must fail with 400");
  assert(calls.length === 0, "permission payload must be rejected before any privileged call");

  mode = "deny-update";
  calls.length = 0;
  const deniedUpdate = await invoke({
    action: "update",
    userId: targetUserId,
    profile: { status: "inactive" },
  });
  assert(deniedUpdate.response.status === 403, "database authorization denial must remain 403");
  assert(calls.length === 1, "denied update must issue exactly one transactional RPC");
  assert(calls[0].path.endsWith("/update_system_user_admin_profile"), "update must use its guarded RPC");
  assert(calls[0].apiKey === anonKey, "guarded RPC must use the anon client");
  assert(calls[0].authorization === callerAuthorization, "guarded RPC must forward the caller JWT");

  mode = "create-auth-failure";
  calls.length = 0;
  const createWithAuthFailure = await invoke({
    action: "create",
    profile: {
      username: "synthetic-user",
      displayName: "Synthetic User",
      role: "engineer",
      status: "active",
    },
    password: "synthetic-password",
  });
  assert(createWithAuthFailure.response.status === 503, "Auth outage must report a pending sync");
  assert(
    createWithAuthFailure.body.error === "Account profile saved; Auth sync is pending",
    "Auth outage must not claim the database profile was rolled back",
  );
  const hashCall = calls.find((call) => call.path.endsWith("/hash_password"));
  const createCall = calls.find((call) => call.path.endsWith("/create_system_user_admin_profile"));
  const authCall = calls.find((call) => call.path === "/auth/v1/admin/users");
  assert(hashCall?.apiKey === serviceKey, "password hashing must use the service client");
  assert(createCall?.apiKey === anonKey, "profile creation must use the caller client");
  assert(createCall?.authorization === callerAuthorization, "profile creation must carry the caller JWT");
  assert(authCall?.apiKey === serviceKey, "Auth synchronization must use the service client");
  assert(
    !calls.some((call) => call.method === "DELETE" && call.path === "/rest/v1/system_users"),
    "Auth failure must not compensate by deleting the authorized profile",
  );

  mode = "sync-deferred";
  calls.length = 0;
  const deferredSync = await invoke({ action: "sync", userId: targetUserId });
  assert(deferredSync.response.status === 200, "authorized legacy sync must succeed");
  assert(deferredSync.body.deferred === true, "one-way legacy password must defer Auth creation");
  const authorizeCall = calls.find((call) => call.path.endsWith("/authorize_system_user_admin_sync"));
  assert(authorizeCall?.apiKey === anonKey, "sync authorization must use the caller client");
  assert(authorizeCall?.authorization === callerAuthorization, "sync authorization must carry the caller JWT");
  assert(!calls.some((call) => call.path.startsWith("/auth/v1/")), "deferred sync must not invent an Auth password");

  console.log(JSON.stringify({
    runtime: "Deno 2.1.4",
    corsPreflight: true,
    missingAuthorizationRejected: true,
    permissionInjectionRejectedBeforeBackend: true,
    transactionalRpcAuthorizationPreserved: true,
    authFailureLeavesProfilePending: true,
    legacySyncDefersWithoutPlaintextPassword: true,
    productionWrites: false,
  }));
} catch (error) {
  runError = error;
} finally {
  try {
    child.kill("SIGTERM");
  } catch {
    // The child already exited; output below will expose the failure.
  }
  const childOutput = await child.output();
  await backend.shutdown();
  if (!childOutput.success && childOutput.signal !== "SIGTERM") {
    runError ??= new Error(
      `account-admin-sync child failed: ${new TextDecoder().decode(childOutput.stderr)}`,
    );
  }
}

if (runError) throw runError;
