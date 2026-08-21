import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("platform logo is a shared vector mark across authenticated and login surfaces", () => {
  const logo = read("src/components/brand/PlatformLogoMark.tsx");
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");
  const login = read("src/components/auth/LoginPage.tsx");

  assert.match(logo, /data-testid=\"platform-logo-mark\"/);
  assert.match(logo, /<svg[\s\S]*viewBox=\"0 0 48 48\"/);
  assert.match(logo, /strokeLinecap=\"round\"/);
  assert.match(header, /from \"@\/components\/brand\/PlatformLogoMark\"/);
  assert.match(login, /from \"@\/components\/brand\/PlatformLogoMark\"/);
  assert.doesNotMatch(header, />S<\/span>/);
  assert.doesNotMatch(login, />S<\/div>/);
});

test("workspace header pins the shared brand to the top-left without changing the nav contract", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(header, /data-platform-brand="top-left"/);
  assert.match(header, /relative(?:\s+\S+)*\s+grid min-h-\[var\(--mobile-header-height\)\]/);
  assert.match(header, /left-\[max\(0\.625rem,env\(safe-area-inset-left\)\)\]/);
  assert.match(header, /top-1\/2[^\"]*-translate-y-1\/2/);
  assert.match(header, /xl:col-start-2/);
  assert.match(header, /xl:col-start-3/);
});
