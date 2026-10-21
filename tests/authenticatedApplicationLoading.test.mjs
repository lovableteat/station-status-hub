import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const appPath = resolve(root, "src/App.tsx");
const authenticatedPath = resolve(root, "src/components/auth/AuthenticatedApplication.tsx");

function createApplication(session) {
  let currentSession = session;
  let authenticatedImports = 0;
  const children = ({ children }) => children;
  const mocks = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/components/ui/toaster": { Toaster: () => null },
    "@/components/ui/sonner": { Toaster: () => null },
    "@/components/ui/tooltip": { TooltipProvider: children },
    "@tanstack/react-query": {
      QueryClient: class {},
      QueryClientProvider: children,
    },
    "@/components/auth/UserContext": {
      UserProvider: children,
      useUser: () => currentSession,
    },
    "@/components/auth/LoginPage": {
      LoginPage: () => React.createElement("form", null, "登入表單"),
    },
    "@/components/common/AppRuntimeBoundary": {
      AppLoadingScreen: ({ label = "正在載入工作平台" }) => React.createElement("p", null, label),
    },
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(appPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const load = (specifier) => {
    if (specifier === "@/components/auth/AuthenticatedApplication") {
      authenticatedImports += 1;
      return {
        __esModule: true,
        default: () => React.createElement("section", null, "已驗證工作區"),
      };
    }
    assert.ok(specifier in mocks, `the login entry unexpectedly imported ${specifier}`);
    return mocks[specifier];
  };
  runInNewContext(`(function(require,module,exports){${compiled}\n})`, {})(load, module, module.exports);
  return {
    render: () => renderToString(React.createElement(module.exports.default)),
    setSession: (session) => { currentSession = session; },
    imports: () => authenticatedImports,
  };
}

test("unverified, signed-out and upgrade-required sessions do not load private application code", async () => {
  const cases = [
    { isInitializing: true, isLoggedIn: false, requiresRealtimeUpgrade: false, text: "正在驗證安全工作階段" },
    { isInitializing: true, isLoggedIn: true, requiresRealtimeUpgrade: false, text: "正在驗證安全工作階段" },
    { isInitializing: false, isLoggedIn: false, requiresRealtimeUpgrade: false, text: "登入表單" },
    { isInitializing: false, isLoggedIn: true, requiresRealtimeUpgrade: true, text: "登入表單" },
  ];
  for (const session of cases) {
    const app = createApplication(session);
    assert.match(app.render(), new RegExp(session.text));
    await setImmediate();
    assert.equal(app.imports(), 0, JSON.stringify(session));
  }
});

test("private code loads once only after verification, with the existing loading fallback", async () => {
  const app = createApplication({ isInitializing: true, isLoggedIn: true, requiresRealtimeUpgrade: false });
  app.render();
  await setImmediate();
  assert.equal(app.imports(), 0);

  app.setSession({ isInitializing: false, isLoggedIn: true, requiresRealtimeUpgrade: false });
  assert.match(app.render(), /正在載入工作平台/);
  await setImmediate();
  assert.equal(app.imports(), 1);
  assert.match(app.render(), /已驗證工作區/);

  app.setSession({ isInitializing: false, isLoggedIn: false, requiresRealtimeUpgrade: false });
  assert.match(app.render(), /登入表單/);
  app.setSession({ isInitializing: false, isLoggedIn: true, requiresRealtimeUpgrade: false });
  assert.match(app.render(), /已驗證工作區/);
  assert.equal(app.imports(), 1);
});

test("the login entry's full static import graph cannot eagerly reimport the private shell", () => {
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || statement.importClause?.isTypeOnly || statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const base = specifier.startsWith("@/")
        ? resolve(root, "src", specifier.slice(2))
        : resolve(dirname(path), specifier);
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]
        .find((candidate) => existsSync(candidate));
      assert.ok(dependency, `missing source dependency ${specifier} from ${path}`);
      if (!dependency.endsWith(".css")) visit(dependency);
    }
  }
  visit(appPath);
  for (const privatePath of [
    authenticatedPath,
    resolve(root, "src/hooks/usePermissions.ts"),
    resolve(root, "src/hooks/useUnifiedData.ts"),
    resolve(root, "src/hooks/useUserPresence.ts"),
    resolve(root, "src/components/test-projects/TestProjectProvider.tsx"),
    resolve(root, "src/pages/Index.tsx"),
  ]) {
    assert.equal(visited.has(privatePath), false, `${privatePath} must stay behind the verified-session boundary`);
  }
});
