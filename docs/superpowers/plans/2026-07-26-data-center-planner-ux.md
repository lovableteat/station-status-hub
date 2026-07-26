# Data Center 2D Planner UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make facility sizing, aisle placement, power routing, and the 2D canvas usable without requiring raw coordinate knowledge.

**Architecture:** Keep `DeploymentPlanningCenter` as the owner of persisted site/facility state, move geometry and routing decisions into small pure `.mjs` modules, and let `DataCenter2DPlanner` render and edit the same data consumed by 3D. Each of the four user requests is an independently tested and published increment.

**Tech Stack:** React 18, TypeScript, SVG, Radix/shadcn UI, localStorage, Node test runner, Vite, GitHub Pages.

## Global Constraints

- Work from `origin/main` in `codex/data-center-planner-ux`.
- Preserve existing model upload, rack placement, 2D/3D synchronization, site switching, permissions, and localStorage compatibility.
- Never force-push.
- Never auto-move an item because the floor shrank; show overflow warnings instead.
- Facility dimensions have no fixed maximum and accept finite values greater than or equal to 1 meter.
- Keep exact X/Z controls only as an advanced option.
- All routing operations require `canEdit`; read-only users can inspect.
- Before every `HEAD:main` push, fetch and rebase on a newly advanced `origin/main`, then rerun the task verification.
- After every push, verify the remote SHA and wait for the GitHub Pages run to finish successfully.

---

### Task 1: Flexible facility dimensions and overflow warnings

**Files:**
- Modify: `src/components/data-center/facilityPlan.mjs`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Modify: `tests/dataCenterSceneControls.test.mjs`
- Create: `tests/dataCenterFacilitySizing.test.mjs`

**Interfaces:**
- Produces:
  - `parseFacilityDimension(value, fallback): { valid: boolean; value: number; message: string }`
  - `getFacilityOverflowItems({ facility, racks, models }): Array<{ kind: "rack" | "aisle" | "power"; id: string; label: string }>`
- Consumed by `DeploymentPlanningCenter` for validation and by `DataCenter2DPlanner` for warning styles.

- [ ] **Step 1: Write failing pure helper tests**

Add tests that require no fixed maximum, reject non-finite/zero/negative values, round to 0.1 m, and preserve overflow coordinates:

```js
test("facility dimensions accept finite values without a fixed maximum", () => {
  assert.deepEqual(parseFacilityDimension("1250.55", 80), {
    valid: true,
    value: 1250.6,
    message: "",
  });
  assert.equal(parseFacilityDimension("", 80).valid, false);
  assert.equal(parseFacilityDimension("Infinity", 80).valid, false);
  assert.equal(parseFacilityDimension("0", 80).valid, false);
  assert.equal(parseFacilityDimension("-4", 80).valid, false);
});

test("shrinking a facility reports overflow without changing coordinates", () => {
  const rack = { id: "rack-a", cabinet: "A01", positionX: 10, positionZ: 0, rotation: 0 };
  const result = getFacilityOverflowItems({
    facility: { width: 10, depth: 10, aisles: [], powerFeeds: [] },
    racks: [rack],
    models: { rack: { dimensions: { widthMm: 600, depthMm: 1200 } } },
  });
  assert.deepEqual(result.map((item) => item.id), ["rack-a"]);
  assert.equal(rack.positionX, 10);
});
```

- [ ] **Step 2: Run the new and existing sizing tests and verify RED**

Run:

```powershell
node --test tests/dataCenterFacilitySizing.test.mjs tests/dataCenterSceneControls.test.mjs
```

Expected: FAIL because `parseFacilityDimension` and overflow helpers do not exist and the old 8–80 m assertions remain.

- [ ] **Step 3: Implement dimension parsing and overflow geometry**

In `facilityPlan.mjs`:

```js
export const MIN_FACILITY_DIMENSION_METERS = 1;

export function parseFacilityDimension(value, fallback = MIN_FACILITY_DIMENSION_METERS) {
  const numeric = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(numeric) || numeric < MIN_FACILITY_DIMENSION_METERS) {
    return {
      valid: false,
      value: Number.isFinite(Number(fallback)) ? Number(fallback) : MIN_FACILITY_DIMENSION_METERS,
      message: "請輸入大於或等於 1 的有限數字。",
    };
  }
  return { valid: true, value: Math.round(numeric * 10) / 10, message: "" };
}
```

Add footprint-aware rack bounds, rotated aisle bounds, PDU point bounds, and `getFacilityOverflowItems`. Do not clamp or mutate any source object:

```js
function outside(value, halfExtent, itemHalfExtent = 0) {
  return value - itemHalfExtent < -halfExtent || value + itemHalfExtent > halfExtent;
}

export function getFacilityOverflowItems({ facility, racks, models }) {
  const overflow = [];
  for (const rack of racks) {
    const model = models[rack.modelId] ?? models["generic-42u"];
    const rotated = Math.abs(rack.rotation % 180) === 90;
    const width = (rotated ? model.dimensions.depthMm : model.dimensions.widthMm) / 1000;
    const depth = (rotated ? model.dimensions.widthMm : model.dimensions.depthMm) / 1000;
    if (
      outside(rack.positionX, facility.width / 2, width / 2) ||
      outside(rack.positionZ, facility.depth / 2, depth / 2)
    ) {
      overflow.push({ kind: "rack", id: rack.id, label: rack.cabinet });
    }
  }
  for (const aisle of facility.aisles) {
    const rotated = Math.abs(aisle.rotation % 180) === 90;
    const width = rotated ? aisle.depth : aisle.width;
    const depth = rotated ? aisle.width : aisle.depth;
    if (
      outside(aisle.x, facility.width / 2, width / 2) ||
      outside(aisle.z, facility.depth / 2, depth / 2)
    ) {
      overflow.push({ kind: "aisle", id: aisle.id, label: aisle.label });
    }
  }
  for (const feed of facility.powerFeeds) {
    if (outside(feed.x, facility.width / 2) || outside(feed.z, facility.depth / 2)) {
      overflow.push({ kind: "power", id: feed.id, label: feed.label });
    }
  }
  return overflow;
}
```

- [ ] **Step 4: Replace immediate normalized inputs with drafts**

In `DeploymentPlanningCenter`:

```ts
const [facilitySizeDraft, setFacilitySizeDraft] = useState({
  width: String(selectedFacility.width),
  depth: String(selectedFacility.depth),
});
const [facilitySizeErrors, setFacilitySizeErrors] = useState<
  Partial<Record<"width" | "depth", string>>
>({});

const commitFacilityDimension = (field: "width" | "depth") => {
  const parsed = parseFacilityDimension(facilitySizeDraft[field], selectedFacility[field]);
  if (!parsed.valid) {
    setFacilitySizeErrors((current) => ({ ...current, [field]: parsed.message }));
    return false;
  }
  updateFacility((facility) => ({ ...facility, [field]: parsed.value }));
  setFacilitySizeDraft((current) => ({ ...current, [field]: String(parsed.value) }));
  setFacilitySizeErrors((current) => ({ ...current, [field]: "" }));
  return true;
};
```

Synchronize drafts on site change, commit on Enter/blur and from an explicit「套用尺寸」button, remove `max={80}`, and keep `min={1}`. The plus button increments without an upper-bound disabled state.

- [ ] **Step 5: Render overflow summary and canvas warnings**

Compute `overflowItems` from the selected facility/racks/models. Render a warning summary in the settings dialog and pass a `Set<string>` of `kind:id` keys to the 2D planner. In SVG, add a rose warning outline and badge without changing item coordinates. Clicking a rack warning selects the rack; aisle/PDU warnings switch to 2D and highlight the matching item.

```tsx
const overflowItems = useMemo(
  () => getFacilityOverflowItems({
    facility: selectedFacility,
    racks: selectedSite.racks,
    models,
  }),
  [models, selectedFacility, selectedSite.racks],
);
const overflowKeys = useMemo(
  () => new Set(overflowItems.map((item) => `${item.kind}:${item.id}`)),
  [overflowItems],
);

{overflowItems.length > 0 ? (
  <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/10 p-3">
    <div className="font-bold text-rose-100">{overflowItems.length} 個物件超出新邊界</div>
    {overflowItems.map((item) => (
      <button key={`${item.kind}:${item.id}`} type="button" onClick={() => focusOverflowItem(item)}>
        {item.label}
      </button>
    ))}
  </div>
) : null}
```

- [ ] **Step 6: Run Task 1 verification**

Run:

```powershell
node --test tests/dataCenterFacilitySizing.test.mjs tests/dataCenterSceneControls.test.mjs tests/dataCenter2DPlanner.test.mjs
node --test tests/dataCenter*.test.mjs
npx.cmd eslint src/components/data-center/DeploymentPlanningCenter.tsx src/components/data-center/DataCenter2DPlanner.tsx
npm.cmd run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit, synchronize, push, and verify Pages**

```powershell
git add src/components/data-center/facilityPlan.mjs src/components/data-center/DeploymentPlanningCenter.tsx src/components/data-center/DataCenter2DPlanner.tsx tests/dataCenterSceneControls.test.mjs tests/dataCenterFacilitySizing.test.mjs docs/superpowers
git commit -m "fix(data-center): allow flexible facility sizing"
git fetch origin main
git rebase origin/main
node --test tests/dataCenterFacilitySizing.test.mjs tests/dataCenterSceneControls.test.mjs tests/dataCenter2DPlanner.test.mjs
npm.cmd run build
git push origin HEAD:main
```

Verify `origin/main == HEAD`; query the GitHub Actions run for the pushed SHA until `Deploy to GitHub Pages` concludes `success`.

---

### Task 2: Visual aisle creation, drag, resize, and friendly positioning

**Files:**
- Create: `src/components/data-center/facilityAisles.mjs`
- Create: `src/components/data-center/FacilityAisleCreationDialog.tsx`
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Create: `tests/dataCenterAislePlanning.test.mjs`
- Modify: `tests/dataCenter2DPlanner.test.mjs`

**Interfaces:**
- Produces:
  - `createAutomaticAisle({ kind, orientation, racks, models, facility }): FacilityAislePlan`
  - `createFreeAisle({ kind, orientation, facility }): FacilityAislePlan`
  - `getFriendlyAislePosition(aisle, facility): { left: number; top: number }`
  - `resizeAisleFromHandle(aisle, handle, point): FacilityAislePlan`
  - `getAisleResizeHandles(aisle): Array<{ id: "start" | "end" | "near" | "far"; x: number; z: number }>`
- `FacilityAisleCreationDialog` returns `{ mode, kind, orientation, rackIds }`.

- [ ] **Step 1: Write failing aisle geometry tests**

```js
test("automatic aisles span selected rack footprints with one meter end clearance", () => {
  const aisle = createAutomaticAisle({
    kind: "cold",
    orientation: "horizontal",
    racks: selectedRacks,
    models,
    facility,
  });
  assert.equal(aisle.kind, "cold");
  assert.equal(aisle.rotation, 0);
  assert.ok(aisle.width >= selectedRackSpan + 2);
  assert.equal(aisle.depth, 2.1);
});

test("friendly positions do not require center based X and Z knowledge", () => {
  assert.deepEqual(
    getFriendlyAislePosition({ x: 0, z: 0, width: 4, depth: 2, rotation: 0 }, { width: 20, depth: 10 }),
    { left: 8, top: 4 },
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/dataCenterAislePlanning.test.mjs tests/dataCenter2DPlanner.test.mjs
```

Expected: FAIL because the aisle helper module, creation choice, and resize handles do not exist.

- [ ] **Step 3: Implement pure aisle geometry**

Use 0.25 m snapping. Automatic horizontal aisles calculate the min/max rack X footprint; vertical aisles calculate min/max rack Z footprint. Keep the result inside the floor when possible but do not change existing aisle data during later floor resize. Free aisles start at the center with a safe 4 m length.

```js
const snapQuarter = (value) => Math.round(value * 4) / 4;

export function createFreeAisle({ kind, orientation, facility }) {
  const horizontal = orientation === "horizontal";
  return {
    id: `${kind}-${crypto.randomUUID()}`,
    label: `${kind === "cold" ? "冷通道" : "熱通道"} ${facility.aisles.length + 1}`,
    kind,
    x: 0,
    z: 0,
    width: Math.min(4, horizontal ? facility.width : facility.depth),
    depth: kind === "cold" ? 2.1 : 1.15,
    rotation: horizontal ? 0 : 90,
  };
}

export function getFriendlyAislePosition(aisle, facility) {
  const rotated = Math.abs(aisle.rotation % 180) === 90;
  const width = rotated ? aisle.depth : aisle.width;
  const depth = rotated ? aisle.width : aisle.depth;
  return {
    left: snapQuarter(aisle.x + facility.width / 2 - width / 2),
    top: snapQuarter(aisle.z + facility.depth / 2 - depth / 2),
  };
}
```

- [ ] **Step 4: Add the automatic/free creation dialog**

The dialog must:

- choose cold/hot;
- choose automatic/free;
- choose horizontal/vertical;
- for automatic mode, select all racks or explicit rack IDs;
- disable submit with a clear message when automatic mode has no target rack;
- call a single `onCreate(request)` callback.

```ts
export type FacilityAisleCreationRequest = {
  mode: "automatic" | "free";
  kind: FacilityAisleKind;
  orientation: FacilityAisleOrientation;
  rackIds: string[];
};

interface FacilityAisleCreationDialogProps {
  open: boolean;
  racks: RackPlan[];
  onOpenChange: (open: boolean) => void;
  onCreate: (request: FacilityAisleCreationRequest) => void;
}

const canSubmit =
  draft.mode === "free" || draft.rackIds.length > 0;
const submit = () => {
  if (!canSubmit) {
    setError("自動配置至少需要選擇一座機櫃。");
    return;
  }
  onCreate(draft);
  onOpenChange(false);
};
```

- [ ] **Step 5: Add canvas direct manipulation**

When an aisle is selected in cooling mode:

- render start/end or corner resize handles;
- use pointer capture;
- call `resizeAisleFromHandle` during drag;
- retain existing body dragging;
- expose a 90° rotate action;
- show friendly left/top/length/width controls;
- put X/Z/rotation under a collapsed「進階座標」section.

```tsx
{planMode === "cooling" && selected ? (
  <g data-aisle-handles={aisle.id}>
    {getAisleResizeHandles(aisle).map((handle) => {
      const point = toScreen(handle.x, handle.z);
      return (
        <rect
          key={handle.id}
          x={point.x - 7}
          y={point.y - 7}
          width="14"
          height="14"
          rx="3"
          onPointerDown={(event) => beginAisleResize(event, aisle, handle.id)}
        />
      );
    })}
  </g>
) : null}
```

- [ ] **Step 6: Run Task 2 verification**

Run:

```powershell
node --test tests/dataCenterAislePlanning.test.mjs tests/dataCenter2DPlanner.test.mjs
node --test tests/dataCenter*.test.mjs
npx.cmd eslint src/components/data-center/FacilityAisleCreationDialog.tsx src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx
npm.cmd run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit, synchronize, push, and verify Pages**

Commit:

```powershell
git add src/components/data-center/facilityAisles.mjs src/components/data-center/FacilityAisleCreationDialog.tsx src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx tests/dataCenterAislePlanning.test.mjs tests/dataCenter2DPlanner.test.mjs
git commit -m "feat(data-center): add visual aisle planning"
```

Fetch and rebase on an advanced `origin/main`, rerun the focused tests and build, push `HEAD:main` without force, confirm the remote SHA, and wait for a successful Pages run.

---

### Task 3: Complete power routing workflows

**Files:**
- Modify: `src/components/data-center/dataCenterTypes.ts`
- Create: `src/components/data-center/powerRouting.mjs`
- Create: `src/components/data-center/PowerRoutingPanel.tsx`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Create: `tests/dataCenterPowerRouting.test.mjs`
- Modify: `tests/dataCenter2DPlanner.test.mjs`

**Interfaces:**
- Produces:
  - `normalizePowerPlan(facility, racks): FacilityPlan`
  - `calculatePowerFeedLoad(feedId, routes, racks): number`
  - `createOrthogonalRoute(feed, rack, obstacles): FacilityPoint[]`
  - `assignAutomaticPowerRoutes({ feeds, racks, existingRoutes }): { routes, overloadedFeedIds, unassignedRackIds }`
  - `snapFacilityPoint(point): FacilityPoint`
- `PowerRoutingPanel` consumes feeds, routes, racks and emits add/update/delete/apply callbacks.
- `DataCenter2DPlanner` gains `onCreatePowerRoute(request)` and `onUpdatePowerRoute(routeId, patch)`.

- [ ] **Step 1: Write failing migration, load, and routing tests**

Cover:

```js
test("legacy facility power data gains capacity and one route per rack", () => {
  const result = normalizePowerPlan(legacyFacility, racks);
  assert.equal(result.powerFeeds[0].capacityKw, 120);
  assert.equal(new Set(result.powerRoutes.map((route) => route.rackId)).size, racks.length);
});

test("automatic routing prefers a nearby feed with remaining capacity", () => {
  const result = assignAutomaticPowerRoutes({ feeds, racks, existingRoutes: [] });
  assert.equal(result.unassignedRackIds.length, 0);
  assert.equal(result.routes.length, racks.length);
});

test("capacity shortages remain visible instead of dropping racks", () => {
  const result = assignAutomaticPowerRoutes({ feeds: undersizedFeeds, racks, existingRoutes: [] });
  assert.equal(result.routes.length, racks.length);
  assert.ok(result.overloadedFeedIds.length > 0);
});
```

- [ ] **Step 2: Run the power tests and verify RED**

Run:

```powershell
node --test tests/dataCenterPowerRouting.test.mjs tests/dataCenter2DPlanner.test.mjs
```

Expected: FAIL because `powerRoutes`, capacity, routing helpers, and route editing are missing.

- [ ] **Step 3: Extend types and normalize legacy storage**

Add `FacilityPoint`, `PowerRouteMode`, `PowerRoutePlan`, `capacityKw`, and `FacilityPlan.powerRoutes`. Update `DEFAULT_FACILITY_PLAN`, cloning, and `readInitialFacilityPlans` so old records are upgraded without overwriting valid user routes.

```ts
export interface FacilityPoint {
  x: number;
  z: number;
}

export type PowerRouteMode = "manual" | "assisted" | "automatic";

export interface PowerRoutePlan {
  id: string;
  feedId: string;
  rackId: string;
  mode: PowerRouteMode;
  points: FacilityPoint[];
  enabled: boolean;
}

export interface PowerFeedPlan {
  id: string;
  label: string;
  x: number;
  z: number;
  color: string;
  enabled: boolean;
  capacityKw: number;
}
```

- [ ] **Step 4: Implement route calculation**

- Canonicalize PDU/rack feed names by lowercasing and removing spaces/hyphens.
- Build orthogonal routes with `[start, bend, end]`.
- Calculate load from unique enabled `(feedId, rackId)` routes.
- Automatic assignment sorts candidate feeds by overload penalty, remaining capacity, then Manhattan distance.
- Always return a route for each rack when at least one enabled feed exists; flag overload rather than hiding the rack.

```js
export function createOrthogonalRoute(feed, rack) {
  return [
    { x: feed.x, z: feed.z },
    { x: rack.positionX, z: feed.z },
    { x: rack.positionX, z: rack.positionZ },
  ];
}

export function calculatePowerFeedLoad(feedId, routes, racks) {
  const rackById = new Map(racks.map((rack) => [rack.id, rack]));
  const assigned = new Set(
    routes
      .filter((route) => route.enabled && route.feedId === feedId)
      .map((route) => route.rackId),
  );
  return Array.from(assigned).reduce(
    (sum, rackId) => sum + (rackById.get(rackId)?.powerKw ?? 0),
    0,
  );
}
```

- [ ] **Step 5: Implement the routing panel**

Provide:

- PDU cards with capacity, assigned kW, usage percentage, rack count and overload badge;
-「手動畫線」、「指定設備自動」、「全自動分配」actions;
- assisted multi-rack selection;
- an automatic preview requiring explicit confirmation;
- route enable, reassign and delete controls.

```ts
interface PowerRoutingPanelProps {
  feeds: PowerFeedPlan[];
  routes: PowerRoutePlan[];
  racks: RackPlan[];
  selectedFeedId: string | null;
  canEdit: boolean;
  onSelectFeed: (feedId: string) => void;
  onStartManual: (feedId: string) => void;
  onCreateAssisted: (feedId: string, rackIds: string[]) => void;
  onPreviewAutomatic: () => void;
  onUpdateRoute: (routeId: string, patch: Partial<PowerRoutePlan>) => void;
  onDeleteRoute: (routeId: string) => void;
}
```

- [ ] **Step 6: Implement manual and assisted canvas routing**

Add a route draft state:

```ts
type PowerRouteDraft = {
  feedId: string;
  points: FacilityPoint[];
};
```

In power mode, click a PDU to start, click empty floor to append snapped points, click a rack to finish. Handle Enter, Escape and Backspace. Render route points as draggable SVG handles and persist the edited `points`. Assisted mode calls `createOrthogonalRoute` for selected rack IDs.

```ts
type PowerRouteDraft = {
  feedId: string;
  points: FacilityPoint[];
};

const appendRoutePoint = (point: FacilityPoint) => {
  setPowerRouteDraft((current) =>
    current
      ? { ...current, points: [...current.points, snapFacilityPoint(point)] }
      : current,
  );
};

const finishRouteAtRack = (rackId: string) => {
  if (!powerRouteDraft) return;
  const targetRack = rackById.get(rackId);
  onCreatePowerRoute({
    feedId: powerRouteDraft.feedId,
    rackId,
    mode: "manual",
    points: [...powerRouteDraft.points, {
      x: targetRack?.positionX ?? 0,
      z: targetRack?.positionZ ?? 0,
    }],
  });
  setPowerRouteDraft(null);
};
```

- [ ] **Step 7: Run Task 3 verification**

Run:

```powershell
node --test tests/dataCenterPowerRouting.test.mjs tests/dataCenter2DPlanner.test.mjs
node --test tests/dataCenter*.test.mjs
npx.cmd eslint src/components/data-center/PowerRoutingPanel.tsx src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx
npm.cmd run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit, synchronize, push, and verify Pages**

Commit:

```powershell
git add src/components/data-center/dataCenterTypes.ts src/components/data-center/powerRouting.mjs src/components/data-center/PowerRoutingPanel.tsx src/components/data-center/DeploymentPlanningCenter.tsx src/components/data-center/DataCenter2DPlanner.tsx tests/dataCenterPowerRouting.test.mjs tests/dataCenter2DPlanner.test.mjs
git commit -m "feat(data-center): add guided power routing"
```

Fetch/rebase if `origin/main` advanced, rerun focused tests/build, push non-force to `main`, verify SHA, and wait for successful Pages deployment.

---

### Task 4: Declutter the 2D canvas with dedicated work modes

**Files:**
- Modify: `src/components/data-center/DataCenter2DPlanner.tsx`
- Modify: `src/components/data-center/DeploymentPlanningCenter.tsx`
- Create: `src/components/data-center/DataCenterPlanInspector.tsx`
- Create: `tests/dataCenterPlanModes.test.mjs`
- Modify: `tests/dataCenter2DPlanner.test.mjs`

**Interfaces:**
- Produces `type DataCenterPlanMode = "layout" | "cooling" | "power"`.
- `DataCenterPlanInspector` consumes the current selection, mode, warnings, and mode-specific editing callbacks.
- `DataCenter2DPlanner` consumes `planMode` and `onPlanModeChange`.

- [ ] **Step 1: Write failing mode visibility tests**

```js
test("layout, cooling, and power modes expose distinct primary layers", () => {
  assert.match(source, /type DataCenterPlanMode = "layout" \| "cooling" \| "power"/);
  assert.match(source, /data-plan-mode="layout"/);
  assert.match(source, /data-plan-mode="cooling"/);
  assert.match(source, /data-plan-mode="power"/);
  assert.match(source, /planMode === "layout"/);
  assert.match(source, /planMode === "cooling"/);
  assert.match(source, /planMode === "power"/);
});

test("secondary rack model labels only render for the selected rack or detailed zoom", () => {
  assert.match(source, /selected \|\| viewport\.zoom >= 1\.6/);
});
```

- [ ] **Step 2: Run the mode tests and verify RED**

Run:

```powershell
node --test tests/dataCenterPlanModes.test.mjs tests/dataCenter2DPlanner.test.mjs
```

Expected: FAIL because all layers currently render together and no mode type/selector exists.

- [ ] **Step 3: Add the mode switch and layer policies**

Render one compact segmented control:

```tsx
{([
  ["layout", "配置"],
  ["cooling", "冷卻"],
  ["power", "電力"],
] as const).map(([mode, label]) => (
  <button
    key={mode}
    data-plan-mode={mode}
    aria-pressed={planMode === mode}
    onClick={() => onPlanModeChange(mode)}
  >
    {label}
  </button>
))}
```

Apply:

- layout: rack primary, aisle low-opacity, PDU compact, routes hidden;
- cooling: aisle primary, rack neutral, PDU/routes hidden;
- power: PDU/routes primary, rack endpoint style, aisle hidden.

- [ ] **Step 4: Reduce label and glow noise**

- Always show rack cabinet ID.
- Show model name only for selected rack or `viewport.zoom >= 1.6`.
- Replace full unselected rack glow with a small health corner marker.
- Show PDU label in the inspector unless power mode or selected.
- Hide route node handles unless the route is selected.

```tsx
<text>{rack.cabinet}</text>
{selected || viewport.zoom >= 1.6 ? <text>{model.name}</text> : null}
{selected ? (
  <rect data-testid={`data-center-rack-glow-${rack.id}`} />
) : (
  <circle
    data-testid={`data-center-rack-status-${rack.id}`}
    cx={center.x + width / 2 - 5}
    cy={center.y - height / 2 + 5}
    r="4"
    fill={lighting.glow}
  />
)}
```

- [ ] **Step 5: Move selection details into a stable inspector**

Create `DataCenterPlanInspector` as a right-side desktop panel and bottom sheet on narrow screens. It renders only the selected mode's relevant controls and the shared overflow/overload/unpowered warning list. Remove the large bottom overlays that obscure the floor.

```ts
interface DataCenterPlanInspectorProps {
  mode: DataCenterPlanMode;
  selectedRack: RackPlan | null;
  selectedAisle: FacilityAislePlan | null;
  selectedFeed: PowerFeedPlan | null;
  selectedRoute: PowerRoutePlan | null;
  overflowItems: Array<{
    kind: "rack" | "aisle" | "power";
    id: string;
    label: string;
  }>;
  overloadedFeedIds: string[];
  unpoweredRackIds: string[];
  canEdit: boolean;
  onCloseSelection: () => void;
}
```

- [ ] **Step 6: Run final verification**

Run:

```powershell
node --test tests/dataCenterPlanModes.test.mjs tests/dataCenter2DPlanner.test.mjs tests/dataCenterFacilitySizing.test.mjs tests/dataCenterAislePlanning.test.mjs tests/dataCenterPowerRouting.test.mjs
node --test tests/dataCenter*.test.mjs
npx.cmd eslint src/components/data-center/DataCenterPlanInspector.tsx src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx
npm.cmd run build
git diff --check
```

Then use a real browser at the production viewport and verify:

- each mode has one obvious primary layer;
- no overlapping PDU/rack/aisle labels at default zoom;
- selected object controls remain visible without covering the floor;
- switching modes does not mutate facility data;
- refresh restores the facility, aisles, feeds, and routes.

- [ ] **Step 7: Commit, synchronize, push, and verify Pages**

Commit:

```powershell
git add src/components/data-center/DataCenterPlanInspector.tsx src/components/data-center/DataCenter2DPlanner.tsx src/components/data-center/DeploymentPlanningCenter.tsx tests/dataCenterPlanModes.test.mjs tests/dataCenter2DPlanner.test.mjs
git commit -m "feat(data-center): organize 2d planning modes"
```

Fetch/rebase on any newly advanced `origin/main`, rerun the complete Data Center suite and build, push non-force to `main`, verify remote SHA, and wait for successful Pages deployment.

## Final regression checklist

- [ ] All four feature commits appear on `origin/main` in order.
- [ ] No force push was used.
- [ ] No unrelated files differ from the pre-task `origin/main`.
- [ ] Data Center tests pass.
- [ ] Targeted ESLint passes.
- [ ] Production build passes.
- [ ] GitHub Pages is successful for every feature SHA.
- [ ] The original local branch remains untouched.
- [ ] The isolated worktree remains available until the user accepts the result.
