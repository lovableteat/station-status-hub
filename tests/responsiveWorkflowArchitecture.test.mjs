import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("responsive layout decisions come from the shared breakpoint hooks", async () => {
  const [hooks, sidebar, dataCenter, flowInfo] = await Promise.all([
    read("src/hooks/use-mobile.tsx"),
    read("src/components/layout/Sidebar.tsx"),
    read("src/components/data-center/DeploymentPlanningCenter.tsx"),
    read("src/components/test-tracker/FlowInfo.tsx"),
  ]);

  assert.match(hooks, /COMPACT_LAYOUT_BREAKPOINT = 1024/);
  assert.match(hooks, /useIsDesktopLayout/);
  assert.match(hooks, /useIsWideLayout/);
  assert.match(sidebar, /useIsCompactLayout\(\)/);
  assert.match(dataCenter, /useIsDesktopLayout\(\)/);
  assert.match(flowInfo, /useIsWideLayout\(\)/);
  assert.doesNotMatch(`${sidebar}\n${dataCenter}\n${flowInfo}`, /window\.matchMedia/);
});

test("maintenance navigation separates platform UI while sharing permissions and actions", async () => {
  const sidebar = await read("src/components/layout/Sidebar.tsx");

  assert.match(sidebar, /function MobileMaintenanceNavigation/);
  assert.match(sidebar, /function DesktopMaintenanceSidebar/);
  assert.match(sidebar, /visibleNavigationItems/);
  assert.match(sidebar, /canViewModule\(item\.id\)/);
  assert.match(sidebar, /onModuleChange=\{onModuleChange\}/);
  assert.doesNotMatch(sidebar, /isMobile\?: boolean/);
});

test("test progress separates desktop and mobile workflows behind one functional API", async () => {
  const [table, mobileList, shared] = await Promise.all([
    read("src/components/test-tracker/TestProgressTable.tsx"),
    read("src/components/test-tracker/MobileTestProgressList.tsx"),
    read("src/components/test-tracker/testProgressTableShared.ts"),
  ]);

  assert.match(table, /isDesktopLayout\s*\? <DesktopTestProgressTable \{\.\.\.props\} \/>/);
  assert.match(table, /: <MobileTestProgressList \{\.\.\.props\} \/>/);
  assert.match(mobileList, /TestProgressTableProps/);
  assert.match(mobileList, /onEditSystemData\(system\.id\)/);
  assert.match(mobileList, /onSelectSystem\(system\.id\)/);
  assert.match(mobileList, /onSelectStation\(system\.id, station\.id\)/);
  assert.match(shared, /normalizeTrackerTableStatus/);
  assert.match(shared, /getTrackerTableStatusClass/);
});
