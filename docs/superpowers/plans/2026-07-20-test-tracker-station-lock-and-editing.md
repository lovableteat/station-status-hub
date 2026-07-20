# Test Tracker Station Lock and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make station-cell clicks open a station-locked progress sheet, preserve unsaved item drafts during another item save, and open system data editing directly from the machine ID.

**Architecture:** Keep the existing `SystemProgressSheet` and add an optional `lockedStationId` input. `TestTracker` owns the selected machine, locked station, and edited machine IDs; `TestProgressTable` emits distinct callbacks for machine editing, general progress editing, and station-specific progress editing. Existing per-item dirty draft merging remains the single source of protection against realtime/refetch overwrites.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI, Node.js built-in test runner, Supabase.

## Global Constraints

- A station-cell click must show only the clicked machine and clicked station.
- Locked station mode must not allow switching to another station.
- General `編輯進度` entry points must retain the existing all-station mode.
- Saving one item must not overwrite another dirty item draft.
- Machine ID clicks must open `SystemEditDialog`, not the progress sheet.
- Do not revert or overwrite unrelated existing data-center and system-address changes in the dirty worktree.
- Do not add dependencies or duplicate the progress-sheet component.

---

## File Map

- `src/components/test-tracker/TestProgressTable.tsx`: emit machine/station identity from station cells while keeping machine and general-progress actions separate.
- `src/components/test-tracker/TestTracker.tsx`: own locked-station state and clear it with the progress-sheet lifecycle.
- `src/components/test-tracker/SystemProgressSheet.tsx`: enforce the optional locked station and suppress station switching.
- `src/components/test-tracker/systemProgressDrafts.mjs`: existing focused helper for merging server data without replacing dirty drafts.
- `tests/testProgressStationLock.test.mjs`: source-contract regression test for the locked-station flow.
- `tests/systemProgressDraftMerge.test.mjs`: existing behavioral regression tests for draft preservation.
- `tests/testTrackerMachineColumnLayout.test.mjs`: existing source-contract test for direct machine editing.

### Task 1: Station-specific locked progress

**Files:**

- Create: `tests/testProgressStationLock.test.mjs`
- Modify: `src/components/test-tracker/TestProgressTable.tsx`
- Modify: `src/components/test-tracker/TestTracker.tsx`
- Modify: `src/components/test-tracker/SystemProgressSheet.tsx`

**Interfaces:**

- Consumes: `SystemProgressSheet` props, `TestProgressTableProps`, and React state in `TestTracker`.
- Produces: `onSelectStation(systemId: string, stationId: string): void` and `lockedStationId?: string | null`.

- [ ] **Step 1: Write the failing station-lock source test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("station cells open a progress sheet locked to their machine and station", async () => {
  const [table, tracker, sheet] = await Promise.all([
    read("../src/components/test-tracker/TestProgressTable.tsx"),
    read("../src/components/test-tracker/TestTracker.tsx"),
    read("../src/components/test-tracker/SystemProgressSheet.tsx"),
  ]);

  assert.match(
    table,
    /onSelectStation:\s*\(systemId:\s*string,\s*stationId:\s*string\)\s*=>\s*void/
  );
  assert.match(
    table,
    /onClick=\{\(\)\s*=>\s*onSelectStation\(system\.id,\s*station\.id\)\}/
  );

  assert.match(
    tracker,
    /const \[lockedStationId,\s*setLockedStationId\]\s*=\s*useState<string \| null>\(null\)/
  );
  assert.match(
    tracker,
    /const openStationProgress = \(systemId: string,\s*stationId: string\) =>/
  );
  assert.match(tracker, /lockedStationId=\{lockedStationId\}/);
  assert.match(
    tracker,
    /setSelectedSystemId\(null\);[\s\S]*?setLockedStationId\(null\);/
  );

  assert.match(sheet, /lockedStationId\?:\s*string \| null/);
  assert.match(sheet, /if \(lockedStationId\)/);
  assert.match(sheet, /\{!lockedStationId && \(/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
node --test tests/testProgressStationLock.test.mjs
```

Expected: FAIL because `onSelectStation`, `lockedStationId`, and the locked tab condition do not exist.

- [ ] **Step 3: Add the station callback to the table**

Add to `TestProgressTableProps` and the component destructuring:

```ts
onSelectStation: (systemId: string, stationId: string) => void;
```

Change only each desktop station cell:

```tsx
onClick={() => onSelectStation(system.id, station.id)}
```

Keep these general entry points unchanged:

```tsx
onClick={() => onSelectSystem(system.id)}
```

They include the mobile overall-progress control and desktop `編輯進度` button.

- [ ] **Step 4: Add locked-station lifecycle state in `TestTracker`**

Add state and explicit open handlers:

```ts
const [lockedStationId, setLockedStationId] = useState<string | null>(null);

const openSystemProgress = (systemId: string) => {
  setLockedStationId(null);
  setSelectedSystemId(systemId);
};

const openStationProgress = (systemId: string, stationId: string) => {
  setLockedStationId(stationId);
  setSelectedSystemId(systemId);
};

const handleProgressOpenChange = (open: boolean) => {
  if (open) return;
  setSelectedSystemId(null);
  setLockedStationId(null);
};
```

Wire the table:

```tsx
onSelectStation={openStationProgress}
onSelectSystem={openSystemProgress}
```

Treat board cards as station-specific because each card is rendered inside a concrete station column:

```tsx
onClick={() => openStationProgress(system.id, station.id)}
```

Wire the sheet:

```tsx
lockedStationId={lockedStationId}
onOpenChange={handleProgressOpenChange}
```

- [ ] **Step 5: Enforce locked mode in `SystemProgressSheet`**

Add the prop:

```ts
lockedStationId?: string | null;
```

Destructure it and update station selection:

```ts
if (lockedStationId) {
  setSelectedStationId(
    stations.some((station) => station.id === lockedStationId)
      ? lockedStationId
      : ""
  );
} else {
  const firstStationId = stations[0]?.id ?? "";
  setSelectedStationId((current) =>
    stations.some((station) => station.id === current)
      ? current
      : firstStationId
  );
}
```

Include `lockedStationId` in the effect dependencies. Wrap the station-switch row so locked mode renders no switch control:

```tsx
{!lockedStationId && (
  <div className="border-b border-[#2a526f]/70 bg-[#0b1b2d] px-5 py-3">
    {/* existing station buttons */}
  </div>
)}
```

The existing `stationItems` filter remains authoritative:

```ts
items.filter((item) => item.station_id === selectedStationId)
```

- [ ] **Step 6: Run the station-lock test and verify GREEN**

Run:

```powershell
node --test tests/testProgressStationLock.test.mjs
```

Expected: PASS, 1 test and 0 failures.

### Task 2: Verify draft isolation and direct machine editing

**Files:**

- Verify: `src/components/test-tracker/systemProgressDrafts.mjs`
- Verify: `src/components/test-tracker/SystemProgressSheet.tsx`
- Verify: `src/components/test-tracker/TestProgressTable.tsx`
- Verify: `src/components/test-tracker/TestTracker.tsx`
- Verify: `src/components/test-tracker/SystemEditDialog.tsx`
- Test: `tests/systemProgressDraftMerge.test.mjs`
- Test: `tests/testTrackerMachineColumnLayout.test.mjs`
- Test: `tests/testProgressPrimaryAction.test.mjs`

**Interfaces:**

- Consumes: `mergeServerProgressDrafts(currentDrafts, serverDrafts, dirtyItemIds)`.
- Produces: preserved dirty drafts and controlled `SystemEditDialog` opening from machine ID clicks.

- [ ] **Step 1: Run the focused draft and machine-entry regressions**

Run:

```powershell
node --test tests/systemProgressDraftMerge.test.mjs tests/testTrackerMachineColumnLayout.test.mjs tests/testProgressPrimaryAction.test.mjs
```

Expected: PASS, 4 tests and 0 failures.

- [ ] **Step 2: Verify the dirty-draft lifecycle in source**

Confirm `SystemProgressSheet.tsx` has all four behaviors:

```ts
dirtyItemIdsRef.current.add(itemId);
dirtyItemIdsRef.current.delete(item.id);
mergeServerProgressDrafts(current, nextDrafts, dirtyItemIdsRef.current);
dirtyItemIdsRef.current.clear();
```

If any behavior is missing, first extend `tests/systemProgressDraftMerge.test.mjs` with the exact missing sequence, run it to observe failure, then make only the minimal lifecycle correction.

- [ ] **Step 3: Verify direct machine editing remains distinct**

Confirm both desktop and mobile machine-name controls use:

```tsx
onClick={() => onEditSystemData(system.id)}
```

Confirm `TestTracker` resolves `editingSystemId` and renders:

```tsx
<SystemEditDialog
  systemId={editingSystem.id}
  showTrigger={false}
  open={Boolean(editingSystem)}
  onOpenChange={(open) => !open && setEditingSystemId(null)}
  onUpdate={loadData}
/>
```

Do not move station or progress controls to the edit-system callback.

- [ ] **Step 4: Run all focused test-tracker regressions**

Run:

```powershell
node --test tests/testProgressStationLock.test.mjs tests/systemProgressDraftMerge.test.mjs tests/testTrackerMachineColumnLayout.test.mjs tests/testProgressPrimaryAction.test.mjs tests/testProgressIssueCreation.test.mjs tests/systemEditorProjectAddresses.test.mjs
```

Expected: PASS with 0 failures.

### Task 3: Build and rendered validation

**Files:**

- Verify only; do not add report or screenshot files to the repository.

**Interfaces:**

- Consumes: production Vite bundle and the station-status test-tracker route.
- Produces: fresh build, console, DOM, interaction, and screenshot evidence.

- [ ] **Step 1: Run static and build verification**

Run:

```powershell
npm.cmd run build
```

Expected: exit code 0 and a completed Vite production build.

Run the relevant ESLint targets without mutating files:

```powershell
npx.cmd eslint src/components/test-tracker/TestProgressTable.tsx src/components/test-tracker/TestTracker.tsx src/components/test-tracker/SystemProgressSheet.tsx
```

Expected: exit code 0, or report any pre-existing warning/error separately without claiming lint success.

- [ ] **Step 2: Start or reuse the exact local preview**

Use:

```powershell
npm.cmd run preview -- --host 127.0.0.1
```

The flow under test is: test tracker table → click a machine station cell → only that station appears with no station switcher → close → click machine ID → system editor opens.

- [ ] **Step 3: Validate with the Browser plugin**

Read and follow `browser:control-in-app-browser` before browser actions. Verify:

1. URL and title identify the intended local app.
2. DOM contains the test-tracker table and is not blank.
3. No framework error overlay appears.
4. Relevant console errors and warnings are absent or explained.
5. Clicking a station cell opens the correct machine and station with no alternate station buttons.
6. Mark the first item `已完成`, mark and save a second item, then confirm the first item remains `已完成`.
7. Closing and clicking the machine ID opens `SystemEditDialog`.
8. Capture desktop and practical mobile screenshots outside the repository.

- [ ] **Step 4: Review the final diff and ownership boundaries**

Run:

```powershell
git diff --check
git status --short
git diff -- src/components/test-tracker/TestProgressTable.tsx src/components/test-tracker/TestTracker.tsx src/components/test-tracker/SystemProgressSheet.tsx tests/testProgressStationLock.test.mjs
```

Expected: no whitespace errors. Confirm unrelated data-center and model changes are untouched. Because `SystemEditDialog.tsx` contains mixed pre-existing address-field work, do not create an implementation commit that would silently absorb unrelated user-owned changes; report the verified working-tree result instead.
