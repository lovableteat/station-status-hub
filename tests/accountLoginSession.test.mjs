import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../supabase/functions/account-login/index.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const systemId = "11111111-1111-4111-8111-111111111111";
const authId = "22222222-2222-4222-8222-222222222222";
const backend = "https://synthetic.supabase.co";
const password = "Case Sensitive!";

function fixture({ authPassword = password, displayName = "Tester", loginError } = {}) {
  const metadata = { system_user_id: systemId, username: "tester", role: "engineer", display_name: displayName };
  const profile = { id: systemId, auth_user_id: authId, status: "active", avatar_path: null,
    username: "tester", role: "engineer", display_name: "Tester" };
  const adminUpdates = [];
  const tokenRequests = [];
  const activeSessions = new Set();
  let sessionNumber = 0;
  let handler;

  const sessionResponse = () => {
    const token = `refresh-${++sessionNumber}`;
    activeSessions.add(token);
    return Response.json({
      access_token: `access-${sessionNumber}`, refresh_token: token, token_type: "bearer", expires_in: 3600,
      user: { id: authId, aud: "authenticated", role: "authenticated", app_metadata: metadata, user_metadata: {} },
    });
  };

  async function fetch(input, init) {
    const url = new URL(String(input));
    assert.equal(url.origin, backend);
    const body = init?.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/rest/v1/rpc/authenticate_user") {
      const matches = body.username_input === profile.username && body.password_input === password;
      return Response.json([{ success: matches, user_id: matches ? systemId : null }]);
    }
    if (url.pathname === "/rest/v1/system_users") {
      return init.method === "PATCH" ? new Response(null, { status: 204 }) : Response.json(profile);
    }
    if (url.pathname === `/auth/v1/admin/users/${authId}`) {
      assert.equal(init.method, "PUT");
      adminUpdates.push(body);
      Object.assign(metadata, body.app_metadata);
      if (Object.hasOwn(body, "password")) {
        authPassword = body.password;
        activeSessions.clear();
      }
      return Response.json({ id: authId, app_metadata: metadata });
    }
    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      tokenRequests.push(grant);
      if (grant === "refresh_token") {
        assert.ok(activeSessions.delete(body.refresh_token), "refresh rotates only the supplied session");
        return sessionResponse();
      }
      assert.equal(grant, "password");
      if (loginError) return Response.json({ error_code: loginError, msg: "Unavailable" }, { status: 429 });
      if (body.password !== authPassword) {
        return Response.json({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 });
      }
      return sessionResponse();
    }
    assert.fail(`Unexpected request ${init?.method} ${url.pathname}`);
  }

  const env = { SUPABASE_URL: backend, SUPABASE_SERVICE_ROLE_KEY: "synthetic-service", SUPABASE_ANON_KEY: "synthetic-anon" };
  const imports = {
    "https://deno.land/std@0.168.0/http/server.ts": { serve: callback => { handler = callback; } },
    "https://esm.sh/@supabase/supabase-js@2": {
      createClient: (url, key, options) => createClient(url, key, { ...options, global: { fetch } }),
    },
  };
  runInNewContext(compiled, {
    require: name => imports[name], exports: {}, Deno: { env: { get: name => env[name] } },
    Response, console: { error() {} },
  });

  return {
    adminUpdates, tokenRequests, activeSessions,
    login: (inputPassword = password) => handler(new Request(`${backend}/functions/v1/account-login`, {
      method: "POST", body: JSON.stringify({ username: "TESTER", password: inputPassword }),
    })),
  };
}

test("repeated healthy sign-ins leave the existing session valid and skip all admin Auth writes", async () => {
  const f = fixture();
  const first = await f.login();
  const second = await f.login();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstToken = (await first.json()).session.refresh_token;
  const secondToken = (await second.json()).session.refresh_token;
  assert.notEqual(firstToken, secondToken);
  assert.ok(f.activeSessions.has(firstToken));
  assert.deepEqual(f.tokenRequests, ["password", "password"]);
  assert.deepEqual(f.adminUpdates, []);
});

test("a metadata-only sync issues fresh claims and keeps other sessions", async () => {
  const f = fixture({ displayName: "Old name" });
  f.activeSessions.add("existing-refresh-token");
  const response = await f.login();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.user.app_metadata.display_name, "Tester");
  assert.deepEqual(f.tokenRequests, ["password", "refresh_token"]);
  assert.equal(f.adminUpdates.length, 1);
  assert.deepEqual(Object.keys(f.adminUpdates[0]), ["app_metadata"]);
  assert.ok(f.activeSessions.has("existing-refresh-token"));
});

test("a verified legacy password can repair linked credential drift", async () => {
  const f = fixture({ authPassword: "old password" });
  assert.equal((await f.login()).status, 200);
  assert.equal((await f.login()).status, 200);
  assert.deepEqual(f.tokenRequests, ["password", "password", "password"]);
  assert.equal(f.adminUpdates.length, 1);
  assert.equal(f.adminUpdates[0].password, password);
});

test("a wrong password or an unrelated Auth error never triggers credential repair", async () => {
  const f = fixture({ loginError: "over_request_rate_limit" });
  assert.equal((await f.login(password.toLowerCase())).status, 401);
  assert.deepEqual(f.tokenRequests, []);
  assert.equal((await f.login()).status, 503);
  assert.deepEqual(f.tokenRequests, ["password"]);
  assert.deepEqual(f.adminUpdates, []);
});
