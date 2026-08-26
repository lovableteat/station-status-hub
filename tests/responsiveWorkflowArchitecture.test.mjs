import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("responsive layout decisions come from the shared breakpoint hooks", async () => {
  const [hooks, sidebarWrapper, dataCenter, flowInfo] = await Promise.all([
    read("src/hooks/use-mobile.tsx"),
    read("src/components/layout/Sidebar/Sidebar.tsx"),
    read("src/components/data-center/DeploymentPlanningCenter.tsx"),
    read("src/components/test-tracker/FlowInfo.tsx"),
  ]);

  assert.match(hooks, /COMPACT_LAYOUT_BREAKPOINT = 1024/);
  assert.match(hooks, /useIsDesktopLayout/);
  assert.match(hooks, /useIsWideLayout/);
  assert.match(sidebarWrapper, /useMaxWidth\(compactBreakpoint\)/);
  assert.match(dataCenter, /useIsDesktopLayout\(\)/);
  assert.match(flowInfo, /useIsWideLayout\(\)/);
  assert.doesNotMatch(`${sidebarWrapper}\n${dataCenter}\n${flowInfo}`, /window\.matchMedia/);
});

test("maintenance navigation separates platform UI while sharing permissions and actions", async () => {
  const [wrapper, desktop, mobile, shared, entry] = await Promise.all([
    read("src/components/layout/Sidebar/Sidebar.tsx"),
    read("src/components/layout/Sidebar/desktop/DesktopMaintenanceSidebar.tsx"),
    read("src/components/layout/Sidebar/mobile/MobileMaintenanceNavigation.tsx"),
    read("src/components/layout/Sidebar/shared/navigation.ts"),
    read("src/components/layout/Sidebar/index.ts"),
  ]);

  assert.match(desktop, /function DesktopMaintenanceSidebar/);
  assert.match(mobile, /function MobileMaintenanceNavigation/);
  assert.match(wrapper, /visibleNavigationItems/);
  assert.match(wrapper, /compactBreakpoint = "lg"/);
  assert.match(wrapper, /canViewModule\(item\.id\)/);
  assert.match(wrapper, /onModuleChange=\{onModuleChange\}/);
  assert.match(shared, /maintenanceNavigationItems/);
  assert.match(entry, /export \{ Sidebar \}/);
  assert.match(mobile, /sm:top-\[72px\]/);
  assert.match(desktop, /isCompact \? "w-16" : "w-\[220px\]"/);
  assert.doesNotMatch(`${wrapper}\n${desktop}\n${mobile}`, /isMobile\?: boolean/);
});

test("existing page-specific RWD boundaries stay unchanged", async () => {
  const [hooks, index, trackerPage] = await Promise.all([
    read("src/hooks/use-mobile.tsx"),
    read("src/pages/Index.tsx"),
    read("src/pages/TestTrackerPage.tsx"),
  ]);

  assert.match(hooks, /useIsMobile\(\)[\s\S]*?useMaxWidth\("md"\)/);
  assert.match(hooks, /useIsCompactLayout\(\)[\s\S]*?useMaxWidth\("lg"\)/);
  assert.match(hooks, /initializeFromMatchMedia: false/);
  assert.match(index, /<Sidebar[\s\S]*?activeModule=\{activeStationModule\}/);
  assert.doesNotMatch(index, /compactBreakpoint=/);
  assert.match(trackerPage, /<Sidebar[\s\S]*?compactBreakpoint="md"/);
  assert.match(trackerPage, /isMobile && "pt-14"/);
});

test("test progress separates desktop and mobile workflows behind one functional API", async () => {
  const [wrapper, desktopTable, mobileList, sharedTypes, sharedStatus, entry] = await Promise.all([
    read("src/components/test-tracker/TestProgressTable/TestProgressTable.tsx"),
    read("src/components/test-tracker/TestProgressTable/desktop/DesktopTestProgressTable.tsx"),
    read("src/components/test-tracker/TestProgressTable/mobile/MobileTestProgressList.tsx"),
    read("src/components/test-tracker/TestProgressTable/shared/types.ts"),
    read("src/components/test-tracker/TestProgressTable/shared/status.ts"),
    read("src/components/test-tracker/TestProgressTable/index.ts"),
  ]);

  assert.match(wrapper, /isDesktopLayout\s*\? <DesktopTestProgressTable \{\.\.\.props\} \/>/);
  assert.match(wrapper, /: <MobileTestProgressList \{\.\.\.props\} \/>/);
  assert.match(desktopTable, /TestProgressTableProps/);
  assert.match(mobileList, /TestProgressTableProps/);
  assert.match(mobileList, /onEditSystemData\(system\.id\)/);
  assert.match(mobileList, /onSelectSystem\(system\.id\)/);
  assert.match(mobileList, /onSelectStation\(system\.id, station\.id\)/);
  assert.match(sharedTypes, /onSelectStation: \(systemId: string, stationId: string\) => void/);
  assert.match(sharedStatus, /normalizeTrackerTableStatus/);
  assert.match(sharedStatus, /getTrackerTableStatusClass/);
  assert.match(entry, /export \{ TestProgressTable \}/);
  assert.match(mobileList, /min-w-0 flex-1/);
  assert.match(desktopTable, /overflow-auto/);
});
