# Vite and Rollup Security Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reachable Vite 5.4.10 and Rollup 4.24.0 dependency graph with the smallest officially supported patched Vite 6 graph while preserving the application's existing development-server and build behavior.

**Architecture:** Treat dependency versions, lockfile integrity, peer compatibility, and the current Vite configuration as an executable security contract. Pin Vite 6.4.3 and the minimum compatible plugins, force Rollup 4.59.0 through npm overrides, and leave `vite.config.ts` unchanged.

**Tech Stack:** npm lockfile v3, Vite 6.4.3, Rollup 4.59.0, React 18.3.1, SWC, Node 24, Node test runner, Playwright.

## Global Constraints

- `GHSA-fx2h-pf6j-xcff` affects Vite through 6.4.2; use exact Vite 6.4.3.
- `GHSA-mw96-cpmx-2vgc` affects Rollup 4 before 4.59.0; use exact Rollup 4.59.0 through `overrides`.
- Use exact `@vitejs/plugin-react-swc` 3.7.2 and `lovable-tagger` 1.1.10, the minimum queried releases whose peer ranges include Vite 6.
- Preserve `server.host: "::"`, port 8080, base path, worker format, build target, plugin activation, and application behavior.
- Do not use `npm audit fix --force`, perform blanket upgrades, alter firewall or production security settings, change SQL or migrations, merge, or deploy.

---

### Task 1: Executable dependency and configuration contract

**Files:**
- Create: `tests/viteSecurity.test.mjs`

**Interfaces:**
- Consumes: `package.json`, `package-lock.json`, installed package metadata, and the source contract in `vite.config.ts`.
- Produces: a focused regression contract that fails for vulnerable versions and verifies the existing Vite configuration remains unchanged.

- [ ] **Step 1: Write the failing security contract**

Create `tests/viteSecurity.test.mjs` with this behavior:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = (url) => readFile(url, "utf8").then(JSON.parse);
const rootPackageUrl = new URL("../package.json", import.meta.url);
const lockfileUrl = new URL("../package-lock.json", import.meta.url);
const viteConfigUrl = new URL("../vite.config.ts", import.meta.url);

test("pins the supported patched Vite and Rollup graph with integrity", async () => {
  const [manifest, lockfile, vitePackage, rollupPackage, reactSwcPackage, taggerPackage] =
    await Promise.all([
      readJson(rootPackageUrl),
      readJson(lockfileUrl),
      readJson(new URL("../node_modules/vite/package.json", import.meta.url)),
      readJson(new URL("../node_modules/rollup/package.json", import.meta.url)),
      readJson(new URL("../node_modules/@vitejs/plugin-react-swc/package.json", import.meta.url)),
      readJson(new URL("../node_modules/lovable-tagger/package.json", import.meta.url)),
    ]);

  assert.equal(manifest.devDependencies.vite, "6.4.3");
  assert.equal(manifest.devDependencies["@vitejs/plugin-react-swc"], "3.7.2");
  assert.equal(manifest.devDependencies["lovable-tagger"], "1.1.10");
  assert.equal(manifest.overrides?.rollup, "4.59.0");
  assert.equal(lockfile.packages[""].devDependencies.vite, "6.4.3");
  assert.equal(lockfile.packages[""].devDependencies["@vitejs/plugin-react-swc"], "3.7.2");
  assert.equal(lockfile.packages[""].devDependencies["lovable-tagger"], "1.1.10");
  assert.deepEqual(
    [vitePackage.version, rollupPackage.version, reactSwcPackage.version, taggerPackage.version],
    ["6.4.3", "4.59.0", "3.7.2", "1.1.10"],
  );

  for (const packageName of ["vite", "rollup", "@vitejs/plugin-react-swc", "lovable-tagger"]) {
    assert.match(
      lockfile.packages[`node_modules/${packageName}`].integrity,
      /^sha512-[A-Za-z0-9+/]+={0,2}$/,
    );
  }
});

test("retains the intended Vite server, Pages, build, worker, and plugin source contract", async () => {
  const source = await readFile(viteConfigUrl, "utf8");

  assert.match(source, /base:\s*"\/station-status-hub\/"/);
  assert.match(source, /server:\s*\{\s*host:\s*"::",\s*port:\s*8080,\s*\}/s);
  assert.match(source, /worker:\s*\{\s*format:\s*"es",\s*\}/s);
  assert.match(source, /optimizeDeps:\s*\{\s*exclude:\s*\["occt-wasm"\],\s*\}/s);
  assert.match(source, /build:\s*\{\s*target:\s*"es2020",\s*\}/s);
  assert.match(source, /plugins:\s*\[react\(\),\s*mode === "development" && componentTagger\(\)\]/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/viteSecurity.test.mjs`

Expected: the version contract fails because Vite is 5.4.10, Rollup is 4.24.0, the React SWC plugin is 3.7.1, and lovable-tagger is 1.1.7. The configuration test should pass.

---

### Task 2: Minimal compatible dependency upgrade

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/viteSecurity.test.mjs`

**Interfaces:**
- Consumes: the exact version and configuration contract from Task 1.
- Produces: a reproducible Vite 6.4.3 graph with Rollup 4.59.0 and valid Vite plugin peers.

- [ ] **Step 1: Patch only the required manifest entries**

Set these exact values in `package.json`:

```json
{
  "devDependencies": {
    "@vitejs/plugin-react-swc": "3.7.2",
    "lovable-tagger": "1.1.10",
    "vite": "6.4.3"
  },
  "overrides": {
    "rollup": "4.59.0"
  }
}
```

Keep every other manifest entry unchanged.

- [ ] **Step 2: Regenerate only the compatible lock graph**

Run: `npm install --legacy-peer-deps`

Expected: the lockfile resolves Vite 6.4.3, Rollup 4.59.0, React SWC plugin 3.7.2, and lovable-tagger 1.1.10 with SHA-512 integrity.

- [ ] **Step 3: Verify GREEN and peer validity**

Run: `node --test tests/viteSecurity.test.mjs`

Run: `npm ls vite rollup @vitejs/plugin-react-swc lovable-tagger --depth=1`

Expected: both security/configuration tests pass and `npm ls` exits zero without invalid peer markers.

- [ ] **Step 4: Verify target advisories are absent**

Run: `npm audit --json`

Expected: neither `GHSA-fx2h-pf6j-xcff` nor `GHSA-mw96-cpmx-2vgc` appears. Unrelated advisories are counted and reported separately.

---

### Task 3: Full regression and delivery

**Files:**
- Modify only if a Vite 6-specific failure is proven: files already listed in Tasks 1-2.

**Interfaces:**
- Consumes: the patched dependency graph.
- Produces: complete local, browser, CI, code-review, commit, and draft-PR evidence.

- [ ] **Step 1: Run repository verification**

Run:

```text
npm test
npm run typecheck
npm run build
npm run lint
git diff --check
```

Expected: all 1030 unit tests, both TypeScript projects, the production build, and whitespace validation pass. Lint is compared with the existing 99-error/38-warning baseline and not broadened into this repair.

- [ ] **Step 2: Run isolated integration and browser regressions**

With `AUDIT_QA_DIR` pointing to the existing isolated QA dependencies, run:

```text
node --test tests/audit*.integration.cjs
node tests/auditHistory.browser.cjs
node tests/auditPermissionsDialog.browser.cjs
node tests/auditShortLandscape.browser.cjs
```

Expected: all integrations and real-Chromium scenarios pass without production data or production mutations.

- [ ] **Step 3: Review the exact diff**

Confirm the diff contains only the manifest, lockfile, focused security test, design, and plan. Request independent review and resolve every Critical or Important finding.

- [ ] **Step 4: Commit and publish for independent merge review**

Commit the verified scope, push `repair/vite-security-20261003`, and create a draft pull request targeting `main`. Report the exact head and all checks. Do not merge or deploy.
