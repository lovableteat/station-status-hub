# Shared Prompt Hover Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Position the shared prompt preview at the upper-right side of its prompt row without changing prompt data or actions.

**Architecture:** Keep the existing prompt library and apply flows intact. Add a focused HoverCard preview around each prompt row, using Radix collision handling so the card stays inside the viewport and scrolls internally for long content.

**Tech Stack:** React, TypeScript, Radix HoverCard, Tailwind CSS, Node test runner.

## Global Constraints

- Modify only the shared prompt preview surface.
- Do not change prompt persistence, filtering, slash-command behavior, or AI request behavior.
- Preserve keyboard focus and click-to-apply behavior.

### Task 1: Add upper-right prompt preview

**Files:**
- Modify: `src/components/api-management/ApiChatConsole.tsx`
- Test: `tests/apiChatPromptLibraryLayout.test.mjs`

- [ ] Add a HoverCard preview to each prompt row with `side="right"`, `align="start"`, `sideOffset={16}`, and `collisionPadding={16}`.
- [ ] Keep preview content bounded to `min(320px, 58vh)` and scrollable.
- [ ] Verify the existing list click, adjust, edit, and delete actions remain unchanged.
- [ ] Run the focused prompt layout test and the production build.
- [ ] Compare the changed file against `origin/main` and commit only the plan and focused UI change.
