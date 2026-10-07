import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync("src/components/data-center/DeploymentPlanningCenter.tsx", "utf8");
const css = readFileSync("src/components/data-center/data-center.css", "utf8");

test("overview returns to the scene instead of opening a settings dialog", () => {
  const body = source.match(/const openSceneOverview = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(body, "the overview action must have one explicit handler");
  const calls = [];
  vm.runInNewContext(body[1], Object.fromEntries(
    ["changeView", "setWorkspaceMode", "setMobileLeftOpen", "setMobileRightOpen", "requestCamera"].map(name =>
      [name, value => calls.push([name, value])]),
  ));
  assert.ok(calls.some(([name, value]) => name === "changeView" && value === false));
  assert.ok(calls.some(([name, value]) => name === "setWorkspaceMode" && value === "3d"));
  assert.ok(calls.some(([name, value]) => name === "setMobileLeftOpen" && value === false));
  assert.ok(!calls.some(([name, value]) => name.endsWith("Open") && value === true));
  assert.match(source, /id: "scene"[^\n]+onClick: openSceneOverview/);
});

test("purpose and mobile control names are visible without hover", () => {
  assert.match(source, /data-testid="data-center-task-guide"/);
  assert.match(source, /先選專案與站點/);
  assert.match(source, /查看與回報/);
  assert.match(source, /配置工具/);
  const controls = source.slice(source.indexOf('data-mobile-data-center-controls="true"'), source.indexOf('<Dialog open={mobileLeftOpen}'));
  assert.match(controls, /label: "專案站點"/);
  assert.match(controls, /label: "機櫃設備"/);
  assert.match(controls, /label: "模型庫"/);
  assert.match(controls, /<span className="dc-mobile-action-label">\{action.label\}<\/span>/);
  assert.doesNotMatch(controls, /className="sr-only"/);
});

test("settings dialogs expose one title and have scoped geometry", () => {
  assert.match(source, /<DialogTitle>專案與站點<\/DialogTitle>/);
  assert.match(source, /<SceneNavigator[^>]+hideHeader/);
  assert.match(source, /<DialogTitle>機櫃與設備<\/DialogTitle>/);
  assert.match(source, /<RackInspector[^>]+hideHeader/);
  assert.match(css, /\.dc-dialog\[data-ui="dialog"\][\s\S]*?padding: 0;/);
  assert.match(css, /\.dc-dialog\[data-ui="dialog"\][\s\S]*?max-height: min\(calc\(100dvh - 32px\), 860px\)/);
  assert.ok(css.includes('width: min(calc(100vw - 32px), var(--dc-dialog-width, 680px))'), "shared sm:w must not stretch every dialog to the full viewport");
  for (const file of ["DeploymentPlanningCenter", "DataCenterModelViewer", "FacilityAisleCreationDialog"]) {
    const component = readFileSync(`src/components/data-center/${file}.tsx`, "utf8");
    const dialogs = component.match(/<DialogContent\b[^>]*>/g) ?? [];
    assert.ok(dialogs.length > 0);
    assert.ok(dialogs.every(tag => /dc-dialog/.test(tag)), `${file} must opt in to the same dialog contract`);
  }
});

test("opening model or project management does not leave the selector underneath", () => {
  for (const name of ["openModelLibrary", "openProjectManager"]) {
    const body = source.slice(source.indexOf(`const ${name} =`)).split("\n  };", 1)[0];
    assert.match(body, /setMobileLeftOpen\(false\)/);
    assert.match(body, /setMobileRightOpen\(false\)/);
  }
});

test("mobile 2D tools have one scrollable row instead of consuming the canvas", () => {
  const planner = readFileSync("src/components/data-center/DataCenter2DPlanner.tsx", "utf8");
  assert.ok(planner.includes('className="dc-2d-actions"'));
  assert.ok(css.includes('.dc-2d-actions { flex-wrap: nowrap; overflow-x: auto;'));
  assert.ok(css.includes('body:has([data-chat-dock="detached"]) .dc-2d-workspace { padding-bottom: 56px; }'));
});

test("camera preset commands can reapply the current view", () => {
  assert.match(source, /<DropdownMenuItem[^>]*onSelect=\{\(\) => requestCamera\(value\)\}/);
  assert.doesNotMatch(source, /<Select value=\{cameraPreset\}/);
  const body = source.match(/const requestCamera = \(preset: CameraPreset\) => \{([\s\S]*?)\n  \};/);
  assert.ok(body);
  let requestId = 0;
  const presets = [];
  const context = {
    preset: "overview",
    setCameraPreset: value => presets.push(value),
    setCameraRequestId: update => { requestId = update(requestId); },
  };
  vm.runInNewContext(body[1], context);
  vm.runInNewContext(body[1], context);
  assert.equal(requestId, 2);
  assert.deepEqual(presets, ["overview", "overview"]);
});

test("model search exposes active conditions and a visible route to actions", () => {
  assert.match(source, /aria-label="搜尋模型"/);
  assert.match(source, /aria-label="清除模型搜尋"/);
  assert.match(source, /aria-label="清除設備類別"/);
  assert.match(source, /data-testid="data-center-model-filter-chips"/);
  assert.match(source, /目前篩選條件沒有符合的模型/);
  assert.match(source, /selectedModelActionsRef\.current\?\.scrollIntoView/);
  assert.match(source, /套用／安裝操作/);
});

test("mobile model preview uses remaining height for the model rather than empty grid space", () => {
  const viewer = readFileSync("src/components/data-center/DataCenterModelViewer.tsx", "utf8");
  assert.ok(viewer.includes("grid-rows-[minmax(0,1fr)_auto]"));
  assert.ok(viewer.includes("min-h-11 items-center"));
});

test("selected 2D racks expose a direct equipment-settings action on both layouts", () => {
  const planner = readFileSync("src/components/data-center/DataCenter2DPlanner.tsx", "utf8");
  assert.ok(planner.includes('onClick={onOpenRackDetails}'));
  assert.ok(planner.includes('aria-label={`查看 ${selectedRack.cabinet} 的設備設定`}'));
  assert.equal((source.match(/onOpenRackDetails=\{\(\) => setMobileRightOpen\(true\)\}/g) ?? []).length, 2);
});

test("model filtering never silently substitutes a different selected model", () => {
  const expression = source.match(/const selectedModel =\s*([^;]+);/);
  assert.ok(expression);
  const catalogModels = [{ id: "visible" }];
  assert.equal(vm.runInNewContext(expression[1], { catalogModels, selectedModelId: "hidden" }), undefined);
  assert.equal(vm.runInNewContext(expression[1], { catalogModels, selectedModelId: "visible" }), catalogModels[0]);
});
