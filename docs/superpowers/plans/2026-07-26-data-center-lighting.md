# Data Center Lighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Data Center 2D plan visibly illuminated while preserving the latest 3D lighting and all planning interactions.

**Architecture:** Add SVG-native lighting definitions and status-aware rack presentation to `DataCenter2DPlanner`. Keep 3D lighting in the Three.js scene and verify both modes through focused source contracts plus rendered browser checks.

**Tech Stack:** React 18, TypeScript, SVG, Tailwind CSS, Three.js, Node test runner, Vite.

## Global Constraints

- Preserve all commits already present on `origin/main`.
- Do not change rack coordinates, shared facility data, drag/drop, zoom, selection, or delete behavior.
- Do not add runtime animation or new dependencies.
- Push with a normal fast-forward update to `main`; never force push.

---

### Task 1: Lock the lighting contract

**Files:**
- Create: `tests/dataCenterLighting.test.mjs`
- Read: `src/components/data-center/DataCenter2DPlanner.tsx`
- Read: `src/components/data-center/DataCenter3DPlanner.tsx`

**Interfaces:**
- Consumes: `DataCenter2DPlanner` SVG markup and `DataCenter3DPlanner` light setup.
- Produces: a regression contract for floor lighting, overhead light pools, rack glow and 3D exposure.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [plan2d, plan3d] = await Promise.all([
  readFile(new URL("../src/components/data-center/DataCenter2DPlanner.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url), "utf8"),
]);

test("2D Data Center renders facility and rack lighting", () => {
  assert.match(plan2d, /id="dc-floor-lighting"/);
  assert.match(plan2d, /id="dc-overhead-light"/);
  assert.match(plan2d, /id=\{`dc-rack-glow-/);
  assert.match(plan2d, /data-testid="data-center-lighting-layer"/);
});

test("3D Data Center keeps calibrated physical lights", () => {
  assert.match(plan3d, /hemisphereLight/);
  assert.match(plan3d, /toneMappingExposure/);
});
```

- [ ] **Step 2: Run the test and verify the new 2D contract fails**

Run: `node --test tests/dataCenterLighting.test.mjs`

Expected: the 2D test fails because the new lighting IDs are not present.

### Task 2: Implement 2D facility and rack lighting

**Files:**
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Test: `tests/dataCenterLighting.test.mjs`

**Interfaces:**
- Consumes: `RackPlan.status`, `RackPlan.temperatureC`, rack devices and existing SVG geometry.
- Produces: `getRackPlanLighting(rack)` and SVG definitions used by every rack.

- [ ] **Step 1: Add a status-to-lighting helper**

```ts
function getRackPlanLighting(rack: RackPlan) {
  const critical = rack.temperatureC >= 32 || rack.devices.some((device) => device.health === "critical");
  const warning = rack.temperatureC >= 28 || rack.devices.some((device) => device.health === "warning");
  if (critical || rack.status === "blocked") return { glow: "#fb7185", fill: "#3a1826", stroke: "#fda4af" };
  if (warning || rack.status === "reserved") return { glow: "#fbbf24", fill: "#352b17", stroke: "#fde68a" };
  if (rack.status === "available") return { glow: "#60a5fa", fill: "#142b42", stroke: "#93c5fd" };
  return { glow: "#34d399", fill: "#12332f", stroke: "#6ee7b7" };
}
```

- [ ] **Step 2: Add SVG gradients and filters**

Add `dc-floor-lighting`, `dc-overhead-light`, a soft facility glow and rack-color filters under the existing `<defs>`. Keep the existing fallback fill and shadow filter.

- [ ] **Step 3: Render the non-interactive lighting layer**

Render a `data-testid="data-center-lighting-layer"` group above the floor and below aisles/racks. Use three broad light pools sized from `geometry.floorWidth` and `geometry.floorHeight`.

- [ ] **Step 4: Apply rack lighting**

For each rack, derive the lighting object, use its fill/stroke, and add a non-interactive glow rectangle behind the existing clickable rack group. Selection keeps the cyan high-contrast stroke.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/dataCenterLighting.test.mjs tests/dataCenter2DPlanner.test.mjs tests/dataCenterMobileExperience.test.mjs`

Expected: all tests pass.

### Task 3: Validate visuals and publish item 1

**Files:**
- Verify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Verify: `src/components/data-center/DataCenter3DPlanner.tsx`

**Interfaces:**
- Consumes: production build and local browser.
- Produces: verified desktop/mobile 2D and 3D appearance.

- [ ] **Step 1: Run quality checks**

Run: `npx eslint src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DataCenter3DPlanner.tsx tests/dataCenterLighting.test.mjs`

Expected: exit code 0.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 2: Browser-check 2D and 3D**

Verify desktop and phone-sized viewports. Confirm racks, grid, cold/hot aisles and labels remain readable, controls work, and no horizontal page overflow is introduced.

- [ ] **Step 3: Rebase-safe publish**

```bash
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
git add tests/dataCenterLighting.test.mjs src/components/data-center/DataCenter2DPlanner.tsx
git commit -m "fix(data-center): illuminate planning views"
git push origin HEAD:main
```

Expected: no remote-only commits before push, standard push succeeds, GitHub Pages workflow passes.

