import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260822180000_test_item_issue_closed_loop.sql",
    import.meta.url,
  ),
  "utf8",
).catch(() => "");

const functionSource = (name) =>
  migration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+workspace\\.${name}\\b[\\s\\S]*?\\$\\$;`,
      "i",
    ),
  )?.[0] ?? "";

test("unresolved linked issues force their matching test progress to Error", () => {
  const triggerFunction = functionSource("sync_unresolved_issue_to_test_progress");

  assert.match(triggerFunction, /new\.status\s+in\s*\(\s*'open'\s*,\s*'in_progress'\s*\)/i);
  assert.match(
    triggerFunction,
    /new\.project_id\s+is\s+not\s+null[\s\S]*new\.system_id\s+is\s+not\s+null[\s\S]*new\.station_id\s+is\s+not\s+null[\s\S]*new\.test_item_id\s+is\s+not\s+null/i,
  );
  assert.match(
    triggerFunction,
    /insert\s+into\s+workspace\.test_progress\s*\([\s\S]*project_id[\s\S]*system_id[\s\S]*station_id[\s\S]*item_id[\s\S]*status[\s\S]*\)[\s\S]*values\s*\([\s\S]*new\.project_id[\s\S]*new\.system_id[\s\S]*new\.station_id[\s\S]*new\.test_item_id[\s\S]*'Error'/i,
  );
  assert.match(
    triggerFunction,
    /on\s+conflict\s*\(\s*system_id\s*,\s*station_id\s*,\s*item_id\s*\)\s+do\s+update[\s\S]*status\s*=\s*'Error'/i,
  );
  assert.doesNotMatch(triggerFunction, /status\s*=\s*'Done'/i);

  assert.match(
    migration,
    /create\s+trigger\s+sync_unresolved_issue_to_test_progress[\s\S]*after\s+insert\s+or\s+update\s+of\s+status\s*,\s*project_id\s*,\s*system_id\s*,\s*station_id\s*,\s*test_item_id\s+on\s+workspace\.issues[\s\S]*execute\s+function\s+workspace\.sync_unresolved_issue_to_test_progress\s*\(\s*\)/i,
  );
});

test("resolving the final linked issue atomically clears Error to On-going", () => {
  const triggerFunction = functionSource("sync_unresolved_issue_to_test_progress");

  assert.match(
    triggerFunction,
    /elsif\s+tg_op\s*=\s*'UPDATE'[\s\S]*new\.status\s+in\s*\(\s*'resolved'\s*,\s*'closed'\s*\)[\s\S]*perform\s+pg_catalog\.pg_advisory_xact_lock\s*\([\s\S]*new\.project_id[\s\S]*new\.system_id[\s\S]*new\.station_id[\s\S]*new\.test_item_id[\s\S]*if\s+not\s+exists\s*\([\s\S]*from\s+workspace\.issues\s+as\s+issues[\s\S]*issues\.project_id\s*=\s*new\.project_id[\s\S]*issues\.system_id\s*=\s*new\.system_id[\s\S]*issues\.station_id\s*=\s*new\.station_id[\s\S]*issues\.test_item_id\s*=\s*new\.test_item_id[\s\S]*issues\.status\s+in\s*\(\s*'open'\s*,\s*'in_progress'\s*\)[\s\S]*update\s+workspace\.test_progress\s+as\s+progress[\s\S]*set\s+status\s*=\s*'On-going'[\s\S]*progress\.status\s*=\s*'Error'/i,
  );
  assert.doesNotMatch(triggerFunction, /status\s*=\s*'Done'/i);
});

test("the atomic status RPC rejects only Done while unresolved linked issues exist", () => {
  const rpcFunction = functionSource("set_test_progress_status");

  assert.match(
    rpcFunction,
    /if\s+p_status\s*=\s*'Done'\s+and\s+exists\s*\([\s\S]*from\s+workspace\.issues\s+as\s+issues[\s\S]*issues\.project_id\s*=\s*p_project_id[\s\S]*issues\.system_id\s*=\s*p_system_id[\s\S]*issues\.station_id\s*=\s*p_station_id[\s\S]*issues\.test_item_id\s*=\s*p_test_item_id[\s\S]*issues\.status\s+in\s*\(\s*'open'\s*,\s*'in_progress'\s*\)/i,
  );
  assert.match(
    rpcFunction,
    /raise\s+exception\s+using[\s\S]*errcode\s*=\s*'P0001'[\s\S]*message\s*=\s*'尚有問題未被解決'/i,
  );
  assert.match(
    rpcFunction,
    /insert\s+into\s+workspace\.test_progress[\s\S]*p_status[\s\S]*on\s+conflict\s*\(\s*system_id\s*,\s*station_id\s*,\s*item_id\s*\)\s+do\s+update[\s\S]*status\s*=\s*excluded\.status/i,
  );
});

test("the atomic status RPC persists the allowlisted UI progress payload", () => {
  const rpcFunction = functionSource("set_test_progress_status");
  const payloadFields = [
    "notes",
    "progress_percent",
    "started_at",
    "completed_at",
    "actual_hours",
    "assigned_to",
  ];

  assert.match(rpcFunction, /p_updates\s+jsonb\s+default\s+'\{\}'::jsonb/i);
  assert.match(rpcFunction, /pg_catalog\.jsonb_typeof\s*\(\s*p_updates\s*\)\s*<>\s*'object'/i);

  for (const field of payloadFields) {
    assert.match(rpcFunction, new RegExp(`p_updates\\s*\\?\\s*'${field}'`, "i"));
    assert.match(rpcFunction, new RegExp(`p_updates\\s*->>\\s*'${field}'`, "i"));
  }

  assert.match(
    rpcFunction,
    /progress_percent\s*=\s*case[\s\S]*when\s+excluded\.status\s*=\s*'Done'\s+then\s+100/i,
  );
  assert.match(
    rpcFunction,
    /completed_at\s*=\s*case[\s\S]*p_updates\s*\?\s*'completed_at'[\s\S]*progress\.completed_at[\s\S]*pg_catalog\.now\s*\(\s*\)/i,
  );
  assert.doesNotMatch(rpcFunction, /\bexecute\b/i);
});

test("closed-loop functions are hardened and exposed with least privilege", () => {
  const triggerFunction = functionSource("sync_unresolved_issue_to_test_progress");
  const rpcFunction = functionSource("set_test_progress_status");

  for (const source of [triggerFunction, rpcFunction]) {
    assert.match(source, /security\s+invoker/i);
    assert.match(source, /set\s+search_path\s*=\s*''/i);
  }

  assert.doesNotMatch(migration, /security\s+definer/i);
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/i);
  assert.doesNotMatch(migration, /pg_catalog\.integer/i);
  assert.doesNotMatch(migration, /\bpublic\.(?:issues|test_progress)\b/i);
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+workspace\.sync_unresolved_issue_to_test_progress\s*\(\s*\)\s+from\s+public/i,
  );
  assert.match(
    migration,
    /revoke\s+all\s+on\s+function\s+workspace\.set_test_progress_status\s*\(\s*uuid\s*,\s*uuid\s*,\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*jsonb\s*\)\s+from\s+public/i,
  );
  assert.match(
    migration,
    /grant\s+execute\s+on\s+function\s+workspace\.set_test_progress_status\s*\(\s*uuid\s*,\s*uuid\s*,\s*uuid\s*,\s*uuid\s*,\s*text\s*,\s*jsonb\s*\)\s+to\s+anon\s*,\s*authenticated/i,
  );
});

test("linked issue lookups have an idempotent composite index", () => {
  assert.match(
    migration,
    /create\s+index\s+if\s+not\s+exists\s+idx_issues_test_item_closed_loop\s+on\s+workspace\.issues\s*\(\s*project_id\s*,\s*system_id\s*,\s*station_id\s*,\s*test_item_id\s*,\s*status\s*\)/i,
  );
});
