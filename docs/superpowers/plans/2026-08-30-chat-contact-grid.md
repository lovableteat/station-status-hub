# Mobile Chat Contact Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile chat contact carousel with a two-column, two-row, vertically scrollable contact grid.

**Architecture:** Change only the contact result container and card sizing in `DirectMessagesPanel`. Keep sorting, searching, presence, and direct-chat creation untouched.

**Tech Stack:** React 18, Tailwind CSS, Node test runner.

## Global Constraints

- Mobile contact cards use two columns and retain at least 44px touch height.
- The visible contact area is limited to two rows; overflow scrolls vertically.
- The contact result area must not use or create horizontal overflow.
- No messaging data, persistence, API, or contact-order changes.

---

### Task 1: Convert the contact carousel to a bounded grid

**Files:**
- Modify: `tests/globalCollaborationCenter.test.mjs`
- Modify: `src/components/collaboration/DirectMessagesPanel.tsx`

**Interfaces:**
- Consumes: existing `availableContacts`, `threads`, `startDirectChat`, and `setSelectedThreadId` behavior.
- Produces: a two-column contact layout with internal vertical scrolling.

- [ ] **Step 1: Write the failing layout contract test**

```js
test("mobile chat contacts use two rows without horizontal dragging", async () => {
  const panel = await readSource("src/components/collaboration/DirectMessagesPanel.tsx");
  const contacts = panel.match(/<div className="[^"]+">\s*\{availableContacts\.map[\s\S]*?\)\}\s*<\/div>/)?.[0] ?? "";

  assert.match(contacts, /grid-cols-2/);
  assert.match(contacts, /max-h-\[94px\]/);
  assert.match(contacts, /overflow-y-auto/);
  assert.doesNotMatch(contacts, /overflow-x-auto/);
  assert.doesNotMatch(contacts, /min-w-\[124px\]/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/globalCollaborationCenter.test.mjs`

Expected: FAIL because the current contact list uses `overflow-x-auto` and `min-w-[124px]`.

- [ ] **Step 3: Implement the minimal responsive layout change**

```tsx
<div className="grid max-h-[94px] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-1 sm:max-h-[86px]">
  {availableContacts.map((contact) => (
    <button className="h-11 min-w-0 rounded-lg border px-2 text-left transition-colors sm:h-10">
      {/* existing contact content */}
    </button>
  ))}
</div>
```

Do not change the contact mapping, click handler, sorting, search, or status copy.

- [ ] **Step 4: Run collaboration tests and verify GREEN**

Run: `node --test tests/globalCollaborationCenter.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/globalCollaborationCenter.test.mjs src/components/collaboration/DirectMessagesPanel.tsx
git commit -m "fix: replace mobile contact carousel"
```

### Task 2: Validate the rendered mobile interaction

**Files:**
- No repository files.

**Interfaces:**
- Consumes: local Vite page and Browser plugin.
- Produces: screenshot, DOM, overflow, scroll, and console evidence.

- [ ] **Step 1: Open the floating chat at 390×844 and 320px width**

Expected: two contact columns, at most two visible rows, recent conversations still visible below.

- [ ] **Step 2: Verify interaction and overflow**

Scroll the contact grid vertically, open a contact, and confirm `scrollWidth === clientWidth` for the grid and chat panel.

- [ ] **Step 3: Run final static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/components/collaboration/DirectMessagesPanel.tsx tests/globalCollaborationCenter.test.mjs src/components/pcb-designer/PcbCanvas.tsx tests/pcb-designer/editor-contract.test.ts`

Run: `npm run build`

Expected: all commands exit 0.
