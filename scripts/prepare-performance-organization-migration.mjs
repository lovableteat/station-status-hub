// Prepare a reviewable transaction. Never connects to a database.
import fs from "node:fs/promises";
const migrations = [
  "20260903120000_add_performance_organization.sql",
  "20260903130000_protect_performance_groups.sql",
];
const parts = await Promise.all(migrations.map(async (name) =>
  `-- ${name}\n${await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")}`,
));
const output = new URL("../tmp/performance-organization-deploy.sql", import.meta.url);
await fs.mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
await fs.writeFile(output, `-- Read docs/performance-organization-rollout.md before applying.\nBEGIN;\n${parts.join("\n")}\nCOMMIT;\n`);
console.log(`Prepared ${output.pathname}; no database changes applied.`);
