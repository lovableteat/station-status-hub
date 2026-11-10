import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/main.yml"), "utf8").replace(/\r\n/g, "\n");
const deployJob = workflow.slice(workflow.indexOf("\n  deploy:\n"));

test("Pages deployments queue instead of failing when two pushes land close together", () => {
  assert.match(workflow, /\nconcurrency:\n  group: pages\n  cancel-in-progress: false\n/);
});

test("a Pages deployment that fails on GitHub's side is retried twice before the run fails", () => {
  const attempts = [...deployJob.matchAll(/uses: actions\/deploy-pages@v4/g)];
  assert.equal(attempts.length, 3, "three deploy attempts");
  const step = (id) => deployJob.slice(deployJob.indexOf(`id: ${id}\n`), deployJob.indexOf("uses: actions/deploy-pages@v4", deployJob.indexOf(`id: ${id}\n`)));
  assert.match(step("deploy_1"), /continue-on-error: true/);
  assert.match(step("deploy_2"), /if: steps\.deploy_1\.outcome == 'failure'\n\s+continue-on-error: true/);
  assert.match(step("deploy_3"), /if: steps\.deploy_1\.outcome == 'failure' && steps\.deploy_2\.outcome == 'failure'\n/);
  assert.doesNotMatch(step("deploy_3"), /continue-on-error/, "the last attempt must be allowed to fail the run");
  assert.match(deployJob, /sleep 120[\s\S]*id: deploy_2[\s\S]*sleep 300[\s\S]*id: deploy_3/, "waits between attempts");
  assert.match(deployJob, /url: \$\{\{ steps\.deploy_3\.outputs\.page_url \|\| steps\.deploy_2\.outputs\.page_url \|\| steps\.deploy_1\.outputs\.page_url \}\}/);
});

test("only a manual rehearsal makes the first attempt fail on purpose", () => {
  assert.match(workflow, /workflow_dispatch:\n    inputs:\n      rehearse_retry:\n[\s\S]*?type: boolean\n        default: false\n/);
  assert.match(deployJob, /artifact_name: \$\{\{ inputs\.rehearse_retry && 'rehearsal-missing-artifact' \|\| 'github-pages' \}\}/);
  assert.match(workflow, /upload-pages-artifact@v3\n        with:\n          path: dist\n/, "the build uploads the default github-pages artifact");
});
