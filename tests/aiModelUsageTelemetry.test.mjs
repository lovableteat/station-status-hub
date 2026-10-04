import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("usage migration stores one idempotent event per real attempt behind RPC-only access", async () => {
  const sql = await read("../supabase/migrations/20261004173000_add_ai_model_usage_telemetry.sql");

  assert.match(sql, /create table workspace\.ai_model_usage_events/i);
  assert.match(sql, /event_id uuid primary key/i);
  assert.match(sql, /references workspace\.api_keys\(id\) on delete cascade/i);
  assert.match(sql, /outcome text not null default 'started'/i);
  assert.match(sql, /check \(outcome in \('started', 'succeeded', 'http_error', 'rate_limited', 'timeout', 'network_error'\)\)/i);
  assert.match(sql, /alter table workspace\.ai_model_usage_events enable row level security/i);
  assert.match(sql, /revoke all on table workspace\.ai_model_usage_events from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]+on(?: table)? workspace\.ai_model_usage_events[^;]+to authenticated/i);
  assert.match(sql, /grant all on table workspace\.ai_model_usage_events to service_role/i);

  assert.match(sql, /create or replace function workspace\.start_ai_model_usage_attempt/i);
  assert.match(sql, /create or replace function workspace\.finish_ai_model_usage_attempt/i);
  assert.match(sql, /create or replace function workspace\.get_ai_model_usage_summary/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /workspace\.current_user_can_workspace\('ai-chat', 'view'\)/i);
  assert.match(sql, /on conflict \(event_id\) do nothing/i);
  assert.match(sql, /usage_count = api_keys\.usage_count \+ 1/i);
  assert.match(sql, /last_used_at = greatest\(coalesce\(api_keys\.last_used_at, v_started_at\), v_started_at\)/i);
  assert.match(sql, /actor_user_id = v_actor/i);
  assert.match(sql, /outcome = 'started'/i);
  assert.match(sql, /permissions -> 'metadata' ->> 'provider'/i);
  assert.match(sql, /gemini-3\.5-flash-lite.*gemini-3\.8-flash.*gemini-2\.5-flash/is);
  assert.doesNotMatch(sql, /p_api_key\s+text/i);
});

test("usage summary uses rolling minute and Google Pacific day without exposing actors", async () => {
  const sql = await read("../supabase/migrations/20261004173000_add_ai_model_usage_telemetry.sql");

  assert.match(sql, /clock_timestamp\(\) - interval '60 seconds'/i);
  assert.match(sql, /America\/Los_Angeles/i);
  assert.match(sql, /tracking_started_at/i);
  assert.match(sql, /rate_limited_attempts/i);
  assert.match(sql, /timeout_attempts/i);
  assert.match(sql, /in_flight_attempts/i);
  assert.doesNotMatch(sql, /jsonb_build_object\([\s\S]*?'actor_user_id'/i);
  assert.match(sql, /revoke all on function workspace\.get_ai_model_usage_summary/i);
  assert.match(sql, /grant execute on function workspace\.get_ai_model_usage_summary[^;]+to authenticated, service_role/i);
});

test("both chat and API tests use the same tracked fetch without sending a secret to telemetry", async () => {
  const [telemetry, chat, preview] = await Promise.all([
    read("../src/components/api-management/aiUsageTelemetry.ts"),
    read("../src/components/api-management/ApiChatConsole.tsx"),
    read("../src/components/api-management/ApiDataPreview.tsx"),
  ]);

  assert.match(telemetry, /start_ai_model_usage_attempt/);
  assert.match(telemetry, /finish_ai_model_usage_attempt/);
  assert.match(telemetry, /p_event_id/);
  assert.match(telemetry, /p_api_key_id/);
  assert.match(telemetry, /rate_limited/);
  assert.match(telemetry, /timeout/);
  assert.doesNotMatch(telemetry, /p_api_key\b/);
  assert.match(chat, /trackedProviderFetch/);
  assert.match(chat, /source: "ai-chat"/);
  assert.match(preview, /trackedProviderFetch/);
  assert.match(preview, /source: "api-test"/);
});

test("quota range never claims that an incomplete project window is fully available", async () => {
  const source = await read("../src/components/api-management/aiUsageSummary.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const usage = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );

  assert.deepEqual(usage.buildObservedQuotaRange(0, 15), { min: 0, max: 15 });
  assert.deepEqual(usage.buildObservedQuotaRange(4, 15), { min: 0, max: 11 });
  assert.deepEqual(usage.buildObservedQuotaRange(20, 15), { min: 0, max: 0 });
  assert.equal(usage.classifyAiUsageOutcome({ responseOk: true, status: 200 }), "succeeded");
  assert.equal(usage.classifyAiUsageOutcome({ responseOk: false, status: 429 }), "rate_limited");
  assert.equal(usage.classifyAiUsageOutcome({ responseOk: false, status: 503 }), "http_error");
  assert.equal(usage.classifyAiUsageOutcome({ aborted: true }), "timeout");
  assert.equal(usage.classifyAiUsageOutcome({}), "network_error");

  const parsed = usage.parseAiModelUsageSummary({
    generated_at: "2026-10-04T17:30:00Z",
    tracking_started_at: "2026-10-04T17:00:00Z",
    targets: [{
      api_key_id: "00000000-0000-0000-0000-000000000001",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      minute_attempts: 2,
      pacific_day_attempts: 8,
      total_attempts: 10,
      succeeded_attempts: 7,
      rate_limited_attempts: 1,
      timeout_attempts: 1,
      failed_attempts: 2,
      in_flight_attempts: 1,
    }],
  });
  assert.equal(parsed.targets[0].pacificDayAttempts, 8);
  assert.equal(parsed.targets[0].rateLimitedAttempts, 1);
  assert.deepEqual(usage.getUsageWindowCompleteness(parsed), {
    minute: true,
    pacificDay: false,
  });
});

test("Gemini operation cards show observed usage, tracking start, and project-scope warning", async () => {
  const source = await read("../src/components/api-management/ApiKeyManagement.tsx");

  assert.match(source, /get_ai_model_usage_summary/);
  assert.match(source, /本系統已觀測/);
  assert.match(source, /估算可用範圍/);
  assert.match(source, /追蹤起點/);
  assert.match(source, /不含其他網站或 API Key/);
  assert.match(source, /近 60 秒滾動窗口/);
  assert.match(source, /America\/Los_Angeles 午夜重設/);
  assert.match(source, /輸入 TPM 未由本系統可靠計量/);
  assert.doesNotMatch(source, /本系統用量：尚未開始按模型統計/);
});
