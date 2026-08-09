import test from "node:test";
import assert from "node:assert/strict";

import { hasWebglSupport } from "../../src/components/pcb-designer/core/webgl.ts";

test("accepts WebGL2 when the browser can create it", () => {
  const requested: string[] = [];

  const supported = hasWebglSupport((kind) => {
    requested.push(kind);
    return kind === "webgl2" ? { renderer: "webgl2" } : null;
  });

  assert.equal(supported, true);
  assert.deepEqual(requested, ["webgl2"]);
});

test("falls back to WebGL1 when WebGL2 is unavailable", () => {
  const requested: string[] = [];

  const supported = hasWebglSupport((kind) => {
    requested.push(kind);
    return kind === "webgl" ? { renderer: "webgl1" } : null;
  });

  assert.equal(supported, true);
  assert.deepEqual(requested, ["webgl2", "webgl"]);
});

test("reports unsupported WebGL without throwing when context creation fails", () => {
  assert.equal(hasWebglSupport(() => { throw new Error("context blocked"); }), false);
});
