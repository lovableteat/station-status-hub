import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILT_IN_COMPONENTS } from "../../src/components/pcb-designer/defaults.ts";
import { isPcbModelAsset, mapPcbModelPartToComponentSpace } from "../../src/components/pcb-designer/core/modelAssets.ts";
import {
  getPcbPackageAsset,
  isPcbPackageKit,
  loadPcbPackageKit,
  resetPcbPackageKitForTests,
  resolvePcbPackageKey,
  type PcbPackageKit,
} from "../../src/components/pcb-designer/core/packageModels.ts";
import { getPcbMountY } from "../../src/components/pcb-designer/core/software3d.ts";
import type { PcbPlacedComponent } from "../../src/components/pcb-designer/types.ts";

const kit = JSON.parse(await readFile(new URL("../../public/models/pcb/pcb-package-kit.json", import.meta.url), "utf8")) as PcbPackageKit;
const builtIn = (id: string) => BUILT_IN_COMPONENTS.find((component) => component.id === id)!;
const placed = (part: Partial<PcbPlacedComponent>): PcbPlacedComponent => ({
  ...BUILT_IN_COMPONENTS[0], instanceId: "c", reference: "U1", x: 0, y: 0, rotation: 0, layer: "top", locked: false, ...part,
}) as PcbPlacedComponent;
const extent = (asset: NonNullable<ReturnType<typeof getPcbPackageAsset>>, partName: string, axis: 0 | 1 | 2) => {
  const index = asset.metadata.parts.findIndex((part) => part.name === partName);
  const values = asset.parts[index].position.filter((_, i) => i % 3 === axis);
  return [Math.min(...values), Math.max(...values)];
};

test("the Blender kit is valid and holds every piece the assembler uses", () => {
  assert.equal(isPcbPackageKit(kit), true);
  for (const piece of ["body_block", "chip_body", "chip_mlcc", "chip_coat", "terminal_cap", "terminal_pad", "qfp_lead", "bga_substrate",
    "bga_ball", "ferrite_body", "header_base", "header_wall", "header_pin", "pin1_mark", "ecap_can", "ecap_sleeve", "ecap_vent",
    "usbc_shield", "usbc_tongue", "usbc_contact", "usbc_shield_leg"]) assert.ok(kit.pieces[piece], piece);
  assert.equal(isPcbPackageKit({ ...kit, schemaVersion: 2 }), false);
  assert.equal(isPcbPackageKit({ schemaVersion: 1, pieces: { bad: { color: [0, 0, 0], positions: [0, 0, 0], indices: [0, 1, 2] } } }), false);
});

test("built-in parts map to their package; other parts only by explicit type and shape; STEP always wins", () => {
  assert.equal(resolvePcbPackageKey(builtIn("builtin-u-stm32f407vgt6")), "qfp");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-u-mt40a512m16")), "bga");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-j-12401548e4")), "usb-c");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-j-47053-1000")), "header", "same type as USB-C, told apart by library id");
  assert.equal(resolvePcbPackageKey(builtIn("builtin-screw-hole")), null, "screw holes are not packages");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Capacitor", shape: "circle", width: 8, height: 8 })), "electrolytic");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: " capacitor ", shape: "rectangle" })), "chip-capacitor");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "IC", width: 5, height: 5 })), "qfn");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "IC", width: 12, height: 12 })), "qfp");
  assert.equal(resolvePcbPackageKey(placed({ id: "x", type: "Other", name: "USB-C connector QFP resistor" })), null, "the name is never used");
  assert.equal(resolvePcbPackageKey(placed({ id: "builtin-u-stm32f407vgt6", modelAssetId: "step-1" })), null, "a STEP model wins");
  assert.equal(getPcbPackageAsset(placed({ id: "builtin-u-stm32f407vgt6" }), null), null, "no kit: today's procedural body stays");
});

test("every package assembles to a valid model asset exactly filling the component box, resting on its lowest point", () => {
  const cases = [
    builtIn("builtin-u-stm32f407vgt6"), builtIn("builtin-u-mt40a512m16"), builtIn("builtin-j-12401548e4"), builtIn("builtin-r-rc0603fr-0710kl"),
    builtIn("builtin-c-grm188r71c104ka01"), builtIn("builtin-l-vls3012et-2r2m"), builtIn("builtin-u-tps62130rgtr"), builtIn("builtin-j-47053-1000"),
    { ...BUILT_IN_COMPONENTS[0], id: "custom-cap", type: "Capacitor", shape: "circle" as const, width: 8, height: 8, maxHeight: 10 },
  ];
  for (const part of cases) {
    const asset = getPcbPackageAsset(placed(part), kit)!;
    assert.ok(asset, part.id);
    assert.equal(isPcbModelAsset(asset), true, `${part.id} is a valid model asset`);
    assert.ok(asset.metadata.id.startsWith("package:"), "never confused with a stored STEP asset");
    assert.deepEqual(asset.metadata.bounds, { min: [-part.width / 2, 0, -part.height / 2], max: [part.width / 2, part.maxHeight, part.height / 2] });
    for (const mesh of asset.parts) for (let i = 0; i < mesh.position.length; i += 3) {
      assert.ok(Math.abs(mesh.position[i]) <= part.width / 2 + 0.05, `${part.id} x inside`);
      assert.ok(mesh.position[i + 1] >= -0.0001 && mesh.position[i + 1] <= part.maxHeight + 0.05, `${part.id} y inside`);
      assert.ok(Math.abs(mesh.position[i + 2]) <= part.height / 2 + 0.05, `${part.id} z inside`);
    }
    // The shared mapper keeps the size and puts the lowest point on the seating plane (insertion depth 0).
    const component = placed(part);
    let minY = Infinity, maxY = -Infinity;
    for (const mesh of asset.parts) {
      const mapped = mapPcbModelPartToComponentSpace(mesh, asset, component);
      for (let i = 1; i < mapped.length; i += 3) { minY = Math.min(minY, mapped[i]); maxY = Math.max(maxY, mapped[i]); }
    }
    assert.ok(Math.abs(minY + part.maxHeight / 2) < 1e-6, `${part.id} rests on its lowest point`);
    assert.ok(maxY <= part.maxHeight / 2 + 0.05, `${part.id} keeps its height`);
  }
});

test("pins, leads and solder balls keep their own cross-section on large parts (no stretched pins)", () => {
  const small = getPcbPackageAsset(placed({ id: "h1", type: "Connector", width: 10, height: 3, maxHeight: 5 }), kit)!;
  const large = getPcbPackageAsset(placed({ id: "h2", type: "Connector", width: 50, height: 8, maxHeight: 20 }), kit)!;
  const postWidth = (asset: typeof small) => {
    const index = asset.metadata.parts.findIndex((part) => part.name === "pin");
    const xs = asset.parts[index].position.filter((_, i) => i % 3 === 0);
    // One post's width: distance between the two closest distinct x values of the left-most post.
    const left = Math.min(...xs);
    const right = Math.min(...xs.filter((x) => x > left + 1e-6));
    return right - left;
  };
  assert.ok(Math.abs(postWidth(small) - postWidth(large)) < 0.05, "header posts keep 0.64 mm whatever the housing size");
  assert.ok(postWidth(large) <= 0.65);
  const big = getPcbPackageAsset(placed({ id: "q", type: "IC", width: 30, height: 30, maxHeight: 3.5 }), kit)!;
  const [, leadTop] = extent(big, "lead", 1);
  assert.ok(leadTop <= 1.0, "QFP leads stay thin and low on a tall body");
  const leadPart = big.parts[big.metadata.parts.findIndex((part) => part.name === "lead")];
  assert.ok(leadPart.index.length / 3 <= 64 * 4 * 44, "lead count is capped");
});

test("Top and Bottom insertion depth still move into the board with the same shared mount offset", () => {
  const part = placed({ ...builtIn("builtin-j-47053-1000"), insertionDepth: 1.5 });
  assert.equal(getPcbMountY({ ...part, layer: "top" }, 1.6), 0.8 + part.maxHeight / 2 - 1.5);
  assert.equal(getPcbMountY({ ...part, layer: "bottom" }, 1.6), -(0.8 + part.maxHeight / 2 - 1.5));
});

test("the kit loads once, falls back to null on failure and may retry a few times", async () => {
  resetPcbPackageKitForTests();
  let calls = 0;
  const failing = (async () => { calls += 1; return new Response("nope", { status: 404 }); }) as typeof fetch;
  assert.equal(await loadPcbPackageKit("/kit.json", failing), null);
  assert.equal(await loadPcbPackageKit("/kit.json", failing), null);
  const working = (async () => { calls += 1; return new Response(JSON.stringify(kit)); }) as typeof fetch;
  const loaded = await loadPcbPackageKit("/kit.json", working);
  assert.equal(isPcbPackageKit(loaded), true);
  assert.equal(await loadPcbPackageKit("/kit.json", failing), loaded, "a loaded kit is reused");
  assert.equal(calls, 3);
  resetPcbPackageKitForTests();
});
