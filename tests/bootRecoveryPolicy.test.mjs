import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const bootScript = indexSource.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture({ ready = false, storageBlocked = false } = {}) {
  const events = new Map(), timers = [], replacements = [], storage = new Map();
  let writes = 0;
  const root = { children: [], get innerHTML() { return "memory-only draft"; }, set innerHTML(value) { writes++; this.fallback = value; } };
  const window = {
    __STATION_APP_READY__: ready,
    location: { href: "https://fixture.invalid/app/?workspace=pcb-designer#/?project=A", replace: url => replacements.push(url) },
    sessionStorage: {
      getItem: key => { if (storageBlocked) throw new Error("blocked"); return storage.get(key) ?? null; },
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    addEventListener: (name, callback) => events.set(name, callback), setTimeout: callback => timers.push(callback),
  };
  runInNewContext(bootScript, { window, document: { getElementById: () => root }, URL, Date, console: { error() {}, warn() {} } });
  return { window, storage, replacements, root, get writes() { return writes; }, emit: (name, event = {}) => events.get(name)?.(event), tick: () => { while (timers.length) timers.shift()(); } };
}

test("slow startup shows recovery without repeatedly reloading", () => {
  const f = fixture(); f.tick();
  assert.equal(f.writes, 1); assert.equal(f.replacements.length, 0);
});

test("initial entry asset failure retries once and preserves route/query", () => {
  const f = fixture();
  const error = { target: { tagName: "SCRIPT", src: "https://fixture.invalid/assets/index-old.js" } };
  f.emit("error", error); f.emit("error", error);
  assert.equal(f.replacements.length, 1); assert.equal(f.writes, 1);
  const url = new URL(f.replacements[0]);
  assert.equal(url.searchParams.get("workspace"), "pcb-designer"); assert.equal(url.hash, "#/?project=A");
});

test("a mounted application never reloads or overwrites root after preload/resource/runtime errors", () => {
  for (const storageBlocked of [false, true]) {
    const f = fixture({ ready: true, storageBlocked }); let prevented = false;
    f.emit("vite:preloadError", { preventDefault: () => { prevented = true; }, payload: new Error("Failed to fetch dynamically imported module") });
    f.emit("error", { target: { tagName: "SCRIPT", src: "https://fixture.invalid/assets/index-old.js" } });
    f.emit("error", { error: new Error("offline") });
    f.emit("unhandledrejection", { reason: new Error("offline") });
    f.window.__STATION_MANUAL_RELOAD__(); f.tick();
    assert.equal(prevented, false, "local recoverable imports must receive their failure");
    assert.equal(f.replacements.length, 0); assert.equal(f.writes, 0); assert.equal(f.storage.size, 0);
  }
});

test("readiness is monotonic even when an old timer or error callback runs later", () => {
  const f = fixture(); f.emit("station-app-ready"); f.tick();
  f.emit("vite:preloadError", { preventDefault() { throw new Error("must not intercept"); } });
  assert.equal(f.writes, 0); assert.equal(f.replacements.length, 0);
});

test("blocked boot storage offers manual recovery without auto-reload", () => {
  const f = fixture({ storageBlocked: true });
  f.emit("vite:preloadError", { preventDefault() {}, payload: new Error("offline") });
  assert.equal(f.replacements.length, 0); assert.equal(f.writes, 1);
});

test("every application lazy import uses local recovery rather than the global render boundary", async () => {
  const paths = ["App.tsx", "pages/Index.tsx", "components/auth/AuthenticatedApplication.tsx", "components/material-requests/MaterialRequestPage.tsx", "components/material-requests/BomVersionCenter.tsx", "components/comparison/ComparisonWorkspace.tsx", "components/pcb-designer/PcbDesignerWorkspace.tsx", "components/test-tracker/TestTracker.tsx"];
  for (const path of paths) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:React\.)?\blazy\(/, path);
    assert.match(source, /recoverableLazy\(/, path);
  }
  const boundary = await readFile(new URL("../src/components/common/AppRuntimeBoundary.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(boundary, /location\.|removeItem|setItem|retrying/);
});
