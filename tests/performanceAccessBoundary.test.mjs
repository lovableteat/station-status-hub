import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("performance scores require a direct organization supervisor", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260907130000_restrict_performance_scores_to_assigned_supervisors.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /report\.manager_id = v_actor\.id/);
  assert.match(migration, /manager\.performance_role = 'manager'/);
  assert.match(migration, /manager\.org_level in \('director', 'section_chief'\)/);
  assert.match(
    migration,
    /organization\.performance_role = 'manager'[\s\S]*organization\.org_level in \('director', 'section_chief'\)/,
  );
  assert.doesNotMatch(
    migration,
    /v_actor\.role in \('admin',\s*'super_admin'\).*return true/is,
  );
});

test("performance return notifications are private to the employee", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260907130000_restrict_performance_scores_to_assigned_supervisors.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /recipient_id = workspace\.current_system_user_id\(\)/,
  );
  assert.match(
    migration,
    /notification_type <> 'performance_review_returned'[\s\S]*report\.employee_id = recipient_id[\s\S]*report\.manager_id = workspace\.current_system_user_id\(\)/,
  );
});

test("the performance UI separates organization administration from score access", async () => {
  const [page, permissions] = await Promise.all([
    readFile(
      new URL(
        "../src/components/performance/PerformanceAppraisalPage.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/hooks/usePermissions.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /isAssignedOrganizationManager/);
  assert.match(page, /canAccessOrganization = administrator \|\| canManagePerformance/);
  assert.match(page, /網站管理員不會取得成績檢視權/);
  assert.doesNotMatch(
    page,
    /canManagePerformance\s*=\s*canManageAll\s*\|\|/,
  );
  assert.match(
    permissions,
    /isPerformanceManager\s*=\s*\n?\s*accountActive && permissionSettings\.performanceManager === true/,
  );
});
