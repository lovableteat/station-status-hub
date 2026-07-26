# GB300 Rack Equipment Interactive 3D Design

## Goal

Complete the existing GB300 L11 rack visualization without changing the current rack GLB or the existing L10 Compute Tray model. Add the missing rack equipment shown in the supplied hardware references and make it operationally inspectable.

## Accepted Scope

- Reuse the existing L10 model as the Compute Tray. Do not create or replace a second Compute Tray model.
- Add two Power Shelves, a central Switch Tray bank, and a bottom in-rack CDU.
- Preserve the existing `nv-mgx-rack-v1-2-rev7.glb` and all current L10 placement data.
- Limit the added equipment overlay to the built-in GB300 rack model.
- Make each assembly clickable and expose name, rack position, model/role, and health.
- Let authorized users switch health among healthy, warning, critical, and offline.
- Render Power Shelf PSU and PMC indicators, plus Switch Tray PWR, NVL, and RJ45 link/activity indicators for every health state.
- Persist status through the existing rack-device/local-storage state path.

## Reference Anatomy

Front-to-back and vertical layout follow the supplied actual rack photographs and annotated diagram:

1. Upper Power Shelf
2. Existing upper L10 Compute Tray region
3. Central Switch Tray bank
4. Existing lower L10 Compute Tray region
5. Lower Power Shelf
6. Bottom CDU

The overlay is intentionally shallower than the rack cabinet and is placed at the front service plane. Existing L10 geometry retains its original dimensions, U slots, and scene ownership.

## Architecture

### Pure equipment topology

`gb300RackEquipment.mjs` owns stable equipment IDs, display labels, U ranges, source rack-device mapping, and LED color rules. Keeping these rules outside React makes them independently testable and ensures the 3D model and inspector use the same state.

Legacy racks may contain only one Power Shelf device and no explicit CDU. The resolver creates deterministic logical equipment for display and maps them to the nearest existing source device. New seed data contains explicit upper/lower Power Shelf and CDU devices, while existing saved racks continue to render without destructive migration.

### Procedural 3D overlay

`GB300RackEquipment3D.tsx` builds the missing assemblies from small Three.js primitives:

- Power Shelf: chassis, six removable PSU/fan bays, PMC/RJ45 service block, reset control, and state LEDs.
- Switch Tray bank: repeated tray faces, PWR/fault indicators, four NVL indicators, management and RJ45 ports, and link/activity LEDs.
- CDU: bottom service chassis, controller display, fan grille, handles, and state indicator.

The overlay is a sibling of `RackL10Modules` inside `RackVisual`; it never edits or clones the L10 scene. Low-detail mode reduces repeated ports and fan details while retaining the assembly hit targets and semantic status colors.

### Interaction and persistence

Clicking an equipment assembly stops the Three.js event, selects its parent rack, and opens a compact HTML inspector anchored beside the rack. The inspector shows:

- equipment name and type
- U location
- health state
- live LED legend
- healthy / warning / critical / offline controls

State changes call the deployment center's existing immutable rack update path and are saved by the existing `sites` local-storage effect. When a logical legacy component shares a source device, the status change updates that real source device. New seed racks have independent source records.

## LED Behavior

| State | Power Shelf PSU / PMC | Switch PWR / NVL | RJ45 link / activity |
| --- | --- | --- | --- |
| Healthy | green | green | amber link, green activity |
| Warning | amber/yellow | amber with mixed NVL | amber link, intermittent/dim green |
| Critical | red/amber | red with failed NVL | dim amber, red activity/fault |
| Offline | off | off | off |

The UI also provides text labels and status buttons, so health is never communicated by color alone.

## Visual System

The new interface extends the existing Data Center dark technical palette:

- canvas/chassis: `#050b12`, `#0b1520`, `#18212b`
- structural edges: slate/steel
- selected outline: cyan
- healthy: emerald
- warning: amber
- critical: rose/red
- offline: slate

Typography, borders, radii, and control density follow the existing platform inspector rather than introducing a new design language.

## Alternatives Considered

1. Rebuild the entire rack as a new GLB. Rejected because it risks changing the current calibrated cabinet and L10 model.
2. Add a flat front texture. Rejected because individual equipment, PSUs, ports, and LEDs would not be meaningfully clickable.
3. Add an independent procedural equipment overlay. Accepted because it preserves current assets, supports complete interaction, and stays lightweight.

## Accessibility and Performance

- All state controls are code-native HTML buttons with labels and pressed state.
- The inspector remains readable without relying on 3D text.
- Repeated geometry is memoized and reduced on mobile/interaction preview.
- LEDs use emissive materials rather than many point lights.
- Pointer cursor and selected outlines make hit targets visible.

## Verification

- Pure topology tests: exact anatomy, no new Compute Tray, stable IDs/U positions, legacy fallback, and every LED state.
- Source contract tests: overlay is mounted only for GB300 and remains separate from `RackL10Modules`.
- Existing Data Center tests.
- TypeScript production build and lint on changed files.
- Browser verification at desktop and mobile widths:
  - select Power Shelf, Switch Tray, and CDU
  - inspect name/U/state
  - change healthy/warning/critical/offline
  - confirm LED changes and persisted rack device state
  - confirm existing L10 still renders and remains independently selectable/configurable

