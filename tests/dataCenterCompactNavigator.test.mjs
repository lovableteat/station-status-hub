import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../src/components/data-center/data-center.css", import.meta.url), "utf8");

test("keeps scene navigation compact and gives the model dialog a bounded scroll body", () => {
  assert.match(source, /data-testid="data-center-control-strip"/);
  assert.match(source, /data-testid="data-center-rack-search"/);
  assert.match(styles, /\.dc-dialog--models\[data-ui="dialog"\] \{ height: min\(calc\(100dvh - 32px\), 760px\)/);
  assert.match(source, /<ScrollArea key=\{view\} className="dc-model-scroll min-h-0 flex-1">/);
  assert.doesNotMatch(source, /workspace-dialog-section workspace-dialog-section--violet rounded-\[18px\]/);
  assert.doesNotMatch(source, /workspace-dialog-section workspace-dialog-section--success block rounded-\[18px\]/);
});
