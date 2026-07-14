import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const flowSource = readFileSync(new URL("./FlowInfo.tsx", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../pages/Index.tsx", import.meta.url), "utf8");

test("flow editor fills the maintenance content height without viewport subtraction", () => {
  assert.match(flowSource, /maintenance-page flex h-full min-h-0 flex-col gap-3/);
  assert.match(flowSource, /className="min-h-\[470px\] flex-1 overflow-hidden/);
  assert.doesNotMatch(flowSource, /h-\[calc\(100vh-286px\)\]/);
  assert.match(indexSource, /activeStationModule === "flow-info" && "h-full min-h-0"/);
});
