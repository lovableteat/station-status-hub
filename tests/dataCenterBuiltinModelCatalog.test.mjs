import assert from "node:assert/strict";
import { open, readFile, stat } from "node:fs/promises";
import test from "node:test";

const seedSource = await readFile(
  new URL("../src/components/data-center/dataCenterSeed.ts", import.meta.url),
  "utf8",
);

test("VR200 cabinet and Carlo-Next L10 are persistent catalog models", () => {
  assert.match(seedSource, /"vr200-cabinet-20260715":\s*\{[\s\S]*?kind:\s*"rack"/);
  assert.match(seedSource, /vr200-cabinet-20260715\.glb/);
  assert.match(seedSource, /sourceFileName:\s*"00_vr_outlook_20260715\.stp"/);

  assert.match(seedSource, /"carlo-next-l10-20260715":\s*\{[\s\S]*?kind:\s*"l10"/);
  assert.match(seedSource, /carlo-next-l10-20260715\.glb/);
  assert.match(seedSource, /sourceFileName:\s*"00_carlo-next_l10_outlook_20260715\.stp"/);
});

test("Carlo-Next is calibrated as a horizontal standard 1U rack module", () => {
  const carloDefinition = seedSource.match(
    /"carlo-next-l10-20260715":\s*\{([\s\S]*?)\n\s*\},\n\s*"generic-42u"/,
  )?.[1];

  assert.ok(carloDefinition, "Carlo-Next catalog definition is missing");
  assert.match(carloDefinition, /widthMm:\s*482\.6/);
  assert.match(carloDefinition, /depthMm:\s*800/);
  assert.match(carloDefinition, /heightMm:\s*44\.45/);
  assert.match(carloDefinition, /upAxis:\s*"z"/);
  assert.match(carloDefinition, /rackUnits:\s*1/);
});

for (const assetName of [
  "vr200-cabinet-20260715",
  "carlo-next-l10-20260715",
]) {
  test(`${assetName} is a deployable GLB with calibrated metadata`, async () => {
    const assetUrl = new URL(
      `../public/models/data-center/${assetName}.glb`,
      import.meta.url,
    );
    const metadataUrl = new URL(
      `../public/models/data-center/${assetName}.json`,
      import.meta.url,
    );
    const assetStat = await stat(assetUrl);
    assert.ok(assetStat.size > 1024);
    assert.ok(assetStat.size < 100 * 1024 * 1024);

    const handle = await open(assetUrl, "r");
    const header = Buffer.alloc(4);
    await handle.read(header, 0, header.length, 0);
    await handle.close();
    assert.equal(header.toString("ascii"), "glTF");

    const metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
    assert.equal(metadata.outputFileName, `${assetName}.glb`);
    assert.equal(metadata.outputBytes, assetStat.size);
    assert.ok(metadata.dimensions.widthMm > 0);
    assert.ok(metadata.dimensions.depthMm > 0);
    assert.ok(metadata.dimensions.heightMm > 0);
  });
}
