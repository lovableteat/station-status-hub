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
});

test("brand positioning context stays viewport-wide when header content is max-width constrained", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(
    header,
    /<header data-mobile-app-header="true" className="platform-color-field relative/
  );
  assert.match(
    header,
    /<div className="mx-auto grid min-h-\[var\(--mobile-header-height\)\]/
  );
  assert.doesNotMatch(
    header,
    /<div className="relative mx-auto grid min-h-\[var\(--mobile-header-height\)\]/
  );
});

test("absolute branding preserves the original automatic placement of nav and account controls", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(header, /data-platform-grid-placeholder="brand"/);
  assert.doesNotMatch(header, /xl:col-start-2/);
  assert.doesNotMatch(header, /xl:col-start-3/);
});

test("workspace header pins the control group to the viewport right edge", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(header, /data-platform-controls="top-right"/);
  assert.match(header, /data-platform-grid-placeholder="controls"/);
  assert.match(
    header,
    /absolute right-\[max\(0\.625rem,env\(safe-area-inset-right\)\)\] top-1\/2[^\"]*-translate-y-1\/2/
  );
});

test("workspace header reserves the full right control width before the extra-wide breakpoint", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(
    header,
    /data-platform-grid-placeholder="controls"[\s\S]{0,160}xl:min-w-\[380px\]/,
  );
});

test("header controls use distinct semantic color families", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");
  const online = read("src/components/common/OnlineUsersIndicator.tsx");
  const mobile = read("src/components/layout/WebsiteQrButton.tsx");

  assert.match(online, /emerald-300\/10/);
  assert.match(mobile, /cyan-300\/10/);
  assert.match(header, /indigo-300\/10/);
  assert.match(header, /rose-300\/10/);
});
