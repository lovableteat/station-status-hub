// Release gate for dependency advisories: the same rule as `npm audit --audit-level=high` (any high or critical
// advisory fails), with one explicit, dated list of advisories that have no patched release yet. Each exception names
// the advisory and the package, says why it is acceptable, and stops applying on its date so it is reviewed again.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ADVISORY_EXCEPTIONS = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    // ReDoS through repeated extglobs. Widened on 2026-11-17 to every release (<= 4.0.7) with no patched version, which
    // blocked every deploy. picomatch is build tooling only (Vite, Tailwind, chokidar) and never reaches the browser.
    // Allowed by the repository owner on 2026-11-18 for this advisory only; upgrade and remove once a fix is released.
    until: "2026-12-31",
  },
];

const SEVERE = new Set(["high", "critical"]);

/** Splits the direct advisories of an `npm audit --json` report into blocking and excepted ones. */
export function findBlockingAdvisories(report, exceptions = ADVISORY_EXCEPTIONS, today = new Date()) {
  const blocking = [];
  const excepted = [];
  for (const [name, entry] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of entry?.via ?? []) {
      // A string names the vulnerable dependency it comes through; the advisory itself is listed on that package.
      if (!via || typeof via !== "object" || !SEVERE.has(via.severity)) continue;
      const id = String(via.url ?? "").split("/").pop();
      const exception = exceptions.find((item) => item.id === id && item.package === name && today.getTime() <= Date.parse(`${item.until}T23:59:59Z`));
      (exception ? excepted : blocking).push({ name, id, severity: via.severity, title: via.title ?? "", range: via.range ?? "" });
    }
  }
  return { blocking, excepted };
}

function main() {
  const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    // No readable report (offline registry, npm error): fail closed, as `npm audit` would.
    console.error(result.stderr || result.stdout || "npm audit produced no report");
    process.exit(1);
  }
  if (report.error) {
    console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
    process.exit(1);
  }
  const { blocking, excepted } = findBlockingAdvisories(report);
  for (const item of excepted) console.warn(`allowed until its review date: ${item.id} (${item.severity}) ${item.name} ${item.range} - ${item.title}`);
  if (blocking.length > 0) {
    for (const item of blocking) console.error(`${item.id} (${item.severity}) ${item.name} ${item.range} - ${item.title}`);
    console.error(`${blocking.length} high or critical advisories`);
    process.exit(1);
  }
  console.log(`no high or critical advisories${excepted.length > 0 ? ` (${excepted.length} allowed by a dated exception)` : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
