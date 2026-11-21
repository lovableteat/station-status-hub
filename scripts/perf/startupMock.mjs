// Measurement-only stand-in for the Supabase client (see docs/performance-startup.md): the isolated mock of the phone
// audits plus a signed-in session and a fixed latency per call, so a production build can be timed end to end without
// a real account or real data. Every call is logged with its start and end in window.__PERF_CALLS__; calls that wait
// for each other show up as intervals that do not overlap. Never part of a deployed build.
import { supabase as base, SUPABASE_URL as BASE_URL } from "../../tests/support/mobileAppMock.mjs";

const LATENCY = Number(new URLSearchParams(window.location.search).get("perfLatency") ?? 80);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
window.__PERF_CALLS__ = [];
const record = (label) => {
  const entry = { label, start: performance.now(), end: null };
  window.__PERF_CALLS__.push(entry);
  return () => { entry.end = performance.now(); };
};

function wrapQuery(table) {
  const query = base.from(table);
  const steps = [];
  const wrapper = new Proxy({}, {
    get(_, key) {
      if (key === "then") {
        return (resolve, reject) => {
          const done = record(`from:${table} ${steps.join(".")}`);
          return wait(LATENCY).then(() => query.then((value) => { done(); return value; })).then(resolve, reject);
        };
      }
      return (...args) => {
        if (typeof key === "string" && ["select", "insert", "update", "upsert", "delete"].includes(key)) steps.push(key);
        const result = query[key](...args);
        return result === query ? wrapper : result;
      };
    },
  });
  return wrapper;
}

const stamp = "2026-10-02T09:00:00Z";
// The roster RPC's exact columns (src/lib/systemUserProfiles.ts rejects any other shape).
const profile = (row) => ({
  id: row.id, username: row.username, display_name: row.display_name ?? null, role: row.role, status: row.status ?? "active", permissions: row.permissions ?? {},
  created_by: row.created_by ?? null, created_at: row.created_at ?? stamp, updated_at: row.updated_at ?? stamp, registration_requested_at: null, approved_at: null, approved_by: null,
  auth_user_id: row.auth_user_id ?? null, auth_migrated_at: null, last_seen_at: row.last_seen_at ?? null, avatar_path: row.avatar_path ?? null,
});
const me = profile({ id: "demo-admin", username: "operator7", display_name: "Operator 7", role: "admin", auth_user_id: "perf-auth-user" });
const session = {
  access_token: "perf-token", refresh_token: "perf-refresh", token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "perf-auth-user", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" },
};

async function runRpc(name, args) {
  if (name === "get_current_system_user") {
    return { data: [{ user_id: "demo-admin", username: "operator7", role: "admin", display_name: "Operator 7", avatar_path: null }], error: null };
  }
  if (name === "list_system_user_profiles") return { data: [me, ...window.__AUDIT_DB__.system_users.map(profile)], error: null };
  return base.rpc(name, args);
}

// rpc() is chainable in the real client (.eq().maybeSingle(), .order()): a thenable builder, one latency per await.
function rpc(name, args = {}) {
  const filters = [];
  let single = false;
  const builder = new Proxy({}, {
    get(_, key) {
      if (key === "then") {
        return (resolve, reject) => {
          const done = record(`rpc:${name}`);
          return wait(LATENCY).then(() => runRpc(name, args)).then((result) => {
            done();
            if (result.error || !Array.isArray(result.data)) return result;
            const rows = result.data.filter((row) => filters.every((filter) => filter(row)));
            return { ...result, data: single ? (rows[0] ?? null) : rows };
          }, (error) => { done(); throw error; }).then(resolve, reject);
        };
      }
      if (key === "eq") return (column, value) => { filters.push((row) => row[column] === value); return builder; };
      if (key === "in") return (column, values) => { filters.push((row) => values.includes(row[column])); return builder; };
      if (key === "single" || key === "maybeSingle") return () => { single = true; return builder; };
      return () => builder;
    },
  });
  return builder;
}

export const SUPABASE_URL = BASE_URL;
export const supabase = {
  ...base,
  from: wrapQuery,
  schema: () => supabase,
  rpc,
  auth: {
    ...base.auth,
    // Reading the stored session is local in the real client: no latency.
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => { const done = record("auth:getUser"); await wait(LATENCY); done(); return { data: { user: session.user }, error: null }; },
    onAuthStateChange: (callback) => { setTimeout(() => callback("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
  },
  functions: { invoke: async (name) => { const done = record(`fn:${name}`); await wait(LATENCY); done(); return { data: [], error: null }; } },
};
