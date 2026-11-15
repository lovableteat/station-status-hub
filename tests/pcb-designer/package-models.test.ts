import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILT_IN_COMPONENTS } from "../../src/components/pcb-designer/defaults.ts";
import { isPcbModelAsset, mapPcbModelPartToComponentSpace } from "../../src/components/pcb-designer/core/modelAssets.ts";
import {
  PCB_PACKAGE_KEYS,
  getLoadedPcbPackageKit,
  getPcbPackageAsset,
  isPcbPackageKit,
  isPcbPackageModelChoice,
  loadPcbPackageKit,
  resetPcbPackageKitForTests,
  resolvePcbPackageKey,
  type PcbPackageKit,
} from "../../src/components/pcb-designer/core/packageModels.ts";
import { getPcbMountY } from "../../src/components/pcb-designer/core/software3d.ts";
import { parseProjectJson } from "../../src/components/pcb-designer/core/validation.ts";
import { createWorkspaceState, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import type { PcbPlacedComponent } from "../../src/components/pcb-designer/types.ts";

const kit = JSON.parse(await readFile(new URL("../../public/models/pcb/pcb-package-kit.json", import.meta.url), "utf8")) as PcbPackageKit;
const builtIn = (id: string) => BUILT_IN_COMPONENTS.find((component) => component.id === id)!;
const placed = (part: Partial<PcbPlacedComponent>): PcbPlacedComponent => ({
  ...BUILT_IN_COMPONENTS[0], instanceId: "c", reference: "U1", x: 0, y: 0, rotation: 0, layer: "top", locked: false, ...part,
}) as PcbPlacedComponent;
const custom = (packageModel: PcbPlacedComponent["packageModel"], width: number, height: number, maxHeight: number, extra: Partial<PcbPlacedComponent> = {}) =>
  placed({ id: "custom-part", type: "Other", shape: "rectangle", packageModel, width, height, maxHeight, ...extra });
/** Measured extent of the assembled geometry, before the shared mapper. */
const measured = (asset: NonNullable<ReturnType<typeof getPcbPackageAsset>>) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of asset.parts) for (let i = 0; i < part.position.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], part.position[i + axis]); max[axis] = Math.max(max[axis], part.position[i + axis]); }
  }
  return { min, max };
};

test("the Blender kit is valid; a kit missing a piece, with non-numeric coordinates or bad colours is rejected", () => {
  assert.equal(isPcbPackageKit(kit), true);
  const without = structuredClone(kit); delete without.pieces.qfp_lead;
  assert.equal(isPcbPackageKit(without), false, "missing piece");
  const broken = structuredClone(kit); (broken.pieces.body_block.positions as unknown[])[0] = "x";
  assert.equal(isPcbPackageKit(broken), false, "non-numeric coordinate");
  const badColor = structuredClone(kit); badColor.pieces.body_block.color = [2, 0, 0];
  assert.equal(isPcbPackageKit(badColor), false, "colour outside 0..1");
  assert.equal(isPcbPackageKit({ schemaVersion: 1, pieces: {} }), false);
  assert.equal(isPcbPackageKit({ schemaVersion: 1, pieces: [] }), false);
  assert.equal(isPcbPackageKit({ ...kit, schemaVersion: 2 }), false);
});

test("package choice: STEP wins, then the explicit 3D 示意外形, built-in ids, and only unambiguous types; never the name", () => {
  assert.equal(resolvePcbPackageKey(builtIn("builtin-u-stm32f407vgt6")), "qfp");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-j-12401548e4")), "usb-c");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-j-47053-1000")), "header", "same type as USB-C, told apart by library id");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-screw-hole")), null, "screw holes are not packages");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Resistor" })), "chip-resistor");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: " capacitor ", shape: "rectangle" })), "chip-capacitor");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Capacitor", shape: "circle" })), "electrolytic");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Inductor" })), "inductor");
  for (const type of ["IC", "Processor", "Memory", "Connector", "Other"]) {
    assert.equal(resolvePcbPackageKey(placed({ id: "x", type, width: 14, height: 14 })), null, `${type} alone does not tell the package`);
  }
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Other", name: "USB-C connector QFP resistor" })), null, "the name is never used");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "IC", packageModel: "qfn" })), "qfn", "explicit choice");
  assert.equal(resolvePcbPackageKey(placed({ id: "builtin-u-stm32f407vgt6", packageModel: "box" })), null, "explicit box keeps the box");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "IC", packageModel: "made-up" as never })), null, "unknown values are ignored");
  assert.equal(resolvePcbPackageKey(placed({ id: "builtin-u-stm32f407vgt6", packageModel: "qfn", modelAssetId: "step-1" })), null, "a STEP model wins");
  assert.equal(getPcbPackageAsset(placed({ id: "builtin-u-stm32f407vgt6" }), null), null, "no kit: today's procedural body stays");
});

test("every package at many supported sizes is a valid asset whose measured geometry stays inside 長×寬×高 and starts at height 0", () => {
  const sizes: Record<string, Array<[number, number, number]>> = {
    "chip-resistor": [[0.4, 0.2, 0.15], [1.6, 0.8, 0.55], [6.4, 3.2, 1]],
    "chip-capacitor": [[0.4, 0.2, 0.15], [1.6, 0.8, 0.9], [5.7, 5, 2.5]],
    qfp: [[4, 4, 0.8], [14, 14, 1.6], [28, 20, 3.4], [60, 60, 6]],
    qfn: [[1.2, 1.2, 0.3], [3, 3, 1], [8, 8, 0.9]],
    bga: [[2, 2, 0.5], [11, 9, 1.2], [35, 35, 3]],
    inductor: [[0.8, 0.8, 0.3], [3, 3, 1.4], [12, 12, 6]],
    "usb-c": [[8.94, 7.35, 3.26], [9, 7, 3.2], [10, 8, 4]],
    header: [[1.5, 1.5, 2], [10, 3, 5], [50, 8, 8.5], [120, 20, 20]],
    electrolytic: [[2, 2, 2], [8, 8, 10], [10, 12, 16]],
  };
  for (const key of PCB_PACKAGE_KEYS) for (const [W, D, H] of sizes[key]) {
    const asset = getPcbPackageAsset(custom(key, W, D, H), kit);
    assert.ok(asset, `${key} ${W}x${D}x${H} is supported`);
    assert.equal(isPcbModelAsset(asset), true, `${key} ${W}x${D}x${H} is a valid model asset`);
    assert.ok(asset!.metadata.id.startsWith("package:"), "never confused with a stored STEP asset");
    const { min, max } = measured(asset!);
    assert.ok(max[0] <= W / 2 + 1e-6 && min[0] >= -W / 2 - 1e-6, `${key} ${W}x${D}x${H} x inside`);
    assert.ok(max[2] <= D / 2 + 1e-6 && min[2] >= -D / 2 - 1e-6, `${key} ${W}x${D}x${H} z inside`);
    assert.ok(min[1] >= -1e-6 && max[1] <= H + 1e-6, `${key} ${W}x${D}x${H} y inside`);
    assert.ok(Math.abs(min[1]) < 1e-6, `${key} ${W}x${D}x${H} lowest point at 0`);
    // Through the shared mapper the lowest point sits on the board at insertion depth 0 and the height is kept.
    const component = custom(key, W, D, H);
    let low = Infinity, high = -Infinity;
    for (const part of asset!.parts) {
      const mapped = mapPcbModelPartToComponentSpace(part, asset!, component);
      for (let i = 1; i < mapped.length; i += 3) { low = Math.min(low, mapped[i]); high = Math.max(high, mapped[i]); }
    }
    assert.ok(Math.abs(low + H / 2) < 1e-6 && high <= H / 2 + 1e-6, `${key} ${W}x${D}x${H} mapped lowest point and height`);
  }
});

test("unsupported sizes fall back to the procedural body instead of negative scales, thick terminals or geometry outside the box", () => {
  assert.equal(getPcbPackageAsset(custom("chip-resistor", 0.1, 0.1, 0.1), kit), null, "tiny chip");
  assert.equal(getPcbPackageAsset(custom("qfn", 3, 3, 0.01), kit), null, "QFN thinner than its pads");
  assert.equal(getPcbPackageAsset(custom("qfp", 14, 14, 0.1), kit), null, "QFP lower than its leads");
  assert.equal(getPcbPackageAsset({ ...builtIn("builtin-j-12401548e4"), instanceId: "u", reference: "J1", x: 0, y: 0, rotation: 0, layer: "top", locked: false, maxHeight: 50 } as PcbPlacedComponent, kit), null,
    "a 50 mm tall USB-C would stretch its contacts and legs");
  assert.equal(getPcbPackageAsset(custom("electrolytic", 1, 1, 10), kit), null);
});

test("pins, posts and solder balls keep their own cross-section on large parts", () => {
  const postWidth = (asset: NonNullable<ReturnType<typeof getPcbPackageAsset>>) => {
    const index = asset.metadata.parts.findIndex((part) => part.name === "pin");
    const xs = asset.parts[index].position.filter((_, i) => i % 3 === 0);
    const left = Math.min(...xs);
    return Math.min(...xs.filter((x) => x > left + 1e-6)) - left;
  };
  const small = getPcbPackageAsset(custom("header", 10, 3, 5), kit)!;
  const large = getPcbPackageAsset(custom("header", 50, 8, 20), kit)!;
  assert.ok(Math.abs(postWidth(small) - postWidth(large)) < 0.05 && postWidth(large) <= 0.65, "header posts keep 0.64 mm");
  const big = getPcbPackageAsset(custom("qfp", 30, 30, 3.5), kit)!;
  const lead = big.parts[big.metadata.parts.findIndex((part) => part.name === "lead")];
  const leadTop = Math.max(...lead.position.filter((_, i) => i % 3 === 1));
  assert.ok(leadTop <= 1.0, "QFP leads stay thin and low on a tall body");
  const bga = getPcbPackageAsset(custom("bga", 35, 35, 3), kit)!;
  const balls = bga.parts[bga.metadata.parts.findIndex((part) => part.name === "solder ball terminal")];
  const ballTriangles = kit.pieces.bga_ball.indices.length / 3;
  assert.ok(balls.index.length / 3 / ballTriangles <= 4 * 40, "only the outer ring of balls is built");
});

test("Top and Bottom insertion depth still move into the board with the same shared mount offset", () => {
  const part = placed({ ...builtIn("builtin-j-47053-1000"), insertionDepth: 1.5 });
  assert.equal(getPcbMountY({ ...part, layer: "top" }, 1.6), 0.8 + part.maxHeight / 2 - 1.5);
  assert.equal(getPcbMountY({ ...part, layer: "bottom" }, 1.6), -(0.8 + part.maxHeight / 2 - 1.5));
});

test("the kit loads once (parallel calls share one request); an invalid kit is not cached as a success", async () => {
  resetPcbPackageKitForTests();
  let calls = 0;
  const invalid = (async () => { calls += 1; return new Response(JSON.stringify({ schemaVersion: 1, pieces: {} })); }) as typeof fetch;
  assert.equal(await loadPcbPackageKit("/kit.json", invalid), null);
  assert.equal(getLoadedPcbPackageKit(), null);
  const working = (async () => { calls += 1; return new Response(JSON.stringify(kit)); }) as typeof fetch;
  const [first, second] = await Promise.all([loadPcbPackageKit("/kit.json", working), loadPcbPackageKit("/kit.json", working)]);
  assert.equal(first, second, "parallel callers share one request");
  assert.equal(isPcbPackageKit(first), true);
  assert.equal(getLoadedPcbPackageKit(), first, "the inspector can read the loaded kit without downloading");
  assert.equal(calls, 2, "one invalid attempt, one shared good request");
  resetPcbPackageKitForTests();
  let failures = 0;
  const failing = (async () => { failures += 1; return new Response("nope", { status: 404 }); }) as typeof fetch;
  for (let i = 0; i < 5; i++) await loadPcbPackageKit("/kit.json", failing);
  assert.equal(failures, 3, "gives up after three failed attempts; the boxes stay");
  resetPcbPackageKitForTests();
});

test("a 3D 示意外形 name must be a real package; prototype names from an imported file count as automatic", () => {
  for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "QFN", ""]) {
    assert.equal(isPcbPackageModelChoice(name), false, name);
    const part = custom(name as PcbPlacedComponent["packageModel"], 5, 5, 1);
    assert.doesNotThrow(() => resolvePcbPackageKey(part), name);
    assert.equal(resolvePcbPackageKey(part), null, `${name} falls back to the box`);
    assert.doesNotThrow(() => getPcbPackageAsset(part, kit), name);
  }
  assert.equal(isPcbPackageModelChoice("box"), true);
  for (const key of PCB_PACKAGE_KEYS) assert.equal(isPcbPackageModelChoice(key), true, key);
  const project = { ...createBlankProject("匯入"), components: [custom("__proto__" as PcbPlacedComponent["packageModel"], 5, 5, 1)] };
  const parsed = parseProjectJson(JSON.stringify(project));
  assert.equal(parsed.ok, true, "one bad field does not reject the whole file");
  if (parsed.ok) assert.doesNotThrow(() => parsed.value.components.forEach((component) => getPcbPackageAsset(component, kit)));
});

test("an imported part whose id is a prototype name is not a built-in part and never throws", () => {
  for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const part = custom(undefined, 5, 5, 1, { id });
    assert.doesNotThrow(() => resolvePcbPackageKey(part), id);
    assert.equal(resolvePcbPackageKey(part), null, `${id} stays a box`);
    assert.doesNotThrow(() => getPcbPackageAsset(part, kit), id);
    assert.equal(getPcbPackageAsset(part, kit), null);
  }
  const project = { ...createBlankProject("匯入"), components: [custom(undefined, 5, 5, 1, { id: "constructor" })] };
  const parsed = parseProjectJson(JSON.stringify(project));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.doesNotThrow(() => parsed.value.components.forEach((component) => getPcbPackageAsset(component, kit)));
  // Real built-in ids still get their package.
  assert.equal(resolvePcbPackageKey(placed({ ...builtIn("builtin-j-47053-1000") })), "header");
});

test("choosing 自動 again clears a library part's 3D 示意外形 (library edits merge fields)", () => {
  const library = [{ ...BUILT_IN_COMPONENTS[0], id: "mine", source: "custom" as const, packageModel: "qfn" as const }];
  const project = createBlankProject("板");
  let state = createWorkspaceState({ projects: [project], templates: [], library, activeProjectId: project.id, updatedAt: project.updatedAt }, true);
  state = reduceWorkspaceState(state, { type: "library/edit", componentId: "mine", component: { packageModel: undefined } });
  const edited = state.data.library.find((component) => component.id === "mine")!;
  assert.equal(edited.packageModel, undefined);
  assert.equal(resolvePcbPackageKey(placed({ ...edited, type: "Other" })), null);
});
