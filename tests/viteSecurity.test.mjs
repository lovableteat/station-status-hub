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
