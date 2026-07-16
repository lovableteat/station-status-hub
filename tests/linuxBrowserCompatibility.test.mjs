import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(
  new URL("../vite.config.ts", import.meta.url),
  "utf8"
);

test("production bundles target Linux-compatible browsers", () => {
  assert.doesNotMatch(
    viteConfig,
    /target:\s*["']esnext["']/,
    "esnext leaves unsupported syntax in bundles and can blank older Linux browsers"
  );
  assert.match(viteConfig, /target:\s*["']es2020["']/);
});
