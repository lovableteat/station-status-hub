import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync(
  "src/components/data-center/DeploymentPlanningCenter.tsx",
  "utf8",
);
const sharedProjects = fs.readFileSync(
  "src/components/data-center/useSharedDataCenterProjects.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260731120000_registration_and_shared_data_center.sql",
  "utf8",
);

test("Data Center exposes project categories and a visible scene navigator", () => {
  assert.match(planner, /共用專案/);
  assert.match(planner, /專案分類/);
  assert.match(planner, /useState\(true\)/);
});

test("Data Center changes are debounced and never reload the page", () => {
  assert.match(sharedProjects, /1_200/);
  assert.match(sharedProjects, /postgres_changes/);
  assert.doesNotMatch(sharedProjects, /window\.location\.reload/);
  assert.doesNotMatch(planner, /window\.location\.reload/);
});

test("shared projects are protected by authenticated RLS policies", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.data_center_projects/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /can_view_data_center_projects/);
  assert.match(migration, /can_edit_data_center_projects/);
});
