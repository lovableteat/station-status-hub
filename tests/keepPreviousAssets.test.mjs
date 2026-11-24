import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assetReferences, filesToKeep, KEEP_BYTES, KEEP_DAYS, nextHistory } from "../scripts/keepPreviousAssets.mjs";

// 2026-11-25 (「為什麼一天到晚要我刷新…一旦開了就不准關，沒有必要就不准一直刷新」): a page opened before a deploy keeps
// loading the files of its own version, because the files of recent deployments stay beside the new build.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const day = 24 * 60 * 60 * 1000;

test("every asset a page or script refers to is found, and nothing that could leave the assets folder", () => {
  const html = '<script type="module" src="/station-status-hub/assets/index-Ab1.js"></script><link rel="modulepreload" href="./assets/CircuitChangesWorkspace-1ay.js">';
  const script = 'import("./assets/pdf.worker.min-B_f.mjs");const a="assets/../../secret.js";new URL("assets/logo-x9.png",import.meta.url)';
  assert.deepEqual(assetReferences(html), ["index-Ab1.js", "CircuitChangesWorkspace-1ay.js"]);
  assert.deepEqual(assetReferences(script), ["pdf.worker.min-B_f.mjs", "logo-x9.png"]);
});

test("files of the last days the new build does not have are kept, newest first; older ones go", () => {
  const now = Date.UTC(2026, 10, 25);
  const history = { "index-old.js": now - day, "Workspace-old.js": now - 3 * day, "ancient.js": now - (KEEP_DAYS + 1) * day, "same.js": now - day, "../x.js": now };
  const built = new Set(["same.js", "index-new.js"]);
  assert.deepEqual(filesToKeep(history, built, now), ["index-old.js", "Workspace-old.js"]);
  const next = nextHistory(history, built, ["index-old.js"], now);
  assert.deepEqual(next, { "index-old.js": now - day, "same.js": now, "index-new.js": now }, "a file not kept leaves the history; a file built now is seen now");
  assert.ok(KEEP_BYTES <= 300 * 1024 * 1024, "the whole Pages site stays well under 1 GB");
});

test("the deploy keeps the files of recent deployments before it uploads the site", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/main.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(workflow, /npm run build[\s\S]*- name: Keep the files of recent deployments\n        run: node scripts\/keepPreviousAssets\.mjs dist https:\/\/lovableteat\.github\.io\/station-status-hub\/\n      - name: Upload artifact\n/);
});
