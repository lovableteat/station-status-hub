# Data Center L10 Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow operators to select every installed L10 module in the 3D rack, inspect its U-level telemetry, and update its health independently.

**Architecture:** Keep L10 geometry instanced for rendering performance and add one lightweight interaction mesh per mounted U position. Derive inspector data through a pure helper, persist per-slot health on `RackPlan`, and route updates through the existing site state flow.

**Tech Stack:** React, TypeScript, React Three Fiber, Three.js, Node test runner, Vite.

## Global Constraints

- Preserve instanced L10 rendering and existing rack camera behavior.
- Empty rack units do not expose equipment status.
- Existing saved layouts without per-L10 health remain valid and default installed L10 modules to `healthy`.
- Reuse the existing equipment inspector and semantic health colors.

---

### Task 1: L10 selection data

**Files:**
- Create: `src/components/data-center/l10EquipmentSelection.mjs`
- Modify: `src/components/data-center/dataCenterTypes.ts`
- Test: `tests/dataCenterL10EquipmentSelection.test.mjs`

**Interfaces:**
- Produces: `createL10EquipmentSelection({ rack, definition, rackUnit })` returning the common inspector payload.
- Produces: `RackPlan.l10ModuleHealth?: Record<string, RackDeviceHealth>`.

- [ ] **Step 1: Write the failing test** for ID, U range, model metadata, telemetry, default health, and slot-specific health.
- [ ] **Step 2: Run `node --test tests/dataCenterL10EquipmentSelection.test.mjs`** and confirm failure because the helper does not exist.
- [ ] **Step 3: Implement the helper and optional rack health map** with one-decimal per-module power calculation and `healthy` fallback.
- [ ] **Step 4: Re-run the test** and confirm all assertions pass.

### Task 2: 3D interaction and inspector

**Files:**
- Modify: `src/components/data-center/DataCenter3DPlanner.tsx`
- Modify: `src/components/data-center/GB300RackEquipment3D.tsx`
- Test: `tests/dataCenterL10Interaction.test.mjs`

**Interfaces:**
- Consumes: `createL10EquipmentSelection`.
- Produces: `onUpdateL10ModuleHealth(rackId, rackUnit, health)` planner callback.

- [ ] **Step 1: Write the failing source-wiring test** that requires per-position L10 hit targets, selection highlighting, the unified inspector metrics, and the L10 health callback.
- [ ] **Step 2: Run the test** and confirm it fails because L10 has no interaction layer.
- [ ] **Step 3: Add `L10ModuleHitTargets`** using the existing mount layout and stop event propagation before selecting the exact module.
- [ ] **Step 4: Extend the inspector payload and panel** to show L10 model, U range, power, temperature, utilization, and editable health.
- [ ] **Step 5: Run both L10 tests** and confirm they pass.

### Task 3: Persist health and verify integration

**Files:**
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Test: `tests/dataCenterL10Interaction.test.mjs`

**Interfaces:**
- Consumes: `onUpdateL10ModuleHealth(rackId, rackUnit, health)`.
- Produces: immutable site/rack updates that persist through the existing shared project document flow.

- [ ] **Step 1: Extend the failing wiring test** to require both desktop and mobile planner instances to receive the callback.
- [ ] **Step 2: Implement `handleL10ModuleHealthChange`** by updating `l10ModuleHealth[String(rackUnit)]` on the matching rack.
- [ ] **Step 3: Run targeted Data Center tests and ESLint** and fix only regressions caused by this feature.
- [ ] **Step 4: Run `npm.cmd run build` and `git diff --check`** for release verification.
- [ ] **Step 5: Commit and push `main`**, then verify local and remote commit hashes match.
