import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./storageService.integration.cjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/storage-compatibility.yml', import.meta.url), 'utf8');
test('Storage rehearsal cannot select a hosted project or use production secrets', () => {
  assert.match(source, /GITHUB_EVENT_NAME === 'pull_request'/);
  assert.match(source, /STORAGE_COMPAT_LOCAL === '1'/);
  assert.match(source, /'--internal'/);
  assert.match(source, /127\.0\.0\.1::5000/);
  assert.match(source, /url\.origin, origin/);
  assert.match(source, /redirect: 'error'/);
  assert.doesNotMatch(source, /rfppeuz|supabase\.co|process\.env\.(?:SUPABASE|DATABASE|SERVICE)/);
  assert.equal((source.match(/@sha256:[a-f0-9]{64}/g) || []).length, 2);
});
test('Storage rehearsal uses exact pending SQL and a fixed authorization helper snapshot', () => {
  assert.match(source, /docs\/security-proposals\/03-private-attachments\.sql/);
  assert.match(source, /sequence-authorization-function\.json/);
  assert.match(source, /snapshot\(\), before/);
  assert.match(source, /digest\(seed\)/);
  for (const actor of ['anon','editor','viewer','inactive','otherWorkspace','unmapped','missingSubject','expired']) assert.ok(source.includes(actor));
});
test('Storage workflow is PR-only, read-only and does not deploy', () => {
  assert.match(workflow, /pull_request:/); assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /push:|workflow_dispatch:|secrets\.|pages:|id-token:|deploy|apply_migration/);
  assert.match(workflow, /node --test tests\/storageService\.integration\.cjs/);
});
