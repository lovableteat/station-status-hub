import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("tools workspace exposes global and current-workspace scope controls", () => {
  const source = read("src/components/tools/ToolsManagement.tsx");

  assert.match(source, /type AssetScopeFilter = "all" \| "global" \| "workspace"/);
  assert.match(source, /workspaceKey = "station-status"/);
  assert.match(source, /通用工具/);
  assert.match(source, /目前 workspace 專用/);
  assert.match(source, /owner_workspace/);
  assert.match(source, /scope: toolDraft\.is_global \? "global" : "workspace"/);
  assert.match(source, /這是通用項目/);
});

test("file uploads persist the selected asset scope", () => {
  const source = read("src/components/tools/FileUploadDialog.tsx");

  assert.match(source, /workspaceKey: string/);
  assert.match(source, /const \[isGlobal, setIsGlobal\]/);
  assert.match(source, /scope: isGlobal \? "global" : "workspace"/);
  assert.match(source, /owner_workspace: isGlobal \? null : workspaceKey/);
  assert.match(source, /通用檔案/);
});

test("code and command libraries support common items and scope filters", () => {
  for (const path of [
    "src/components/tools/CodeStorageManager.tsx",
    "src/components/tools/CommandLibrary.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /workspaceKey = "station-status"/);
    assert.match(source, /owner_workspace/);
    assert.match(source, /scope/);
    assert.match(source, /通用/);
    assert.match(source, /目前 workspace/);
  }
});

test("generated Supabase types include asset scope metadata", () => {
  const source = read("src/integrations/supabase/types.ts");

  for (const table of ["code_snippets", "command_library", "tools_management"]) {
    const tableStart = source.indexOf(`${table}: {`);
    assert.notEqual(tableStart, -1, `${table} table type missing`);
    const nextTable = source.indexOf("      }\n      ", tableStart + table.length + 3);
    const tableSource = source.slice(tableStart, nextTable === -1 ? undefined : nextTable);
    assert.match(tableSource, /scope:/, `${table} scope type missing`);
    assert.match(tableSource, /owner_workspace:/, `${table} owner_workspace type missing`);
  }
});
