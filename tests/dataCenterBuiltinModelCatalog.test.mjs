import assert from "node:assert/strict";
import { open, readFile, stat } from "node:fs/promises";
import test from "node:test";

const seedSource = await readFile(
  new URL("../src/components/data-center/dataCenterSeed.ts", import.meta.url),
  "utf8",
);
const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);
test("both supplied STEP files stay L10-only while VR200 L11 is unavailable", () => {
  assert.doesNotMatch(seedSource, /"vr200-cabinet-20260715":\s*\{/);
  assert.doesNotMatch(seedSource, /vr200-l11-cabinet-20260719\.glb/);
  assert.match(
    seedSource,
    /"vera-rubin-vr-1u-20260715":\s*\{[\s\S]*?kind:\s*"l10"[\s\S]*?sourceFileName:\s*"00_vr_outlook_20260715\.stp"/,
  );
  assert.match(seedSource, /vera-rubin-vr-1u-20260715\.glb/);
  assert.match(seedSource, /vera-rubin-vr-1u-20260715\.mobile\.glb/);

  assert.match(
    seedSource,
    /"carlo-next-l10-20260715":\s*\{[\s\S]*?kind:\s*"l10"/,
  );
  assert.match(seedSource, /carlo-next-l10-20260715\.glb/);
  assert.match(seedSource, /carlo-next-l10-20260715\.mobile\.glb/);
  assert.match(seedSource, /sourceFileName:\s*"00_carlo-next_l10_outlook_20260715\.stp"/);
});

test("the supplied VR outlook STEP is labeled and calibrated as VR200 L10", () => {
  const vrUnitDefinition = seedSource.match(
    /"vera-rubin-vr-1u-20260715":\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*"carlo-next-l10-20260715"/,
  )?.[1];

  assert.ok(vrUnitDefinition, "VR200 L10 catalog definition is missing");
  assert.match(vrUnitDefinition, /name:\s*"VR200 L10 1U 機台"/);
  assert.match(vrUnitDefinition, /manufacturer:\s*"Internal \/ VR200"/);
  assert.match(vrUnitDefinition, /widthMm:\s*497\.2/);
  assert.match(vrUnitDefinition, /depthMm:\s*899\.1/);
  assert.match(vrUnitDefinition, /heightMm:\s*44/);
  assert.match(vrUnitDefinition, /upAxis:\s*"y"/);
  assert.match(vrUnitDefinition, /rackUnits:\s*1/);
  assert.match(vrUnitDefinition, /compatibleRackModelIds:\s*\[\]/);
  assert.match(vrUnitDefinition, /尚未取得 VR200 L11/);
});

test("the supplied Carlo-Next STEP is labeled and calibrated as GB300 L10", () => {
  const carloDefinition = seedSource.match(
    /"carlo-next-l10-20260715":\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*"generic-42u"/,
  )?.[1];

  assert.ok(carloDefinition, "GB300 L10 catalog definition is missing");
  assert.match(carloDefinition, /name:\s*"GB300 L10 1U 機台"/);
  assert.match(carloDefinition, /manufacturer:\s*"Internal \/ GB300"/);
  assert.match(carloDefinition, /widthMm:\s*482\.1/);
  assert.match(carloDefinition, /depthMm:\s*912\.3/);
  assert.match(carloDefinition, /heightMm:\s*43\.8/);
  assert.match(carloDefinition, /upAxis:\s*"y"/);
  assert.match(carloDefinition, /rackUnits:\s*1/);
  assert.match(carloDefinition, /compatibleRackModelIds:\s*\["nv-mgx-rack-v1-2-rev7"\]/);
});

test("the fallback L10 is also a 1U machine rather than a cabinet-sized block", () => {
  const placeholderDefinition = seedSource.match(
    /"l10-placeholder":\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\};/,
  )?.[1];

  assert.ok(placeholderDefinition, "L10 placeholder catalog definition is missing");
  assert.match(placeholderDefinition, /heightMm:\s*44\.45/);
  assert.match(placeholderDefinition, /rackUnits:\s*1/);
});

test("the scene keeps rack envelopes outside and only mounts 1U machines inside", () => {
  assert.match(plannerSource, /function resolveRackDefinition/);
  assert.match(plannerSource, /model\?\.kind === "rack"/);
  assert.match(plannerSource, /function resolveL10Definition/);
  assert.match(plannerSource, /model\?\.kind === "l10"/);
  assert.match(plannerSource, /<RackL10Modules[\s\S]*?rack=\{rack\}/);
  assert.match(plannerSource, /l10Definition=\{l10Definition\}[\s\S]*?detailed=\{selected\}/);
  assert.match(workspaceSource, /L11/);
  assert.match(workspaceSource, /L10 1U/);
});

test("rack and L10 geometry stay visually stable when selection or camera distance changes", () => {
  assert.match(
    plannerSource,
    /const sceneAssetUrl =\s+lowDetail && l10Definition\.mobileAssetUrl\s+\? l10Definition\.mobileAssetUrl\s+: l10Definition\.assetUrl;/,
  );
  assert.match(plannerSource, /<InstancedDetailedL10Model/);
  assert.doesNotMatch(plannerSource, /visible=\{interactionPreview\}/);
  assert.doesNotMatch(plannerSource, /l10-interaction-preview/);
  assert.doesNotMatch(plannerSource, /l10-proxy-covers/);
  assert.doesNotMatch(plannerSource, /assetUrl=\{l10Definition\.assetUrl\}/);
  assert.match(plannerSource, /material\.side = THREE\.DoubleSide/);
  assert.doesNotMatch(plannerSource, /index > 0/);
  assert.match(plannerSource, /detailed=\{selected\}/);
  assert.match(plannerSource, /lowDetail=\{lowDetail\}/);
  assert.match(plannerSource, /lowDetail && l10Definition\.mobileAssetUrl/);
});

test("an empty rack exposes an explicit L10 installation action", () => {
  assert.match(
    workspaceSource,
    /rack\.l10Count === 0 \? "選擇並安裝 L10" : "更換 L10 模型"/,
  );
});

test("mounted L10 machines keep one uniform scale inside the L11 cabinet", () => {
  assert.match(plannerSource, /getRackUnitMountLayout\(\{/);
  assert.match(plannerSource, /makeScale\(\s*layout\.fitScale,\s*layout\.fitScale,\s*layout\.fitScale/);
  assert.doesNotMatch(plannerSource, /makeScale\(\s*layout\.fitScale,\s*1,\s*layout\.fitScale/);
});

test("GB300 defaults and legacy invalid VR200 racks migrate to the matched L11 and L10", () => {
  assert.match(
    seedSource,
    /id:\s*"tpe-a01"[\s\S]*?modelId:\s*"nv-mgx-rack-v1-2-rev7"[\s\S]*?l10ModelId:\s*"carlo-next-l10-20260715"/,
  );
  assert.match(workspaceSource, /const isLegacyInvalidVr200Rack =/);
  assert.match(workspaceSource, /isLegacyInvalidVr200Rack\s*\?\s*"nv-mgx-rack-v1-2-rev7"/);
  assert.match(
    workspaceSource,
    /isLegacyInvalidVr200Rack \|\| shouldRestoreGb300L10[\s\S]*?\? "carlo-next-l10-20260715"/,
  );
});

test("the NVIDIA rack catalog label is GB300 L11 without changing its stable model id", () => {
  const gb300Definition = seedSource.match(
    /"nv-mgx-rack-v1-2-rev7":\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*"vera-rubin-vr-1u-20260715"/,
  )?.[1];

  assert.ok(gb300Definition, "GB300 catalog definition is missing");
  assert.match(gb300Definition, /id:\s*"nv-mgx-rack-v1-2-rev7"/);
  assert.match(gb300Definition, /name:\s*"GB300 L11 機櫃"/);
  assert.match(gb300Definition, /assetUrl:\s*companyModelUrl/);
  assert.match(gb300Definition, /mobileAssetUrl:\s*companyMobileModelUrl/);
  assert.doesNotMatch(gb300Definition, /scenePresentation/);
});

test("every seeded GB300 rack restores the matched GB300 L10 instead of a placeholder", () => {
  assert.match(
    seedSource,
    /modelId === GB300_RACK_MODEL_ID \? GB300_L10_MODEL_ID : "l10-placeholder"/,
  );
  assert.match(workspaceSource, /const shouldRestoreGb300L10 =/);
  assert.match(
    workspaceSource,
    /isLegacyInvalidVr200Rack \|\| shouldRestoreGb300L10[\s\S]*?"carlo-next-l10-20260715"/,
  );
});

for (const assetName of [
  "vera-rubin-vr-1u-20260715",
  "carlo-next-l10-20260715",
]) {
  test(`${assetName} is a deployable GLB with calibrated metadata and a mobile LOD`, async () => {
    const assetUrl = new URL(
      `../public/models/data-center/${assetName}.glb`,
      import.meta.url,
    );
    const mobileAssetUrl = new URL(
      `../public/models/data-center/${assetName}.mobile.glb`,
      import.meta.url,
    );
    const metadataUrl = new URL(
      `../public/models/data-center/${assetName}.json`,
      import.meta.url,
    );
    const [assetStat, mobileStat] = await Promise.all([
      stat(assetUrl),
      stat(mobileAssetUrl),
    ]);
    assert.ok(assetStat.size > 1024);
    assert.ok(assetStat.size < 100 * 1024 * 1024);
    assert.ok(mobileStat.size > 1024);
    assert.ok(mobileStat.size < assetStat.size);

    for (const url of [assetUrl, mobileAssetUrl]) {
      const handle = await open(url, "r");
      const header = Buffer.alloc(4);
      await handle.read(header, 0, header.length, 0);
      await handle.close();
      assert.equal(header.toString("ascii"), "glTF");
    }

    const metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
    assert.equal(metadata.outputFileName, `${assetName}.glb`);
    assert.equal(metadata.outputBytes, assetStat.size);
    assert.equal(metadata.mobileWebOptimization.outputFileName, `${assetName}.mobile.glb`);
    assert.equal(metadata.mobileWebOptimization.outputBytes, mobileStat.size);
    assert.ok(metadata.mobileWebOptimization.triangleCount <= 350_000);
    assert.equal(metadata.mobileWebOptimization.preservesNamedNodes, true);
    assert.equal(metadata.mobileWebOptimization.preservesNamedMaterials, true);
    assert.ok(metadata.dimensions.widthMm > 0);
    assert.ok(metadata.dimensions.depthMm > 0);
    assert.ok(metadata.dimensions.heightMm > 0);
  });
}

test("deployed metadata identifies both STEP files as distinct 1U assemblies", async () => {
  const vrMetadata = JSON.parse(
    await readFile(
      new URL(
        "../public/models/data-center/vera-rubin-vr-1u-20260715.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const l10Metadata = JSON.parse(
    await readFile(
      new URL(
        "../public/models/data-center/carlo-next-l10-20260715.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  assert.equal(vrMetadata.sourceUpAxis, "y");
  assert.equal(vrMetadata.upAxis, "y");
  assert.equal(vrMetadata.assembly.role, "vr200-l10-1u-module");
  assert.equal(vrMetadata.dimensions.heightMm, 44);
  assert.equal(vrMetadata.assembly.rackUnits, 1);
  assert.equal(l10Metadata.sourceUpAxis, "y");
  assert.equal(l10Metadata.upAxis, "y");
  assert.equal(l10Metadata.assembly.role, "gb300-l10-1u-module");
  assert.equal(l10Metadata.assembly.rackUnits, 1);
});
