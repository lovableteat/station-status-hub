import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all interactive window primitives share the platform dialog surface", async () => {
  const [styles, dialog, alertDialog, sheet, drawer, mobileDialog] = await Promise.all([
    read("../src/index.css"),
    read("../src/components/ui/dialog.tsx"),
    read("../src/components/ui/alert-dialog.tsx"),
    read("../src/components/ui/sheet.tsx"),
    read("../src/components/ui/drawer.tsx"),
    read("../src/components/ui/mobile-dialog.tsx"),
  ]);

  assert.match(styles, /\.workspace-dialog-surface/);
  assert.match(styles, /\.workspace-dialog-section--info/);
  assert.match(styles, /\.workspace-dialog-section--success/);
  assert.match(styles, /\.workspace-dialog-section--warning/);
  assert.match(styles, /\.workspace-dialog-section--violet/);
  assert.match(styles, /\.workspace-dialog-section--danger/);

  for (const primitive of [dialog, alertDialog, sheet, drawer, mobileDialog]) {
    assert.match(primitive, /workspace-dialog-surface/);
  }
});

test("Data Center dialogs encode project, facility, thermal, and power areas with distinct tones", async () => {
  const source = await read("../src/components/data-center/DeploymentPlanningCenter.tsx");

  assert.match(source, /data-dialog-tone="project-manager"/);
  assert.match(source, /data-dialog-tone="facility-planner"/);
  assert.match(source, /data-section-tone="facility-size"/);
  assert.match(source, /data-section-tone="thermal-aisles"/);
  assert.match(source, /data-section-tone=\{aisle\.kind === "cold" \? "cold-aisle" : "hot-aisle"\}/);
  assert.match(source, /data-section-tone="power-routing"/);
  assert.match(source, /workspace-dialog-section--violet/);
  assert.match(source, /workspace-dialog-section--warning/);
});

test("PCB settings and admin collaboration panels use semantic accents instead of one blue surface", async () => {
  const [pcbDialogs, pcbStyles, adminCollaboration] = await Promise.all([
    read("../src/components/pcb-designer/PcbDialogs.tsx"),
    read("../src/components/pcb-designer/pcb-designer.css"),
    read("../src/components/collaboration/AdminCollaborationPanel.tsx"),
  ]);

  assert.match(pcbDialogs, /dialog\?\.kind === "project-settings"[\s\S]*"project-settings"/);
  assert.match(pcbDialogs, /data-pcb-dialog-form=\{dialog\.kind\}/);
  assert.match(pcbDialogs, /data-pcb-field-tone="identity"/);
  assert.match(pcbDialogs, /data-pcb-field-tone="dimensions"/);
  assert.match(pcbDialogs, /data-pcb-field-tone=\{values\.status \|\| "draft"\}/);
  assert.match(pcbDialogs, /data-pcb-project-footer/);
  assert.match(pcbDialogs, /workspace-dialog-section--violet/);
  assert.match(pcbStyles, /\[data-pcb-dialog-form="project-settings"\]/);
  assert.match(pcbStyles, /\[data-pcb-field-tone="draft"\]/);
  assert.match(pcbStyles, /\[data-pcb-project-footer\]/);
  assert.match(adminCollaboration, /surface-accent--teal/);
  assert.match(adminCollaboration, /surface-accent--green/);
  assert.match(adminCollaboration, /surface-accent--violet/);
});
