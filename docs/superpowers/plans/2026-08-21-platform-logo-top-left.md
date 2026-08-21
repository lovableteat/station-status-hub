# 工作整合平台 Logo 左上定位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將共用工作區 Header 的 Logo／品牌區固定在左上側，同時保留中央導覽、右側操作與手機版安全間距。

**Architecture:** 只修改 `MainWorkspaceHeader` 的版面定位。品牌區脫離 Grid 的正常排版流，以 Header 內層為定位上下文；導覽與右側操作透過 `xl:col-start-2`／`xl:col-start-3` 保持原有三欄位置。以既有的 source-contract 測試加上品牌定位標記驗證結構，再用 production build 與實際畫面確認沒有重疊。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node.js built-in test runner、Vite。

## Global Constraints

- 保留既有導覽、帳號、在線狀態、QR、登出、路由、權限與品牌點擊行為。
- 不修改 `PlatformLogoMark` 的 SVG、登入頁 Logo、資料流程或 Supabase。
- 左側定位不得侵入裝置 `safe-area-inset-left`。
- 手機與 compact 版不得出現品牌區與右側帳號操作重疊或水平溢出。
- 只修改與本功能直接相關的 Header／Logo 測試與元件。

---

### Task 1: Anchor the shared platform brand to the top-left

**Files:**
- Modify: `src/components/layout/MainWorkspaceHeader.tsx:57-108`
- Test: `tests/platformLogo.test.mjs:10-22`

**Interfaces:**
- Consumes: Existing `MainWorkspaceHeaderProps`, `onBrandClick?: () => void`, `items`, and current responsive Header Grid.
- Produces: Existing Header API unchanged; the brand wrapper exposes `data-platform-brand="top-left"` and keeps the current clickable/non-clickable variants.

- [ ] **Step 1: Write the failing source-contract test**

Append this test to `tests/platformLogo.test.mjs`:

```js
test("workspace header pins the shared brand to the top-left without changing the nav contract", () => {
  const header = read("src/components/layout/MainWorkspaceHeader.tsx");

  assert.match(header, /data-platform-brand="top-left"/);
  assert.match(header, /relative grid min-h-\[var\(--mobile-header-height\)\]/);
  assert.match(header, /left-\[max\(0\.625rem,env\(safe-area-inset-left\)\)\]/);
  assert.match(header, /top-1\/2[^"]*-translate-y-1\/2/);
  assert.match(header, /xl:col-start-2/);
  assert.match(header, /xl:col-start-3/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test tests/platformLogo.test.mjs
```

Expected: the existing shared-logo test passes, and the new top-left positioning test fails because the current Header has no `data-platform-brand="top-left"`, absolute brand class, or explicit desktop grid starts.

- [ ] **Step 3: Implement the smallest Header-only change**

In `MainWorkspaceHeader.tsx`:

1. Add a reusable class string beside `brand`:

```tsx
const brandPositionClassName =
  "absolute left-[max(0.625rem,env(safe-area-inset-left))] top-1/2 z-10 flex min-w-0 max-w-[calc(100%-4.5rem)] -translate-y-1/2 items-center gap-2.5 text-left sm:gap-3 sm:max-w-[min(75vw,360px)]";
```

2. Add `relative` to the Header inner Grid and replace the current in-flow brand branch with the same positioned class in both variants:

```tsx
<div className="relative grid min-h-[var(--mobile-header-height)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 px-2.5 py-1.5 sm:min-h-[72px] sm:gap-x-3 sm:px-4 sm:py-3 xl:grid-cols-[minmax(180px,1fr)_auto_minmax(180px,1fr)] xl:gap-x-4 xl:px-5 2xl:px-6">
  {onBrandClick ? (
    <button
      type="button"
      data-platform-brand="top-left"
      onClick={onBrandClick}
      className={brandPositionClassName}
    >
      {brand}
    </button>
  ) : (
    <div data-platform-brand="top-left" className={brandPositionClassName}>
      {brand}
    </div>
  )}
```

Keep all existing Header Grid classes and only add explicit desktop placement to the remaining in-flow columns:

```tsx
<nav className="glass-strip order-3 col-span-2 hidden w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-primary/15 p-1 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)] [scrollbar-width:thin] lg:flex xl:order-none xl:col-span-1 xl:col-start-2 xl:w-auto xl:max-w-[min(58vw,760px)]">
  {items.map((item) => {
    const isActive = item.id === activeItem;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item.id)}
        className={cn(
          "interactive-lift min-w-fit rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 2xl:px-4",
          isActive
            ? "bg-primary text-primary-foreground shadow-[0_18px_34px_-24px_hsl(var(--primary)/0.85)]"
            : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
        )}
      >
        {item.label}
      </button>
    );
  })}
</nav>

<div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 xl:col-start-3 xl:gap-3">
```

Retain every existing class token shown above, including the mobile `order-3 col-span-2`, existing nav width rules, and right-control visibility rules. The brand’s semantic element and `onBrandClick` callback must remain unchanged.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
node --test tests/platformLogo.test.mjs tests/mobileFirstAdaptiveShell.test.mjs tests/mobileCoreWorkspaces.test.mjs
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Run lint and the production build**

Run:

```powershell
npm exec eslint src/components/layout/MainWorkspaceHeader.tsx tests/platformLogo.test.mjs
npm run build
```

Expected: ESLint exits 0 and Vite produces the production bundle. Existing non-blocking Vite／Browserslist warnings may remain, but no new error is acceptable.

- [ ] **Step 6: Verify the rendered Header at desktop and mobile sizes**

Start the preview with:

```powershell
npm run preview -- --host 127.0.0.1
```

Verify the flow:

```text
app loads -> authenticated workspace Header renders -> Logo stays at top-left -> clicking Logo returns to workspace home
```

Check one desktop viewport (at least 1280px wide) and one handset viewport (390px wide). Confirm the page is not blank, no framework error overlay appears, the brand does not overlap the account control, and the desktop nav remains centered between the left brand and right controls. Save screenshots outside the repository if needed.

- [ ] **Step 7: Review the scoped diff and commit the implementation**

Run:

```powershell
git diff --check
git diff -- src/components/layout/MainWorkspaceHeader.tsx tests/platformLogo.test.mjs
git status --short
```

Stage only the implementation files and commit:

```powershell
git add -- src/components/layout/MainWorkspaceHeader.tsx tests/platformLogo.test.mjs
git commit -m "fix: pin platform logo to header top-left"
```

Expected: only the Header and focused test changes are included in the implementation commit; the already committed design and plan documents remain separate.
