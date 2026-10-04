// Execute the actual usage migration and RPCs in an isolated PostgreSQL runtime.
// node tests/aiModelUsageTelemetry.integration.mjs <path-to-pglite-package>
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = path.resolve(
  process.argv[2] || "node_modules/@electric-sql/pglite",
);
const { PGlite } = await import(
  pathToFileURL(path.join(packageDir, "dist/index.js"))
);
const db = await PGlite.create();
const migration = await fs.readFile(
  new URL(
    "../supabase/migrations/20261004174305_add_ai_model_usage_telemetry.sql",
    import.meta.url,
  ),
  "utf8",
);
const actorIndexMigration = await fs.readFile(
  new URL(
    "../supabase/migrations/20261004174455_index_ai_model_usage_actor.sql",
    import.meta.url,
  ),
  "utf8",
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log(`PASS ${label}`);
};
const rejects = async (fn, pattern, label) => {
  await assert.rejects(fn, pattern);
  checks++;
  console.log(`PASS ${label}`);
};
const actor = async (n, allowed = true) => {
  await db.exec("reset role; set role authenticated");
  await query(
    "select set_config('test.user_id',$1,false), set_config('test.ai_allowed',$2,false)",
    [id(n), String(allowed)],
  );
};
const root = () => db.exec("reset role");
const start = (event, model = "gemini-3.5-flash-lite", attempt = 1) =>
  query(
    "select workspace.start_ai_model_usage_attempt($1,$2,'gemini',$3,'ai-chat',$4) as result",
    [id(event), id(100), model, attempt],
  );
const finish = (event, outcome, status = null, duration = 100) =>
  query(
    "select workspace.finish_ai_model_usage_attempt($1,$2,$3,$4) as result",
    [id(event), outcome, status, duration],
  );

try {
  await db.exec(`
    create schema workspace;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema workspace to anon, authenticated, service_role;

    create table workspace.system_users (
      id uuid primary key,
      username text unique,
      status text not null default 'active'
    );
    create table workspace.api_keys (
      id uuid primary key,
      permissions jsonb not null default '{}'::jsonb,
      is_active boolean not null default true,
      expires_at timestamptz,
      usage_count integer not null default 0,
      last_used_at timestamptz,
      updated_at timestamptz not null default clock_timestamp()
    );
    create function workspace.current_system_user_id()
      returns uuid language sql stable security definer set search_path=''
      as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create function workspace.current_user_can_workspace(text, text)
      returns boolean language sql stable security definer set search_path=''
      as $$ select coalesce(current_setting('test.ai_allowed', true), 'false')::boolean $$;
  `);
  await query(
    "insert into workspace.system_users(id,username) values ($1,'one'),($2,'two')",
    [id(1), id(2)],
  );
  await query(
    `insert into workspace.api_keys(id,permissions) values ($1,$2::jsonb)`,
    [
      id(100),
      JSON.stringify({
        metadata: {
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
      }),
    ],
  );

  await db.exec(migration);
  await db.exec(actorIndexMigration);
  await actor(1);

  await rejects(
    () => query("select count(*) from workspace.ai_model_usage_events"),
    /permission denied/,
    "authenticated users cannot read raw usage events",
  );
  check(
    (
      await root().then(() =>
        query(
          "select relrowsecurity from pg_class where oid='workspace.ai_model_usage_events'::regclass",
        ),
      )
    )[0].relrowsecurity,
    true,
    "usage event table has RLS enabled",
  );

  await actor(1);
  check((await start(1))[0].result.duplicate, false, "first event starts once");
  check((await start(1))[0].result.duplicate, true, "same event retry is idempotent");
  check(
    Number((await root().then(() => query("select usage_count from workspace.api_keys where id=$1", [id(100)])))[0].usage_count),
    1,
    "idempotent event increments legacy usage once",
  );

  await actor(1);
  await Promise.all([start(2, "gemini-3.5-flash-lite", 2), start(3, "gemini-3.5-flash-lite", 3)]);
  await finish(1, "succeeded", 200, 90);
  await finish(2, "rate_limited", 429, 120);
  await finish(3, "timeout", null, 120000);

  await start(4, "gemini-3.8-flash", 1);
  await finish(4, "http_error", 503, 80);

  await start(5, "gemini-3.5-flash-lite", 4);
  await actor(2);
  await rejects(
    () => finish(5, "succeeded", 200, 50),
    /usage event was not found/,
    "one user cannot finish another user's in-flight event",
  );
  await start(6, "gemini-3.5-flash-lite", 1);
  await finish(6, "network_error", null, 20);

  await actor(1);
  await finish(5, "succeeded", 200, 50);
  const summary = (
    await query("select workspace.get_ai_model_usage_summary(array[$1]::uuid[]) as result", [id(100)])
  )[0].result;
  const lite = summary.targets.find((target) => target.model === "gemini-3.5-flash-lite");
  const flash = summary.targets.find((target) => target.model === "gemini-3.8-flash");
  check(
    {
      total: lite.total_attempts,
      succeeded: lite.succeeded_attempts,
      limited: lite.rate_limited_attempts,
      timeout: lite.timeout_attempts,
      failed: lite.failed_attempts,
      inFlight: lite.in_flight_attempts,
    },
    { total: 5, succeeded: 2, limited: 1, timeout: 1, failed: 3, inFlight: 0 },
    "summary combines cross-user outcomes without overwriting attempts",
  );
  check(
    { total: flash.total_attempts, failed: flash.failed_attempts },
    { total: 1, failed: 1 },
    "summary keeps model targets independent",
  );
  check(
    [summary.tracking_started_at !== null, summary.pacific_day_started_at !== null],
    [true, true],
    "summary exposes tracking and Pacific reset boundaries",
  );

  await actor(1, false);
  await rejects(
    () => start(7),
    /requires AI workspace access/,
    "users without AI workspace access cannot record events",
  );
  await actor(1);
  await rejects(
    () => start(8, "gemini-pro"),
    /API key is unavailable/,
    "unapproved Gemini models cannot enter usage telemetry",
  );

  await root();
  check(
    Number((await query("select usage_count from workspace.api_keys where id=$1", [id(100)]))[0].usage_count),
    6,
    "concurrent and cross-user attempts increment the shared legacy count atomically",
  );

  console.log(`PASS ai model usage telemetry integration (${checks} checks)`);
} finally {
  await db.close();
}
