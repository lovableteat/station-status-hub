# PCB Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-native PCB 2D canvas menu with a context-aware application menu backed by existing workspace actions.

**Architecture:** Wrap `PcbCanvas` with the existing Radix/shadcn `ContextMenu`. Resolve the right-clicked SVG object from data attributes, update the existing selection model, and call only existing workspace APIs for editing, history, clipboard, zoom, and reset actions.

**Tech Stack:** React 18, TypeScript, Radix Context Menu through shadcn/ui, Node test runner.

## Global Constraints

- No new backend, database, persistence state, or dependency.
- Preserve an existing multi-selection when the right-clicked object is already selected.
- Disable mutations when the document is read-only or the selected component is locked.
- Keep all menu commands aligned with existing toolbar and keyboard commands.

---

### Task 1: Add the PCB canvas context menu

**Files:**
- Modify: `tests/pcb-designer/editor-contract.test.ts`
- Modify: `src/components/pcb-designer/PcbCanvas.tsx`

**Interfaces:**
- Consumes: `PcbWorkspaceApi.copySelected`, `pasteCopied`, `duplicateSelected`, `rotateSelected`, `toggleSelectedLock`, `deleteSelected`, `undo`, `redo`, `setZoom`, and `resetView`.
- Produces: `handleContextMenu(event)` plus SVG `data-pcb-object-kind` and `data-pcb-object-id` hit targets.

- [ ] **Step 1: Write the failing contract test**

```ts
test("replaces the browser menu with contextual PCB canvas actions", () => {
  assert.match(canvasSource, /ContextMenuTrigger asChild/);
  assert.match(canvasSource, /onContextMenu=\{handleContextMenu\}/);
  for (const action of ["copySelected", "pasteCopied", "duplicateSelected", "rotateSelected", "toggleSelectedLock", "deleteSelected", "resetView"]) {
    assert.match(canvasSource, new RegExp(`workspace\\.${action}`));
  }
  assert.match(canvasSource, /data-pcb-object-kind/);
  assert.match(canvasSource, /data-pcb-object-id/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/pcb-designer/editor-contract.test.ts`

Expected: FAIL because `PcbCanvas` has no `ContextMenuTrigger` or `handleContextMenu`.

- [ ] **Step 3: Implement object hit targeting and reuse existing selection state**

```tsx
const [contextSelection, setContextSelection] = useState<PcbSelection | null>(null);

const handleContextMenu = (event: ReactMouseEvent<SVGSVGElement>) => {
  const target = (event.target as Element | null)?.closest<SVGElement>(
    "[data-pcb-object-kind][data-pcb-object-id]",
  );
  const selection = target?.dataset.pcbObjectId
    ? getSelectionById(target.dataset.pcbObjectId, project)
    : null;
  setContextSelection(selection);
  if (!selection) selectObject(null);
  else if (selectionIds.includes(selection.id)) workspace.selectObject(selection);
  else selectObject(selection);
};
```

Add `data-pcb-object-kind` and `data-pcb-object-id` to component, keepout, and measurement SVG roots.

- [ ] **Step 4: Wrap the canvas and render context-specific action groups**

```tsx
<ContextMenu>
  <ContextMenuTrigger asChild>
    <main>{/* existing canvas */}</main>
  </ContextMenuTrigger>
  <ContextMenuContent data-pcb-context-menu>
    <ContextMenuGroup>{/* object or canvas actions */}</ContextMenuGroup>
  </ContextMenuContent>
</ContextMenu>
```

Object actions call existing selection APIs. Blank-canvas actions call paste, undo/redo, zoom, and reset APIs. Failed copy/paste shows the existing toast system's explanatory feedback.

- [ ] **Step 5: Run focused and full PCB tests**

Run: `node --test tests/pcb-designer/editor-contract.test.ts`

Expected: PASS.

Run: `npm run test:pcb`

Expected: all PCB tests PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/pcb-designer/editor-contract.test.ts src/components/pcb-designer/PcbCanvas.tsx
git commit -m "feat: add PCB canvas context menu"
```
