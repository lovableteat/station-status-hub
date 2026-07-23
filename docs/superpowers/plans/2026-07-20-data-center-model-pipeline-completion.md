# Data Center Model Pipeline Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the pending Data Center model, conversion-script, model-inspection, rack-placement, and mobile-viewer work; regenerate the GB300 L10 assets with preserved STEP names and colors; verify everything; and commit the completed scope.

**Architecture:** Keep the existing browser runtime on optimized GLB assets and make the offline CAD pipeline responsible for preserving XCAF assembly names, color/material boundaries, authoritative bounds, and lightweight mobile LODs. Promote the successful native OCCT/XCAF experiment into a reusable script, keep `gltfpack` in preserve-node/preserve-material mode, and validate deployed binaries with `scripts/inspect-glb.mjs`. The React viewer consumes those names for searchable per-part visibility, while rack assignment remains constrained by physical U capacity and L10/L11 compatibility.

**Tech Stack:** Python 3.12, cadquery-ocp/OpenCascade XCAF, PowerShell, gltfpack 1.2, Node.js test runner, Three.js, React, TypeScript, Vite.

## Global Constraints

- Preserve the authoritative source STEP dimensions: VR200 L10 `497.2 × 899.1 × 44.0 mm`; GB300 L10 `481.5 × 889.6 × 44.5 mm`.
- Desktop GLBs must retain at least 10 meshes/primitives, 3 distinct materials, 2 saturated colors, and a named top-cover node.
- Mobile GLBs must retain at least 3 meshes/materials, 2 saturated colors, and no more than 250,000 triangles.
- Do not expose the generated VR200 L11 placeholder as an authoritative catalog model while the real VR200 L11 source is unavailable.
- Do not commit local Python runtimes, diagnostic logs, screenshots, zero-byte conversion remnants, spreadsheets, or unrelated temporary SQL.

---

### Task 1: Promote the XCAF-preserving converter

**Files:**
- Create: `scripts/occt-xcaf-step-to-glb.py`
- Create: `scripts/convert-step-with-occt.ps1`
- Modify: `package.json`
- Modify: `tests/dataCenterModelConversion.test.mjs`

**Interfaces:**
- Consumes: a STEP/STP input path, GLB output path, model name, source up-axis, tessellation settings, and web/mobile simplification settings.
- Produces: a named, colored desktop GLB; a named, colored mobile GLB; and metadata containing bounds, dimensions, mesh/material statistics, optimization settings, hashes, and source identity.

- [ ] **Step 1: Extend the failing conversion contract**

Add source assertions that the production runner invokes the OCCT/XCAF converter, installs or locates `cadquery-ocp` outside the repository, uses `gltfpack -kn -km`, creates desktop and mobile outputs, and runs `scripts/inspect-glb.mjs` before publishing.

- [ ] **Step 2: Run the conversion test and verify RED**

Run:

```powershell
node --test tests/dataCenterModelConversion.test.mjs
```

Expected: FAIL because `scripts/occt-xcaf-step-to-glb.py` and `scripts/convert-step-with-occt.ps1` do not exist.

- [ ] **Step 3: Implement the minimal converter and runner**

Promote the working XCAF experiment with these required behaviors:

```text
STEPCAFControl_Reader -> authoritative single root bounds
XCAF style collection -> named solid/face colors
per-solid labels -> preserved part names
RWGltf_CafWriter -> raw GLB
gltfpack -kn -km -> desktop and mobile GLBs
inspect-glb.mjs -> publish gate and metadata statistics
```

The runner must write into a temporary output directory first and replace deployment files only after both assets pass validation.

- [ ] **Step 4: Run the conversion test and verify GREEN**

Run:

```powershell
node --test tests/dataCenterModelConversion.test.mjs
```

Expected: PASS.

### Task 2: Regenerate and validate GB300 L10 assets

**Files:**
- Modify: `public/models/data-center/carlo-next-l10-20260715.glb`
- Modify: `public/models/data-center/carlo-next-l10-20260715.mobile.glb`
- Modify: `public/models/data-center/carlo-next-l10-20260715.json`
- Test: `tests/dataCenterBuiltInGlbMaterials.test.mjs`
- Test: `tests/dataCenterBuiltinModelCatalog.test.mjs`
- Test: `tests/dataCenterGlbOrientation.test.mjs`

**Interfaces:**
- Consumes: `C:\Users\銘三\Desktop\00_carlo-next_l10_outlook_20260715.stp`.
- Produces: production GB300 desktop/mobile GLBs and metadata that satisfy the same structural contract as VR200.

- [ ] **Step 1: Confirm the existing regression remains RED**

Run:

```powershell
node --test tests/dataCenterBuiltInGlbMaterials.test.mjs
```

Expected: three GB300 failures for single-mesh assets and missing top-cover node.

- [ ] **Step 2: Run the production XCAF conversion**

Run the new PowerShell runner with GB300 dimensions, source up-axis `z`, and bounded desktop/mobile simplification. Keep conversion logs outside version control.

- [ ] **Step 3: Inspect the staged output before replacement**

Require:

```text
world spans within 3% of 0.4815 × 0.8896 × 0.0445 m
desktop meshCount >= 10
desktop materialCount >= 3
desktop saturatedMaterialCount >= 2
top-cover node present
mobile meshCount >= 3
mobile triangleCount <= 250000
```

- [ ] **Step 4: Publish atomically and verify GREEN**

Run:

```powershell
node --test tests/dataCenterBuiltInGlbMaterials.test.mjs tests/dataCenterBuiltinModelCatalog.test.mjs tests/dataCenterGlbOrientation.test.mjs
```

Expected: PASS.

### Task 3: Finish model viewer and rack installation behavior

**Files:**
- Modify: `src/components/data-center/DataCenter3DPlanner.tsx`
- Modify: `src/components/data-center/DataCenterModelViewer.tsx`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Modify: `src/components/data-center/dataCenterSeed.ts`
- Create: `src/components/data-center/modelParts.mjs`
- Modify: `src/components/data-center/rackMount.mjs`
- Test: `tests/dataCenterMobileExperience.test.mjs`
- Test: `tests/dataCenterModelCatalogEditing.test.mjs`
- Create: `tests/dataCenterModelViewerParts.test.mjs`
- Modify: `tests/dataCenterRackMount.test.mjs`

**Interfaces:**
- Consumes: GLB node names/materials, rack capacity, selected starting U, current L10 count, and compatible model IDs.
- Produces: searchable part visibility, double-sided CAD sheet metal, repeated detailed L10 assets for the active rack, and a one-click first installation into an empty compatible rack.

- [ ] **Step 1: Run the focused viewer/rack tests**

Run:

```powershell
node --test tests/dataCenterMobileExperience.test.mjs tests/dataCenterModelCatalogEditing.test.mjs tests/dataCenterModelViewerParts.test.mjs tests/dataCenterRackMount.test.mjs
```

Expected: PASS for the pending implementation.

- [ ] **Step 2: Review lifecycle and performance boundaries**

Confirm cloned Three.js materials are disposed, hidden-part state resets per model, mobile controls stay in the dynamic viewport, repeated rack modules use low-detail assets after the first instance, and module counts clamp to physical capacity.

- [ ] **Step 3: Run ESLint on the Data Center scope**

Run:

```powershell
npx eslint src/components/data-center/DataCenter3DPlanner.tsx src/components/data-center/DataCenterModelViewer.tsx src/components/data-center/DeploymentPlanningCenter.tsx src/components/data-center/dataCenterSeed.ts
```

Expected: exit code 0.

### Task 4: Remove non-product temporary output

**Files:**
- Remove: `.playwright-cli/`
- Remove: `output/`
- Remove: `tmp/codex-check/`
- Remove: `tmp/codex-model-inspection/`
- Remove: `tmp/codex-native-ocp/`
- Remove: `tmp/codex-xcaf-color-test/`
- Remove: `tmp/parse-test/`
- Remove: `tmp/ref_location_*.csv`
- Remove: `tmp/ref_location_conflicts_summary.md`
- Remove: `tmp/timer-vite.pid`
- Remove: `tmp/vera_bom_0702.xlsx`
- Remove: `tmp_preflight_duplicates.sql`
- Remove if not cataloged: `public/models/data-center/vr200-l11-cabinet-20260719.glb`
- Remove if not cataloged: `public/models/data-center/vr200-l11-cabinet-20260719.mobile.glb`
- Remove if not cataloged: `public/models/data-center/vr200-l11-cabinet-20260719.json`
- Remove if not cataloged: `public/models/data-center/vr200-l11-planning-cabinet-20260719.stp`
- Remove if not product-required: `scripts/generate-vr200-l11-planning-model.py`

**Interfaces:**
- Consumes: final `git status` and catalog references.
- Produces: a worktree containing only product code, deployable assets, tests, metadata, and the implementation plan.

- [ ] **Step 1: Resolve every untracked output**

Classify each untracked path as production, test, documentation, or disposable diagnostics.

- [ ] **Step 2: Verify exact cleanup targets**

Resolve every removal target and ensure it remains inside `C:\Users\銘三\Desktop\機台管理系統`.

- [ ] **Step 3: Remove disposable output and recheck status**

Use native PowerShell `Remove-Item -LiteralPath` only on the verified explicit paths. Confirm no source asset or unrelated user file is removed.

### Task 5: Full verification and commit

**Files:**
- All Data Center files listed above.

**Interfaces:**
- Consumes: completed implementation and deployed assets.
- Produces: one reviewed Git commit with no temporary output.

- [ ] **Step 1: Run all Node tests**

Run:

```powershell
node --test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint and production build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect binaries and working-tree diff**

Run `scripts/inspect-glb.mjs` against every changed GLB, `git diff --check`, and review `git diff --stat`.

- [ ] **Step 4: Commit**

Stage only Data Center product code, deployable model assets, tests, scripts, metadata, and this plan. Commit with:

```text
feat: complete Data Center model pipeline
```
