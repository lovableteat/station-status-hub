import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleSafeAssetRetention, inventoryDigest, planSafeAssetRetention, RETENTION_LIMITS, sha256 } from '../scripts/plan-safe-asset-retention.mjs';

const path = {
  shell: 'assets/index-abcdefgh.js', common: 'assets/common-abcdefgh.js',
  workspace: 'assets/Dashboard-abcdefgh.js', detail: 'assets/detail-abcdefgh.js',
  css: 'assets/dashboard-abcdefgh.css', font: 'assets/font-abcdefgh.woff2',
  bom: 'assets/MaterialRequestPage-abcdefgh.js', seed: 'assets/materialRequestSeed-abcdefgh.js',
};

function fixture() {
  // Entirely synthetic bytes and metadata. No old real bundle, BOM, API, DB,
  // browser, Storage or deployment is used by these tests.
  const bytes = {
    shell: `import './common-abcdefgh.js'; export const open=()=>import('./Dashboard-abcdefgh.js'); export const bom=()=>import('./MaterialRequestPage-abcdefgh.js');`,
    common: `import './index-abcdefgh.js'; export const state='synthetic';`,
    workspace: `import './common-abcdefgh.js'; export const detail=()=>import('./detail-abcdefgh.js');`,
    detail: `import './common-abcdefgh.js'; export const name='synthetic-detail';`,
    css: '@font-face{src:url(./font-abcdefgh.woff2)}', font: 'synthetic-font-bytes',
    bom: 'export const legacyFallback="synthetic-unsafe-placeholder";', seed: 'export default {synthetic:true};',
  };
  const specs = {
    shell: { required: ['common'], optional: ['workspace', 'bom'], modules: ['src/main.tsx', 'src/pages/Index.tsx'] },
    common: { required: ['shell'], optional: [], modules: ['src/shared.ts'] },
    workspace: { required: ['common', 'css'], optional: ['detail'], modules: ['src/Dashboard.tsx'] },
    detail: { required: ['common'], optional: [], modules: ['src/Detail.tsx'] },
    css: { required: ['font'], optional: [], modules: ['src/dashboard.css'] },
    font: { required: [], optional: [], modules: ['src/font.woff2'] },
    bom: { required: ['common'], optional: ['seed'], modules: ['src/components/material-requests/MaterialRequestPage.tsx'] },
    seed: { required: [], optional: [], modules: ['src/data/materialRequestSeed.json'] },
  };
  const manifest = {
    schemaVersion: 1, release: 'a'.repeat(40), artifactSha256: sha256(Buffer.from('synthetic artifact envelope')),
    builtAt: '2026-11-11T00:00:00Z', base: '/station-status-hub/',
    files: Object.entries(specs).map(([key, spec]) => ({
      path: path[key], sha256: sha256(Buffer.from(bytes[key])), bytes: Buffer.byteLength(bytes[key]),
      kind: key === 'css' ? 'css' : key === 'font' ? 'asset' : 'js', modules: spec.modules,
      required: spec.required.map(key => path[key]), optional: spec.optional.map(key => path[key]), externalModules: [],
    })),
  };
  const review = {
    schemaVersion: 1, release: manifest.release, inventorySha256: inventoryDigest(manifest),
    provenance: 'verified-build-output', evidence: 'Synthetic independent review only',
    reviewedAt: '2026-11-11T01:00:00Z', expiresAt: '2026-11-24T00:00:00Z',
    approvedFiles: manifest.files.filter(file => ![path.bom, path.seed].includes(file.path)).map(file => ({
      path: file.path, sha256: file.sha256, publicContent: true, currentSecurityContract: true,
      completeDependencies: true, evidence: 'Synthetic per-file review only',
    })),
    routes: [{ label: 'Synthetic dashboard plus details', roots: [path.workspace, path.detail] }],
    allowedMissingOptional: [{ from: path.shell, to: path.bom, reason: 'Unsafe legacy BOM fallback is deliberately unavailable' }],
  };
  // Forbidden bytes do not even need to be materialized to plan other routes.
  const files = new Map(Object.entries(bytes).filter(([key]) => !['bom', 'seed'].includes(key)).map(([key, value]) => [path[key], Buffer.from(value)]));
  return {
    base: manifest.base, now: '2026-11-12T00:00:00Z', currentFiles: new Map([
      ['index.html', Buffer.from('fresh HTML with new recovery handler')],
      ['assets/current-ijklmnop.js', Buffer.from('fresh JS')],
    ]), snapshots: [{ manifest, review, files }], revokedSha256: [],
  };
}

function reseal(input) {
  const { manifest, review } = input.snapshots[0];
  review.inventorySha256 = inventoryDigest(manifest);
  for (const approval of review.approvedFiles) approval.sha256 = manifest.files.find(file => file.path === approval.path)?.sha256;
  return input;
}

function approve(snapshot, target) {
  const file = snapshot.manifest.files.find(file => file.path === target);
  snapshot.review.approvedFiles.push({ path: target, sha256: file.sha256, publicContent: true, currentSecurityContract: true, completeDependencies: true, evidence: 'Synthetic approval cannot override veto' });
  snapshot.review.routes[0].roots.push(target);
}

test('retains only reviewed route closures, including static cycles, CSS and font dependencies', () => {
  const input = fixture(), { files, plan } = assembleSafeAssetRetention(input);
  assert.deepEqual(plan.assets.map(file => file.path).sort(), Object.values(path).filter(value => ![path.bom, path.seed].includes(value)).sort());
  assert.equal(plan.unavailableOptional.length, 1);
  assert.equal(plan.unavailableOptional[0].to, path.bom);
  assert.equal(files.size, input.currentFiles.size + 6);
  assert.equal(files.get('index.html').toString(), 'fresh HTML with new recovery handler');
  assert.equal(files.has(path.seed), false);
  assert.equal(files.has(path.bom), false);
});

test('does not copy extra old dist files, HTML, public objects or source maps', () => {
  const input = fixture();
  for (const name of ['index.html', 'private.json', 'assets/unreviewed-abcdefgh.js', 'assets/index-abcdefgh.js.map', 'public/legacy.pdf']) {
    input.snapshots[0].files.set(name, Buffer.from('never publish this unreviewed synthetic file'));
  }
  const { files } = assembleSafeAssetRetention(input);
  assert.equal(files.get('index.html').toString(), 'fresh HTML with new recovery handler');
  for (const name of ['private.json', 'assets/unreviewed-abcdefgh.js', 'assets/index-abcdefgh.js.map', 'public/legacy.pdf']) assert.equal(files.has(name), false);
});

test('does not mutate input Maps or share mutable output byte buffers', () => {
  const input = fixture(), before = [...input.currentFiles.keys()];
  const output = assembleSafeAssetRetention(input);
  output.files.get('index.html').fill(0);
  output.files.get(path.workspace).fill(0);
  assert.deepEqual([...input.currentFiles.keys()], before);
  assert.equal(input.currentFiles.get('index.html').toString(), 'fresh HTML with new recovery handler');
  assert.notEqual(input.snapshots[0].files.get(path.workspace)[0], 0);
});

test('identical current filename is reused, never overwritten', () => {
  const input = fixture();
  input.currentFiles.set(path.css, Buffer.from(input.snapshots[0].files.get(path.css)));
  assert.equal(planSafeAssetRetention(input).assets.find(file => file.path === path.css).action, 'reuse-current');
});

test('current filename with different bytes aborts without touching the fresh artifact', () => {
  const input = fixture();
  input.currentFiles.set(path.css, Buffer.from('new CSS at the same URL'));
  const before = [...input.currentFiles];
  assert.throws(() => assembleSafeAssetRetention(input), /current filename collision/);
  assert.deepEqual([...input.currentFiles], before);
});

test('rechecks hashes during assembly rather than trusting a previously returned plan', () => {
  const input = fixture();
  planSafeAssetRetention(input);
  input.snapshots[0].files.get(path.workspace).fill(0);
  assert.throws(() => assembleSafeAssetRetention(input), /missing or changed artifact bytes/);
});

for (const key of ['shell', 'common', 'css', 'font']) test(`missing approval for required ${key} aborts the entire plan`, () => {
  const input = fixture();
  input.snapshots[0].review.approvedFiles = input.snapshots[0].review.approvedFiles.filter(file => file.path !== path[key]);
  assert.throws(() => planSafeAssetRetention(input), /not explicitly approved/);
});

test('an optional route is not recursively copied, but every omitted edge must be acknowledged', () => {
  const input = fixture(), { review } = input.snapshots[0];
  review.routes[0].roots = [path.workspace];
  assert.throws(() => planSafeAssetRetention(input), /unreviewed broken optional route/);
  review.allowedMissingOptional.push({ from: path.workspace, to: path.detail, reason: 'Detail navigation is outside this limited scenario' });
  const plan = planSafeAssetRetention(input);
  assert.equal(plan.assets.some(file => file.path === path.detail), false);
  assert.equal(plan.unavailableOptional.length, 2);
});

test('rejects stale or invented missing-optional exceptions', () => {
  for (const target of [path.common, path.detail]) {
    const input = fixture();
    input.snapshots[0].review.allowedMissingOptional.push({ from: path.workspace, to: target, reason: 'Unnecessary exception' });
    assert.throws(() => planSafeAssetRetention(input), /unknown or duplicate missing optional edge|stale missing optional edge approval/);
  }
});

test('excluded target cannot quietly remain in current output', () => {
  const input = fixture();
  input.currentFiles.set(path.bom, Buffer.from('even a stub is prohibited'));
  assert.throws(() => planSafeAssetRetention(input), /excluded optional target is still published/);
});

for (const key of ['bom', 'seed']) test(`hard veto rejects ${key} even with an explicit approval and empty synthetic bytes`, () => {
  const input = fixture(), snapshot = input.snapshots[0];
  const record = snapshot.manifest.files.find(file => file.path === path[key]);
  const empty = Buffer.from('export default {};');
  record.bytes = empty.length;
  record.sha256 = sha256(empty);
  snapshot.files.set(record.path, empty);
  approve(snapshot, record.path);
  reseal(input);
  assert.throws(() => planSafeAssetRetention(input), /private seed or unsafe legacy importer/);
});

test('renaming a forbidden chunk does not bypass source provenance veto', () => {
  for (const module of ['src/data/materialRequestSeed.json', 'C:\\source\\src\\components\\MaterialRequestPage.tsx']) {
    const input = fixture(), snapshot = input.snapshots[0];
    snapshot.manifest.files.find(file => file.path === path.workspace).modules = [module];
    reseal(input);
    assert.throws(() => planSafeAssetRetention(input), /private seed or unsafe legacy importer/);
  }
});

test('defense-in-depth rejects inline seed and source-map references after approval', () => {
  for (const code of ['export const url="materialRequestSeed.json";', 'export {};\n//# sourceMappingURL=private.map', '/*# sourceMappingURL=data:application/json;base64,e30= */']) {
    const input = fixture(), snapshot = input.snapshots[0], bytes = Buffer.from(code);
    const file = snapshot.manifest.files.find(file => file.path === path.workspace);
    file.sha256 = sha256(bytes);
    file.bytes = bytes.length;
    snapshot.files.set(file.path, bytes);
    reseal(input);
    assert.throws(() => planSafeAssetRetention(input), /forbidden seed or source-map reference/);
  }
});

test('revocation overrides an otherwise valid per-file review', () => {
  const input = fixture();
  input.revokedSha256 = [input.snapshots[0].manifest.files.find(file => file.path === path.common).sha256];
  assert.throws(() => planSafeAssetRetention(input), /revoked asset/);
});

test('inventory changes invalidate the review, even if byte hashes stay the same', () => {
  const input = fixture();
  input.snapshots[0].manifest.files.find(file => file.path === path.workspace).required = [];
  assert.throws(() => planSafeAssetRetention(input), /inventory changed after review/);
});

for (const change of [
  input => { input.snapshots[0].review.provenance = 'rebuilt-approximately'; },
  input => { input.snapshots[0].review.evidence = ''; },
  input => { delete input.snapshots[0].review.approvedFiles[0].completeDependencies; },
  input => { input.snapshots[0].review.approvedFiles[0].publicContent = false; },
  input => { input.snapshots[0].review.approvedFiles[0].currentSecurityContract = false; },
]) test('incomplete review or provenance fails closed', () => {
  const input = fixture();
  change(input);
  assert.throws(() => planSafeAssetRetention(input), /Asset retention refused/);
});

test('missing module provenance or external module resolution is not guessed', () => {
  for (const field of ['modules', 'externalModules']) {
    const input = fixture();
    input.snapshots[0].manifest.files.find(file => file.path === path.workspace)[field] = field === 'modules' ? [] : ['https://unreviewed.invalid/module.js'];
    reseal(input);
    assert.throws(() => planSafeAssetRetention(input), /missing module provenance|unsupported external module/);
  }
});

test('all required references must resolve to exact inventory paths', () => {
  const input = fixture();
  input.snapshots[0].manifest.files.find(file => file.path === path.workspace).required.push('assets/missing-abcdefgh.js');
  reseal(input);
  assert.throws(() => planSafeAssetRetention(input), /unresolved inventory dependency/);
});

test('rejects unsafe, unsupported, non-hashed and query-bearing inventory paths', () => {
  for (const name of ['../escape.js', '/assets/root-abcdefgh.js', 'assets/../escape-abcdefgh.js', 'assets/%2e%2e-abcdefgh.js', 'assets/worker.js', 'assets/index-abcdefgh.js.map', 'assets/page-abcdefgh.html', 'assets/data-abcdefgh.json', 'assets/index-abcdefgh.js?q=1', 'assets\\index-abcdefgh.js']) {
    const input = fixture();
    input.snapshots[0].manifest.files[0].path = name;
    reseal(input);
    assert.throws(() => planSafeAssetRetention(input), /unsupported or non-hashed asset path/);
  }
});

test('rejects expired releases, expired reviews, future dates and base changes', () => {
  const changes = [
    input => { input.now = '2026-12-01T00:00:00Z'; },
    input => { input.snapshots[0].review.expiresAt = input.now; },
    input => { input.snapshots[0].review.reviewedAt = '2026-11-13T00:00:00Z'; },
    input => { input.snapshots[0].manifest.builtAt = '2026-11-13T00:00:00Z'; reseal(input); },
    input => { input.snapshots[0].manifest.base = '/other/'; reseal(input); },
    input => { input.now = '2026-02-31T00:00:00Z'; },
  ];
  for (const change of changes) {
    const input = fixture();
    change(input);
    assert.throws(() => planSafeAssetRetention(input), /Asset retention refused/);
  }
});

test('release cap and duplicate releases prevent recursive indefinite carry-over', () => {
  const input = fixture();
  input.snapshots.push(input.snapshots[0]);
  assert.throws(() => planSafeAssetRetention(input), /duplicate retained release/);
  input.snapshots.push(input.snapshots[0]);
  assert.throws(() => planSafeAssetRetention(input), /too many retained releases/);
  assert.equal(RETENTION_LIMITS.releases, 2);
  assert.equal(RETENTION_LIMITS.ageDays, 14);
});

test('different old releases cannot publish different bytes at the same URL', () => {
  const first = fixture(), second = fixture(), snapshot = second.snapshots[0];
  snapshot.manifest.release = 'b'.repeat(40);
  snapshot.review.release = snapshot.manifest.release;
  const record = snapshot.manifest.files.find(file => file.path === path.css), bytes = Buffer.from('new reviewed synthetic css');
  record.sha256 = sha256(bytes);
  record.bytes = bytes.length;
  snapshot.files.set(path.css, bytes);
  reseal(second);
  first.snapshots.push(snapshot);
  assert.throws(() => planSafeAssetRetention(first), /legacy filename collision/);
});

test('identical reviewed files from two releases are deduplicated without loss of route reports', () => {
  const input = fixture(), second = fixture();
  second.snapshots[0].manifest.release = 'b'.repeat(40);
  second.snapshots[0].review.release = 'b'.repeat(40);
  reseal(second);
  input.snapshots.push(second.snapshots[0]);
  const plan = planSafeAssetRetention(input);
  assert.equal(plan.assets.length, 6);
  assert.equal(plan.routes.length, 2);
});

test('a previous release cannot reintroduce an optional target excluded in another review', () => {
  const input = fixture(), second = fixture();
  input.snapshots[0].review.routes[0].roots = [path.workspace];
  input.snapshots[0].review.allowedMissingOptional.push({ from: path.workspace, to: path.detail, reason: 'Detail not approved' });
  second.snapshots[0].manifest.release = 'b'.repeat(40);
  second.snapshots[0].review.release = 'b'.repeat(40);
  reseal(second);
  input.snapshots.push(second.snapshots[0]);
  assert.throws(() => planSafeAssetRetention(input), /excluded optional target is still published/);
});

test('fresh-only output is possible only by explicitly requesting zero snapshots', () => {
  const input = fixture();
  input.snapshots = [];
  const result = assembleSafeAssetRetention(input);
  assert.equal(result.plan.assets.length, 0);
  assert.equal(result.files.size, input.currentFiles.size);
});

test('current output cannot bypass known seed filename veto, even with no legacy snapshots', () => {
  for (const name of ['assets/materialRequestSeed-abcdefgh.js', 'src/data/materialRequestSeed.json', 'assets/MATERIALREQUESTSEED-stub.js']) {
    const input = fixture();
    input.snapshots = [];
    input.currentFiles.set(name, Buffer.from('export default {};'));
    const before = [...input.currentFiles];
    assert.throws(() => planSafeAssetRetention(input), /known seed filename in current output/);
    assert.throws(() => assembleSafeAssetRetention(input), /known seed filename in current output/);
    assert.deepEqual([...input.currentFiles], before);
  }
});

test('current output rejects known seed references in JS, HTML, CSS, JSON and renamed content', () => {
  for (const [name, text] of [
    ['assets/renamed-abcdefgh.js', 'export const open = () => import("./materialRequestSeed-abcdefgh.js");'],
    ['index.html', '<link rel="modulepreload" href="/assets/materialRequestSeed-abcdefgh.js">'],
    ['assets/current-abcdefgh.css', '/* materialRequestSeed reference */'],
    ['artifact.json', '{"source":"src/data/materialRequestSeed.json"}'],
    ['renamed-without-extension', 'MATERIALREQUESTSEED'],
  ]) {
    const input = fixture();
    input.snapshots = [];
    input.currentFiles.set(name, new Uint8Array(Buffer.from(text)));
    assert.throws(() => assembleSafeAssetRetention(input), /known seed reference in current output/);
  }
});

test('revoked hash is refused in current output regardless of file name or extension', () => {
  for (const name of ['assets/current-abcdefgh.js', 'renamed.bin']) {
    const input = fixture(), bytes = Buffer.from('synthetic revoked executable bytes');
    input.snapshots = [];
    input.currentFiles.set(name, bytes);
    input.revokedSha256 = [sha256(bytes)];
    assert.throws(() => assembleSafeAssetRetention(input), /revoked current asset/);
  }
});

test('safe new MaterialRequestPage name is not rejected by the legacy importer veto', () => {
  const input = fixture(), name = 'assets/MaterialRequestPage-newbuild.js';
  input.currentFiles.set(name, Buffer.from('export const workspace = { localOnly: true, records: [] };'));
  const result = assembleSafeAssetRetention(input);
  assert.equal(result.files.get(name).toString(), input.currentFiles.get(name).toString());
  assert.equal(result.files.has(path.bom), false);
});

test('assembly rechecks current content and revocation after an earlier valid plan', () => {
  for (const change of [
    input => { input.currentFiles.set('assets/later-abcdefgh.js', Buffer.from('export const name = "materialRequestSeed";')); },
    input => { input.revokedSha256.push(sha256(input.currentFiles.get('index.html'))); },
  ]) {
    const input = fixture();
    planSafeAssetRetention(input);
    change(input);
    assert.throws(() => assembleSafeAssetRetention(input), /known seed reference in current output|revoked current asset/);
  }
});

test('missing exact artifact identity cannot be replaced with a newly generated build', () => {
  const input = fixture();
  delete input.snapshots[0].manifest.artifactSha256;
  reseal(input);
  assert.throws(() => planSafeAssetRetention(input), /exact original artifact digest/);
});

for (const budget of ['files', 'bytes']) test(`retention ${budget} budget is enforced before returning any output`, () => {
  const input = fixture(), snapshot = input.snapshots[0];
  const buffer = Buffer.alloc(budget === 'bytes' ? 1024 * 1024 : 1, 65);
  const count = budget === 'bytes' ? 65 : RETENTION_LIMITS.files + 1;
  for (let i = 0; i < count; i += 1) {
    const file = {
      path: `assets/synthetic${i}-abcdefgh.woff2`, sha256: sha256(buffer), bytes: buffer.length,
      kind: 'asset', modules: ['synthetic/font.woff2'], required: [], optional: [], externalModules: [],
    };
    snapshot.manifest.files.push(file);
    snapshot.files.set(file.path, buffer);
    approve(snapshot, file.path);
  }
  reseal(input);
  const before = [...input.currentFiles.keys()];
  assert.throws(() => assembleSafeAssetRetention(input), /retention budget exceeded/);
  assert.deepEqual([...input.currentFiles.keys()], before);
});
