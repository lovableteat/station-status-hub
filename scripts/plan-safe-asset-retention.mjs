/**
 * Opt-in, pure compatibility planner. No filesystem, network, deployment or DB I/O.
 * A successful plan is not a content/security audit: its signed-off inventory and
 * per-byte approvals must come from a trusted build and a separate code review.
 * See docs/security/safe-asset-retention.md before integrating this into a build.
 */
import { createHash } from 'node:crypto';

const DAY = 86_400_000;
export const RETENTION_LIMITS = Object.freeze({ releases: 2, ageDays: 14, files: 256, bytes: 64 * 1024 * 1024 });
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ASSET = /^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(js|mjs|css|png|jpg|jpeg|gif|webp|avif|svg|woff|woff2|ttf|otf|wasm|bcmap|pfb)$/;
// These are additional hard vetoes, never substitutes for per-file review. The
// old importer can auto-save a fallback, so an empty seed replacement is unsafe.
const PRIVATE_OR_UNSAFE_SOURCE = /materialRequestSeed|(?:^|\/)MaterialRequestPage\.(?:tsx?|jsx?)(?:\?|$)/i;
const PRIVATE_OR_UNSAFE_FILE = /(?:materialRequestSeed|MaterialRequestPage)[-_.]/i;
const KNOWN_SEED = /materialRequestSeed/i;

function requireThat(condition, message) {
  if (!condition) throw new Error(`Asset retention refused: ${message}`);
}

function string(value, name) {
  requireThat(typeof value === 'string' && value.trim().length > 0, `${name} is required`);
  return value;
}

function strings(value, name) {
  requireThat(Array.isArray(value) && value.every(item => typeof item === 'string' && item.length), `${name} must be a string array`);
  requireThat(new Set(value).size === value.length, `${name} contains duplicates`);
  return value;
}

function timestamp(value, name) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), `${name} must be UTC ISO time`);
  const number = Date.parse(value);
  requireThat(Number.isFinite(number), `${name} is invalid`);
  requireThat(new Date(number).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z')), `${name} is not a real calendar date`);
  return number;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function sha256(bytes) {
  requireThat(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, 'asset bytes must be a Buffer or Uint8Array');
  return createHash('sha256').update(bytes).digest('hex');
}

export function inventoryDigest(manifest) {
  return sha256(Buffer.from(JSON.stringify(canonical(manifest))));
}

function validateCurrentFiles(files, revoked) {
  // A caller accidentally passing an old dist as "current" must not bypass the
  // known seed/revocation vetoes. This is not a general private-content scanner:
  // fresh current output still requires independent complete content review.
  // Do NOT apply the legacy MaterialRequestPage filename veto to safe new code.
  for (const [path, bytes] of files) {
    string(path, 'current asset path');
    requireThat(!KNOWN_SEED.test(path), `known seed filename in current output: ${path}`);
    requireThat(!revoked.has(sha256(bytes)), `revoked current asset: ${path}`);
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Check every file, including HTML, JSON, CSS and extensionless content, so a
    // simple rename or a current-index preload reference does not bypass this.
    requireThat(!KNOWN_SEED.test(buffer.toString('utf8')), `known seed reference in current output: ${path}`);
  }
}

function validateManifest(manifest, base, now) {
  requireThat(manifest?.schemaVersion === 1 && COMMIT.test(manifest.release), 'unrecognized inventory schema or commit');
  requireThat(SHA.test(manifest.artifactSha256), 'exact original artifact digest is required');
  requireThat(manifest.base === base, 'asset base changed');
  const builtAt = timestamp(manifest.builtAt, 'builtAt');
  requireThat(builtAt <= now && now - builtAt <= RETENTION_LIMITS.ageDays * DAY, 'release is future-dated or expired');
  requireThat(Array.isArray(manifest.files) && manifest.files.length > 0, 'inventory files are required');
  const index = new Map();
  for (const file of manifest.files) {
    requireThat(file && typeof file.path === 'string' && ASSET.test(file.path), 'inventory contains an unsupported or non-hashed asset path');
    requireThat(!index.has(file.path), `duplicate inventory path ${file.path}`);
    requireThat(SHA.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes >= 0, `invalid byte identity for ${file.path}`);
    requireThat(['js', 'css', 'asset'].includes(file.kind), `invalid kind for ${file.path}`);
    const expectedKind = /\.m?js$/.test(file.path) ? 'js' : /\.css$/.test(file.path) ? 'css' : 'asset';
    requireThat(file.kind === expectedKind, `kind does not match ${file.path}`);
    strings(file.modules, 'modules');
    requireThat(file.kind !== 'js' || file.modules.length > 0, `missing module provenance for ${file.path}`);
    strings(file.required, 'required dependencies');
    strings(file.optional, 'optional dependencies');
    strings(file.externalModules, 'external modules');
    requireThat(!file.required.some(path => file.optional.includes(path)), `ambiguous dependency kind for ${file.path}`);
    index.set(file.path, file);
  }
  for (const file of index.values()) {
    for (const path of [...file.required, ...file.optional]) requireThat(index.has(path), `unresolved inventory dependency ${path}`);
  }
  return { index, builtAt };
}

/**
 * Inputs contain only already authorized artifact bytes; this function never
 * retrieves an artifact. Do not supply source maps, old HTML or old public/ trees.
 * 'required' includes static imports, CSS, workers and all eager asset references.
 * 'optional' is only a reviewed, genuinely deferred navigation import.
 */
export function planSafeAssetRetention({ base, now, currentFiles, snapshots, revokedSha256 }) {
  requireThat(base === '/station-status-hub/', 'unsupported deployment base');
  const clock = timestamp(now, 'now');
  requireThat(currentFiles instanceof Map, 'fresh currentFiles Map is required');
  requireThat(Array.isArray(snapshots) && snapshots.length <= RETENTION_LIMITS.releases, 'too many retained releases');
  strings(revokedSha256, 'revokedSha256');
  requireThat(revokedSha256.every(hash => SHA.test(hash)), 'invalid revoked hash');
  const revoked = new Set(revokedSha256), releases = new Set(), planned = new Map();
  validateCurrentFiles(currentFiles, revoked);
  const routes = [], unavailableOptional = [];

  for (const { manifest, review, files } of snapshots) {
    const { index, builtAt } = validateManifest(manifest, base, clock);
    requireThat(!releases.has(manifest.release), 'duplicate retained release');
    releases.add(manifest.release);
    requireThat(files instanceof Map, 'legacy bytes Map is required');
    requireThat(review?.schemaVersion === 1 && review.release === manifest.release, 'review does not identify this release');
    requireThat(review.inventorySha256 === inventoryDigest(manifest), 'inventory changed after review');
    requireThat(review.provenance === 'verified-build-output', 'unverified artifact provenance');
    string(review.evidence, 'review evidence');
    const reviewedAt = timestamp(review.reviewedAt, 'reviewedAt'), expiresAt = timestamp(review.expiresAt, 'expiresAt');
    requireThat(reviewedAt >= builtAt && reviewedAt <= clock && expiresAt > clock && expiresAt <= builtAt + RETENTION_LIMITS.ageDays * DAY, 'review is future-dated or expired');
    requireThat(Array.isArray(review.approvedFiles), 'per-file approvals are required');
    const approvals = new Map();
    for (const approval of review.approvedFiles) {
      requireThat(index.has(approval.path) && !approvals.has(approval.path), 'unknown or duplicate approved file');
      requireThat(approval.sha256 === index.get(approval.path).sha256, `approval hash changed for ${approval.path}`);
      requireThat(approval.publicContent === true && approval.currentSecurityContract === true && approval.completeDependencies === true, `incomplete review for ${approval.path}`);
      string(approval.evidence, 'per-file review evidence');
      approvals.set(approval.path, approval);
    }
    requireThat(Array.isArray(review.routes) && review.routes.length > 0, 'reviewed route roots are required');
    const selected = new Set();
    function select(path) {
      if (selected.has(path)) return;
      const file = index.get(path);
      requireThat(file && approvals.has(path), `dependency is not explicitly approved: ${path}`);
      requireThat(!PRIVATE_OR_UNSAFE_FILE.test(path) && !file.modules.some(module => PRIVATE_OR_UNSAFE_SOURCE.test(module.replaceAll('\\', '/'))), `private seed or unsafe legacy importer: ${path}`);
      requireThat(!revoked.has(file.sha256), `revoked asset: ${path}`);
      requireThat(file.externalModules.length === 0, `unsupported external module dependency: ${path}`);
      const bytes = files.get(path);
      requireThat((Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) && bytes.byteLength === file.bytes && sha256(bytes) === file.sha256, `missing or changed artifact bytes: ${path}`);
      // Defense in depth only. Arbitrary executable behavior/private data cannot
      // be ruled out by a filename/substring scan or a Vite manifest.
      if (file.kind === 'js' || file.kind === 'css') {
        requireThat(!/materialRequestSeed|sourceMappingURL\s*=/i.test(Buffer.from(bytes).toString('utf8')), `forbidden seed or source-map reference: ${path}`);
      }
      selected.add(path);
      for (const dependency of file.required) select(dependency);
    }
    const labels = new Set();
    for (const route of review.routes) {
      string(route.label, 'route label');
      requireThat(!labels.has(route.label), 'duplicate route label');
      labels.add(route.label);
      strings(route.roots, 'route roots');
      requireThat(route.roots.length > 0, 'empty route roots');
      // Include every deferred child needed by the claimed scenario explicitly.
      for (const path of route.roots) select(path);
      routes.push({ release: manifest.release, label: route.label, roots: [...route.roots] });
    }

    requireThat(Array.isArray(review.allowedMissingOptional), 'missing optional edge review is required');
    const exceptions = new Map();
    for (const edge of review.allowedMissingOptional) {
      const key = JSON.stringify([edge.from, edge.to]);
      requireThat(index.get(edge.from)?.optional.includes(edge.to) && !exceptions.has(key), 'unknown or duplicate missing optional edge');
      string(edge.reason, 'missing optional edge reason');
      exceptions.set(key, edge.reason);
    }
    const usedExceptions = new Set();
    for (const path of selected) {
      const file = index.get(path);
      for (const target of file.optional) {
        if (selected.has(target)) continue;
        const key = JSON.stringify([path, target]);
        requireThat(exceptions.has(key), `unreviewed broken optional route: ${path} -> ${target}`);
        // A denied target must not accidentally survive in another release or
        // the current output. Checked globally again after all releases.
        unavailableOptional.push({ release: manifest.release, from: path, to: target, reason: exceptions.get(key) });
        usedExceptions.add(key);
      }
      const existing = planned.get(path);
      requireThat(!existing || existing.sha256 === file.sha256, `legacy filename collision: ${path}`);
      const current = currentFiles.get(path);
      requireThat(!currentFiles.has(path) || sha256(current) === file.sha256, `current filename collision: ${path}`);
      if (!existing) planned.set(path, { path, sha256: file.sha256, bytes: file.bytes, release: manifest.release, action: currentFiles.has(path) ? 'reuse-current' : 'copy' });
    }
    requireThat(usedExceptions.size === exceptions.size, 'stale missing optional edge approval');
  }
  for (const edge of unavailableOptional) {
    requireThat(!planned.has(edge.to) && !currentFiles.has(edge.to), `excluded optional target is still published: ${edge.to}`);
  }
  const assets = [...planned.values()].sort((a, b) => a.path.localeCompare(b.path));
  const bytes = assets.reduce((total, file) => total + file.bytes, 0);
  requireThat(assets.length <= RETENTION_LIMITS.files && bytes <= RETENTION_LIMITS.bytes, 'retention budget exceeded');
  return { schemaVersion: 1, base, releases: [...releases], assets, bytes, routes, unavailableOptional };
}

/** Build a fresh in-memory result, never mutate the current or legacy artifact.
 * Revalidate at assembly time instead of accepting an earlier, mutable plan.
 * The caller must use a new staging directory and atomic artifact publication.
 */
export function assembleSafeAssetRetention(input) {
  const plan = planSafeAssetRetention(input);
  const output = new Map([...input.currentFiles].map(([path, bytes]) => [path, Buffer.from(bytes)]));
  for (const asset of plan.assets) {
    if (asset.action !== 'copy') continue;
    const source = input.snapshots.find(snapshot => snapshot.manifest.release === asset.release);
    output.set(asset.path, Buffer.from(source.files.get(asset.path)));
  }
  return { plan, files: output };
}
