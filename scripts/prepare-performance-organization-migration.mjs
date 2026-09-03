// Prepare a reviewable transaction. Never connects to a database.
import fs from "node:fs/promises";
const migrations = process.argv.includes("--removal-only")
  ? ["20260903160000_remove_performance_organization_members.sql"]
  : [
      "20260903120000_add_performance_organization.sql",
      "20260903130000_protect_performance_groups.sql",
      "20260903160000_remove_performance_organization_members.sql",
    ];
const parts = await Promise.all(
  migrations.map(async (name) => ({
    name,
    sql: await fs.readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  })),
);
const reviewDigest =
  "select md5(coalesce(jsonb_agg(to_jsonb(r) - array['employee_id','updated_at','privacy_scope_ids'] order by id)::text,'[]')) from workspace.performance_reviews r";
const accountDigest =
  "select md5(coalesce(jsonb_agg(jsonb_build_array(id,role,permissions) order by id)::text,'[]')) from workspace.system_users";
const preflight = `
SET LOCAL lock_timeout = '10s';
LOCK TABLE workspace.performance_reviews, workspace.system_users IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE performance_deploy_check ON COMMIT DROP AS
SELECT (${reviewDigest}) AS reviews, (${accountDigest}) AS accounts;
`;
const verification = `
DO $verify$ BEGIN
  IF (SELECT reviews FROM performance_deploy_check) IS DISTINCT FROM (${reviewDigest})
     OR (SELECT accounts FROM performance_deploy_check) IS DISTINCT FROM (${accountDigest}) THEN
    RAISE EXCEPTION 'Review content or site permissions changed unexpectedly; rolling back';
  END IF;
END $verify$;
`;
const history = parts
  .map(({ name, sql }) => {
    const version = name.slice(0, 14);
    const title = name.slice(15, -4);
    return `INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('${version}','${title}',ARRAY[$migration_source$${sql}$migration_source$]);`;
  })
  .join("\n");
const output = new URL(
  "../tmp/performance-organization-deploy.sql",
  import.meta.url,
);
await fs.mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
await fs.writeFile(
  output,
  `-- Read docs/performance-organization-rollout.md before applying.\nBEGIN;\n${preflight}\n${parts.map(({ name, sql }) => `-- ${name}\n${sql}`).join("\n")}\n${verification}\n${history}\nCOMMIT;\nSELECT 'Performance organization and privacy deployed; review content and site permissions preserved' AS result;\n`,
);
console.log(`Prepared ${output.pathname}; no database changes applied.`);
