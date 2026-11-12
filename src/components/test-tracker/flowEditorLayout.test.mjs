import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flowSource = readFileSync(new URL("./FlowInfo.tsx", import.meta.url), "utf8");
const shellStyles = readFileSync(new URL("../maintenance/maintenanceShell.css", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../pages/Index.tsx", import.meta.url), "utf8");

test("flow editor fills the maintenance content height without viewport subtraction", () => {
  assert.match(flowSource, /maintenance-page flex h-full min-h-0 flex-col gap-3/);
  assert.match(flowSource, /className="min-h-\[470px\] flex-1 overflow-hidden/);
  assert.doesNotMatch(flowSource, /h-\[calc\(100vh-286px\)\]/);
  assert.match(indexSource, /className="maintenance-shell-module"\s+data-module=\{activeStationModule\}/);
  // The responsive shell now owns the module height instead of an inline Tailwind class.
  assert.match(shellStyles, /\.maintenance-shell-module\s*\{[^}]*min-height:\s*0;/);
  assert.match(shellStyles, /@media \(min-width: 1024px\)\s*\{[^}]*\.maintenance-shell-module:is\(\[data-module="issues"\], \[data-module="flow-info"\]\)\s*\{\s*height:\s*100%;/);
});
