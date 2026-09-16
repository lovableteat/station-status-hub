import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260916100000_atomic_performance_return_notifications.sql",
  import.meta.url,
);

test("a supervisor return creates its notification in the same transaction", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /after update of status on workspace\.performance_reviews/i);
  assert.match(migration, /old\.status = 'submitted' and new\.status = 'in-progress'/i);
  assert.match(migration, /perform workspace\.ensure_performance_return_notification\(new\.id\)/i);
  assert.match(migration, /workspace\.can_manage_performance_record/i);
  assert.match(migration, /workspace\.resolve_performance_employee\(v_review\.employee_id\)/i);
});

test("return notification retry is private and idempotent", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /security definer/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /notification\.is_read = false/i);
  assert.match(migration, /notification_type = 'performance_review_returned'/i);
  assert.match(migration, /revoke all on function workspace\.ensure_performance_return_notification\(uuid\)[\s\S]*from public, anon/i);
  assert.doesNotMatch(migration, /score|manager_feedback/);
});

test("the manager UI requests the verified database notification", async () => {
  const source = await readFile(
    new URL("../src/components/performance/PerformanceAppraisalPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /rpc\(\s*"ensure_performance_return_notification"/);
  assert.match(source, /notificationError\?\.code === "PGRST202"/);
  assert.match(source, /from\("user_notifications"\)\s*\.insert/);
  assert.match(source, /!notificationRpcMissing && previous\?\.status === "submitted"/);
  assert.doesNotMatch(source, /請稍後再按一次退回/);
});
