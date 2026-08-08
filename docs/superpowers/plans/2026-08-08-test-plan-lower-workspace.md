# Test Plan Lower Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the unused lower area of the active Test Plan page with a responsive engineering overview built from the current space, folder, and file metadata.

**Architecture:** Add a pure overview-data helper for category counts and stable recent-file sorting, then render a presentational `TestPlanOverview` component below the existing `.test-plan-shell`. `TestPlanWorkspace` remains the state owner and forwards the existing file-selection callback so recent files open in the existing inspector. No Supabase schema, repository, or upload behavior changes.

**Tech Stack:** React 18 + TypeScript, lucide-react, existing Test Plan CSS, Node `node:test` source-contract/unit tests, Vite, ESLint.

## Global Constraints

- Use the existing Test Plan CSS variables, navy surfaces, cyan focus color, restrained semantic category colors, 10–12px borders, and numeric accents.
- Do not add Supabase tables, storage calls, or a second source of truth.
- Keep the existing toolbar, file grid/list, inspector, dialogs, and upload flow unchanged.
- The lower overview is not rendered when there is no active space because the page already has a dedicated create-space empty state.
- Recent-file rows must be keyboard-focusable and expose the filename in their accessible name.
- Category bars must expose adjacent visible labels and counts instead of relying on color alone.
- At mobile widths the overview must stack into one column without horizontal scrolling.
- Respect `prefers-reduced-motion` for overview hover/progress transitions.

---

### Task 1: Add tested overview data derivation

**Files:**
- Create: `src/components/test-plan/core/overview.ts`
- Modify: `tests/test-plan/domain.test.ts`

**Interfaces:**
- `TestPlanOverviewCategory = { category: TestPlanFileCategory; count: number; percentage: number }`
- `getTestPlanCategorySummary(files: readonly TestPlanFileRecord[]): TestPlanOverviewCategory[]`
- `getRecentTestPlanFiles(files: readonly TestPlanFileRecord[], limit?: number): TestPlanFileRecord[]`

- [ ] **Step 1: Write failing unit tests**

Add tests to `tests/test-plan/domain.test.ts` that import `overview.ts` and verify category counts include zero-count categories, percentages total 100 when files exist, empty files return zero percentages, and recent files sort by `updatedAt` descending with `originalName` as the stable tie-breaker:

```ts
const overviewModule = await import(
  new URL("../../src/components/test-plan/core/overview.ts", import.meta.url).href,
);

test("derives complete category distribution for the active Test Plan space", () => {
  const files = [
    { category: "3d", originalName: "assembly.step", updatedAt: "2026-08-02T00:00:00.000Z" },
    { category: "document", originalName: "notes.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
  ] as TestPlanFileRecord[];

  const summary = overviewModule.getTestPlanCategorySummary(files);

  assert.equal(summary.find((item) => item.category === "3d")?.count, 1);
  assert.equal(summary.find((item) => item.category === "image")?.count, 0);
  assert.equal(summary.reduce((total, item) => total + item.percentage, 0), 100);
  assert.ok(summary.every((item) => item.percentage >= 0 && item.percentage <= 100));
});

test("sorts recent Test Plan files deterministically and handles empty spaces", () => {
  const files = [
    { originalName: "zeta.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
    { originalName: "alpha.pdf", updatedAt: "2026-08-01T00:00:00.000Z" },
    { originalName: "newer.step", updatedAt: "2026-08-02T00:00:00.000Z" },
  ] as TestPlanFileRecord[];

  assert.deepEqual(
    overviewModule.getRecentTestPlanFiles(files, 3).map((file) => file.originalName),
    ["newer.step", "alpha.pdf", "zeta.pdf"],
  );
  assert.deepEqual(overviewModule.getRecentTestPlanFiles([], 4), []);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test tests/test-plan/domain.test.ts
```

Expected: FAIL because `src/components/test-plan/core/overview.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal pure helper**

Implement the exact exported functions with a fixed category order matching the UI. Percentages should be rounded to one decimal place and the final non-zero category should receive any rounding remainder so a non-empty distribution totals exactly 100:

```ts
const OVERVIEW_CATEGORIES: readonly TestPlanFileCategory[] = [
  "3d", "pcb", "spreadsheet", "document", "presentation", "image", "archive", "other",
];

export function getTestPlanCategorySummary(
  files: readonly TestPlanFileRecord[],
): TestPlanOverviewCategory[] {
  const counts = new Map(OVERVIEW_CATEGORIES.map((category) => [category, 0]));
  for (const file of files) counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  const total = files.length;
  const summary = OVERVIEW_CATEGORIES.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
    percentage: total === 0 ? 0 : Math.round(((counts.get(category) ?? 0) / total) * 1000) / 10,
  }));
  if (total > 0) {
    let lastNonZeroIndex = -1;
    for (let index = 0; index < summary.length; index += 1) {
      if (summary[index].count > 0) lastNonZeroIndex = index;
    }
    if (lastNonZeroIndex >= 0) {
      const roundedTotal = summary.reduce((sum, item) => sum + item.percentage, 0);
      summary[lastNonZeroIndex].percentage = Math.round(
        (summary[lastNonZeroIndex].percentage + 100 - roundedTotal) * 10,
      ) / 10;
    }
  }
  return summary;
}

export function getRecentTestPlanFiles(
  files: readonly TestPlanFileRecord[],
  limit = 4,
): TestPlanFileRecord[] {
  return [...files]
    .sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt) ||
      first.originalName.localeCompare(second.originalName, "zh-Hant", { numeric: true }),
    )
    .slice(0, Math.max(0, limit));
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
node --test tests/test-plan/domain.test.ts
```

Expected: PASS, including all existing domain tests.

- [ ] **Step 5: Commit the helper and tests**

```powershell
git add src/components/test-plan/core/overview.ts tests/test-plan/domain.test.ts
git commit -m "test: add Test Plan overview data derivation"
```

### Task 2: Build the responsive overview component

**Files:**
- Create: `src/components/test-plan/TestPlanOverview.tsx`
- Modify: `src/components/test-plan/test-plan.css`
- Modify: `tests/test-plan/ui-contract.test.ts`

**Interfaces:**
- `TestPlanOverviewProps = { activeSpace: TestPlanSpace; activeFolderLabel: string; files: readonly TestPlanFileRecord[]; folders: readonly TestPlanFolder[]; onSelectFile: (file: TestPlanFileRecord) => void }`
- Produces semantic sections with the classes `.test-plan-overview`, `.test-plan-overview-card`, `.test-plan-category-row`, and `.test-plan-recent-file`.

- [ ] **Step 1: Add failing UI contract assertions**

Extend `tests/test-plan/ui-contract.test.ts` to read the new component and stylesheet and assert the three panel labels, the helper imports, keyboard interaction, empty-state copy, and responsive one-column rule:

```ts
test("renders the lower engineering overview without inventing a second data source", async () => {
  const [overview, styles] = await Promise.all([
    source("src/components/test-plan/TestPlanOverview.tsx"),
    source("src/components/test-plan/test-plan.css"),
  ]);

  assert.match(overview, /空間摘要/);
  assert.match(overview, /檔案類型分布/);
  assert.match(overview, /最近更新/);
  assert.match(overview, /getTestPlanCategorySummary/);
  assert.match(overview, /getRecentTestPlanFiles/);
  assert.match(overview, /onKeyDown/);
  assert.match(overview, /尚未上傳工程檔案/);
  assert.match(styles, /\.test-plan-overview/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
});
```

- [ ] **Step 2: Run the UI contract test and verify it fails**

Run:

```powershell
node --test tests/test-plan/ui-contract.test.ts
```

Expected: FAIL because `TestPlanOverview.tsx` and its classes do not exist yet.

- [ ] **Step 3: Implement the presentational component**

Render three cards using existing labels and category icon styles. Use `getTestPlanCategorySummary(files)` and `getRecentTestPlanFiles(files, 4)`. Recent rows must be buttons with `type="button"`, `aria-label={`選取 ${file.originalName}`}`, and both `onClick={() => onSelectFile(file)}` and Enter-key handling. Use `formatTestPlanFileSize` for the total and each file size. The summary should display the active space description or `尚未設定空間說明`, the passed folder label, total file/folder counts, and an informational prompt that changes to `此空間尚未上傳工程檔案` when `files.length === 0`.

Use this component shape so later wiring stays explicit:

```tsx
export function TestPlanOverview({
  activeSpace,
  activeFolderLabel,
  files,
  folders,
  onSelectFile,
}: TestPlanOverviewProps) {
  const categorySummary = getTestPlanCategorySummary(files);
  const recentFiles = getRecentTestPlanFiles(files, 4);
  const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);

  return (
    <section className="test-plan-overview" aria-label="工程摘要">
      <article className="test-plan-overview-card test-plan-overview-summary">
        <div className="test-plan-overview-card-heading">
          <div><span className="test-plan-eyebrow">SPACE PULSE</span><h2>空間摘要</h2></div>
          <FolderKanban className="h-5 w-5" aria-hidden="true" />
        </div>
        <p>{activeSpace.description || "尚未設定空間說明"}</p>
        <dl className="test-plan-overview-stats">
          <div><dt>工程檔案</dt><dd>{files.length}</dd></div>
          <div><dt>資料夾</dt><dd>{folders.length}</dd></div>
          <div><dt>空間容量</dt><dd>{formatTestPlanFileSize(totalBytes)}</dd></div>
        </dl>
        <span className="test-plan-overview-location">{activeFolderLabel}</span>
      </article>
      <article className="test-plan-overview-card">
        <div className="test-plan-overview-card-heading"><h2>檔案類型分布</h2><FileBarChart className="h-5 w-5" aria-hidden="true" /></div>
        {files.length === 0 ? <p className="test-plan-overview-muted">此空間尚未上傳工程檔案</p> : categorySummary.map((item) => <div className="test-plan-category-row" key={item.category}><div><span>{CATEGORY_LABELS[item.category]}</span><strong>{item.count}</strong></div><span className="test-plan-category-track"><span style={{ "--category-width": `${item.percentage}%` } as React.CSSProperties} /></span></div>)}
      </article>
      <article className="test-plan-overview-card">
        <div className="test-plan-overview-card-heading"><h2>最近更新</h2><RefreshCw className="h-5 w-5" aria-hidden="true" /></div>
        {recentFiles.length === 0 ? <p className="test-plan-overview-muted">請上傳工程檔案後，這裡會顯示最近更新</p> : <div className="test-plan-recent-file-list">{recentFiles.map((file) => <button key={file.id} type="button" className="test-plan-recent-file" aria-label={`選取 ${file.originalName}`} onClick={() => onSelectFile(file)} onKeyDown={(event) => { if (event.key === "Enter") onSelectFile(file); }}><FileCategoryIcon category={file.category} className="h-4 w-4" /><span><strong>{file.originalName}</strong><small>{formatTestPlanFileSize(file.fileSize)} · {new Date(file.updatedAt).toLocaleDateString("zh-TW")}</small></span><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>)}</div>}
      </article>
    </section>
  );
}
```

- [ ] **Step 4: Add the CSS layout and responsive treatment**

Add a sibling overview grid that uses the existing palette and stays content-sized. Desktop uses `minmax(0, 1.25fr) minmax(220px, 0.85fr) minmax(280px, 1fr)`. At `max-width: 1023px`, use one column; at mobile widths, keep recent rows readable with truncation and visible focus styles. Category bars use a CSS custom property such as `--category-width` for width, and `prefers-reduced-motion` disables transitions.

- [ ] **Step 5: Run the UI contract and type/lint checks**

Run:

```powershell
node --test tests/test-plan/ui-contract.test.ts
npm run lint -- --quiet
```

Expected: PASS with no ESLint errors.

- [ ] **Step 6: Commit the component and styles**

```powershell
git add src/components/test-plan/TestPlanOverview.tsx src/components/test-plan/test-plan.css tests/test-plan/ui-contract.test.ts
git commit -m "feat: add Test Plan engineering overview"
```

### Task 3: Wire the overview into the existing Test Plan workspace

**Files:**
- Modify: `src/components/test-plan/TestPlanWorkspace.tsx`
- Modify: `tests/test-plan/ui-contract.test.ts`

**Interfaces:**
- `TestPlanWorkspace` passes `activeSpace`, the current folder breadcrumb label, `folders`, `files`, and `onSelectFile={(file) => setSelectedEntryKey(`file:${file.id}`)}` to `TestPlanOverview`.

- [ ] **Step 1: Add the failing wiring contract**

Add assertions that the workspace imports and renders `TestPlanOverview`, passes `activeSpace`, `files`, and `folders`, and converts a recent file to the existing `file:${id}` selection key:

```ts
test("places the engineering overview below the file shell and reuses inspector selection", async () => {
  const workspace = await source("src/components/test-plan/TestPlanWorkspace.tsx");

  assert.match(workspace, /import \{ TestPlanOverview \}/);
  assert.match(workspace, /<TestPlanOverview/);
  assert.match(workspace, /activeSpace=\{activeSpace\}/);
  assert.match(workspace, /files=\{files\}/);
  assert.match(workspace, /folders=\{folders\}/);
  assert.match(workspace, /setSelectedEntryKey\(`file:\$\{file\.id\}`\)/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```powershell
node --test tests/test-plan/ui-contract.test.ts
```

Expected: FAIL because the workspace does not import or render the overview yet.

- [ ] **Step 3: Wire the component without changing existing file behavior**

Import `TestPlanOverview`. Derive `activeFolderLabel` from the existing `breadcrumbs` list, defaulting to `根目錄`. Render the overview after `</div>` for `.test-plan-shell` and only when `activeSpace` is truthy. Pass the existing arrays and selection callback:

```tsx
{activeSpace && (
  <TestPlanOverview
    activeSpace={activeSpace}
    activeFolderLabel={breadcrumbs.at(-1)?.name ?? "根目錄"}
    files={files}
    folders={folders}
    onSelectFile={(file) => setSelectedEntryKey(`file:${file.id}`)}
  />
)}
```

Do not alter `selectedEntry`, `TestPlanInspector`, `visibleEntries`, upload handlers, or folder navigation.

- [ ] **Step 4: Run the focused Test Plan suite**

Run:

```powershell
node --test tests/test-plan/*.test.ts
```

Expected: PASS for domain, repository, platform integration, error, and UI contract tests.

- [ ] **Step 5: Commit the wiring**

```powershell
git add src/components/test-plan/TestPlanWorkspace.tsx tests/test-plan/ui-contract.test.ts
git commit -m "feat: wire Test Plan overview into workspace"
```

### Task 4: Verify rendered desktop and mobile behavior

**Files:**
- Modify only if verification finds a concrete issue: `src/components/test-plan/TestPlanOverview.tsx`, `src/components/test-plan/TestPlanWorkspace.tsx`, `src/components/test-plan/test-plan.css`

- [ ] **Step 1: Run the complete static checks**

Run:

```powershell
npm run lint -- --quiet
npm run build
```

Expected: ESLint exits 0 and Vite produces a successful production build.

- [ ] **Step 2: Start the dev server and open the Test Plan route**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

Open the existing authenticated Test Plan route, confirm the page identity is `Test_Plan`, and verify the lower overview is present with seeded files. The page must be nonblank and free of framework error overlays.

- [ ] **Step 3: Verify desktop interactions**

Confirm the three cards appear below the file shell, category counts match the top-level file metric, recent files are sorted newest first, clicking a recent row updates the existing inspector, and the current folder label follows breadcrumb navigation.

- [ ] **Step 4: Verify mobile layout and accessibility**

Use a narrow viewport and confirm the three cards stack in order, no horizontal scrollbar is introduced by the overview, recent filenames remain accessible, keyboard focus is visible, and empty spaces show the upload guidance instead of a blank card.

- [ ] **Step 5: Run a final diff audit**

Run:

```powershell
git diff --check
git status -sb
git log -5 --oneline --decorate
```

Expected: no whitespace errors, only the intended Test Plan implementation files changed, and all implementation commits are on `codex/test-plan-lower-workspace`.

- [ ] **Step 6: Commit any verified fixes and report the result**

If verification required a concrete fix, run:

```powershell
git add src/components/test-plan/TestPlanOverview.tsx src/components/test-plan/TestPlanWorkspace.tsx src/components/test-plan/test-plan.css tests/test-plan/domain.test.ts tests/test-plan/ui-contract.test.ts
git commit -m "fix: polish Test Plan overview verification findings"
```
