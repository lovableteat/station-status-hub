import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("project command bar exposes the existing add-system workflow to editors", async () => {
  const scopeBar = await read("../src/components/test-projects/ProjectScopeBar.tsx");
  const systemManager = await read("../src/components/test-tracker/SystemManager.tsx");

  assert.match(scopeBar, /import \{ SystemManager \}/);
  assert.match(scopeBar, /canEditModule\("test-tracker"\)/);
  assert.match(scopeBar, /activeProject && canCreateSystems/);
  assert.match(scopeBar, /<SystemManager[\s\S]*?onSystemUpdate=\{refreshProjects\}/);
  assert.match(scopeBar, />新增機台</);
  assert.match(systemManager, /trigger\?: ReactNode/);
  assert.match(systemManager, /trigger \?\?/);
});
