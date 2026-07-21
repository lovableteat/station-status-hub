import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [plannerSource, workspaceSource, viewerSource, indexSource] = await Promise.all([
  readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/pages/Index.tsx", import.meta.url), "utf8"),
]);

test("L10 models keep one rack-unit height while fitting the rack width", () => {
  assert.match(plannerSource, /getRackUnitMountLayout/);
  assert.match(plannerSource, /rackUnits:\s*l10Definition\.rackUnits \?\? 1/);
  assert.match(plannerSource, /makeScale\(\s*layout\.fitScale,\s*layout\.fitScale,\s*layout\.fitScale/);
  assert.match(plannerSource, /getModelAxisRotation/);
  assert.match(plannerSource, /getUniformModelFit/);
  assert.match(plannerSource, /depthAlignment:\s*definition\.assetDepthAlignment/);
});

test("mobile Data-center uses low-poly assets and disables expensive rendering", () => {
  assert.match(plannerSource, /definition\.mobileAssetUrl/);
  assert.match(plannerSource, /const isMobile = useIsMobile\(\)/);
  assert.match(plannerSource, /lowDetail=\{isMobile\}/);
  assert.match(plannerSource, /shadows=\{!isMobile\}/);
  assert.match(plannerSource, /dpr=\{isMobile \? 1 : \[1, 1\.3\]\}/);
  assert.match(plannerSource, /antialias:\s*!isMobile/);
});

test("mobile Data-center fills the dynamic viewport and exposes primary controls", () => {
  assert.match(indexSource, /activeWorkspace === "data-center"[\s\S]*?h-\[100dvh\]/);
  assert.match(plannerSource, /relative h-full w-full min-h-0 min-w-0 flex-1/);
  assert.match(workspaceSource, /data-testid="data-center-mobile-dock"/);
  assert.match(workspaceSource, /id:\s*"scene"/);
  assert.match(workspaceSource, /id:\s*"details"/);
  assert.match(workspaceSource, /id:\s*"models"/);
  assert.match(workspaceSource, /id:\s*"plan"/);
  assert.match(workspaceSource, /data-action=\{action\.id\}/);
  assert.match(workspaceSource, /setMobileLeftOpen\(false\)/);
  assert.match(workspaceSource, /<SheetTitle>場景導覽<\/SheetTitle>/);
  assert.match(workspaceSource, /<SheetTitle>機櫃詳情<\/SheetTitle>/);
});

test("the 3D canvas supports direct touch rotation and two-finger zoom/pan", () => {
  assert.match(plannerSource, /touchAction:\s*"none"/);
  assert.match(plannerSource, /ONE:\s*THREE\.TOUCH\.ROTATE/);
  assert.match(plannerSource, /TWO:\s*THREE\.TOUCH\.DOLLY_PAN/);
  assert.match(workspaceSource, /data-testid="data-center-touch-help"/);
});

test("the model detail viewer keeps its header and controls inside a phone viewport", () => {
  assert.match(viewerSource, /className="min-w-0 h-\[min\(94svh,920px\)\]/);
  assert.match(viewerSource, /<header className="flex min-h-\[76px\] min-w-0/);
  assert.match(viewerSource, /<aside className="order-2 min-w-0/);
  assert.match(viewerSource, /className="flex w-full min-w-0 gap-2 overflow-x-auto/);
  assert.doesNotMatch(viewerSource, /min-w-max gap-2 overflow-x-auto/);
});

test("rack inspector exposes individually selectable rack units", () => {
  assert.match(workspaceSource, /\{rack\.capacityU\}U 機櫃/);
  assert.match(workspaceSource, /\{usableRackUnits\} 個可用 U 位/);
  assert.match(workspaceSource, /選擇安裝層位/);
  assert.match(workspaceSource, /點選任意可用 U 位；可分開安裝，不必連續排列/);
  assert.match(workspaceSource, /onClick=\{\(\) => onL10SlotToggle\(unit\)\}/);
  assert.match(workspaceSource, /aria-pressed=\{selected\}/);
});
