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
